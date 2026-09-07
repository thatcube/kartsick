import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ITEM_IDS } from "@kartsick/content";
import { Atelier } from "../geometry";
import { makeItemVisual, makePickupBox } from "../items";

it.each(ITEM_IDS)("builds the original %s visual with valid attributes and bounded geometry", id => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const root = makeItemVisual(new Atelier(scene), id);
    const meshes = root.getChildMeshes();
    expect(root.metadata.itemId).toBe(id);
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.length).toBeLessThanOrEqual(6);
    expect(meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0)).toBeLessThan(12_000);
    for (const mesh of meshes) for (const [attribute, width] of [["position", 3], ["normal", 3], ["uv", 2]] as const) {
      const data = mesh.getVerticesData(attribute)!;
      expect(data.every(Number.isFinite)).toBe(true);
      expect(data.length).toBe(mesh.getTotalVertices() * width);
    }
    const { min, max } = root.getHierarchyBoundingVectors();
    expect(Math.max(max.x - min.x, max.y - min.y, max.z - min.z)).toBeGreaterThan(0.45);
    expect(Math.max(max.x - min.x, max.y - min.y, max.z - min.z)).toBeLessThan(1.3);
    expect([min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite)).toBe(true);
    if (id.startsWith("triple-")) expect(root.getChildTransformNodes(true)).toHaveLength(3);
  } finally { scene.dispose(); engine.dispose(); }
});

it("creates eight simultaneous independent item rigs and a distinct pickup parcel", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const art = new Atelier(scene);
    const roots = Array.from({ length: 8 }, () => makeItemVisual(art, "doubles"));
    const materials = roots[0].getChildMeshes().map(mesh => mesh.material);
    roots[1].dispose();
    expect(roots[0].getChildMeshes().every(mesh => !mesh.isDisposed())).toBe(true);
    expect(materials.every(material => scene.materials.includes(material!))).toBe(true);
    const pickup = makePickupBox(art);
    expect(pickup.getChildMeshes().length).toBeLessThanOrEqual(2);
    expect(pickup.name).toBe("Belltumble item parcel");
  } finally { scene.dispose(); engine.dispose(); }
});
