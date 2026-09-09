import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { getCourse } from "@kartsick/content";
import type { CourseId } from "@kartsick/content";
import { groundcoverClearance, planCourseGroundcover, PLANT_PALETTES } from "./course-groundcover";
import { makeGroundcover } from "./groundcover";
import type { PlantKind } from "./groundcover";
import { Atelier } from "./geometry";

const ids: CourseId[] = ["butterbell", "afterglow", "escaluna", "tiltglass", "copperwhistle", "lastlight"];

describe.each(ids)("%s groundcover", id => {
  const course = getCourse(id), plan = planCourseGroundcover(course);
  it("plants deterministic, bounded drifts throughout the course without changing physics", () => {
    expect(planCourseGroundcover(course)).toEqual(plan);
    expect(plan.plants.length).toBeGreaterThan(id === "butterbell" ? 2800 : 450);
    expect(plan.plants.length).toBeLessThanOrEqual(5800);
    expect(new Set(plan.plants.map(p => p.kind)).size).toBeGreaterThanOrEqual(2);
    const sections = [0, 0, 0, 0];
    for (const p of plan.plants) sections[Math.min(3, Math.floor(p.u * 4))]++;
    expect(sections.every(n => n > 30), `route quarters: ${sections}`).toBe(true);
    expect(() => planCourseGroundcover(getCourse(id, true))).toThrow(/canonical/);
    const clear = groundcoverClearance(course);
    expect(() => clear(0, 0, 0, 2)).toThrow(/footprint/);
    expect(() => clear(NaN, 0, 0, .2)).toThrow(/finite/);
    for (const p of plan.plants) expect(clear(p.x, p.y, p.z, p.radius), JSON.stringify(p)).toBe(true);
    for (const p of course.road) expect(clear(p.x, p.y, p.z, .2)).toBe(false);
  });

  it("uses supported soil, slope-aligned deck troughs or existing planter tops", () => {
    const support = id === "butterbell" ? course.surfaceHeight : course.terrainHeight;
    for (const p of plan.plants) {
      if (p.bed !== undefined) {
        const bed = plan.beds[p.bed];
        const along = (p.x - bed.x) * Math.sin(bed.yaw) + (p.z - bed.z) * Math.cos(bed.yaw);
        expect(p.y).toBeCloseTo(bed.y + along * bed.grade + .025, 5);
        expect(Math.abs(along) + p.radius).toBeLessThan(bed.halfLength + .1);
      } else if (p.support === "terrain") {
        expect(p.y).toBeCloseTo(support(p.x, p.z) + .075, 5);
        expect(course.isWater(p.x, p.z)).toBe(false);
      } else {
        expect(course.colliders.some(c => c.name.endsWith("planter") && Math.abs(c.top + .08 - p.y) < .001)).toBe(true);
      }
    }
  });

  it("shares opaque material and culled batches, mirrors once and releases all its resources", () => {
    const engine = new NullEngine(), scene = new Scene(engine), art = new Atelier(scene);
    try {
      const stats = makeGroundcover(art, id, plan.plants, plan.beds, PLANT_PALETTES[id]);
      console.info(`${id}: ${stats.plants} plants, ${plan.beds.length} beds, ${stats.meshes} meshes, ${stats.vertices} vertices`);
      expect(stats.vertices).toBeLessThan(180000);
      expect(stats.meshes).toBeLessThan(160);
      expect(scene.materials).toHaveLength(1);
      expect(scene.textures).toHaveLength(0);
      const root = new TransformNode("course mirror", scene);
      root.scaling.x = -1;
      for (const mesh of scene.meshes) {
        const p = mesh.getVerticesData(VertexBuffer.PositionKind)!;
        const n = mesh.getVerticesData(VertexBuffer.NormalKind)!;
        expect(p.every(Number.isFinite)).toBe(true);
        for (let i = 0; i < n.length; i += 3) expect(Math.hypot(n[i], n[i + 1], n[i + 2])).toBeCloseTo(1, 4);
        expect(mesh.material?.needAlphaBlending()).toBe(false);
        expect(mesh.receiveShadows).toBe(true);
        mesh.unfreezeWorldMatrix();
        mesh.parent = root;
        const matrix = mesh.computeWorldMatrix(true);
        expect(matrix.m[0]).toBe(-1);
      }
      root.dispose();
      expect(scene.meshes).toHaveLength(0);
      for (const material of [...scene.materials]) material.dispose();
      expect(scene.materials).toHaveLength(0);
    } finally { scene.dispose(); engine.dispose(); }
  });
});

it("gives Butterbell a substantially fuller meadow with six distinct kinds of small planting", () => {
  const { plants, beds } = planCourseGroundcover(getCourse("butterbell"));
  expect(beds).toHaveLength(0);
  expect(new Set(plants.map(p => p.kind))).toEqual(new Set(["grass", "clover", "daisy", "buttercup", "seed", "reed"]));
  expect(plants.filter(p => p.kind === "reed").length).toBeGreaterThan(40);
});

it("keeps every plant's real geometry inside its tested clearance footprint", () => {
  const engine = new NullEngine(), scene = new Scene(engine), art = new Atelier(scene);
  try {
    const kinds: PlantKind[] = ["grass", "clover", "daisy", "buttercup", "seed", "reed", "fern", "rosette", "felt"];
    for (const kind of kinds) {
      const radius = kind === "fern" ? .47 : kind === "clover" ? .18 : .29;
      makeGroundcover(art, kind, [{ x: 0, y: 0, z: 0, seed: 147, kind, scale: 1, radius, u: 0, support: "terrain" }], [], PLANT_PALETTES.butterbell);
      const mesh = scene.meshes.at(-1)!, positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
      for (let i = 0; i < positions.length; i += 3) {
        expect(Math.hypot(positions[i], positions[i + 2]), kind).toBeLessThanOrEqual(radius);
        expect(positions[i + 1], kind).toBeGreaterThanOrEqual(0);
        expect(positions[i + 1], kind).toBeLessThan(.8);
      }
    }
  } finally { scene.dispose(); engine.dispose(); }
});
