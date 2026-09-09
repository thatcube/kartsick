import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { projectRoad, bankWidth, SHOULDER_WIDTH, isWater, BARNS, WINDMILL } from "@kartsick/content";
import { Atelier } from "./geometry";
import type { Triple } from "./geometry";
import type { SurfaceFinish } from "./surface-finishes";
import { BUTTERBELL as C } from "./butterbell-materials";

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

  root(x: number, z: number, cellSize = 64): TransformNode {
    const key = `${Math.floor(x / cellSize)}:${Math.floor(z / cellSize)}${cellSize === 64 ? "" : `:${cellSize}m`}`;
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
