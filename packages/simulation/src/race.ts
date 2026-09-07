import {
  BODY_IDS, CHARACTERS, CHARACTER_IDS, COURSES, DEFAULT_BUILD, ITEMS, ITEM_IDS, advanceRoad, angleDifference, checkpointSpan, clamp,
  combinedStats, getCourse, nearbyFlight, normalizeBuild, roadFeatures, validBuild, wrap,
} from "@kartsick/content";
import type { CharacterId, CourseId, CourseQuery, ItemId, KartBuild } from "@kartsick/content";
import { GLIDE_DYNAMICS, STEP, advanceKartProgress, copyKart, createKart, stepKart, tuningForBuild } from "./physics";
import type { DriverInput, DrivingEvent, KartState } from "./physics";

export interface PlayerInput extends DriverInput {
  useItem: boolean;
  throwDirection: -1 | 1;
  slide: -1 | 0 | 1;
  passItem: boolean;
}
export const NEUTRAL_PLAYER: Readonly<PlayerInput> = Object.freeze({
  throttle: 0, brake: 0, steer: 0, pitch: 0, drift: false, recover: false, swap: false,
  useItem: false, throwDirection: 1, slide: 0, passItem: false,
});
export interface RaceOptions {
  courseId: CourseId;
  mode: "race" | "time-trial";
  speedClass: 50 | 100 | 150;
  mirror: boolean;
  bots: boolean;
  difficulty: "easy" | "normal" | "hard";
  seed: number;
}
export interface RaceEntry {
  id: string;
  name: string;
  build: KartBuild;
  /** Fixed character seats, not front/rear. state.driver selects the front seat. */
  players: [string | null, string | null];
}
export const RACE_LIMITS = Object.freeze({
  karts: 8, humans: 16, effects: 128, effectsPerKart: 24, pickups: 12,
  eventsPerTick: 512, countdownTicks: 180, finishTicks: 2700, maximumTicks: 108000,
  missingInputTicks: 30, heldCharges: 20, maximumId: 10_000_000,
});
export const RACE_POINTS = Object.freeze([10, 8, 6, 4, 3, 2, 1, 0] as const);
export const STATUS_KEYS = ["stun", "grace", "invincible", "shrink", "vision", "ghost", "autopilot", "slide", "slideCooldown", "boostSteal"] as const;
export type StatusKey = typeof STATUS_KEYS[number];
export interface HeldItem {
  id: string;
  item: ItemId;
  charges: number;
  /** -1 before first use; otherwise seconds remaining in the active reuse window. */
  ttl: number;
  cooldown: number;
}
export interface RaceKart extends RaceEntry {
  state: KartState;
  held: [HeldItem | null, HeldItem | null];
  status: Record<StatusKey, number>;
  statusIds: Record<StatusKey, string | null>;
  previous: [PlayerInput, PlayerInput];
  missing: [number, number];
  swapRequests: [number, number];
  startPress: [number, number];
  startBoost: 0 | 1 | 2;
  boostId: string | null;
  slideDirection: -1 | 0 | 1;
  bot: boolean;
  ai: boolean;
  stuckTicks: number;
  finishTick: number | null;
}
export const EFFECT_KINDS = ["trap", "projectile", "bomb", "blast", "barrier", "bumper", "coil", "decoy", "pulse", "weather", "theft", "dropped"] as const;
export type EffectKind = typeof EFFECT_KINDS[number];
export const ITEM_INTERACTIONS: Readonly<Record<ItemId, { velvet: boolean; static: boolean; shockwave: boolean; decoy: boolean; roadOnly: boolean }>> =
  Object.fromEntries(ITEM_IDS.map(item => [item, {
    velvet: ["bounce", "homing", "triple-bounce", "triple-homing", "fire", "returning"].includes(item),
    static: ["slip", "bounce", "homing", "triple-slip", "triple-bounce", "triple-homing", "fire", "returning", "roadwork"].includes(item),
    shockwave: ["slip", "bounce", "homing", "leader", "bomb", "triple-slip", "triple-bounce", "triple-homing", "fire", "returning", "roadwork", "doubles"].includes(item),
    decoy: item === "homing" || item === "triple-homing",
    roadOnly: ["slip", "triple-slip", "roadwork", "doubles"].includes(item),
  }])) as Record<ItemId, { velvet: boolean; static: boolean; shockwave: boolean; decoy: boolean; roadOnly: boolean }>;
export interface WorldEffect {
  id: string;
  item: ItemId;
  kind: EffectKind;
  owner: string;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  radius: number;
  ttl: number;
  age: number;
  /** Collision/motion begins after this visible warning duration. */
  arm: number;
  charges: number;
  target: string | null;
  reflected: boolean;
  u: number;
  lane: number;
  direction: -1 | 1;
  hits: string[];
}
export interface ItemPickup {
  id: string;
  x: number; y: number; z: number;
  cooldown: number;
  double: boolean;
}
export interface RaceResult {
  id: string;
  name: string;
  position: number;
  finished: boolean;
  disconnected: boolean;
  time: number | null;
  progress: number;
  points: number;
}
export interface RaceState {
  version: 1;
  options: RaceOptions;
  tick: number;
  phase: "countdown" | "racing" | "finishing" | "finished";
  rng: number;
  nextId: number;
  firstFinishTick: number | null;
  karts: RaceKart[];
  items: WorldEffect[];
  pickups: ItemPickup[];
  results: RaceResult[];
}
export interface RaceEvent {
  type: "start" | "start-boost" | "double-start" | "charge" | "boost" | "launch" | "land" | "recover" |
    "swap" | "collision" | "lap" | "finish" | "race-finished" | "pickup" | "item-used" | "spawn" |
    "expire" | "hit" | "blocked" | "reflect" | "deflect" | "steal" | "pass" | "slide" | "takeover";
  tick: number;
  kartId: string;
  effectId?: string;
  targetId?: string;
  item?: ItemId;
  value?: number;
}

