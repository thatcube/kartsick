import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { lerp } from "@kartsick/content";
import type { CharacterId } from "@kartsick/content";
import { Atelier } from "../geometry";
import type { Triple } from "../geometry";
import type { SurfaceFinish } from "../surface-finishes";

export const INK = "#30394f";
export const CREAM = "#fff0cf";
export const PLUM = "#694665";
export const MINT = "#63cab9";

export const RIDER_MOUNT = { y: 0.34, frontZ: 0.25, rearZ: -0.79 } as const;
export const RIDER_GRIPS = {
  front: { x: 0.255, y: 0.98, z: 0.75 },
  rear: { x: 0.59, y: 0.83, z: -0.87 },
} as const;

export interface RiderModel {
  root: TransformNode;
  head: TransformNode;
  accent: TransformNode;
  pose(front: number, steer: number, tick: number, reducedMotion: boolean, swapping: number): void;
}

export interface Anatomy {
  shoulder: Triple;
  sleeve: string;
  hand: string;
  armWidth: number;
  handSize: number;
  sleeveFinish?: SurfaceFinish;
  noodle?: boolean;
  shaggy?: boolean;
}

export function node(art: Atelier, name: string, parent?: TransformNode, position: Triple = [0, 0, 0]): TransformNode {
  const result = new TransformNode(name, art.scene);
  result.parent = parent ?? null;
  result.position.set(...position);
  return result;
}

export function soft(art: Atelier, parent: TransformNode, name: string, position: Triple, size: Triple, color: string, square = 1) {
  return art.oval(name, position, size, color, parent, square, 8);
}

export function surface(art: Atelier, mesh: Mesh, color: string, finish: SurfaceFinish): Mesh {
  mesh.material = art.surface(color, finish);
  return mesh;
}

/** Artist-defined color families; never mutates a material shared with another racer. */
export function finishModel(art: Atelier, root: TransformNode, fallback: SurfaceFinish, palette: Partial<Record<SurfaceFinish, readonly string[]>> = {}): void {
  const finishes = new Map<string, SurfaceFinish>();
  for (const [finish, colors] of Object.entries(palette)) for (const color of colors) finishes.set(color.toUpperCase(), finish as SurfaceFinish);
  for (const mesh of root.getChildMeshes()) {
    const material = mesh.material;
    if (!(material instanceof StandardMaterial) || material.disableLighting || material.metadata?.surfaceFinish !== "matte") continue;
    const color = material.diffuseColor.toHexString();
    mesh.material = art.surface(color, finishes.get(color) ?? fallback);
  }
}

export function eyes(art: Atelier, parent: TransformNode, spread: number, y: number, z: number, size = 1, sleepy = false, iris = "#467c85"): void {
  for (const side of [-1, 1]) {
    const x = side * spread, height = (sleepy ? 0.125 : 0.19) * size;
    surface(art, soft(art, parent, "eye porcelain", [x, y, z], [0.157 * size, height, 0.086], CREAM), CREAM, "paint");
    surface(art, soft(art, parent, "separate iris", [x - side * 0.011, y - 0.005, z + 0.039], [0.086 * size, height * 0.73, 0.032], iris), iris, "paint");
    surface(art, soft(art, parent, "focused pupil", [x - side * 0.011, y - 0.008, z + 0.055], [0.041 * size, height * 0.52, 0.016], INK), INK, "paint");
    surface(art, soft(art, parent, "eye catchlight", [x - 0.023, y + height * 0.21, z + 0.064], [0.022, 0.029, 0.012], "#ffffff"), "#ffffff", "paint");
  }
}

export function seatedLegs(art: Atelier, root: TransformNode, color: string, spread: number, width: number): void {
  for (const side of [-1, 1]) {
    art.sweep("connected bent thigh and shin", [[side * spread, 0.36, -0.06], [side * (spread + 0.025), 0.27, 0.18],
      [side * (spread + 0.035), 0.2, 0.38], [side * spread, 0.075, 0.34]], [width, width * 1.05, width * 0.92, width * 0.75], color, root, 10);
  }
}

