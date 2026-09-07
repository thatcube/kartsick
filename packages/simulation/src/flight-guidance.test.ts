import { expect, it } from "vitest";
import { DEFAULT_BUILD, getCourse, normalizeBuild } from "@kartsick/content";
import { botInput, createRace, NEUTRAL_PLAYER, stepRace } from "./race";

it("guides mountain pitch using the actual lower landing and current altitude", () => {
  const race = createRace({
    courseId: "lastlight", mode: "race", speedClass: 100, mirror: false, bots: false, difficulty: "normal", seed: 1,
  }, [{ id: "driver", name: "Driver", build: DEFAULT_BUILD, players: ["human", null] }]);
  const course = getCourse("lastlight"), kart = race.karts[0], gap = course.glides[0];
  const point = course.sampleRoad(gap.start + .004);
  Object.assign(kart.state, { x: point.x, y: point.y + 4, z: point.z, roadU: point.u, mode: "glider", speed: 25, vz: 25, yaw: Math.atan2(point.dx, point.dz) });
  expect(course.sampleRoad(gap.end).distance - point.distance).toBeGreaterThan(35);
  expect(botInput(race, kart).pitch).toBeLessThan(0);
  kart.state.y = course.sampleRoad(gap.end).y + 3;
  expect(botInput(race, kart).pitch).toBeGreaterThan(0);
});

it.each([
  { courseId: "afterglow", speedClass: 100, build: DEFAULT_BUILD },
  { courseId: "lastlight", speedClass: 100, build: DEFAULT_BUILD },
  { courseId: "escaluna", speedClass: 50, build: normalizeBuild({ body: "knuckle-bus", wheels: "cushion", glider: "crosskite" }) },
  { courseId: "copperwhistle", speedClass: 150, build: normalizeBuild({ body: "coil-bug", wheels: "button", glider: "sunfan" }) },
  { courseId: "butterbell", speedClass: 150, build: normalizeBuild({ body: "gilt-trip", wheels: "button", glider: "sunfan" }) },
  { courseId: "lastlight", speedClass: 150, build: normalizeBuild({ glider: "sunfan" }) },
  { courseId: "lastlight", speedClass: 150, build: normalizeBuild({ body: "air-pocket", wheels: "cushion", glider: "sunfan" }) },
] as const)("drives every $courseId $speedClass gate and lands without recovery or supplied progress", ({ courseId, speedClass, build }) => {
  const race = createRace({
    courseId, mode: "time-trial", speedClass, mirror: false, bots: false, difficulty: "normal", seed: 1,
  }, [{ id: "driver", name: "Driver", build, players: ["human", null] }]);
  const course = getCourse(courseId), kart = race.karts[0];
  const milestones: object[] = [];
  for (let tick = 0; tick < 60 * 300 && race.phase !== "finished"; tick++) {
    const gate = kart.state.nextCheckpoint;
    const mode = kart.state.mode;
    const input = race.phase === "countdown" ? NEUTRAL_PLAYER :
      { ...botInput(race, kart), useItem: false, swap: false, recover: false };
    const events = stepRace(race, { human: input });
    if (gate !== kart.state.nextCheckpoint || mode !== kart.state.mode || events.some(event => event.type === "recover")) {
      milestones.push({ tick, gate: kart.state.nextCheckpoint, u: kart.state.roadU, y: kart.state.y, mode: kart.state.mode,
        x: kart.state.x, z: kart.state.z,
        roadY: course.sampleRoad(kart.state.roadU).y, events: events.map(event => event.type) });
    }
  }
  expect(kart.state.finished, JSON.stringify({ milestones, state: kart.state })).toBe(true);
  expect(kart.state.recoveries).toBe(0);
  expect(kart.state.lapTimes).toHaveLength(3);
}, 30_000);

it.each([false, true])("does not request recovery just past a curved checkpoint plane (mirror %s)", mirror => {
  const race = createRace({
    courseId: "butterbell", mode: "time-trial", speedClass: 100, mirror, bots: false, difficulty: "normal", seed: 1,
  }, [{ id: "driver", name: "Driver", build: DEFAULT_BUILD, players: ["human", null] }]);
  const course = getCourse("butterbell", mirror), kart = race.karts[0], previous = course.checkpoints[7];
  Object.assign(kart.state, { nextCheckpoint: 8, lap: 3, roadU: previous.u - .00003,
    x: previous.x + previous.dx * .01 + previous.dz, z: previous.z + previous.dz * .01 - previous.dx });
  expect(botInput(race, kart).recover).toBe(false);
  const missed = course.sampleRoad(.65);
  Object.assign(kart.state, { roadU: missed.u, x: missed.x, z: missed.z });
  expect(botInput(race, kart).recover).toBe(true);
});
