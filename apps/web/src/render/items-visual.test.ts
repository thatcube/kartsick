import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { Atelier } from "./geometry";
import { makePickupBox } from "./items";

function inScene(run: (art: Atelier, scene: Scene) => void): void {
  const engine = new NullEngine(), scene = new Scene(engine);
  try { run(new Atelier(scene), scene); } finally { scene.dispose(); engine.dispose(); }
}

it("builds a kart-scale delivery case with bounded, outward-facing geometry in two batches", () => {
  inScene(art => {
    const root = makePickupBox(art), meshes = root.getChildMeshes();
    const { min, max } = root.getHierarchyBoundingVectors();
    expect(max.x - min.x).toBeGreaterThanOrEqual(1.5);
    expect(max.x - min.x).toBeLessThanOrEqual(1.8);
    expect(max.y - min.y).toBeGreaterThan(1.5);
    expect(max.y - min.y).toBeLessThan(1.65);
    expect(max.z - min.z).toBeGreaterThan(1.3);
    expect(max.z - min.z).toBeLessThan(1.45);
    expect(Math.abs(max.x + min.x)).toBeLessThan(0.001);
    expect(Math.abs(max.z + min.z)).toBeLessThan(0.001);
    expect(max.x - min.x).toBeCloseTo(1.72, 2);
    expect(max.y - min.y).toBeCloseTo(1.5405, 3);
    expect(max.z - min.z).toBeCloseTo(1.41, 3);
    expect(root.metadata).toMatchObject({ kind: "pickup", visual: "delivery-reel", stampFaces: 2, reelWindows: 3 });
    expect(meshes).toHaveLength(2);
    expect(meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0)).toBeLessThan(12_000);
    for (const mesh of meshes) {
      expect(mesh.isPickable).toBe(false);
      for (const [attribute, width] of [["position", 3], ["normal", 3], ["uv", 2], ["color", 4]] as const) {
        const values = mesh.getVerticesData(attribute)!;
        expect(values.length).toBe(mesh.getTotalVertices() * width);
        expect(values.every(Number.isFinite)).toBe(true);
      }
      const positions = mesh.getVerticesData("position")!, normals = mesh.getVerticesData("normal")!;
      for (let i = 0; i < normals.length; i += 3) {
        expect(Math.hypot(normals[i], normals[i + 1], normals[i + 2])).toBeGreaterThan(0.99);
        expect(Math.hypot(normals[i], normals[i + 1], normals[i + 2])).toBeLessThan(1.01);
      }
      expect(Array.from(mesh.getIndices()!).every(index => index >= 0 && index < mesh.getTotalVertices())).toBe(true);
      // The first authored surface is the chamfered shell, before the ornamental layers.
      if (mesh.parent === root) for (let i = 0; i < 112 * 3; i += 3) {
        expect(positions[i] * normals[i] + positions[i + 1] * normals[i + 1] + positions[i + 2] * normals[i + 2]).toBeGreaterThan(0.45);
      }
    }
  });
});

it("fits the two parcel centers at the caller's paired-pickup scale without touching", () => {
  inScene(art => {
    const left = makePickupBox(art), right = makePickupBox(art);
    left.position.x = -0.83;
    right.position.x = 0.83;
    left.scaling.setAll(0.95);
    right.scaling.setAll(0.95);
    const leftBounds = left.getHierarchyBoundingVectors(), rightBounds = right.getHierarchyBoundingVectors();
    expect(rightBounds.min.x - leftBounds.max.x).toBeGreaterThan(0.02);
    expect(rightBounds.max.x - leftBounds.min.x).toBeLessThan(3.3);
  });
});

it("keeps front/back delivery lamps small, with most of the case genuinely lit enamel", () => {
  inScene(art => {
    const root = makePickupBox(art), meshes = root.getChildMeshes();
    const luminous = meshes.filter(mesh => (mesh.material as StandardMaterial).disableLighting);
    const enamel = meshes.filter(mesh => !(mesh.material as StandardMaterial).disableLighting);
    expect(enamel).toHaveLength(1);
    expect(luminous).toHaveLength(1);
    expect((enamel[0].material as StandardMaterial).emissiveColor.asArray()).toEqual([0, 0, 0]);
    const positions = luminous[0].getVerticesData("position")!;
    expect(positions.length / 3).toBeLessThan(enamel[0].getTotalVertices() * 0.25);
    for (let i = 0; i < positions.length; i += 3) {
      expect(Math.abs(positions[i])).toBeLessThan(0.37);
      expect(positions[i + 1]).toBeGreaterThan(-0.36);
      expect(positions[i + 1]).toBeLessThan(-0.30);
      expect(Math.abs(positions[i + 2])).toBeGreaterThan(0.64);
      expect(Math.abs(positions[i + 2])).toBeLessThan(0.66);
    }
    expect(positions.some((value, index) => index % 3 === 2 && value > 0)).toBe(true);
    expect(positions.some((value, index) => index % 3 === 2 && value < 0)).toBe(true);
  });
});

it("preserves stable animation anchors and independent resources through pop, respawn, and disposal", () => {
  inScene((art, scene) => {
    const roots = Array.from({ length: 8 }, () => makePickupBox(art));
    const materialCount = scene.materials.length, meshCount = scene.meshes.length;
    const root = roots[0], neighbors = roots.slice(1);
    const lamps = root.getChildTransformNodes(true).find(child => child.name === "pickup:lamps")!;
    const handle = root.getChildTransformNodes(true).find(child => child.name === "pickup:handle")!;
    const burst = root.getChildTransformNodes(true).find(child => child.name === "pickup:burst")!;
    expect(lamps.metadata.animation).toBe("mesh-visibility");
    expect(lamps.getChildMeshes()).toHaveLength(1);
    expect(handle.getChildMeshes()).toHaveLength(0);
    expect(burst.getChildMeshes()).toHaveLength(0);
    expect(handle.position.asArray()).toEqual([0, 0.83, 0]);
    expect(burst.position.asArray()).toEqual([0, 0, 0]);
    for (let frame = 0; frame < 120; frame++) {
      root.position.set(-0.83, 1.15 + Math.sin(frame * 0.1) * 0.12, 0);
      root.scaling.setAll(frame < 60 ? 0.95 : 0.95 * (frame - 60) / 60);
      root.rotation.y = frame * 0.02;
      lamps.getChildMeshes()[0].visibility = 0.85 + Math.sin(frame * 0.1) * 0.15;
      root.setEnabled(frame !== 60);
      for (const child of root.getChildTransformNodes()) expect(Array.from(child.computeWorldMatrix(true).m).every(Number.isFinite)).toBe(true);
      expect(neighbors.every(neighbor => neighbor.scaling.equals(Vector3.One()) && neighbor.position.equals(Vector3.Zero()))).toBe(true);
    }
    expect(scene.meshes.length).toBe(meshCount);
    expect(scene.materials.length).toBe(materialCount);
    expect(neighbors.flatMap(neighbor => neighbor.getChildMeshes()).every(mesh => mesh.visibility === 1)).toBe(true);
    const materials = new Set(root.getChildMeshes().map(mesh => mesh.material));
    root.dispose();
    expect(scene.meshes.length).toBe(meshCount - 2);
    expect([...materials].every(material => scene.materials.includes(material!))).toBe(true);
    expect(neighbors.flatMap(neighbor => neighbor.getChildMeshes()).every(mesh => !mesh.isDisposed())).toBe(true);
    makePickupBox(art);
    expect(scene.materials.length).toBe(materialCount);
  });
});
