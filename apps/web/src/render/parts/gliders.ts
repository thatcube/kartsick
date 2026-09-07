import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { GliderId } from "@kartsick/content";
import { Atelier } from "../geometry";
import type { Triple } from "../geometry";
import type { BodyPalette } from "./bodies";

function sail(art: Atelier, wing: TransformNode, name: string, rows: Triple[][], color: string): void {
  const mesh = MeshBuilder.CreateRibbon(name, {
    pathArray: rows.map(row => row.map(point => new Vector3(...point))),
    sideOrientation: Mesh.DOUBLESIDE,
  }, art.scene);
  art.place(mesh, [0, 0, 0], art.material(color), wing);
}

const NAMES: Record<GliderId, string> = { mapwing: "Mapwing", sunfan: "Sunfan", crosskite: "Crosskite", bellflower: "Bellflower" };

export function makeGlider(art: Atelier, parent: TransformNode, id: GliderId, palette: BodyPalette): TransformNode {
  const wing = new TransformNode(`${NAMES[id]} assembly`, art.scene);
  wing.parent = parent;
  wing.position.set(0, 2.92, -0.27);
  wing.metadata = { kind: "glider", gliderId: id };
  const mastHeights: Record<GliderId, number> = { mapwing: 0.54, sunfan: 0.43, crosskite: 0.51, bellflower: 0.72 };
  const mastTip: Triple = [0, mastHeights[id], id === "sunfan" ? -0.25 : 0];
  art.tube("telescoping glider mast", [[0, -2.37, 0], [0, 0, 0], mastTip], 0.038, palette.trim, wing);
  art.tube("glider tension bridle", [[-0.68, -2.3, 0], mastTip, [0.68, -2.3, 0]], 0.009, "#687d87", wing);
  art.oval("canopy mast collar", mastTip, [0.2, 0.09, 0.18], palette.trim, wing, 0.8, 8);
  switch (id) {
    case "mapwing":
      for (const side of [-1, 1]) {
        const rows: Triple[][] = [];
        for (let r = 0; r <= 12; r++) {
          const x = side * (0.055 + r / 12 * 3.35);
          const row: Triple[] = [];
          for (let c = 0; c <= 8; c++) {
            const t = c / 8;
            row.push([x, 0.54 - Math.abs(x) * 0.075 + Math.sin(t * Math.PI) * 0.16 + Math.cos(r * Math.PI / 2) * 0.027,
              (t - 0.5) * (1.93 - Math.abs(x) * 0.22)]);
          }
          rows.push(row);
          if (r % 3 === 0) art.tube("map-fold sewn rib", row, 0.014, palette.trim, wing);
        }
        sail(art, wing, "curved map-fold fabric panel", rows, side < 0 ? palette.enamel : palette.accent);
        for (const column of [0, 8]) art.tube("Mapwing bound edge", rows.map(row => row[column]), 0.025, palette.trim, wing);
        art.tube("original map route on canopy", [[side * 0.5, 0.68, 0.05], [side * 1.1, 0.639, -0.03], [side * 1.8, 0.596, 0.19], [side * 2.5, 0.525, 0.09]], 0.013, "#f5edda", wing);
      }
      break;
    case "sunfan":
      for (const side of [-1, 1]) {
        for (let panel = 0; panel < 5; panel++) {
          const rows: Triple[][] = [];
          for (let r = 0; r <= 7; r++) {
            const t = r / 7;
            const angle = (-0.6 + (panel + t) / 5 * 1.5);
            const radius = 3.35 - Math.sin((panel + t) / 5 * Math.PI) * 0.18;
            const row: Triple[] = [];
            for (let c = 0; c <= 6; c++) {
              const u = 0.02 + c / 6 * 0.98;
              row.push([side * Math.cos(angle) * radius * u,
                0.43 + Math.sin(u * Math.PI) * 0.28 - u * 0.065 + Math.sin(t * Math.PI) * u * 0.065,
                Math.sin(angle) * radius * u * 0.67 - 0.25]);
            }
            rows.push(row);
          }
          sail(art, wing, "folding moth fan segment", rows, panel % 2 ? palette.accent : palette.enamel);
          art.tube("fan radial folding spar", rows[0], 0.018, palette.trim, wing);
          art.tube("fan scalloped hem", rows.map(row => row[6]), 0.023, palette.trim, wing);
        }
      }
      break;
    case "crosskite": {
      const corners: Triple[] = [[0, 0.44, -1.73], [-2.8, 0.24, 0], [0, 0.44, 1.55], [2.8, 0.24, 0]];
      for (let panel = 0; panel < 4; panel++) {
        const rows: Triple[][] = [];
        const a = corners[panel], b = corners[(panel + 1) % 4];
        for (let r = 0; r <= 8; r++) {
          const t = r / 8, row: Triple[] = [];
          for (let c = 0; c <= 6; c++) {
            const u = 0.002 + c / 6 * 0.998;
            row.push([(a[0] * (1 - t) + b[0] * t) * u, 0.51 + ((a[1] * (1 - t) + b[1] * t) - 0.51) * u + Math.sin(t * Math.PI) * Math.sin(u * Math.PI) * 0.06,
              (a[2] * (1 - t) + b[2] * t) * u]);
          }
          rows.push(row);
        }
        sail(art, wing, "taut diamond sail quadrant", rows, panel % 2 ? palette.trim : palette.enamel);
        art.tube("diamond bound edge", [a, b], 0.023, palette.accent, wing);
      }
      art.tube("crosskite long crossed spar", [corners[0], [0, 0.52, 0], corners[2]], 0.029, "#687d87", wing);
      art.tube("crosskite narrow crossed spar", [corners[1], [0, 0.52, 0], corners[3]], 0.029, "#687d87", wing);
      break;
    }
    case "bellflower":
      for (let petal = 0; petal < 4; petal++) {
        const angle = petal / 4 * Math.PI * 2 + Math.PI / 4;
        const rows: Triple[][] = [];
        for (let r = 0; r <= 12; r++) {
          const t = r / 12, distance = 0.01 + t * 2.75;
          const width = Math.sin(t * Math.PI) * 0.95 + 0.025;
          const row: Triple[] = [];
          for (let c = 0; c <= 8; c++) {
            const s = c / 8 * 2 - 1;
            row.push([Math.cos(angle) * distance - Math.sin(angle) * s * width,
              0.72 - t * t * 0.61 + (1 - s * s) * Math.sin(t * Math.PI) * 0.17,
              (Math.sin(angle) * distance + Math.cos(angle) * s * width) * 0.8]);
          }
          rows.push(row);
        }
        sail(art, wing, "soft bellflower fabric lobe", rows, petal % 2 ? palette.enamel : palette.accent);
        art.tube("bellflower central petal rib", rows.map(row => row[4]), 0.019, palette.trim, wing);
        for (const c of [0, 8]) art.tube("bellflower petal piping", rows.map(row => row[c]), 0.02, palette.trim, wing);
      }
      break;
  }
  wing.setEnabled(false);
  return wing;
}
