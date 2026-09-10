import { Color3 } from "@babylonjs/core/Maths/math.color";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Atelier } from "./geometry";
import type { ButterbellArt } from "./butterbell-art";
import { butterbellFieldColor, butterbellNoise } from "./butterbell-materials";
import { butterbellCountrysideHeight } from "./butterbell-backdrop";

export const BUTTERBELL_COUNTRYSIDE_EXTENT = 900;
export const BUTTERBELL_COUNTRYSIDE_TEXTURE_SIZE = 512;

type RGB = readonly [number, number, number];
type Crop = "barley" | "clover" | "hay";
interface Field {
  x: number;
  z: number;
  width: number;
  depth: number;
  yaw: number;
  crop: Crop;
}

// Long fields follow each valley flank; the open dairy village sits between them.
export const BUTTERBELL_FIELDS: readonly Field[] = [
  { x: -127, z: 343, width: 142, depth: 76, yaw: -.22, crop: "barley" },
  { x: 126, z: 346, width: 111, depth: 82, yaw: .28, crop: "hay" },
  { x: -94, z: 444, width: 138, depth: 75, yaw: .13, crop: "clover" },
  { x: 94, z: 457, width: 124, depth: 83, yaw: -.25, crop: "barley" },
  { x: 251, z: 356, width: 99, depth: 133, yaw: -.42, crop: "clover" },
  { x: -274, z: 323, width: 107, depth: 104, yaw: .4, crop: "hay" },
  { x: -351, z: 191, width: 90, depth: 123, yaw: -.25, crop: "barley" },
  { x: -340, z: 31, width: 89, depth: 139, yaw: .14, crop: "clover" },
  { x: -339, z: -151, width: 111, depth: 124, yaw: -.28, crop: "hay" },
  { x: -251, z: -329, width: 130, depth: 85, yaw: .2, crop: "barley" },
  { x: -80, z: -342, width: 130, depth: 93, yaw: -.17, crop: "clover" },
  { x: 89, z: -339, width: 132, depth: 85, yaw: .21, crop: "hay" },
  { x: 269, z: -322, width: 111, depth: 106, yaw: -.35, crop: "barley" },
  { x: 349, z: -175, width: 98, depth: 123, yaw: .15, crop: "clover" },
  { x: 341, z: -20, width: 91, depth: 136, yaw: -.12, crop: "barley" },
  { x: 347, z: 158, width: 111, depth: 122, yaw: .22, crop: "hay" },
];

const CROPS: Record<Crop, RGB> = {
  barley: [184, 174, 94],
  clover: [106, 144, 65],
  hay: [153, 167, 85],
};
const FIELDS = BUTTERBELL_FIELDS.map(field => ({ ...field, c: Math.cos(field.yaw), s: Math.sin(field.yaw) }));

function smooth(a: number, b: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function mix(a: RGB, b: RGB, amount: number): RGB {
  return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount];
}

/** One world-space painting: crop rows and field margins bend together, not a repeated tile. */
export function butterbellCountrysideColor(x: number, z: number): RGB {
  const pasture = butterbellFieldColor(x, z);
  const edge: RGB = [pasture[0] * 217, pasture[1] * 225, pasture[2] * 195];
  const outward = Math.max(0, Math.abs(x) - 240, Math.abs(z) - 250);
  const blend = smooth(8, 65, outward);
  if (blend === 0) return edge;
  const meadow = Math.sin(x * .027 + Math.sin(z * .019) * 1.7) * 4
    + Math.cos(x * .059 - z * .04) * 2;
  let color: RGB = [121 + meadow, 156 + meadow, 73 + meadow * .65];
  for (let i = 0; i < FIELDS.length; i++) {
    const field = FIELDS[i], dx = x - field.x, dz = z - field.z;
    const u = dx * field.c - dz * field.s;
    const v = dx * field.s + dz * field.c + Math.sin(u * .034 + i) * 5;
    const rounded = ((u / (field.width / 2)) ** 4 + (v / (field.depth / 2)) ** 4) ** .25;
    const margin = (1 - rounded) * Math.min(field.width, field.depth) / 2;
    if (margin < -4) continue;
    const crop = CROPS[field.crop];
    const rows = Math.sin(v * Math.PI * 2 / (field.crop === "barley" ? 12 : 16));
    const shade = rows * (field.crop === "clover" ? 2 : 7);
    const interior: RGB = [crop[0] + shade, crop[1] + shade, crop[2] + shade * .7];
    color = mix(color, interior, smooth(-1, 2, margin));
  }
  // Pasture recedes into a cooler unplanted ridge, rather than fields running to the sky.
  const ridge = smooth(495, 730, Math.max(Math.abs(x), Math.abs(z)));
  color = mix(color, [117 + meadow, 149 + meadow, 90 + meadow], ridge);
  return mix(edge, color, blend);
}

