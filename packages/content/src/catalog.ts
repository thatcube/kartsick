import {
  BODY_IDS, CHARACTER_IDS, DECAL_IDS, DEFAULT_BUILD, GLIDER_IDS, PAINT_IDS, WHEEL_IDS,
} from "./catalog-types";
import type {
  CharacterDefinition, HandlingStats, ItemDefinition, KartBuild, PartDefinition, BodyId, WheelId, GliderId,
} from "./catalog-types";

const stats = (values: Partial<HandlingStats> = {}): HandlingStats => ({
  speed: 1, acceleration: 1, handling: 1, grip: 1, weight: 1, offRoad: 1,
  glideSpeed: 1, glideLift: 1, glideHandling: 1, ...values,
});
export const CHARACTERS: readonly CharacterDefinition[] = [
  { id: "clutch", name: "Clutch", pair: "road-crew", body: "boiler-bug", color: "#FF8051", description: "Boiler-house mechanic with a horizontal handlebar mustache and mint welding goggles." },
  { id: "bramble", name: "Bramble", pair: "road-crew", body: "trail-mix", color: "#688B55", description: "Leaf-eared mapmaker with plum hair, an enormous rust scarf and map-fold cape." },
  { id: "pompa", name: "Pompa", pair: "court-disorder", body: "gilt-trip", color: "#EDABDB", description: "Self-appointed duchess with architectural copper hair and a lilac bell skirt." },
  { id: "bront", name: "Bront", pair: "court-disorder", body: "velvet-hammer", color: "#E77B72", description: "Coral caiman with a shovel jaw, navy shoulder plates and a surprisingly polite wave." },
  { id: "rivet", name: "Rivet", pair: "live-wires", body: "slipstream", color: "#CB508D", description: "Restless magenta tenrec with a turbine crest and one stubborn forward tuft." },
  { id: "pipvolt", name: "Pipvolt", pair: "live-wires", body: "coil-bug", color: "#F4BD78", description: "Apricot jerboa with broad squared ears and a glowing cable-tail bulb." },
  { id: "bollo", name: "Bollo", pair: "mismatched-muscle", body: "air-pocket", color: "#ABDDE8", description: "Soft triangular cushion creature with noodle arms and enormous plum slippers." },
  { id: "hunkle", name: "Hunkle", pair: "mismatched-muscle", body: "knuckle-bus", color: "#A1BDB1", description: "Mint-gray orangutan with hanging forearms, tiny head and a cropped track jacket." },
];
export const BODIES: readonly PartDefinition<BodyId>[] = [
  { id: "boiler-bug", name: "Boiler Bug", description: "Quick acceleration and recovery; modest road speed.", stats: stats({ speed: .97, acceleration: 1.12, weight: .96 }) },
  { id: "trail-mix", name: "Trail Mix", description: "Rough-surface traction at the expense of road maximum.", stats: stats({ speed: .94, offRoad: 1.3, grip: 1.06, acceleration: .97 }) },
  { id: "gilt-trip", name: "Gilt Trip", description: "Efficient flight; slower ground acceleration.", stats: stats({ acceleration: .88, glideSpeed: 1.08, glideLift: 1.1, weight: .96 }) },
  { id: "velvet-hammer", name: "Velvet Hammer", description: "Road speed and contact stability; wider turns.", stats: stats({ speed: 1.07, acceleration: .93, handling: .88, weight: 1.24 }) },
  { id: "slipstream", name: "Slipstream", description: "Fast turn-in and drift response; light in contact.", stats: stats({ handling: 1.13, grip: 1.04, weight: .78, offRoad: .94 }) },
  { id: "coil-bug", name: "Coil Bug", description: "Nimble acceleration; lower maximum and stability.", stats: stats({ acceleration: 1.19, handling: 1.06, speed: .93, weight: .82 }) },
  { id: "air-pocket", name: "Air Pocket", description: "Forgiving glides and landings; less planted on pavement.", stats: stats({ glideLift: 1.16, glideHandling: 1.08, grip: .85, speed: .97 }) },
  { id: "knuckle-bus", name: "Knuckle Bus", description: "Very steady in contact; slower acceleration and turn-in.", stats: stats({ weight: 1.4, grip: 1.12, acceleration: .88, handling: .88 }) },
];
export const WHEELS: readonly PartDefinition<WheelId>[] = [
  { id: "picnic", name: "Picnic", description: "Balanced paved-road baseline.", stats: stats() },
  { id: "button", name: "Button", description: "Quick acceleration and steering; reduced high-speed grip.", stats: stats({ acceleration: 1.1, handling: 1.07, grip: .9, weight: .95 }) },
  { id: "thimble", name: "Thimble", description: "Road speed; poor rough-surface traction.", stats: stats({ speed: 1.05, offRoad: .8, grip: .96 }) },
  { id: "bramble", name: "Bramble", description: "Rough-ground grip and recovery; reduced paved speed.", stats: stats({ offRoad: 1.28, grip: 1.07, speed: .95 }) },
  { id: "cushion", name: "Cushion", description: "Stable contact and forgiving landings; slower turn-in.", stats: stats({ weight: 1.15, glideLift: 1.06, handling: .9, grip: 1.06 }) },
  { id: "spool", name: "Spool", description: "Sustained drift and glide efficiency; less planted ground feel.", stats: stats({ glideSpeed: 1.05, glideLift: 1.04, handling: 1.03, grip: .87, weight: .95 }) },
];
export const GLIDERS: readonly PartDefinition<GliderId>[] = [
  { id: "mapwing", name: "Mapwing", description: "Balanced map-fold canopy.", stats: stats() },
  { id: "sunfan", name: "Sunfan", description: "Lift and landing forgiveness; slower flight.", stats: stats({ glideLift: 1.2, glideSpeed: .9, glideHandling: .98 }) },
  { id: "crosskite", name: "Crosskite", description: "Fast flight; less forgiving stall and landing envelope.", stats: stats({ glideSpeed: 1.14, glideLift: .84, glideHandling: .94 }) },
  { id: "bellflower", name: "Bellflower", description: "Responsive air steering; reduced glide efficiency.", stats: stats({ glideHandling: 1.25, glideLift: .93, glideSpeed: .97 }) },
];
export const PAINTS = [
  { id: "original", name: "Original", color: "#FF8051" }, { id: "pool", name: "Pool", color: "#5BD1C4" },
  { id: "sunset", name: "Sunset", color: "#EE795A" }, { id: "custard", name: "Custard", color: "#FFD46B" },
  { id: "petal", name: "Petal", color: "#EDABDB" }, { id: "midnight", name: "Midnight", color: "#3445A8" },
] as const;
export const DECALS = [
  { id: "plain", name: "Plain", description: "Unmarked enamel." },
  { id: "chevrons", name: "Chevrons", description: "Forward-pointing road stripes." },
  { id: "checks", name: "Checks", description: "Alternating racing squares." },
  { id: "bolt", name: "Bolt", description: "Original coil-discharge zigzag." },
] as const;
export const ITEMS: readonly ItemDefinition[] = [
  { id: "slip", name: "Skid Patch", description: "Drop a road trap. Avoid it, clear it with a shot, or brake to reduce the spin.", color: "#FFD46B", special: null },
  { id: "bounce", name: "Ricochet Reel", description: "Straight road-bouncing shot. Dodge, intercept or rebound it.", color: "#5BD1C4", special: null },
  { id: "homing", name: "Chaser Chime", description: "Limited-turn pursuit shot. Break line with a tight turn, a trap or a decoy.", color: "#FF8051", special: null },
  { id: "leader", name: "First-Class Parcel", description: "Warns the leader before a delayed blast. Boost clear or use a shockwave.", color: "#3445A8", special: null },
  { id: "bomb", name: "Popclock", description: "Timed, gravity-bound bomb with an expanding blast; leave its marked radius.", color: "#D9855D", special: null },
  { id: "boost", name: "Zip Can", description: "One burst of ground or flight thrust, not invincibility.", color: "#FFD46B", special: null },
  { id: "triple-boost", name: "Zip Three", description: "Three individually triggered Zip Cans.", color: "#FFD46B", special: null },
  { id: "rapid-boost", name: "Zip Flask", description: "Repeated user-triggered boosts during a short active window.", color: "#FF8051", special: null },
  { id: "invincible", name: "Parade Power", description: "Visible temporary contact and attack immunity; can still fall or miss a checkpoint.", color: "#F5F2E8", special: null },
  { id: "shrink", name: "Pocket Weather", description: "Telegraphed pack-wide shrink and slowdown; protected racers resist it.", color: "#EDABDB", special: null },
  { id: "autopilot", name: "Express Escort", description: "Temporary visibly guided comeback using the same road physics.", color: "#3445A8", special: null },
  { id: "vision", name: "Confetti Forecast", description: "Telegraphed visual interference, never hidden steering; boosts clear the screen.", color: "#EDABDB", special: null },
  { id: "theft", name: "Borrowing Bell", description: "Steal a held item after a tell; use it before the bell arrives.", color: "#ABDDE8", special: null },
  { id: "fire", name: "Ember Choir", description: "Three low bouncing fireballs in a fan. Intercept, dodge or rebound them.", color: "#FF8051", special: null },
  { id: "returning", name: "Return Ticket", description: "An outward-and-returning curved shot. Watch both legs; can break barriers.", color: "#5BD1C4", special: null },
  { id: "shockwave", name: "Clear the Deck", description: "One expanding defensive pulse clears nearby hazards and shoves rivals.", color: "#F5F2E8", special: null },
  { id: "triple-slip", name: "Skid Set", description: "Three individually dropped road traps.", color: "#FFD46B", special: null },
  { id: "triple-bounce", name: "Reel Set", description: "Three individually launched bouncing shots.", color: "#5BD1C4", special: null },
  { id: "triple-homing", name: "Chime Set", description: "Three individually launched pursuit shots.", color: "#FF8051", special: null },
  { id: "roadwork", name: "Roadwork Rumble", description: "Three stencilled, nonhoming road barriers; shots and shockwaves break them.", color: "#FF8051", special: "road-crew" },
  { id: "velvet", name: "Velvet Rebound", description: "Three countable projectile-only bumpers; bombs, leader attacks, traps, shrink and theft bypass.", color: "#EDABDB", special: "court-disorder" },
  { id: "static", name: "Static Sling", description: "Two manual discharges: thrust and a narrow forward deflection cone, never immunity.", color: "#FFD46B", special: "live-wires" },
  { id: "doubles", name: "Stunt Doubles", description: "Two road-only inflatables divert ordinary homing shots. They are not racers.", color: "#ABDDE8", special: "mismatched-muscle" },
];

