import { afterAll, describe, expect, it } from "vitest";
import {
  BODY_IDS, COURSES, DEFAULT_BUILD, GLIDER_IDS, WHEEL_IDS, angleDifference, getCourse, normalizeBuild,
} from "@kartsick/content";
import type { CourseId, CourseQuery, KartBuild } from "@kartsick/content";
import { STEP, tuningForBuild } from "./physics";
import { NEUTRAL_PLAYER, RACE_LIMITS, botInput, createRace, parseRaceState, stepRace } from "./race";
import type { PlayerInput, RaceEvent, RaceState } from "./race";

// Registration, not an independent list of layouts or replacement test routes, controls this suite.
const available = COURSES.filter(course => Boolean(course.available));
const fullMatrix = process.env.KARTSICK_FULL_COURSE_MATRIX === "1";
const classes = [50, 100, 150] as const;
const representatives = [
  { name: "baseline", build: normalizeBuild(DEFAULT_BUILD) },
  { name: "heavy/fast-canopy", build: normalizeBuild({ body: "knuckle-bus", wheels: "cushion", glider: "crosskite" }) },
  { name: "nimble/lifting-canopy", build: normalizeBuild({ body: "coil-bug", wheels: "button", glider: "sunfan" }) },
];
const combinations = BODY_IDS.flatMap(body => WHEEL_IDS.flatMap(wheels =>
  GLIDER_IDS.map(glider => normalizeBuild({ body, wheels, glider }))));
const configurations = available.flatMap(course => classes.flatMap(speedClass =>
  [false, true].map(mirror => ({ courseId: course.id as CourseId, speedClass, mirror }))));
