import { describe, expect, it } from "vitest";
import { AFTERGLOW } from "./afterglow";
import { ESCALUNA } from "./escaluna";
import { TILTGLASS } from "./tiltglass";
import { COPPERWHISTLE } from "./copperwhistle";
import { LASTLIGHT } from "./lastlight";
import { samplePath } from "./query";
import { DEFAULT_BUILD, getCourse, normalizeBuild } from "@kartsick/content";
import { botInput, createRace, stepRace } from "../simulation/src/race";

const layouts = [AFTERGLOW, ESCALUNA, TILTGLASS, COPPERWHISTLE, LASTLIGHT];

describe("authored route flow", () => {
  it.each(layouts)("$id has flowing radii rather than stationary cusps", layout => {
    const road = samplePath(layout.points, layout.format === "laps", 6000);
    const bends = road.slice(1).map((p, i) => {
      const a = road[i];
      const angle = Math.abs(Math.atan2(a.dx * p.dz - a.dz * p.dx, a.dx * p.dx + a.dz * p.dz));
      return { radius: (p.distance - a.distance) / Math.max(angle, 1e-9), u: a.u };
    }).sort((a, b) => a.radius - b.radius);
    console.info(`${layout.id} flow geometry`, { length: road.at(-1)!.distance, minimumRadius: bends[0] });
    expect(bends[0].radius).toBeGreaterThan(18.8);
  });

  const configurations = layouts.flatMap(layout => ([50, 100, 150] as const).flatMap(speedClass =>
    [false, true].map(mirror => ({ layout, id: layout.id, speedClass, mirror }))));
  it.each(configurations)("$id sustains corner speed at $speedClass cc mirror=$mirror", ({ layout, speedClass, mirror }) => {
    const course = getCourse(layout.id, mirror);
    const race = createRace({
      courseId: layout.id, speedClass, mirror, mode: "time-trial",
      bots: false, difficulty: "normal", seed: 0x13572468,
    }, [{ id: "flow-kart", name: "Flow", players: ["flow-driver", null], build: normalizeBuild(DEFAULT_BUILD) }]);
    let minimumCornerSpeed = Infinity, minimumCornerInstant = Infinity, minimumRollingSpeed = Infinity;
    let stationaryCornerTicks = 0, cornerTicks = 0, collisions = 0, lastCollision = -600;
    const speeds: number[] = [];
    const maximumTicks = Math.ceil((course.length * course.laps / 4 + 120) * 60);
    for (let tick = 0; tick < maximumTicks && !race.karts[0].state.finished; tick++) {
      const input = { ...botInput(race, race.karts[0]), useItem: false, passItem: false, swap: false };
      expect(input.recover, `${layout.id} requested recovery at ${tick}`).toBe(false);
      const events = stepRace(race, { "flow-driver": input });
      if (events.some(event => event.type === "collision")) { lastCollision = tick; collisions++; }
      const s = race.karts[0].state;
      expect(s.recoveries).toBe(0);
      speeds.push(Math.abs(s.speed));
      if (speeds.length > 60) speeds.shift();
      if (s.elapsed < 8 || s.mode !== "ground" || tick - lastCollision < 120) continue;
      const average = speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
      minimumRollingSpeed = Math.min(minimumRollingSpeed, average);
      const index = Math.min(course.road.length - 2, Math.floor(s.roadU * (course.road.length - 1)));
      const a = course.road[index], b = course.road[index + 1];
      const turn = Math.abs(Math.atan2(a.dx * b.dz - a.dz * b.dx, a.dx * b.dx + a.dz * b.dz));
      if ((b.distance - a.distance) / Math.max(turn, 1e-9) < 35) {
        cornerTicks++;
        minimumCornerSpeed = Math.min(minimumCornerSpeed, average);
        minimumCornerInstant = Math.min(minimumCornerInstant, Math.abs(s.speed));
        if (Math.abs(s.speed) < 1) stationaryCornerTicks++;
      }
    }
    expect(race.karts[0].state.finished).toBe(true);
    expect(minimumCornerSpeed).toBeGreaterThan(speedClass === 50 ? 6 : 8);
    expect(cornerTicks).toBeGreaterThan(100);
    expect(stationaryCornerTicks).toBe(0);
    expect(minimumCornerInstant).toBeGreaterThan(speedClass === 50 ? 6 : 8);
    console.info(`${layout.id} real driving flow`, {
      speedClass, mirror, seconds: race.karts[0].state.elapsed, minimumCornerSpeed, minimumCornerInstant, stationaryCornerTicks,
      cornerTicks, minimumRollingSpeed, collisions,
      note: "Corner radius <35 m; after 8 s; ground driving; excludes 2 s after contact, not recovery or position changes.",
    });
  });
});
