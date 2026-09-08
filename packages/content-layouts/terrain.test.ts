import { describe, expect, it } from "vitest";
import { AFTERGLOW } from "./afterglow";
import { ESCALUNA } from "./escaluna";
import { TILTGLASS } from "./tiltglass";
import { COPPERWHISTLE } from "./copperwhistle";
import { LASTLIGHT } from "./lastlight";
import { createLayoutQuery } from "./query";
import { latticeTerrain, routeCutTerrain } from "./terrain";

describe("authored landforms", () => {
  it("uses the rendered triangle diagonal even inside partial boundary tiles", () => {
    const bounds = { minX: -17, maxX: 54, minZ: -23, maxZ: 57 };
    const raw = (x: number, z: number) => x * z / 100 + x * x / 200;
    const height = latticeTerrain(bounds, raw);
    const x = 47, z = 41, dx = 7 / 8, dz = 16 / 8;
    for (const [tx, tz] of [[0.2, 0.3], [0.8, 0.7], [0.5, 0.5]]) {
      const a = raw(x, z), b = raw(x + dx, z), c = raw(x, z + dz), d = raw(x + dx, z + dz);
      const expected = tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz
        : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
      expect(height(x + tx * dx, z + tz * dz)).toBeCloseTo(expected, 9);
    }
    expect(height(1000, 1000)).toBe(height(bounds.maxX, bounds.maxZ));
  });

  it("protects the shortcut as well as the main route and retains mountains beyond the cut", () => {
    const height = routeCutTerrain({
      points: [[-90, 20, -90], [-90, 20, 90]], closed: false,
      shortcuts: [[[30, 8, -90], [30, 8, 90]]],
      bounds: { minX: -192, maxX: 192, minZ: -128, maxZ: 128 },
      height: () => 100, clearance: 4,
    });
    expect(height(-90, 0)).toBe(16);
    expect(height(30, 0)).toBe(4);
    expect(height(180, 0)).toBe(100);
  });

  it.each([AFTERGLOW, ESCALUNA, TILTGLASS, COPPERWHISTLE, LASTLIGHT])("$id leaves the complete road and all flight landings uncovered", layout => {
    const course = createLayoutQuery(layout);
    for (const route of course.routes) for (const p of route.points) {
      for (const side of [-1, 0, 1]) {
        const x = p.x + p.dz * side * route.shoulderWidth;
        const z = p.z - p.dx * side * route.shoulderWidth;
        expect(layout.groundHeight(x, z), `${layout.id}/${route.id} ${p.u}`).toBeLessThan(p.y - 0.2);
      }
    }
    const heights = [];
    for (let x = layout.bounds.minX; x <= layout.bounds.maxX; x += 16)
      for (let z = layout.bounds.minZ; z <= layout.bounds.maxZ; z += 16) heights.push(layout.groundHeight(x, z));
    expect(heights.every(Number.isFinite)).toBe(true);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(5);
  });

  it("encloses the descent with high ridges, opens its viaduct valley, and preserves driver sightlines", () => {
    const course = createLayoutQuery(LASTLIGHT);
    for (const z of [150, 450, 750, 1000, 1250]) {
      expect(LASTLIGHT.groundHeight(-520, z) - LASTLIGHT.groundHeight(0, z)).toBeGreaterThan(60);
    }
    const bridge = course.sampleRoad(25 / 48);
    expect(bridge.y - LASTLIGHT.groundHeight(bridge.x, bridge.z)).toBeGreaterThan(30);
    for (let index = 0; index < course.road.length - 1; index += 15) {
      const eye = course.road[index];
      const target = course.road.find(point => point.distance >= eye.distance + 35);
      if (!target) continue;
      for (let step = 1; step < 20; step++) {
        const t = step / 20;
        const x = eye.x + (target.x - eye.x) * t, z = eye.z + (target.z - eye.z) * t;
        const y = eye.y + 3 + (target.y + 1 - eye.y - 3) * t;
        expect(LASTLIGHT.groundHeight(x, z), `mountain blocks 35 m view at ${eye.u}`).toBeLessThan(y);
      }
    }
  });

  it("keeps driveable mountain ridges inside the serialized vertical bounds", () => {
    const course = createLayoutQuery(LASTLIGHT);
    const ridge = LASTLIGHT.groundHeight(-520, 100);
    expect(ridge).toBeGreaterThan(460);
    expect(course.bounds.maxY).toBeGreaterThan(ridge + 1);
  });
});