const rear = (kart: RaceKart): 0 | 1 => kart.state.driver === 0 ? 1 : 0;
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const identifier = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const finite = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const integer = (v: unknown, min: number, max: number): v is number => finite(v, min, max) && Number.isInteger(v);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
function optionsValid(v: unknown): v is RaceOptions {
  if (!record(v)) return false;
  return COURSES.some(course => course.id === v.courseId && course.available) && ["race", "time-trial"].includes(v.mode as string) &&
    [50, 100, 150].includes(v.speedClass as number) && typeof v.mirror === "boolean" &&
    typeof v.bots === "boolean" && ["easy", "normal", "hard"].includes(v.difficulty as string) &&
    integer(v.seed, 0, 0xffffffff);
}
function uniqueId(race: RaceState): string {
  if (race.nextId >= RACE_LIMITS.maximumId) throw new RangeError("Race effect ID capacity exhausted.");
  return `e${race.nextId++}`;
}
function emit(race: RaceState, events: RaceEvent[], event: Omit<RaceEvent, "tick">): void {
  if (events.length < RACE_LIMITS.eventsPerTick) events.push({ ...event, tick: race.tick });
}
export function raceRandom(race: RaceState): number {
  let value = race.rng;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  race.rng = value >>> 0;
  return race.rng / 0x100000000;
}
export function normalizePlayerInput(value: unknown): PlayerInput {
  if (!record(value)) return { ...NEUTRAL_PLAYER };
  const axis = (name: string, min: number) => finite(value[name], -1e6, 1e6) ? clamp(value[name] as number, min, 1) : 0;
  return {
    throttle: axis("throttle", 0), brake: axis("brake", 0), steer: axis("steer", -1), pitch: axis("pitch", -1),
    drift: value.drift === true, recover: value.recover === true, swap: value.swap === true,
    useItem: value.useItem === true, throwDirection: value.throwDirection === -1 ? -1 : 1,
    slide: value.slide === -1 ? -1 : value.slide === 1 ? 1 : 0, passItem: value.passItem === true,
  };
}
function entryValid(entry: unknown): entry is RaceEntry {
  if (!record(entry)) return false;
  return identifier(entry.id) && !/^e\d+$/.test(entry.id) && typeof entry.name === "string" && entry.name.trim().length > 0 && entry.name.length <= 32 &&
    validBuild(entry.build) && Array.isArray(entry.players) && entry.players.length === 2 &&
    entry.players.every(p => p === null || identifier(p));
}
export function createRace(options: RaceOptions, entries: readonly RaceEntry[]): RaceState {
  if (!optionsValid(options)) throw new TypeError("Invalid race options or unavailable course.");
  if (entries.length < 1 || entries.length > 8 || !entries.every(entryValid)) throw new TypeError("Race requires 1–8 valid entries.");
  if (options.mode === "time-trial" && (entries.length !== 1 || entries[0].players.filter(Boolean).length > 1)) throw new TypeError("Time trial requires one solo kart.");
  const ids = entries.map(e => e.id);
  const humans = entries.flatMap(e => e.players.filter((p): p is string => p !== null));
  if (new Set(ids).size !== ids.length || new Set(humans).size !== humans.length || humans.length > 16) throw new TypeError("Duplicate kart or player ownership.");
  const course = getCourse(options.courseId, options.mirror);
  const roster = entries.map(e => ({ ...e, build: normalizeBuild(e.build), players: [...e.players] as RaceEntry["players"] }));
  if (options.bots && options.mode === "race") {
    for (let i = roster.length; i < 8; i++) {
      let id = `bot-${i}`;
      while (roster.some(e => e.id === id)) id += "-";
      roster.push({ id, name: `${CHARACTERS[i].name} & co.`, players: [null, null],
        build: normalizeBuild({ ...DEFAULT_BUILD, characters: [CHARACTER_IDS[i], CHARACTER_IDS[(i + 1) % 8]], body: BODY_IDS[i] }) });
    }
  }
  const race: RaceState = {
    version: 1, options: { ...options }, tick: 0, phase: "countdown", rng: options.seed || 0x6d2b79f5,
    nextId: 1, firstFinishTick: null, karts: [], items: [], pickups: [], results: [],
  };
  race.karts = roster.map((e, index) => {
    const state = createKart(course);
    const gridStep = course.format === "sectors" ? Math.min(.004, course.checkpoints[1].u / 8) : .004;
    const p = course.sampleRoad((course.format === "sectors" ? gridStep * 4.5 : .006) - Math.floor(index / 2) * gridStep);
    const lane = (index % 2 ? 1 : -1) * 1.7 * (options.mirror ? -1 : 1);
    Object.assign(state, { x: p.x + p.dz * lane, z: p.z - p.dx * lane, y: p.y + .42, roadU: p.u, yaw: Math.atan2(p.dx, p.dz) });
    const kart: RaceKart = {
      ...e, state, held: [null, null],
      status: Object.fromEntries(STATUS_KEYS.map(k => [k, 0])) as RaceKart["status"],
      statusIds: Object.fromEntries(STATUS_KEYS.map(k => [k, null])) as RaceKart["statusIds"],
      previous: [{ ...NEUTRAL_PLAYER }, { ...NEUTRAL_PLAYER }], missing: [0, 0],
      swapRequests: [-1000, -1000], startPress: [-1000, -1000], startBoost: 0, boostId: null,
      slideDirection: 0, bot: e.players.every(p => p === null), ai: e.players.every(p => p === null),
      stuckTicks: 0, finishTick: null,
    };
    if (options.mode === "time-trial") kart.held = [makeHeld(race, "boost"), makeHeld(race, "boost")];
    return kart;
  });
  if (options.mode === "race") {
    for (const u of [.08, .28, .46, .78]) {
      const flight = nearbyFlight(course, u);
      const p = course.sampleRoad(course.isGap(u) && flight ? flight.start - .025 : u);
      for (const lane of [-3, 0, 3]) race.pickups.push({
        id: `box-${race.pickups.length}`, x: p.x + p.dz * lane, y: p.y + 1, z: p.z - p.dx * lane,
        cooldown: 0, double: lane === 0,
      });
    }
  }
  return race;
}
export function copyRace(race: RaceState): RaceState {
  return {
    ...race, options: { ...race.options }, karts: race.karts.map(k => ({
      ...k, build: normalizeBuild(k.build), players: [...k.players], state: copyKart(k.state),
      held: k.held.map(h => h && { ...h }) as RaceKart["held"], status: { ...k.status }, statusIds: { ...k.statusIds },
      previous: k.previous.map(p => ({ ...p })) as RaceKart["previous"], missing: [...k.missing],
      swapRequests: [...k.swapRequests], startPress: [...k.startPress],
    })),
    items: race.items.map(e => ({ ...e, hits: [...e.hits] })), pickups: race.pickups.map(p => ({ ...p })),
    results: race.results.map(r => ({ ...r })),
  };
}
/** Transport reserves identities; this helper atomically changes inputs associated with character seats. */
export function setRacePlayers(race: RaceState, kartId: string, players: RaceEntry["players"]): void {
  const kart = race.karts.find(k => k.id === kartId);
  if (!kart || !Array.isArray(players) || players.length !== 2 || !players.every(p => p === null || identifier(p))) throw new TypeError("Invalid seats.");
  const all = race.karts.flatMap(k => (k === kart ? players : k.players).filter((p): p is string => p !== null));
  if (new Set(all).size !== all.length || all.length > 16) throw new TypeError("Seat already owned.");
  kart.players = [...players];
  kart.previous = [{ ...NEUTRAL_PLAYER }, { ...NEUTRAL_PLAYER }];
  kart.missing = [0, 0]; kart.swapRequests = [-1000, -1000];
}
export function kartProgress(kart: RaceKart, course: CourseQuery): number {
  const count = course.checkpoints.length;
  const descent = course.format === "sectors";
  const completed = (descent ? 0 : (kart.state.lap - 1) * count) + wrap(kart.state.nextCheckpoint - 1, count);
  const { previous, span } = checkpointSpan(course, kart.state.nextCheckpoint);
  const travelled = descent ? kart.state.roadU - previous.u : wrap(kart.state.roadU - previous.u, 1);
  const fraction = clamp(travelled / span, 0, .999);
  return kart.state.finished ? descent ? count - 1 : course.laps * count : completed + fraction;
}
export function standings(race: RaceState): RaceResult[] {
  const course = getCourse(race.options.courseId, race.options.mirror);
  const order = [...race.karts].sort((a, b) => {
    const tie = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    if (a.finishTick !== null || b.finishTick !== null) return (a.finishTick ?? Infinity) - (b.finishTick ?? Infinity) || tie;
    return kartProgress(b, course) - kartProgress(a, course) || tie;
  });
  return order.map((k, index) => ({
    id: k.id, name: k.name, position: index + 1, finished: k.finishTick !== null,
    disconnected: !k.bot && k.players.every((p, seat) => p === null || k.missing[seat] >= RACE_LIMITS.missingInputTicks),
    time: k.finishTick === null ? null : k.state.elapsed,
    progress: kartProgress(k, course), points: RACE_POINTS[index],
  }));
}
function makeHeld(race: RaceState, item: ItemId): HeldItem {
  return { id: uniqueId(race), item, charges: item.startsWith("triple-") ? 3 : item === "static" ? 2 : item === "rapid-boost" ? 20 : 1, ttl: -1, cooldown: 0 };
}
/** Validated authority/test grant; false means occupied slot, TT restriction or unavailable capacity. */
export function grantItem(race: RaceState, kartId: string, item: ItemId, seat?: 0 | 1): boolean {
  const kart = race.karts.find(k => k.id === kartId);
  if (!kart || !ITEM_IDS.includes(item) || race.options.mode === "time-trial") return false;
  const slot = seat ?? rear(kart);
  if (kart.held[slot]) return false;
  kart.held[slot] = makeHeld(race, item);
  return true;
}
/** Weights are explicit and increase comeback power toward the back, not character performance. */
export function itemWeights(position: number, count: number, character: CharacterId = CHARACTER_IDS[0]): { item: ItemId; weight: number }[] {
  const behind = clamp((position - 1) / Math.max(1, count - 1), 0, 1);
  const special = CHARACTERS.find(c => c.id === character)?.pair;
  const comeback: Partial<Record<ItemId, number>> = { leader: 5, "triple-boost": 10, "rapid-boost": 7, invincible: 7, shrink: 3, autopilot: 5, theft: 3, "triple-homing": 4 };
  return ITEMS.filter(i => !i.special || i.special === special).map(i => ({
    item: i.id,
    weight: comeback[i.id] ? .1 + behind * behind * comeback[i.id]! :
      i.special ? 3 : ["slip", "bounce", "triple-slip"].includes(i.id) ? 8 - behind * 5 : 3 + behind * 2,
  }));
}
function randomItem(race: RaceState, kart: RaceKart, seat: 0 | 1): ItemId {
  const position = standings(race).find(r => r.id === kart.id)!.position;
  const weights = itemWeights(position, race.karts.length, kart.build.characters[seat]);
  let value = raceRandom(race) * weights.reduce((n, w) => n + w.weight, 0);
  for (const w of weights) { value -= w.weight; if (value <= 0) return w.item; }
  return "boost";
}
function setStatus(kart: RaceKart, status: StatusKey, seconds: number, id: string): void {
  kart.status[status] = Math.max(kart.status[status], seconds);
  kart.statusIds[status] = id;
}
function spawn(race: RaceState, kart: RaceKart, item: ItemId, kind: EffectKind, events: RaceEvent[], changes: Partial<WorldEffect> = {}): WorldEffect | null {
  if (race.items.length >= RACE_LIMITS.effects || race.items.filter(e => e.owner === kart.id).length >= RACE_LIMITS.effectsPerKart) return null;
  const s = kart.state;
  const effect: WorldEffect = {
    id: uniqueId(race), item, kind, owner: kart.id, x: s.x, y: s.y, z: s.z,
    vx: 0, vy: 0, vz: 0, radius: .8, ttl: 8, age: 0, arm: .2, charges: 1,
    target: null, reflected: false, u: s.roadU, lane: 0, direction: 1, hits: [], ...changes,
  };
  race.items.push(effect);
  emit(race, events, { type: "spawn", kartId: kart.id, effectId: effect.id, item });
  return effect;
}
function protectedKart(kart: RaceKart): boolean {
  return kart.status.invincible > 0 || kart.status.ghost > 0 || kart.state.recovery > 0 || kart.state.finished;
}
function hit(race: RaceState, kart: RaceKart, effect: { id: string; item: ItemId; owner: string }, events: RaceEvent[], strength = .65): boolean {
  if (protectedKart(kart) || kart.status.grace > 0) {
    emit(race, events, { type: "blocked", kartId: kart.id, effectId: effect.id, item: effect.item });
    return false;
  }
  setStatus(kart, "stun", strength, effect.id);
  setStatus(kart, "grace", strength + 1.25, effect.id);
  kart.state.vx *= .42; kart.state.vz *= .42;
  kart.state.boost = 0; kart.state.driftDirection = 0; kart.state.driftCharge = 0;
  kart.boostId = null;
  emit(race, events, { type: "hit", kartId: kart.id, effectId: effect.id, targetId: effect.owner, item: effect.item });
  return true;
}
function boost(race: RaceState, kart: RaceKart, id: string, duration: number, events: RaceEvent[], steal = true): void {
  kart.state.boost = Math.max(kart.state.boost, duration);
  kart.boostId = id;
  kart.status.vision = 0; kart.statusIds.vision = null;
  if (steal) setStatus(kart, "boostSteal", duration, id);
  emit(race, events, { type: "boost", kartId: kart.id, effectId: id });
}
function targetAhead(race: RaceState, kart: RaceKart): RaceKart | undefined {
  const course = getCourse(race.options.courseId, race.options.mirror);
  const progress = kartProgress(kart, course);
  return race.karts.filter(k => k !== kart && !protectedKart(k) && kartProgress(k, course) > progress)
    .sort((a, b) => distance(a.state, kart.state) - distance(b.state, kart.state))[0];
}
const deflectable = (e: WorldEffect) => ITEM_INTERACTIONS[e.item].static && (e.kind === "projectile" || e.kind === "trap" || e.kind === "barrier");
const reflectable = (e: WorldEffect) => e.kind === "projectile" && ITEM_INTERACTIONS[e.item].velvet && !e.reflected;
function discharge(race: RaceState, kart: RaceKart, id: string, events: RaceEvent[]): void {
  const s = kart.state;
  boost(race, kart, id, .65, events, false);
  for (const e of race.items) {
    const dx = e.x - s.x, dz = e.z - s.z;
    const forward = dx * Math.sin(s.yaw) + dz * Math.cos(s.yaw);
    const sideways = dx * Math.cos(s.yaw) - dz * Math.sin(s.yaw);
    if (e.owner === kart.id || !deflectable(e) || forward < 0 || forward > 11 || Math.abs(sideways) > 1 + forward * .32 || Math.abs(e.y - s.y) > 2.5) continue;
    const side = Math.sign(sideways) || 1;
    e.vx = Math.cos(s.yaw) * side * 20 + Math.sin(s.yaw) * 8;
    e.vz = -Math.sin(s.yaw) * side * 20 + Math.cos(s.yaw) * 8;
    e.target = null; e.reflected = true;
    if (e.kind === "barrier") e.lane += side * 3;
    if (e.kind === "trap") { e.x += Math.cos(s.yaw) * side * 3; e.z -= Math.sin(s.yaw) * side * 3; }
    emit(race, events, { type: "deflect", kartId: kart.id, effectId: e.id, item: e.item });
  }
  for (const other of race.karts) {
    if (other === kart || protectedKart(other) || distance(s, other.state) > 6) continue;
    const dx = other.state.x - s.x, dz = other.state.z - s.z;
    const f = dx * Math.sin(s.yaw) + dz * Math.cos(s.yaw);
    if (f <= 0 || Math.abs(dx * Math.cos(s.yaw) - dz * Math.sin(s.yaw)) > 1 + f * .32) continue;
    other.state.vx += Math.sin(s.yaw) * 3; other.state.vz += Math.cos(s.yaw) * 3;
  }
}
function useItem(race: RaceState, kart: RaceKart, direction: -1 | 1, events: RaceEvent[]): void {
  const slot = rear(kart), held = kart.held[slot];
  if (!held || held.cooldown > 0 || kart.status.stun > 0 || kart.state.recovery > 0) return;
  const course = getCourse(race.options.courseId, race.options.mirror);
  const s = kart.state;
  const roadOnly = ITEM_INTERACTIONS[held.item].roadOnly;
  const projection = course.projectRoad(s.x, s.z, s.y + .8);
  const features = roadFeatures(course, projection);
  if (roadOnly && (s.mode !== "ground" || features.gap || projection.separation > features.halfWidth - .5)) return;
  const needed = ["boost", "triple-boost", "rapid-boost", "invincible", "autopilot"].includes(held.item) ? 0 :
    ["roadwork", "fire"].includes(held.item) ? 3 : held.item === "doubles" ? 2 :
      held.item === "static" && race.items.some(e => e.kind === "coil" && e.owner === kart.id) ? 0 : 1;
  // Reserve one reaction effect per kart, so offense saturation cannot disable a clearing pulse.
  const reserve = held.item === "shockwave" ? 0 : 1;
  if (needed && (race.items.length + needed > RACE_LIMITS.effects - reserve * 8 ||
    race.items.filter(e => e.owner === kart.id).length + needed > RACE_LIMITS.effectsPerKart - reserve)) return;
  const id = uniqueId(race), item = held.item;
  const itemBase: ItemId = item === "triple-slip" ? "slip" : item === "triple-bounce" ? "bounce" : item === "triple-homing" ? "homing" : item;
  const heading = s.yaw + (direction === -1 ? Math.PI : 0);
  const shot = (kind: EffectKind, speed: number, angle = heading, extra: Partial<WorldEffect> = {}) => spawn(race, kart, itemBase, kind, events, {
    x: s.x + Math.sin(angle) * 2, z: s.z + Math.cos(angle) * 2, y: s.y + .3,
    vx: Math.sin(angle) * speed, vz: Math.cos(angle) * speed, direction, ...extra,
  });
  switch (itemBase) {
    case "boost": case "triple-boost": case "rapid-boost":
      boost(race, kart, id, .95, events);
      if (item === "rapid-boost" && held.ttl < 0) held.ttl = 6;
      break;
    case "slip": shot("trap", 0, s.yaw + Math.PI, { ttl: 22, y: course.surfaceHeight(s.x, s.z, projection) + .25, arm: .45 }); break;
    case "bounce": shot("projectile", 39, heading, { ttl: 7, charges: 5 }); break;
    case "homing": shot("projectile", 36, heading, { ttl: 7, target: direction === 1 ? targetAhead(race, kart)?.id ?? null : null }); break;
    case "leader": {
      const target = race.karts.find(k => k.id === standings(race).find(r => r.id !== kart.id && !r.finished)?.id);
      if (!target) return;
      shot("projectile", 48, heading, { ttl: 16, target: target.id, y: s.y + 4, radius: 1, arm: .7 });
      break;
    }
    case "bomb": shot("bomb", direction === 1 ? Math.max(12, s.speed + 8) : 5, heading, { ttl: 2.2, vy: direction === 1 ? 7 : 2, radius: 1, arm: .35 }); break;
    case "invincible": setStatus(kart, "invincible", 7, id); boost(race, kart, id, 7, events); break;
    case "autopilot": setStatus(kart, "autopilot", 7, id); setStatus(kart, "invincible", 7, id); break;
    case "shrink": case "vision": spawn(race, kart, itemBase, "weather", events, { ttl: 1, arm: .8, radius: 0 }); break;
    case "theft":
      setStatus(kart, "ghost", 1.5, id);
      spawn(race, kart, item, "theft", events, { ttl: 1.2, arm: .8, target: targetAhead(race, kart)?.id ?? null, radius: 0 });
      break;
    case "fire":
      for (const angle of [-.19, 0, .19]) shot("projectile", 34, heading + angle, { ttl: 3.4, charges: 3, radius: .65 });
      break;
    case "returning": shot("projectile", 32, heading, { ttl: 3.5, radius: .95, charges: 8 }); break;
    case "shockwave": spawn(race, kart, item, "pulse", events, { ttl: .55, arm: 0, radius: 0 }); break;
    case "roadwork":
      for (const lane of [-2.5, 0, 2.5]) spawn(race, kart, item, "barrier", events, {
        ttl: 4.5, arm: .5, radius: 1.05, u: s.roadU, lane: clamp(projection.lateral + lane, -features.halfWidth + 1.1, features.halfWidth - 1.1), direction,
      });
      break;
    case "velvet":
      for (const old of race.items) if (old.owner === kart.id && old.kind === "bumper") old.ttl = 0;
      spawn(race, kart, item, "bumper", events, { ttl: 5, arm: 0, charges: 3, radius: 2.3 });
      break;
    case "static": {
      if (held.ttl < 0) held.ttl = 6;
      let coil = race.items.find(e => e.owner === kart.id && e.kind === "coil" && e.ttl > 0);
      if (!coil) coil = spawn(race, kart, item, "coil", events, { ttl: held.ttl, arm: 0, charges: held.charges, radius: 1 }) ?? undefined;
      discharge(race, kart, id, events);
      if (coil) { coil.charges = held.charges - 1; if (!coil.charges) coil.ttl = .3; }
      break;
    }
    case "doubles":
      for (const lane of [-3, 3]) spawn(race, kart, item, "decoy", events, {
        ttl: 4, arm: 0, radius: 1, u: s.roadU, lane: clamp(projection.lateral + lane, -features.halfWidth + 1.1, features.halfWidth - 1.1),
        vx: Math.max(14, s.speed),
      });
      break;
  }
  emit(race, events, { type: "item-used", kartId: kart.id, effectId: id, item });
  held.charges--;
  held.cooldown = item === "static" ? .4 : .25;
  if (held.charges <= 0) kart.held[slot] = null;
}

