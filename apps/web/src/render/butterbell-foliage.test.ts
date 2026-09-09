import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { ORCHARD, terrainHeight, surfaceHeight } from "@kartsick/content";
import { Atelier } from "./geometry";
import { ButterbellArt } from "./butterbell-art";
import { BUTTERBELL as C } from "./butterbell-materials";
import { butterbellOrchardTree, butterbellShrub, makeButterbellFoliageMaterials } from "./butterbell-foliage";

const engines: NullEngine[] = [];

function setup() {
  const engine = new NullEngine(), scene = new Scene(engine);
  engines.push(engine);
  vi.spyOn(engine, "createCanvas").mockImplementation(() => ({
    width: 1024, height: 1024, getContext: () => ({
      fillRect() {}, fillText() {}, clearRect() {}, measureText: (text: string) => ({ width: text.length * 45 }),
    }),
  } as unknown as ReturnType<NullEngine["createCanvas"]>));
  const atelier = new Atelier(scene), art = new ButterbellArt(atelier);
  return { engine, scene, atelier, art };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const engine of engines.splice(0)) engine.dispose();
});

describe("Butterbell orchard foliage", () => {
  it("paints two deterministic opaque textures and only three shared materials", () => {
    const rawTexture = vi.spyOn(RawTexture, "CreateRGBATexture");
    const { scene, atelier, art } = setup(), initialMaterials = scene.materials.length;
    const materials = makeButterbellFoliageMaterials(atelier);
    const firstPixels = rawTexture.mock.calls.map(call => Array.from(call[0] as Uint8Array));
    expect(rawTexture.mock.calls.map(call => call.slice(1, 3))).toEqual([[256, 256], [128, 128]]);
    expect(firstPixels.reduce((sum, pixels) => sum + pixels.length, 0)).toBe(327680);
    for (const pixels of firstPixels) {
      expect(pixels.filter((_, i) => i % 4 === 3).every(alpha => alpha === 255)).toBe(true);
      expect(new Set(pixels).size).toBeGreaterThan(70);
    }
    expect(scene.materials.length - initialMaterials).toBe(3);
    const second = setup();
    const secondMaterials = makeButterbellFoliageMaterials(second.atelier);
    expect(rawTexture.mock.calls.slice(2).map(call => Array.from(call[0] as Uint8Array))).toEqual(firstPixels);
    expect(secondMaterials.crown).not.toBe(materials.crown);
    expect(secondMaterials.crown.diffuseTexture).not.toBe(materials.crown.diffuseTexture);
    const textures = scene.textures.length;
    for (let i = 0; i < 5; i++) butterbellOrchardTree(art, materials, 15 + i * 7, 30, 1, i);
    const beforeBatch = scene.materials.length;
    art.finish();
    expect(scene.textures.length).toBe(textures);
    expect(scene.materials.length).toBe(beforeBatch);
    for (const material of Object.values(materials)) {
      expect(material.needAlphaBlending()).toBe(false);
      expect(material.needAlphaTesting()).toBe(false);
      expect(material.reflectionTexture).toBeNull();
      expect(material.getScene()).toBe(scene);
    }
  });

  it("preserves the exact trunk core and a bounded, varied canopy above the existing safe envelope", () => {
    const { scene, art, atelier } = setup(), materials = makeButterbellFoliageMaterials(atelier);
    const cylinders = vi.spyOn(art, "cylinder");
    const shapes = new Set<string>();
    for (const tree of ORCHARD) {
      const start = scene.meshes.length, ground = terrainHeight(tree.x, tree.z);
      butterbellOrchardTree(art, materials, tree.x, tree.z, tree.scale, tree.seed);
      expect(cylinders.mock.lastCall).toEqual(["orchard trunk core",
        [tree.x, ground + 1.7 * tree.scale, tree.z], .32 * tree.scale, .52 * tree.scale,
        3.4 * tree.scale, C.timber, "wood"]);
      const meshes = scene.meshes.slice(start);
      expect(meshes).toHaveLength(5);
      // The replaced tree was over 500 vertices; this stays below +1,000 vertices.
      expect(meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0)).toBe(1484);
      expect(meshes.reduce((sum, mesh) => sum + mesh.getTotalIndices() / 3, 0)).toBe(2066);
      const crown = meshes.find(mesh => mesh.name === "butterbell interlocking orchard crowns")!;
      const crowns = crown.getVerticesData(VertexBuffer.PositionKind)!;
      expect(crown.getTotalVertices()).toBe(7 * 67);
      shapes.add(Array.from(crowns).map(value => value.toFixed(3)).join(","));
      for (const mesh of meshes) {
        expect(mesh.parent).toBe(art.root(tree.x, tree.z));
        if (mesh.name === "orchard trunk core") continue;
        const p = mesh.getVerticesData(VertexBuffer.PositionKind)!;
        const minimum = mesh.name.includes("limbs") ? 2.68 : 3;
        for (let i = 0; i < p.length; i += 3) {
          expect((p[i + 1] - ground) / tree.scale, mesh.name).toBeGreaterThanOrEqual(minimum);
          expect((p[i + 1] - ground) / tree.scale, mesh.name).toBeLessThan(7.3);
          expect(Math.hypot(p[i] - tree.x, p[i + 2] - tree.z) / tree.scale, mesh.name).toBeLessThan(3.2);
        }
      }
    }
    expect(shapes.size).toBe(ORCHARD.length);
    expect(art.furniture).toEqual([]);
  });

  it("has finite unit normals and nondegenerate triangles before and after mirrored spatial batching", () => {
    const { scene, art, atelier } = setup(), materials = makeButterbellFoliageMaterials(atelier);
    const raw = vi.spyOn(atelier, "mesh");
    for (const tree of ORCHARD) butterbellOrchardTree(art, materials, tree.x, tree.z, tree.scale, tree.seed);
    for (const [name, p, indices] of raw.mock.calls) {
      const normals: number[] = [];
      VertexData.ComputeNormals(p, indices, normals);
      expect(normals.every(Number.isFinite), name).toBe(true);
      for (let i = 0; i < normals.length; i += 3) expect(Math.hypot(...normals.slice(i, i + 3)), name).toBeCloseTo(1, 5);
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
        const ab = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
        const ac = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
        expect(Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2],
          ab[0] * ac[1] - ab[1] * ac[0]), name).toBeGreaterThan(1e-9);
      }
      if (name.includes("interlocking orchard crowns")) {
        for (let cluster = 0; cluster < 7; cluster++) {
          const bottom = cluster * 67 * 3, top = (cluster * 67 + 66) * 3;
          const cx = p[bottom], cz = p[bottom + 2];
          expect(normals[bottom + 1]).toBeLessThan(-.9);
          expect(normals[top + 1]).toBeGreaterThan(.9);
          for (let vertex = 1 + 2 * 13; vertex < 1 + 3 * 13; vertex++) {
            const n = bottom + vertex * 3;
            expect((p[n] - cx) * normals[n] + (p[n + 2] - cz) * normals[n + 2]).toBeGreaterThan(0);
          }
        }
      }
      if (name.includes("branching orchard limbs")) {
        for (let branch = 0; branch < 4; branch++) for (const offset of [0, 30]) {
          const ring = (branch * 53 + offset + 7) * 3;
          const center = [0, 0, 0];
          for (let side = 0; side < 6; side++) for (let axis = 0; axis < 3; axis++) {
            center[axis] += p[ring + side * 3 + axis] / 6;
          }
          for (let side = 0; side < 7; side++) {
            const i = ring + side * 3;
            expect((p[i] - center[0]) * normals[i] + (p[i + 1] - center[1]) * normals[i + 1]
              + (p[i + 2] - center[2]) * normals[i + 2]).toBeGreaterThan(0);
          }
        }
      }
      if (name.includes("leaf sprays")) {
        for (let i = 1; i < normals.length; i += 3) expect(normals[i]).toBeGreaterThan(.2);
      }
    }
    const batches = art.finish(), root = new TransformNode("mirrored orchard", scene);
    for (const node of scene.rootNodes.slice()) if (node !== root && node instanceof TransformNode) node.parent = root;
    root.scaling.x = -1;
    expect(batches.length).toBeLessThan(ORCHARD.length * 3);
    for (const mesh of batches) {
      mesh.computeWorldMatrix(true);
      const normals = mesh.getVerticesData(VertexBuffer.NormalKind)!;
      for (let i = 0; i < normals.length; i += 3) expect(Math.hypot(normals[i], normals[i + 1], normals[i + 2])).toBeCloseTo(1, 5);
      expect(mesh.material).toBeInstanceOf(StandardMaterial);
      expect(mesh.isPickable).toBe(false);
    }
  });

  it("repeats identical geometry for an identical seed and makes low collider-free hedge units", () => {
    const { scene, art, atelier } = setup(), materials = makeButterbellFoliageMaterials(atelier);
    const geometry = vi.spyOn(atelier, "mesh");
    butterbellOrchardTree(art, materials, 20, 35, 1, 41);
    butterbellOrchardTree(art, materials, 20, 35, 1, 41);
    for (let i = 0; i < 4; i++) expect(geometry.mock.calls[i + 4]).toEqual(geometry.mock.calls[i]);
    const start = scene.meshes.length, resources = [scene.materials.length, scene.textures.length];
    butterbellShrub(art, materials, 20, 35, 1, 41);
    expect([scene.materials.length, scene.textures.length]).toEqual(resources);
    const shrubs = scene.meshes.slice(start);
    expect(shrubs).toHaveLength(2);
    expect(shrubs.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0)).toBe(264);
    for (const mesh of shrubs) {
      const p = mesh.getVerticesData(VertexBuffer.PositionKind)!;
      for (let i = 1; i < p.length; i += 3) {
        expect(p[i] - surfaceHeight(20, 35)).toBeGreaterThanOrEqual(0);
        expect(p[i] - surfaceHeight(20, 35)).toBeLessThanOrEqual(.550001);
      }
    }
    const taller = scene.meshes.length;
    butterbellShrub(art, materials, 20, 35, 1.5, 41, 1.8);
    const tallMeshes = scene.meshes.slice(taller);
    const points = tallMeshes.flatMap(mesh => Array.from(mesh.getVerticesData(VertexBuffer.PositionKind)!));
    expect(Math.max(...points.filter((_, i) => i % 3 === 1)) - surfaceHeight(20, 35)).toBeCloseTo(1.8);
    expect([scene.materials.length, scene.textures.length]).toEqual(resources);
  });

  it("releases course-owned foliage without disposing the stage environment or unrelated materials", () => {
    const { scene, art, atelier } = setup();
    const environment = new Texture(null, scene), unrelated = new StandardMaterial("persistent kart paint", scene);
    scene.environmentTexture = environment;
    const textures = new Set(scene.textures), materials = new Set(scene.materials);
    const baseline = [scene.meshes.length, scene.materials.length, scene.textures.length];
    const foliage = makeButterbellFoliageMaterials(atelier);
    butterbellOrchardTree(art, foliage, 20, 35, 1, 41);
    butterbellShrub(art, foliage, 20, 40, 1, 27);
    for (const mesh of art.finish()) mesh.dispose();
    for (const material of scene.materials.slice()) if (!materials.has(material)) material.dispose();
    for (const texture of scene.textures.slice()) if (!textures.has(texture)) texture.dispose();
    expect([scene.meshes.length, scene.materials.length, scene.textures.length]).toEqual(baseline);
    expect(scene.textures).toContain(environment);
    expect(scene.materials).toContain(unrelated);
  });
});
