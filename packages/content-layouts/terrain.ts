import { samplePath } from "./query";
import type { CourseLayout, Point3 } from "./types";

export const smoothTerrain = (value: number): number => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export const mound = (x: number, z: number, cx: number, cz: number, rx: number, rz: number): number =>
  Math.exp(-(((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2));

/** Matches the surface renderer's 64 m tiles, including partial boundary tiles. */
export function latticeTerrain(bounds: CourseLayout["bounds"], height: (x: number, z: number) => number) {
  const vertices = new Map<string, number>();
  const vertex = (x: number, z: number) => {
    const key = `${x}:${z}`;
    let y = vertices.get(key);
    if (y === undefined) {
      y = height(x, z);
      vertices.set(key, y);
    }
    return y;
  };
  const cell = (value: number, min: number, max: number) => {
    const bounded = Math.max(min, Math.min(max, value));
    const tile = min + Math.min(Math.floor((bounded - min) / 64), Math.ceil((max - min) / 64) - 1) * 64;
    const step = Math.min(64, max - tile) / 8;
    const low = tile + Math.min(7, Math.floor((bounded - tile) / step)) * step;
    return { low, high: low + step, t: (bounded - low) / step };
  };
  return (x: number, z: number): number => {
    const a = cell(x, bounds.minX, bounds.maxX), b = cell(z, bounds.minZ, bounds.maxZ);
    const nw = vertex(a.low, b.low), ne = vertex(a.high, b.low), sw = vertex(a.low, b.high);
    if (a.t + b.t <= 1) return nw + (ne - nw) * a.t + (sw - nw) * b.t;
    const se = vertex(a.high, b.high);
    return se + (sw - se) * (1 - a.t) + (ne - se) * (1 - b.t);
  };
}

/** Earth cuts protect the whole road/shortcut corridor, not just the nearest control point. */
export function routeCutTerrain(options: {
  points: readonly Point3[];
  closed: boolean;
  shortcuts?: readonly (readonly Point3[])[];
  bounds: CourseLayout["bounds"];
  height: (x: number, z: number) => number;
  clearance: number;
  cutWidth?: number;
}) {
  const samples = [
    ...samplePath(options.points, options.closed),
    ...(options.shortcuts ?? []).flatMap(points => samplePath(points, false)),
  ];
  const width = options.cutWidth ?? 28;
  const cells = new Map<string, typeof samples>();
  for (const point of samples) {
    const key = `${Math.floor(point.x / 32)}:${Math.floor(point.z / 32)}`;
    const bucket = cells.get(key) ?? [];
    bucket.push(point);
    cells.set(key, bucket);
  }
  return latticeTerrain(options.bounds, (x, z) => {
    const raw = options.height(x, z);
    let y = raw;
    const range = Math.ceil((width + 24) / 32);
    const column = Math.floor(x / 32), row = Math.floor(z / 32);
    for (let dx = -range; dx <= range; dx++) for (let dz = -range; dz <= range; dz++) {
      for (const point of cells.get(`${column + dx}:${row + dz}`) ?? []) {
        const separation = Math.hypot(point.x - x, point.z - z);
        if (separation >= width + 24) continue;
        const blend = smoothTerrain((separation - width) / 24);
        const cut = point.y - options.clearance;
        y = Math.min(y, cut + Math.max(0, raw - cut) * blend);
      }
    }
    return y;
  });
}
