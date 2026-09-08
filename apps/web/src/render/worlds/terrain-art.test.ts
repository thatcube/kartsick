import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { AFTERGLOW } from "../../../../../packages/content-layouts/afterglow";
import { ESCALUNA } from "../../../../../packages/content-layouts/escaluna";
import { TILTGLASS } from "../../../../../packages/content-layouts/tiltglass";
import { COPPERWHISTLE } from "../../../../../packages/content-layouts/copperwhistle";
import { LASTLIGHT } from "../../../../../packages/content-layouts/lastlight";
import { createLayoutQuery } from "../../../../../packages/content-layouts/query";
import { hazardPosition } from "../../../../../packages/content-layouts/types";
import { Atelier } from "../geometry";
import { hazardApproaches, terrainMaterials } from "./terrain-art";

describe("terrain presentation contracts", () => {
  it.each([AFTERGLOW, ESCALUNA, TILTGLASS, COPPERWHISTLE, LASTLIGHT])("$id warns about physical crossings without allocating animation geometry", layout => {
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const course = createLayoutQuery(layout), art = new Atelier(scene);
      const world = hazardApproaches(art, course, layout.hazards,
        { frame: layout.palette.rail, signal: layout.palette.accent, dark: layout.palette.secondary });
      const counts = [scene.meshes.length, scene.materials.length, scene.transformNodes.length];
      for (let tick = 0; tick < 60; tick++) {
        const time = tick * 0.4;
        world.animate(time);
        for (const hazard of layout.hazards.filter(h => h.motion && h.kind !== "gust")) {
          const road = course.projectRoad(hazard.position[0], hazard.position[2]);
          const node = scene.getTransformNodeByName(`${hazard.id} approach signal`)!;
          const lenses = node.getChildMeshes().filter(mesh => mesh.name === "crossing amber lens");
          expect(lenses).toHaveLength(3);
          const p = hazardPosition(hazard, time);
          const lateral = (p[0] - road.x) * road.dz - (p[2] - road.z) * road.dx;
          if (Math.abs(lateral) < course.roadWidth / 2 + hazard.radius) {
            expect(lenses.map(lens => lens.visibility)).toEqual([1, 1, 1]);
          }
          // All signs are canonical geometry; the scene root is the only mirror transform.
          expect(node.scaling.asArray()).toEqual([1, 1, 1]);
          expect(node.position.y).toBe(road.y);
        }
      }
      expect([scene.meshes.length, scene.materials.length, scene.transformNodes.length]).toEqual(counts);
      for (const mesh of scene.meshes) {
        if (!(mesh instanceof Mesh)) continue;
        expect(mesh.getVerticesData("position")!.every(Number.isFinite)).toBe(true);
        const box = mesh.getBoundingInfo().boundingBox;
        expect(box.maximumWorld.x - box.minimumWorld.x).toBeLessThan(45);
        expect(box.maximumWorld.z - box.minimumWorld.z).toBeLessThan(45);
      }
      expect(world.casters.every(mesh => !mesh.isDisposed())).toBe(true);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  it("changes only terrain color data, never its physical vertices or road material", () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const course = createLayoutQuery(LASTLIGHT), art = new Atelier(scene);
      const positions = [500, course.terrainHeight(500, 160), 160, 508, course.terrainHeight(508, 160), 160,
        500, course.terrainHeight(500, 168), 168];
      const mesh = art.mesh("lastlight terrain test", positions, [0, 2, 1]);
      const road = art.mesh("lastlight main road test", positions, [0, 2, 1]);
      const before = [...mesh.getVerticesData("position")!];
      terrainMaterials(art, course, { low: "#315e61", high: "#f5e5c3", rock: "#be8066", lowY: 0, highY: 400 });
      expect(mesh.getVerticesData("position")).toEqual(before);
      expect(mesh.getVerticesData("color")).toHaveLength(12);
      expect(mesh.getVerticesData("color")!.every(Number.isFinite)).toBe(true);
      expect(road.getVerticesData("color")).toBeNull();
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