export function butterbellCountrysidePixels(): Uint8Array {
  const size = BUTTERBELL_COUNTRYSIDE_TEXTURE_SIZE, data = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
    const x = ((column + .5) / size * 2 - 1) * BUTTERBELL_COUNTRYSIDE_EXTENT;
    const z = ((row + .5) / size * 2 - 1) * BUTTERBELL_COUNTRYSIDE_EXTENT;
    const color = butterbellCountrysideColor(x, z);
    const grain = (butterbellNoise(column + row * size) - .5) * 2;
    const offset = (row * size + column) * 4;
    for (let channel = 0; channel < 3; channel++) data[offset + channel] = Math.round(color[channel] + grain);
    data[offset + 3] = 255;
  }
  return data;
}

export function makeButterbellCountrysideMaterial(art: Atelier): StandardMaterial {
  const size = BUTTERBELL_COUNTRYSIDE_TEXTURE_SIZE;
  const texture = RawTexture.CreateRGBATexture(butterbellCountrysidePixels(), size, size,
    art.scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  texture.name = "butterbell original cultivated countryside";
  texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 8;
  const material = new StandardMaterial("butterbell cultivated countryside", art.scene);
  material.diffuseTexture = texture;
  material.diffuseColor = Color3.White();
  material.specularColor = Color3.FromHexString("#080807");
  material.roughness = .94;
  material.metadata = { surfaceFinish: "matte", originalProcedural: true };
  return material;
}

export function butterbellFieldHedges(art: ButterbellArt, material: StandardMaterial): void {
  for (const index of [0, 1, 5, 6, 9, 12, 14, 15]) {
    const field = FIELDS[index], positions: number[] = [], indices: number[] = [], uvs: number[] = [];
    const steps = 28, section = [[-1, 0], [-1, .7], [-.55, 1.5], [.55, 1.5], [1, .7], [1, 0]];
    const center = (angle: number) => {
      const ca = Math.cos(angle), sa = Math.sin(angle);
      const u = Math.sign(ca) * Math.sqrt(Math.abs(ca)) * field.width / 2;
      const v = Math.sign(sa) * Math.sqrt(Math.abs(sa)) * field.depth / 2 - Math.sin(u * .034 + index) * 5;
      return [field.x + u * field.c + v * field.s, field.z - u * field.s + v * field.c] as const;
    };
    for (let step = 0; step <= steps; step++) {
      const angle = Math.PI * (1.1 + step / steps * .8), [x, z] = center(angle);
      const [ax, az] = center(angle - .001), [bx, bz] = center(angle + .001);
      const length = Math.hypot(bx - ax, bz - az), nx = (bz - az) / length, nz = -(bx - ax) / length;
      for (const [across, height] of section) {
        const px = x + nx * across, pz = z + nz * across;
        const crest = height ? height + Math.sin(step * 1.7 + index) * .12 : -.25;
        positions.push(px, butterbellCountrysideHeight(px, pz) + crest, pz);
        uvs.push(step * .8, across + height);
      }
      if (step) for (let side = 0; side < section.length - 1; side++) {
        const a = (step - 1) * section.length + side, b = step * section.length + side;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    // Close each end so the hedgerow reads as solid from both approach directions.
    for (const end of [0, steps]) for (let side = 1; side < section.length - 1; side++) {
      const start = end * section.length;
      if (end) indices.push(start, start + side, start + side + 1);
      else indices.push(start, start + side + 1, start + side);
    }
    const root = art.root(field.x, field.z, 512);
    root.metadata = { backgroundFields: true };
    art.mesh("butterbell cultivated field hedgerow", positions, indices, material, undefined, uvs, root);
  }
}
