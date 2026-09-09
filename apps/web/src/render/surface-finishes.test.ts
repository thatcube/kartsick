import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Atelier } from "./geometry";
import { reflectionFaces } from "./atmosphere";

describe("original surface finishes", () => {
  it("keeps paint, metal and cloth distinct through vertex-color batching", () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const environment = new Texture(null, scene);
      scene.environmentTexture = environment;
      const art = new Atelier(scene), root = new TransformNode("surface assembly", scene);
      for (const [index, finish] of (["paint", "paint", "metal", "fabric"] as const).entries()) {
        const mesh = art.box("surface", [index, 0, 0], [1, 1, 1], "#ffffff", root);
        mesh.material = art.surface(index ? "#fa543c" : "#61d9b4", finish);
      }
      expect(art.surface("#fa543c", "paint")).toBe(art.surface("#fa543c", "paint"));
      expect(art.surface("#fa543c", "paint")).not.toBe(art.surface("#fa543c", "fabric"));
      art.batchModel(root, new Set(), true);
      const children = root.getChildMeshes().filter((mesh): mesh is Mesh => mesh instanceof Mesh);
      expect(children).toHaveLength(3);
      const materialFor = (finish: string) => {
        const material = children.find(mesh => mesh.material?.metadata?.surfaceFinish === finish)?.material;
        expect(material).toBeInstanceOf(StandardMaterial);
        if (!(material instanceof StandardMaterial)) throw new Error("Missing finish material.");
        return material;
      };
      expect(materialFor("paint").reflectionTexture).toBe(environment);
      expect(materialFor("metal").reflectionFresnelParameters).not.toBeNull();
      expect(materialFor("fabric").reflectionTexture).toBeNull();
      expect(materialFor("paint").roughness).toBeLessThan(materialFor("fabric").roughness);
      expect(materialFor("metal").specularColor.r).toBeGreaterThan(materialFor("paint").specularColor.r);
      expect(art.material("#ffffff", true).reflectionTexture).toBeNull();
      root.dispose();
      expect(scene.textures).toContain(environment);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  it("generates bounded deterministic sky-reflection faces without external assets", () => {
    const sky = Color3.FromHexString("#50c2df"), earth = Color3.FromHexString("#4d6843");
    const faces = reflectionFaces(sky, earth);
    expect(faces).toHaveLength(6);
    expect(faces.every(face => face.length === 32 * 32 * 4)).toBe(true);
    expect(faces).toEqual(reflectionFaces(sky, earth));
    const center = (16 * 32 + 16) * 4;
    expect(faces[2][center + 2]).toBeGreaterThan(faces[3][center + 2]);
    for (const face of faces) for (let i = 3; i < face.length; i += 4) expect(face[i]).toBe(255);
    const indoor = reflectionFaces(sky, earth, "indoor");
    expect(indoor).not.toEqual(faces);
    expect(indoor[0][center]).toBeLessThan(faces[0][center]);
    const mirrored = reflectionFaces(sky, earth, "day", true);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      expect(mirrored[2].slice((y * 32 + x) * 4, (y * 32 + x + 1) * 4))
        .toEqual(faces[2].slice((y * 32 + 31 - x) * 4, (y * 32 + 32 - x) * 4));
    }
  });
});
