import { describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Atelier } from "../../apps/web/src/render/geometry";
import { makeLastlightWorld } from "../../apps/web/src/render/worlds/lastlight";
import { LASTLIGHT } from "./lastlight";
import { createLayoutQuery, samplePath } from "./query";
import { hazardPosition } from "./types";

describe("Lastlight Switchbacks", () => {
  const course = createLayoutQuery(LASTLIGHT);

  it("is a long, one-way descent with a single distinct finish", () => {
    expect(LASTLIGHT.format).toBe("sectors");
    expect(course.laps).toBe(1);
    expect(LASTLIGHT.points[0]).not.toEqual(LASTLIGHT.points.at(-1));
    expect(course.sampleRoad(-1)).toEqual(course.sampleRoad(0));
    expect(course.sampleRoad(2)).toEqual(course.sampleRoad(1));
    expect(course.sampleRoad(0).y - course.sampleRoad(1).y).toBeGreaterThan(300);
    expect(course.length).toBeGreaterThan(3800);
    expect(course.length).toBeLessThan(5600);
    expect(LASTLIGHT.halfWidth).toBeGreaterThanOrEqual(6);
    expect(LASTLIGHT.halfWidth).toBeLessThanOrEqual(7);
  });

  it("scores three chapters through two interior gates and ordered run-spanning checkpoints", () => {
    expect(LASTLIGHT.sectors).toHaveLength(2);
    expect(LASTLIGHT.checkpoints[0]).toBe(0);
    expect(LASTLIGHT.checkpoints.at(-1)).toBe(1);
    for (const sector of LASTLIGHT.sectors) {
      expect(sector).toBeGreaterThan(0);
      expect(sector).toBeLessThan(1);
      expect(LASTLIGHT.checkpoints).toContain(sector);
    }
    LASTLIGHT.checkpoints.slice(1).forEach((gate, i) => expect(gate).toBeGreaterThan(LASTLIGHT.checkpoints[i]));
    const distances = [0, ...LASTLIGHT.sectors, 1].map(u => course.sampleRoad(u).distance);
    distances.slice(1).forEach((distance, i) => expect(distance - distances[i]).toBeGreaterThan(800));
  });

  it("stays finite and bounded, with no XZ crossing or repeated mountain segment", () => {
    const { minX, maxX, minZ, maxZ } = LASTLIGHT.bounds;
    for (const [i, point] of course.road.entries()) {
      expect([point.x, point.y, point.z, point.dx, point.dz].every(Number.isFinite)).toBe(true);
      expect(point.x).toBeGreaterThan(minX + LASTLIGHT.shoulderWidth);
      expect(point.x).toBeLessThan(maxX - LASTLIGHT.shoulderWidth);
      expect(point.z).toBeGreaterThan(minZ);
      expect(point.z).toBeLessThan(maxZ);
      if (i) {
        const previous = course.road[i - 1];
        expect(point.z).toBeGreaterThan(previous.z);
        expect(Math.abs(point.y - previous.y) / (point.distance - previous.distance)).toBeLessThan(0.5);
      }
    }
  });

  it("has a straight, raised glider crossing with a lower, supported landing", () => {
    expect(LASTLIGHT.glides).toHaveLength(1);
    const gap = LASTLIGHT.glides[0];
    const start = course.sampleRoad(gap.start), end = course.sampleRoad(gap.end);
    expect(gap.start).toBeGreaterThan(LASTLIGHT.sectors[1]);
    expect(gap.end).toBeLessThan(1);
    expect(end.distance - start.distance).toBeGreaterThan(45);
    expect(end.distance - start.distance).toBeLessThan(70);
    expect(start.y - end.y).toBeGreaterThan(12);
    expect(start.dx * end.dx + start.dz * end.dz).toBeGreaterThan(0.99);
    for (let i = 1; i < 10; i++) {
      const point = course.sampleRoad(gap.start + (gap.end - gap.start) * i / 10);
      expect(point.x).toBeCloseTo(0);
      expect(course.surfaceHeight(point.x, point.z)).toBeLessThan(point.y - 15);
    }
    const landing = course.sampleRoad(gap.end + 0.003);
    expect(course.surfaceHeight(landing.x, landing.z)).toBeCloseTo(landing.y);
  });

  it("offers a shorter rough ledge without bypassing required checkpoints or sectors", () => {
    expect(LASTLIGHT.shortcuts.length).toBeGreaterThan(0);
    for (const shortcut of LASTLIGHT.shortcuts) {
      const start = course.sampleRoad(shortcut.from), end = course.sampleRoad(shortcut.to);
      const path = samplePath(shortcut.points, false);
      expect(shortcut.rough).toBe(true);
      expect(shortcut.halfWidth).toBeLessThan(LASTLIGHT.halfWidth);
      expect(path.at(-1)!.distance).toBeLessThan((end.distance - start.distance) * 0.7);
      expect(Math.hypot(path[0].x - start.x, path[0].z - start.z)).toBeLessThan(0.1);
      expect(Math.hypot(path.at(-1)!.x - end.x, path.at(-1)!.z - end.z)).toBeLessThan(0.1);
      expect(LASTLIGHT.checkpoints.some(u => u > shortcut.from && u < shortcut.to)).toBe(false);
      const middle = path[Math.floor(path.length / 2)];
      expect(course.projectRoad(middle.x, middle.z).routeId).toBe(shortcut.id);
    }
  });

  it("keeps visible terrain support below the ribbon and water in the actual lake basin", () => {
    for (const point of course.road) {
      expect(LASTLIGHT.groundHeight(point.x, point.z)).toBeLessThan(point.y);
      expect(LASTLIGHT.isWater(point.x, point.z)).toBe(false);
      for (const side of [-1, 1]) {
        const x = point.x + point.dz * side * LASTLIGHT.shoulderWidth;
        const z = point.z - point.dx * side * LASTLIGHT.shoulderWidth;
        expect(LASTLIGHT.groundHeight(x, z)).toBeLessThan(point.y);
      }
    }
    expect(LASTLIGHT.groundHeight(0, 0)).toBeGreaterThan(LASTLIGHT.groundHeight(0, 1835) + 300);
    expect(LASTLIGHT.isWater(447, 1695)).toBe(true);
    expect(LASTLIGHT.groundHeight(447, 1695)).toBeLessThan(LASTLIGHT.waterLevel);
    expect(LASTLIGHT.isWater(900, 1695)).toBe(false);
  });
});

