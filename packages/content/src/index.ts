export * from "./catalog-types";
export * from "./catalog";
export * from "./course";

export interface Point {
  x: number;
  y: number;
  z: number;
}

export interface RoadPoint extends Point {
  u: number;
  distance: number;
  dx: number;
  dz: number;
}

export const STUDY_VERSION = "butterbell-pastures-3";
export const ROAD_WIDTH = 13;
export const SHOULDER_WIDTH = ROAD_WIDTH / 2 + 0.6;
export const WATER_LEVEL = 0.42;
export const GAP_START = 7.1 / 12;
export const GAP_END = 8.7 / 12;
export const CHECKPOINT_COUNT = 16;
export const TAU = Math.PI * 2;
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const wrap = (value: number, size: number) => ((value % size) + size) % size;
export const angleDifference = (a: number, b: number) => wrap(a - b + Math.PI, TAU) - Math.PI;

const controlPoints = [
  [0, -110], [0, -45], [-28, 20], [-8, 85], [48, 117], [117, 95],
  [138, 40], [106, 5], [61, -22], [30, -48], [42, -103], [15, -141],
] as const;

function pastureHeight(x: number, z: number): number {
  return 0.8 + Math.sin(x * 0.029) * 0.65 + Math.cos(z * 0.025) * 0.55;
}

export function terrainHeight(x: number, z: number): number {
  const pond = ((x - 77) / 36) ** 2 + ((z + 14) / 27) ** 2;
  const westHill = 22 * Math.exp(-(((x + 118) / 44) ** 2) - ((z - 68) / 90) ** 2);
  const eastHill = 19 * Math.exp(-(((x - 214) / 34) ** 2) - ((z - 106) / 65) ** 2);
  return pastureHeight(x, z) + westHill + eastHill - Math.max(0, 1 - pond) * 3.5;
}

export function isWater(x: number, z: number): boolean {
  return ((x - 77) / 36) ** 2 + ((z + 14) / 27) ** 2 < 1;
}

export const isGap = (u: number) => u >= GAP_START && u < GAP_END;
export const hasRail = (u: number) => u > 0.39 && u < GAP_START - 0.01;

function spline(a: number, b: number, c: number, d: number, t: number): number {
  return 0.5 * ((2 * b) + (-a + c) * t +
    (2 * a - 5 * b + 4 * c - d) * t * t +
    (-a + 3 * b - 3 * c + d) * t * t * t);
}

function curve(u: number): Point {
  const t = wrap(u, 1) * controlPoints.length;
  const index = Math.floor(t);
  const local = t - index;
  const a = controlPoints[wrap(index - 1, controlPoints.length)];
  const b = controlPoints[index];
  const c = controlPoints[(index + 1) % controlPoints.length];
  const d = controlPoints[(index + 2) % controlPoints.length];
  const x = spline(a[0], b[0], c[0], d[0], local);
  const z = spline(a[1], b[1], c[1], d[1], local);
  const ramp = clamp((u - 0.42) / (GAP_START - 0.42), 0, 1);
  const elevation = u < GAP_START
    ? 12 * ramp * ramp * (3 - 2 * ramp)
    : u < GAP_END ? lerp(12, 0, (u - GAP_START) / (GAP_END - GAP_START)) : 0;
  return { x, y: pastureHeight(x, z) + 0.25 + elevation, z };
}

const sampleCount = 480;
const road: RoadPoint[] = [];
let length = 0;
for (let i = 0; i <= sampleCount; i++) {
  const u = i / sampleCount;
  const point = curve(u === 1 ? 0 : u);
  const previous = road[i - 1];
  if (previous) length += Math.hypot(point.x - previous.x, point.z - previous.z);
  const before = curve(wrap(u - 0.0001, 1));
  const after = curve(wrap(u + 0.0001, 1));
  const delta = Math.hypot(after.x - before.x, after.z - before.z);
  road.push({ ...point, u, distance: length, dx: (after.x - before.x) / delta, dz: (after.z - before.z) / delta });
}

export const ROAD: readonly RoadPoint[] = road;
export const TRACK_LENGTH = length;
export const CHECKPOINTS = Array.from({ length: CHECKPOINT_COUNT }, (_, i) => sampleRoad(i / CHECKPOINT_COUNT));

export function sampleRoad(u: number): RoadPoint {
  const index = wrap(u, 1) * sampleCount;
  const low = Math.floor(index);
  const a = ROAD[low];
  const b = ROAD[low + 1];
  const t = index - low;
  return {
    x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t),
    dx: lerp(a.dx, b.dx, t), dz: lerp(a.dz, b.dz, t),
    distance: lerp(a.distance, b.distance, t), u: wrap(u, 1),
  };
}

export interface RoadProjection extends RoadPoint {
  lateral: number;
  separation: number;
}

