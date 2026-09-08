import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { makeTowbell } from "./rescue";
import { Atelier } from "./geometry";

it("keeps Towbell's sling, bell and animated propeller in one bounded disposable rig", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const rig = makeTowbell(new Atelier(scene));
    expect(rig.root.isEnabled()).toBe(false);
    expect(rig.root.getChildMeshes().length).toBeLessThanOrEqual(8);
    rig.root.setEnabled(true);
    rig.root.position.set(20, 3, -12);
    rig.rotor.rotation.y = 1.5;
    for (const mesh of rig.root.getChildMeshes()) {
      mesh.computeWorldMatrix(true);
      expect(mesh.getVerticesData("position")?.every(Number.isFinite)).toBe(true);
      expect(Vector3.Distance(mesh.getBoundingInfo().boundingBox.centerWorld, rig.root.position)).toBeLessThan(5);
    }
    rig.root.dispose();
    expect(scene.meshes).toHaveLength(0);
    expect(scene.transformNodes).toHaveLength(0);
  } finally { scene.dispose(); engine.dispose(); }
});
