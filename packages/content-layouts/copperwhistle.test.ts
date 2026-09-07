import { describe, expect, it, vi } from "vitest";
import { createLayoutQuery, samplePath } from "./query";
import { COPPERWHISTLE } from "./copperwhistle";
import { TILTGLASS } from "./tiltglass";
import { hazardPosition } from "./types";

describe("Copperwhistle Canopy authored circuit", () => {
  const course = createLayoutQuery(COPPERWHISTLE);
  it("is an independent, elevated, finite three-lap circuit with bounded road edges", () => {
    expect(course.laps).toBe(3);
    expect(course.format).toBe("laps");
    expect(COPPERWHISTLE.points).not.toEqual(TILTGLASS.points);
    expect(course.length).toBeGreaterThan(1050);
    expect(course.length).toBeLessThan(1750);
    expect(course.roadWidth).toBe(13);
    expect(course.sampleRoad(0)).toEqual(course.sampleRoad(1));
    expect(COPPERWHISTLE.sectors).toEqual([]);
    expect(COPPERWHISTLE.checkpoints[0]).toBe(0);
    for (let i = 1; i < COPPERWHISTLE.checkpoints.length; i++) {
      expect(COPPERWHISTLE.checkpoints[i]).toBeGreaterThan(COPPERWHISTLE.checkpoints[i - 1]);
      expect(COPPERWHISTLE.checkpoints[i]).toBeLessThan(1);
    }
    for (const p of course.road) {
      expect(Object.values(p).every(Number.isFinite)).toBe(true);
      expect(p.x - COPPERWHISTLE.shoulderWidth).toBeGreaterThan(COPPERWHISTLE.bounds.minX);
      expect(p.x + COPPERWHISTLE.shoulderWidth).toBeLessThan(COPPERWHISTLE.bounds.maxX);
      expect(p.z - COPPERWHISTLE.shoulderWidth).toBeGreaterThan(COPPERWHISTLE.bounds.minZ);
      expect(p.z + COPPERWHISTLE.shoulderWidth).toBeLessThan(COPPERWHISTLE.bounds.maxZ);
      expect(COPPERWHISTLE.groundHeight(p.x, p.z)).toBeLessThan(p.y - 60);
      expect(COPPERWHISTLE.isWater(p.x, p.z)).toBe(false);
    }
    expect(Math.max(...course.road.map(p => p.y)) - Math.min(...course.road.map(p => p.y))).toBeGreaterThan(18);
  });
  it("avoids XZ crossings, narrow neck overlaps and cusp-like turning radii", () => {
    const road = samplePath(COPPERWHISTLE.points, true, 600);
    const turn = (a: typeof road[number], b: typeof a, c: typeof a) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    let clearance = Infinity;
    for (let i = 0; i < road.length - 1; i++) {
      const a = road[i], b = road[i + 1];
      const bend = Math.acos(Math.min(1, Math.max(-1, a.dx * b.dx + a.dz * b.dz)));
      expect((b.distance - a.distance) / Math.max(1e-8, bend), `turn radius at ${a.u}`).toBeGreaterThan(12.5);
      for (let j = i + 2; j < road.length - 1; j++) {
        if (i === 0 && j === road.length - 2) continue;
        const c = road[j], d = road[j + 1];
        expect(turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0).toBe(false);
        const along = Math.abs(a.distance - c.distance);
        if (Math.min(along, course.length - along) > 45) clearance = Math.min(clearance, Math.hypot(a.x - c.x, a.z - c.z));
      }
    }
    expect(clearance).toBeGreaterThan(COPPERWHISTLE.shoulderWidth * 2 + 3);
  });
  it("aligns its leaf-draft crossing with a raised launch and broad downhill landing", () => {
    for (const gap of COPPERWHISTLE.glides) {
      const a = course.sampleRoad(gap.start), b = course.sampleRoad(gap.end);
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(20);
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(40);
      expect(a.y).toBeGreaterThan(b.y);
      expect(a.dx * b.dx + a.dz * b.dz).toBeGreaterThan(0.94);
      expect(Math.abs((b.x - a.x) * a.dz - (b.z - a.z) * a.dx)).toBeLessThan(3);
      expect(COPPERWHISTLE.checkpoints.some(u => u > gap.start && u < gap.end)).toBe(false);
      const mid = course.sampleRoad((gap.start + gap.end) / 2);
      expect(course.surfaceHeight(mid.x, mid.z)).toBe(-65);
      const supported = course.sampleRoad(gap.end + 0.002);
      expect(course.surfaceHeight(supported.x, supported.z)).toBeCloseTo(supported.y, 2);
      const gust = COPPERWHISTLE.hazards.find(h => h.kind === "gust")!;
      expect(Math.hypot(mid.x - gust.position[0], mid.z - gust.position[2])).toBeLessThan(gust.radius);
    }
  });
  it("offers a continuous shorter inner bough with no forbidden progress skips", () => {
    for (const cut of COPPERWHISTLE.shortcuts) {
      expect(cut.rough).toBe(true);
      expect(cut.halfWidth).toBe(3);
      expect(COPPERWHISTLE.checkpoints.some(u => u > cut.from && u < cut.to)).toBe(false);
      const route = course.routes.find(r => r.id === cut.id)!;
      const start = course.sampleRoad(cut.from), end = course.sampleRoad(cut.to);
      expect(route.points.at(-1)!.distance).toBeLessThan((end.distance - start.distance) * 0.9);
      for (const [endpoint, join] of [[route.points[0], start], [route.points.at(-1)!, end]]) {
        expect(Math.hypot(endpoint.x - join.x, endpoint.z - join.z)).toBeLessThan(0.05);
        expect(endpoint.y).toBeCloseTo(join.y, 2);
        expect(endpoint.dx * join.dx + endpoint.dz * join.dz).toBeGreaterThan(0.3);
      }
      for (const p of route.points.slice(35, 125)) {
        const projected = course.projectRoad(p.x, p.z);
        expect(projected.routeId).toBe(cut.id);
        expect(projected.u).toBeGreaterThan(cut.from);
        expect(projected.u).toBeLessThan(cut.to);
        expect(course.surfaceHeight(p.x, p.z)).toBeCloseTo(p.y, 2);
      }
    }
  });
  it("keeps solid tree trunks outside all routes and moving baskets/gusts coherent", () => {
    for (const tree of COPPERWHISTLE.obstacles) {
      const [x, y, z] = tree.position;
      const road = course.projectRoad(x, z);
      expect([x, y, z, tree.radius, tree.height].every(Number.isFinite)).toBe(true);
      expect(road.separation).toBeGreaterThan(road.shoulderWidth + tree.radius! + 2);
      expect(y).toBeLessThanOrEqual(COPPERWHISTLE.groundHeight(x, z));
      expect(y + tree.height).toBeGreaterThan(road.y);
      expect(course.colliders.find(collider => collider.name === tree.id)).toMatchObject({ bottom: y, top: y + tree.height });
      expect(x - tree.radius!).toBeGreaterThan(COPPERWHISTLE.bounds.minX);
      expect(x + tree.radius!).toBeLessThan(COPPERWHISTLE.bounds.maxX);
      expect(z - tree.radius!).toBeGreaterThan(COPPERWHISTLE.bounds.minZ);
      expect(z + tree.radius!).toBeLessThan(COPPERWHISTLE.bounds.maxZ);
    }
    for (const hazard of COPPERWHISTLE.hazards) {
      for (const time of [0, 1.5, 4, 20, 500]) {
        const p = hazardPosition(hazard, time);
        expect(p.every(Number.isFinite)).toBe(true);
        expect(p).toEqual(hazardPosition(hazard, time));
        expect(Math.hypot(p[0] - hazard.position[0], p[2] - hazard.position[2])).toBeLessThanOrEqual(hazard.motion!.amplitude + 1e-8);
        expect(course.hazards(time).find(h => h.id === hazard.id)).toMatchObject({ x: p[0], y: p[1], z: p[2] });
      }
      const a = hazardPosition(hazard, 1.8), b = hazardPosition(hazard, 1.8 + hazard.motion!.period);
      expect(a[0]).toBeCloseTo(b[0], 8);
      expect(a[2]).toBeCloseTo(b[2], 8);
    }
    for (const [start, end] of COPPERWHISTLE.rails) expect(start >= 0 && end <= 1 && end > start).toBe(true);
  });
});

