import { expect, it, vi } from "vitest";

const entries = [
  ["public barrel", () => import("./index")],
  ["race implementation", () => import("./race")],
  ["physics implementation", () => import("./physics")],
] as const;

it.each(entries)("initializes complete neutral inputs and physics through %s first", async (_name, load) => {
  vi.resetModules();
  await load();
  const api = await import("./index");
  const physics = await import("./physics");
  const raceModule = await import("./race");
  const { DEFAULT_BUILD } = await import("@kartsick/content");

  expect(api.NEUTRAL).toEqual({
    throttle: 0, brake: 0, steer: 0, pitch: 0, drift: false, recover: false, swap: false,
  });
  expect(api.NEUTRAL_PLAYER).toEqual({
    ...api.NEUTRAL, useItem: false, throwDirection: 1, slide: 0, passItem: false,
  });
  expect(api.STEP).toBe(1 / 60);
  expect(api.createKart).toBe(physics.createKart);
  expect(api.createRace).toBe(raceModule.createRace);
  expect(api.stepRace).toBe(raceModule.stepRace);
  expect(api.copyRace).toBe(raceModule.copyRace);
  expect(api.standings).toBe(raceModule.standings);

  const kart = api.createKart();
  const initial = api.copyKart(kart);
  api.stepKart(kart, api.NEUTRAL);
  expect(kart.x).toBe(initial.x);
  expect(kart.z).toBe(initial.z);
  expect(kart.speed).toBe(0);

  const race = api.createRace({
    courseId: "butterbell", mode: "race", speedClass: 100, mirror: false,
    bots: false, difficulty: "normal", seed: 1,
  }, [{ id: "kart", name: "Kart", build: DEFAULT_BUILD, players: ["driver", null] }]);
  for (let i = 0; i < 181; i++) api.stepRace(race, { driver: api.NEUTRAL_PLAYER });
  expect(race.karts[0].state.speed).toBe(0);
  expect(api.parseRaceState(api.copyRace(race))).toEqual(race);
});
