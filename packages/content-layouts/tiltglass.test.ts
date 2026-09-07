import { describe, expect, it, vi } from "vitest";
import { createLayoutQuery, samplePath } from "./query";
import { TILTGLASS } from "./tiltglass";
import { COPPERWHISTLE } from "./copperwhistle";
import { hazardPosition } from "./types";

describe("Tiltglass Arcade authored circuit", () => {
  const course = createLayoutQuery(TILTGLASS);
  it("has finite, bounded, independent three-lap geometry and ordered progress", () => {
    expect(course.laps).toBe(3);
    expect(course.format).toBe("laps");
    expect(TILTGLASS.points).not.toEqual(COPPERWHISTLE.points);
    expect(course.length).toBeGreaterThan(1000);
    expect(course.length).toBeLessThan(1700);
    expect(course.roadWidth).toBeGreaterThanOrEqual(12);
    expect(course.roadWidth).toBeLessThanOrEqual(14);
    expect(TILTGLASS.sectors).toEqual([]);
    expect(course.sampleRoad(0)).toEqual(course.sampleRoad(1));
    expect(TILTGLASS.checkpoints[0]).toBe(0);
    for (let i = 1; i < TILTGLASS.checkpoints.length; i++) {
      expect(TILTGLASS.checkpoints[i]).toBeGreaterThan(TILTGLASS.checkpoints[i - 1]);
      expect(TILTGLASS.checkpoints[i]).toBeLessThan(1);
    }
    for (const point of course.road) {
      expect(Object.values(point).every(Number.isFinite)).toBe(true);
      expect(point.x - TILTGLASS.shoulderWidth).toBeGreaterThan(TILTGLASS.bounds.minX);
      expect(point.x + TILTGLASS.shoulderWidth).toBeLessThan(TILTGLASS.bounds.maxX);
      expect(point.z - TILTGLASS.shoulderWidth).toBeGreaterThan(TILTGLASS.bounds.minZ);
      expect(point.z + TILTGLASS.shoulderWidth).toBeLessThan(TILTGLASS.bounds.maxZ);
      expect(TILTGLASS.groundHeight(point.x, point.z)).toBeLessThan(point.y - 4);
      expect(TILTGLASS.isWater(point.x, point.z)).toBe(false);
    }
    expect(Math.max(...course.road.map(p => p.y)) - Math.min(...course.road.map(p => p.y))).toBeGreaterThan(15);
  });
  it("never crosses its own XZ centerline or folds a road edge around a cusp", () => {
    const road = samplePath(TILTGLASS.points, true, 600);
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
    expect(clearance).toBeGreaterThan(TILTGLASS.shoulderWidth * 2 + 3);
  });
  it("launches along a raised, nearly straight, downhill crossing with no checkpoint in the air", () => {
    for (const gap of TILTGLASS.glides) {
      const launch = course.sampleRoad(gap.start), land = course.sampleRoad(gap.end);
      const distance = Math.hypot(land.x - launch.x, land.z - launch.z);
      expect(distance).toBeGreaterThan(20);
      expect(distance).toBeLessThan(40);
      expect(launch.y).toBeGreaterThan(land.y);
      expect(launch.dx * land.dx + launch.dz * land.dz).toBeGreaterThan(0.94);
      const along = ((land.x - launch.x) * launch.dx + (land.z - launch.z) * launch.dz);
      const lateral = Math.abs((land.x - launch.x) * launch.dz - (land.z - launch.z) * launch.dx);
      expect(along).toBeGreaterThan(20);
      expect(lateral).toBeLessThan(3);
      expect(TILTGLASS.checkpoints.some(u => u > gap.start && u < gap.end)).toBe(false);
      const mid = course.sampleRoad((gap.start + gap.end) / 2);
      expect(course.isGap(mid.u)).toBe(true);
      expect(course.surfaceHeight(mid.x, mid.z)).toBe(TILTGLASS.groundHeight(mid.x, mid.z));
      const supported = course.sampleRoad(gap.end + 0.002);
      expect(course.surfaceHeight(supported.x, supported.z)).toBeCloseTo(supported.y, 2);
    }
  });
  it("supports an actually shorter rough service lane without bypassing a required gate", () => {
    for (const shortcut of TILTGLASS.shortcuts) {
      const route = course.routes.find(route => route.id === shortcut.id)!;
      const start = course.sampleRoad(shortcut.from), end = course.sampleRoad(shortcut.to);
      expect(shortcut.halfWidth).toBeGreaterThanOrEqual(3);
      expect(shortcut.halfWidth).toBeLessThan(TILTGLASS.halfWidth);
      expect(shortcut.rough).toBe(true);
      expect(route.points.at(-1)!.distance).toBeLessThan((end.distance - start.distance) * 0.92);
      expect(TILTGLASS.checkpoints.some(u => u > shortcut.from && u < shortcut.to)).toBe(false);
      for (const [endpoint, join] of [[route.points[0], start], [route.points.at(-1)!, end]]) {
        expect(Math.hypot(endpoint.x - join.x, endpoint.z - join.z)).toBeLessThan(0.05);
        expect(endpoint.y).toBeCloseTo(join.y, 2);
        expect(endpoint.dx * join.dx + endpoint.dz * join.dz).toBeGreaterThan(0.3);
      }
      for (const point of route.points.slice(35, 125)) {
        const projected = course.projectRoad(point.x, point.z);
        expect(projected.routeId).toBe(shortcut.id);
        expect(projected.u).toBeGreaterThan(shortcut.from);
        expect(projected.u).toBeLessThan(shortcut.to);
      }
    }
  });
  it("keeps scenery cylinders clear of every driveable route and hazard motion bounded", () => {
    expect(new Set(TILTGLASS.hazards.map(h => h.id)).size).toBe(TILTGLASS.hazards.length);
    for (const obstacle of TILTGLASS.obstacles) {
      const [x, y, z] = obstacle.position;
      const road = course.projectRoad(x, z);
      expect([x, y, z, obstacle.radius, obstacle.height].every(Number.isFinite)).toBe(true);
      expect(road.separation).toBeGreaterThan(road.shoulderWidth + obstacle.radius! + 1);
    }
    for (const hazard of TILTGLASS.hazards) {
      for (const time of [0, 1, 3.5, 8, 1000]) {
        const p = hazardPosition(hazard, time);
        expect(p.every(Number.isFinite)).toBe(true);
        expect(p).toEqual(hazardPosition(hazard, time));
        expect(Math.hypot(p[0] - hazard.position[0], p[2] - hazard.position[2])).toBeLessThanOrEqual((hazard.motion?.amplitude ?? 0) + 1e-8);
        expect(course.hazards(time).find(h => h.id === hazard.id)).toMatchObject({ x: p[0], y: p[1], z: p[2], radius: hazard.radius, height: hazard.height });
      }
      if (hazard.motion) {
        const a = hazardPosition(hazard, 2.1), b = hazardPosition(hazard, 2.1 + hazard.motion.period);
        expect(a[0]).toBeCloseTo(b[0], 8);
        expect(a[2]).toBeCloseTo(b[2], 8);
      }
    }
    for (const [start, end] of TILTGLASS.rails) expect(start >= 0 && end <= 1 && end > start).toBe(true);
  });
});

