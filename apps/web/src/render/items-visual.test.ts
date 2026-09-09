import { expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { ITEM_IDS } from "@kartsick/content";
import type { ItemId } from "@kartsick/content";
import { Atelier } from "./geometry";
import { makeItemVisual, makePickupBox } from "./items";

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

it("constructs a genuinely recessed, opaque reel case instead of coplanar translucent overlays", () => {
  inScene(art => {
    const surfaces: { name: string; z: number; front: number; finish: string }[] = [];
    const batch = art.batchModel.bind(art);
    vi.spyOn(art, "batchModel").mockImplementation((root, animated, colors) => {
      for (const mesh of root.getChildMeshes()) {
        mesh.computeWorldMatrix(true);
        const material = mesh.material as StandardMaterial;
        expect(material.alpha).toBe(1);
        expect(material.backFaceCulling).toBe(true);
        surfaces.push({ name: mesh.name, z: mesh.position.z, front: mesh.getBoundingInfo().boundingBox.maximumWorld.z, finish: material.metadata.surfaceFinish });
      }
      batch(root, animated, colors);
    });
    makePickupBox(art);
    const front = (name: string) => surfaces.filter(surface => surface.name === name && surface.z > 0);
    const bed = front("deep shadowed three-reel cavity")[0];
    const reels = front("curved porcelain delivery reel");
    const rim = front("rounded vertical brass window rail");
    expect(reels).toHaveLength(3);
    expect(rim).toHaveLength(2);
    expect(reels.every(reel => reel.front > bed.front + .075 && reel.front < rim[0].front - .005)).toBe(true);
    expect(surfaces.filter(surface => surface.name === "corner protector domed rivet")).toHaveLength(8);
    expect(surfaces.filter(surface => surface.name === "working brass lid catch")).toHaveLength(2);
    expect(surfaces.filter(surface => surface.name === "raised rear lid hinge")).toHaveLength(4);
    expect(surfaces.every(surface => surface.finish === "paint")).toBe(true);
  });
});

it.each([
  ["roadwork", "tiny roadwork rubber roller", 4, "folding metal A-frame strut", 2],
  ["velvet", "tailored velvet rebound face", 1, "ivory cushion bound piping", 2],
  ["static", "separately countable amber charge segment", 2, "four-turn insulated forward thrust coil", 1],
  ["doubles", "oversized unmistakable inflation valve", 1, "printed rubber balloon wheel", 4],
] as const)("preserves the countable physical identity of %s without adding gameplay components", (id, feature, count, secondary, secondaryCount) => {
  inScene(art => {
    let names: string[] = [];
    const batch = art.batchModel.bind(art);
    vi.spyOn(art, "batchModel").mockImplementation((root, animated, colors) => {
      names = root.getChildMeshes().map(mesh => mesh.name);
      batch(root, animated, colors);
    });
    const root = makeItemVisual(art, id);
    expect(root.metadata).toEqual({ kind: "item", itemId: id });
    expect(names.filter(name => name === feature)).toHaveLength(count);
    expect(names.filter(name => name === secondary)).toHaveLength(secondaryCount);
    expect(root.getChildTransformNodes(true).every(node => node.getClassName() === "Mesh")).toBe(true);
    expect(root.position.asArray()).toEqual([0, 0, 0]);
    expect(root.scaling.asArray()).toEqual([1, 1, 1]);
  });
});

it.each(["slip", "bounce", "homing", "boost"] as const)("keeps three recognizable %s charges with identical finish and proportions", single => {
  inScene(art => {
    const standard = makeItemVisual(art, single), triple = makeItemVisual(art, `triple-${single}`);
    const charges = triple.getChildTransformNodes(true);
    expect(charges).toHaveLength(3);
    const total = standard.getChildMeshes().reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0);
    for (const [index, charge] of charges.entries()) {
      expect(charge.metadata).toEqual({ kind: "item-charge", itemId: single, charge: index + 1 });
      expect(charge.scaling.asArray()).toEqual([.57, .57, .57]);
      expect(charge.getChildMeshes().reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0)).toBe(total);
      expect(charge.getChildMeshes().map(mesh => mesh.material)).toEqual(standard.getChildMeshes().map(mesh => mesh.material));
    }
  });
});

it("distinguishes Zip Flask by its bellows and squeeze mechanism, not just its orange paint", () => {
  inScene(art => {
    const names = new Map<ItemId, string[]>();
    const batch = art.batchModel.bind(art);
    vi.spyOn(art, "batchModel").mockImplementation((root, animated, colors) => {
      names.set(root.metadata.itemId, root.getChildMeshes().map(mesh => mesh.name));
      batch(root, animated, colors);
    });
    makeItemVisual(art, "boost");
    makeItemVisual(art, "rapid-boost");
    expect(names.get("boost")).toContain("cream embossed can label");
    expect(names.get("boost")).not.toContain("flask squeeze lever");
    expect(names.get("rapid-boost")).toContain("flask squeeze lever");
    expect(names.get("rapid-boost")!.filter(name => name === "separate flask compression fold")).toHaveLength(5);
  });
});

it("preserves projectile, held-item and respawn transforms without material mutation or resource growth", () => {
  inScene((art, scene) => {
    const roots = ITEM_IDS.map(id => makeItemVisual(art, id));
    const resources = { meshes: scene.meshes.length, materials: scene.materials.length, textures: scene.textures.length };
    const finishes = scene.materials.map(material => {
      const m = material as StandardMaterial;
      return { material, diffuse: m.diffuseColor.asArray(), specular: m.specularColor.asArray(), power: m.specularPower, alpha: m.alpha };
    });
    for (let frame = 0; frame < 80; frame++) for (const [i, root] of roots.entries()) {
      root.position.set(Math.sin(frame * .05) + i * 2, .9, frame * .13);
      root.rotation.set(frame * .03, frame * .04, Math.sin(frame * .2) * .15);
      root.scaling.setAll(frame === 0 ? 0 : .55 + frame / 160);
      for (const mesh of root.getChildMeshes()) mesh.visibility = .5 + frame / 160;
      expect(Array.from(root.computeWorldMatrix(true).m).every(Number.isFinite)).toBe(true);
    }
    expect(scene.meshes.length).toBe(resources.meshes);
    expect(scene.materials.length).toBe(resources.materials);
    expect(scene.textures.length).toBe(resources.textures);
    for (const { material, diffuse, specular, power, alpha } of finishes) {
      const m = material as StandardMaterial;
      expect(m.diffuseColor.asArray()).toEqual(diffuse);
      expect(m.specularColor.asArray()).toEqual(specular);
      expect(m.specularPower).toBe(power);
      expect(m.alpha).toBe(alpha);
    }
    for (const root of roots) root.dispose();
    expect(scene.meshes).toHaveLength(0);
    const rebuilt = makeItemVisual(art, "homing");
    expect(rebuilt.position.asArray()).toEqual([0, 0, 0]);
    expect(rebuilt.getChildMeshes().every(mesh => mesh.visibility === 1)).toBe(true);
    expect(scene.materials.length).toBe(resources.materials);
  });
});
