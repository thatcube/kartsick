import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { BODY_IDS, CHARACTER_IDS, DECAL_IDS, DEFAULT_BUILD, GLIDER_IDS, PAINT_IDS, WHEEL_IDS } from "@kartsick/content";
import type { KartBuild } from "@kartsick/content";
import { createKart, NEUTRAL } from "@kartsick/simulation";
import { Atelier } from "./geometry";
import { makeKart } from "./kart";

it("batches the original kart and characters without losing vertex attributes or rig ownership", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const model = makeKart(new Atelier(scene));
    expect(model.meshes.length).toBeLessThan(90);
    const state = createKart();
    state.mode = "glider";
    for (let i = 0; i < 30; i++) model.animate(state, { ...NEUTRAL }, 1 / 60, false);
    expect(model.root.getChildren().some(node => node.name === "Mapwing assembly" && node.isEnabled())).toBe(true);
    for (const mesh of model.meshes) {
      const vertices = mesh.getVerticesData("position");
      expect(vertices?.every(Number.isFinite)).toBe(true);
      expect(mesh.getVerticesData("uv")?.length).toBe(mesh.getTotalVertices() * 2);
      expect(mesh.getVerticesData("normal")?.every(Number.isFinite)).toBe(true);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

function inScene(run: (art: Atelier, scene: Scene) => void): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try { run(new Atelier(scene), scene); } finally { scene.dispose(); engine.dispose(); }
}

function validMesh(mesh: Mesh): void {
  const vertices = mesh.getTotalVertices();
  expect(vertices).toBeGreaterThan(0);
  for (const [attribute, width] of [["position", 3], ["normal", 3], ["uv", 2]] as const) {
    const data = mesh.getVerticesData(attribute)!;
    expect(data.length, `${mesh.name} ${attribute}`).toBe(vertices * width);
    expect(data.every(Number.isFinite), `${mesh.name} ${attribute}`).toBe(true);
  }
  const normals = mesh.getVerticesData("normal")!;
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    expect(length, `${mesh.name} normal ${i / 3}`).toBeGreaterThan(0.5);
    expect(length).toBeLessThan(1.01);
  }
  expect(Array.from(mesh.getIndices()!).every(index => index >= 0 && index < vertices)).toBe(true);
}