it("builds finite Tiltglass meshes within budget and keeps gameplay moving with decoration disabled", async () => {
  const [{ NullEngine }, { Scene }, { Atelier }, { makeTiltglassWorld }] = await Promise.all([
    import("@babylonjs/core/Engines/nullEngine"), import("@babylonjs/core/scene"),
    import("../../apps/web/src/render/geometry"), import("../../apps/web/src/render/worlds/tiltglass"),
  ]);
  vi.stubGlobal("OffscreenCanvas", class {
    constructor(public width: number, public height: number) {}
    getContext() {
      return { font: "", fillStyle: "", measureText: (text: string) => ({ width: text.length * 55 }), fillRect() {}, clearRect() {}, fillText() {}, drawImage() {} };
    }
  });
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const course = createLayoutQuery(TILTGLASS);
    const art = new Atelier(scene), cylinder = art.cylinder.bind(art);
    const cores = new Map<string, { bottom: number; top: number }>();
    vi.spyOn(art, "cylinder").mockImplementation((...args) => {
      const mesh = cylinder(...args);
      if (TILTGLASS.obstacles.some(obstacle => obstacle.id === mesh.name)) {
        mesh.computeWorldMatrix(true);
        const box = mesh.getBoundingInfo().boundingBox;
        cores.set(mesh.name, { bottom: box.minimumWorld.y, top: box.maximumWorld.y });
      }
      return mesh;
    });
    const world = makeTiltglassWorld(art, course);
    for (const obstacle of course.colliders) {
      expect(cores.get(obstacle.name)?.bottom).toBeCloseTo(obstacle.bottom, 4);
      expect(cores.get(obstacle.name)?.top).toBeCloseTo(obstacle.top, 4);
    }
    const meshes = scene.meshes.length, materials = scene.materials.length;
    const vertices = scene.meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0);
    expect(vertices).toBeLessThan(300_000);
    expect(meshes).toBeLessThan(400);
    expect(materials).toBeLessThan(40);
    expect(world.casters.every(mesh => !mesh.isDisposed())).toBe(true);
    for (const mesh of scene.meshes) {
      expect(mesh.getVerticesData("position")?.every(Number.isFinite), mesh.name).toBe(true);
      expect(mesh.getVerticesData("normal")?.every(Number.isFinite), mesh.name).toBe(true);
    }
    for (let step = 0; step < 120; step++) world.animate(step / 30, true);
    const time = 119 / 30;
    for (const hazard of TILTGLASS.hazards) {
      expect(scene.getTransformNodeByName(`tiltglass hazard ${hazard.id}`)!.position.asArray()).toEqual(hazardPosition(hazard, time));
    }
    const lamp = scene.getMeshByName("table chase 0")!;
    const scale = lamp.scaling.asArray();
    world.animate(20, true);
    expect(lamp.scaling.asArray()).toEqual(scale);
    world.animate(20, false);
    expect(lamp.scaling.asArray()).not.toEqual(scale);
    expect(scene.meshes.length).toBe(meshes);
    expect(scene.materials.length).toBe(materials);
    const cut = TILTGLASS.shortcuts[0], gap = TILTGLASS.glides[0];
    const cutLength = course.routes[1].points.at(-1)!.distance;
    const bypassed = course.sampleRoad(cut.to).distance - course.sampleRoad(cut.from).distance;
    const a = course.sampleRoad(gap.start), b = course.sampleRoad(gap.end);
    console.info(`Tiltglass route: ${cutLength.toFixed(1)}m cut replaces ${bypassed.toFixed(1)}m; ${Math.hypot(b.x - a.x, b.z - a.z).toFixed(1)}m flight with ${(a.y - b.y).toFixed(1)}m descent`);
    console.info(`Tiltglass: ${course.length.toFixed(1)}m, ${vertices} scene vertices including instances, ${meshes} meshes, ${materials} materials`);
  } finally {
    scene.dispose();
    engine.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
