import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
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
