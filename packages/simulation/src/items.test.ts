import { describe, expect, it } from "vitest";
import { DEFAULT_BUILD, ITEM_IDS, getCourse, normalizeBuild } from "@kartsick/content";
import type { ItemId } from "@kartsick/content";
import {
  NEUTRAL_PLAYER, RACE_LIMITS, createRace, grantItem, parseRaceState, standings, stepRace,
} from "./index";
import type { PlayerInput, RaceEntry, RaceKart, RaceState, WorldEffect } from "./index";
import { AFTERGLOW } from "../../content-layouts/afterglow";
import { createLayoutQuery } from "../../content-layouts/query";

const input = (edit: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_PLAYER, ...edit });
function setup(tandem = false): RaceState {
  const entries: RaceEntry[] = ["a", "b", "c"].map(id => ({
    id, name: id, build: normalizeBuild(DEFAULT_BUILD), players: [id, tandem && id === "a" ? "rear" : null],
  }));
  const race = createRace({ courseId: "butterbell", mode: "race", speedClass: 100, mirror: false, bots: false, difficulty: "normal", seed: 23 }, entries);
  advance(race, 180);
  place(race.karts[0], .03);
  place(race.karts[1], .055);
  place(race.karts[2], .11);
  return race;
}
function advance(race: RaceState, ticks: number, edits: Record<string, PlayerInput> = {}) {
  const events = [];
  for (let t = 0; t < ticks; t++) events.push(...stepRace(race, { a: input(), b: input(), c: input(), rear: input(), ...edits }));
  return events;
}
function place(kart: RaceKart, u: number, lane = 0): void {
  const p = getCourse().sampleRoad(u);
  Object.assign(kart.state, { x: p.x + p.dz * lane, y: p.y + .42, z: p.z - p.dx * lane,
    yaw: Math.atan2(p.dx, p.dz), vx: 0, vz: 0, vy: 0, speed: 0, mode: "ground", roadU: p.u });
}
function use(race: RaceState, id: string, item: ItemId) {
  const k = race.karts.find(k => k.id === id)!;
  k.held[k.state.driver === 0 ? 1 : 0] = null;
  expect(grantItem(race, id, item)).toBe(true);
  advance(race, 1);
  return advance(race, 1, { [id]: input({ useItem: true }) });
}
function touch(e: WorldEffect, victim: RaceKart): void {
  Object.assign(e, { x: victim.state.x, y: victim.state.y, z: victim.state.z, vx: 0, vz: 0, vy: 0, age: 1, arm: 0 });
}