function stealHeld(race: RaceState, thief: RaceKart, victim: RaceKart, source: string, events: RaceEvent[], dropFront: boolean): boolean {
  const slot = rear(thief), victimRear = rear(victim), victimFront = victim.state.driver;
  if (thief.held[slot] || protectedKart(victim)) return false;
  const take = victim.held[victimRear] ? victimRear : victimFront;
  if (!victim.held[take]) return false;
  thief.held[slot] = victim.held[take];
  victim.held[take] = null;
  emit(race, events, { type: "steal", kartId: thief.id, targetId: victim.id, effectId: source, item: thief.held[slot]!.item });
  if (dropFront && take === victimRear && victim.held[victimFront]) {
    const dropped = victim.held[victimFront]!;
    if (race.items.length >= RACE_LIMITS.effects || race.items.filter(e => e.owner === victim.id).length >= RACE_LIMITS.effectsPerKart) {
      const owned = race.items.filter(e => e.owner === victim.id);
      const oldest = (owned.length ? owned : race.items).reduce((a, b) => a.age >= b.age ? a : b);
      race.items = race.items.filter(e => e !== oldest);
      emit(race, events, { type: "expire", kartId: oldest.owner, effectId: oldest.id, item: oldest.item });
    }
    // Keep the actual remaining charges, rather than re-rolling or refilling the item.
    const effect = spawn(race, victim, dropped.item, "dropped", events, {
      x: victim.state.x - Math.sin(victim.state.yaw) * 2.4,
      z: victim.state.z - Math.cos(victim.state.yaw) * 2.4,
      ttl: 15, arm: .6, charges: dropped.charges, radius: .8,
    });
    if (effect) victim.held[victimFront] = null;
  }
  return true;
}
function detonate(effect: WorldEffect, radius: number, delay: number): void {
  effect.kind = "blast"; effect.radius = radius; effect.age = 0;
  effect.arm = delay; effect.ttl = delay + .4;
  effect.vx = effect.vy = effect.vz = 0;
  effect.hits = [];
}
function effectScenery(e: WorldEffect, course: CourseQuery): void {
  for (const obstacle of course.colliders) {
    if (e.y - e.radius > obstacle.top || e.y + e.radius < obstacle.bottom) continue;
    const ox = obstacle.shape === "circle" ? obstacle.x : clamp(e.x, obstacle.x - obstacle.halfX, obstacle.x + obstacle.halfX);
    const oz = obstacle.shape === "circle" ? obstacle.z : clamp(e.z, obstacle.z - obstacle.halfZ, obstacle.z + obstacle.halfZ);
    const radius = e.radius + (obstacle.shape === "circle" ? obstacle.radius : 0);
    const dx = e.x - ox, dz = e.z - oz, d = Math.hypot(dx, dz);
    if (d > radius) continue;
    const speed = Math.max(.001, Math.hypot(e.vx, e.vz));
    const nx = d > .001 ? dx / d : -e.vx / speed, nz = d > .001 ? dz / d : -e.vz / speed;
    e.x += nx * (radius - d + .01); e.z += nz * (radius - d + .01);
    if (e.kind === "bomb") { e.vx *= -.25; e.vz *= -.25; return; }
    if (!["bounce", "fire"].includes(e.item)) { e.ttl = 0; return; }
    const inward = e.vx * nx + e.vz * nz;
    if (inward < 0) { e.vx -= 2 * inward * nx; e.vz -= 2 * inward * nz; e.charges--; }
    if (e.charges <= 0) e.ttl = 0;
    return;
  }
}
function effectContact(race: RaceState, e: WorldEffect, kart: RaceKart, events: RaceEvent[]): void {
  const selfRisk = e.kind === "blast" || e.kind === "trap" && e.age > 1.2 ||
    e.kind === "projectile" && e.item === "bounce" && e.age > .75;
  if (kart.id === e.owner && !selfRisk || kart.state.finished || kart.state.recovery > 0 || e.hits.includes(kart.id)) return;
  if (Math.abs(e.y - kart.state.y) > (e.kind === "blast" ? 5 : 2)) return;
  if (["trap", "barrier"].includes(e.kind) && kart.state.mode !== "ground") return;
  if (e.kind === "dropped") {
    const slot = rear(kart);
    if (!kart.held[slot]) {
      kart.held[slot] = { id: uniqueId(race), item: e.item, charges: e.charges, cooldown: .2, ttl: -1 };
      e.ttl = 0;
      emit(race, events, { type: "pickup", kartId: kart.id, effectId: e.id, item: e.item });
    }
    return;
  }
  const bumper = race.items.find(b => b.kind === "bumper" && b.owner === kart.id && b.ttl > 0 && b.charges > 0);
  if (bumper && reflectable(e)) {
    bumper.charges--;
    if (bumper.charges === 0) bumper.ttl = 0;
    e.reflected = true; e.target = null; e.owner = kart.id; e.item = "bounce";
    e.vx = Math.sin(kart.state.yaw) * 37; e.vz = Math.cos(kart.state.yaw) * 37;
    e.x = kart.state.x + Math.sin(kart.state.yaw) * 2.4; e.z = kart.state.z + Math.cos(kart.state.yaw) * 2.4;
    e.y = kart.state.y + .2; e.age = 0; e.arm = .12; e.charges = 2; e.ttl = Math.min(3, e.ttl);
    emit(race, events, { type: "reflect", kartId: kart.id, effectId: e.id, item: e.item, value: bumper.charges });
    return;
  }
  e.hits.push(kart.id);
  const strength = e.kind === "trap" && kart.previous[kart.state.driver].brake > .5 ? .25 : e.kind === "blast" ? .85 : .6;
  hit(race, kart, e, events, strength);
  if (!["blast", "pulse"].includes(e.kind) && e.item !== "returning") e.ttl = 0;
}
function updateEffects(race: RaceState, course: CourseQuery, events: RaceEvent[]): void {
  for (const e of [...race.items]) {
    if (e.ttl <= 0) continue;
    const owner = race.karts.find(k => k.id === e.owner)!;
    e.age += STEP; e.ttl = Math.max(0, e.ttl - STEP);
    if (e.kind === "bumper" || e.kind === "coil") {
      e.x = owner.state.x; e.y = owner.state.y; e.z = owner.state.z;
      if (owner.state.finished) e.ttl = 0;
      if (e.kind === "coil" && e.charges > 0 && !owner.held.some(h => h?.item === "static")) e.ttl = 0;
      continue;
    }
    if (e.kind === "weather" || e.kind === "theft") {
      if (e.age < e.arm) continue;
      if (e.kind === "theft") {
        const candidates = race.karts.filter(k => k !== owner && !protectedKart(k) && k.held.some(Boolean))
          .sort((a, b) => (a.id === e.target ? -1 : b.id === e.target ? 1 : distance(a.state, owner.state) - distance(b.state, owner.state)));
        if (candidates[0]) stealHeld(race, owner, candidates[0], e.id, events, false);
      } else {
        for (const kart of race.karts) {
          if (kart === owner || protectedKart(kart)) continue;
          if (e.item === "shrink") {
            if (hit(race, kart, e, events, .35)) setStatus(kart, "shrink", 5, e.id);
          } else if (kart.state.boost <= 0) {
            setStatus(kart, "vision", 5, e.id);
            emit(race, events, { type: "hit", kartId: kart.id, effectId: e.id, item: e.item });
          }
        }
      }
      e.ttl = 0; continue;
    }
    if (e.kind === "pulse") {
      e.radius = Math.min(14, e.age * 28);
      for (const hazard of race.items) {
        if (hazard === e || hazard.owner === e.owner || hazard.ttl <= 0 || !ITEM_INTERACTIONS[hazard.item].shockwave ||
          !["trap", "barrier", "decoy", "projectile", "bomb", "blast"].includes(hazard.kind)) continue;
        if (distance(hazard, e) <= e.radius + hazard.radius && Math.abs(hazard.y - e.y) < 7) hazard.ttl = 0;
      }
      for (const kart of race.karts) {
        if (kart === owner || protectedKart(kart) || e.hits.includes(kart.id) || distance(kart.state, e) > e.radius || Math.abs(kart.state.y - e.y) > 3) continue;
        e.hits.push(kart.id);
        const d = Math.max(.1, distance(kart.state, e));
        kart.state.vx += (kart.state.x - e.x) / d * 6; kart.state.vz += (kart.state.z - e.z) / d * 6;
      }
      continue;
    }
    if (e.kind === "barrier" || e.kind === "decoy") {
      const from = course.projectRoad(e.x, e.z, e.y + .8);
      const road = advanceRoad(course, from, e.age >= e.arm ? e.direction * (e.kind === "barrier" ? 21 : e.vx) * STEP : 0);
      const projected = course.projectRoad(road.x, road.z, road.y + .01);
      const features = roadFeatures(course, projected);
      e.u = road.u;
      if (features.gap || Math.abs(e.lane) > features.halfWidth - .8 ||
        course.format === "sectors" && (e.u <= 0 || e.u >= 1)) { e.ttl = 0; continue; }
      e.x = road.x + road.dz * e.lane; e.z = road.z - road.dx * e.lane; e.y = road.y + .45;
    } else if (e.kind === "bomb") {
      const previousY = e.y;
      e.vy -= 9.81 * STEP;
      e.x += e.vx * STEP; e.z += e.vz * STEP; e.y += e.vy * STEP;
      const road = course.projectRoad(e.x, e.z, previousY + .8);
      const floor = (road.y <= previousY + .8 ? course.surfaceHeight(e.x, e.z, road) : course.terrainHeight(e.x, e.z)) + .4;
      if (e.y < floor) { e.y = floor; e.vy = 0; e.vx *= .9; e.vz *= .9; }
      effectScenery(e, course);
      if (e.age >= e.arm && race.karts.some(k => k !== owner && !protectedKart(k) && distance(k.state, e) < 1.6 && Math.abs(k.state.y - e.y) < 2)) {
        detonate(e, 7, .3);
      } else if (e.ttl <= 0) detonate(e, 7, .3);
      continue;
    } else if (e.kind === "projectile") {
      let target: { x: number; y: number; z: number } | undefined;
      if (e.item === "homing" && e.target && !e.reflected) {
        const decoys = race.items.filter(d => d.kind === "decoy" && d.owner !== e.owner && d.ttl > 0 && distance(e, d) < 30);
        const decoy = decoys.sort((a, b) => distance(e, a) - distance(e, b))[0];
        if (decoy) e.target = decoy.id;
        const targetKart = race.karts.find(k => k.id === e.target && !protectedKart(k));
        target = targetKart?.state ?? race.items.find(d => d.kind === "decoy" && d.id === e.target && d.ttl > 0);
        if (!target) e.target = null;
      } else if (e.item === "leader" && e.target) {
        target = race.karts.find(k => k.id === e.target && !k.state.finished)?.state;
        if (!target) { e.ttl = 0; continue; }
        if (e.age >= e.arm && distance(e, target) < 4) {
          e.x = target.x; e.z = target.z; e.y = target.y;
          detonate(e, 8, .8);
          emit(race, events, { type: "spawn", kartId: e.owner, effectId: e.id, item: e.item });
          continue;
        }
      } else if (e.item === "returning" && e.age > 1.1) target = owner.state;
      if (target) {
        const desired = Math.atan2(target.x - e.x, target.z - e.z);
        const angle = Math.atan2(e.vx, e.vz);
        const turn = e.item === "homing" ? 2.4 : e.item === "returning" ? 6 : 9;
        const yaw = angle + clamp(angleDifference(desired, angle), -turn * STEP, turn * STEP);
        const speed = Math.hypot(e.vx, e.vz);
        e.vx = Math.sin(yaw) * speed; e.vz = Math.cos(yaw) * speed;
        e.y += clamp(target.y + (e.item === "leader" ? 3 : 0) - e.y, -18 * STEP, 18 * STEP);
      }
      if (e.age >= e.arm) { e.x += e.vx * STEP; e.z += e.vz * STEP; }
      if (e.item === "returning" && e.age > 1.1 && distance(e, owner.state) < 1.6) { e.ttl = 0; continue; }
      const road = course.projectRoad(e.x, e.z, e.y + .8);
      const features = roadFeatures(course, road);
      if (!target && e.item !== "leader") {
        const floor = road.y <= e.y + .8 ? course.surfaceHeight(e.x, e.z, road) : course.terrainHeight(e.x, e.z);
        e.y = floor + (e.item === "fire" ? .5 + Math.abs(Math.sin(e.age * 13)) * .65 : .65);
        if (features.gap && e.y <= course.waterLevel + .7) e.ttl = 0;
      }
      if (e.item !== "leader" && road.separation > features.halfWidth - .3 && road.separation < features.halfWidth + 3) {
        const side = Math.sign(road.lateral), nx = road.dz * side, nz = -road.dx * side;
        const outward = e.vx * nx + e.vz * nz;
        if (outward > 0) {
          if (e.item === "bounce" || e.item === "fire") {
            e.vx -= 2 * outward * nx; e.vz -= 2 * outward * nz; e.charges--;
            if (e.charges <= 0) e.ttl = 0;
          } else if (e.item === "homing") e.ttl = 0;
        }
      }
      if (road.separation > 35 && e.item !== "leader") e.ttl = 0;
      if (e.item !== "leader") effectScenery(e, course);
      // Straight shots, fire and returning shots clear traps/barriers/decoys. Homing can be intercepted.
      for (const obstacle of race.items) {
        if (obstacle === e || obstacle.owner === e.owner || obstacle.ttl <= 0 || obstacle.age < obstacle.arm ||
          !["barrier", "decoy", "trap", "projectile"].includes(obstacle.kind) || obstacle.item === "leader") continue;
        if (e.item === "leader" || distance(e, obstacle) > e.radius + obstacle.radius || Math.abs(e.y - obstacle.y) > 2) continue;
        obstacle.ttl = 0;
        if (e.item !== "returning") e.ttl = 0;
        emit(race, events, { type: "blocked", kartId: e.owner, effectId: e.id, targetId: obstacle.id, item: e.item });
        break;
      }
      if (e.x < course.bounds.minX - 30 || e.x > course.bounds.maxX + 30 ||
        e.z < course.bounds.minZ - 30 || e.z > course.bounds.maxZ + 30 ||
        e.y < course.bounds.minY - 20 || e.y > course.bounds.maxY) e.ttl = 0;
    }
    if (e.ttl <= 0 || e.age < e.arm || e.kind === "decoy") continue;
    for (const kart of race.karts) {
      if (e.ttl <= 0) break;
      if (e.item === "leader" && e.kind === "projectile") continue;
      if (distance(e, kart.state) <= e.radius + .85) effectContact(race, e, kart, events);
    }
  }
  for (const e of race.items) if (e.ttl <= 0) emit(race, events, { type: "expire", kartId: e.owner, effectId: e.id, item: e.item });
  race.items = race.items.filter(e => e.ttl > 0);
}

