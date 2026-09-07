import type { ActiveCourseHazard, CourseQuery } from "../content/src/course";
import type { RoadPoint, RoadProjection, SceneryCollider } from "../content/src/index";
import type { CourseLayout, CourseShortcut, Point3 } from "./types";
import { hazardPosition } from "./types";

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const wrap = (value: number) => (value % 1 + 1) % 1;
const cubic = (a: number, b: number, c: number, d: number, t: number) =>
  0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);

export function sampleCurve(points: readonly Point3[], closed: boolean, u: number): Point3 {
  if (points.length < 2 || !Number.isFinite(u)) throw new RangeError("A curve needs finite progress and at least two control points.");
  const at = (index: number) => points[closed ? (index % points.length + points.length) % points.length : clamp(index, 0, points.length - 1)];
  const t = (closed ? wrap(u) : clamp(u, 0, 1)) * (closed ? points.length : points.length - 1);
  const index = Math.min(Math.floor(t), closed ? points.length - 1 : points.length - 2);
  const local = t - index;
  const a = at(index - 1), b = at(index), c = at(index + 1), d = at(index + 2);
  return [cubic(a[0], b[0], c[0], d[0], local), cubic(a[1], b[1], c[1], d[1], local), cubic(a[2], b[2], c[2], d[2], local)];
}

export function samplePath(points: readonly Point3[], closed: boolean, count?: number): RoadPoint[] {
  if (points.length < (closed ? 4 : 2) || points.some(point => point.length !== 3 || point.some(value => !Number.isFinite(value) || Math.abs(value) > 10000))) {
    throw new RangeError("Invalid course control points.");
  }
  let approximateLength = 0;
  const segmentCount = closed ? points.length : points.length - 1;
  for (let i = 0; i < segmentCount; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const distance = Math.hypot(a[0] - b[0], a[2] - b[2]);
    if (distance < 0.1) throw new RangeError("Course control points must not repeat or form vertical-only segments.");
    approximateLength += distance;
  }
  const samples = count ?? Math.min(2400, Math.max(480, Math.ceil(approximateLength / 2)));
  if (!Number.isInteger(samples) || samples < 2 || samples > 10000) throw new RangeError("Invalid curve sampling resolution.");
  const result: RoadPoint[] = [];
  let distance = 0;
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const [x, y, z] = sampleCurve(points, closed, u);
    const before = sampleCurve(points, closed, u - 0.0001);
    const after = sampleCurve(points, closed, u + 0.0001);
    const magnitude = Math.hypot(after[0] - before[0], after[2] - before[2]);
    if (magnitude < 1e-8) throw new RangeError("The course contains a stationary cusp.");
    const previous = result.at(-1);
    if (previous) distance += Math.hypot(x - previous.x, z - previous.z);
    result.push({ x, y, z, u, distance, dx: (after[0] - before[0]) / magnitude, dz: (after[2] - before[2]) / magnitude });
  }
  return result;
}

export interface LayoutProjection extends RoadProjection {
  routeId: string;
  halfWidth: number;
  shoulderWidth: number;
  rough: boolean;
}
export interface LayoutRoute {
  id: string;
  points: readonly RoadPoint[];
  halfWidth: number;
  shoulderWidth: number;
  rough: boolean;
}
export interface LayoutQuery extends CourseQuery {
  version: string;
  layout: CourseLayout;
  routes: readonly LayoutRoute[];
  sectors: readonly number[];
  projectRoad(x: number, z: number): LayoutProjection;
}
export function isLayoutProjection(road: RoadProjection): road is LayoutProjection {
  return "routeId" in road && typeof road.routeId === "string" && "halfWidth" in road && typeof road.halfWidth === "number" &&
    "shoulderWidth" in road && typeof road.shoulderWidth === "number" && "rough" in road && typeof road.rough === "boolean";
}
export function isLayoutQuery(course: CourseQuery): course is LayoutQuery {
  return "layout" in course && "routes" in course && Array.isArray(course.routes);
}
export function roadFeatures(course: CourseQuery, road: RoadProjection) {
  const rich = isLayoutProjection(road);
  const main = !rich || road.routeId === "main";
  return {
    halfWidth: rich ? road.halfWidth : course.roadWidth / 2,
    shoulderWidth: rich ? road.shoulderWidth : course.shoulderWidth,
    rough: rich && road.rough,
    gap: main && course.isGap(road.u),
    rail: main && course.hasRail(road.u),
  };
}

