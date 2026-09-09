import { describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { CHARACTER_IDS } from "@kartsick/content";
import type { CharacterId } from "@kartsick/content";
import { Atelier } from "./geometry";
import { makeCharacter } from "./characters";
import { finishModel, RIDER_GRIPS, RIDER_MOUNT } from "./characters/rig";

// Measured from the checked-out cast immediately before this sculpting pass.
const ORIGINAL_BUDGET = {
  clutch: { vertices: 13568, materials: 23, batches: 12 },
  bramble: { vertices: 11664, materials: 23, batches: 13 },
  pompa: { vertices: 11101, materials: 23, batches: 10 },
  bront: { vertices: 11140, materials: 16, batches: 10 },
  rivet: { vertices: 9445, materials: 13, batches: 10 },
  pipvolt: { vertices: 9602, materials: 15, batches: 14 },
  bollo: { vertices: 6669, materials: 11, batches: 8 },
  hunkle: { vertices: 10801, materials: 19, batches: 10 },
} as const;

const LANDMARKS: Record<CharacterId, { color: string; sculpt: string; back: string }> = {
  clutch: { color: "#ef7949", sculpt: "continuous trapezoid brow cheek and jaw", back: "work coverall shoulder yoke" },
  bramble: { color: "#80986c", sculpt: "long cupped leaf ear", back: "map cape folded across crouched hips" },
  pompa: { color: "#58bfae", sculpt: "middle architectural copper roll", back: "upper architectural copper roll" },
  bront: { color: "#e98671", sculpt: "continuous shovel muzzle and cheek pads", back: "caiman low dorsal scute" },
  rivet: { color: "#bc578b", sculpt: "upright swept turbine vane", back: "mint swept vest back panel" },
  pipvolt: { color: "#e9ae73", sculpt: "broad square jerboa ear", back: "jerboa broad rear ear fold" },
  bollo: { color: "#a9d2ed", sculpt: "compressed triangular pillow with seated haunch", back: "pillow rear envelope fold" },
  hunkle: { color: "#99b9ac", sculpt: "hunched tailored shoulder", back: "custard sash across jacket back" },
};

function inScene(run: (art: Atelier, scene: Scene) => void): void {
  const engine = new NullEngine(), scene = new Scene(engine);
  try { run(new Atelier(scene), scene); } finally { scene.dispose(); engine.dispose(); }
}

function meshes(root: TransformNode): Mesh[] {
  return root.getChildMeshes().filter((mesh): mesh is Mesh => mesh instanceof Mesh);
}

function validateGeometry(mesh: Mesh): void {
  const count = mesh.getTotalVertices();
  for (const [attribute, width] of [["position", 3], ["normal", 3], ["uv", 2]] as const) {
    const data = mesh.getVerticesData(attribute)!;
    expect(data.length, `${mesh.name} ${attribute}`).toBe(count * width);
    expect(data.every(Number.isFinite), `${mesh.name} ${attribute}`).toBe(true);
  }
  const normals = mesh.getVerticesData("normal")!;
  let minimum = Infinity, maximum = 0;
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    minimum = Math.min(minimum, length); maximum = Math.max(maximum, length);
  }
  expect(minimum, `${mesh.name} cancelling normal`).toBeGreaterThan(0.99);
  expect(maximum, `${mesh.name} normal length`).toBeLessThan(1.01);
  expect(Array.from(mesh.getIndices()!).every(index => index >= 0 && index < count)).toBe(true);
}

function validateClosedSculpt(mesh: Mesh): void {
  const positions = mesh.getVerticesData("position")!, normals = mesh.getVerticesData("normal")!;
  const indices = mesh.getIndices()!;
  let volume = 0, minimumArea = Infinity, minimumAlignment = Infinity;
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]].map(index => Vector3.FromArray(positions, index * 3));
    const outward = Vector3.Cross(c.subtract(a), b.subtract(a));
    const area = outward.length();
    minimumArea = Math.min(minimumArea, area);
    const normal = new Vector3();
    for (let corner = 0; corner < 3; corner++) normal.addInPlace(Vector3.FromArray(normals, indices[i + corner] * 3));
    minimumAlignment = Math.min(minimumAlignment, Vector3.Dot(outward.normalize(), normal.normalize()));
    volume += Vector3.Dot(a, Vector3.Cross(b, c)) / 6;
  }
  expect(minimumArea, `${mesh.name} degenerate pole/cap`).toBeGreaterThan(1e-10);
  expect(minimumAlignment, `${mesh.name} inward face`).toBeGreaterThan(0);
  // Babylon's LH winding is the reverse of the conventional RH signed volume.
  expect(volume, `${mesh.name} LH closed volume`).toBeLessThan(-1e-7);
  const count = mesh.getTotalVertices();
  expect(normals[(count - 2) * 3 + 1], `${mesh.name} lower cap`).toBeLessThan(-0.99);
  expect(normals[(count - 1) * 3 + 1], `${mesh.name} upper cap`).toBeGreaterThan(0.99);
}