export function botInput(race: RaceState, kart: RaceKart): PlayerInput {
  const course = getCourse(race.options.courseId, race.options.mirror);
  const s = kart.state;
  const airborne = s.mode === "glider";
  const road = course.projectRoad(s.x, s.z, s.y + .8);
  const near = course.sampleRoad(s.roadU);
  let flight: (typeof course.glides)[number] | undefined;
  for (const gap of course.glides) {
    if (near.distance >= course.sampleRoad(gap.start).distance - 32 &&
      (airborne || near.distance <= course.sampleRoad(gap.end).distance + 12) &&
      (!flight || gap.start > flight.start)) flight = gap;
  }
  const landingEdge = flight ? course.sampleRoad(flight.end) : null;
  const landing = landingEdge ? advanceRoad(course, course.projectRoad(landingEdge.x, landingEdge.z), 8) : null;
  const tune = tuningForBuild(kart.build, race.options.speedClass);
  const lookahead = airborne ? clamp(s.speed * 1.25 / tune.glideHandling, 22, 42) : 22;
  let target = advanceRoad(course, road, lookahead);
  if (airborne && landing && landing.distance - near.distance > lookahead) target = landing;
  const ahead = advanceRoad(course, road, 28);
  const turn = Math.abs(angleDifference(Math.atan2(ahead.dx, ahead.dz), Math.atan2(near.dx, near.dz)));
  let pitch = 0;
  if (airborne && landing) {
    // Solve the shared glider's damped vertical response for the actual landing height.
    const destination = near.distance > landing.distance ? advanceRoad(course, road, 8) : landing;
    const time = Math.max(.25, Math.hypot(destination.x - s.x, destination.z - s.z) / Math.max(9, Math.hypot(s.vx, s.vz)));
    const response = -Math.expm1(-GLIDE_DYNAMICS.response * time) / GLIDE_DYNAMICS.response;
    // Aim through touchdown clearance, not asymptotically at the resting kart height.
    const vertical = (destination.y - s.y - s.vy * response) / (time - response);
    pitch = clamp((vertical + GLIDE_DYNAMICS.gravity / tune.glideLift) / GLIDE_DYNAMICS.pitchAuthority, -1, 1);
  }
  const skill = race.options.difficulty === "easy" ? .9 : race.options.difficulty === "hard" ? 1.06 : 1;
  let desired = (turn > .6 ? 14 : turn > .32 ? 19 : 26) * skill * Math.sqrt(tune.handling);
  desired = Math.min(tune.topSpeed, desired);
  // The low-speed class still needs a clean, full-throttle takeoff; no teleport or off-course immunity.
  if (flight && s.roadU < flight.start) desired = tune.topSpeed;
  let error = angleDifference(Math.atan2(target.x - s.x, target.z - s.z), s.yaw);
  for (const hazard of race.items) {
    if (hazard.owner === kart.id || !["trap", "barrier", "bomb"].includes(hazard.kind) || distance(hazard, s) > 13) continue;
    const aheadDistance = (hazard.x - s.x) * Math.sin(s.yaw) + (hazard.z - s.z) * Math.cos(s.yaw);
    if (aheadDistance > 0) error += Math.sign(course.projectRoad(hazard.x, hazard.z).lateral - course.projectRoad(s.x, s.z).lateral || 1) * -.22;
  }
  const held = kart.held[rear(kart)];
  const { previous, target: gate, span } = checkpointSpan(course, s.nextCheckpoint);
  const travelled = course.format === "sectors" ? s.roadU - previous.u : wrap(s.roadU - previous.u, 1);
  // Crossing a curved gate's plane can precede its nearest-centreline parameter.
  const besidePrevious = course.format === "laps" && travelled > .5 &&
    Math.hypot(s.x - previous.x, s.z - previous.z) < course.roadWidth;
  const beyondEnd = course.format === "sectors" && s.roadU >= .999 &&
    (s.x - gate.x) * gate.dx + (s.z - gate.z) * gate.dz > 12;
  const missedGate = (!besidePrevious && travelled > span * 1.5 || beyondEnd) &&
    !(course.format === "laps" && s.lap === 1 && s.nextCheckpoint === 1 && s.roadU > .97);
  const use = !!held && race.tick % (race.options.difficulty === "easy" ? 90 : 45) === 0 &&
    (!["boost", "triple-boost", "rapid-boost", "static", "invincible"].includes(held.item) || turn < .16 && Math.abs(error) < .2);
  return {
    ...NEUTRAL_PLAYER, throttle: s.speed < desired ? 1 : 0,
    brake: s.speed > desired + 2 ? .25 : 0, steer: clamp(error * 2.5 / tune.handling, -1, 1),
    pitch,
    useItem: use, swap: !held && !!kart.held[s.driver] && s.swapTime === 0,
    throwDirection: held && ["slip", "triple-slip"].includes(held.item) ? -1 : 1,
    recover: kart.stuckTicks > 240 || missedGate && s.mode === "ground",
  };
}
function contacts(race: RaceState, events: RaceEvent[]): void {
  for (let i = 0; i < race.karts.length; i++) for (let j = i + 1; j < race.karts.length; j++) {
    const a = race.karts[i], b = race.karts[j];
    if (a.state.finished || b.state.finished || a.state.recovery > 0 || b.state.recovery > 0 ||
      a.status.ghost > 0 || b.status.ghost > 0 || Math.abs(a.state.y - b.state.y) > 1.7) continue;
    const d = distance(a.state, b.state);
    if (d > 1.8) continue;
    const nx = d > .001 ? (b.state.x - a.state.x) / d : 1;
    const nz = d > .001 ? (b.state.z - a.state.z) / d : 0;
    const wa = combinedStats(a.build).weight * (a.status.shrink > 0 ? .5 : 1);
    const wb = combinedStats(b.build).weight * (b.status.shrink > 0 ? .5 : 1);
    const penetration = 1.8 - d;
    a.state.x -= nx * penetration * wb / (wa + wb); a.state.z -= nz * penetration * wb / (wa + wb);
    b.state.x += nx * penetration * wa / (wa + wb); b.state.z += nz * penetration * wa / (wa + wb);
    const velocity = (a.state.vx - b.state.vx) * nx + (a.state.vz - b.state.vz) * nz;
    if (velocity > 0) {
      a.state.vx -= nx * velocity * 1.2 * wb / (wa + wb); a.state.vz -= nz * velocity * 1.2 * wb / (wa + wb);
      b.state.vx += nx * velocity * 1.2 * wa / (wa + wb); b.state.vz += nz * velocity * 1.2 * wa / (wa + wb);
    }
    for (const [attacker, victim] of [[a, b], [b, a]]) {
      const slide = attacker.status.slide > 0 && attacker.state.mode === "ground" && victim.state.mode === "ground" &&
        ((victim.state.x - attacker.state.x) * Math.cos(attacker.state.yaw) -
          (victim.state.z - attacker.state.z) * Math.sin(attacker.state.yaw)) * attacker.slideDirection > 0;
      if (slide || attacker.status.invincible > 0 || attacker.status.boostSteal > 0) {
        const id = attacker.statusIds[slide ? "slide" : attacker.status.invincible > 0 ? "invincible" : "boostSteal"]!;
        if (victim.status.grace <= 0 && !protectedKart(victim)) {
          stealHeld(race, attacker, victim, id, events, true);
          hit(race, victim, { id, item: attacker.status.invincible > 0 ? "invincible" : "boost", owner: attacker.id }, events, slide ? .45 : .6);
        }
      }
    }
    if (a.state.impactCooldown <= 0 && b.state.impactCooldown <= 0) {
      a.state.impactCooldown = b.state.impactCooldown = .2;
      emit(race, events, { type: "collision", kartId: a.id, targetId: b.id });
    }
  }
}
function tickInventory(kart: RaceKart): void {
  for (const key of STATUS_KEYS) {
    kart.status[key] = Math.max(0, kart.status[key] - STEP);
    if (kart.status[key] === 0) kart.statusIds[key] = null;
  }
  for (const slot of [0, 1] as const) {
    const held = kart.held[slot];
    if (!held) continue;
    held.cooldown = Math.max(0, held.cooldown - STEP);
    if (held.ttl >= 0) { held.ttl = Math.max(0, held.ttl - STEP); if (held.ttl === 0) kart.held[slot] = null; }
  }
}
function resolveInputs(race: RaceState, kart: RaceKart, inputs: Readonly<Record<string, PlayerInput>>, events: RaceEvent[]): [PlayerInput, PlayerInput] {
  const seats = kart.players.map((id, seat) => {
    const present = id !== null && Object.hasOwn(inputs, id);
    kart.missing[seat] = present ? 0 : Math.min(RACE_LIMITS.missingInputTicks, kart.missing[seat] + 1);
    return present ? normalizePlayerInput(inputs[id!]) : { ...NEUTRAL_PLAYER };
  }) as [PlayerInput, PlayerInput];
  const live = kart.players.map((id, seat) => id !== null && kart.missing[seat] < RACE_LIMITS.missingInputTicks);
  const wasAI = kart.ai;
  kart.ai = !live.some(Boolean);
  if (wasAI !== kart.ai) emit(race, events, { type: "takeover", kartId: kart.id, value: kart.ai ? 1 : 0 });
  if (kart.ai) {
    const input = botInput(race, kart);
    return [{ ...input }, { ...input }];
  }
  if (live.filter(Boolean).length === 1) {
    const input = seats[live[0] ? 0 : 1];
    return [{ ...input }, { ...input }];
  }
  return seats;
}
function drivingEvents(race: RaceState, kart: RaceKart, source: DrivingEvent[], events: RaceEvent[]): void {
  for (const event of source) {
    if (event.type === "boost") kart.boostId = uniqueId(race);
    emit(race, events, { type: event.type, kartId: kart.id, ...(event.type === "boost" ? { effectId: kart.boostId! } : {}),
      ...("time" in event ? { value: event.time } : "tier" in event ? { value: event.tier } : {}) });
    if (event.type === "finish") {
      kart.finishTick = race.tick;
      if (race.firstFinishTick === null) { race.firstFinishTick = race.tick; race.phase = "finishing"; }
    }
  }
}
export function stepRace(race: RaceState, inputs: Readonly<Record<string, PlayerInput>>): RaceEvent[] {
  const events: RaceEvent[] = [];
  if (race.phase === "finished") return events;
  race.tick++;
  const course = getCourse(race.options.courseId, race.options.mirror);
  const controls = race.karts.map(k => resolveInputs(race, k, inputs, events));
  if (race.phase === "countdown" && race.tick >= RACE_LIMITS.countdownTicks) {
    race.phase = "racing";
    emit(race, events, { type: "start", kartId: "" });
  }
  for (let index = 0; index < race.karts.length; index++) {
    const kart = race.karts[index], seats = controls[index], s = kart.state;
    if (s.finished) {
      tickInventory(kart);
      s.boost = Math.max(0, s.boost - STEP);
      if (s.boost === 0) kart.boostId = null;
      kart.previous = seats;
      continue;
    }
    const coOp = !kart.ai && kart.players.every((p, seat) => p !== null && kart.missing[seat] < RACE_LIMITS.missingInputTicks);
    for (const seat of [0, 1] as const) {
      if (seats[seat].throttle > .6 && kart.previous[seat].throttle <= .6) kart.startPress[seat] = race.tick;
      if (seats[seat].swap && !kart.previous[seat].swap) kart.swapRequests[seat] = race.tick;
    }
    if (race.phase === "countdown") { kart.previous = seats; continue; }
    tickInventory(kart);
    if (race.tick <= RACE_LIMITS.countdownTicks + 8) {
      const frontPress = kart.startPress[s.driver];
      const rearPress = kart.startPress[rear(kart)];
      const valid = frontPress >= RACE_LIMITS.countdownTicks && frontPress <= RACE_LIMITS.countdownTicks + 8;
      if (valid && kart.startBoost === 0) {
        kart.startBoost = 1; boost(race, kart, uniqueId(race), .8, events, false);
        emit(race, events, { type: "start-boost", kartId: kart.id });
      }
      if (valid && coOp && kart.startBoost < 2 && rearPress >= RACE_LIMITS.countdownTicks &&
        Math.abs(frontPress - rearPress) <= 3) {
        kart.startBoost = 2; boost(race, kart, uniqueId(race), 1.65, events, false);
        emit(race, events, { type: "double-start", kartId: kart.id });
      }
    }
    const driver = s.driver, back = rear(kart), frontInput = seats[driver];
    if (s.swapTime <= 0 && kart.status.stun <= 0 && (
      coOp ? kart.swapRequests.every(t => race.tick - t <= 8) :
        frontInput.swap && !kart.previous[driver].swap
    )) {
      s.driver = back; s.swapTime = .42; kart.swapRequests = [-1000, -1000];
      emit(race, events, { type: "swap", kartId: kart.id });
    }
    // Passing is front→rear only; held items remain attached to characters during a swap.
    const activeFront = seats[s.driver], activeRear = seats[rear(kart)];
    const frontEdge = (activeFront.passItem && !kart.previous[s.driver].passItem) ||
      (coOp && activeFront.useItem && !kart.previous[s.driver].useItem);
    if (frontEdge && kart.held[s.driver] && !kart.held[rear(kart)]) {
      kart.held[rear(kart)] = kart.held[s.driver]; kart.held[s.driver] = null;
      emit(race, events, { type: "pass", kartId: kart.id, effectId: kart.held[rear(kart)]!.id });
    }
    if (activeRear.useItem && !kart.previous[rear(kart)].useItem) useItem(race, kart, activeRear.throwDirection, events);
    if (coOp && activeRear.slide && activeRear.slide !== kart.previous[rear(kart)].slide &&
      kart.status.slideCooldown === 0 && kart.status.stun === 0 && s.mode === "ground" && s.recovery === 0) {
      const id = uniqueId(race);
      setStatus(kart, "slide", .22, id); setStatus(kart, "slideCooldown", .8, id);
      kart.slideDirection = activeRear.slide;
      s.vx += Math.cos(s.yaw) * activeRear.slide * 8; s.vz -= Math.sin(s.yaw) * activeRear.slide * 8;
      emit(race, events, { type: "slide", kartId: kart.id, effectId: id, value: activeRear.slide });
    }
    let driving = kart.status.autopilot > 0 ? botInput(race, kart) : activeFront;
    if (kart.status.stun > 0) driving = { ...NEUTRAL_PLAYER, brake: .5, recover: driving.recover };
    const tuning = tuningForBuild(kart.build, race.options.speedClass);
    if (kart.status.shrink > 0) {
      tuning.topSpeed *= .65; tuning.acceleration *= .7; tuning.boostSpeed *= .8;
    }
    if (kart.status.autopilot > 0) { tuning.topSpeed *= 1.12; tuning.acceleration *= 1.2; }
    const motion = stepKart(s, { ...driving, swap: false }, { course, tuning, countersteer: coOp ? activeRear.steer : undefined, time: race.tick * STEP });
    if (s.boost === 0) kart.boostId = null;
    // Keep yaw finite and bounded in serialized snapshots without changing the heading.
    s.yaw = angleDifference(s.yaw, 0);
    kart.stuckTicks = Math.abs(s.speed) < 3 && driving.throttle > .5 ? Math.min(600, kart.stuckTicks + 1) : 0;
    drivingEvents(race, kart, motion, events);
    kart.previous = seats;
  }
  if (race.phase === "countdown") return events;
  const beforeContact = race.karts.map(k => ({ x: k.state.x, z: k.state.z }));
  contacts(race, events);
  for (let i = 0; i < race.karts.length; i++) {
    const k = race.karts[i], old = beforeContact[i];
    if (old.x === k.state.x && old.z === k.state.z) continue;
    const progress: DrivingEvent[] = [];
    advanceKartProgress(k.state, old.x, old.z, progress, course);
    k.state.roadU = course.projectRoad(k.state.x, k.state.z, k.state.y + .8).u;
    drivingEvents(race, k, progress, events);
  }
  for (const pickup of race.pickups) {
    pickup.cooldown = Math.max(0, pickup.cooldown - STEP);
    if (pickup.cooldown > 0) continue;
    for (const kart of race.karts) {
      if (kart.state.finished || kart.state.recovery > 0 || distance(kart.state, pickup) > 1.6 || Math.abs(kart.state.y - pickup.y) > 2) continue;
      const slots: (0 | 1)[] = pickup.double ? [rear(kart), kart.state.driver] : [rear(kart)];
      let collected = false;
      for (const slot of slots) if (!kart.held[slot]) {
        const item = randomItem(race, kart, slot);
        kart.held[slot] = makeHeld(race, item); collected = true;
        emit(race, events, { type: "pickup", kartId: kart.id, effectId: kart.held[slot]!.id, item });
      }
      if (collected) { pickup.cooldown = 5; break; }
    }
  }
  updateEffects(race, course, events);
  for (const { state: s } of race.karts) {
    s.speed = Math.hypot(s.vx, s.vz) * Math.sign(s.vx * Math.sin(s.yaw) + s.vz * Math.cos(s.yaw) || 1);
  }
  if (race.karts.every(k => k.state.finished) ||
    race.firstFinishTick !== null && race.tick - race.firstFinishTick >= RACE_LIMITS.finishTicks ||
    race.tick >= RACE_LIMITS.maximumTicks) {
    race.phase = "finished";
    race.results = standings(race);
    emit(race, events, { type: "race-finished", kartId: "" });
  }
  return events;
}