describe("every approved item is usable, bounded and serializable", () => {
  it.each(["bounce", "bomb"] as const)("%s cannot snap from terrain through an unreachable airport deck", item => {
    const course = getCourse("afterglow"), point = course.sampleRoad(.125);
    const race = createRace({
      courseId: "afterglow", mode: "race", speedClass: 100, mirror: false, bots: false, difficulty: "normal", seed: 23,
    }, [{ id: "a", name: "Driver", build: DEFAULT_BUILD, players: ["a", null] }]);
    advance(race, 180);
    Object.assign(race.karts[0].state, {
      x: point.x, y: course.terrainHeight(point.x, point.z) + .42, z: point.z,
      yaw: Math.atan2(point.dx, point.dz), roadU: point.u,
    });
    use(race, "a", item);
    expect(race.items).toHaveLength(1);
    expect(race.items[0].y).toBeLessThan(0);
  });
  it.each(["slip", "bounce", "bomb", "roadwork", "doubles"] as const)("%s stays on its reachable airport fork level", item => {
    const course = createLayoutQuery(AFTERGLOW);
    const main = createLayoutQuery({ ...AFTERGLOW, shortcuts: [] });
    const point = course.routes[1].points.find(point => {
      const deck = main.projectRoad(point.x, point.z);
      return deck.separation < 2.5 && deck.y > point.y + 1.7;
    })!;
    expect(point).toBeDefined();
    const deck = main.projectRoad(point.x, point.z);
    for (const upper of [false, true]) {
      const race = createRace({
        courseId: "afterglow", mode: "race", speedClass: 100, mirror: false, bots: false, difficulty: "normal", seed: 23,
      }, [{ id: "a", name: "Driver", build: DEFAULT_BUILD, players: ["a", null] }]);
      advance(race, 180);
      const surface = upper ? deck : point;
      Object.assign(race.karts[0].state, {
        x: point.x, y: surface.y + .42, z: point.z, roadU: surface.u,
        yaw: Math.atan2(surface.dx, surface.dz), vx: 0, vz: 0, vy: 0, speed: 0, mode: "ground",
      });
      use(race, "a", item);
      expect(race.items.length).toBeGreaterThan(0);
      for (const effect of race.items) {
        if (upper) expect(effect.y).toBeGreaterThan((deck.y + point.y) / 2);
        else expect(effect.y).toBeLessThan((deck.y + point.y) / 2);
      }
    }
  });
  it.each(ITEM_IDS)("%s has a real effect and consumes one owned charge", item => {
    const race = setup();
    const events = use(race, "a", item);
    expect(events.some(e => e.type === "item-used" && e.item === item)).toBe(true);
    const kart = race.karts[0];
    expect(race.items.length > 0 || kart.state.boost > 0 || Object.values(kart.status).some(v => v > 0)).toBe(true);
    const held = kart.held[1];
    if (item.startsWith("triple-")) expect(held?.charges).toBe(2);
    else if (item === "static") expect(held?.charges).toBe(1);
    else if (item === "rapid-boost") expect(held?.charges).toBe(19);
    else expect(held).toBeNull();
    expect(parseRaceState(JSON.parse(JSON.stringify(race))), item).not.toBeNull();
    advance(race, 60 * 26);
    expect(race.items).toHaveLength(0);
    expect(race.karts[0].status.invincible).toBe(0);
    expect(race.karts[0].status.autopilot).toBe(0);
  });
  it.each(["triple-slip", "triple-bounce", "triple-homing", "triple-boost"] as const)("%s requires three separate button presses", item => {
    const race = setup();
    use(race, "a", item);
    advance(race, 50, { a: input({ useItem: true }) });
    expect(race.karts[0].held[1]?.charges).toBe(2);
    for (let i = 0; i < 2; i++) {
      advance(race, 20);
      advance(race, 1, { a: input({ useItem: true }) });
    }
    expect(race.karts[0].held[1]).toBeNull();
  });
  it("rapid reuse is manual, cooldown-limited and expires without requiring all charges", () => {
    const race = setup();
    use(race, "a", "rapid-boost");
    advance(race, 20);
    advance(race, 1, { a: input({ useItem: true }) });
    expect(race.karts[0].held[1]?.charges).toBe(18);
    advance(race, 360);
    expect(race.karts[0].held[1]).toBeNull();
  });
});

