import { describe, expect, it, vi } from "vitest";
import { DEFAULT_BUILD, ITEM_IDS, getCourse } from "@kartsick/content";
import type { ItemId } from "@kartsick/content";
import { STEP } from "./physics";
import { NEUTRAL_PLAYER, RACE_LIMITS, createRace, grantItem, stepRace } from "./race";
import type { PlayerInput, RaceEvent, RaceKart, RaceState, WorldEffect } from "./race";
import { decodeRaceEvent, parseRaceEvent } from "./race-events";

const base = { tick: 300, kartId: "kart-a" };
const item = { effectId: "e1", item: "bounce" as const };
const examples: Record<RaceEvent["type"], RaceEvent> = {
  start: { ...base, type: "start", kartId: "" },
  "start-boost": { ...base, type: "start-boost" },
  "double-start": { ...base, type: "double-start" },
  charge: { ...base, type: "charge", value: 3 },
  boost: { ...base, type: "boost", effectId: "e1" },
  launch: { ...base, type: "launch" },
  land: { ...base, type: "land" },
  recover: { ...base, type: "recover" },
  swap: { ...base, type: "swap" },
  collision: { ...base, type: "collision", targetId: "kart-b" },
  lap: { ...base, type: "lap", value: 37.125 },
  finish: { ...base, type: "finish", value: 110.625 },
  "race-finished": { ...base, type: "race-finished", kartId: "" },
  pickup: { ...base, type: "pickup", ...item },
  "item-ready": { ...base, type: "item-ready", ...item },
  "item-used": { ...base, type: "item-used", ...item },
  spawn: { ...base, type: "spawn", ...item },
  expire: { ...base, type: "expire", ...item },
  hit: { ...base, type: "hit", ...item, targetId: "kart-b" },
  blocked: { ...base, type: "blocked", ...item, targetId: "e2" },
  reflect: { ...base, type: "reflect", ...item, value: 0 },
  deflect: { ...base, type: "deflect", ...item },
  steal: { ...base, type: "steal", ...item, targetId: "kart-b" },
  pass: { ...base, type: "pass", effectId: "e1" },
  slide: { ...base, type: "slide", effectId: "e1", value: -1 },
  takeover: { ...base, type: "takeover", value: 1 },
};

