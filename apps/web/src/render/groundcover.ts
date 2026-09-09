import { Color3 } from "@babylonjs/core/Maths/math.color";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Atelier, Triple } from "./geometry";

export type PlantKind = "grass" | "clover" | "daisy" | "buttercup" | "seed" | "reed" | "fern" | "rosette" | "felt";
export interface GroundPlant {
  x: number; y: number; z: number; seed: number; kind: PlantKind;
  scale: number; radius: number; u: number; support: "terrain" | "trough" | "planter"; bed?: number;
}
export interface PlantPalette {
  leaf: string; tip: string; flower: string; secondaryFlower: string; soil: string; rim: string;
}
export interface PlantBed {
  x: number; y: number; z: number; yaw: number; grade: number; halfLength: number; halfWidth: number;
  kind: "trough" | "bark" | "stone";
}
interface Geometry { positions: number[]; indices: number[]; colors: number[] }
const empty = (): Geometry => ({ positions: [], indices: [], colors: [] });
export const plantNoise = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};

/** Four-vertex folded leaves, shared by meadow tufts, reeds and small rosettes. */
function leaf(batch: Geometry, origin: Triple, angle: number, height: number, length: number, width: number, tint: Color3): void {
  const [x, y, z] = origin, base = batch.positions.length / 3;
  const dx = Math.cos(angle) * length, dz = Math.sin(angle) * length;
  const sx = -Math.sin(angle) * width, sz = Math.cos(angle) * width;
  batch.positions.push(x, y, z, x + dx * .53 + sx, y + height * .57, z + dz * .53 + sz,
    x + dx, y + height, z + dz, x + dx * .53 - sx, y + height * .57, z + dz * .53 - sz);
  for (const shade of [.82, 1, 1.08, .96]) batch.colors.push(tint.r * shade, tint.g * shade, tint.b * shade, 1);
  batch.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function disc(batch: Geometry, x: number, y: number, z: number, radius: number, tint: Color3): void {
  const base = batch.positions.length / 3;
  batch.positions.push(x, y + radius * .13, z);
  batch.colors.push(tint.r, tint.g, tint.b, 1);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    batch.positions.push(x + Math.cos(a) * radius, y, z + Math.sin(a) * radius);
    batch.colors.push(tint.r, tint.g, tint.b, 1);
    batch.indices.push(base, base + 1 + i, base + 1 + (i + 1) % 6);
  }
}

