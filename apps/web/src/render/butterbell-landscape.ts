import { Color3 } from "@babylonjs/core/Maths/math.color";
import {
  BARNS, ORCHARD, SHOULDER_WIDTH, bankWidth, isWater, projectRoad, surfaceHeight,
} from "@kartsick/content";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { ButterbellArt } from "./butterbell-art";
import type { ButterbellMaterials } from "./butterbell-materials";
import { butterbellShrub, type makeButterbellFoliageMaterials } from "./butterbell-foliage";

function patch(art: ButterbellArt, name: string, x: number, z: number, width: number, depth: number,
  material: StandardMaterial, color: string, exponent = .67, lift = .055): void {
  const positions: number[] = [], indices: number[] = [], uv: number[] = [], colors: number[] = [];
  const tint = Color3.FromHexString(color), rings = Math.max(2, Math.ceil(Math.max(width, depth) / 2)), sides = 32;
  const vertices = new Map<number, number>();
  const point = (row: number, side: number) => {
    const angle = side / sides * Math.PI * 2, u = Math.cos(angle), v = Math.sin(angle);
    const edge = 1 + Math.sin(angle * 5 + x) * .035;
    return [x + Math.sign(u) * Math.abs(u) ** exponent * width * row / rings * edge,
      z + Math.sign(v) * Math.abs(v) ** exponent * depth * row / rings * edge] as const;
  };
  const vertex = (row: number, side: number) => {
    const key = row === 0 ? 0 : 1 + (row - 1) * sides + side % sides, existing = vertices.get(key);
    if (existing !== undefined) return existing;
    const [px, pz] = point(row, side), index = positions.length / 3;
    vertices.set(key, index);
    positions.push(px, surfaceHeight(px, pz) + lift, pz);
    uv.push(px / 3, pz / 3);
    colors.push(tint.r, tint.g, tint.b, 1);
    return index;
  };
  for (let row = 0; row < rings; row++) for (let side = 0; side < sides; side++) {
    const corners = [point(row, side), point(row, side + 1), point(row + 1, side), point(row + 1, side + 1)];
    if (corners.some(([px, pz]) => {
      const road = projectRoad(px, pz);
      return road.separation < SHOULDER_WIDTH + bankWidth(road) + .6 || isWater(px, pz);
    })) continue;
    const a = vertex(row, side), b = vertex(row + 1, side);
    const c = vertex(row, side + 1), d = vertex(row + 1, side + 1);
    if (row) indices.push(a, b, c);
    indices.push(c, b, d);
  }
  if (indices.length) art.mesh(name, positions, indices, material, colors, uv);
}

export function butterbellFarmGround(art: ButterbellArt, materials: ButterbellMaterials): void {
  for (const barn of BARNS) {
    patch(art, "butterbell dairy cobbled yard", barn.x + 2.5, barn.z, 15, 15.5, materials.yard, "#f4edd4");
    for (const side of [-1, 1]) {
      patch(art, "butterbell herb bed", barn.x + side * 9, barn.z - 10, 1.8, 4, materials.verge, "#8c785b", .67, .18);
    }
  }

  for (const tree of ORCHARD) {
    patch(art, "butterbell orchard mulch", tree.x, tree.z, 1.5 * tree.scale, 1.3 * tree.scale,
      materials.verge, "#9e8b64", 1);
  }
}

export function butterbellPlantings(art: ButterbellArt, materials: ReturnType<typeof makeButterbellFoliageMaterials>): void {
  const plant = (x: number, z: number, scale: number, seed: number, height: number) => {
    const road = projectRoad(x, z);
    if (road.separation < SHOULDER_WIDTH + bankWidth(road) + scale + 1 || isWater(x, z)) return;
    butterbellShrub(art, materials, x, z, scale, seed, height);
  };
  for (let farm = 0; farm < BARNS.length; farm++) {
    const barn = BARNS[farm];
    for (const side of [-1, 1]) {
      for (let row = 0; row < 6; row++) {
        plant(barn.x + side * 9, barn.z - 12.8 + row * 1.05, .8, farm * 99 + row * 3 + side, .58);
      }
      for (let row = 0; row < 11; row++) {
        plant(barn.x + side * 14.4, barn.z - 8 + row * 1.7, 1.25, farm * 97 + row * 7, .65);
      }
    }
  }
  for (let i = 0; i < 40; i++) {
    const z = -155 + i * 2.4, x = -18.3 + Math.sin(z * .018) * 2;
    plant(x, z, 1.35, i * 7.1 + 591, .62);
  }
}
