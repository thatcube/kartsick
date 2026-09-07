import { expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { ESCALUNA } from "../../../../packages/content-layouts/escaluna";
import { createLayoutQuery } from "../../../../packages/content-layouts/query";
import { Atelier } from "./geometry";
import { buildCourseSurface } from "./course-surface";

it("faces terrain, paved lanes, curbs and rough shortcuts upward in Babylon's left-handed scene", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const canvas = vi.spyOn(engine, "createCanvas").mockImplementation(() => ({
    width: 1, height: 1, getContext: () => ({ fillRect() {} }),
  } as unknown as ReturnType<NullEngine["createCanvas"]>));
  try {
    buildCourseSurface(new Atelier(scene), createLayoutQuery(ESCALUNA), ESCALUNA);
    const groups = ["escaluna terrain ", "escaluna main road ", `escaluna ${ESCALUNA.shortcuts[0].id} `];
    for (const prefix of groups) {
      const meshes = scene.meshes.filter(mesh => mesh.name.startsWith(prefix));
      expect(meshes.length, prefix).toBeGreaterThan(0);
      for (const mesh of meshes) {
        const normals = mesh.getVerticesData(VertexBuffer.NormalKind)!;
        for (let offset = 1; offset < normals.length; offset += 3) expect(normals[offset], mesh.name).toBeGreaterThan(0);
      }
    }
  } finally {
    canvas.mockRestore();
    scene.dispose();
    engine.dispose();
  }
});