describe("complete approved asset roster", () => {
  it.each(BODY_IDS)("renders %s with sculpted, finite geometry within its production budget", body => {
    inScene(art => {
      const index = BODY_IDS.indexOf(body);
      const build: KartBuild = {
        characters: [CHARACTER_IDS[index], CHARACTER_IDS[(index + 1) % CHARACTER_IDS.length]],
        body, wheels: WHEEL_IDS[index % WHEEL_IDS.length], glider: GLIDER_IDS[index % GLIDER_IDS.length],
        paint: "original", decal: "chevrons",
      };
      const model = makeKart(art, build);
      expect(model.meshes.length).toBeLessThanOrEqual(35);
      expect(model.meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0)).toBeLessThanOrEqual(100_000);
      for (const mesh of model.meshes) validMesh(mesh);
      expect(model.meshes.some(mesh => mesh.getVerticesData("color")?.some(value => value > 0 && value < 1))).toBe(true);
      expect(model.root.metadata.bodyId).toBe(body);
    });
  });

  it.each(CHARACTER_IDS)("keeps %s's identity and grips for every distinct partner and either seat", character => {
    inScene(art => {
      for (const partner of CHARACTER_IDS.filter(id => id !== character)) {
        const model = makeKart(art, { ...DEFAULT_BUILD, characters: [character, partner] });
        const riders = model.root.getChildTransformNodes(true).filter(child => child.metadata?.kind === "rider");
        expect(riders).toHaveLength(2);
        expect(riders.map(rider => rider.metadata.characterId)).toEqual([character, partner]);
        const state = createKart();
        for (const driver of [0, 1] as const) {
          state.driver = driver;
          state.swapTime = 0;
          model.animate(state, { ...NEUTRAL }, 1 / 60, true);
          for (const [index, rider] of riders.entries()) {
            const front = index === driver;
            const hands = rider.getChildTransformNodes(true).filter(child => child.name === "gripping hand");
            expect(hands).toHaveLength(2);
            for (const hand of hands) {
              hand.computeWorldMatrix(true);
              const world = hand.getAbsolutePosition();
              expect(world.y).toBeCloseTo(front ? 1.13 : 1.02);
              expect(world.z).toBeCloseTo(front ? 0.72 : -1.2);
              expect(Math.abs(world.x)).toBeCloseTo(front ? 0.255 : 0.55);
            }
          }
          for (const time of [0.419, 0.21, 0.001]) {
            state.swapTime = time;
            model.animate(state, { ...NEUTRAL, steer: 0.8 }, 1 / 60, false);
            const positions = riders.map(rider => rider.position);
            expect(Vector3.Distance(positions[0], positions[1])).toBeGreaterThan(1);
            for (const node of model.root.getChildTransformNodes()) expect(Array.from(node.computeWorldMatrix(true).m).every(Number.isFinite)).toBe(true);
          }
        }
        model.root.dispose();
      }
    });
  });

  it.each(GLIDER_IDS)("deploys the selected %s canopy and folds it on landing", glider => {
    inScene(art => {
      const model = makeKart(art, { ...DEFAULT_BUILD, glider });
      const wing = model.root.getChildTransformNodes(true).find(node => node.metadata?.gliderId === glider)!;
      expect(wing.isEnabled()).toBe(false);
      const state = createKart();
      state.mode = "glider";
      for (let i = 0; i < 60; i++) model.animate(state, { ...NEUTRAL }, 1 / 60, false);
      expect(wing.isEnabled()).toBe(true);
      expect(wing.scaling.x).toBeGreaterThan(0.99);
      const [min, max] = [wing.getHierarchyBoundingVectors().min, wing.getHierarchyBoundingVectors().max];
      expect(max.x - min.x).toBeGreaterThan(3.9);
      expect(max.z - min.z).toBeGreaterThan(1.2);
      state.mode = "ground";
      model.animate(state, { ...NEUTRAL }, 1 / 60, true);
      expect(wing.isEnabled()).toBe(false);
    });
  });

  it.each(WHEEL_IDS)("renders four matching %s wheels with a stable ground plane", wheels => {
    inScene(art => {
      const model = makeKart(art, { ...DEFAULT_BUILD, wheels });
      const rollers = model.root.getChildTransformNodes().filter(node => node.metadata?.kind === "wheel");
      expect(rollers).toHaveLength(4);
      expect(rollers.every(node => node.metadata.wheelId === wheels)).toBe(true);
      for (const roller of rollers) expect((roller.parent as TransformNode).position.y - roller.metadata.radius).toBeCloseTo(-0.43);
      const state = createKart();
      state.speed = 20;
      model.animate(state, { ...NEUTRAL, steer: 0.5 }, 1 / 60, true);
      expect(rollers.every(roller => Math.abs(roller.rotation.x) > 0)).toBe(true);
    });
  });

  it("never recolors characters, leaks materials per frame, or disposes another racer's resources", () => {
    inScene((art, scene) => {
      const first = makeKart(art);
      const riderColors = (root: TransformNode) => root.getChildTransformNodes(true)
        .filter(node => node.metadata?.kind === "rider")
        .map(node => node.getChildMeshes().map(mesh => Array.from(mesh.getVerticesData("color") ?? [])).flat());
      const colors = riderColors(first.root);
      const second = makeKart(art, { ...DEFAULT_BUILD, body: "gilt-trip", paint: "midnight", decal: "checks" });
      expect(riderColors(second.root)).toEqual(colors);
      const meshCount = scene.meshes.length, materialCount = scene.materials.length;
      const state = createKart();
      state.mode = "glider";
      state.boost = 1;
      state.driftDirection = 1;
      for (let i = 0; i < 120; i++) {
        state.tick = i;
        state.driftCharge = (i % 3 + 1) as 1 | 2 | 3;
        second.animate(state, { ...NEUTRAL }, 1 / 60, false, { invincible: true, shrunk: true, ghost: true, velvetBumpers: 2, staticCharges: 1 });
      }
      expect(scene.meshes.length).toBe(meshCount);
      expect(scene.materials.length).toBe(materialCount);
      expect(second.root.scaling.x).toBe(0.62);
      expect(first.root.scaling.x).toBe(1);
      expect(first.meshes.every(mesh => mesh.visibility === 1)).toBe(true);
      expect(second.root.getChildTransformNodes().filter(node => node.metadata?.kind === "velvet-bumper" && node.isEnabled())).toHaveLength(2);
      expect(second.meshes.filter(mesh => mesh.name.startsWith("Static charge") && mesh.isEnabled())).toHaveLength(1);
      const materials = new Set(first.meshes.map(mesh => mesh.material));
      second.root.dispose();
      first.animate(state, { ...NEUTRAL }, 1 / 60, true);
      expect(first.meshes.every(mesh => !mesh.isDisposed())).toBe(true);
      expect([...materials].every(material => scene.materials.includes(material!))).toBe(true);
      expect(riderColors(first.root)).toEqual(colors);
    });
  });

  it("keeps both riders' hands on their controls during full-speed body lean", () => {
    inScene(art => {
      const model = makeKart(art, { ...DEFAULT_BUILD, characters: ["hunkle", "pipvolt"] });
      const state = createKart();
      state.speed = 90;
      for (const tick of [1, 27, 92]) {
        state.tick = tick;
        model.animate(state, { ...NEUTRAL, steer: 1 }, 1 / 60, false);
        const riders = model.root.getChildTransformNodes(true).filter(node => node.metadata?.kind === "rider");
        for (let i = 0; i < riders.length; i++) for (const hand of riders[i].getChildTransformNodes(true).filter(node => node.name === "gripping hand")) {
          hand.computeWorldMatrix(true);
          const world = hand.getAbsolutePosition();
          expect(world.y).toBeCloseTo(i === 0 ? 1.13 : 1.02);
          expect(world.z).toBeCloseTo(i === 0 ? 0.72 : -1.2);
          expect(Math.abs(world.x)).toBeCloseTo(i === 0 ? 0.255 : 0.55);
        }
      }
    });
  });

  it("renders all paints and decals as geometry/color, rather than label-only changes", () => {
    inScene(art => {
      const bodyColors = new Set<string>(), decalVertexCounts = new Set<number>();
      for (const paint of PAINT_IDS) {
        const model = makeKart(art, { ...DEFAULT_BUILD, paint });
        const hull = model.meshes.find(mesh => mesh.name.startsWith(model.root.name + ":rigid:"))!;
        bodyColors.add(JSON.stringify(hull.getVerticesData("color")));
        model.root.dispose();
      }
      for (const decal of DECAL_IDS) {
        const model = makeKart(art, { ...DEFAULT_BUILD, decal });
        decalVertexCounts.add(model.meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0));
        model.root.dispose();
      }
      expect(bodyColors.size).toBe(PAINT_IDS.length);
      expect(decalVertexCounts.size).toBe(DECAL_IDS.length);
    });
  });

  it("owns eight concurrent racers independently, including when one racer is rebuilt", () => {
    inScene(art => {
      const models = BODY_IDS.map((body, i) => makeKart(art, {
        ...DEFAULT_BUILD, body, characters: [CHARACTER_IDS[i], CHARACTER_IDS[(i + 3) % 8]],
        wheels: WHEEL_IDS[i % 6], glider: GLIDER_IDS[i % 4],
      }));
      for (let i = 0; i < models.length; i++) models[i].root.position.x = i * 4;
      const geometries = models.map(model => new Set(model.meshes.map(mesh => mesh.geometry)));
      expect(models.reduce((sum, model) => sum + model.meshes.length, 0)).toBeLessThanOrEqual(8 * 35);
      expect([...geometries[0]].some(geometry => geometries[1].has(geometry))).toBe(false);
      models[3].root.dispose();
      const replacement = makeKart(art, { ...DEFAULT_BUILD, body: "air-pocket" });
      for (const [i, model] of models.entries()) if (i !== 3) {
        model.animate(createKart(), { ...NEUTRAL }, 1 / 60, true);
        expect(model.meshes.every(mesh => !mesh.isDisposed())).toBe(true);
        expect(model.root.position.x).toBe(i * 4);
      }
      replacement.root.dispose();
    });
  });

  it("keeps useful swap and drift tells while removing decorative motion", () => {
    inScene(art => {
      const model = makeKart(art, { ...DEFAULT_BUILD, characters: ["pompa", "bollo"] });
      const state = createKart();
      state.speed = 30; state.swapTime = 0.21; state.driver = 1; state.boost = 1; state.driftDirection = 1; state.driftCharge = 3;
      model.animate(state, { ...NEUTRAL, steer: 1 }, 1 / 60, true, { velvetBumpers: 3 });
      const before = model.root.getChildTransformNodes().map(node => Array.from(node.computeWorldMatrix(true).m));
      state.tick += 47;
      model.animate(state, { ...NEUTRAL, steer: 1 }, 1 / 60, true, { velvetBumpers: 3 });
      // Wheel rotation is functional motion and deliberately continues.
      const nodes = model.root.getChildTransformNodes();
      for (let i = 0; i < nodes.length; i++) if (!nodes[i].name.includes("wheel rotation")) expect(Array.from(nodes[i].computeWorldMatrix(true).m)).toEqual(before[i]);
      expect(model.meshes.filter(mesh => mesh.name === "drift tell" && mesh.isEnabled())).toHaveLength(2);
    });
  });

  it("shrinks around the tire contact plane and restores without cumulative offsets", () => {
    inScene(art => {
      const model = makeKart(art, { ...DEFAULT_BUILD, wheels: "spool" });
      model.root.position.y = 0.43;
      const rollers = model.root.getChildTransformNodes().filter(node => node.metadata?.kind === "wheel");
      for (const shrunk of [false, true, true, false, true, false]) {
        model.animate(createKart(), { ...NEUTRAL }, 1 / 60, true, { shrunk });
        for (const roller of rollers) {
          roller.computeWorldMatrix(true);
          expect(roller.getAbsolutePosition().y - roller.metadata.radius * model.root.scaling.x).toBeCloseTo(0);
        }
        expect(model.root.position.y).toBe(0.43);
      }
    });
  });
});

