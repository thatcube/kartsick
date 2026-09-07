import { describe, expect, it } from "vitest";
import { advanceRoad, createLayoutQuery, roadFeatures, sampleCurve } from "./query";
import type { CourseLayout, Point3 } from "./types";
import { AFTERGLOW } from "./afterglow";

const points: readonly Point3[] = [[-50, 2, -50], [50, 2, -50], [50, 2, 50], [-50, 2, 50]];
function fixture(): CourseLayout {
  return {
    id: "afterglow", name: "Test route", version: "test-1", format: "laps", points,
    halfWidth: 6.5, shoulderWidth: 7.1, checkpoints: [0, 0.1, 0.45, 0.7], sectors: [],
    glides: [{ start: 0.55, end: 0.65 }], rails: [[0.3, 0.5]], shortcuts: [], hazards: [], obstacles: [],
    palette: { sky: "#aabbcc", road: "#445566", verge: "#778899", rail: "#ddeeff", accent: "#aabbcc", secondary: "#445566", ground: "#778899" },
    bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    groundHeight: () => -2, waterLevel: -1, isWater: () => false,
  };
}
describe("generalized course geometry", () => {
  it.each([false, true])("keeps the airport deck above its lower shortcut without snapping through it (mirror %s)", mirror => {
    const course = createLayoutQuery(AFTERGLOW, mirror);
    const main = createLayoutQuery({ ...AFTERGLOW, shortcuts: [] }, mirror);
    const point = course.routes[1].points.find(point => {
      const deck = main.projectRoad(point.x, point.z);
      return deck.separation < deck.shoulderWidth && deck.y > point.y + 1;
    })!;
    expect(point).toBeDefined();
    const deck = main.projectRoad(point.x, point.z);
    expect(course.projectRoad(point.x, point.z).routeId).toBe("low-return");
    const upper = course.projectRoad(point.x, point.z, deck.y + .8);
    expect(upper.routeId).toBe("main");
    expect(course.surfaceHeight(point.x, point.z, upper)).toBeCloseTo(deck.y);
    const lower = course.projectRoad(point.x, point.z, point.y + .3);
    expect(lower.routeId).toBe("low-return");
    expect(course.surfaceHeight(point.x, point.z, lower)).toBeCloseTo(point.y);
    expect(() => course.projectRoad(point.x, point.z, NaN)).toThrow("finite");
  });
  it("keeps closed progress wrapped and open descent endpoints distinct", () => {
    const loop = createLayoutQuery(fixture());
    expect(loop.sampleRoad(0)).toEqual(loop.sampleRoad(1));
    const descent = createLayoutQuery({
      ...fixture(), id: "lastlight", format: "sectors",
      points: [[0, 200, 0], [30, 160, 100], [-30, 120, 200], [20, 60, 300], [0, 0, 400]],
      checkpoints: [0, 0.2, 0.4, 0.6, 0.8, 1], sectors: [0.4, 0.8], shortcuts: [],
    });
    expect(descent.laps).toBe(1);
    expect(descent.sampleRoad(1)).toMatchObject({ x: 0, y: 0, z: 400, u: 1 });
    expect(descent.sampleRoad(2)).toEqual(descent.sampleRoad(1));
    expect(descent.sampleRoad(0).y).toBe(200);
  });
  it("reflects geometry, tangent, lateral projection and scenery together", () => {
    const layout = fixture();
    layout.obstacles = [{ id: "post", shape: "circle", position: [80, 0, 25], radius: 2, height: 5 }];
    const normal = createLayoutQuery(layout);
    const mirror = createLayoutQuery(layout, true);
    const a = normal.projectRoad(40, -54), b = mirror.projectRoad(-40, -54);
    expect(b.x).toBeCloseTo(-a.x);
    expect(b.dx).toBeCloseTo(-a.dx);
    expect(b.lateral).toBeCloseTo(-a.lateral);
    expect(b.u).toBeCloseTo(a.u);
    expect(mirror.colliders[0]).toMatchObject({ x: -80, z: 25 });
  });
  it("projects legal shortcuts into main-route progress and uses their actual width and surface", () => {
    const layout = fixture();
    const first = sampleCurve(points, true, 0.15), last = sampleCurve(points, true, 0.35);
    const middle: Point3 = [(first[0] + last[0]) / 2, 2, (first[2] + last[2]) / 2];
    layout.shortcuts = [{ id: "cut", name: "Cut", from: 0.15, to: 0.35, points: [first, middle, last], halfWidth: 2, rough: true }];
    const course = createLayoutQuery(layout);
    const projected = course.projectRoad(middle[0], middle[2]);
    expect(projected.routeId).toBe("cut");
    expect(projected.u).toBeCloseTo(0.25);
    expect(roadFeatures(course, projected)).toMatchObject({ halfWidth: 2, rough: true, gap: false, rail: false });
    expect(course.surfaceHeight(middle[0], middle[2])).toBe(2);
    const ahead = advanceRoad(course, projected, 2);
    expect(Math.hypot(ahead.x - projected.x, ahead.z - projected.z)).toBeCloseTo(2);
    expect(course.projectRoad(ahead.x, ahead.z).routeId).toBe("cut");
    expect(() => createLayoutQuery({ ...layout, checkpoints: [0, 0.25, 0.5, 0.75] })).toThrow("blocks shortcut");
  });
  it("uses ground under gaps and off a supported deck instead of inventing invisible support", () => {
    const course = createLayoutQuery(fixture());
    const gap = course.sampleRoad(0.6), supported = course.sampleRoad(0.3);
    expect(course.surfaceHeight(gap.x, gap.z)).toBe(-2);
    expect(course.surfaceHeight(supported.x, supported.z)).toBe(2);
    expect(course.surfaceHeight(300, 300)).toBe(-2);
    expect(() => course.projectRoad(NaN, 0)).toThrow("finite");
  });
  it("matches a global nearest-segment search, including queries outside indexed cells", () => {
    const course = createLayoutQuery(fixture());
    for (let i = 0; i < 150; i++) {
      const x = Math.sin(i * 18.12) * 180, z = Math.cos(i * 13.73) * 180;
      let nearest = Infinity;
      for (let j = 0; j < course.road.length - 1; j++) {
        const a = course.road[j], b = course.road[j + 1], dx = b.x - a.x, dz = b.z - a.z;
        const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
        nearest = Math.min(nearest, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
      }
      expect(course.projectRoad(x, z).separation).toBeCloseTo(nearest, 7);
    }
  });
  it("rejects undefined support widths and unsafe animation periods", () => {
    expect(() => createLayoutQuery({ ...fixture(), shoulderWidth: NaN })).toThrow("dimensions");
    expect(() => createLayoutQuery({ ...fixture(), hazards: [{
      id: "broken", kind: "sweeper", position: [0, 0, 0], radius: 2, height: 1, strength: 3,
      motion: { axis: "x", amplitude: 10, period: 0, phase: 0 },
    }] })).toThrow("hazard");
  });
});