describe("strict race event decoding", () => {
  it.each(Object.values(examples))("decodes $type into an independent plain object", event => {
    const result = parseRaceEvent(event);
    expect(result).toEqual(event);
    expect(result).not.toBe(event);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(decodeRaceEvent(event)).toEqual(event);
    expect(parseRaceEvent(JSON.parse(JSON.stringify(event)))).toEqual(event);
  });

  it.each(ITEM_IDS)("accepts the approved %s item ID without requiring a live effect", id => {
    expect(parseRaceEvent({ ...examples["item-used"], item: id })).not.toBeNull();
    expect(parseRaceEvent({ ...examples.spawn, item: id })).not.toBeNull();
  });

  it("accepts absent optional targets and both kart/effect interception references", () => {
    for (const type of ["hit", "blocked", "collision"] as const) {
      const event = { ...examples[type] };
      delete event.targetId;
      expect(parseRaceEvent(event)).toEqual(event);
    }
    expect(parseRaceEvent({ ...examples.blocked, targetId: "kart-b" })).not.toBeNull();
    expect(parseRaceEvent({ ...examples.blocked, targetId: "e9999999" })).not.toBeNull();
    expect(parseRaceEvent({ ...examples.collision, targetId: "e1" })).toBeNull();
    expect(parseRaceEvent({ ...examples.steal, targetId: "e1" })).toBeNull();
    expect(parseRaceEvent({ ...examples.hit, targetId: "e1" })).toBeNull();
  });

  it("allows both signed slide directions, both takeover states and all spark/count tiers", () => {
    for (const value of [-1, 1]) expect(parseRaceEvent({ ...examples.slide, value })).not.toBeNull();
    for (const value of [0, 1]) expect(parseRaceEvent({ ...examples.takeover, value })).not.toBeNull();
    for (const value of [1, 2, 3]) expect(parseRaceEvent({ ...examples.charge, value })).not.toBeNull();
    for (const value of [0, 1, 2, 3]) expect(parseRaceEvent({ ...examples.reflect, value })).not.toBeNull();
  });

  it("keeps legal global events distinct from kart-specific finish and start boosts", () => {
    for (const type of ["start", "race-finished"] as const) {
      expect(parseRaceEvent({ ...examples[type], kartId: "" })).not.toBeNull();
      expect(parseRaceEvent({ ...examples[type], kartId: "kart-a" })).toBeNull();
    }
    for (const type of ["finish", "start-boost", "double-start", "launch"] as const) {
      expect(parseRaceEvent({ ...examples[type], kartId: "" })).toBeNull();
    }
  });

  it("rejects missing required fields and unrelated fields even if they exist on another event type", () => {
    for (const event of Object.values(examples)) {
      for (const key of Object.keys(event)) {
        if (key === "targetId" && ["collision", "hit", "blocked"].includes(event.type)) continue;
        const incomplete: Record<string, unknown> = { ...event };
        delete incomplete[key];
        expect(parseRaceEvent(incomplete), `${event.type}.${key}`).toBeNull();
      }
      expect(parseRaceEvent({ ...event, unknown: true })).toBeNull();
    }
    expect(parseRaceEvent({ ...examples.start, value: 3 })).toBeNull();
    expect(parseRaceEvent({ ...examples.launch, item: "boost" })).toBeNull();
    expect(parseRaceEvent({ ...examples.finish, effectId: "e1" })).toBeNull();
    expect(parseRaceEvent({ ...examples.spawn, value: 1 })).toBeNull();
    expect(parseRaceEvent({ ...examples.slide, targetId: "kart-b" })).toBeNull();
  });

  it.each([NaN, Infinity, -Infinity, -1, .5, "1", null, undefined, 1n, Number.MAX_SAFE_INTEGER, RACE_LIMITS.maximumTicks + 1])("rejects malformed tick %s", tick => {
    expect(parseRaceEvent({ ...examples.launch, tick })).toBeNull();
  });

  it("accepts bounded tick/time endpoints and floating-point race times", () => {
    for (const tick of [0, RACE_LIMITS.maximumTicks]) expect(parseRaceEvent({ ...examples.launch, tick })).not.toBeNull();
    for (const value of [0, STEP, 101.000000000005, RACE_LIMITS.maximumTicks * STEP + 1e-8]) {
      expect(parseRaceEvent({ ...examples.finish, value })).not.toBeNull();
    }
    expect(parseRaceEvent({ ...examples.finish, value: RACE_LIMITS.maximumTicks * STEP + 1 })).toBeNull();
  });

  it("rejects nonfinite, oversized and semantically invalid values", () => {
    for (const event of [examples.charge, examples.lap, examples.finish, examples.reflect, examples.slide, examples.takeover]) {
      for (const value of [NaN, Infinity, -Infinity, "1", null, undefined, {}, 1e12]) {
        expect(parseRaceEvent({ ...event, value })).toBeNull();
      }
    }
    for (const value of [0, 4, 1.5, -1]) expect(parseRaceEvent({ ...examples.charge, value })).toBeNull();
    for (const value of [-1, 4, .5]) expect(parseRaceEvent({ ...examples.reflect, value })).toBeNull();
    for (const value of [0, -2, 2, .5]) expect(parseRaceEvent({ ...examples.slide, value })).toBeNull();
    for (const value of [-1, 2, .5]) expect(parseRaceEvent({ ...examples.takeover, value })).toBeNull();
    expect(parseRaceEvent({ ...examples.finish, value: -.1 })).toBeNull();
  });

  it("validates bounded kart and effect namespaces without coercion", () => {
    for (const id of ["", "a".repeat(65), "a b", "a/b", "a:b", "é", null, undefined, 1, {}, ["a"]]) {
      expect(parseRaceEvent({ ...examples.launch, kartId: id })).toBeNull();
      expect(parseRaceEvent({ ...examples.blocked, targetId: id })).toBeNull();
    }
    for (const id of ["e0", "e01", "e-1", "E1", "e10000000", "e999999999999", "kart-a", null, undefined, 1]) {
      expect(parseRaceEvent({ ...examples.boost, effectId: id })).toBeNull();
    }
    expect(parseRaceEvent({ ...examples.boost, effectId: "e9999999" })).not.toBeNull();
    expect(parseRaceEvent({ ...examples.launch, kartId: "a".repeat(64) })).not.toBeNull();
    expect(parseRaceEvent({ ...examples.launch, kartId: "e1" })).toBeNull();
    expect(parseRaceEvent({ ...examples.launch, kartId: "__proto__" })).not.toBeNull();
  });

  it("rejects invalid optional item/target data instead of stripping it", () => {
    for (const item of [null, undefined, "", "unknown", "boost".repeat(100), {}, ["boost"], 1]) {
      expect(parseRaceEvent({ ...examples.spawn, item })).toBeNull();
    }
    expect(parseRaceEvent({ ...examples.collision, targetId: undefined })).toBeNull();
    expect(parseRaceEvent({ ...examples.blocked, targetId: "e01" })).toBeNull();
    expect(parseRaceEvent({ ...examples.blocked, targetId: "e10000000" })).toBeNull();
  });

  it("rejects unknown types, non-records, inherited data, accessors and hidden/symbol fields", () => {
    for (const value of [null, undefined, [], 1, "", true, () => undefined, new Date(), new Map(), new Set()]) {
      expect(parseRaceEvent(value)).toBeNull();
      expect(() => decodeRaceEvent(value)).toThrow(TypeError);
    }
    for (const type of ["constructor", "__proto__", "toString", "sector", "", null, 1]) {
      expect(parseRaceEvent({ ...examples.launch, type })).toBeNull();
    }
    expect(parseRaceEvent(Object.create(examples.launch))).toBeNull();
    const getter = vi.fn(() => "launch");
    expect(parseRaceEvent(Object.defineProperty({ ...examples.launch }, "type", { enumerable: true, get: getter }))).toBeNull();
    expect(getter).not.toHaveBeenCalled();
    expect(parseRaceEvent(Object.defineProperty({ ...examples.launch }, "hidden", { value: true }))).toBeNull();
    expect(parseRaceEvent({ ...examples.launch, [Symbol("hidden")]: true })).toBeNull();
    const proxy = Proxy.revocable({}, {});
    proxy.revoke();
    expect(parseRaceEvent(proxy.proxy)).toBeNull();
    expect(() => decodeRaceEvent(proxy.proxy)).toThrow("Invalid race event.");
  });

  it("accepts frozen/null-prototype data and never shares or mutates its input", () => {
    const original = { ...examples.slide };
    const result = decodeRaceEvent(Object.freeze(original));
    result.value = 1;
    expect(original.value).toBe(-1);
    expect(decodeRaceEvent(Object.assign(Object.create(null), examples.slide))).toEqual(examples.slide);
    const malicious = JSON.parse('{"type":"launch","tick":300,"kartId":"kart-a","__proto__":{"polluted":true}}');
    expect(parseRaceEvent(malicious)).toBeNull();
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
  });
});