type Configuration = typeof configurations[number];
interface Frame {
  tick: number;
  x: number; y: number; z: number;
  u: number;
  mode: string;
  gate: number;
  lap: number;
  finished: boolean;
  recoveries: number;
}
interface Evidence extends Configuration {
  build: string;
  finished: boolean;
  seconds: number;
  passes: number[];
  timings: number[];
  launches: number[];
  landings: number;
  collisions: number;
  recoveries: number;
  requestedRecoveries: number;
  maximumSpeed: number;
  firstFlightSpeed: number | null;
  error: string | null;
  before: Frame;
  after: Frame;
}
const defaultEvidence: Evidence[] = [];
const exhaustiveEvidence: { courseId: CourseId; speedClass: number; mirror: boolean; clean: number; attempted: number; recoveries: number }[] = [];
const label = (build: KartBuild) => `${build.body}/${build.wheels}/${build.glider}`;
const configurationName = (config: Configuration) => `${config.courseId} ${config.speedClass} ${config.mirror ? "mirror" : "normal"}`;
function frame(race: RaceState): Frame {
  const s = race.karts[0].state;
  return { tick: race.tick, x: s.x, y: s.y, z: s.z, u: s.roadU, mode: s.mode,
    gate: s.nextCheckpoint, lap: s.lap, finished: s.finished, recoveries: s.recoveries };
}
function start(config: Configuration, build: KartBuild): RaceState {
  return createRace({
    courseId: config.courseId, speedClass: config.speedClass, mirror: config.mirror,
    mode: "time-trial", bots: false, difficulty: "normal", seed: 0x13572468,
  }, [{
    id: "matrix-kart", name: "Driving acceptance", players: ["matrix-driver", null], build,
  }]);
}
function driving(race: RaceState): PlayerInput {
  // Consume only the existing driver's physical controls; fixed TT items remain unused.
  return { ...botInput(race, race.karts[0]), useItem: false, passItem: false, swap: false };
}
function step(race: RaceState, input: PlayerInput): RaceEvent[] {
  return stepRace(race, { "matrix-driver": input });
}
function health(race: RaceState, events: readonly RaceEvent[]): string | null {
  const s = race.karts[0].state;
  for (const [key, value] of Object.entries(s)) {
    if (typeof value === "number" && !Number.isFinite(value)) return `Nonfinite physics field ${key}.`;
  }
  if (s.lapTimes.some(t => !Number.isFinite(t) || t <= 0)) return "Nonpositive/nonfinite lap or sector time.";
  if (events.some(e => e.type === "recover") || s.recoveries > 0) return "Automatic physics recovery; run stopped immediately.";
  if ((race.tick % 60 === 0 || s.finished) && parseRaceState(race) === null) {
    return "The existing bounded snapshot decoder rejected the physical state.";
  }
  return null;
}
function expectedPasses(course: CourseQuery): number[] {
  if (course.format === "sectors") return Array.from({ length: course.checkpoints.length - 1 }, (_, i) => i + 1);
  return Array.from({ length: course.laps }, () =>
    Array.from({ length: course.checkpoints.length }, (_, i) => (i + 1) % course.checkpoints.length)).flat();
}
function deadline(course: CourseQuery): number {
  const distance = course.length * (course.format === "sectors" ? 1 : course.laps);
  return Math.min(RACE_LIMITS.maximumTicks, Math.ceil((distance / 4 + 120) / STEP));
}
function requiredFlights(course: CourseQuery) {
  return course.glides.filter(g => course.isGap((g.start + g.end) / 2));
}
function runRoute(config: Configuration, build: KartBuild): Evidence {
  const course = getCourse(config.courseId, config.mirror);
  const race = start(config, build);
  const flights = requiredFlights(course);
  const evidence: Evidence = {
    courseId: config.courseId, speedClass: config.speedClass, mirror: config.mirror,
    build: label(build), finished: false, seconds: 0, passes: [], timings: [],
    launches: flights.map(() => 0), landings: 0, collisions: 0, recoveries: 0, requestedRecoveries: 0,
    maximumSpeed: 0, firstFlightSpeed: null, error: null, before: frame(race), after: frame(race),
  };
  const expected = expectedPasses(course);
  for (let tick = 0; tick < deadline(course); tick++) {
    evidence.before = frame(race);
    const input = driving(race);
    if (input.recover) {
      evidence.requestedRecoveries++;
      evidence.error = "The existing driver requested recovery; no recovery input or teleport was applied.";
      break;
    }
    const events = step(race, input);
    evidence.after = frame(race);
    const s = race.karts[0].state;
    evidence.seconds = s.elapsed;
    evidence.recoveries = s.recoveries;
    evidence.maximumSpeed = Math.max(evidence.maximumSpeed, Math.abs(s.speed));
    evidence.error = health(race, events);
    if (evidence.error) break;

    const passed = evidence.before.gate !== s.nextCheckpoint || !evidence.before.finished && s.finished;
    if (passed) {
      const index = evidence.before.gate, gate = course.checkpoints[index];
      const before = (evidence.before.x - gate.x) * gate.dx + (evidence.before.z - gate.z) * gate.dz;
      const after = (s.x - gate.x) * gate.dx + (s.z - gate.z) * gate.dz;
      evidence.passes.push(index);
      if (index !== expected[evidence.passes.length - 1] || before > 1e-7 || after < -1e-7 || after <= before) {
        evidence.error = "Checkpoint advancement was not the next ordered forward geometric crossing.";
        break;
      }
      const next = course.format === "sectors" && index === course.checkpoints.length - 1
        ? index : (index + 1) % course.checkpoints.length;
      if (s.nextCheckpoint !== next) {
        evidence.error = "More than one checkpoint advanced without an observable ordered crossing.";
        break;
      }
    }
    for (const event of events) {
      if (event.type === "launch") {
        const flight = flights.findIndex(g => evidence.before.u < g.start && s.roadU >= g.start && s.roadU < g.start + .03);
        if (flight >= 0) evidence.launches[flight]++;
        evidence.firstFlightSpeed ??= s.speed;
      }
      if (event.type === "land" && evidence.before.mode === "glider") evidence.landings++;
      if (event.type === "collision") evidence.collisions++;
      if (event.type === "lap") evidence.timings.push(event.value!);
    }
    if (s.finished) {
      evidence.finished = true;
      const repetitions = course.format === "sectors" ? 1 : course.laps;
      const count = course.format === "sectors" ? course.sectors.length + 1 : course.laps;
      if (evidence.passes.length !== expected.length) evidence.error = "Finish occurred before all required checkpoint crossings.";
      else if (evidence.timings.length !== count || s.lapTimes.length !== count ||
        Math.abs(s.lapTimes.reduce((sum, time) => sum + time, 0) - s.elapsed) > 1e-6) {
        evidence.error = "Lap/sector timing count or total does not match the actual completed run.";
      } else if (evidence.launches.some(n => n < repetitions) || evidence.landings < flights.length * repetitions) {
        evidence.error = "A required road-gap flight did not launch and land on every traversal.";
      } else if (race.results.length !== 1 || !race.results[0].finished || race.results[0].time !== s.elapsed) {
        evidence.error = "Authoritative result does not preserve the physically completed finish time.";
      }
      break;
    }
  }
  if (!evidence.finished && !evidence.error) evidence.error = "Did not finish within the route-length-based bounded driving window.";
  return evidence;
}
function assertRoute(evidence: Evidence): void {
  expect(evidence.error, JSON.stringify(evidence)).toBeNull();
  expect(evidence.finished, JSON.stringify(evidence)).toBe(true);
  expect(evidence.recoveries + evidence.requestedRecoveries).toBe(0);
}