/** Follow the selected road in metres; joining a shortcut never jumps to its parallel main road. */
export function advanceRoad(course: CourseQuery, from: RoadProjection, metres: number): RoadPoint {
  if (!isLayoutQuery(course)) return course.sampleRoad(from.u + metres / course.length);
  const selected = isLayoutProjection(from) ? from.routeId : "main";
  let route = course.routes.find(route => route.id === selected);
  if (!route) throw new RangeError("The moving effect has an unknown road route.");
  let distance = from.distance + metres;
  if (route.id !== "main" && (distance < 0 || distance > route.points.at(-1)!.distance)) {
    const endpoint = distance < 0 ? route.points[0] : route.points.at(-1)!;
    distance = course.sampleRoad(endpoint.u).distance + distance - endpoint.distance;
    route = course.routes[0];
  }
  const length = route.points.at(-1)!.distance;
  distance = route.id === "main" && course.format === "laps" ? (distance % length + length) % length : clamp(distance, 0, length);
  let low = 0, high = route.points.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >>> 1;
    if (route.points[middle].distance <= distance) low = middle;
    else high = middle;
  }
  const a = route.points[low], b = route.points[high];
  const t = (distance - a.distance) / (b.distance - a.distance);
  return {
    x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t), u: mix(a.u, b.u, t),
    dx: mix(a.dx, b.dx, t), dz: mix(a.dz, b.dz, t), distance,
  };
}

function routeFor(shortcut: CourseShortcut, sign: number): LayoutRoute {
  if (!(shortcut.from >= 0 && shortcut.from < shortcut.to && shortcut.to <= 1) || !Number.isFinite(shortcut.halfWidth) || shortcut.halfWidth <= 0) throw new RangeError("Invalid shortcut range or width.");
  const points = samplePath(shortcut.points, false, 160).map(point => ({
    ...point, x: point.x * sign, dx: point.dx * sign, u: mix(shortcut.from, shortcut.to, point.u),
  }));
  return { id: shortcut.id, points, halfWidth: shortcut.halfWidth, shoulderWidth: shortcut.halfWidth + 0.6, rough: shortcut.rough };
}

