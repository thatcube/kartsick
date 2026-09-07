import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { lerp } from "@kartsick/content";
import type { CharacterId } from "@kartsick/content";
import { Atelier } from "../geometry";
import type { Triple } from "../geometry";

export const INK = "#30394f";
export const CREAM = "#fff0cf";
export const PLUM = "#694665";
export const MINT = "#63cab9";

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
  return art.oval(name, position, size, color, parent, square, 10);
}

export function eyes(art: Atelier, parent: TransformNode, spread: number, y: number, z: number, size = 1, sleepy = false): void {
  for (const side of [-1, 1]) {
    soft(art, parent, "eye porcelain", [side * spread, y, z], [0.14 * size, (sleepy ? 0.10 : 0.18) * size, 0.055], CREAM);
    soft(art, parent, "separate iris", [side * (spread - 0.007), y - 0.005, z + 0.026], [0.061 * size, 0.107 * size, 0.029], INK);
    soft(art, parent, "eye catchlight", [side * spread - 0.011, y + 0.026, z + 0.041], [0.023, 0.026, 0.012], "#ffffff");
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
      art.sculpt("tailored sleeve", [[0, 0.045, 0.045], [0.07, anatomy.armWidth, anatomy.armWidth], [0.28, anatomy.armWidth * 0.85, anatomy.armWidth * 0.87], [0.49, anatomy.armWidth * (anatomy.shaggy ? 1.08 : 0.68), anatomy.armWidth * 0.72], [0.57, 0.045, 0.045]], anatomy.sleeve, arm);
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
    return { side, arm, hand, direction: new Vector3() };
  });
  return {
    root, head, accent,
    pose(front, steer, tick, reducedMotion, swapping) {
      const cosine = Math.cos(root.rotation.z), sine = Math.sin(root.rotation.z);
      for (const { side, arm, hand, direction } of arms) {
        const x = side * lerp(0.55, 0.255, front);
        const y = lerp(0.4, 0.51, front) - (swapping > 0 ? 0 : root.position.y - 0.62);
        // Lean the torso around a planted grip, rather than pulling the mittens off the rail.
        hand.position.set(x * cosine + y * sine, -x * sine + y * cosine, lerp(-0.2, 0.5, front));
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
