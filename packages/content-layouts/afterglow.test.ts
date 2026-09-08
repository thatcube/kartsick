import { describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Atelier } from "../../apps/web/src/render/geometry";
import { makeAfterglowWorld } from "../../apps/web/src/render/worlds/afterglow";
import { AFTERGLOW } from "./afterglow";
import { ESCALUNA } from "./escaluna";
import { createLayoutQuery, samplePath } from "./query";
import { hazardPosition } from "./types";

describe("Afterglow Airway", () => {
  const course = createLayoutQuery(AFTERGLOW);

  it("has a distinct finite, bounded three-lap route with meaningful elevation and ordered gates", () => {
    expect(course.laps).toBe(3);
    expect(course.format).toBe("laps");
    expect(course.length).toBeGreaterThan(1000);
    expect(AFTERGLOW.points).not.toEqual(ESCALUNA.points);
    expect(course.length).not.toBeCloseTo(createLayoutQuery(ESCALUNA).length, -1);
    expect(Math.max(...course.road.map(p => p.y)) - Math.min(...course.road.map(p => p.y))).toBeGreaterThan(16);
    for (const route of course.routes) for (const p of route.points) {
      expect([p.x, p.y, p.z, p.dx, p.dz, p.distance, p.u].every(Number.isFinite)).toBe(true);
      expect(p.x - route.shoulderWidth).toBeGreaterThan(AFTERGLOW.bounds.minX);
      expect(p.x + route.shoulderWidth).toBeLessThan(AFTERGLOW.bounds.maxX);
      expect(p.z - route.shoulderWidth).toBeGreaterThan(AFTERGLOW.bounds.minZ);
      expect(p.z + route.shoulderWidth).toBeLessThan(AFTERGLOW.bounds.maxZ);
    }
    expect(AFTERGLOW.checkpoints[0]).toBe(0);
    AFTERGLOW.checkpoints.forEach((gate, i) => {
      expect(gate).toBeLessThan(1);
      if (i) expect(gate).toBeGreaterThan(AFTERGLOW.checkpoints[i - 1]);
      expect(course.isGap(gate)).toBe(false);
    });
  });

  it("has no XZ centerline crossings or abrupt cusps that defeat projection", () => {
    const road = samplePath(AFTERGLOW.points, true, 720);
    const side = (a: typeof road[number], b: typeof a, p: typeof a) =>
      (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    for (let i = 0; i < road.length - 1; i++) {
      const a = road[i], b = road[i + 1];
      expect(a.dx * b.dx + a.dz * b.dz).toBeGreaterThan(0.96);
      for (let j = i + 2; j < road.length - 1; j++) {
        if (i === 0 && j === road.length - 2) continue;
        const c = road[j], d = road[j + 1];
        const crosses = side(a, b, c) * side(a, b, d) < -1e-8 && side(c, d, a) * side(c, d, b) < -1e-8;
        if (crosses) throw new Error(`Airway intersects at ${a.u} and ${c.u}`);
        const along = Math.min(c.distance - a.distance, road.at(-1)!.distance - c.distance + a.distance);
        if (along > 50 && Math.hypot(c.x - a.x, c.z - a.z) < AFTERGLOW.shoulderWidth * 2) {
          throw new Error(`Airway's supported lanes overlap near ${a.u} and ${c.u}`);
        }
      }
    }
  });

  it("crosses a real, nearly straight departure gap from a raised approach to a supported landing", () => {
    for (const gap of AFTERGLOW.glides) {
      expect(gap.start).toBeGreaterThan(0);
      expect(gap.end).toBeGreaterThan(gap.start);
      expect(gap.end).toBeLessThan(1);
      const a = course.sampleRoad(gap.start), b = course.sampleRoad(gap.end);
      const middle = course.sampleRoad((gap.start + gap.end) / 2);
      const approach = course.sampleRoad(gap.start - 0.03);
      expect(b.distance - a.distance).toBeGreaterThan(20);
      expect(b.distance - a.distance).toBeLessThan(42);
      expect(a.dx * b.dx + a.dz * b.dz).toBeGreaterThan(0.985);
      expect(a.y).toBeGreaterThan(approach.y + 1);
      expect(course.surfaceHeight(middle.x, middle.z)).toBe(AFTERGLOW.groundHeight(middle.x, middle.z));
      expect(course.surfaceHeight(middle.x, middle.z)).toBeLessThan(middle.y - 25);
      const landing = course.sampleRoad(gap.end + 0.001);
      expect(course.surfaceHeight(landing.x, landing.z)).toBeCloseTo(landing.y, 2);
      expect(course.hasRail(gap.start - 0.035)).toBe(true);
      expect(course.hasRail(gap.end + 0.02)).toBe(true);
    }
  });

  it("offers a genuinely shorter low return without skipping mandatory gates", () => {
    const shortcut = AFTERGLOW.shortcuts[0];
    expect(shortcut.rough).toBe(true);
    expect(shortcut.halfWidth).toBeGreaterThanOrEqual(3);
    const path = samplePath(shortcut.points, false);
    const a = course.sampleRoad(shortcut.from), b = course.sampleRoad(shortcut.to);
    expect(path.at(-1)!.distance).toBeLessThan((b.distance - a.distance) * 0.8);
    expect(AFTERGLOW.checkpoints.some(u => u > shortcut.from && u < shortcut.to)).toBe(false);
    expect(Math.hypot(path[0].x - a.x, path[0].z - a.z)).toBeLessThan(0.05);
    expect(Math.hypot(path.at(-1)!.x - b.x, path.at(-1)!.z - b.z)).toBeLessThan(0.05);
    const middle = path[Math.floor(path.length / 2)];
    expect(course.projectRoad(middle.x, middle.z).routeId).toBe(shortcut.id);
  });

  it("uses the same explicit hazard motion and scenery dimensions as the authored world", () => {
    expect(new Set(AFTERGLOW.obstacles.map(o => o.id)).size).toBe(AFTERGLOW.obstacles.length);
    for (const time of [0, 1.5, 3.75, 7.5, 24]) {
      for (const [i, hazard] of AFTERGLOW.hazards.entries()) {
        const [x, y, z] = hazardPosition(hazard, time);
        expect(course.hazards(time)[i]).toMatchObject({ id: hazard.id, x, y, z, radius: hazard.radius, height: hazard.height });
      }
    }
    for (const [i, obstacle] of AFTERGLOW.obstacles.entries()) {
      const [x, bottom, z] = obstacle.position;
      expect(course.colliders[i]).toMatchObject({ name: obstacle.id, x, z, bottom, top: bottom + obstacle.height, shape: obstacle.shape });
      if (obstacle.shape === "circle") expect(course.colliders[i]).toMatchObject({ radius: obstacle.radius });
      else expect(course.colliders[i]).toMatchObject({ halfX: obstacle.halfX, halfZ: obstacle.halfZ });
      expect([x, bottom, z, obstacle.height].every(Number.isFinite)).toBe(true);
      expect(x).toBeGreaterThan(AFTERGLOW.bounds.minX);
      expect(x).toBeLessThan(AFTERGLOW.bounds.maxX);
      expect(z).toBeGreaterThan(AFTERGLOW.bounds.minZ);
      expect(z).toBeLessThan(AFTERGLOW.bounds.maxZ);
    }
    expect(AFTERGLOW.groundHeight(250, 210)).toBeGreaterThan(-7);
    expect(AFTERGLOW.isWater(250, 210)).toBe(false);
  });

  it("constructs bounded finite geometry and collision-matching models without freezing gameplay motion", () => {
    const engine = new NullEngine(), scene = new Scene(engine), art = new Atelier(scene);
    const canvas = { width: 1, height: 1, getContext: () => ({
      fillRect() {}, fillText() {}, measureText: (text: string) => ({ width: text.length * 50 }),
    }) };
    // NullEngine checks geometry only; this canvas stand-in does not validate rendered text or GPU cost.
    vi.spyOn(engine, "createCanvas").mockImplementation(() => ({ ...canvas }) as unknown as ReturnType<NullEngine["createCanvas"]>);
    const placed = new Map<string, number[]>();
    const place = art.place.bind(art);
    vi.spyOn(art, "place").mockImplementation((mesh, position, material, parent) => {
      const result = place(mesh, position, material, parent);
      if (AFTERGLOW.obstacles.some(obstacle => obstacle.id === mesh.name)) {
        result.computeWorldMatrix(true);
        const box = result.getBoundingInfo().boundingBox;
        placed.set(mesh.name, [...box.minimumWorld.asArray(), ...box.maximumWorld.asArray()]);
      }
      if (mesh.name === "airway diagonal deck brace" || mesh.name === "airway transverse bearing") {
        const vertices = mesh.getVerticesData("position")!, matrix = mesh.computeWorldMatrix(true);
        for (let i = 0; i < vertices.length; i += 3) {
          const point = Vector3.TransformCoordinates(new Vector3(vertices[i], vertices[i + 1], vertices[i + 2]), matrix);
          const road = course.projectRoad(point.x, point.z);
          if (road.separation < road.shoulderWidth) expect(point.y, mesh.name).toBeLessThan(road.y - 0.05);
        }
      }
      return result;
    });
    try {
      const world = makeAfterglowWorld(art, course);
      const vertices = scene.meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0);
      expect(vertices).toBeGreaterThan(30_000);
      expect(vertices).toBeLessThan(350_000);
      expect(scene.meshes.length).toBeLessThan(650);
      for (const mesh of scene.meshes) {
        expect(mesh.getVerticesData("position")?.every(Number.isFinite), mesh.name).toBe(true);
        expect(mesh.getVerticesData("normal")?.every(Number.isFinite), mesh.name).toBe(true);
        if (mesh.name.startsWith("scenery:")) {
          const bounds = mesh.getBoundingInfo().boundingBox;
          expect(bounds.maximumWorld.x - bounds.minimumWorld.x).toBeLessThan(225);
          expect(bounds.maximumWorld.z - bounds.minimumWorld.z).toBeLessThan(225);
        }
      }
      for (const obstacle of AFTERGLOW.obstacles) {
        const [x, y, z] = obstacle.position;
        const halfX = obstacle.shape === "circle" ? obstacle.radius! : obstacle.halfX!;
        const halfZ = obstacle.shape === "circle" ? obstacle.radius! : obstacle.halfZ!;
        const expected = [x - halfX, y, z - halfZ, x + halfX, y + obstacle.height, z + halfZ];
        placed.get(obstacle.id)!.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 3));
      }
      for (const time of [0, 2.5, 5.2]) {
        world.animate(time, true);
        for (const hazard of AFTERGLOW.hazards) {
          expect(scene.getTransformNodeByName(hazard.id)!.position.asArray()).toEqual(hazardPosition(hazard, time));
        }
      }
      expect(world.casters.every(mesh => !mesh.isDisposed())).toBe(true);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
