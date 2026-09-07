import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { WheelId } from "@kartsick/content";
import { Atelier } from "../geometry";
import { soft } from "../characters/rig";

const TIRE = "#30394f", CREAM = "#f5edda";
export const WHEEL_RADII: Record<WheelId, number> = { picnic: 0.43, button: 0.37, thimble: 0.43, bramble: 0.45, cushion: 0.44, spool: 0.48 };
const WIDTH: Record<WheelId, number> = { picnic: 0.34, button: 0.31, thimble: 0.32, bramble: 0.37, cushion: 0.45, spool: 0.25 };

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

export function makeWheels(art: Atelier, parent: TransformNode, id: WheelId, accent: string): WheelRig {
  const steering: TransformNode[] = [], rollers: TransformNode[] = [];
  const radius = WHEEL_RADII[id], width = WIDTH[id];
  for (const side of [-1, 1]) for (const front of [true, false]) {
    const pivot = new TransformNode("wheel steering", art.scene);
    pivot.parent = parent;
    pivot.position.set(side * 0.99, radius - 0.43, front ? 0.95 : -1.13);
    if (front) steering.push(pivot);
    const roller = new TransformNode(`${id} wheel rotation`, art.scene);
    roller.metadata = { kind: "wheel", wheelId: id, radius };
    roller.parent = pivot;
    rollers.push(roller);
    if (id !== "spool") disc(art, roller, "rubber tire core", 0, radius * 2 - 0.1, width, TIRE);
    else ring(art, roller, "open lightweight tire", 0, radius * 2 - 0.075, 0.075, TIRE);
    for (const outer of [-1, 1]) {
      const x = outer * width / 2;
      ring(art, roller, "smooth rounded tire shoulder", x * 0.74, radius * 2 - 0.13, 0.13, TIRE);
      switch (id) {
        case "picnic":
          disc(art, roller, "cream picnic sidewall", x, 0.64, 0.025, CREAM);
          disc(art, roller, "picnic blue hub", x * 1.09, 0.31, 0.03, "#3445a8");
          for (let i = 0; i < 5; i++) {
            const a = i / 5 * Math.PI * 2;
            soft(art, roller, "blue hub dot", [x * 1.14, Math.sin(a) * 0.227, Math.cos(a) * 0.227], [0.025, 0.065, 0.065], "#3445a8");
          }
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
            soft(art, roller, "thimble stamped dimple", [x * 1.41, Math.sin(a) * 0.23, Math.cos(a) * 0.23], [0.009, 0.029, 0.029], "#7f939e");
          }
          break;
        case "bramble":
          disc(art, roller, "copper bramble hub", x, 0.5, 0.045, "#c6925c");
          disc(art, roller, "bramble inset axle", x * 1.17, 0.23, 0.055, "#6a7b65");
          for (let i = 0; i < 12; i++) {
            const a = i / 12 * Math.PI * 2;
            const knob = art.oval("rounded offroad knob", [x * 0.48, Math.sin(a) * 0.424, Math.cos(a) * 0.424], [0.19, 0.1, 0.15], "#45545b", roller, 0.7, 6);
            knob.rotation.x = -a;
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
  }
  return { steering, rollers, radius };
}
