import {
  CHECKPOINTS, GAP_END, GAP_START, ROAD, ROAD_WIDTH, SCENERY_COLLIDERS, SHOULDER_WIDTH, TRACK_LENGTH,
  STUDY_VERSION, WATER_LEVEL, hasRail, isGap, isWater, projectRoad, sampleRoad, surfaceHeight, terrainHeight,
} from "./index";
import type { RoadPoint, RoadProjection, SceneryCollider } from "./index";
import type { CourseId } from "./catalog-types";
export { advanceRoad, isLayoutQuery, roadFeatures } from "../../content-layouts/query";

export const COURSES = [
  { id: "butterbell", name: "Butterbell Pastures", available: true, format: "laps", laps: 3 },
  { id: "afterglow", name: "Afterglow Airway", available: false, format: "laps", laps: 3 },
  { id: "escaluna", name: "Escaluna Galleria", available: false, format: "laps", laps: 3 },
  { id: "tiltglass", name: "Tiltglass Arcade", available: false, format: "laps", laps: 3 },
  { id: "copperwhistle", name: "Copperwhistle Canopy", available: false, format: "laps", laps: 3 },
  { id: "lastlight", name: "Lastlight Switchbacks", available: false, format: "sectors", laps: 1 },
] as const;
export const CUPS = [
  { id: "town", name: "Town Circuit", courses: ["butterbell", "escaluna", "tiltglass"] },
  { id: "horizon", name: "Horizon Circuit", courses: ["copperwhistle", "afterglow", "lastlight"] },
  { id: "tour", name: "Belltumble Tour", courses: ["butterbell", "escaluna", "tiltglass", "copperwhistle", "afterglow", "lastlight"] },
] as const;
export function availableSeries(courses: readonly CourseId[]): boolean {
  return courses.length > 0 && courses.every(id => COURSES.some(c => c.id === id && c.available));
}
export interface CourseQuery {
  id: CourseId;
  version: string;
  mirror: boolean;
  laps: number;
  format: "laps" | "sectors";
  roadWidth: number;
  shoulderWidth: number;
  waterLevel: number;
  gapStart: number;
  gapEnd: number;
  glides: readonly { start: number; end: number }[];
  sectors: readonly number[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number };
  hazards(time: number): readonly ActiveCourseHazard[];
  length: number;
  road: readonly RoadPoint[];
  checkpoints: readonly RoadPoint[];
  colliders: readonly SceneryCollider[];
  sampleRoad(u: number): RoadPoint;
  projectRoad(x: number, z: number): RoadProjection;
  surfaceHeight(x: number, z: number, road?: RoadProjection): number;
  terrainHeight(x: number, z: number): number;
  isWater(x: number, z: number): boolean;
  isGap(u: number): boolean;
  hasRail(u: number): boolean;
}
export interface ActiveCourseHazard {
  id: string;
  kind: "bumper" | "sweeper" | "gust";
  x: number; y: number; z: number;
  radius: number; height: number; strength: number;
}

export function checkpointSpan(course: CourseQuery, next: number) {
  const count = course.checkpoints.length;
  const previous = course.checkpoints[(next - 1 + count) % count];
  const target = course.checkpoints[next];
  const span = target.u > previous.u ? target.u - previous.u : 1 - previous.u + target.u;
  return { previous, target, span };
}

export function nearbyFlight(course: CourseQuery, u: number, approach = 0) {
  return course.glides.find(gap => u >= gap.start - approach && u < gap.end + 0.03);
}

const cache: [CourseQuery | undefined, CourseQuery | undefined] = [undefined, undefined];
/** Renderer and physics both reflect X (including normals/yaw), never reverse road progress. */
export function getCourse(id: CourseId = "butterbell", mirror = false): CourseQuery {
  if (id !== "butterbell") throw new RangeError("This course awaits the human-controller handling checkpoint; no substitute layout exists.");
  const key = mirror ? 1 : 0;
  if (cache[key]) return cache[key]!;
  const sign = mirror ? -1 : 1;
  const point = (p: RoadPoint): RoadPoint => ({ ...p, x: p.x * sign, dx: p.dx * sign });
  const query: CourseQuery = {
    id, version: STUDY_VERSION, mirror, laps: 3, format: "laps", roadWidth: ROAD_WIDTH, shoulderWidth: SHOULDER_WIDTH,
    waterLevel: WATER_LEVEL, gapStart: GAP_START, gapEnd: GAP_END, length: TRACK_LENGTH,
    glides: [{ start: GAP_START, end: GAP_END }], sectors: [],
    bounds: { minX: -240, maxX: 240, minZ: -245, maxZ: 245, minY: -12, maxY: 200 },
    hazards: () => [],
    road: ROAD.map(point), checkpoints: CHECKPOINTS.map(point),
    colliders: SCENERY_COLLIDERS.map(c => ({ ...c, x: c.x * sign })),
    sampleRoad: u => point(sampleRoad(u)),
    projectRoad: (x, z) => {
      const p = projectRoad(x * sign, z);
      return { ...p, x: p.x * sign, dx: p.dx * sign, lateral: p.lateral * sign };
    },
    surfaceHeight: (x, z) => surfaceHeight(x * sign, z),
    terrainHeight: (x, z) => terrainHeight(x * sign, z),
    isWater: (x, z) => isWater(x * sign, z), isGap, hasRail,
  };
  cache[key] = query;
  return query;
}