describe("standard attacks, telegraphs and counterplay", () => {
  it.each(["slip", "bounce", "homing", "fire", "returning"] as const)("%s physically hits an opponent and shared grace prevents repeat stuns", item => {
    const race = setup();
    use(race, "a", item);
    const effect = race.items[0];
    touch(effect, race.karts[1]);
    advance(race, 1);
    expect(race.karts[1].status.stun, item).toBeGreaterThan(0);
    const first = race.karts[1].statusIds.stun;
    use(race, "a", item);
    const next = race.items.find(e => e.owner === "a" && e.hits.length === 0)!;
    touch(next, race.karts[1]);
    advance(race, 1);
    expect(race.karts[1].statusIds.stun).toBe(first);
  });
  it("bouncing shots ricochet from the road edge and expend a finite bounce allowance", () => {
    const race = setup();
    use(race, "a", "bounce");
    const e = race.items[0], road = getCourse().sampleRoad(.05);
    Object.assign(e, { x: road.x + road.dz * 6.2, z: road.z - road.dx * 6.2,
      vx: road.dz * 20, vz: -road.dx * 20, age: 1, arm: 0 });
    advance(race, 1);
    expect(e.vx * road.dz - e.vz * road.dx).toBeLessThan(0);
    expect(e.charges).toBe(4);
  });
  it("ordinary homing chooses an ahead target, unlike nonhoming backward shots", () => {
    const race = setup();
    use(race, "a", "homing");
    expect(race.items[0].target).toBe("b");
    const original = { vx: race.items[0].vx, vz: race.items[0].vz };
    place(race.karts[1], .06, 4);
    advance(race, 8);
    expect([race.items[0].vx, race.items[0].vz]).not.toEqual([original.vx, original.vz]);
  });
  it("projectiles are intercepted by dropped traps", () => {
    const race = setup();
    use(race, "a", "bounce");
    use(race, "b", "slip");
    const trap = race.items.find(e => e.kind === "trap")!, shot = race.items.find(e => e.kind === "projectile")!;
    Object.assign(shot, { x: trap.x, y: trap.y, z: trap.z, vx: 0, vz: 0, age: 1 });
    trap.age = 1;
    advance(race, 1);
    expect(race.items).toHaveLength(0);
    expect(race.karts[1].status.stun).toBe(0);
  });
  it("leader projectile ignores ordinary decoys and offers a fixed delayed blast to escape", () => {
    const race = setup();
    use(race, "c", "doubles");
    use(race, "a", "leader");
    const parcel = race.items.find(e => e.item === "leader")!;
    expect(parcel.target).toBe("c");
    touch(parcel, race.karts[2]);
    advance(race, 1);
    expect(parcel.kind).toBe("blast");
    expect(race.karts[2].status.stun).toBe(0);
    const target = { x: parcel.x, z: parcel.z };
    place(race.karts[2], .17);
    advance(race, 55);
    expect(race.karts[2].status.stun).toBe(0);
    expect({ x: parcel.x, z: parcel.z }).toEqual(target);
  });
  it("a physical bomb follows gravity, settles, then creates a delayed area blast", () => {
    const race = setup();
    use(race, "a", "bomb");
    const bomb = race.items[0];
    const y = bomb.y;
    advance(race, 10);
    expect(bomb.y).toBeGreaterThan(y);
    touch(bomb, race.karts[1]);
    advance(race, 1);
    expect(bomb.kind).toBe("blast");
    expect(race.karts[1].status.stun).toBe(0);
    advance(race, 20);
    expect(race.karts[1].status.stun).toBeGreaterThan(0);
  });
  it("invincibility blocks projectile hits but never suppresses physical recovery from water", () => {
    const race = setup();
    use(race, "b", "invincible");
    use(race, "a", "homing");
    touch(race.items[0], race.karts[1]);
    advance(race, 1);
    expect(race.karts[1].status.stun).toBe(0);
    Object.assign(race.karts[1].state, { x: 77, z: -14, y: -3, mode: "air", vy: -10 });
    advance(race, 1);
    expect(race.karts[1].state.recoveries).toBe(1);
  });
  it("pack shrink is telegraphed, protects immune racers and changes actual speed", () => {
    const race = setup();
    use(race, "c", "invincible");
    use(race, "a", "shrink");
    expect(race.karts[1].status.shrink).toBe(0);
    advance(race, 55);
    expect(race.karts[1].status.shrink).toBeGreaterThan(4);
    expect(race.karts[2].status.shrink).toBe(0);
    const untouched = setup();
    advance(race, 80, { b: input({ throttle: 1 }) });
    advance(untouched, 80, { b: input({ throttle: 1 }) });
    expect(race.karts[1].state.speed).toBeLessThan(untouched.karts[1].state.speed);
  });
  it("vision interference never manipulates driving and is cleared by a boost", () => {
    const race = setup();
    use(race, "a", "vision");
    advance(race, 55);
    expect(race.karts[1].status.vision).toBeGreaterThan(0);
    expect(race.karts[1].state.speed).toBe(0);
    use(race, "b", "boost");
    expect(race.karts[1].status.vision).toBe(0);
  });
  it("theft has a delay, steals the actual item and is countered by spending it before arrival", () => {
    const race = setup();
    grantItem(race, "b", "returning");
    use(race, "a", "theft");
    expect(race.karts[0].held[1]).toBeNull();
    advance(race, 55);
    expect(race.karts[0].held[1]?.item).toBe("returning");
    expect(race.karts[1].held[1]).toBeNull();
    const counter = setup();
    grantItem(counter, "b", "boost");
    use(counter, "a", "theft");
    advance(counter, 1, { b: input({ useItem: true }) });
    advance(counter, 60);
    expect(counter.karts[0].held[1]).toBeNull();
  });
  it("temporary autopilot travels the actual route and expires back to neutral manual control", () => {
    const race = setup();
    use(race, "a", "autopilot");
    const start = race.karts[0].state.roadU;
    advance(race, 360);
    expect(race.karts[0].state.roadU).toBeGreaterThan(start);
    expect(race.karts[0].state.nextCheckpoint).toBeGreaterThan(1);
    advance(race, 180);
    expect(race.karts[0].status.autopilot).toBe(0);
    const speed = race.karts[0].state.speed;
    advance(race, 60);
    expect(race.karts[0].state.speed).toBeLessThan(speed);
  });
  it("returning projectiles actually turn back toward their owner after the outbound leg", () => {
    const race = setup();
    use(race, "a", "returning");
    const e = race.items[0];
    const outbound = Math.atan2(e.vx, e.vz);
    advance(race, 95);
    expect(Math.cos(Math.atan2(e.vx, e.vz) - outbound)).toBeLessThan(0);
  });
  it("shockwave expands, clears all nearby offensive hazards including bombs and leader shots, and shoves without stun", () => {
    const race = setup();
    use(race, "b", "leader");
    use(race, "c", "bomb");
    for (const e of race.items) Object.assign(e, { x: race.karts[0].state.x + 5, y: race.karts[0].state.y, z: race.karts[0].state.z, vx: 0, vy: 0, vz: 0, arm: 2 });
    use(race, "a", "shockwave");
    advance(race, 30);
    expect(race.items.filter(e => e.owner !== "a")).toHaveLength(0);
    expect(race.karts[0].status.stun).toBe(0);
  });
});