const neutral = (edit: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_PLAYER, ...edit });
function place(kart: RaceKart, u: number, lane = 0): void {
  const p = getCourse().sampleRoad(u);
  Object.assign(kart.state, {
    x: p.x + p.dz * lane, y: p.y + .42, z: p.z - p.dx * lane,
    yaw: Math.atan2(p.dx, p.dz), vx: 0, vy: 0, vz: 0, speed: 0, mode: "ground", roadU: p.u,
  });
}
function harness(tandem = false) {
  const race = createRace({
    courseId: "butterbell", mode: "race", speedClass: 100, mirror: false,
    bots: false, difficulty: "normal", seed: 23,
  }, [
    { id: "a", name: "A", build: DEFAULT_BUILD, players: ["a", tandem ? "rear" : null] },
    { id: "b", name: "B", build: DEFAULT_BUILD, players: ["b", null] },
  ]);
  const observed: RaceEvent[] = [];
  const step = (inputs: Readonly<Record<string, PlayerInput>> = { a: neutral(), b: neutral(), rear: neutral() }) => {
    const events = stepRace(race, inputs);
    for (const event of events) {
      expect(parseRaceEvent(event), JSON.stringify(event)).toEqual(event);
      expect(decodeRaceEvent(JSON.parse(JSON.stringify(event)))).toEqual(event);
    }
    observed.push(...events);
    return events;
  };
  const wait = (ticks: number) => { for (let i = 0; i < ticks; i++) step(); };
  const use = (owner: "a" | "b", item: ItemId) => {
    const kart = race.karts.find(k => k.id === owner)!;
    kart.held[kart.state.driver === 0 ? 1 : 0] = null;
    expect(grantItem(race, owner, item)).toBe(true);
    step();
    return step({ a: neutral(), b: neutral(), rear: neutral(), [owner]: neutral({ useItem: true }) });
  };
  return { race, observed, step, wait, use };
}
function touch(effect: WorldEffect, kart: RaceKart): void {
  Object.assign(effect, { x: kart.state.x, y: kart.state.y, z: kart.state.z, vx: 0, vy: 0, vz: 0, age: 1, arm: 0 });
}

