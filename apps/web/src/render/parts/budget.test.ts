import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { BODY_IDS, CHARACTER_IDS, DECAL_IDS, DEFAULT_BUILD, GLIDER_IDS, WHEEL_IDS } from "@kartsick/content";
import { Atelier } from "../geometry";
import { makeKart } from "../kart";
import { makeCharacter } from "../characters";
import { bodyPalette, makeBody } from "./bodies";
import { makeWheels } from "./wheels";
import { makeGlider } from "./gliders";

it("bounds every modular combination by the independent part maxima, including the heaviest actual build", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const art = new Atelier(scene);
    const vertices = (root: TransformNode) => root.getChildMeshes().reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0);
    const measure = <T>(choices: readonly T[], build: (id: T, root: TransformNode) => void) => choices.map(id => {
      const root = new TransformNode("part budget", scene);
      build(id, root);
      const result = { id, vertices: vertices(root) };
      root.dispose();
      return result;
    });
    const characters = measure(CHARACTER_IDS, (id, root) => { makeCharacter(art, id).root.parent = root; });
    const bodies = measure(BODY_IDS.flatMap(body => DECAL_IDS.map(decal => ({ body, decal }))), (id, root) => { makeBody(art, root, id.body, "original", id.decal); });
    const wheels = measure(WHEEL_IDS, (id, root) => { makeWheels(art, root, id, "#ffd46b"); });
    const gliders = measure(GLIDER_IDS, (id, root) => { makeGlider(art, root, id, bodyPalette("boiler-bug", "original")); });
    const base = makeKart(art);
    const fixed = vertices(base.root) - characters[0].vertices - characters[1].vertices - bodies[0].vertices - wheels[0].vertices - gliders[0].vertices;
    expect(fixed).toBeGreaterThan(0);
    characters.sort((a, b) => b.vertices - a.vertices);
    bodies.sort((a, b) => b.vertices - a.vertices);
    wheels.sort((a, b) => b.vertices - a.vertices);
    gliders.sort((a, b) => b.vertices - a.vertices);
    const maximum = fixed + characters[0].vertices + characters[1].vertices + bodies[0].vertices + wheels[0].vertices + gliders[0].vertices;
    const worst = makeKart(art, {
      ...DEFAULT_BUILD,
      characters: [characters[0].id, characters[1].id],
      ...bodies[0].id, wheels: wheels[0].id, glider: gliders[0].id,
    });
    expect(vertices(worst.root)).toBe(maximum);
    expect(maximum).toBeLessThan(70_000);
    expect(worst.meshes.length).toBeLessThanOrEqual(56);
  } finally { scene.dispose(); engine.dispose(); }
});
