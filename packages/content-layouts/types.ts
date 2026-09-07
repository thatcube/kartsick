import type { CourseId } from "../content/src/catalog-types";

export type Point3 = readonly [x: number, y: number, z: number];
export interface CoursePalette {
  sky: string;
  road: string;
  verge: string;
  rail: string;
  accent: string;
  secondary: string;
  ground: string;
}
export interface CourseShortcut {
  id: string;
  name: string;
  from: number;
  to: number;
  points: readonly Point3[];
  halfWidth: number;
  rough: boolean;
}
export interface CourseHazard {
  id: string;
  kind: "bumper" | "sweeper" | "gust";
  /** Center of the collision cylinder, with full height below/above its midpoint. */
  position: Point3;
  radius: number;
  height: number;
  strength: number;
  motion?: { axis: "x" | "z"; amplitude: number; period: number; phase: number };
}
export interface CourseObstacle {
  id: string;
  shape: "circle" | "box";
  position: Point3;
  height: number;
  radius?: number;
  halfX?: number;
  halfZ?: number;
}
export interface CourseLayout {
  id: Exclude<CourseId, "butterbell">;
  name: string;
  version: string;
  format: "laps" | "sectors";
  /** Catmull-Rom control points. Open descent endpoints must not be repeated. */
  points: readonly Point3[];
  halfWidth: number;
  /** Outer supported half-width, normally halfWidth + 0.6. */
  shoulderWidth: number;
  checkpoints: readonly number[];
  sectors: readonly number[];
  glides: readonly { start: number; end: number }[];
  rails: readonly (readonly [number, number])[];
  shortcuts: readonly CourseShortcut[];
  hazards: readonly CourseHazard[];
  obstacles: readonly CourseObstacle[];
  palette: CoursePalette;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  groundHeight(x: number, z: number): number;
  waterLevel: number;
  isWater(x: number, z: number): boolean;
}

export function hazardPosition(hazard: CourseHazard, time: number): Point3 {
  const [x, y, z] = hazard.position;
  if (!hazard.motion) return hazard.position;
  const motion = hazard.motion;
  const offset = Math.sin(time * Math.PI * 2 / motion.period + motion.phase) * motion.amplitude;
  return [x + (motion.axis === "x" ? offset : 0), y, z + (motion.axis === "z" ? offset : 0)];
}