describe("real authoritative event compatibility", () => {
  it("accepts all events from an actual eight-kart race through final results", () => {
    const race: RaceState = createRace({
      courseId: "butterbell", mode: "race", speedClass: 100, mirror: false,
      bots: true, difficulty: "normal", seed: 12,
    }, [{ id: "bot-first", name: "First", build: DEFAULT_BUILD, players: [null, null] }]);
    const seen = new Set<RaceEvent["type"]>();
    for (let t = 0; t < 60 * 260 && race.phase !== "finished"; t++) {
      for (const event of stepRace(race, {})) {
        expect(parseRaceEvent(event), JSON.stringify(event)).toEqual(event);
        seen.add(event.type);
      }
    }
    expect(race.phase).toBe("finished");
    for (const type of ["start", "launch", "land", "lap", "finish", "race-finished", "pickup", "item-used", "collision"] as const) {
      expect(seen.has(type), type).toBe(true);
    }
  }, 30000);

  it.each(ITEM_IDS)("accepts real %s activation and expiration emissions", item => {
    const h = harness();
    h.wait(180);
    place(h.race.karts[0], .03); place(h.race.karts[1], .055);
    expect(h.use("a", item).some(e => e.type === "item-used" && e.item === item)).toBe(true);
    h.wait(60 * 24);
  });

  it("accepts simultaneous starts, item passing, both signed slides, swaps and both takeover values", () => {
    const h = harness(true);
    h.wait(179);
    const start = h.step({ a: neutral({ throttle: 1 }), rear: neutral({ throttle: 1 }), b: neutral() });
    expect(start.some(e => e.type === "start-boost")).toBe(true);
    expect(start.some(e => e.type === "double-start")).toBe(true);
    expect(grantItem(h.race, "a", "boost", 0)).toBe(true);
    expect(h.step({ a: neutral({ passItem: true }), rear: neutral(), b: neutral() }).some(e => e.type === "pass")).toBe(true);
    for (const slide of [-1, 1] as const) {
      h.wait(60);
      place(h.race.karts[0], .03);
      expect(h.step({ a: neutral(), rear: neutral({ slide }), b: neutral() }).some(e => e.type === "slide" && e.value === slide)).toBe(true);
    }
    expect(h.step({ a: neutral({ swap: true }), rear: neutral({ swap: true }), b: neutral() }).some(e => e.type === "swap")).toBe(true);
    for (let i = 0; i < 31; i++) h.step({});
    h.step();
    expect(h.observed.some(e => e.type === "takeover" && e.value === 1)).toBe(true);
    expect(h.observed.some(e => e.type === "takeover" && e.value === 0)).toBe(true);
  });

  it("accepts reflected-projectile counts including the final zero bumper", () => {
    const h = harness();
    h.wait(180); place(h.race.karts[0], .03); place(h.race.karts[1], .055);
    h.use("b", "velvet");
    for (let count = 2; count >= 0; count--) {
      h.use("a", "bounce");
      const shot = h.race.items.find(e => e.owner === "a" && e.kind === "projectile")!;
      touch(shot, h.race.karts[1]);
      expect(h.step().some(e => e.type === "reflect" && e.value === count)).toBe(true);
    }
  });

  it("accepts real co-op spark tiers, released mini-turbo and driver recovery", () => {
    const h = harness(true);
    h.wait(180);
    const kart = h.race.karts[0], road = getCourse().sampleRoad(.02);
    place(kart, .02);
    Object.assign(kart.state, { vx: road.dx * 20, vz: road.dz * 20, speed: 20 });
    h.step({ a: neutral({ throttle: 1, drift: true, steer: 1 }), rear: neutral({ steer: 1 }), b: neutral() });
    expect(h.step({ a: neutral({ throttle: 1, drift: true, steer: 1 }), rear: neutral({ steer: -1 }), b: neutral() })
      .some(e => e.type === "charge" && e.value === 2)).toBe(true);
    for (let t = 0; t < 9; t++) {
      h.step({ a: neutral({ throttle: 1, drift: true, steer: 1 }), rear: neutral({ steer: 1 }), b: neutral() });
    }
    expect(h.step({ a: neutral({ throttle: 1, drift: true, steer: 1 }), rear: neutral({ steer: -1 }), b: neutral() })
      .some(e => e.type === "charge" && e.value === 3)).toBe(true);
    expect(h.step({ a: neutral({ throttle: 1 }), rear: neutral(), b: neutral() }).some(e => e.type === "boost")).toBe(true);
    expect(h.step({ a: neutral({ recover: true }), rear: neutral(), b: neutral() }).some(e => e.type === "recover")).toBe(true);
  });

  it("accepts effect-target interception and kart-target damage, theft and deflection", () => {
    const h = harness();
    h.wait(180); place(h.race.karts[0], .03); place(h.race.karts[1], .055);
    h.use("a", "bounce");
    h.use("b", "slip");
    const shot = h.race.items.find(e => e.kind === "projectile")!;
    const trap = h.race.items.find(e => e.kind === "trap")!;
    Object.assign(shot, { x: trap.x, y: trap.y, z: trap.z, vx: 0, vz: 0, age: 1, arm: 0 });
    trap.age = 1;
    expect(h.step().some(e => e.type === "blocked" && e.targetId === trap.id)).toBe(true);

    h.use("a", "homing");
    touch(h.race.items.find(e => e.item === "homing")!, h.race.karts[1]);
    expect(h.step().some(e => e.type === "hit" && e.targetId === "a")).toBe(true);
    h.wait(150);
    expect(grantItem(h.race, "b", "boost")).toBe(true);
    h.use("a", "theft");
    h.wait(60);
    expect(h.observed.some(e => e.type === "steal" && e.targetId === "b")).toBe(true);

    h.use("b", "bounce");
    const deflected = h.race.items.find(e => e.owner === "b" && e.item === "bounce")!;
    const driver = h.race.karts[0].state;
    Object.assign(deflected, { x: driver.x + Math.sin(driver.yaw) * 6, y: driver.y,
      z: driver.z + Math.cos(driver.yaw) * 6, vx: 0, vz: 0, arm: 2 });
    expect(h.use("a", "static").some(e => e.type === "deflect")).toBe(true);
  });
});
