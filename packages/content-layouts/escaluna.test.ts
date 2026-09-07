import { describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Atelier } from "../../apps/web/src/render/geometry";
import { makeEscalunaWorld } from "../../apps/web/src/render/worlds/escaluna";
import { ESCALUNA } from "./escaluna";
import { createLayoutQuery, samplePath } from "./query";
import { hazardPosition } from "./types";

describe("Escaluna Galleria", () => {
  const course = createLayoutQuery(ESCALUNA);

  it("has a finite bounded three-lap shopping route, upper/lower promenades and ordered gates", () => {
    expect(course.laps).toBe(3);
    expect(course.format).toBe("laps");
    expect(course.length).toBeGreaterThan(1200);
    expect(course.road.filter(p => p.y < 2).length).toBeGreaterThan(100);
    expect(course.road.filter(p => p.y > 12).length).toBeGreaterThan(70);
    for (const route of course.routes) for (const p of route.points) {
      expect([p.x, p.y, p.z, p.dx, p.dz, p.distance, p.u].every(Number.isFinite)).toBe(true);
      expect(p.x - route.shoulderWidth).toBeGreaterThan(ESCALUNA.bounds.minX);
      expect(p.x + route.shoulderWidth).toBeLessThan(ESCALUNA.bounds.maxX);
      expect(p.z - route.shoulderWidth).toBeGreaterThan(ESCALUNA.bounds.minZ);
      expect(p.z + route.shoulderWidth).toBeLessThan(ESCALUNA.bounds.maxZ);
    }
    expect(ESCALUNA.checkpoints[0]).toBe(0);
    ESCALUNA.checkpoints.forEach((gate, i) => {
      expect(gate).toBeLessThan(1);
      if (i) expect(gate).toBeGreaterThan(ESCALUNA.checkpoints[i - 1]);
      expect(course.isGap(gate)).toBe(false);
    });
  });

  it("keeps all upper and lower lanes separate in XZ with smooth projection", () => {
    const road = samplePath(ESCALUNA.points, true, 720);
    const side = (a: typeof road[number], b: typeof a, p: typeof a) =>
      (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    for (let i = 0; i < road.length - 1; i++) {
      const a = road[i], b = road[i + 1];
      expect(a.dx * b.dx + a.dz * b.dz).toBeGreaterThan(0.96);
      for (let j = i + 2; j < road.length - 1; j++) {
        if (i === 0 && j === road.length - 2) continue;
        const c = road[j], d = road[j + 1];
        if (side(a, b, c) * side(a, b, d) < -1e-8 && side(c, d, a) * side(c, d, b) < -1e-8) {
          throw new Error(`Galleria intersects at ${a.u} and ${c.u}`);
        }
        const along = Math.min(c.distance - a.distance, road.at(-1)!.distance - c.distance + a.distance);
        if (along > 50 && Math.hypot(c.x - a.x, c.z - a.z) < ESCALUNA.shoulderWidth * 2) {
          throw new Error(`Galleria's upper and lower lanes overlap near ${a.u} and ${c.u}`);
        }
      }
    }
  });

  it("flies a straight skycourt crossing from a raised ramp to a real landing", () => {
    for (const gap of ESCALUNA.glides) {
      expect(gap.start).toBeGreaterThan(0);
      expect(gap.end).toBeGreaterThan(gap.start);
      expect(gap.end).toBeLessThan(1);
      const a = course.sampleRoad(gap.start), b = course.sampleRoad(gap.end);
      const middle = course.sampleRoad((gap.start + gap.end) / 2);
      expect(b.distance - a.distance).toBeGreaterThan(20);
      expect(b.distance - a.distance).toBeLessThan(35);
      expect(a.dx * b.dx + a.dz * b.dz).toBeGreaterThan(0.985);
      expect(a.y).toBeGreaterThan(course.sampleRoad(gap.start - 0.03).y + 1);
      expect(course.surfaceHeight(middle.x, middle.z)).toBe(0);
      const landing = course.sampleRoad(gap.end + 0.001);
      expect(course.surfaceHeight(landing.x, landing.z)).toBeCloseTo(landing.y, 2);
      expect(course.hasRail(gap.start - 0.025)).toBe(true);
      expect(course.hasRail(gap.end + 0.02)).toBe(true);
    }
  });

  it("validates a tight, rough loading-dock shortcut rather than an atrium progress exploit", () => {
    const shortcut = ESCALUNA.shortcuts[0];
    expect(shortcut.rough).toBe(true);
    expect(shortcut.halfWidth).toBe(3);
    const path = samplePath(shortcut.points, false);
    const a = course.sampleRoad(shortcut.from), b = course.sampleRoad(shortcut.to);
    expect(path.at(-1)!.distance).toBeLessThan((b.distance - a.distance) * 0.91);
    expect(ESCALUNA.checkpoints.some(u => u > shortcut.from && u < shortcut.to)).toBe(false);
    expect(Math.hypot(path[0].x - a.x, path[0].z - a.z)).toBeLessThan(0.05);
    expect(Math.hypot(path.at(-1)!.x - b.x, path.at(-1)!.z - b.z)).toBeLessThan(0.05);
    const middle = path[Math.floor(path.length / 2)];
    expect(course.projectRoad(middle.x, middle.z).routeId).toBe(shortcut.id);
    expect(path.every(p => p.z < -85)).toBe(true);
  });

  it("keeps visible hazard motion, solid scenery and decorative basin water consistent", () => {
    expect(new Set(ESCALUNA.obstacles.map(o => o.id)).size).toBe(ESCALUNA.obstacles.length);
    for (const time of [0, 1, 2.25, 4.5, 9, 30]) {
      for (const [i, hazard] of ESCALUNA.hazards.entries()) {
        const [x, y, z] = hazardPosition(hazard, time);
        expect(course.hazards(time)[i]).toMatchObject({ id: hazard.id, x, y, z, radius: hazard.radius, height: hazard.height });
      }
    }
    for (const [i, obstacle] of ESCALUNA.obstacles.entries()) {
      const [x, bottom, z] = obstacle.position;
      expect(course.colliders[i]).toMatchObject({ name: obstacle.id, x, z, bottom, top: bottom + obstacle.height, shape: obstacle.shape });
      if (obstacle.shape === "circle") expect(course.colliders[i]).toMatchObject({ radius: obstacle.radius });
      else expect(course.colliders[i]).toMatchObject({ halfX: obstacle.halfX, halfZ: obstacle.halfZ });
      expect([x, bottom, z, obstacle.height].every(Number.isFinite)).toBe(true);
      expect(x).toBeGreaterThan(ESCALUNA.bounds.minX);
      expect(x).toBeLessThan(ESCALUNA.bounds.maxX);
      expect(z).toBeGreaterThan(ESCALUNA.bounds.minZ);
      expect(z).toBeLessThan(ESCALUNA.bounds.maxZ);
    }
    expect(ESCALUNA.groundHeight(-76, 26)).toBe(0);
    expect(ESCALUNA.isWater(-76, 26)).toBe(false);
  });

  it("constructs curved finite geometry with matching obstacle bounds and reduced-motion-safe hazards", () => {
    const engine = new NullEngine(), scene = new Scene(engine), art = new Atelier(scene);
    const canvas = { width: 1, height: 1, getContext: () => ({
      fillRect() {}, fillText() {}, measureText: (text: string) => ({ width: text.length * 50 }),
    }) };
    // Deliberately not a browser, text-rendering or native GPU performance test.
    vi.spyOn(engine, "createCanvas").mockImplementation(() => ({ ...canvas }) as unknown as ReturnType<NullEngine["createCanvas"]>);
    const placed = new Map<string, number[]>();
    const place = art.place.bind(art);
    vi.spyOn(art, "place").mockImplementation((mesh, position, material, parent) => {
      const result = place(mesh, position, material, parent);
      if (ESCALUNA.obstacles.some(obstacle => obstacle.id === mesh.name)) {
        result.computeWorldMatrix(true);
        const box = result.getBoundingInfo().boundingBox;
        placed.set(mesh.name, [...box.minimumWorld.asArray(), ...box.maximumWorld.asArray()]);
      }
      return result;
    });
    try {
      const world = makeEscalunaWorld(art, course);
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
      for (const obstacle of ESCALUNA.obstacles) {
        const [x, y, z] = obstacle.position;
        const halfX = obstacle.shape === "circle" ? obstacle.radius! : obstacle.halfX!;
        const halfZ = obstacle.shape === "circle" ? obstacle.radius! : obstacle.halfZ!;
        const expected = [x - halfX, y, z - halfZ, x + halfX, y + obstacle.height, z + halfZ];
        placed.get(obstacle.id)!.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 3));
      }
      for (const time of [0, 2.25, 4.5]) {
        world.animate(time, true);
        for (const hazard of ESCALUNA.hazards) {
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