function visibleSamples(feature: Mesh, actor: Mesh[], towardCamera: Vector3): number {
  const positions = feature.getVerticesData("position")!, indices = feature.getIndices()!;
  const matrix = feature.computeWorldMatrix(true);
  const stride = Math.max(1, Math.floor(indices.length / 3 / 60)) * 3;
  let visible = 0;
  for (let i = 0; i < indices.length; i += stride) {
    const target = new Vector3();
    for (let corner = 0; corner < 3; corner++) target.addInPlace(Vector3.FromArray(positions, indices[i + corner] * 3));
    const world = Vector3.TransformCoordinates(target.scale(1 / 3), matrix);
    const ray = new Ray(world.add(towardCamera.scale(4)), towardCamera.negate(), 5);
    const hits = ray.intersectsMeshes(actor);
    if (hits[0]?.pickedMesh === feature) visible++;
  }
  return visible;
}

describe("authored character art", () => {
  it("measures the complete cast and bounds its shared rendering resources", () => {
    inScene((art, scene) => {
      const metrics = CHARACTER_IDS.map(id => {
        const rider = makeCharacter(art, id);
        rider.root.position.y = RIDER_MOUNT.y;
        rider.pose(0, 0, 0, true, 0);
        const source = meshes(rider.root);
        const vertices = source.reduce((total, mesh) => total + mesh.getTotalVertices(), 0);
        const materials = new Set(source.map(mesh => mesh.material)).size;
        const bounds = rider.root.getHierarchyBoundingVectors();
        art.batchModel(rider.root, new Set(), true);
        const batches = rider.root.getChildMeshes().length;
        expect(vertices).toBeLessThan(ORIGINAL_BUDGET[id].vertices);
        expect(materials).toBeLessThanOrEqual(ORIGINAL_BUDGET[id].materials + 1);
        expect(batches).toBe(ORIGINAL_BUDGET[id].batches);
        expect(meshes(rider.root).reduce((total, mesh) => total + mesh.getTotalVertices(), 0)).toBe(vertices);
        expect(bounds.min.x).toBeGreaterThan(-0.9);
        expect(bounds.max.x).toBeLessThan(0.9);
        expect(bounds.min.y).toBeGreaterThan(0.23);
        expect(bounds.max.y).toBeLessThan(2.25);
        expect(bounds.min.z).toBeGreaterThan(-0.87);
        expect(bounds.max.z).toBeLessThan(0.81);
        return { id, vertices, materials, batches, min: bounds.min.asArray(), max: bounds.max.asArray() };
      });
      expect(scene.materials.length).toBeLessThanOrEqual(210);
      console.info(JSON.stringify({ metrics, cachedMaterials: scene.materials.length }));
      for (const mesh of scene.meshes) validateGeometry(mesh as Mesh);
    });
  });

  it.each(CHARACTER_IDS)("keeps %s's shaped silhouette and back landmark visible with correct LH normals", id => {
    inScene(art => {
      const sculpts = vi.spyOn(art, "sculpt");
      const rider = makeCharacter(art, id), actor = meshes(rider.root);
      rider.root.position.y = RIDER_MOUNT.y;
      rider.pose(0, 0, 0, true, 0);
      for (const mesh of actor) {
        mesh.computeWorldMatrix(true);
        validateGeometry(mesh);
      }
      const palette = actor.map(mesh => (mesh.material as StandardMaterial).diffuseColor.toHexString().toLowerCase());
      expect(palette).toContain(LANDMARKS[id].color);
      const sculpt = actor.filter(mesh => mesh.name === LANDMARKS[id].sculpt);
      expect(sculpt.length).toBeGreaterThan(0);
      for (const result of sculpts.mock.results) {
        expect(result.type).toBe("return");
        validateClosedSculpt(result.value as Mesh);
      }
      sculpts.mockRestore();
      const backs = actor.filter(mesh => mesh.name === LANDMARKS[id].back);
      expect(backs.length).toBeGreaterThan(0);
      const visible = backs.reduce((total, mesh) => total + visibleSamples(mesh, actor, new Vector3(0, 0.35, -1).normalize()), 0);
      expect(visible, `${id} chase-camera landmark buried inside the body`).toBeGreaterThan(3);
      for (const eye of actor.filter(mesh => mesh.name === "eye porcelain")) {
        validateClosedSculpt(eye);
        const bounds = eye.getBoundingInfo().boundingBox;
        expect(bounds.maximumWorld.z - bounds.minimumWorld.z, "eyes sit in shallow sockets, not projecting beads").toBeLessThan(.035);
        expect(visibleSamples(eye, actor, new Vector3(0, 0.03, 1).normalize()),
          `${id} eye buried behind brow/muzzle`).toBeGreaterThan(2);
      }
      for (const eye of actor.filter(mesh => mesh.name === "separate iris" || mesh.name === "focused pupil")) {
        expect(visibleSamples(eye, actor, new Vector3(0, 0.03, 1).normalize()),
          `${id} colored eye layer buried after fitting the socket`).toBeGreaterThan(2);
      }
    });
  });

  it("preserves three interlocking hair rolls, broad ears, five turbine vanes, and the tiny ape head", () => {
    inScene(art => {
      const pompa = makeCharacter(art, "pompa");
      const rolls = meshes(pompa.accent).filter(mesh => mesh.name.includes("architectural copper roll"));
      expect(rolls).toHaveLength(3);
      for (let i = 1; i < rolls.length; i++) {
        const before = rolls[i - 1].getBoundingInfo().boundingBox;
        const after = rolls[i].getBoundingInfo().boundingBox;
        expect(before.maximum.y - after.minimum.y).toBeGreaterThan(0.09);
        expect(after.extendSize.x / before.extendSize.x, "rolled bouffant must not taper into a cone").toBeGreaterThan(0.85);
      }
      const pompaMeshes = meshes(pompa.root);
      for (const mesh of pompaMeshes) mesh.computeWorldMatrix(true);
      const channels = pompaMeshes.filter(mesh => mesh.name === "bouffant rolled back channel");
      expect(channels).toHaveLength(3);
      for (const channel of channels) {
        expect(visibleSamples(channel, pompaMeshes, new Vector3(0, 0.35, -1).normalize()),
          "each hair roll needs an exposed rear scroll, not buried front-only strands").toBeGreaterThan(3);
      }
      const rivet = makeCharacter(art, "rivet");
      const vanes = meshes(rivet.accent).filter(mesh => mesh.name === "upright swept turbine vane");
      expect(vanes).toHaveLength(5);
      for (const vane of vanes) {
        const size = vane.getBoundingInfo().boundingBox.extendSize.scale(2);
        expect(size.z / size.x, "a turbine blade, not a round quill").toBeGreaterThan(2);
      }
      const pipvolt = makeCharacter(art, "pipvolt");
      const ears = meshes(pipvolt.accent).filter(mesh => mesh.name === "broad square jerboa ear");
      expect(ears).toHaveLength(2);
      expect(ears[0].rotation.z).not.toBe(ears[1].rotation.z);
      for (const ear of ears) {
        const vertices = ear.getVerticesData("position")!;
        const upper: number[] = [];
        for (let i = 0; i < vertices.length; i += 3) if (vertices[i + 1] > 0.5) upper.push(vertices[i]);
        expect(Math.max(...upper) - Math.min(...upper)).toBeGreaterThan(0.3);
      }
      const hunkle = makeCharacter(art, "hunkle");
      const skull = meshes(hunkle.head).find(mesh => mesh.name === "small buried orangutan skull")!;
      const shoulders = meshes(hunkle.root).filter(mesh => mesh.name === "hunched tailored shoulder");
      expect(shoulders).toHaveLength(2);
      const shoulderWidth = Math.max(...shoulders.map(mesh => mesh.getBoundingInfo().boundingBox.maximum.x)) -
        Math.min(...shoulders.map(mesh => mesh.getBoundingInfo().boundingBox.minimum.x));
      expect(shoulderWidth / (skull.getBoundingInfo().boundingBox.extendSize.x * 2)).toBeGreaterThan(3);
    });
  });

  it.each(CHARACTER_IDS)("preserves %s's planted grips, independent swap rig and reduced-motion pose after batching", id => {
    inScene((art, scene) => {
      const rider = makeCharacter(art, id);
      const baseHead = rider.head.rotation.clone(), baseAccent = rider.accent.rotation.clone();
      art.batchModel(rider.root, new Set(), true);
      const resources = [scene.meshes.length, scene.materials.length, scene.geometries.length, scene.transformNodes.length];
      for (const front of [0, 0.25, 0.5, 0.75, 1]) for (const steer of [-1, 0, 1]) {
        const swapping = front > 0 && front < 1 ? Math.sin(front * Math.PI) : 0;
        rider.root.position.set(swapping * 0.7, RIDER_MOUNT.y + (swapping ? 0.15 * swapping : 0.01),
          RIDER_MOUNT.rearZ + (RIDER_MOUNT.frontZ - RIDER_MOUNT.rearZ) * front);
        rider.root.rotation.z = steer * 0.095;
        rider.pose(front, steer, 37, false, swapping);
        const hands = rider.root.getChildTransformNodes(true).filter(child => child.name === "gripping hand");
        expect(hands).toHaveLength(2);
        for (const hand of hands) {
          hand.computeWorldMatrix(true);
          const targetX = RIDER_GRIPS.rear.x + (RIDER_GRIPS.front.x - RIDER_GRIPS.rear.x) * front;
          const targetY = RIDER_GRIPS.rear.y + (RIDER_GRIPS.front.y - RIDER_GRIPS.rear.y) * front;
          const targetZ = RIDER_GRIPS.rear.z + (RIDER_GRIPS.front.z - RIDER_GRIPS.rear.z) * front;
          const position = hand.getAbsolutePosition();
          expect(Math.abs(position.x - rider.root.position.x)).toBeCloseTo(targetX);
          expect(position.y).toBeCloseTo(targetY + (swapping ? 0.15 * swapping : 0));
          expect(position.z).toBeCloseTo(targetZ);
        }
        for (const node of rider.root.getChildTransformNodes()) expect(Array.from(node.computeWorldMatrix(true).m).every(Number.isFinite)).toBe(true);
      }
      rider.pose(1, 1, 300, true, 0);
      expect(rider.head.rotation.equals(baseHead)).toBe(true);
      expect(rider.accent.rotation.equals(baseAccent)).toBe(true);
      if (id === "bollo") expect(rider.head.scaling.equals(Vector3.One())).toBe(true);
      expect(rider.root.metadata).toEqual({ kind: "rider", characterId: id });
      expect(rider.head.metadata).toEqual({ kind: "head", characterId: id });
      expect([scene.meshes.length, scene.materials.length, scene.geometries.length, scene.transformNodes.length]).toEqual(resources);
    });
  });

  it("reuses immutable finishes across two full grids without disposing another rider's materials", () => {
    inScene((art, scene) => {
      const first = CHARACTER_IDS.map(id => makeCharacter(art, id));
      for (const rider of first) art.batchModel(rider.root, new Set(), true);
      const materialCount = scene.materials.length;
      const surfaces = scene.materials.map(material => ({
        material, color: (material as StandardMaterial).diffuseColor.toHexString(), finish: material.metadata?.surfaceFinish,
      }));
      const second = CHARACTER_IDS.map(id => makeCharacter(art, id));
      for (const rider of second) art.batchModel(rider.root, new Set(), true);
      expect(scene.materials.length).toBe(materialCount);
      const vertices = [...first, ...second].flatMap(rider => meshes(rider.root)).reduce((total, mesh) => total + mesh.getTotalVertices(), 0);
      expect(vertices).toBeLessThan(145_000);
      expect(scene.meshes.length).toBe(174);
      for (const rider of first) rider.root.dispose();
      expect(scene.materials.length).toBe(materialCount);
      for (const { material, color, finish } of surfaces) {
        expect(scene.materials).toContain(material);
        expect((material as StandardMaterial).diffuseColor.toHexString()).toBe(color);
        expect(material.metadata?.surfaceFinish).toBe(finish);
      }
      for (const rider of second) {
        rider.pose(1, 0.5, 12, false, 0.5);
        expect(meshes(rider.root).every(mesh => !mesh.isDisposed())).toBe(true);
        rider.root.dispose();
      }
      expect(scene.meshes).toHaveLength(0);
      expect(scene.geometries).toHaveLength(0);
      expect(scene.transformNodes).toHaveLength(0);
    });
  });

  it("leaves textured and two-sided art out of finish conversion and vertex-color batching", () => {
    inScene((art, scene) => {
      const rider = makeCharacter(art, "bramble");
      const texture = new Texture(null, scene);
      const textured = new StandardMaterial("character fabric pattern", scene);
      textured.metadata = { surfaceFinish: "matte" };
      textured.diffuseTexture = texture;
      const twoSided = new StandardMaterial("character two-sided cloth", scene);
      twoSided.metadata = { surfaceFinish: "matte" };
      twoSided.backFaceCulling = false;
      art.box("textured swatch", [0, 0.5, -0.4], [0.1, 0.1, 0.01], "#ffffff", rider.root).material = textured;
      art.box("two-sided swatch", [0.2, 0.5, -0.4], [0.1, 0.1, 0.01], "#ffffff", rider.root).material = twoSided;
      finishModel(art, rider.root, "fabric");
      art.batchModel(rider.root, new Set(), true);
      expect(meshes(rider.root).filter(mesh => mesh.material === textured)).toHaveLength(1);
      expect(meshes(rider.root).filter(mesh => mesh.material === twoSided)).toHaveLength(1);
      expect(textured.diffuseTexture).toBe(texture);
      expect(twoSided.backFaceCulling).toBe(false);
      rider.root.dispose();
      expect(scene.materials).toContain(textured);
      expect(scene.materials).toContain(twoSided);
      expect(scene.textures).toContain(texture);
    });
  });
});
