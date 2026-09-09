import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { BODY_IDS, CHARACTER_IDS, WHEEL_IDS } from "@kartsick/content";
import { Atelier } from "../geometry";
import { makeKart } from "../kart";
import { makeCharacter } from "../characters";
import { makeWheels, WHEEL_RADII, WHEEL_STANCE } from "./wheels";
import { makeBody } from "./bodies";

it("measures the road-ready tandem silhouette", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const model = makeKart(new Atelier(scene));
    let min = new Vector3(Infinity, Infinity, Infinity), max = min.negate();
    for (const mesh of model.meshes.filter(mesh => mesh.isEnabled())) {
      mesh.computeWorldMatrix(true);
      const bounds = mesh.getBoundingInfo().boundingBox;
      min = Vector3.Minimize(min, bounds.minimumWorld);
      max = Vector3.Maximize(max, bounds.maximumWorld);
    }
    const size = max.subtract(min);
    expect(min.y).toBeCloseTo(-0.43, 3);
    expect(size.x).toBeGreaterThan(2.45);
    expect(size.x).toBeLessThan(2.65);
    expect(size.z).toBeLessThan(3.2);
    expect(size.z / size.x).toBeLessThan(1.25);
    expect(size.y / size.x).toBeLessThan(0.94);
    expect(max.y).toBeLessThan(2);
    expect(model.meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0)).toBeLessThan(66_000);
  } finally { scene.dispose(); engine.dispose(); }
});

it.each(BODY_IDS)("%s has a recessed cockpit rather than a solid shell through the riders", id => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const root = new TransformNode("cockpit study", scene);
    makeBody(new Atelier(scene), root, id, "original", "plain");
    const shell = root.getChildMeshes().find(mesh => mesh.metadata?.kind === "recessed-cockpit-shell")!;
    expect(shell).toBeDefined();
    const positions = shell.getVerticesData("position")!;
    let samples = 0;
    for (let i = 0; i < positions.length; i += 3) {
      if (Math.abs(positions[i]) < 0.1 && positions[i + 1] > -1.1 && positions[i + 1] < 0.5) {
        expect(-positions[i + 2]).toBeLessThanOrEqual(0.301);
        samples++;
      }
    }
    expect(samples).toBeGreaterThan(2);
    expect(root.getChildMeshes().filter(mesh => mesh.name === "driver bucket cushion" || mesh.name === "rear crouching perch")).toHaveLength(2);
  } finally { scene.dispose(); engine.dispose(); }
});

it.each(CHARACTER_IDS)("%s has connected seated anatomy, sculpted facial volumes and deliberately separated finishes", id => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const rider = makeCharacter(new Atelier(scene), id);
    const meshes = rider.root.getChildMeshes();
    expect(rider.root.scaling.asArray()).toEqual([1, 1, 1]);
    expect(rider.head.position.y).toBeLessThanOrEqual(1.1);
    expect(rider.root.getHierarchyBoundingVectors().max.y).toBeLessThan(2);
    expect(meshes.filter(mesh => mesh.name === "eye porcelain")).toHaveLength(2);
    expect(meshes.filter(mesh => mesh.name === "focused pupil")).toHaveLength(2);
    expect(meshes.filter(mesh => mesh.name === "eye catchlight")).toHaveLength(2);
    if (id !== "bollo" && id !== "pompa") {
      expect(meshes.filter(mesh => mesh.name === "connected bent thigh and shin")).toHaveLength(2);
    }
    const feet = meshes.filter(mesh => /^(navy rail boot|mapmaker trail boot|plum court slipper|caiman heavy foot|navy wedge running boot|jerboa long hind foot|oversized plum slipper|orangutan soft foot)$/.test(mesh.name));
    expect(feet).toHaveLength(2);
    for (const foot of feet) {
      foot.computeWorldMatrix(true);
      const bounds = foot.getBoundingInfo().boundingBox;
      expect(bounds.maximumWorld.z).toBeGreaterThan(0.58);
      expect(bounds.minimumWorld.y).toBeLessThan(0.04);
    }
    const finishes = new Set(meshes.filter(mesh => !(mesh.material as StandardMaterial).disableLighting).map(mesh => mesh.material?.metadata?.surfaceFinish));
    expect(finishes.has("paint")).toBe(true);
    expect(finishes.has("fabric")).toBe(true);
    expect(finishes.has("matte")).toBe(false);
    if (id !== "bollo") expect(finishes.has("skin")).toBe(true);
  } finally { scene.dispose(); engine.dispose(); }
});

