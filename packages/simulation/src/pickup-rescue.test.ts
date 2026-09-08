import { describe, expect, it } from "vitest";
import { COURSES, DEFAULT_BUILD, getCourse } from "@kartsick/content";
import {
  ITEM_ROULETTE_SECONDS, NEUTRAL, NEUTRAL_PLAYER, RESCUE_SECONDS, STEP,
  copyKart, copyRace, createKart, createRace, parseRaceState, recoverKart, rescuePose, stepKart, stepRace,
} from "./index";
import type { RaceEvent, RaceState } from "./index";

function raceAtBox(double = false): RaceState {
  const race = createRace({ courseId: "butterbell", speedClass: 100, mode: "race", bots: false,
    difficulty: "normal", mirror: false, seed: 91 }, [{ id: "kart", name: "Driver", players: ["driver", null], build: DEFAULT_BUILD }]);
  for (let n = 0; n < 180; n++) stepRace(race, { driver: { ...NEUTRAL_PLAYER } });
  const box = race.pickups[double ? 1 : 0];
  Object.assign(race.karts[0].state, { x: box.x, y: box.y - .58, z: box.z });
  stepRace(race, { driver: { ...NEUTRAL_PLAYER } });
  return race;
}

describe("authoritative pickup roulette", () => {
  it("reserves one outcome, blocks early use and settles exactly once after restoration", () => {
    const race = raceAtBox();
    const held = { ...race.karts[0].held[1]! };
    expect(held.roulette).toBe(ITEM_ROULETTE_SECONDS);
    const restored = parseRaceState(JSON.parse(JSON.stringify(race)));
    expect(restored).toEqual(race);
    const events: RaceEvent[] = [];
    const restoredEvents: RaceEvent[] = [];
    const rng = race.rng;
    for (let n = 0; n < 97; n++) {
      const inputs = { driver: { ...NEUTRAL_PLAYER, useItem: n % 2 === 0 && n < 90 } };
      events.push(...stepRace(race, inputs));
      restoredEvents.push(...stepRace(restored!, inputs));
    }
    expect(events.filter(e => e.type === "item-used")).toEqual([]);
    expect(events.filter(e => e.type === "item-ready")).toEqual([
      expect.objectContaining({ effectId: held.id, item: held.item, kartId: "kart" }),
    ]);
    expect(race.karts[0].held[1]).toEqual({ ...held, roulette: 0 });
    expect(race.rng).toBe(rng);
    expect(restoredEvents).toEqual(events);
    expect(restored).toEqual(race);
  });

  it("spins two independently reserved character items and preserves them across swaps", () => {
    const race = raceAtBox(true), before = copyRace(race);
    expect(race.karts[0].held.every(item => item?.roulette === ITEM_ROULETTE_SECONDS)).toBe(true);
    expect(new Set(race.karts[0].held.map(item => item!.id)).size).toBe(2);
    stepRace(race, { driver: { ...NEUTRAL_PLAYER, swap: true, useItem: true } });
    expect(race.karts[0].state.driver).toBe(1);
    expect(race.karts[0].held.map(item => item!.id)).toEqual(before.karts[0].held.map(item => item!.id));
    expect(parseRaceState(race)).not.toBeNull();
  });

  it("rejects missing, nonfinite, oversized and already-used roulette state", () => {
    for (const edit of [
      (h: Record<string, unknown>) => { delete h.roulette; },
      (h: Record<string, unknown>) => { h.roulette = Infinity; },
      (h: Record<string, unknown>) => { h.roulette = 2; },
      (h: Record<string, unknown>) => { h.cooldown = .25; },
    ]) {
      const race = raceAtBox();
      edit(race.karts[0].held[1]! as unknown as Record<string, unknown>);
      expect(parseRaceState(race)).toBeNull();
    }
  });
});

describe("Towbell recovery", () => {
  it.each([false, true])("preserves a mountain-ridge rescue in snapshots mirror=%s", mirror => {
    const course = getCourse("lastlight", mirror);
    const race = createRace({ courseId: "lastlight", speedClass: 100, mode: "time-trial", bots: false,
      difficulty: "normal", mirror, seed: 91 }, [{ id: "kart", name: "Driver", players: ["driver", null], build: DEFAULT_BUILD }]);
    const state = race.karts[0].state;
    state.x = mirror ? 520 : -520;
    state.z = 100;
    state.y = course.terrainHeight(state.x, state.z) + .42;
    expect(state.y).toBeGreaterThan(500);
    expect(parseRaceState(race)).toEqual(race);
    recoverKart(state, course);
    expect(parseRaceState(race)).toEqual(race);
    expect(state.rescue!.ceiling).toBeGreaterThan(state.rescue!.y);
    expect(state.nextCheckpoint).toBe(1);
  });

  it.each(COURSES.flatMap(course => [false, true].map(mirror => ({ id: course.id, mirror }))))(
    "reconstructs a protected lift/carry/lower on $id mirror=$mirror without progress grants", ({ id, mirror }) => {
      const course = getCourse(id, mirror), state = createKart(course);
      state.x += 18; state.y -= 3; state.z += 8;
      const before = copyKart(state);
      recoverKart(state, course);
      const first = rescuePose(state);
      expect(first).toMatchObject({ x: before.x, y: before.y, z: before.z });
      expect(state.recovery).toBe(RESCUE_SECONDS);
      expect(course.isGap(state.roadU)).toBe(false);
      expect(course.isWater(state.x, state.z) && state.y <= course.waterLevel + .42).toBe(false);
      const clone = copyKart(state);
      expect(clone.rescue).not.toBe(state.rescue);
      state.recovery = RESCUE_SECONDS * .5;
      expect(rescuePose(state).y).toBeGreaterThan(Math.max(before.y, state.y));
      const target = { x: state.x, y: state.y, z: state.z };
      for (let n = 0; n < 120; n++) {
        stepKart(state, { ...NEUTRAL, recover: n % 2 === 0 }, { course });
        if (state.recovery === 0) break;
        expect(state).toMatchObject(target);
      }
      expect(state.recovery).toBe(0);
      expect(state.rescue).toBeNull();
      expect(state.recoveries).toBe(1);
      expect(state.nextCheckpoint).toBe(before.nextCheckpoint);
      expect(state.lap).toBe(before.lap);
      expect(rescuePose(state)).toMatchObject(target);
    });

  it("serializes the rescue source and refuses mismatched or malformed recovery metadata", () => {
    const race = raceAtBox();
    recoverKart(race.karts[0].state);
    expect(parseRaceState(race)).toEqual(race);
    const clone = parseRaceState(race)!;
    for (let n = 0; n < Math.ceil(RESCUE_SECONDS / STEP) + 2; n++) {
      const input = { driver: { ...NEUTRAL_PLAYER } };
      stepRace(race, input); stepRace(clone, input);
    }
    expect(clone).toEqual(race);
    recoverKart(race.karts[0].state);
    race.karts[0].state.rescue!.y = NaN;
    expect(parseRaceState(race)).toBeNull();
    race.karts[0].state.rescue = null;
    expect(parseRaceState(race)).toBeNull();
  });
});
