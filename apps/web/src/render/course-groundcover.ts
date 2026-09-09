import { BARNS, ORCHARD } from "@kartsick/content";
import type { CourseId, CourseQuery, RoadPoint } from "@kartsick/content";
import { isLayoutQuery } from "../../../../packages/content-layouts/query";
import type { Atelier } from "./geometry";
import { makeGroundcover, plantNoise as noise } from "./groundcover";
import type { GroundPlant, PlantBed, PlantKind, PlantPalette } from "./groundcover";

export const PLANT_PALETTES: Record<CourseId, PlantPalette> = {
  butterbell: { leaf: "#7fa145", tip: "#b3c770", flower: "#fff1ce", secondaryFlower: "#edc955", soil: "#847353", rim: "#b99c73" },
  afterglow: { leaf: "#538f78", tip: "#94bca0", flower: "#edb3c9", secondaryFlower: "#f8d298", soil: "#656770", rim: "#ffd0ad" },
  escaluna: { leaf: "#579780", tip: "#acd0a1", flower: "#e1c5ed", secondaryFlower: "#f8de9a", soil: "#8f8383", rim: "#e6d4b9" },
  tiltglass: { leaf: "#469692", tip: "#8accc0", flower: "#f28d9b", secondaryFlower: "#f4d786", soil: "#4b5261", rim: "#c7a15d" },
  copperwhistle: { leaf: "#708452", tip: "#b9b776", flower: "#eed6a0", secondaryFlower: "#dca466", soil: "#736447", rim: "#a77a50" },
  lastlight: { leaf: "#71918c", tip: "#b0bca7", flower: "#dddae9", secondaryFlower: "#edc08b", soil: "#968075", rim: "#be8066" },
};

interface Segment { a: RoadPoint; b: RoadPoint; width: number }
function separation(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

/** All route corridors, including shortcuts and overlapping approaches, not just the nearest projection. */
export function groundcoverClearance(course: CourseQuery): (x: number, y: number, z: number, radius: number) => boolean {
  if (course.mirror) throw new RangeError("Groundcover is authored once in canonical coordinates and mirrored with its world.");
  const routes = isLayoutQuery(course) ? course.routes : [{ points: course.road, shoulderWidth: course.shoulderWidth }];
  const grid = new Map<string, Segment[]>();
  for (const route of routes) for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1], b = route.points[i], width = route.shoulderWidth + (course.id === "butterbell" ? 2.1 : .12);
    const segment = { a, b, width }, padding = width + 1.5;
    for (let gx = Math.floor((Math.min(a.x, b.x) - padding) / 32); gx <= Math.floor((Math.max(a.x, b.x) + padding) / 32); gx++) {
      for (let gz = Math.floor((Math.min(a.z, b.z) - padding) / 32); gz <= Math.floor((Math.max(a.z, b.z) + padding) / 32); gz++) {
        const key = `${gx}:${gz}`, cell = grid.get(key) ?? [];
        cell.push(segment); grid.set(key, cell);
      }
    }
  }
  const hazards = isLayoutQuery(course) ? course.layout.hazards.map(h => ({
    ax: h.position[0] - (h.motion?.axis === "x" ? h.motion.amplitude : 0),
    az: h.position[2] - (h.motion?.axis === "z" ? h.motion.amplitude : 0),
    bx: h.position[0] + (h.motion?.axis === "x" ? h.motion.amplitude : 0),
    bz: h.position[2] + (h.motion?.axis === "z" ? h.motion.amplitude : 0), radius: h.radius + 2,
  })) : course.hazards(0).map(h => ({ ax: h.x, az: h.z, bx: h.x, bz: h.z, radius: h.radius + 4.2 }));
  const flights = course.glides.flatMap(gap => [course.sampleRoad(gap.start), course.sampleRoad(gap.end)]);
  return (x, y, z, radius) => {
    if (![x, y, z, radius].every(Number.isFinite) || radius < 0 || radius > 1.5) {
      throw new RangeError("Groundcover requires finite positions and a footprint between 0 and 1.5 metres.");
    }
    if (x - radius < course.bounds.minX || x + radius > course.bounds.maxX ||
      z - radius < course.bounds.minZ || z + radius > course.bounds.maxZ) return false;
    const near = grid.get(`${Math.floor(x / 32)}:${Math.floor(z / 32)}`) ?? [];
    if (near.some(({ a, b, width }) => separation(x, z, a.x, a.z, b.x, b.z) < width + radius)) return false;
    if (flights.some(p => Math.hypot(p.x - x, p.z - z) < 21 + radius)) return false;
    if (hazards.some(h => separation(x, z, h.ax, h.az, h.bx, h.bz) < h.radius + radius)) return false;
    if (course.colliders.some(c => {
      if (y > c.top + .01 || y + 1 < c.bottom) return false;
      return c.shape === "circle" ? Math.hypot(x - c.x, z - c.z) < c.radius + radius + .15 :
        Math.abs(x - c.x) < c.halfX + radius + .15 && Math.abs(z - c.z) < c.halfZ + radius + .15;
    })) return false;
    return true;
  };
}