function keys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === expected.length && own.every(k => expected.includes(k));
}
function validInput(value: unknown): value is PlayerInput {
  if (!record(value) || !keys(value, Object.keys(NEUTRAL_PLAYER))) return false;
  return ["throttle", "brake"].every(k => finite(value[k], 0, 1)) &&
    ["steer", "pitch"].every(k => finite(value[k], -1, 1)) &&
    ["drift", "recover", "swap", "useItem", "passItem"].every(k => typeof value[k] === "boolean") &&
    (value.throwDirection === -1 || value.throwDirection === 1) && [-1, 0, 1].includes(value.slide as number);
}
function validKartState(value: unknown, tick: number, course: CourseQuery): value is KartState {
  if (!record(value) || !keys(value, Object.keys(createKart()))) return false;
  const stages = course.format === "sectors" ? 3 : course.laps;
  const numeric: Record<string, [number, number]> = {
    x: [course.bounds.minX - 20, course.bounds.maxX + 20], y: [course.bounds.minY - 20, course.bounds.maxY + 20],
    z: [course.bounds.minZ - 20, course.bounds.maxZ + 20], yaw: [-Math.PI - .001, Math.PI + .001],
    vx: [-200, 200], vy: [-100, 100], vz: [-200, 200], speed: [-200, 200],
    driftDirection: [-1, 1], driftCharge: [0, 3], counterCooldown: [0, 1], boost: [0, 15],
    recovery: [0, 2], swapTime: [0, 1], nextCheckpoint: [0, course.checkpoints.length - 1], lap: [1, stages], lapStart: [0, 1800],
    elapsed: [0, 1800], roadU: [0, 1], impactCooldown: [0, 1], driver: [0, 1], recoveries: [0, 108000], tick: [0, tick],
  };
  if (!Object.entries(numeric).every(([key, [min, max]]) => finite(value[key], min, max))) return false;
  if (!["driftDirection", "driftCharge", "nextCheckpoint", "lap", "driver", "recoveries", "tick"].every(k => Number.isInteger(value[k]))) return false;
  if (!["counterArmed", "previousRecover", "previousSwap", "finished", "offRoad", "wrongWay"].every(k => typeof value[k] === "boolean")) return false;
  if (!["ground", "air", "glider"].includes(value.mode as string)) return false;
  if (!Array.isArray(value.lapTimes) || value.lapTimes.length > stages || !value.lapTimes.every(t => finite(t, 0, 1800))) return false;
  if ((value.lapStart as number) > (value.elapsed as number) || (value.finished && value.lapTimes.length !== stages)) return false;
  if (!value.finished && value.lapTimes.length !== (value.lap as number) - 1) return false;
  if (value.finished && value.lap !== stages) return false;
  return true;
}
function validEffectKind(item: ItemId, kind: EffectKind): boolean {
  if (kind === "dropped") return true;
  const kinds: Partial<Record<ItemId, EffectKind[]>> = {
    slip: ["trap"], bounce: ["projectile"], homing: ["projectile"], leader: ["projectile", "blast"],
    bomb: ["bomb", "blast"], fire: ["projectile"], returning: ["projectile"], shockwave: ["pulse"],
    shrink: ["weather"], vision: ["weather"], theft: ["theft"], roadwork: ["barrier"],
    velvet: ["bumper"], static: ["coil"], doubles: ["decoy"],
  };
  return kinds[item]?.includes(kind) ?? false;
}
/** Full bounded decoding; malformed or partial migration snapshots return null, never repair/fabricate state. */
export function parseRaceState(value: unknown): RaceState | null {
  try {
    if (!record(value) || !keys(value, ["version", "options", "tick", "phase", "rng", "nextId", "firstFinishTick", "karts", "items", "pickups", "results"])) return null;
    if (value.version !== 1 || !optionsValid(value.options) || !keys(value.options as unknown as Record<string, unknown>, ["courseId", "mode", "speedClass", "mirror", "bots", "difficulty", "seed"]) ||
      !integer(value.tick, 0, RACE_LIMITS.maximumTicks) || !integer(value.rng, 1, 0xffffffff) || !integer(value.nextId, 1, RACE_LIMITS.maximumId)) return null;
    const tick = value.tick, nextId = value.nextId;
    const course = getCourse(value.options.courseId, value.options.mirror);
    const effectId = (id: unknown): id is string => typeof id === "string" && /^e[1-9]\d{0,7}$/.test(id) && Number(id.slice(1)) < nextId;
    const ids = new Set<string>();
    const addId = (id: unknown): boolean => effectId(id) && !ids.has(id) && !!ids.add(id);
    if (!["countdown", "racing", "finishing", "finished"].includes(value.phase as string) ||
      !(value.firstFinishTick === null || integer(value.firstFinishTick, RACE_LIMITS.countdownTicks, tick))) return null;
    if ((value.phase === "countdown") !== (tick < RACE_LIMITS.countdownTicks) ||
      (value.phase === "finishing" && value.firstFinishTick === null) ||
      (["countdown", "racing"].includes(value.phase as string) && value.firstFinishTick !== null)) return null;
    if (!Array.isArray(value.karts) || value.karts.length < 1 || value.karts.length > RACE_LIMITS.karts ||
      !Array.isArray(value.items) || value.items.length > RACE_LIMITS.effects ||
      !Array.isArray(value.pickups) || value.pickups.length > RACE_LIMITS.pickups ||
      !Array.isArray(value.results) || value.results.length > RACE_LIMITS.karts) return null;
    const kartIds = new Set<string>(), players = new Set<string>();
    for (const k of value.karts) {
      if (!entryValid(k) || !record(k) || !keys(k, [
        "id", "name", "build", "players", "state", "held", "status", "statusIds", "previous", "missing",
        "swapRequests", "startPress", "startBoost", "boostId", "slideDirection", "bot", "ai", "stuckTicks", "finishTick",
      ]) || kartIds.has(k.id) || !validKartState(k.state, tick, course)) return null;
      kartIds.add(k.id);
      if (!keys(k.build as unknown as Record<string, unknown>, ["characters", "body", "wheels", "glider", "paint", "decal"])) return null;
      for (const p of k.players) if (p !== null) { if (players.has(p)) return null; players.add(p); }
      if (!Array.isArray(k.held) || k.held.length !== 2) return null;
      for (const h of k.held) {
        if (h === null) continue;
        if (!record(h) || !keys(h, ["id", "item", "charges", "ttl", "cooldown"]) || !addId(h.id) ||
          !ITEM_IDS.includes(h.item as ItemId) || !integer(h.charges, 1, RACE_LIMITS.heldCharges) ||
          !(h.ttl === -1 || finite(h.ttl, 0, 6)) || !finite(h.cooldown, 0, 1)) return null;
        const max = (h.item as string).startsWith("triple-") ? 3 : h.item === "static" ? 2 : h.item === "rapid-boost" ? 20 : 1;
        if (h.charges > max || (h.ttl !== -1 && !["static", "rapid-boost"].includes(h.item as string))) return null;
      }
      if (!record(k.status) || !keys(k.status, STATUS_KEYS) || !record(k.statusIds) || !keys(k.statusIds, STATUS_KEYS)) return null;
      for (const status of STATUS_KEYS) {
        if (!finite(k.status[status], 0, 30) || !(k.statusIds[status] === null || effectId(k.statusIds[status])) ||
          ((k.status[status] === 0) !== (k.statusIds[status] === null))) return null;
      }
      if (!Array.isArray(k.previous) || k.previous.length !== 2 || !k.previous.every(validInput)) return null;
      for (const field of ["missing", "swapRequests", "startPress"]) {
        if (!Array.isArray(k[field]) || k[field].length !== 2 ||
          !k[field].every((n: unknown) => integer(n, field === "missing" ? 0 : -1000, field === "missing" ? 30 : tick))) return null;
      }
      if (![0, 1, 2].includes(k.startBoost as number) || ![-1, 0, 1].includes(k.slideDirection as number) ||
        !(k.boostId === null || effectId(k.boostId)) ||
        typeof k.bot !== "boolean" || typeof k.ai !== "boolean" || !integer(k.stuckTicks, 0, 600) ||
        !(k.finishTick === null || integer(k.finishTick, RACE_LIMITS.countdownTicks, tick)) ||
        (k.finishTick !== null) !== k.state.finished) return null;
    }
    if (players.size > RACE_LIMITS.humans) return null;
    const byOwner = new Map<string, number>();
    for (const e of value.items) {
      if (!record(e) || !keys(e, ["id", "item", "kind", "owner", "x", "y", "z", "vx", "vy", "vz", "radius", "ttl", "age", "arm", "charges", "target", "reflected", "u", "lane", "direction", "hits"]) ||
        !addId(e.id) || !ITEM_IDS.includes(e.item as ItemId) || !EFFECT_KINDS.includes(e.kind as EffectKind) || !kartIds.has(e.owner as string) ||
        !validEffectKind(e.item as ItemId, e.kind as EffectKind) ||
        !["x", "y", "z"].every(k => finite(e[k], -12000, 12000)) || !["vx", "vy", "vz"].every(k => finite(e[k], -200, 200)) ||
        !finite(e.radius, 0, 20) || !finite(e.ttl, .00000001, 30) || !finite(e.age, 0, 30) ||
        !finite(e.arm, 0, 2) || !integer(e.charges, 0, 20) || !finite(e.u, 0, 1) || !finite(e.lane, -20, 20) ||
        ![-1, 1].includes(e.direction as number) || typeof e.reflected !== "boolean" ||
        !(e.target === null || identifier(e.target)) ||
        !Array.isArray(e.hits) || e.hits.length > 8 || !e.hits.every(id => kartIds.has(id)) || new Set(e.hits).size !== e.hits.length) return null;
      byOwner.set(e.owner as string, (byOwner.get(e.owner as string) ?? 0) + 1);
      if (byOwner.get(e.owner as string)! > RACE_LIMITS.effectsPerKart) return null;
    }
    for (const e of value.items) if (e.target !== null && !kartIds.has(e.target) && !effectId(e.target)) return null;
    const pickupIds = new Set<string>();
    for (const p of value.pickups) {
      if (!record(p) || !keys(p, ["id", "x", "y", "z", "cooldown", "double"]) || !identifier(p.id) || pickupIds.has(p.id) ||
        !finite(p.x, course.bounds.minX, course.bounds.maxX) || !finite(p.z, course.bounds.minZ, course.bounds.maxZ) ||
        !finite(p.y, course.bounds.minY, course.bounds.maxY) || !finite(p.cooldown, 0, 5) || typeof p.double !== "boolean") return null;
      pickupIds.add(p.id);
    }
    if (value.options.mode === "time-trial" && (value.karts.length !== 1 || players.size > 1 || value.pickups.length !== 0 ||
      value.items.length !== 0 || value.karts.some(k => k.held.some((h: HeldItem | null) => h !== null && h.item !== "boost")))) return null;
    const resultIds = new Set<string>();
    for (const r of value.results) {
      if (!record(r) || !keys(r, ["id", "name", "position", "finished", "disconnected", "time", "progress", "points"]) ||
        !kartIds.has(r.id as string) || resultIds.has(r.id as string) || typeof r.name !== "string" || r.name.length > 32 ||
        !integer(r.position, 1, value.karts.length) || typeof r.finished !== "boolean" || typeof r.disconnected !== "boolean" ||
        !(r.time === null || finite(r.time, 0, 1800)) ||
        !finite(r.progress, 0, course.format === "sectors" ? course.checkpoints.length - 1 : course.checkpoints.length * course.laps) ||
        !integer(r.points, 0, 10)) return null;
      resultIds.add(r.id as string);
    }
    const race = value as unknown as RaceState;
    const finishTicks = race.karts.map(k => k.finishTick).filter((t): t is number => t !== null);
    if (race.firstFinishTick !== (finishTicks.length ? Math.min(...finishTicks) : null)) return null;
    if (race.phase === "finished") {
      const actual = standings(race);
      if (race.results.length !== actual.length || race.results.some((r, i) =>
        (Object.keys(r) as (keyof RaceResult)[]).some(key => r[key] !== actual[i][key]))) return null;
    } else if (race.results.length !== 0) return null;
    return copyRace(race);
  } catch {
    return null;
  }
}