const contains = (values: readonly string[], value: unknown): boolean => typeof value === "string" && values.includes(value);
export function validBuild(value: unknown): value is KartBuild {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.characters) && v.characters.length === 2 &&
    v.characters[0] !== v.characters[1] && v.characters.every(id => contains(CHARACTER_IDS, id)) &&
    contains(BODY_IDS, v.body) && contains(WHEEL_IDS, v.wheels) && contains(GLIDER_IDS, v.glider) &&
    contains(PAINT_IDS, v.paint) && contains(DECAL_IDS, v.decal);
}
/** Defaults apply only to omitted fields; supplied invalid IDs are never substituted. */
export function normalizeBuild(value: unknown = {}): KartBuild {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid kart build.");
  const build = { ...DEFAULT_BUILD, ...value };
  if (!validBuild(build)) throw new TypeError("Unknown part, cosmetic or duplicate character.");
  return { characters: [...build.characters], body: build.body, wheels: build.wheels, glider: build.glider, paint: build.paint, decal: build.decal };
}
export function combinedStats(build: KartBuild): HandlingStats {
  if (!validBuild(build)) throw new TypeError("Invalid kart build.");
  const parts = [BODIES.find(p => p.id === build.body)!, WHEELS.find(p => p.id === build.wheels)!, GLIDERS.find(p => p.id === build.glider)!];
  const result = stats();
  for (const key of Object.keys(result) as (keyof HandlingStats)[]) {
    result[key] = parts.reduce((value, part) => value * part.stats[key], 1);
  }
  return result;
}
export const buildStats = combinedStats;
