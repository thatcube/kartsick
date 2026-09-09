import { Color3 } from "@babylonjs/core/Maths/math.color";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Atelier } from "./geometry";
import { applySurfaceFinish } from "./surface-finishes";

export const BUTTERBELL = {
  cream: "#fff0c6", dairy: "#c94732", darkDairy: "#8d342c", roof: "#287e89",
  roofShadow: "#23535d", iron: "#314750", timber: "#795437", straw: "#deb75c",
  leaf: "#44803d", leafLight: "#77a947", leafShadow: "#2c623c",
} as const;

export function butterbellNoise(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export const BUTTERBELL_TEXTURES = ["asphalt", "pasture", "verge", "siding", "roof", "hay", "yard"] as const;
export type ButterbellTexture = typeof BUTTERBELL_TEXTURES[number];
export const BUTTERBELL_TEXTURE_SIZE = 128;

/** Original, tileable material studies. No image files, asset downloads or random state. */
export function butterbellTexturePixels(kind: ButterbellTexture, size = BUTTERBELL_TEXTURE_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const n = butterbellNoise(x + y * size);
    const grain = n * 2 - 1;
    let r = 0, g = 0, b = 0;
    if (kind === "asphalt") {
      const aggregate = n > .93 ? 5 : n < .05 ? -4 : grain * 2.3;
      const roller = Math.sin(u * Math.PI * 8) * .7;
      r = 104 + aggregate + roller; g = 105 + aggregate + roller; b = 99 + aggregate + roller;
    } else if (kind === "pasture") {
      const tuft = butterbellNoise(Math.floor(x / 7) + Math.floor(y / 5) * 83) * 7 - 3.5;
      const fiber = n > .88 ? 13 : n < .09 ? -12 : grain * 3;
      r = 217 + tuft + fiber; g = 225 + tuft + fiber; b = 195 + tuft + fiber;
    } else if (kind === "verge") {
      const grit = grain * 12 + (n > .95 ? 15 : 0);
      r = 165 + grit; g = 148 + grit; b = 107 + grit;
    } else if (kind === "siding") {
      const joint = x % (size / 8) < 1 ? -33 : x % (size / 8) < 3 ? 8 : 0;
      const fiber = Math.sin((u * 75 + Math.sin(v * Math.PI * 2) * .18) * Math.PI * 2) * 3;
      r = 202 + joint + fiber + grain * 4; g = 72 + joint * .45 + grain * 3; b = 50 + joint * .35 + grain * 3;
    } else if (kind === "roof") {
      const seam = x % (size / 4) < 2 ? 18 : x % (size / 4) < 4 ? -17 : 0;
      r = 40 + seam + grain * 2; g = 118 + seam + grain * 2; b = 129 + seam + grain * 2;
    } else if (kind === "yard") {
      const row = Math.floor(y / 16), column = Math.floor((x + row % 2 * 16) / 32);
      const joint = y % 16 < 2 || (x + row % 2 * 16) % 32 < 2;
      const block = butterbellNoise(column % 4 + row * 7) * 18;
      const shade = joint ? -40 : block + grain * 4;
      r = 164 + shade; g = 156 + shade; b = 131 + shade;
    } else {
      const fiber = Math.sin((v * 64 + Math.sin(u * Math.PI * 2) * .3) * Math.PI * 2) * 11;
      r = 219 + fiber + grain * 9; g = 175 + fiber + grain * 10; b = 81 + fiber * .7 + grain * 8;
    }
    const i = (y * size + x) * 4;
    data[i] = Math.max(0, Math.min(255, Math.round(r)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
    data[i + 3] = 255;
  }
  return data;
}

export function makeButterbellMaterials(art: Atelier) {
  const materials = {} as Record<ButterbellTexture, StandardMaterial>;
  for (const kind of BUTTERBELL_TEXTURES) {
    const texture = RawTexture.CreateRGBATexture(butterbellTexturePixels(kind),
      BUTTERBELL_TEXTURE_SIZE, BUTTERBELL_TEXTURE_SIZE, art.scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
    texture.name = `butterbell original ${kind}`;
    texture.anisotropicFilteringLevel = 8;
    texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE;
    if (kind === "siding") texture.uScale = 3;
    const material = new StandardMaterial(`butterbell ${kind}`, art.scene);
    applySurfaceFinish(material, kind === "roof" ? "paint" : "matte", art.scene.environmentTexture);
    material.diffuseTexture = texture;
    material.diffuseColor = Color3.White();
    material.specularColor = Color3.FromHexString(kind === "roof" ? "#415051" : "#080807");
    material.specularPower = kind === "roof" ? 48 : 12;
    material.roughness = kind === "roof" ? .5 : .94;
    material.metadata = { surfaceFinish: kind === "roof" ? "paint" : "matte", originalProcedural: true };
    materials[kind] = material;
  }
  return materials;
}
export type ButterbellMaterials = ReturnType<typeof makeButterbellMaterials>;

/** Continuous, warped field boundaries replace the old axis-aligned colour quilt. */
export function butterbellFieldColor(x: number, z: number): readonly [number, number, number] {
  const warp = Math.sin(z * .039) * 9 + Math.sin(x * .027 + z * .016) * 5;
  const barley = Math.exp(-(((x + 80 + warp) / 38) ** 4 + ((z + 93) / 38) ** 4));
  const fallow = Math.exp(-(((x - 86 + warp) / 45) ** 4 + ((z - 151) / 25) ** 4));
  const hayfield = Math.exp(-(((x - 38 + Math.sin(z * .07) * 2) / 28) ** 6 + ((z - 41) / 17) ** 6));
  const hillside = Math.exp(-(((x + 130) / 34) ** 6 + ((z - 72 + x * .2) / 49) ** 6));
  const meadow = .5 + .5 * Math.sin(x * .024 + Math.sin(z * .032) * 1.3);
  const harvest = Math.min(1, barley + hayfield * .8 + fallow * .6 + hillside * .52);
  return [
    (.5 + meadow * .045) * (1 - harvest * .9) + harvest * .9,
    (.68 + meadow * .035) * (1 - harvest * .9) + harvest * .72,
    (.35 + meadow * .025) * (1 - harvest * .85) + harvest * .3,
  ];
}