it.each(WHEEL_IDS)("%s keeps tire tread inside the rolling radius with shared rubber and hub materials", id => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const art = new Atelier(scene), root = new TransformNode("tire study", scene);
    const rig = makeWheels(art, root, id, "#ffd46b");
    expect(rig.steering.map(wheel => wheel.position.z)).toEqual([WHEEL_STANCE.frontZ, WHEEL_STANCE.frontZ]);
    const before = root.getChildMeshes();
    for (const mesh of before.filter(mesh => /carcass|tread/.test(mesh.name))) {
      expect(mesh.material).toBe(art.surface(mesh.name.includes("tread") ? "#35404c" : "#252e3c", "rubber"));
      const positions = mesh.getVerticesData("position")!, normals = mesh.getVerticesData("normal")!;
      if (mesh.name.includes("tread")) for (let i = 0; i < positions.length; i += 3) {
        const radial = Math.hypot(positions[i + 1], positions[i + 2]);
        expect(radial).toBeLessThanOrEqual(WHEEL_RADII[id] + 0.00001);
        if (i / 3 % 8 >= 4) expect(positions[i + 1] * normals[i + 1] + positions[i + 2] * normals[i + 2]).toBeGreaterThan(0);
      }
      if (mesh.name.includes("carcass")) for (let i = 0; i < positions.length; i += 3) {
        if (Math.hypot(positions[i], positions[i + 2]) > WHEEL_RADII[id] - 0.02) {
          expect(positions[i] * normals[i] + positions[i + 2] * normals[i + 2]).toBeGreaterThan(0);
        }
      }
    }
    art.batchModel(root, new Set(), true);
    const wheelMaterials = new Set(root.getChildMeshes().map(mesh => mesh.material as StandardMaterial));
    expect(wheelMaterials.size).toBe(2);
    expect([...wheelMaterials].map(material => material.metadata.surfaceFinish).sort()).toEqual(["metal", "rubber"]);
    for (const roller of rig.rollers) {
      expect(roller.getChildMeshes()).toHaveLength(2);
      const { min, max } = roller.getHierarchyBoundingVectors();
      expect(min.y).toBeCloseTo(-0.43, 2);
      expect(max.y).toBeLessThanOrEqual(2 * WHEEL_RADII[id] - 0.43 + 0.001);
    }
    expect(root.getChildMeshes().reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0)).toBeLessThan(15_000);
  } finally { scene.dispose(); engine.dispose(); }
});

it("uses a shared finish per rigid partition without flattening paint, metal, skin or upholstery into matte", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const art = new Atelier(scene), first = makeKart(art), second = makeKart(art);
    const materials = new Set(first.meshes.filter(mesh => mesh.isEnabled()).map(mesh => mesh.material as StandardMaterial));
    const finishes = new Set([...materials].map(material => material.metadata.surfaceFinish));
    for (const finish of ["rubber", "metal", "paint", "fabric", "skin"]) expect(finishes.has(finish)).toBe(true);
    for (const material of materials) expect(second.meshes.some(mesh => mesh.material === material)).toBe(true);
    const coachwork = first.meshes.filter(mesh => mesh.parent === first.root && mesh.name.startsWith(first.root.name + ":rigid:"));
    expect(coachwork).toHaveLength(4);
    expect(first.root.getChildTransformNodes().some(node => node.metadata?.kind === "coachwork")).toBe(false);
    expect(first.meshes.every(mesh => mesh instanceof Mesh && mesh.isPickable === false)).toBe(true);
  } finally { scene.dispose(); engine.dispose(); }
});