describe("registered-course driving acceptance", () => {
  it("discovers only available real registrations and exactly 192 valid part combinations", () => {
    expect(available.length).toBeGreaterThan(0);
    expect(combinations).toHaveLength(192);
    expect(new Set(combinations.map(label)).size).toBe(192);
    for (const definition of available) {
      const course = getCourse(definition.id);
      expect(course.id).toBe(definition.id);
      expect(course.checkpoints.length).toBeGreaterThan(2);
      expect(course.length).toBeGreaterThan(0);
      expect(course.format).toBe(definition.format);
      if (course.format === "sectors") {
        expect(definition.id).toBe("lastlight");
        expect(course.laps).toBe(1);
        expect(course.sectors).toHaveLength(2);
        expect(course.checkpoints.at(-1)!.u).toBe(1);
        const start = course.sampleRoad(0), finish = course.sampleRoad(1);
        expect(Math.hypot(start.x - finish.x, start.y - finish.y, start.z - finish.z)).toBeGreaterThan(1);
      } else expect(course.laps).toBe(3);
    }
  });

  it.each(available.map(course => [course.id] as const))("%s mirrors its actual road, checkpoints, surfaces and timed hazards", id => {
    const course = getCourse(id), mirror = getCourse(id, true);
    expect(mirror.format).toBe(course.format);
    expect(mirror.checkpoints).toHaveLength(course.checkpoints.length);
    for (const u of [0, .006, .125, .37, .61, .88, 1, ...course.checkpoints.map(g => g.u)]) {
      const p = course.sampleRoad(u), q = mirror.sampleRoad(u);
      expect(q.x).toBeCloseTo(-p.x, 7); expect(q.y).toBeCloseTo(p.y, 7); expect(q.z).toBeCloseTo(p.z, 7);
      expect(q.dx).toBeCloseTo(-p.dx, 7); expect(q.dz).toBeCloseTo(p.dz, 7);
      expect(q.u).toBeCloseTo(p.u, 7);
      expect(mirror.surfaceHeight(-p.x, p.z)).toBeCloseTo(course.surfaceHeight(p.x, p.z), 7);
    }
    for (const time of [0, 1.25, 4.5, 17]) {
      const hazards = course.hazards(time), reflected = mirror.hazards(time);
      expect(reflected.map(h => h.id)).toEqual(hazards.map(h => h.id));
      hazards.forEach((h, i) => {
        expect(reflected[i].x).toBeCloseTo(-h.x, 7);
        expect(reflected[i].z).toBeCloseTo(h.z, 7);
        expect(reflected[i].y).toBeCloseTo(h.y, 7);
      });
    }
  });

  const cases = configurations.flatMap(config => representatives.map(preset => ({
    ...config, build: preset.build, name: `${configurationName(config)} ${preset.name}`,
  })));
  it.each(cases)("$name completes in order, remains finite and needs no recovery", testCase => {
    const evidence = runRoute(testCase, testCase.build);
    defaultEvidence.push(evidence);
    assertRoute(evidence);
  }, 15000);
});

function groundProbe(courseId: CourseId, build: KartBuild, speedClass: 50 | 100 | 150 = 100, steer = 0) {
  const config: Configuration = { courseId, speedClass, mirror: false }, race = start(config, build);
  const initialYaw = race.karts[0].state.yaw;
  for (let tick = 0; tick < RACE_LIMITS.countdownTicks + 44; tick++) {
    const events = step(race, { ...NEUTRAL_PLAYER, throttle: 1, steer });
    expect(health(race, events), `${courseId} ${label(build)} ground probe`).toBeNull();
  }
  const s = race.karts[0].state;
  expect(s.mode, `${courseId} ground response needs an actual start-road sample`).toBe("ground");
  return { speed: s.speed, yaw: Math.abs(angleDifference(s.yaw, initialYaw)) };
}
function flightProbe(courseId: CourseId, build: KartBuild, steer = 0) {
  const config: Configuration = { courseId, speedClass: 100, mirror: false }, race = start(config, build);
  const course = getCourse(courseId);
  let flightFrames = 0;
  let launch: { y: number; yaw: number } | null = null;
  for (let tick = 0; tick < deadline(course); tick++) {
    const input = launch ? { ...NEUTRAL_PLAYER, steer, pitch: 0 } : driving(race);
    expect(input.recover, `${courseId} ${label(build)} requested recovery before the flight measurement: ${JSON.stringify(frame(race))}`).toBe(false);
    const events = step(race, input);
    expect(health(race, events), `${courseId} ${label(build)} flight probe: ${JSON.stringify(frame(race))}`).toBeNull();
    const s = race.karts[0].state;
    if (launch) {
      expect(s.mode, `${courseId} first flight ended before the 30-frame controlled measurement`).toBe("glider");
      if (++flightFrames === 30) return { rise: s.y - launch.y, speed: s.speed, yaw: Math.abs(angleDifference(s.yaw, launch.yaw)) };
    } else if (events.some(e => e.type === "launch")) launch = { y: s.y, yaw: s.yaw };
    if (s.finished) break;
  }
  throw new Error(`${courseId} ${label(build)} never reached the registered flight for measurement.`);
}