describe("four approved signature specials", () => {
  it("Roadwork Rumble creates exactly three fixed road lines, never homes, and stops at a gap", () => {
    const race = setup();
    use(race, "a", "roadwork");
    const barriers = race.items.filter(e => e.kind === "barrier");
    expect(barriers).toHaveLength(3);
    expect(new Set(barriers.map(e => e.lane)).size).toBe(3);
    const lanes = barriers.map(e => e.lane);
    place(race.karts[1], .045, 4);
    advance(race, 40);
    expect(barriers.map(e => e.lane)).toEqual(lanes);
    expect(barriers.every(e => e.target === null)).toBe(true);
    const e = race.items.find(e => e.kind === "barrier")!;
    e.u = getCourse().gapStart - .00001; e.age = 1;
    const lip = getCourse().sampleRoad(e.u);
    e.x = lip.x + lip.dz * e.lane;
    e.z = lip.z - lip.dx * e.lane;
    e.y = lip.y + .45;
    advance(race, 1);
    expect(race.items.some(b => b.id === e.id)).toBe(false);
  });
  it.each(["roadwork", "doubles"] as const)("%s cannot be authored in midair or off-road", item => {
    const race = setup();
    const k = race.karts[0];
    Object.assign(k.state, { mode: "glider", y: 35 });
    const events = use(race, "a", item);
    expect(events.some(e => e.type === "item-used")).toBe(false);
    expect(k.held[1]?.item).toBe(item);
    expect(race.items).toHaveLength(0);
  });
  it("barriers are destructible by straight/fire/returning shots, but cannot attack a glider", () => {
    const race = setup();
    use(race, "a", "roadwork");
    const barrier = race.items[0];
    place(race.karts[1], barrier.u, barrier.lane);
    Object.assign(race.karts[1].state, { mode: "glider", y: barrier.y + 1.2 });
    barrier.age = 1;
    advance(race, 1);
    expect(race.karts[1].status.stun).toBe(0);
    use(race, "c", "fire");
    const shot = race.items.find(e => e.item === "fire")!;
    Object.assign(shot, { x: barrier.x, z: barrier.z, y: barrier.y, vx: 0, vz: 0, age: 1 });
    advance(race, 1);
    expect(race.items.some(e => e.id === barrier.id)).toBe(false);
  });
  it("three road barriers share one target's grace instead of producing three consecutive spins", () => {
    const race = setup();
    use(race, "a", "roadwork");
    const barriers = race.items.filter(e => e.kind === "barrier");
    for (const e of barriers) { e.lane = 0; e.age = 1; }
    place(race.karts[1], barriers[0].u);
    const events = advance(race, 1);
    expect(events.filter(e => e.type === "hit" && e.kartId === "b")).toHaveLength(1);
    expect(race.karts[1].status.grace).toBeGreaterThan(1);
    expect(race.items.filter(e => e.kind === "barrier")).toHaveLength(0);
  });
  it("Velvet Rebound spends exactly three bumpers, returns marked nonhoming shots and cannot reflect a reflection", () => {
    const race = setup();
    use(race, "b", "velvet");
    for (let i = 0; i < 3; i++) {
      use(race, "a", "bounce");
      const shot = race.items.filter(e => e.kind === "projectile" && e.owner === "a").at(-1)!;
      touch(shot, race.karts[1]);
      advance(race, 1);
      expect(shot.reflected).toBe(true); expect(shot.target).toBeNull(); expect(shot.owner).toBe("b");
      expect(race.karts[1].status.stun).toBe(0);
      expect(race.items.find(e => e.kind === "bumper")?.charges ?? 0).toBe(2 - i);
    }
    use(race, "a", "velvet");
    const returned = race.items.find(e => e.reflected)!;
    touch(returned, race.karts[0]);
    advance(race, 1);
    expect(race.karts[0].status.stun).toBeGreaterThan(0);
    expect(race.items.find(e => e.kind === "bumper" && e.owner === "a")?.charges).toBe(3);
  });
  it.each(["slip", "bomb", "leader", "shrink", "theft"] as const)("Velvet Rebound correctly permits %s to bypass projectile-only defense", item => {
    const race = setup();
    use(race, "b", "velvet");
    grantItem(race, "b", "boost");
    use(race, "a", item);
    const attack = race.items.find(e => e.owner === "a")!;
    if (item === "leader") attack.target = "b";
    if (["slip", "bomb", "leader"].includes(item)) touch(attack, race.karts[1]);
    advance(race, 60);
    expect(race.items.find(e => e.kind === "bumper" && e.owner === "b")?.charges).toBe(3);
    if (item === "theft") expect(race.karts[0].held[1]?.item).toBe("boost");
    else if (item === "shrink") expect(race.karts[1].status.shrink).toBeGreaterThan(0);
    else expect(race.karts[1].status.grace).toBeGreaterThan(0);
  });
  it("Static Sling has two user-triggered thrusts, only a forward cone, and no invincibility", () => {
    const race = setup();
    const s = race.karts[0].state;
    use(race, "b", "bounce");
    const shot = race.items[0];
    Object.assign(shot, { x: s.x + Math.sin(s.yaw) * 6, y: s.y, z: s.z + Math.cos(s.yaw) * 6, vx: 0, vz: 0, arm: 2 });
    const first = use(race, "a", "static");
    expect(first.some(e => e.type === "deflect")).toBe(true);
    expect(race.karts[0].status.invincible).toBe(0);
    expect(race.karts[0].held[1]?.charges).toBe(1);
    advance(race, 60, { a: input({ useItem: true }) });
    expect(race.karts[0].held[1]?.charges).toBe(1);
    advance(race, 1);
    advance(race, 1, { a: input({ useItem: true }) });
    expect(race.karts[0].held[1]).toBeNull();
    expect(race.items.find(e => e.kind === "coil")?.charges).toBe(0);
  });
  it("Static Sling does not clear rear, side or leader attacks", () => {
    for (const type of ["rear", "side", "leader"]) {
      const race = setup();
      const s = race.karts[0].state;
      use(race, "b", type === "leader" ? "leader" : "bounce");
      const e = race.items[0];
      Object.assign(e, {
        x: s.x + (type === "side" ? Math.cos(s.yaw) * 5 : Math.sin(s.yaw) * (type === "rear" ? -5 : 5)),
        z: s.z + (type === "side" ? -Math.sin(s.yaw) * 5 : Math.cos(s.yaw) * (type === "rear" ? -5 : 5)),
        y: s.y, vx: 0, vz: 0, arm: 2,
      });
      const events = use(race, "a", "static");
      expect(events.some(event => event.type === "deflect"), type).toBe(false);
      expect(e.reflected).toBe(false);
    }
  });
  it("Stunt Doubles divert homing shots but never become racers, collect items or alter standings", () => {
    const race = setup();
    const before = standings(race).map(k => k.id);
    use(race, "b", "doubles");
    const doubles = race.items.filter(e => e.kind === "decoy");
    expect(doubles).toHaveLength(2);
    use(race, "a", "homing");
    const shot = race.items.find(e => e.item === "homing")!;
    expect(doubles.some(d => d.id === shot.target)).toBe(true);
    expect(race.karts).toHaveLength(3);
    expect(standings(race).map(k => k.id)).toEqual(before);
    Object.assign(shot, { x: doubles[0].x, y: doubles[0].y, z: doubles[0].z, vx: 0, vz: 0, age: 1 });
    advance(race, 1);
    expect(race.items.filter(e => e.kind === "decoy")).toHaveLength(1);
    expect(race.karts[1].status.stun).toBe(0);
  });
});

