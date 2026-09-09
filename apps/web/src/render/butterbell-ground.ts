import { ROAD, SHOULDER_WIDTH, bankWidth, isGap } from "@kartsick/content";

type GroundPoint = readonly [number, number];
interface GroundCut {
  points: GroundPoint[];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function cross(a: GroundPoint, b: GroundPoint, p: GroundPoint): number {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
}

function convexHull(points: GroundPoint[]): GroundPoint[] {
  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (source: GroundPoint[]) => {
    const result: GroundPoint[] = [];
    for (const point of source) {
      while (result.length > 1 && cross(result[result.length - 2], result[result.length - 1], point) <= 0) result.pop();
      result.push(point);
    }
    return result;
  };
  const lower = half(sorted), upper = half(sorted.reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const ROAD_CUTS: GroundCut[] = [];
for (let i = 0; i < ROAD.length - 1; i++) {
  const a = ROAD[i], b = ROAD[i + 1];
  if (isGap((a.u + b.u) / 2)) continue;
  const corners: GroundPoint[] = [];
  for (const p of [a, b]) for (const side of [-1, 1]) {
    const width = SHOULDER_WIDTH + bankWidth(p);
    corners.push([p.x + p.dz * side * width, p.z - p.dx * side * width]);
  }
  ROAD_CUTS.push({
    points: convexHull(corners), minX: Math.min(...corners.map(p => p[0])), maxX: Math.max(...corners.map(p => p[0])),
    minZ: Math.min(...corners.map(p => p[1])), maxZ: Math.max(...corners.map(p => p[1])),
  });
}

function subtract(polygon: GroundPoint[], cut: GroundPoint[]): GroundPoint[][] {
  const outside: GroundPoint[][] = [];
  let remaining = polygon;
  for (let edge = 0; edge < cut.length && remaining.length > 2; edge++) {
    const a = cut[edge], b = cut[(edge + 1) % cut.length];
    const inside: GroundPoint[] = [], strip: GroundPoint[] = [];
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i], q = remaining[(i + 1) % remaining.length];
      const dp = cross(a, b, p), dq = cross(a, b, q);
      const pInside = dp >= 0, qInside = dq >= 0;
      (pInside ? inside : strip).push(p);
      if (pInside !== qInside) {
        const t = dp / (dp - dq);
        const intersection: GroundPoint = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
        inside.push(intersection);
        strip.push(intersection);
      }
    }
    if (strip.length > 2) outside.push(strip);
    remaining = inside;
  }
  return outside;
}

/** Remove hidden raw terrain, not hills or the physical road/bank surfaces that replace it. */
export function butterbellExposedGround(triangle: GroundPoint[]): GroundPoint[][] {
  const minX = Math.min(...triangle.map(p => p[0])), maxX = Math.max(...triangle.map(p => p[0]));
  const minZ = Math.min(...triangle.map(p => p[1])), maxZ = Math.max(...triangle.map(p => p[1]));
  let pieces = [triangle];
  for (const cut of ROAD_CUTS) {
    if (cut.minX > maxX || cut.maxX < minX || cut.minZ > maxZ || cut.maxZ < minZ) continue;
    pieces = pieces.flatMap(piece => subtract(piece, cut.points));
    if (!pieces.length) break;
  }
  return pieces;
}
