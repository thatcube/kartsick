import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { WheelId } from "@kartsick/content";
import { Atelier } from "../geometry";
import { finishModel, soft, surface } from "../characters/rig";

const TIRE = "#252e3c", CREAM = "#f5edda";
export const WHEEL_RADII: Record<WheelId, number> = { picnic: 0.43, button: 0.37, thimble: 0.43, bramble: 0.45, cushion: 0.44, spool: 0.48 };
export const WHEEL_WIDTHS: Record<WheelId, number> = { picnic: 0.4, button: 0.36, thimble: 0.36, bramble: 0.43, cushion: 0.47, spool: 0.27 };
export const WHEEL_STANCE = { halfTrack: 1.025, frontZ: 0.88, rearZ: -0.98 } as const;

export interface WheelRig { steering: TransformNode[]; rollers: TransformNode[]; radius: number }

function disc(art: Atelier, root: TransformNode, name: string, x: number, diameter: number, thickness: number, color: string) {
  const mesh = art.cylinder(name, [x, 0, 0], diameter, diameter, thickness, color, root);
  mesh.rotation.z = Math.PI / 2;
  return mesh;
}

function ring(art: Atelier, root: TransformNode, name: string, x: number, diameter: number, thickness: number, color: string) {
  const mesh = MeshBuilder.CreateTorus(name, { diameter, thickness, tessellation: 20 }, art.scene);
  art.place(mesh, [x, 0, 0], art.material(color), root);
  mesh.rotation.z = Math.PI / 2;
}

/** One rounded tire carcass and one low-vertex tread mesh instead of many overlapping toruses. */
function tire(art: Atelier, root: TransformNode, radius: number, width: number, id: WheelId): void {
  const profile = [
    [radius * 0.5, -width * 0.48], [radius * 0.73, -width * 0.52], [radius * 0.91, -width * 0.48],
    [radius - 0.017, -width * 0.33], [radius - 0.013, 0], [radius - 0.017, width * 0.33],
    [radius * 0.91, width * 0.48], [radius * 0.73, width * 0.52], [radius * 0.5, width * 0.48],
    [radius * 0.5, -width * 0.48],
  ];
  const carcass = MeshBuilder.CreateLathe("rounded rubber carcass", {
    shape: profile.map(([r, x]) => new Vector3(r, x, 0)), tessellation: 32,
  }, art.scene);
  art.place(carcass, [0, 0, 0], art.surface(TIRE, "rubber"), root);
  carcass.rotation.z = Math.PI / 2;
  const positions: number[] = [], indices: number[] = [];
  const blocks = id === "bramble" ? 16 : 28;
  for (const side of [-1, 1]) for (let i = 0; i < blocks; i++) {
    const angle = (i + (side === -1 ? 0.35 : 0)) / blocks * Math.PI * 2;
    const arc = Math.PI * 2 / blocks * (id === "bramble" ? 0.3 : 0.42);
    const base = positions.length / 3;
    for (const r of [radius - 0.024, radius]) for (const x of [side * width * 0.035, side * width * 0.31]) {
      for (const a of [-arc, arc]) {
        const theta = angle + a + x * 0.45;
        positions.push(x, Math.sin(theta) * r, Math.cos(theta) * r);
      }
    }
    for (const face of [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]) {
      const [a, b, c, d] = side === -1 ? face : [...face].reverse();
      indices.push(base + a, base + b, base + c, base + a, base + c, base + d);
    }
  }
  const tread = art.mesh("staggered chevron tire tread", positions, indices);
  art.place(tread, [0, 0, 0], art.surface("#35404c", "rubber"), root);
}

