import { Color3 } from "@babylonjs/core/Maths/math.color";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import {
  BARNS, ORCHARD, SHOULDER_WIDTH, bankWidth, isGap, isWater, projectRoad, sampleRoad, surfaceHeight,
} from "@kartsick/content";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { ButterbellArt } from "./butterbell-art";
import { BUTTERBELL as C, butterbellNoise as noise } from "./butterbell-materials";
import type { ButterbellMaterials } from "./butterbell-materials";
import { butterbellShrub, type makeButterbellFoliageMaterials } from "./butterbell-foliage";

interface PlantBatch { positions: number[]; indices: number[]; colors: number[] }

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

function leaf(batch: PlantBatch, x: number, y: number, z: number, angle: number, height: number,
  spread: number, color: Color3): void {
  const { positions, indices, colors } = batch, base = positions.length / 3;
  const dx = Math.cos(angle) * spread, dz = Math.sin(angle) * spread;
  const acrossX = -Math.sin(angle) * spread * .24, acrossZ = Math.cos(angle) * spread * .24;
  const points = [
    x, y, z,
    x + dx * .55 + acrossX, y + height * .58, z + dz * .55 + acrossZ,
    x + dx, y + height, z + dz,
    x + dx * .55 - acrossX, y + height * .58, z + dz * .55 - acrossZ,
  ];
  positions.push(...points);
  for (let i = 0; i < 4; i++) {
    const light = i % 4 === 0 ? .82 : i % 4 === 2 ? 1.1 : 1;
    colors.push(color.r * light, color.g * light, color.b * light, 1);
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** Low, drive-through vegetation, never a replacement for a collision boundary. */
export function butterbellMeadows(art: ButterbellArt): StandardMaterial {
  const material = new StandardMaterial("butterbell meadow leaves", art.art.scene);
  material.specularColor = Color3.Black();
  material.backFaceCulling = false;
  const batches = new Map<string, PlantBatch>();
  const baseColor = Color3.FromHexString("#7fa145"), tipColor = Color3.FromHexString("#b3c770");
  const flower = Color3.FromHexString(C.cream), gold = Color3.FromHexString(C.straw);
  const add = (x: number, z: number, seed: number, bloom: boolean) => {
    const road = projectRoad(x, z);
    if (road.separation < SHOULDER_WIDTH + 2.2 || isWater(x, z) || isGap(road.u) ||
      BARNS.some(barn => Math.abs(x - barn.x) < 16 && Math.abs(z - barn.z) < 17)) return;
    const support = surfaceHeight(x, z);
    if ([[.26, 0], [-.26, 0], [0, .26], [0, -.26]].some(([dx, dz]) =>
      Math.abs(surfaceHeight(x + dx, z + dz) - support) > .13)) return;
    const key = `${Math.floor(x / 64)}:${Math.floor(z / 64)}`;
    let batch = batches.get(key);
    if (!batch) { batch = { positions: [], indices: [], colors: [] }; batches.set(key, batch); }
    const y = support + .018, height = .13 + noise(seed + 92) * .17;
    const color = Color3.Lerp(baseColor, tipColor, noise(seed + 75));
    for (let blade = 0; blade < 3; blade++) {
      leaf(batch, x, y, z, seed + blade * 2.4, height * (.8 + noise(seed + blade) * .4), .18, color);
    }
    if (bloom) for (let petal = 0; petal < 5; petal++) {
      leaf(batch, x, y + height * .8, z, petal * Math.PI * 2 / 5, .07, .095, seed % 3 ? flower : gold);
    }
  };
  for (let i = 0; i < 520; i++) {
    const p = sampleRoad((i + .5) / 520), side = i % 2 ? -1 : 1;
    // Uneven drifts reveal mown grass between them rather than a uniform ribbon.
    if (isGap(p.u) || noise(Math.floor(i / 8) + 811) < .30) continue;
    for (let plant = 0; plant < 7; plant++) {
      const seed = i * 19 + plant;
      const across = SHOULDER_WIDTH + 2.6 + noise(seed + 449) * 3.6;
      const forward = (noise(seed + 891) - .5) * 3;
      add(p.x + p.dz * side * across + p.dx * forward,
        p.z - p.dx * side * across + p.dz * forward, seed, plant > 3 && i % 11 < 4);
    }
  }
  for (const [key, batch] of batches) {
    const mesh = art.mesh(`butterbell meadow drift ${key}`,
      batch.positions, batch.indices, material, batch.colors);
    // Ground-aligned foliage normals keep tiny intersecting leaves from becoming black diamonds.
    mesh.setVerticesData(VertexBuffer.NormalKind, batch.positions.map((_, index) => index % 3 === 1 ? 1 : 0));
  }
  return material;
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