function variety(id: CourseId, seed: number, y: number): PlantKind {
  const n = noise(seed);
  if (id === "butterbell") return n < .34 ? "grass" : n < .57 ? "clover" : n < .73 ? "daisy" : n < .88 ? "buttercup" : "seed";
  if (id === "afterglow") return n < .7 ? "rosette" : "daisy";
  if (id === "escaluna") return n < .5 ? "rosette" : n < .8 ? "daisy" : "clover";
  if (id === "tiltglass") return n < .55 ? "felt" : "rosette";
  if (id === "copperwhistle") return n < .6 ? "fern" : n < .8 ? "clover" : "seed";
  return y > 280 ? (n < .65 ? "grass" : "rosette") : n < .4 ? "grass" : n < .7 ? "rosette" : n < .86 ? "seed" : "daisy";
}

export function planCourseGroundcover(course: CourseQuery): { plants: GroundPlant[]; beds: PlantBed[] } {
  const plants: GroundPlant[] = [], beds: PlantBed[] = [], clear = groundcoverClearance(course);
  const countryside = course.id === "butterbell" || course.id === "lastlight";
  const support = course.id === "butterbell" ? course.surfaceHeight : course.terrainHeight;
  const add = (x: number, z: number, seed: number, kind: PlantKind, u: number, y?: number, bed?: number) => {
    const scale = (kind === "fern" ? .8 : .8 + noise(seed + 613) * .4);
    const radius = (kind === "fern" ? .47 : kind === "clover" ? .18 : .29) * scale;
    const ground = y ?? support(x, z) + .075;
    if (!clear(x, ground, z, radius)) return;
    if (y === undefined) {
      if (course.isWater(x, z) || BARNS.some(b => course.id === "butterbell" &&
        Math.abs(x - b.x - 2.5) < 17 && Math.abs(z - b.z) < 17.5)) return;
      for (const [dx, dz] of [[radius, 0], [-radius, 0], [0, radius], [0, -radius]]) {
        if (course.isWater(x + dx, z + dz) || Math.abs(support(x + dx, z + dz) - (ground - .075)) > .12) return;
      }
    }
    plants.push({ x, y: ground, z, seed, kind, scale, radius, u,
      support: bed !== undefined ? "trough" : y !== undefined ? "planter" : "terrain",
      ...(bed === undefined ? {} : { bed }) });
  };
  const routes = isLayoutQuery(course) ? course.routes : [{ id: "main", points: course.road, shoulderWidth: course.shoulderWidth }];
  for (let routeIndex = 0; routeIndex < routes.length; routeIndex++) {
    const route = routes[routeIndex], spacing = course.id === "butterbell" ? 2.1 : course.id === "lastlight" ? 4.2 : 10;
    let nextDistance = 0;
    for (let index = 1; index < route.points.length - 1; index++) {
      const p = route.points[index];
      if (p.distance < nextDistance) continue;
      nextDistance = p.distance + spacing;
      if (route.id === "main" && course.isGap(p.u)) continue;
      for (const side of [-1, 1]) {
        const drift = Math.floor(p.distance / 17) + routeIndex * 761 + side * 91;
        if (noise(drift + 831) < (countryside ? .15 : .22)) continue;
        const seed = index * 97 + routeIndex * 1913 + side * 379;
        const mainKind = variety(course.id, drift + 416, p.y);
        const mountainLedge = course.id === "lastlight" && Math.floor(p.distance / 24) % 3 === 0;
        if ((!countryside || mountainLedge) && route.id === "main" && course.hasRail(p.u)) {
          const across = route.shoulderWidth + .92;
          const x = p.x + p.dz * side * across, z = p.z - p.dx * side * across;
          const next = route.points[index + 1], grade = (next.y - p.y) / (next.distance - p.distance);
          const bed: PlantBed = { x, y: p.y + .10, z, yaw: Math.atan2(p.dx, p.dz), grade, halfLength: 2.3, halfWidth: .62,
            kind: course.id === "copperwhistle" ? "bark" : mountainLedge ? "stone" : "trough" };
          const corners = [-1, 1].flatMap(a => [-1, 1].map(b =>
            [x + p.dz * a * bed.halfWidth + p.dx * b * bed.halfLength,
              z - p.dx * a * bed.halfWidth + p.dz * b * bed.halfLength]));
          if (!corners.every(([cx, cz]) => clear(cx, bed.y, cz, .10))) continue;
          const bedIndex = beds.length;
          beds.push(bed);
          for (let plant = 0; plant < 12; plant++) {
            const forward = -1.9 + plant / 11 * 3.8, lateral = (noise(seed + plant) - .5) * .3;
            add(x + p.dx * forward + p.dz * lateral, z + p.dz * forward - p.dx * lateral,
              seed + plant, plant % 4 ? mainKind : variety(course.id, seed + plant, p.y),
              p.u, bed.y + forward * grade + .025, bedIndex);
          }
        } else {
          for (let plant = 0; plant < (course.id === "butterbell" ? 20 : 10); plant++) {
            const salt = seed + plant * 7;
            const across = route.shoulderWidth + (course.id === "butterbell" ? 3.1 : 1.5)
              + noise(salt + 449) * (countryside ? 9 : 3.5);
            const forward = (noise(salt + 891) - .5) * 5;
            const x = p.x + p.dz * side * across + p.dx * forward, z = p.z - p.dx * side * across + p.dz * forward;
            if (Math.abs(p.y - support(x, z)) > 12) continue;
            add(x, z, salt, plant % 4 === 0 ? (countryside ? "grass" : "rosette") : mainKind, p.u);
          }
        }
      }
    }
  }
  if (course.id === "butterbell") {
    for (const tree of ORCHARD) for (let i = 0; i < 28; i++) {
      const seed = tree.seed * 117 + i + 20000, angle = noise(seed) * Math.PI * 2, radius = 1.6 + noise(seed + 73) * 2.6;
      const x = tree.x + Math.cos(angle) * radius, z = tree.z + Math.sin(angle) * radius;
      add(x, z, seed, i % 4 ? "clover" : "seed", course.projectRoad(x, z).u);
    }
    for (let i = 0; i < 240; i++) {
      const angle = i / 240 * Math.PI * 2, fringe = 1.035 + noise(i + 533) * .065;
      const x = 77 + Math.cos(angle) * 36 * fringe, z = -14 + Math.sin(angle) * 27 * fringe;
      add(x, z, i + 30000, i % 5 ? "reed" : "buttercup", course.projectRoad(x, z).u);
    }
  }
  if (isLayoutQuery(course)) for (const pot of course.layout.obstacles.filter(p => p.id.endsWith("planter"))) {
    if (pot.shape !== "circle" || pot.radius === undefined) continue;
    for (let i = 0; i < 42; i++) {
      const angle = i * 2.4, radius = (pot.radius - .5) * (.35 + noise(i + 72) * .6);
      const x = pot.position[0] + Math.cos(angle) * radius, z = pot.position[2] + Math.sin(angle) * radius;
      add(x, z, i + 40100, i % 3 ? "rosette" : "daisy", course.projectRoad(x, z).u, pot.position[1] + pot.height + .08);
    }
  }
  const limit = course.id === "butterbell" ? 5800 : course.id === "lastlight" ? 4800 : 3500;
  // Evenly thin the whole route if necessary; never spend the budget only on the opening sector.
  const selected = plants.length <= limit ? plants : plants.filter((_, i) =>
    Math.floor(i * limit / plants.length) !== Math.floor((i - 1) * limit / plants.length));
  return { plants: selected, beds };
}

export function makeCourseGroundcover(art: Atelier, course: CourseQuery): void {
  const { plants, beds } = planCourseGroundcover(course);
  const stats = makeGroundcover(art, course.id, plants, beds, PLANT_PALETTES[course.id]);
  art.scene.metadata = { ...art.scene.metadata, groundcover: { course: course.id, ...stats, beds: beds.length,
    varieties: [...new Set(plants.map(p => p.kind))] } };
}
