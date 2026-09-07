import { describe, expect, it } from "vitest";
import { BODY_IDS, DEFAULT_BUILD, GLIDER_IDS, WHEEL_IDS, getCourse, normalizeBuild } from "@kartsick/content";
import {
  NEUTRAL_PLAYER, RACE_LIMITS, STEP, botInput, copyKart, copyRace, createKart, createRace, grantItem,
  itemWeights, parseRaceState, setRacePlayers, standings, stepKart, stepRace, tuningForBuild,
} from "./index";
import type { PlayerInput, RaceEntry, RaceOptions, RaceState } from "./index";

export const OPTIONS: RaceOptions = { courseId: "butterbell", mode: "race", speedClass: 100, mirror: false, bots: false, difficulty: "normal", seed: 12 };
export const entry = (id = "a", players: RaceEntry["players"] = [id, null]): RaceEntry => ({ id, name: id, players, build: normalizeBuild(DEFAULT_BUILD) });
export const input = (changes: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_PLAYER, ...changes });
const run = (race: RaceState, ticks: number, inputs: Record<string, PlayerInput> = {}) => {
  for (let t = 0; t < ticks; t++) stepRace(race, inputs);
};
export function racing(entries = [entry(), entry("b")]): RaceState {
  const race = createRace(OPTIONS, entries);
  const inputs = Object.fromEntries(entries.flatMap(e => e.players.filter((p): p is string => !!p).map(p => [p, input()])));
  run(race, 180, inputs);
  return race;
}

describe("race ownership, cooperative reference rules and start", () => {
  it("keeps countdown stationary and requires a fresh throttle edge at green", () => {
    const race = createRace(OPTIONS, [entry()]);
    const initial = copyKart(race.karts[0].state);
    run(race, 179, { a: input({ throttle: 1 }) });
    expect(race.karts[0].state.x).toBe(initial.x);
    stepRace(race, { a: input({ throttle: 1 }) });
    expect(race.karts[0].startBoost).toBe(0);
    const fresh = createRace(OPTIONS, [entry()]);
    run(fresh, 179, { a: input() });
    expect(stepRace(fresh, { a: input({ throttle: 1 }) }).some(e => e.type === "start-boost")).toBe(true);
  });
  it("uses two independent acceleration edges for the stronger simultaneous co-op start", () => {
    const race = createRace(OPTIONS, [entry("a", ["driver", "rear"])]);
    run(race, 179, { driver: input(), rear: input() });
    const events = stepRace(race, { driver: input({ throttle: 1 }), rear: input({ throttle: 1 }) });
    expect(events.some(e => e.type === "double-start")).toBe(true);
    expect(race.karts[0].startBoost).toBe(2);
  });
  it("reserves steering/throttle/flight for the driver and item use for the rear", () => {
    const race = racing([entry("a", ["driver", "rear"])]);
    grantItem(race, "a", "boost");
    run(race, 60, { driver: input(), rear: input({ throttle: 1, steer: 1, pitch: 1 }) });
    expect(race.karts[0].state.speed).toBe(0);
    stepRace(race, { driver: input({ useItem: true }), rear: input() });
    expect(race.karts[0].held[1]?.item).toBe("boost");
    stepRace(race, { driver: input(), rear: input({ useItem: true }) });
    expect(race.karts[0].held[1]).toBeNull();
    expect(race.karts[0].state.boost).toBeGreaterThan(0);
  });
  it("requires coordinated swap edges and retains item/character seat ownership", () => {
    const race = racing([entry("a", ["driver", "rear"])]);
    grantItem(race, "a", "bounce", 0);
    stepRace(race, { driver: input({ swap: true }), rear: input() });
    expect(race.karts[0].state.driver).toBe(0);
    run(race, 4, { driver: input({ swap: true }), rear: input() });
    stepRace(race, { driver: input({ swap: true }), rear: input({ swap: true }) });
    expect(race.karts[0].state.driver).toBe(1);
    expect(race.karts[0].held[0]?.item).toBe("bounce");
    run(race, 70, { driver: input({ swap: true }), rear: input({ swap: true }) });
    expect(race.karts[0].state.driver).toBe(1);
  });
  it("passes only the front character's item to an empty rear slot", () => {
    const race = racing([entry("a", ["driver", "rear"])]);
    grantItem(race, "a", "homing", 0);
    stepRace(race, { driver: input({ passItem: true }), rear: input() });
    expect(race.karts[0].held.map(h => h?.item ?? null)).toEqual([null, "homing"]);
    stepRace(race, { driver: input(), rear: input({ passItem: true }) });
    expect(race.karts[0].held[0]).toBeNull();
  });
  it("allows solo swapping but never grants a solo slide attack", () => {
    const race = racing([entry()]);
    stepRace(race, { a: input({ swap: true, slide: 1 }) });
    expect(race.karts[0].state.driver).toBe(1);
    expect(race.karts[0].status.slide).toBe(0);
  });
  it("neutralizes a missing packet before bounded AI takeover, and restores seats safely", () => {
    const race = racing([entry()]);
    stepRace(race, { a: input({ throttle: 1 }) });
    run(race, 29);
    expect(race.karts[0].ai).toBe(false);
    expect(race.karts[0].previous[0].throttle).toBe(0);
    stepRace(race, {});
    expect(race.karts[0].ai).toBe(true);
    setRacePlayers(race, "a", ["restored", null]);
    stepRace(race, { restored: input() });
    expect(race.karts[0].ai).toBe(false);
    expect(race.karts[0].previous[0].throttle).toBe(0);
  });
  it("gives the surviving rear human complete solo control, including flight, without remapping identities", () => {
    const race = racing([entry("a", ["driver", "rear"])]);
    run(race, 35, { rear: input({ throttle: 1 }) });
    expect(race.karts[0].ai).toBe(false);
    expect(race.karts[0].state.speed).toBeGreaterThan(0);
    expect(race.karts[0].players).toEqual(["driver", "rear"]);
  });
});