it("builds bounded scenery batches with the exact gameplay hazards, including reduced motion", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const canvas = vi.spyOn(engine, "createCanvas").mockImplementation(() => ({
    width: 1, height: 1,
    getContext: () => ({ fillRect() {}, fillText() {}, measureText: (text: string) => ({ width: text.length * 50 }) }),
  } as unknown as ReturnType<NullEngine["createCanvas"]>));
  try {
    const course = createLayoutQuery(LASTLIGHT);
    const world = makeLastlightWorld(new Atelier(scene), course);
    const meshes = scene.meshes.filter((mesh): mesh is Mesh => mesh instanceof Mesh);
    const expandedVertices = meshes.reduce((total, mesh) => total + mesh.getTotalVertices() * Math.max(1, mesh.thinInstanceCount), 0);
    expect(expandedVertices).toBeLessThan(600_000);
    for (const mesh of meshes) {
      expect(mesh.getVerticesData(VertexBuffer.PositionKind)?.every(Number.isFinite), mesh.name).toBe(true);
      if (mesh.thinInstanceCount && /lastlight (fir|larch|scrub|chalet|lamp):/.test(mesh.name)) {
        const bounds = mesh.getBoundingInfo().boundingBox;
        expect(bounds.maximumWorld.x - bounds.minimumWorld.x, mesh.name).toBeLessThan(140);
        expect(bounds.maximumWorld.z - bounds.minimumWorld.z, mesh.name).toBeLessThan(140);
      }
    }
    for (const time of [0, 2.25, 9, 42]) {
      world.animate(time, true);
      for (const hazard of LASTLIGHT.hazards) {
        const node = scene.getTransformNodeByName(hazard.id)!;
        expect(node.position.asArray()).toEqual(hazardPosition(hazard, time));
      }
    }
    expect(world.casters.every(mesh => !mesh.isDisposed())).toBe(true);
    expect(world.casters.some(mesh => mesh.name.includes("main road"))).toBe(true);
    expect(meshes.filter(mesh => mesh.name.startsWith("lastlight terrain "))).toHaveLength(648);
    const chapterDistances = [0, ...LASTLIGHT.sectors, 1].map(u => course.sampleRoad(u).distance);
    console.info("Lastlight geometry:", {
      length: Math.round(course.length),
      sectors: chapterDistances.slice(1).map((distance, index) => Math.round(distance - chapterDistances[index])),
      expandedVertices, meshes: meshes.length, casters: world.casters.length,
    });
  } finally {
    canvas.mockRestore();
    scene.dispose();
    engine.dispose();
  }
});

