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
    if (!(material instanceof StandardMaterial) || material.disableLighting || material.metadata?.surfaceFinish !== "matte" ||
      material.alpha !== 1 || !material.backFaceCulling ||
      material.getActiveTextures().some(texture => texture !== material.reflectionTexture)) continue;
    const color = material.diffuseColor.toHexString();
    mesh.material = art.surface(color, finishes.get(color) ?? fallback);
  }
}

export function eyes(art: Atelier, parent: TransformNode, spread: number, y: number, z: number, size = 1, sleepy = false, iris = "#467c85"): void {
  for (const side of [-1, 1]) {
    const x = side * spread, height = (sleepy ? 0.125 : 0.19) * size;
    const white = art.sculpt("eye porcelain", [[-0.5, 0.14, 0.06], [-0.33, 0.47, 0.22],
      [0.18, 0.5, 0.27], [0.44, sleepy ? 0.42 : 0.28, 0.16], [0.5, 0.12, 0.04]], CREAM, parent, 0.78, 12);
    white.position.set(x, y, z - 0.009);
    white.scaling.set(0.157 * size, height, 0.055);
    white.rotation.z = side * (sleepy ? 0.12 : -0.055);
    surface(art, white, CREAM, "paint");
    surface(art, art.oval("separate iris", [x - side * 0.011, y - 0.006, z + 0.0055],
      [0.074 * size, height * 0.69, 0.006], iris, parent, 0.9, 6), iris, "paint");
    surface(art, art.oval("focused pupil", [x - side * 0.011, y - 0.008, z + 0.009],
      [0.034 * size, height * 0.49, 0.004], INK, parent, 0.86, 6), INK, "paint");
    surface(art, art.oval("eye catchlight", [x - 0.018, y + height * 0.18, z + 0.012],
      [0.018, 0.022, 0.003], "#ffffff", parent, 1, 4), "#ffffff", "paint");
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
      art.sculpt("bent tailored sleeve", [[0, 0.055, 0.045], [0.085, anatomy.armWidth, anatomy.armWidth * 0.84],
        [0.25, anatomy.armWidth * 0.85, anatomy.armWidth * 0.76, side * 0.045, -0.035],
        [0.4, anatomy.armWidth * (anatomy.shaggy ? 1.03 : 0.72), anatomy.armWidth * 0.67, side * 0.03, -0.02],
        [0.51, anatomy.armWidth * 0.66, anatomy.armWidth * 0.59], [0.57, 0.045, 0.035]], anatomy.sleeve, arm, 0.76, 12);
      art.sculpt("turned sleeve cuff", [[0.47, anatomy.armWidth * 0.68, anatomy.armWidth * 0.6],
        [0.49, anatomy.armWidth * 0.78, anatomy.armWidth * 0.68], [0.53, anatomy.armWidth * 0.76, anatomy.armWidth * 0.65],
        [0.55, anatomy.armWidth * 0.61, anatomy.armWidth * 0.53]], anatomy.sleeve, arm, 0.68, 10);
      if (anatomy.shaggy) for (let i = 0; i < 3; i++) {
        art.sculpt("flat hanging forearm lock", [[0.13 + i * 0.09, 0.055, 0.025, side * 0.13, -0.065],
          [0.24 + i * 0.065, 0.075, 0.029, side * 0.18, -0.07],
          [0.35 + i * 0.055, 0.012, 0.009, side * 0.19, -0.09]], anatomy.sleeve, arm, 0.72, 8);
      }
    }
    const hand = node(art, "gripping hand", root);
    const h = anatomy.handSize;
    const palm = art.sculpt("shaped grip palm", [[-0.39, 0.29, 0.24, -side * 0.03, 0.01],
      [-0.21, 0.46, 0.36, -side * 0.025], [0.11, 0.5, 0.36],
      [0.32, 0.39, 0.27, side * 0.035, -0.015], [0.39, 0.24, 0.18]], anatomy.hand, hand, 0.65, 12);
    palm.scaling.setAll(h);
    const thumb = art.sweep("opposed curled thumb", [[-side * h * 0.34, h * 0.06, h * 0.07],
      [-side * h * 0.43, -h * 0.13, h * 0.25], [-side * h * 0.25, -h * 0.23, h * 0.34]],
    [h * 0.19, h * 0.18, h * 0.09], anatomy.hand, hand, 8);
    thumb.scaling.z = 0.9;
    art.sweep("grip crease", [[-h * 0.22, 0.018, h * 0.43], [0, 0.035, h * 0.45], [h * 0.22, 0.018, h * 0.43]], [0.006, 0.008, 0.006], anatomy.sleeve, hand, 6);
    soft(art, hand, "curled finger ridge", [0, -h * 0.2, h * 0.27], [h * 0.79, h * 0.27, h * 0.33], anatomy.hand, 0.62);
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