export function projectRoad(x: number, z: number): RoadProjection {
  let best = Infinity;
  let result: RoadProjection | undefined;
  for (let i = 0; i < ROAD.length - 1; i++) {
    const a = ROAD[i];
    const b = ROAD[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
    const px = lerp(a.x, b.x, t);
    const pz = lerp(a.z, b.z, t);
    const squared = (x - px) ** 2 + (z - pz) ** 2;
    if (squared >= best) continue;
    best = squared;
    const magnitude = Math.hypot(dx, dz);
    result = {
      x: px, z: pz, y: lerp(a.y, b.y, t), dx: dx / magnitude, dz: dz / magnitude,
      u: lerp(a.u, b.u, t), distance: lerp(a.distance, b.distance, t),
      separation: Math.sqrt(squared),
      lateral: (x - px) * dz / magnitude - (z - pz) * dx / magnitude,
    };
  }
  if (!result) throw new Error("The course has no valid road segments.");
  return result;
}

export function bankWidth(point: RoadPoint): number {
  return 3.4 + Math.max(0, point.y - pastureHeight(point.x, point.z) - 0.25) * 0.95;
}

export function bankHeight(point: RoadPoint, x: number, z: number, separation: number): number {
  const t = clamp((separation - SHOULDER_WIDTH) / bankWidth(point), 0, 1);
  return lerp(point.y, terrainHeight(x, z), t * t * (3 - 2 * t));
}

export function surfaceHeight(x: number, z: number, road = projectRoad(x, z)): number {
  if (isGap(road.u)) return terrainHeight(x, z);
  return bankHeight(road, x, z, road.separation);
}

export const BARNS = [{ x: 43, z: 96 }, { x: -52, z: 59 }] as const;
export const WINDMILL = { x: 160, z: 18 } as const;
export const HAY_BALES = BARNS.flatMap(barn => [
  { x: barn.x - 10, z: barn.z - 8 }, { x: barn.x - 12.3, z: barn.z - 6.6 },
]);

export interface OrchardTree {
  x: number;
  z: number;
  scale: number;
  seed: number;
}

function noise(index: number): number {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

const orchard: OrchardTree[] = [];
const nearBarn = (x: number, z: number) => BARNS.some(barn => Math.abs(barn.x + 3 - x) < 20 && Math.abs(barn.z - z) < 16);
for (let row = 0; row < 6; row++) {
  for (let column = 0; column < 4; column++) {
    const seed = row * 4 + column;
    const x = -71 + column * 10 + noise(seed) * 1.2;
    const z = -7 + row * 10 + noise(seed + 7) * 1.2;
    if (projectRoad(x, z).separation >= 14 && !nearBarn(x, z)) orchard.push({ x, z, scale: 0.8 + noise(seed + 3) * 0.22, seed });
  }
}
for (let i = 0; i < 72; i++) {
  const x = -135 + noise(i + 14) * 325;
  const z = -193 + noise(i + 95) * 380;
  if (projectRoad(x, z).separation < 16 ||
    ((x - 77) / 50) ** 2 + ((z + 14) / 40) ** 2 < 1 ||
    orchard.some(tree => Math.hypot(tree.x - x, tree.z - z) < 8) ||
    nearBarn(x, z)) continue;
  orchard.push({ x, z, scale: 0.7 + noise(i + 23) * 0.65, seed: i + 24 });
}
export const ORCHARD: readonly OrchardTree[] = orchard;

export type SceneryCollider = {
  name: string;
  x: number;
  z: number;
  bottom: number;
  top: number;
} & ({ shape: "circle"; radius: number } | { shape: "box"; halfX: number; halfZ: number });

export const SCENERY_COLLIDERS: readonly SceneryCollider[] = [
  ...ORCHARD.map(tree => ({
    name: "orchard trunk", shape: "circle" as const, x: tree.x, z: tree.z,
    radius: 0.26 * tree.scale, bottom: terrainHeight(tree.x, tree.z),
    top: terrainHeight(tree.x, tree.z) + 3.4 * tree.scale,
  })),
  ...BARNS.flatMap<SceneryCollider>(barn => [
    { name: "barn", shape: "box", ...barn, halfX: 7.25, halfZ: 6.25,
      bottom: terrainHeight(barn.x, barn.z), top: terrainHeight(barn.x, barn.z) + 11.4 },
    { name: "silo", shape: "circle", x: barn.x + 11, z: barn.z + 1, radius: 2.75,
      bottom: terrainHeight(barn.x, barn.z), top: terrainHeight(barn.x, barn.z) + 11.25 },
  ]),
  ...HAY_BALES.map(bale => ({
    name: "hay bale", shape: "circle" as const, ...bale, radius: 1.4,
    bottom: terrainHeight(bale.x, bale.z), top: terrainHeight(bale.x, bale.z) + 2.1,
  })),
  { name: "windmill", shape: "circle", ...WINDMILL, radius: 3.5,
    bottom: terrainHeight(WINDMILL.x, WINDMILL.z), top: terrainHeight(WINDMILL.x, WINDMILL.z) + 20 },
];

export const STUDY = {
  id: STUDY_VERSION,
  name: "Butterbell Pastures",
  laps: 3,
  pair: ["Clutch", "Bramble"],
  body: "Boiler Bug",
  wheels: "Picnic",
  glider: "Mapwing",
} as const;