export function makeGroundcover(art: Atelier, id: string, plants: readonly GroundPlant[],
  beds: readonly PlantBed[], palette: PlantPalette): { plants: number; meshes: number; vertices: number } {
  const material = new StandardMaterial(`${id} groundcover leaves`, art.scene);
  material.specularColor = Color3.Black();
  material.backFaceCulling = false;
  material.transparencyMode = StandardMaterial.MATERIAL_OPAQUE;
  const low = Color3.FromHexString(palette.leaf), high = Color3.FromHexString(palette.tip);
  const flower = Color3.FromHexString(palette.flower), secondary = Color3.FromHexString(palette.secondaryFlower);
  const batches = new Map<string, Geometry>();
  const batchAt = (x: number, z: number) => {
    const key = `leaves ${Math.floor(x / 64)}:${Math.floor(z / 64)}`;
    let batch = batches.get(key);
    if (!batch) { batch = empty(); batches.set(key, batch); }
    return batch;
  };
  for (const plant of plants) {
    const { x, y, z, seed, scale, kind } = plant, batch = batchAt(x, z);
    const tint = Color3.Lerp(low, high, plantNoise(seed + 75));
    const height = (.15 + plantNoise(seed + 92) * .16) * scale, yaw = seed * 2.39;
    if (kind === "clover") {
      for (let i = 0; i < 3; i++) {
        const a = yaw + i * Math.PI * 2 / 3;
        disc(batch, x + Math.cos(a) * .09 * scale, y + .10 * scale,
          z + Math.sin(a) * .09 * scale, .085 * scale, tint);
      }
    } else if (kind === "fern") {
      for (let frond = 0; frond < 3; frond++) {
        const a = yaw + frond * Math.PI * 2 / 3, dx = Math.cos(a), dz = Math.sin(a);
        leaf(batch, [x, y, z], a, .46 * scale, .39 * scale, .012 * scale, tint);
        for (let row = 1; row <= 3; row++) for (const side of [-1, 1]) {
          const t = row / 4;
          leaf(batch, [x + dx * t * .39 * scale, y + t * .46 * scale, z + dz * t * .39 * scale],
            a + side * 1.05, .035 * scale, (.15 - t * .06) * scale, .035 * scale, tint);
        }
      }
    } else {
      const broad = kind === "rosette" || kind === "felt", tall = kind === "reed" || kind === "seed";
      for (let blade = 0; blade < (broad ? 5 : 3); blade++) {
        leaf(batch, [x, y, z], yaw + blade * 2.4, height * (tall ? 1.8 : broad ? 1.2 : 1),
          (broad ? .27 : .18) * scale, (broad ? .09 : .044) * scale, tint);
      }
      if (kind === "daisy" || kind === "buttercup" || kind === "felt") {
        const petals = kind === "daisy" ? 7 : 5, color = kind === "buttercup" ? secondary : flower;
        for (let petal = 0; petal < petals; petal++) {
          leaf(batch, [x, y + height * .92, z], yaw + petal * Math.PI * 2 / petals,
            .015 * scale, .12 * scale, .037 * scale, color);
        }
        disc(batch, x, y + height + .005, z, .045 * scale, secondary);
      }
      if (tall) for (let head = 0; head < 3; head++) {
        const a = yaw + head * 2.4, px = x + Math.cos(a) * .11 * scale, pz = z + Math.sin(a) * .11 * scale;
        leaf(batch, [px, y + height * 1.35, pz], a, .19 * scale, .035 * scale,
          .03 * scale, kind === "reed" ? secondary : high);
      }
    }
  }
  const leafCounts = new Map([...batches].map(([key, batch]) => [key, batch.positions.length]));
  // Shallow edge beds ground planting on elevated decks; they never extend the driving surface.
  const soil = Color3.FromHexString(palette.soil), rim = Color3.FromHexString(palette.rim);
  for (const bed of beds) {
    const batch = batchAt(bed.x, bed.z), base = batch.positions.length / 3;
    const c = Math.cos(bed.yaw), s = Math.sin(bed.yaw);
    const outline = bed.kind === "trough" ? [[-1, -1], [1, -1], [1, 1], [-1, 1]] :
      [[-.65, -1], [.65, -1], [1, -.78], [1, .78], [.65, 1], [-.65, 1], [-1, .78], [-1, -.78]];
    const top = bed.kind === "trough" ? soil : Color3.Lerp(soil, low, bed.kind === "bark" ? .38 : .16);
    for (const height of [0, -.19]) for (const [a, b] of outline) {
      const across = a * bed.halfWidth, along = b * bed.halfLength;
      batch.positions.push(bed.x + c * across + s * along, bed.y + height + along * bed.grade, bed.z - s * across + c * along);
      const color = height === 0 ? top : rim;
      batch.colors.push(color.r, color.g, color.b, 1);
    }
    const count = outline.length;
    for (let i = 1; i < count - 1; i++) batch.indices.push(base, base + i, base + i + 1);
    for (let i = 0; i < count; i++) {
      const a = base + i, b = base + (i + 1) % count;
      batch.indices.push(a + count, a, b + count, b + count, a, b);
    }
  }
  let vertices = 0;
  for (const [key, batch] of batches) {
    const mesh = art.mesh(`${id} groundcover ${key}`, batch.positions, batch.indices, batch.colors);
    mesh.material = material;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    const normals = mesh.getVerticesData(VertexBuffer.NormalKind)!;
    // Keep soft leaf lighting while retaining shaped normals on the shared soil/edge geometry.
    for (let i = 0; i < (leafCounts.get(key) ?? 0); i++) normals[i] = i % 3 === 1 ? 1 : 0;
    mesh.setVerticesData(VertexBuffer.NormalKind, normals);
    mesh.freezeWorldMatrix();
    vertices += mesh.getTotalVertices();
  }
  return { plants: plants.length, meshes: batches.size, vertices };
}
