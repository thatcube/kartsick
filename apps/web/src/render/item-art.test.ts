import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Scene } from "@babylonjs/core/scene";
import { ITEM_IDS } from "@kartsick/content";
import { Atelier } from "./geometry";
import { ItemArt, itemNode } from "./item-art";
import { makeItemVisual, makePickupBox } from "./items";

function validateGeometry(mesh: AbstractMesh): void {
  const p = mesh.getVerticesData("position")!, n = mesh.getVerticesData("normal")!, indices = mesh.getIndices()!;
  expect(p.every(Number.isFinite), mesh.name).toBe(true);
  for (let i = 0; i < n.length; i += 3) expect(Math.hypot(n[i], n[i + 1], n[i + 2]), `${mesh.name}:normal:${i / 3}`).toBeCloseTo(1, 4);
  for (let i = 0; i < indices.length; i += 3) {
    const [ia, ib, ic] = [indices[i], indices[i + 1], indices[i + 2]];
    const a = Vector3.FromArray(p, ia * 3), b = Vector3.FromArray(p, ib * 3), c = Vector3.FromArray(p, ic * 3);
    const face = Vector3.Cross(c.subtract(a), b.subtract(a));
    expect(face.lengthSquared(), `${mesh.name}:triangle:${i / 3}`).toBeGreaterThan(1e-18);
    const normal = Vector3.FromArray(n, ia * 3).add(Vector3.FromArray(n, ib * 3)).add(Vector3.FromArray(n, ic * 3));
    expect(Vector3.Dot(face.normalize(), normal.normalize()), `${mesh.name}:LH-winding:${i / 3}`).toBeGreaterThan(.01);
  }
}

it("authors closed LH solids without collapsed pole triangles or seam-normal cancellation", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const art = new Atelier(scene), root = itemNode(art, "item geometry probes"), a = new ItemArt(art, root);
    const rounded = a.block("rounded solid", [0, 0, 0], [.7, .5, .4], "#5bd1c4");
    const puff = a.puff("tailored soft solid", [0, 0, 0], [.7, .5, .4], "#5bd1c4", "fabric", .62);
    const profile = a.profile("turned vessel", [[-.3, .1, .1], [-.2, .2, .16], [0, .23, .2], [.2, .17, .14], [.3, .06, .06]], "#5bd1c4");
    const ring = a.ring("wrapped ring", [0, 0, 0], .5, .07, "#5bd1c4");
    const tube = a.tube("capped tube", [[0, -.3, 0], [0, 0, 0], [0, .3, 0]], .04, "#5bd1c4");
    const closed = a.tube("closed sewn seam", Array.from({ length: 33 }, (_, i) => {
      const angle = i / 32 * Math.PI * 2;
      return [Math.cos(angle) * .3, Math.sin(angle) * .23, 0];
    }), .017, "#5bd1c4");
    for (const mesh of [rounded, puff, profile, ring, tube, closed]) validateGeometry(mesh);
    // Centered convex solids must face out, independently of the face/normal agreement.
    for (const mesh of [rounded, puff, profile, tube]) {
      const p = mesh.getVerticesData("position")!, n = mesh.getVerticesData("normal")!;
      for (let i = 0; i < p.length; i += 3) expect(p[i] * n[i] + p[i + 1] * n[i + 1] + p[i + 2] * n[i + 2]).toBeGreaterThan(0);
    }
    expect(closed.getTotalVertices()).toBe(32 * 8);
    expect(closed.getTotalIndices()).toBe(32 * 8 * 6);
    for (const mesh of [puff, ring]) {
      const positions = mesh.getVerticesData("position")!;
      const unique = new Set(Array.from({ length: mesh.getTotalVertices() }, (_, i) =>
        Array.from(positions.slice(i * 3, i * 3 + 3), value => value.toFixed(7)).join(",")));
      expect(unique.size).toBe(mesh.getTotalVertices());
    }
  } finally { scene.dispose(); engine.dispose(); }
});

it.each(ITEM_IDS)("keeps every %s triangle finite, nondegenerate, and consistently lit after batching", id => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const root = makeItemVisual(new Atelier(scene), id);
    for (const mesh of root.getChildMeshes()) {
      validateGeometry(mesh);
      const material = mesh.material as StandardMaterial;
      expect(material.alpha).toBe(1);
      expect(material.backFaceCulling).toBe(true);
      expect(material.getActiveTextures()).toHaveLength(0);
      expect(["paint", "metal", "rubber", "fabric"]).toContain(material.metadata.surfaceFinish);
    }
  } finally { scene.dispose(); engine.dispose(); }
});

it("keeps both recessed delivery-reel faces consistently wound after batching", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    for (const mesh of makePickupBox(new Atelier(scene)).getChildMeshes()) validateGeometry(mesh);
  } finally { scene.dispose(); engine.dispose(); }
});

it("keeps the full item inventory texture-free and reuses materials after warmup", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const art = new Atelier(scene);
    const roots = [...ITEM_IDS.map(id => makeItemVisual(art, id)), makePickupBox(art)];
    const resources = {
      meshes: scene.meshes.length, materials: scene.materials.length,
      textures: scene.textures.length, vertices: scene.meshes.reduce((n, mesh) => n + mesh.getTotalVertices(), 0),
      triangles: scene.meshes.reduce((n, mesh) => n + mesh.getTotalIndices() / 3, 0),
    };
    expect(resources.meshes).toBeLessThanOrEqual(74);
    expect(resources.materials).toBeLessThanOrEqual(46);
    expect(resources.vertices).toBeLessThan(59_000);
    expect(resources.triangles).toBeLessThan(105_000);
    if (process.env.KARTSICK_ITEM_METRICS) process.stdout.write(JSON.stringify({
      resources,
      models: roots.map(root => ({
        id: root.metadata.itemId ?? "pickup",
        meshes: root.getChildMeshes().length,
        vertices: root.getChildMeshes().reduce((n, mesh) => n + mesh.getTotalVertices(), 0),
        triangles: root.getChildMeshes().reduce((n, mesh) => n + mesh.getTotalIndices() / 3, 0),
      })),
    }) + "\n");
    for (const root of roots) root.dispose();
    expect(scene.meshes).toHaveLength(0);
    for (const id of ITEM_IDS) makeItemVisual(art, id).dispose();
    makePickupBox(art).dispose();
    expect(scene.materials).toHaveLength(resources.materials);
    expect(scene.textures).toHaveLength(0);
  } finally { scene.dispose(); engine.dispose(); }
});