describe("actual part and class physics", () => {
  it("preserves exact unassisted neutrality for all 192 builds", () => {
    for (const body of BODY_IDS) for (const wheels of WHEEL_IDS) for (const glider of GLIDER_IDS) {
      const state = createKart();
      const x = state.x;
      stepKart(state, input(), { tuning: tuningForBuild(normalizeBuild({ body, wheels, glider })) });
      expect(state.x).toBe(x); expect(state.speed).toBe(0);
    }
  });
  it("orders actual acceleration/speed across 50, 100 and 150 classes", () => {
    const values = ([50, 100, 150] as const).map(speedClass => {
      const state = createKart();
      for (let i = 0; i < 100; i++) stepKart(state, input({ throttle: 1 }), { tuning: tuningForBuild(DEFAULT_BUILD, speedClass) });
      return state.speed;
    });
    expect(values[0]).toBeLessThan(values[1]); expect(values[1]).toBeLessThan(values[2]);
  });
  it("makes wheel/body/glider choices change measurable drive and flight behavior", () => {
    const driveBuild = (body: typeof BODY_IDS[number], wheels: typeof WHEEL_IDS[number]) => {
      const state = createKart();
      for (let i = 0; i < 80; i++) stepKart(state, input({ throttle: 1 }), { tuning: tuningForBuild(normalizeBuild({ body, wheels })) });
      return state.speed;
    };
    expect(driveBuild("coil-bug", "button")).toBeGreaterThan(driveBuild("knuckle-bus", "cushion"));
    const heights = GLIDER_IDS.map(glider => {
      const state = createKart();
      Object.assign(state, { mode: "glider", y: 50, vx: 0, vz: 27 });
      for (let i = 0; i < 90; i++) stepKart(state, input({ steer: .2 }), { tuning: tuningForBuild(normalizeBuild({ glider })) });
      return { y: state.y, speed: state.speed, yaw: state.yaw };
    });
    expect(heights[1].y).toBeGreaterThan(heights[2].y);
    expect(heights[2].speed).toBeGreaterThan(heights[1].speed);
    expect(heights[3].yaw).toBeGreaterThan(heights[0].yaw);
  });
  it("mirrors a manual drive exactly with opposite steering through the same physical surface", () => {
    const a = createKart(), b = createKart(getCourse("butterbell", true));
    for (let i = 0; i < 160; i++) {
      stepKart(a, input({ throttle: 1, steer: .1 }));
      stepKart(b, input({ throttle: 1, steer: -.1 }), { course: getCourse("butterbell", true) });
      expect(b.x).toBeCloseTo(-a.x, 9); expect(b.z).toBeCloseTo(a.z, 9);
    }
  });
  it("reflects the full eight-kart starting grid, not just the course mesh", () => {
    const normal = createRace({ ...OPTIONS, bots: true }, [entry()]);
    const mirrored = createRace({ ...OPTIONS, bots: true, mirror: true }, [entry()]);
    for (let i = 0; i < 8; i++) {
      expect(mirrored.karts[i].state.x).toBeCloseTo(-normal.karts[i].state.x);
      expect(mirrored.karts[i].state.z).toBeCloseTo(normal.karts[i].state.z);
    }
  });
  it("all 192 body/wheel/glider combinations can finish real Butterbell using the same physics", () => {
    const failed = [];
    for (const body of BODY_IDS) for (const wheels of WHEEL_IDS) for (const glider of GLIDER_IDS) {
      const race = createRace({ ...OPTIONS, mode: "time-trial" }, [{ ...entry("bot", [null, null]), build: normalizeBuild({ body, wheels, glider }) }]);
      for (let t = 0; t < 60 * 240 && race.phase !== "finished"; t++) stepRace(race, {});
      if (!race.karts[0].state.finished) failed.push({ body, wheels, glider, lap: race.karts[0].state.lap, gate: race.karts[0].state.nextCheckpoint, recoveries: race.karts[0].state.recoveries });
    }
    expect(failed).toEqual([]);
  }, 60000);
});