describe("opt-in vertex color batching", () => {
  it("sculpts outward-facing closed surfaces using Babylon's left-handed winding", () => {
    inScene((art, scene) => {
      const root = new TransformNode("sculpt test", scene);
      const mesh = art.sculpt("smooth cylinder", [[-1, 0.5, 0.5], [0, 0.5, 0.5], [1, 0.5, 0.5]], "#ffffff", root);
      const positions = mesh.getVerticesData("position")!, normals = mesh.getVerticesData("normal")!;
      for (let i = 0; i < positions.length; i += 3) {
        if (Math.abs(positions[i + 1]) < 0.5) expect(positions[i] * normals[i] + positions[i + 2] * normals[i + 2]).toBeGreaterThan(0.45);
      }
      expect(normals[normals.length - 5]).toBeLessThan(-0.9);
      expect(normals[normals.length - 2]).toBeGreaterThan(0.9);
    });
  });

  it("preserves UVs, transformed normals, glow and transparent/textured exceptions", () => {
    inScene((art, scene) => {
      const root = new TransformNode("colored model", scene);
      root.position.set(3, 2, -4); root.rotation.y = 0.7;
      const red = art.oval("red", [-0.4, 0, 0], [0.4, 0.6, 0.3], "#ff0000", root, 0.7);
      const blue = art.oval("blue", [0.4, 0, 0], [0.4, 0.6, 0.3], "#0000ff", root, 0.7);
      const before = red.getTotalVertices() + blue.getTotalVertices();
      const lit = art.box("glowing", [0, 1, 0], [0.1, 0.1, 0.1], "#00ff00", root);
      lit.material = art.material("#00ff00", true);
      const transparent = new StandardMaterial("transparent exception", scene);
      transparent.alpha = 0.5;
      transparent.diffuseColor = Color3.Red();
      const glass = art.box("glass", [0, 0, 1], [0.4, 0.4, 0.1], "#ffffff", root);
      glass.material = transparent;
      const textured = new StandardMaterial("textured exception", scene);
      textured.diffuseTexture = RawTexture.CreateRGBATexture(new Uint8Array([255, 255, 255, 255]), 1, 1, scene, false);
      const sign = art.box("textured", [0, 0, -1], [0.3, 0.3, 0.1], "#ffffff", root);
      sign.material = textured;
      art.batchModel(root, new Set(), true);
      const solid = root.getChildMeshes().find(mesh => mesh.getTotalVertices() === before)!;
      expect(solid.parent).toBe(root);
      expect(solid.getVerticesData("color")!.some(value => value === 0)).toBe(true);
      expect(solid.getVerticesData("uv")!.some(value => value > 0)).toBe(true);
      expect(glass.material).toBe(transparent);
      expect(sign.material).toBe(textured);
      expect((lit.material as StandardMaterial).disableLighting).toBe(true);
      for (const mesh of root.getChildMeshes()) validMesh(mesh as Mesh);
    });
  });

  it("keeps default static scenery batching unchanged", () => {
    inScene(art => {
      art.box("world red", [0, 0, 0], [1, 1, 1], "#ff0000");
      art.box("world red two", [1, 0, 0], [1, 1, 1], "#ff0000");
      art.box("world blue", [0, 0, 1], [1, 1, 1], "#0000ff");
      const staticMeshes = art.finishStatic();
      expect(staticMeshes).toHaveLength(2);
      expect(staticMeshes.every(mesh => mesh.isWorldMatrixFrozen)).toBe(true);
      expect(art.material("#ff0000").diffuseColor.toHexString()).toBe("#FF0000");
    });
  });
});

it("gives both riders a steering grip and a separate rear-rail pose through a swap", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const model = makeKart(new Atelier(scene));
    const state = createKart();
    for (const driver of [0, 1] as const) {
      state.driver = driver;
      model.animate(state, { ...NEUTRAL }, 1 / 60, true);
      const rider = scene.getTransformNodeByName(driver === 0 ? "Clutch" : "Bramble")!;
      const hands = rider.getChildTransformNodes(true).filter(node => node.name === "gripping hand");
      expect(hands).toHaveLength(2);
      for (const hand of hands) {
        expect(hand.position.y + rider.position.y).toBeCloseTo(1.13);
        expect(hand.position.z + rider.position.z).toBeCloseTo(0.72);
      }
    }
    state.swapTime = 0.21;
    model.animate(state, { ...NEUTRAL }, 1 / 60, false);
    for (const node of model.root.getChildTransformNodes()) {
      expect(Array.from(node.computeWorldMatrix(true).m).every(Number.isFinite)).toBe(true);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