export function riderRig(art: Atelier, id: CharacterId, root: TransformNode, head: TransformNode, accent: TransformNode, anatomy: Anatomy): RiderModel {
  root.metadata = { kind: "rider", characterId: id };
  head.metadata = { kind: "head", characterId: id };
  const up = Vector3.Up();
  const baseHead = head.rotation.clone();
  const baseAccent = accent.rotation.clone();
  const arms = [-1, 1].map(side => {
    const arm = node(art, "articulated sleeve", root, [side * anatomy.shoulder[0], anatomy.shoulder[1], anatomy.shoulder[2]]);
    arm.rotationQuaternion = Quaternion.Identity();
    if (anatomy.noodle) {
      art.sweep("soft noodle arm", [[0, 0, 0], [side * 0.06, 0.21, -0.04], [0, 0.57, 0]], [anatomy.armWidth, anatomy.armWidth * 0.8, anatomy.armWidth * 0.7], anatomy.sleeve, arm);
    } else {
      art.sculpt("bent tailored sleeve", [[0, 0.045, 0.045], [0.07, anatomy.armWidth, anatomy.armWidth], [0.26, anatomy.armWidth * 0.91, anatomy.armWidth * 0.92, side * 0.055, -0.04], [0.43, anatomy.armWidth * (anatomy.shaggy ? 1.08 : 0.75), anatomy.armWidth * 0.77, side * 0.025, -0.02], [0.57, 0.045, 0.045]], anatomy.sleeve, arm, 1, 16);
      soft(art, arm, "sleeve cuff", [0, 0.5, 0], [anatomy.armWidth * 1.8, 0.085, anatomy.armWidth * 1.6], anatomy.sleeve, 0.7);
      if (anatomy.shaggy) for (let i = 0; i < 4; i++) {
        art.sweep("hanging forearm fringe", [[side * 0.1, 0.16 + i * 0.08, -0.05], [side * 0.19, 0.27 + i * 0.06, -0.06], [side * 0.14, 0.34 + i * 0.05, -0.05]], [0.06, 0.055, 0.003], anatomy.sleeve, arm);
      }
    }
    const hand = node(art, "gripping hand", root);
    const h = anatomy.handSize;
    soft(art, hand, "mitten palm", [0, 0, 0], [h, h * 0.85, h * 0.85], anatomy.hand, 0.76);
    soft(art, hand, "curled thumb", [-side * h * 0.31, -h * 0.08, h * 0.2], [h * 0.39, h * 0.46, h * 0.45], anatomy.hand);
    art.sweep("grip crease", [[-h * 0.22, 0.018, h * 0.43], [0, 0.035, h * 0.45], [h * 0.22, 0.018, h * 0.43]], [0.006, 0.008, 0.006], anatomy.sleeve, hand, 6);
    soft(art, hand, "curled finger ridge", [0, -h * 0.17, h * 0.31], [h * 0.81, h * 0.36, h * 0.35], anatomy.hand, 0.7);
    finishModel(art, arm, anatomy.sleeveFinish ?? "fabric");
    finishModel(art, hand, anatomy.hand === CREAM || anatomy.hand === MINT || anatomy.noodle ? "fabric" : "skin");
    return { side, arm, hand, direction: new Vector3() };
  });
  return {
    root, head, accent,
    pose(front, steer, tick, reducedMotion, swapping) {
      const cosine = Math.cos(root.rotation.z), sine = Math.sin(root.rotation.z);
      for (const { side, arm, hand, direction } of arms) {
        const x = side * lerp(RIDER_GRIPS.rear.x, RIDER_GRIPS.front.x, front);
        const y = lerp(RIDER_GRIPS.rear.y, RIDER_GRIPS.front.y, front) - RIDER_MOUNT.y -
          (swapping > 0 ? 0 : root.position.y - RIDER_MOUNT.y);
        // Lean the torso around a planted grip, rather than pulling the mittens off the rail.
        hand.position.set(x * cosine + y * sine, -x * sine + y * cosine,
          lerp(RIDER_GRIPS.rear.z - RIDER_MOUNT.rearZ, RIDER_GRIPS.front.z - RIDER_MOUNT.frontZ, front));
        hand.position.subtractToRef(arm.position, direction);
        arm.scaling.y = direction.length() / 0.57;
        direction.normalize();
        Quaternion.FromUnitVectorsToRef(up, direction, arm.rotationQuaternion!);
      }
      head.rotation.y = baseHead.y + (reducedMotion ? 0 : steer * (id === "rivet" ? 0.17 : 0.085));
      head.rotation.z = baseHead.z + (reducedMotion ? 0 : Math.sin(tick * 0.04) * 0.014);
      accent.rotation.z = baseAccent.z + (reducedMotion ? 0 : Math.sin(tick * 0.055 - 0.5) * 0.019 - steer * (id === "pompa" ? 0.095 : 0.035));
      accent.rotation.x = baseAccent.x + (reducedMotion ? 0 : Math.sin(tick * 0.048) * 0.022);
      if (id === "bollo") {
        // Only the cushion torso squashes; the grip remains planted on its target.
        head.scaling.y = 1 - swapping * 0.13;
        head.scaling.x = 1 + swapping * 0.055;
      }
    },
  };
}