describe("co-op contacts and simulation capacities", () => {
  it("rear slide attacks steal the rear held item and drop the front item without seat reassignment", () => {
    const race = setup(true);
    const a = race.karts[0], b = race.karts[1];
    place(a, .035, 0); place(b, .035, 1.9);
    grantItem(race, "b", "homing", 1); grantItem(race, "b", "boost", 0);
    const events = advance(race, 12, { rear: input({ slide: 1 }) });
    expect(events.some(e => e.type === "steal")).toBe(true);
    expect(a.held[1]?.item).toBe("homing");
    expect(b.held).toEqual([null, null]);
    expect(race.items.some(e => e.kind === "dropped" && e.item === "boost")).toBe(true);
    expect(b.status.grace).toBeGreaterThan(0);
    expect(a.players).toEqual(["a", "rear"]);
  });
  it("rear controls countersteer the driver's drift, not rear steering or a rhythm timer", () => {
    const race = setup(true), k = race.karts[0];
    const p = getCourse().sampleRoad(.02);
    Object.assign(k.state, { vx: p.dx * 20, vz: p.dz * 20, speed: 20 });
    advance(race, 1, { a: input({ throttle: 1, drift: true, steer: 1 }), rear: input({ steer: 1 }) });
    advance(race, 9, { a: input({ throttle: 1, drift: true, steer: -1 }), rear: input({ steer: 1 }) });
    expect(k.state.driftCharge).toBe(1);
    advance(race, 1, { a: input({ throttle: 1, drift: true, steer: 1 }), rear: input({ steer: -1 }) });
    expect(k.state.driftCharge).toBe(2);
    advance(race, 15, { a: input({ throttle: 1, drift: true, steer: 1 }), rear: input({ steer: -1 }) });
    expect(k.state.driftCharge).toBe(2);
    advance(race, 1, { a: input({ throttle: 1, drift: true, steer: 1 }), rear: input({ steer: 1 }) });
    advance(race, 1, { a: input({ throttle: 1, drift: true, steer: 1 }), rear: input({ steer: -1 }) });
    expect(k.state.driftCharge).toBe(3);
    const events = advance(race, 1, { a: input({ throttle: 1 }), rear: input() });
    expect(events.some(e => e.type === "boost")).toBe(true);
  });
  it("a rear rider can use items in flight but cannot steer, pitch or slide the kart", () => {
    const race = setup(true), k = race.karts[0];
    Object.assign(k.state, { mode: "glider", y: 40, vx: 0, vz: 25, yaw: 0 });
    grantItem(race, "a", "boost");
    const events = advance(race, 1, { a: input(), rear: input({ steer: 1, pitch: 1, slide: 1, useItem: true }) });
    expect(k.state.yaw).toBe(0);
    expect(k.status.slide).toBe(0);
    expect(events.some(e => e.type === "boost")).toBe(true);
    expect(k.held[1]).toBeNull();
  });
  it("contact mass makes heavy parts more stable without character weight classes", () => {
    const race = setup(), a = race.karts[0], b = race.karts[1];
    a.build = normalizeBuild({ body: "knuckle-bus", wheels: "cushion" });
    b.build = normalizeBuild({ body: "slipstream", wheels: "button" });
    place(a, .04); place(b, .04, 1);
    const oldA = { x: a.state.x, z: a.state.z }, oldB = { x: b.state.x, z: b.state.z };
    advance(race, 1);
    expect(Math.hypot(a.state.x - oldA.x, a.state.z - oldA.z)).toBeLessThan(Math.hypot(b.state.x - oldB.x, b.state.z - oldB.z));
  });
  it("declines spawns at capacity without consuming held items or growing any queue", () => {
    const race = setup();
    for (let i = 0; i < 12; i++) use(race, "a", "roadwork");
    expect(race.items.filter(e => e.owner === "a").length).toBeLessThanOrEqual(RACE_LIMITS.effectsPerKart);
    expect(race.karts[0].held[1]?.item).toBe("roadwork");
    expect(parseRaceState(JSON.parse(JSON.stringify(race)))).not.toBeNull();
    const snapshot = JSON.parse(JSON.stringify(race));
    while (snapshot.items.length <= RACE_LIMITS.effectsPerKart) snapshot.items.push({ ...snapshot.items[0], id: `e${snapshot.nextId++}` });
    expect(parseRaceState(snapshot)).toBeNull();
  });
  it("bounds the global effect pool at 128 and preserves boost use plus reserved clearing capacity", () => {
    const sample = setup();
    use(sample, "a", "roadwork");
    const full = createRace({ ...sample.options, bots: true }, [{
      id: "a", name: "A", build: normalizeBuild(DEFAULT_BUILD), players: ["a", null],
    }]);
    full.tick = 180; full.phase = "racing";
    full.items = Array.from({ length: 128 }, (_, i) => ({
      ...sample.items[0], id: `e${i + 1}`, owner: full.karts[Math.floor(i / 16)].id, hits: [],
    }));
    full.nextId = 129;
    expect(parseRaceState(full)).not.toBeNull();
    const overflow = JSON.parse(JSON.stringify(full));
    overflow.items.push({ ...overflow.items[0], id: `e${overflow.nextId++}` });
    expect(parseRaceState(overflow)).toBeNull();
    expect(use(full, "a", "boost").some(e => e.type === "boost")).toBe(true);
    full.items.splice(0, 8);
    expect(use(full, "a", "shockwave").some(e => e.type === "spawn" && e.item === "shockwave")).toBe(true);
    expect(full.items.length).toBeLessThanOrEqual(128);
  });
  it("uses distinct activation IDs for the two manual Static Sling discharges", () => {
    const race = setup();
    use(race, "a", "static");
    const first = race.karts[0].boostId;
    advance(race, 30);
    advance(race, 1, { a: input({ useItem: true }) });
    expect(race.karts[0].boostId).not.toBe(first);
    expect(parseRaceState(race)).not.toBeNull();
  });
});
