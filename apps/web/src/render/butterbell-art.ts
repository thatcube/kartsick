import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { terrainHeight, projectRoad, bankWidth, SHOULDER_WIDTH, isWater, BARNS, WINDMILL } from "@kartsick/content";
import { Atelier } from "./geometry";
import type { Triple } from "./geometry";
import type { SurfaceFinish } from "./surface-finishes";
import { BUTTERBELL as C, butterbellNoise as noise } from "./butterbell-materials";

export const BUTTERBELL_SIGN_LABELS = [
  "BUTTERBELL", "PASTURES", "DAIRY ROAD RACES", "ORCHARD BEND", "BARN BEND",
  "WINDMILL RIDGE", "GLIDE AHEAD", "LANDING", "ROLLING HARVEST", "FRESH FROM THE VALLEY",
] as const;
export type ButterbellSign = typeof BUTTERBELL_SIGN_LABELS[number];

/** All static pieces share a material atlas and are batched in 64 m spatial cells. */
export class ButterbellArt {
  private readonly cells = new Map<string, TransformNode>();
  private readonly signs: StandardMaterial;
  private readonly labels = new Set<Mesh>();
  readonly furniture: { x: number; z: number; radius: number; name: string }[] = [];

  constructor(readonly art: Atelier) {
    const texture = new DynamicTexture("butterbell original dairy lettering", { width: 1024, height: 1024 }, art.scene, true);
    const context = texture.getContext() as CanvasRenderingContext2D;
    context.fillStyle = C.cream;
    context.fillRect(0, 0, 1024, 1024);
    for (let row = 0; row < BUTTERBELL_SIGN_LABELS.length; row++) {
      const y = row * 100;
      context.fillStyle = C.dairy;
      context.fillRect(12, y + 5, 1000, 3);
      context.fillRect(12, y + 92, 1000, 3);
      // The slab-serif dairy wordmark and enamel inset are drawn locally, not an image asset.
      context.font = row === 0 ? "900 86px Georgia, serif" : "bold 65px Trebuchet MS, sans-serif";
      const text = BUTTERBELL_SIGN_LABELS[row];
      const measured = context.measureText(text).width;
      const fontSize = (row === 0 ? 86 : 65) * Math.min(1, 936 / measured);
      context.font = `${row === 0 ? "900" : "bold"} ${fontSize}px ${row === 0 ? "Georgia, serif" : "Trebuchet MS, sans-serif"}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = C.roofShadow;
      context.fillText(text, 514, y + 53);
      context.fillStyle = row < 3 ? C.dairy : C.roofShadow;
      context.fillText(text, 512, y + 50);
    }
    texture.update();
    texture.anisotropicFilteringLevel = 8;
    this.signs = new StandardMaterial("butterbell enamel sign atlas", art.scene);
    this.signs.diffuseTexture = texture;
    this.signs.specularColor = Color3.FromHexString("#292724");
    this.signs.specularPower = 48;
    this.signs.metadata = { originalProcedural: true, surfaceFinish: "paint" };
    this.signs.backFaceCulling = false;
  }

  root(x: number, z: number): TransformNode {
    const key = `${Math.floor(x / 64)}:${Math.floor(z / 64)}`;
    let root = this.cells.get(key);
    if (!root) {
      root = new TransformNode(`butterbell scenery ${key}`, this.art.scene);
      this.cells.set(key, root);
    }
    return root;
  }

  box(name: string, position: Triple, size: Triple, color: string, finish: SurfaceFinish = "matte", parent?: TransformNode): Mesh {
    const mesh = this.art.box(name, position, size, color, parent ?? this.root(position[0], position[2]));
    mesh.material = this.art.surface(color, finish);
    return mesh;
  }

  cylinder(name: string, position: Triple, top: number, bottom: number, height: number, color: string, finish: SurfaceFinish = "matte", parent?: TransformNode): Mesh {
    const mesh = this.art.cylinder(name, position, top, bottom, height, color, parent ?? this.root(position[0], position[2]));
    mesh.material = this.art.surface(color, finish);
    return mesh;
  }

  tube(name: string, points: Triple[], radius: number, color: string, finish: SurfaceFinish = "wood", parent?: TransformNode): Mesh {
    const mesh = this.art.tube(name, points, radius, color, parent ?? this.root(points[0][0], points[0][2]));
    mesh.material = this.art.surface(color, finish);
    return mesh;
  }

  mesh(name: string, positions: number[], indices: number[], material: StandardMaterial, colors?: number[], uvs?: number[], parent?: TransformNode): Mesh {
    const mesh = this.art.mesh(name, positions, indices, colors, uvs);
    mesh.material = material;
    mesh.parent = parent ?? this.root(positions[0], positions[2]);
    mesh.receiveShadows = true;
    return mesh;
  }

  label(text: ButterbellSign, position: Triple, width: number, height: number, yaw: number, parent?: TransformNode): Mesh {
    const row = BUTTERBELL_SIGN_LABELS.indexOf(text);
    const mesh = this.mesh(`butterbell lettering ${text}`,
      [-width / 2, -height / 2, 0, width / 2, -height / 2, 0, -width / 2, height / 2, 0, width / 2, height / 2, 0],
      [0, 1, 2, 1, 3, 2], this.signs, undefined,
      [0, 1 - (row * 100 + 98) / 1024, 1, 1 - (row * 100 + 98) / 1024, 0, 1 - row * 100 / 1024, 1, 1 - row * 100 / 1024],
      parent ?? this.root(position[0], position[2]));
    mesh.position.set(...position);
    mesh.rotation.y = yaw;
    this.labels.add(mesh);
    return mesh;
  }

  finish(): Mesh[] {
    const meshes: Mesh[] = [];
    for (const root of this.cells.values()) {
      this.art.batchModel(root, this.labels, true);
      for (const child of root.getChildMeshes()) if (child instanceof Mesh) {
        child.receiveShadows = true;
        meshes.push(child);
      }
    }
    return meshes;
  }
}

export function butterbellDecorationClearance(x: number, z: number, radius: number): boolean {
  const road = projectRoad(x, z);
  if (road.separation < SHOULDER_WIDTH + bankWidth(road) + radius + 2.5 || isWater(x, z)) return false;
  if (BARNS.some(b => Math.abs(x - b.x) < 16 + radius && Math.abs(z - b.z) < 10 + radius)) return false;
  return Math.hypot(x - WINDMILL.x, z - WINDMILL.z) > 13 + radius;
}

/** One sculpted, lobed crown rather than intersecting ellipsoid lollipops. */
export function butterbellTree(art: ButterbellArt, x: number, z: number, scale: number, seed: number): void {
  const ground = terrainHeight(x, z);
  art.cylinder("orchard trunk core", [x, ground + 1.7 * scale, z], .32 * scale, .52 * scale, 3.4 * scale, C.timber, "wood");
  for (let branch = 0; branch < 3; branch++) {
    const angle = branch * Math.PI * 2 / 3 + seed;
    art.tube("pruned orchard limb", [
      [x, ground + 1.85 * scale, z],
      [x + Math.cos(angle) * .43 * scale, ground + 2.6 * scale, z + Math.sin(angle) * .43 * scale],
      [x + Math.cos(angle) * 1.35 * scale, ground + 3.4 * scale, z + Math.sin(angle) * 1.35 * scale],
    ], .095 * scale, C.timber);
  }
  const positions: number[] = [x, ground + 3.02 * scale, z], indices: number[] = [], colors: number[] = [];
  const sides = 18, rings = 9;
  const light = Color3.FromHexString(C.leafLight), dark = Color3.FromHexString(C.leafShadow);
  const crownRadius = (a: number, v: number) => Math.sin(v * Math.PI) ** .72
    * (2.45 + Math.sin(v * Math.PI) * .18)
    * (1 + Math.sin(a * 5 + seed) * .13 + Math.cos(a * 3 - v * 3 + seed) * .08) * scale;
  const bottomColor = Color3.Lerp(dark, light, .25);
  colors.push(bottomColor.r, bottomColor.g, bottomColor.b, 1);
  // Shared pole vertices avoid zero-area faces and zero normals in HDR lighting.
  for (let row = 1; row < rings; row++) {
    const v = row / rings, angleY = v * Math.PI;
    for (let side = 0; side <= sides; side++) {
      const a = side / sides * Math.PI * 2;
      const radius = crownRadius(a, v);
      positions.push(x + Math.cos(a) * radius,
        ground + (3.02 + v * 3.45 + Math.sin(a * 5 + seed) * .15 * Math.sin(angleY)) * scale,
        z + Math.sin(a) * radius * .9);
      const tint = .25 + v * .43 + Math.max(0, -Math.cos(a) + Math.sin(a)) * .12;
      const c = Color3.Lerp(dark, light, tint);
      colors.push(c.r, c.g, c.b, 1);
      if (row < rings - 1 && side < sides) {
        const n = 1 + (row - 1) * (sides + 1) + side, next = n + sides + 1;
        indices.push(n, n + 1, next, n + 1, next + 1, next);
      }
    }
  }
  const top = positions.length / 3, topColor = Color3.Lerp(dark, light, .68);
  positions.push(x, ground + 6.47 * scale, z);
  colors.push(topColor.r, topColor.g, topColor.b, 1);
  for (let side = 0; side < sides; side++) {
    indices.push(0, 2 + side, 1 + side);
    const last = 1 + (rings - 2) * (sides + 1) + side;
    indices.push(top, last, last + 1);
  }
  art.mesh("sculpted orchard canopy", positions, indices, art.art.material("#ffffff"), colors);
  const fruitPositions: number[] = [], fruitIndices: number[] = [], fruitColors: number[] = [];
  const fruitProfile = [[-.17, 0], [-.12, .105], [0, .155], [.105, .125], [.16, .028], [.13, 0]];
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2 + seed;
    const v = .28 + noise(seed + i) * .16, radius = crownRadius(a, v);
    const fx = x + Math.cos(a) * radius, fz = z + Math.sin(a) * radius * .9;
    const fy = ground + (3.02 + v * 3.45 + Math.sin(a * 5 + seed) * .15 * Math.sin(v * Math.PI)) * scale;
    const tint = Color3.FromHexString(i % 3 ? C.dairy : C.straw), base = fruitPositions.length / 3;
    fruitPositions.push(fx, fy + fruitProfile[0][0] * scale, fz);
    fruitColors.push(tint.r, tint.g, tint.b, 1);
    for (let row = 1; row < fruitProfile.length - 1; row++) for (let side = 0; side <= 6; side++) {
      const angle = side / 6 * Math.PI * 2, [height, width] = fruitProfile[row];
      fruitPositions.push(fx + Math.cos(angle) * width * scale, fy + height * scale, fz + Math.sin(angle) * width * scale);
      fruitColors.push(tint.r, tint.g, tint.b, 1);
      if (row < fruitProfile.length - 2 && side < 6) {
        const n = base + 1 + (row - 1) * 7 + side;
        fruitIndices.push(n, n + 1, n + 7, n + 1, n + 8, n + 7);
      }
    }
    const cap = fruitPositions.length / 3;
    fruitPositions.push(fx, fy + fruitProfile[5][0] * scale, fz);
    fruitColors.push(tint.r, tint.g, tint.b, 1);
    for (let side = 0; side < 6; side++) {
      fruitIndices.push(base, base + 2 + side, base + 1 + side);
      const last = base + 1 + 3 * 7 + side;
      fruitIndices.push(cap, last, last + 1);
    }
  }
  art.mesh("small sculpted orchard apples", fruitPositions, fruitIndices, art.art.surface("#ffffff", "paint"), fruitColors);
}