it("binds every scenery bucket's own matrices and leaves outcrop clearance beyond both shoulders", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const canvas = vi.spyOn(engine, "createCanvas").mockImplementation(() => ({
    width: 1, height: 1,
    getContext: () => ({ fillRect() {}, fillText() {}, measureText: (text: string) => ({ width: text.length * 50 }) }),
  } as unknown as ReturnType<NullEngine["createCanvas"]>));
  try {
    const course = createLayoutQuery(LASTLIGHT);
    makeLastlightWorld(new Atelier(scene), course);
    const meshes = scene.meshes.filter((mesh): mesh is Mesh => mesh instanceof Mesh && mesh.thinInstanceCount > 0);
    for (const mesh of meshes) {
      const matrices = mesh.thinInstanceGetWorldMatrices();
      const expected = new Float32Array(matrices.flatMap(matrix => Array.from(matrix.asArray())));
      for (let column = 0; column < 4; column++) {
        const attribute = mesh.getVertexBuffer(`world${column}`)!;
        expect(attribute.getData(), `${mesh.name} GPU world${column}`).toEqual(expected);
        expect(attribute.getBuffer(), mesh.name).not.toBeNull();
      }
      if (!/^lastlight (alpine rock|rock):/.test(mesh.name)) continue;
      const vertices = mesh.getVerticesData(VertexBuffer.PositionKind)!;
      let radius = 0;
      for (let i = 0; i < vertices.length; i += 3) radius = Math.max(radius, Math.hypot(vertices[i], vertices[i + 2]));
      for (const matrix of matrices) {
        const scale = new Vector3(), center = new Vector3();
        matrix.decompose(scale, undefined, center);
        const edge = course.projectRoad(center.x, center.z).separation - radius * Math.max(scale.x, scale.z);
        expect(edge, mesh.name).toBeGreaterThanOrEqual(LASTLIGHT.shoulderWidth + 5.99);
      }
    }
  } finally {
    canvas.mockRestore();
    scene.dispose();
    engine.dispose();
  }
});

it("keeps the captured takeoff camera's near right-hand view clear of world geometry", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const canvas = vi.spyOn(engine, "createCanvas").mockImplementation(() => ({
    width: 1, height: 1,
    getContext: () => ({ fillRect() {}, fillText() {}, measureText: (text: string) => ({ width: text.length * 50 }) }),
  } as unknown as ReturnType<NullEngine["createCanvas"]>));
  try {
    makeLastlightWorld(new Atelier(scene), createLayoutQuery(LASTLIGHT));
    for (const mesh of scene.meshes) if (mesh instanceof Mesh) {
      mesh.computeWorldMatrix(true);
      mesh.thinInstanceEnablePicking = true;
    }
    // Capture: kart (-0.067, 70.62, 1433.70), heading -0.00225, normal-class chase FOV.
    for (const trail of [-1, 0, 1]) {
      const eye = new Vector3(-0.05, 74.2, 1425 + trail);
      const forward = new Vector3(-0.08, 72.04, 1440.1).subtract(eye).normalize();
      const right = Vector3.Cross(Vector3.Up(), forward).normalize();
      const up = Vector3.Cross(forward, right).normalize();
      for (const [x, y] of [[0.55, 0.1], [0.7, 0.25], [0.9, 0.15], [0.75, 0.5], [0.95, 0.8]]) {
        const direction = forward.add(right.scale((x * 2 - 1) * Math.tan(0.943 / 2) * 1.6))
          .add(up.scale((1 - y * 2) * Math.tan(0.943 / 2))).normalize();
        const picked = scene.pickWithRay(new Ray(eye, direction, 30), mesh => mesh.isVisible && mesh.isEnabled());
        expect(picked?.hit, picked?.pickedMesh?.name).toBe(false);
      }
    }
  } finally {
    canvas.mockRestore();
    scene.dispose();
    engine.dispose();
  }
});