it("builds finite instanced canopy scenery and advances hazards but not decorative leaves in reduced motion", async () => {
  const [{ NullEngine }, { Scene }, { Atelier }, { makeCopperwhistleWorld }] = await Promise.all([
    import("@babylonjs/core/Engines/nullEngine"), import("@babylonjs/core/scene"),
    import("../../apps/web/src/render/geometry"), import("../../apps/web/src/render/worlds/copperwhistle"),
  ]);
  vi.stubGlobal("OffscreenCanvas", class {
    constructor(public width: number, public height: number) {}
    getContext() {
      return { font: "", fillStyle: "", measureText: (text: string) => ({ width: text.length * 55 }), fillRect() {}, clearRect() {}, fillText() {}, drawImage() {} };
    }
  });
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const course = createLayoutQuery(COPPERWHISTLE);
    const art = new Atelier(scene), sculpt = art.sculpt.bind(art);
    const trunks = new Map<string, { bottom: number; top: number }>();
    vi.spyOn(art, "sculpt").mockImplementation((...args) => {
      const mesh = sculpt(...args);
      if (mesh.name === "old fluted canopy trunk" && mesh.parent) {
        mesh.computeWorldMatrix(true);
        const box = mesh.getBoundingInfo().boundingBox;
        trunks.set(mesh.parent.name, { bottom: box.minimumWorld.y, top: box.maximumWorld.y });
      }
      return mesh;
    });
    const world = makeCopperwhistleWorld(art, course);
    for (const [index, obstacle] of course.colliders.entries()) {
      expect(trunks.get(`copperwhistle tree ${index}`)?.bottom).toBeCloseTo(obstacle.bottom, 4);
      expect(trunks.get(`copperwhistle tree ${index}`)?.top).toBeCloseTo(obstacle.top, 4);
    }
    const meshes = scene.meshes.length, materials = scene.materials.length;
    const vertices = scene.meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0);
    expect(vertices).toBeLessThan(350_000);
    expect(meshes).toBeLessThan(650);
    expect(materials).toBeLessThan(45);
    expect(world.casters.every(mesh => !mesh.isDisposed())).toBe(true);
    for (const mesh of scene.meshes) {
      expect(mesh.getVerticesData("position")?.every(Number.isFinite), mesh.name).toBe(true);
      expect(mesh.getVerticesData("normal")?.every(Number.isFinite), mesh.name).toBe(true);
    }
    const log = scene.getMeshByName("curved hollow-log shell")!;
    const logNormals = log.getVerticesData("normal")!;
    const innerCrown = 9 * 17 + 8, outerCrown = innerCrown + 19 * 17;
    expect(logNormals[innerCrown * 3 + 1], "tunnel ceiling faces the roadway").toBeLessThan(-0.7);
    expect(logNormals[outerCrown * 3 + 1], "outer bark faces the sky").toBeGreaterThan(0.7);
    world.animate(0, true);
    const leaf = scene.getMeshByName("drifting leaf 0")!;
    const parkedLeaf = leaf.position.asArray();
    for (let step = 0; step < 120; step++) world.animate(step / 30, true);
    expect(leaf.position.asArray()).toEqual(parkedLeaf);
    for (const hazard of COPPERWHISTLE.hazards) {
      const name = hazard.kind === "gust" ? "leaf draft gameplay field" : `copperwhistle hazard ${hazard.id}`;
      expect(scene.getTransformNodeByName(name)!.position.asArray()).toEqual(hazardPosition(hazard, 119 / 30));
    }
    expect(scene.meshes.length).toBe(meshes);
    expect(scene.materials.length).toBe(materials);
    const cut = COPPERWHISTLE.shortcuts[0], gap = COPPERWHISTLE.glides[0];
    const cutLength = course.routes[1].points.at(-1)!.distance;
    const bypassed = course.sampleRoad(cut.to).distance - course.sampleRoad(cut.from).distance;
    const a = course.sampleRoad(gap.start), b = course.sampleRoad(gap.end);
    console.info(`Copperwhistle route: ${cutLength.toFixed(1)}m cut replaces ${bypassed.toFixed(1)}m; ${Math.hypot(b.x - a.x, b.z - a.z).toFixed(1)}m flight with ${(a.y - b.y).toFixed(1)}m descent`);
    console.info(`Copperwhistle: ${course.length.toFixed(1)}m, ${vertices} scene vertices including instances, ${meshes} meshes, ${materials} materials`);
  } finally {
    scene.dispose();
    engine.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
