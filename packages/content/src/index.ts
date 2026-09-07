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

export const STUDY_VERSION = "butterbell-study-1";
export const ROAD_WIDTH = 13;
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

export function terrainHeight(x: number, z: number): number {
  return 0.8 + Math.sin(x * 0.029) * 0.65 + Math.cos(z * 0.025) * 0.55;
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
  return { x, y: terrainHeight(x, z) + 0.25 + elevation, z };
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

export const STUDY = {
  id: STUDY_VERSION,
  name: "Butterbell Pastures",
  laps: 3,
  pair: ["Clutch", "Bramble"],
  body: "Boiler Bug",
  wheels: "Picnic",
  glider: "Mapwing",
} as const;