describe("race authority, bots, time trials and bounds", () => {
  it("finishes the actual three-lap course with all eight bots and publishes preserved results", () => {
    const race = createRace({ ...OPTIONS, bots: true }, [entry("bot-human", [null, null])]);
    for (let i = 0; i < 60 * 260 && race.phase !== "finished"; i++) stepRace(race, {});
    expect(race.phase, JSON.stringify(race.karts.map(k => ({ id: k.id, lap: k.state.lap, gate: k.state.nextCheckpoint, u: k.state.roadU, rec: k.state.recoveries })))).toBe("finished");
    expect(race.results).toHaveLength(8);
    expect(race.results.filter(r => r.finished), JSON.stringify(race.karts.map(k => ({ id: k.id, lap: k.state.lap, gate: k.state.nextCheckpoint, u: k.state.roadU, rec: k.state.recoveries, y: k.state.y, mode: k.state.mode })))).toHaveLength(8);
    expect(race.results.every(r => !r.disconnected)).toBe(true);
    const result = JSON.stringify(race.results);
    stepRace(race, {});
    expect(JSON.stringify(race.results)).toBe(result);
    expect(parseRaceState(JSON.parse(JSON.stringify(race)))).not.toBeNull();
  }, 30000);
  it.each([50, 150] as const)("bots complete %i class on reflected Butterbell using ordinary physics", speedClass => {
    const race = createRace({ ...OPTIONS, speedClass, mirror: true }, [entry("bot", [null, null])]);
    for (let i = 0; i < 60 * 250 && race.phase !== "finished"; i++) stepRace(race, {});
    expect(race.karts[0].state.finished, JSON.stringify(race.karts[0].state)).toBe(true);
  }, 30000);
  it("time trial has exactly two fixed boosts and no random item source, and the same driving", () => {
    const race = createRace({ ...OPTIONS, mode: "time-trial", bots: true }, [entry()]);
    expect(race.karts).toHaveLength(1); expect(race.pickups).toHaveLength(0);
    expect(race.karts[0].held.map(h => h?.item)).toEqual(["boost", "boost"]);
    expect(grantItem(race, "a", "boost")).toBe(false);
    run(race, 180, { a: input() });
    stepRace(race, { a: input({ useItem: true }) });
    stepRace(race, { a: input({ swap: true }) });
    run(race, 30, { a: input() });
    stepRace(race, { a: input({ useItem: true }) });
    expect(race.karts[0].held).toEqual([null, null]);
  });
  it("the fixed 45-second grace preserves finishers and labels incomplete disconnected entrants", () => {
    const race = racing();
    const k = race.karts[0];
    k.state.finished = true; k.state.lapTimes = [1, 1, 1]; k.finishTick = race.tick;
    race.firstFinishTick = race.tick; race.phase = "finishing";
    run(race, RACE_LIMITS.finishTicks - 1, { b: input() });
    expect(race.phase).toBe("finishing");
    race.karts[1].players = [null, null];
    race.karts[1].missing = [30, 30];
    stepRace(race, {});
    expect(race.phase).toBe("finished");
    expect(race.results[0].id).toBe("a");
    expect(race.results[1]).toMatchObject({ finished: false, disconnected: true, time: null });
  });
  it("rejects oversubscribed/duplicate seats, ninth karts and unavailable courses", () => {
    const sixteen = Array.from({ length: 8 }, (_, i) => entry(`kart-${i}`, [`p${i * 2}`, `p${i * 2 + 1}`]));
    expect(createRace(OPTIONS, sixteen).karts).toHaveLength(8);
    expect(() => createRace(OPTIONS, [...sixteen, entry("extra")])).toThrow();
    expect(() => createRace(OPTIONS, [entry("a", ["p", "p"])])).toThrow();
    // @ts-expect-error Deliberately exercise the runtime boundary with an unknown course.
    expect(() => createRace({ ...OPTIONS, courseId: "unknown-course" }, [entry()])).toThrow();
    const race = createRace(OPTIONS, [entry(), entry("b")]);
    expect(() => setRacePlayers(race, "b", ["a", null])).toThrow();
  });
  it("completes an eight-kart, sixteen-owner race with independent seat input records", () => {
    const entries = Array.from({ length: 8 }, (_, i) => entry(`kart-${i}`, [`p${i * 2}`, `p${i * 2 + 1}`]));
    const race = createRace(OPTIONS, entries);
    for (let t = 0; t < 60 * 260 && race.phase !== "finished"; t++) {
      const inputs = Object.fromEntries(race.karts.flatMap(k => k.players.map(id => [id!, botInput(race, k)])));
      stepRace(race, inputs);
    }
    expect(race.results).toHaveLength(8);
    expect(race.results.every(r => r.finished && !r.disconnected)).toBe(true);
    expect(parseRaceState(JSON.parse(JSON.stringify(race)))).not.toBeNull();
  }, 30000);
  it("weights genuine comeback items toward trailing racers", () => {
    const first = itemWeights(1, 8), last = itemWeights(8, 8);
    const share = (w: typeof first, item: string) => w.find(i => i.item === item)!.weight / w.reduce((n, i) => n + i.weight, 0);
    for (const item of ["autopilot", "shrink", "rapid-boost", "leader"]) expect(share(last, item)).toBeGreaterThan(share(first, item));
  });
  it("complete snapshots survive JSON and prediction copies without sharing mutable fields", () => {
    const race = racing();
    grantItem(race, "a", "velvet");
    stepRace(race, { a: input({ useItem: true }), b: input() });
    const clone = parseRaceState(JSON.parse(JSON.stringify(race)))!;
    expect(clone).toEqual(race);
    for (let i = 0; i < 120; i++) {
      const controls = { a: botInput(race, race.karts[0]), b: input() };
      expect(stepRace(clone, controls)).toEqual(stepRace(race, controls));
    }
    expect(clone).toEqual(race);
    const copied = copyRace(race); copied.karts[0].build.characters.reverse();
    expect(copied.karts[0].build.characters).not.toEqual(race.karts[0].build.characters);
    expect(standings(race)[0].progress).toBeGreaterThanOrEqual(0);
  });
  it("rejects incomplete, unsafe, oversized and impossible migration fields", () => {
    const base = racing();
    const mutations: ((s: RaceState) => void)[] = [
      s => { s.rng = 0; }, s => { s.karts[0].state.x = NaN; }, s => { s.karts[0].state.vx = Infinity; },
      s => { s.karts[0].state.lapTimes = Array(100).fill(1); },
      s => { s.karts[0].previous[0].throttle = 2; }, s => { s.karts[0].players = ["a", "a"]; },
      s => { s.karts[0].state.nextCheckpoint = 200; }, s => { s.karts[0].state.finished = true; },
      s => { s.results = Array(20).fill({}); }, s => { Object.assign(s.options, { courseId: "unknown-course" }); },
      s => { (s as unknown as Record<string, unknown>).unexpected = []; },
    ];
    for (const mutate of mutations) { const s = copyRace(base); mutate(s); expect(parseRaceState(s)).toBeNull(); }
    expect(parseRaceState({ version: 1 })).toBeNull();
    expect(parseRaceState(null)).toBeNull();
    expect(STEP).toBe(1 / 60);
  });
  it("requires every nested simulation/prediction field instead of accepting a partial transport snapshot", () => {
    const base = racing();
    for (const target of ["root", "kart", "physics", "status", "previous"] as const) {
      const select = (s: RaceState): Record<string, unknown> => (
        target === "root" ? s : target === "kart" ? s.karts[0] : target === "physics" ? s.karts[0].state :
          target === "status" ? s.karts[0].status : s.karts[0].previous[0]
      ) as unknown as Record<string, unknown>;
      for (const key of Object.keys(select(base))) {
        const s = copyRace(base);
        delete select(s)[key];
        expect(parseRaceState(s), `${target}.${key}`).toBeNull();
      }
    }
  });
});