export function makeWheels(art: Atelier, parent: TransformNode, id: WheelId, accent: string): WheelRig {
  const steering: TransformNode[] = [], rollers: TransformNode[] = [];
  const radius = WHEEL_RADII[id], width = WHEEL_WIDTHS[id];
  for (const side of [-1, 1]) for (const front of [true, false]) {
    const pivot = new TransformNode("wheel steering", art.scene);
    pivot.parent = parent;
    pivot.position.set(side * WHEEL_STANCE.halfTrack, radius - 0.43, front ? WHEEL_STANCE.frontZ : WHEEL_STANCE.rearZ);
    if (front) steering.push(pivot);
    const roller = new TransformNode(`${id} wheel rotation`, art.scene);
    roller.metadata = { kind: "wheel", wheelId: id, radius, width };
    roller.parent = pivot;
    rollers.push(roller);
    if (id !== "spool") tire(art, roller, radius, width, id);
    else ring(art, roller, "open lightweight tire", 0, radius * 2 - 0.075, 0.075, TIRE);
    const brake = disc(art, roller, "inboard steel brake disc", -side * width * 0.37, radius * 0.98, 0.035, "#788795");
    surface(art, brake, "#788795", "metal");
    for (const x of [-1, 1]) ring(art, roller, "embossed rubber sidewall bead", x * width * 0.51, radius * 1.46, 0.019, "#43505b");
    for (const outer of [-1, 1]) {
      const x = outer * width / 2;
      if (outer !== side && id !== "spool") {
        disc(art, roller, "inboard hub bearing", x, radius * 0.65, 0.038, "#6a7b87");
        continue;
      }
      switch (id) {
        case "picnic":
          ring(art, roller, "cream picnic sidewall", x, 0.568, 0.082, CREAM);
          disc(art, roller, "recessed picnic rim bowl", x * 0.99, 0.48, 0.035, "#738897");
          disc(art, roller, "picnic blue hub", x * 1.07, 0.31, 0.055, "#3445a8");
          for (let i = 0; i < 5; i++) {
            const a = i / 5 * Math.PI * 2;
            soft(art, roller, "blue hub dot", [x * 1.14, Math.sin(a) * 0.227, Math.cos(a) * 0.227], [0.025, 0.065, 0.065], "#3445a8");
          }
          disc(art, roller, "polished axle button", x * 1.25, 0.11, 0.042, "#dce3dd");
          break;
        case "button":
          disc(art, roller, "oversized sewn button hub", x * 1.05, 0.58, 0.07, accent);
          ring(art, roller, "button raised lip", x * 1.3, 0.48, 0.03, CREAM);
          for (const y of [-0.075, 0.075]) for (const z of [-0.075, 0.075]) soft(art, roller, "button thread hole", [x * 1.32, y, z], [0.028, 0.065, 0.065], TIRE);
          art.tube("crossed button thread", [[x * 1.43, -0.075, -0.075], [x * 1.46, 0.075, 0.075], [x * 1.43, 0.075, -0.075], [x * 1.46, -0.075, 0.075]], 0.012, CREAM, roller);
          break;
        case "thimble":
          disc(art, roller, "broad polished thimble hub", x, 0.71, 0.06, "#b5c6ca");
          soft(art, roller, "convex thimble cap", [x * 1.16, 0, 0], [0.1, 0.58, 0.58], "#dce3dd");
          for (let i = 0; i < 10; i++) {
            const a = i / 10 * Math.PI * 2;
            art.oval("thimble stamped dimple", [x * 1.41, Math.sin(a) * 0.23, Math.cos(a) * 0.23], [0.009, 0.029, 0.029], "#7f939e", roller, 1, 4);
          }
          break;
        case "bramble":
          disc(art, roller, "copper bramble hub", x, 0.5, 0.045, "#c6925c");
          disc(art, roller, "bramble inset axle", x * 1.17, 0.23, 0.055, "#6a7b65");
          for (let i = 0; i < 5; i++) {
            const a = i / 5 * Math.PI * 2;
            soft(art, roller, "bramble recessed hub bolt", [x * 1.17, Math.sin(a) * 0.175, Math.cos(a) * 0.175], [0.032, 0.04, 0.04], "#e0c4a1", 0.65);
          }
          break;
        case "cushion":
          disc(art, roller, "cushion sidewall", x * 0.92, 0.62, 0.045, "#657582");
          for (let i = 0; i < 7; i++) {
            const a = i / 7 * Math.PI * 2;
            const petal = soft(art, roller, "ribbed petal hub", [x * 1.13, Math.sin(a) * 0.18, Math.cos(a) * 0.18], [0.085, 0.15, 0.28], i % 2 ? CREAM : accent);
            petal.rotation.x = -a;
          }
          disc(art, roller, "petal central button", x * 1.28, 0.17, 0.04, "#694665");
          break;
        case "spool":
          ring(art, roller, "spool thin rim", x, 0.78, 0.025, CREAM);
          disc(art, roller, "spool narrow axle", x, 0.15, 0.075, "#694665");
          for (let i = 0; i < 8; i++) {
            const a = i / 8 * Math.PI * 2;
            art.tube("colored open spoke web", [[x, Math.sin(a) * 0.36, Math.cos(a) * 0.36], [x * 0.55, 0, 0], [x, Math.sin(a + 0.4) * 0.36, Math.cos(a + 0.4) * 0.36]], 0.013, i % 2 ? accent : "#63cab9", roller);
          }
          break;
      }
    }
    finishModel(art, roller, "metal", { rubber: [TIRE, "#43505b", CREAM, "#657582"] });
  }
  return { steering, rollers, radius };
}
