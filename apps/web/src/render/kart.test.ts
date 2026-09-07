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
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