describe("actual part/class tradeoffs on registered roads", () => {
  it.each(available.map(course => [course.id] as const))("%s measures acceleration, steering and speed-class differences from its real start", id => {
    const fast = groundProbe(id, normalizeBuild({ body: "coil-bug" }));
    const heavy = groundProbe(id, normalizeBuild({ body: "knuckle-bus" }));
    expect(fast.speed).toBeGreaterThan(heavy.speed);
    const button = groundProbe(id, normalizeBuild({ wheels: "button" }), 100, .35);
    const cushion = groundProbe(id, normalizeBuild({ wheels: "cushion" }), 100, .35);
    expect(button.speed).toBeGreaterThan(cushion.speed);
    expect(button.yaw).toBeGreaterThan(cushion.yaw);
    const speeds = classes.map(speedClass => groundProbe(id, normalizeBuild(DEFAULT_BUILD), speedClass).speed);
    expect(speeds[0]).toBeLessThan(speeds[1]); expect(speeds[1]).toBeLessThan(speeds[2]);
    const cosmetic = groundProbe(id, normalizeBuild({ characters: ["pompa", "hunkle"], paint: "pool", decal: "checks" }));
    expect(cosmetic.speed).toBeCloseTo(speeds[1], 10);
    expect(tuningForBuild(normalizeBuild({ body: "knuckle-bus" })).acceleration)
      .toBeLessThan(tuningForBuild(normalizeBuild({ body: "coil-bug" })).acceleration);
  });

  const glidingCourses = available.filter(c => requiredFlights(getCourse(c.id)).length > 0);
  it.each(glidingCourses.map(course => [course.id] as const))("%s measures actual lift/speed and air-steering tradeoffs after a driven takeoff", id => {
    const sunfan = flightProbe(id, normalizeBuild({ glider: "sunfan" }));
    const crosskite = flightProbe(id, normalizeBuild({ glider: "crosskite" }));
    expect(sunfan.rise).toBeGreaterThan(crosskite.rise);
    expect(crosskite.speed).toBeGreaterThan(sunfan.speed);
    const mapwing = flightProbe(id, normalizeBuild({ glider: "mapwing" }), .4);
    const bellflower = flightProbe(id, normalizeBuild({ glider: "bellflower" }), .4);
    expect(bellflower.yaw).toBeGreaterThan(mapwing.yaw);
  }, 15000);
});

describe("opt-in 192-combination course/class/mirror matrix", () => {
  it.runIf(fullMatrix).each(configurations)("$courseId class $speedClass mirror=$mirror drives all 192 combinations without recovery", config => {
    const evidence = combinations.map(build => runRoute(config, build));
    const failures = evidence.filter(result => result.error !== null || !result.finished);
    exhaustiveEvidence.push({
      ...config, clean: evidence.length - failures.length, attempted: evidence.length,
      recoveries: evidence.reduce((sum, result) => sum + result.recoveries + result.requestedRecoveries, 0),
    });
    expect(failures.length, JSON.stringify({
      configuration: configurationName(config), clean: evidence.length - failures.length,
      failed: failures.length, firstFailures: failures.slice(0, 12),
    })).toBe(0);
  }, 120000);
});

afterAll(() => {
  console.info("COURSE_MATRIX_EVIDENCE", JSON.stringify({
    registered: available.map(c => ({ id: c.id, version: getCourse(c.id).version })),
    unavailable: COURSES.filter(c => !c.available).map(c => c.id),
    representative: {
      attempted: defaultEvidence.length,
      clean: defaultEvidence.filter(result => result.finished && result.error === null).length,
      automaticRecoveries: defaultEvidence.reduce((sum, result) => sum + result.recoveries, 0),
      driverRecoveryRequests: defaultEvidence.reduce((sum, result) => sum + result.requestedRecoveries, 0),
      firstFailures: defaultEvidence.filter(result => result.error !== null).slice(0, 12),
    },
    exhaustiveEnabled: fullMatrix,
    exhaustive: exhaustiveEvidence,
  }));
});