export function createLayoutQuery(layout: CourseLayout, mirror = false): LayoutQuery {
  const ordered = (values: readonly number[], end: number) => values.every((value, index) => Number.isFinite(value) && value >= 0 && value <= end && (index === 0 || value > values[index - 1]));
  if (!ordered(layout.checkpoints, 1) || layout.checkpoints[0] !== 0 || layout.checkpoints.length < 4 ||
    !ordered(layout.sectors, 1) || !Number.isFinite(layout.halfWidth) || !Number.isFinite(layout.shoulderWidth) ||
    layout.halfWidth <= 0 || layout.shoulderWidth < layout.halfWidth || !Number.isFinite(layout.waterLevel) ||
    (layout.format === "sectors" && (layout.sectors.length !== 2 || layout.sectors[0] <= 0 || layout.sectors[1] >= 1))) {
    throw new RangeError(`Invalid dimensions or progress gates for ${layout.id}.`);
  }
  if (layout.sectors.some(sector => !layout.checkpoints.includes(sector))) throw new RangeError("Sector boundaries must also be ordered checkpoints.");
  if (Object.values(layout.palette).some(color => !/^#[a-f0-9]{6}$/i.test(color))) throw new RangeError("Course palette colors must be six-digit hex values.");
  for (const gap of layout.glides) if (!(gap.start > 0 && gap.start < gap.end && gap.end < 1)) throw new RangeError("Invalid flight-zone range.");
  for (const [start, end] of layout.rails) if (!(start >= 0 && end > start && end <= 1)) throw new RangeError("Invalid safety-rail range.");
  for (const hazard of layout.hazards) {
    if (hazard.position.some(value => !Number.isFinite(value)) || !(hazard.radius > 0 && hazard.height > 0 && hazard.strength >= 0) ||
      ![hazard.radius, hazard.height, hazard.strength].every(Number.isFinite) ||
      (hazard.motion && (!(hazard.motion.period > 0 && hazard.motion.amplitude >= 0) ||
        ![hazard.motion.period, hazard.motion.amplitude, hazard.motion.phase].every(Number.isFinite)))) throw new RangeError(`Invalid gameplay hazard ${hazard.id}.`);
  }
  const closed = layout.format === "laps";
  if (closed ? layout.checkpoints.at(-1) === 1 : layout.checkpoints.at(-1) !== 1) throw new RangeError("Only open routes must include the final endpoint checkpoint.");
  const sign = mirror ? -1 : 1;
  const road = samplePath(layout.points, closed).map(point => ({ ...point, x: point.x * sign, dx: point.dx * sign }));
  const length = road.at(-1)!.distance;
  const routes: LayoutRoute[] = [
    { id: "main", points: road, halfWidth: layout.halfWidth, shoulderWidth: layout.shoulderWidth, rough: false },
    ...layout.shortcuts.map(shortcut => routeFor(shortcut, sign)),
  ];
  if (new Set(routes.map(route => route.id)).size !== routes.length) throw new RangeError("Course route IDs must be distinct.");
  const sampleRoad = (value: number): RoadPoint => {
    const u = closed ? wrap(value) : clamp(value, 0, 1);
    const index = u * (road.length - 1);
    const low = Math.min(Math.floor(index), road.length - 2);
    const a = road[low], b = road[low + 1], t = index - low;
    return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t), dx: mix(a.dx, b.dx, t), dz: mix(a.dz, b.dz, t), u, distance: mix(a.distance, b.distance, t) };
  };
  for (const shortcut of layout.shortcuts) {
    if (layout.checkpoints.some(gate => gate > shortcut.from && gate < shortcut.to)) throw new RangeError(`A required checkpoint blocks shortcut ${shortcut.id}.`);
    const start = sampleRoad(shortcut.from), end = sampleRoad(shortcut.to);
    const first = shortcut.points[0], last = shortcut.points.at(-1)!;
    if (Math.hypot(first[0] * sign - start.x, first[2] - start.z) > layout.halfWidth + shortcut.halfWidth ||
      Math.hypot(last[0] * sign - end.x, last[2] - end.z) > layout.halfWidth + shortcut.halfWidth) throw new RangeError(`Shortcut ${shortcut.id} does not meet its main-road endpoints.`);
  }
  const segments = routes.flatMap(route => route.points.slice(0, -1).map((a, i) => ({ a, b: route.points[i + 1], route })));
  const cellSize = 24;
  const grid = new Map<string, number[]>();
  segments.forEach((segment, index) => {
    for (let x = Math.floor(Math.min(segment.a.x, segment.b.x) / cellSize); x <= Math.floor(Math.max(segment.a.x, segment.b.x) / cellSize); x++) {
      for (let z = Math.floor(Math.min(segment.a.z, segment.b.z) / cellSize); z <= Math.floor(Math.max(segment.a.z, segment.b.z) / cellSize); z++) {
        const key = `${x}:${z}`;
        const bucket = grid.get(key) ?? [];
        bucket.push(index);
        grid.set(key, bucket);
      }
    }
  });
  const visited = new Uint32Array(segments.length);
  let visit = 0;
  const projectRoad = (x: number, z: number): LayoutProjection => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError("Road projection requires finite coordinates.");
    visit = (visit + 1) >>> 0;
    if (visit === 0) { visited.fill(0); visit = 1; }
    let best = Infinity;
    let result: LayoutProjection | null = null;
    const consider = (index: number) => {
      if (visited[index] === visit) return;
      visited[index] = visit;
      const { a, b, route } = segments[index];
      const dx = b.x - a.x, dz = b.z - a.z, squaredLength = dx * dx + dz * dz;
      if (squaredLength < 1e-10) return;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / squaredLength, 0, 1);
      const px = mix(a.x, b.x, t), pz = mix(a.z, b.z, t);
      const squared = (x - px) ** 2 + (z - pz) ** 2;
      if (squared >= best) return;
      best = squared;
      const magnitude = Math.sqrt(squaredLength);
      result = {
        x: px, y: mix(a.y, b.y, t), z: pz, dx: dx / magnitude, dz: dz / magnitude,
        u: mix(a.u, b.u, t), distance: mix(a.distance, b.distance, t), separation: Math.sqrt(squared),
        lateral: ((x - px) * dz - (z - pz) * dx) / magnitude,
        routeId: route.id, halfWidth: route.halfWidth, shoulderWidth: route.shoulderWidth, rough: route.rough,
      };
    };
    const column = Math.floor(x / cellSize), row = Math.floor(z / cellSize);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const index of grid.get(`${column + dx}:${row + dz}`) ?? []) consider(index);
    if (best > cellSize ** 2) for (let index = 0; index < segments.length; index++) consider(index);
    if (!result) throw new Error("The course has no usable road segments.");
    return result;
  };
  const ground = (x: number, z: number) => layout.groundHeight(x * sign, z);
  const minY = Math.min(layout.waterLevel, ...road.map(point => Math.min(point.y, ground(point.x, point.z)))) - 24;
  const maxY = Math.max(...road.map(point => point.y)) + 90;
  let hazardTime = NaN;
  let activeHazards: ActiveCourseHazard[] = [];
  const hazards = (time: number) => {
    if (time !== hazardTime) {
      activeHazards = layout.hazards.map(hazard => {
        const [x, y, z] = hazardPosition(hazard, time);
        return { id: hazard.id, kind: hazard.kind, x: x * sign, y, z, radius: hazard.radius, height: hazard.height, strength: hazard.strength };
      });
      hazardTime = time;
    }
    return activeHazards;
  };
  const isGap = (u: number) => layout.glides.some(gap => u >= gap.start && u < gap.end);
  const colliders = layout.obstacles.map<SceneryCollider>(obstacle => {
    if (obstacle.position.some(value => !Number.isFinite(value)) || !Number.isFinite(obstacle.height) || obstacle.height <= 0) throw new RangeError(`Invalid scenery obstacle ${obstacle.id}.`);
    const base = { name: obstacle.id, x: obstacle.position[0] * sign, z: obstacle.position[2], bottom: obstacle.position[1], top: obstacle.position[1] + obstacle.height };
    if (obstacle.shape === "circle") {
      if (!(obstacle.radius && obstacle.radius > 0)) throw new RangeError("A circular obstacle needs a radius.");
      return { ...base, shape: "circle", radius: obstacle.radius };
    }
    if (!(obstacle.halfX && obstacle.halfZ && obstacle.halfX > 0 && obstacle.halfZ > 0)) throw new RangeError("A box obstacle needs positive half-extents.");
    return { ...base, shape: "box", halfX: obstacle.halfX, halfZ: obstacle.halfZ };
  });
  return {
    id: layout.id, version: layout.version, layout, mirror, format: layout.format, laps: closed ? 3 : 1,
    roadWidth: layout.halfWidth * 2, shoulderWidth: layout.shoulderWidth, waterLevel: layout.waterLevel,
    gapStart: layout.glides[0]?.start ?? -1, gapEnd: layout.glides[0]?.end ?? -1,
    glides: layout.glides,
    bounds: {
      minX: mirror ? -layout.bounds.maxX : layout.bounds.minX, maxX: mirror ? -layout.bounds.minX : layout.bounds.maxX,
      minZ: layout.bounds.minZ, maxZ: layout.bounds.maxZ, minY, maxY,
    },
    hazards,
    length, road, routes, sectors: layout.sectors, checkpoints: layout.checkpoints.map(sampleRoad), colliders,
    sampleRoad, projectRoad, terrainHeight: ground, isGap,
    surfaceHeight: (x, z, supplied) => {
      const projection = supplied && isLayoutProjection(supplied) ? supplied : projectRoad(x, z);
      if ((projection.routeId === "main" && isGap(projection.u)) || projection.separation > projection.shoulderWidth) return ground(x, z);
      return projection.y;
    },
    isWater: (x, z) => layout.isWater(x * sign, z),
    hasRail: u => layout.rails.some(([start, end]) => u >= start && u <= end),
  };
}
