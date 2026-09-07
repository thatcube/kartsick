import { Atelier } from "../geometry";
import { CREAM, INK, PLUM, eyes, node, riderRig, soft } from "./rig";
import type { RiderModel } from "./rig";

export function bollo(art: Atelier): RiderModel {
  const root = node(art, "Bollo");
  const head = node(art, "Bollo cushion body", root, [0, 0.19, 0]);
  const accent = node(art, "Bollo folded corners", head);
  const blue = "#a9d2ed";
  art.sculpt("rounded triangular pillow", [[0, 0.23, 0.16], [0.12, 0.45, 0.28], [0.34, 0.51, 0.34], [0.7, 0.41, 0.3], [0.96, 0.25, 0.21], [1.06, 0.08, 0.09]], blue, head, 0.78);
  art.sweep("pillow perimeter piping", [[0, 0, 0], [-0.45, 0.12, 0], [-0.514, 0.34, 0], [-0.414, 0.7, 0], [-0.25, 0.96, 0], [0, 1.071, 0], [0.25, 0.96, 0], [0.414, 0.7, 0], [0.514, 0.34, 0], [0.45, 0.12, 0], [0, 0, 0]], [0.012, 0.012, 0.012, 0.012, 0.012, 0.012, 0.012, 0.012, 0.012, 0.012, 0.012], "#78aecb", head);
  for (const side of [-1, 1]) {
    art.sweep("folded soft pillow corner", [[side * 0.245, 0.87, 0], [side * 0.33, 1.055, -0.01], [side * 0.275, 1.14, 0.09], [side * 0.205, 1.04, 0.15]], [0.12, 0.1, 0.055, 0.006], blue, accent, 12);
    soft(art, root, "oversized plum slipper", [side * 0.3, 0.12, 0.2], [0.47, 0.25, 0.59], PLUM, 0.72);
    soft(art, root, "slipper cuff", [side * 0.3, 0.21, 0.045], [0.35, 0.11, 0.33], "#8d698b", 0.72);
  }
  eyes(art, head, 0.063, 0.69, 0.322, 0.85);
  art.sweep("tiny sideways mouth", [[0.13, 0.49, 0.341], [0.165, 0.475, 0.334], [0.178, 0.501, 0.33]], [0.009, 0.012, 0.007], INK, head);
  for (let i = 0; i < 3; i++) art.sweep("hand stitched pillow seam", [[0.505, 0.3 + i * 0.04, -0.025], [0.511, 0.31 + i * 0.04, 0.025]], [0.006, 0.006], CREAM, head, 6);
  return riderRig(art, "bollo", root, head, accent, { shoulder: [0.4, 0.77, 0.015], sleeve: blue, hand: blue, armWidth: 0.069, handSize: 0.195, noodle: true });
}

export function hunkle(art: Atelier): RiderModel {
  const root = node(art, "Hunkle");
  const head = node(art, "Hunkle tiny face", root, [0, 1.14, 0.13]);
  const accent = node(art, "Hunkle cream bowl fringe", head);
  const fur = "#99b9ac";
  art.sculpt("orangutan powerful torso", [[0.2, 0.25, 0.2], [0.39, 0.44, 0.3], [0.79, 0.49, 0.29], [1.1, 0.39, 0.24], [1.27, 0.19, 0.13]], fur, root, 0.82);
  art.sculpt("tiny cropped track jacket", [[0.52, 0.49, 0.33], [0.59, 0.51, 0.34], [0.86, 0.56, 0.345], [1.1, 0.46, 0.302], [1.2, 0.3, 0.21]], PLUM, root, 0.84);
  for (const side of [-1, 1]) {
    soft(art, root, "hunched shaggy shoulder", [side * 0.46, 1.07, -0.015], [0.48, 0.53, 0.55], fur);
    soft(art, root, "orangutan soft foot", [side * 0.29, 0.12, 0.2], [0.43, 0.26, 0.6], "#718d85", 0.7);
    for (let i = 0; i < 3; i++) art.sweep("shoulder hanging locks", [[side * (0.43 + i * 0.065), 1.15, -0.16], [side * (0.47 + i * 0.067), 0.98, -0.22], [side * (0.46 + i * 0.067), 0.83, -0.21]], [0.075, 0.055, 0.003], fur, root);
    soft(art, head, "orangutan ear", [side * 0.22, 0.08, 0.005], [0.15, 0.19, 0.13], "#c6cdb6");
  }
  art.sculpt("small buried orangutan skull", [[-0.18, 0.08, 0.1], [-0.08, 0.2, 0.18], [0.17, 0.21, 0.18], [0.28, 0.13, 0.1]], fur, head);
  soft(art, head, "cream facial disc", [0, 0.025, 0.134], [0.36, 0.36, 0.16], "#d6d4b8", 0.83);
  soft(art, head, "orangutan broad little muzzle", [0, -0.105, 0.217], [0.28, 0.14, 0.17], "#c8bd9f", 0.72);
  eyes(art, head, 0.087, 0.077, 0.221, 0.71, true);
  for (const side of [-1, 1]) soft(art, head, "small ape nostril", [side * 0.036, -0.055, 0.292], [0.03, 0.02, 0.018], INK);
  art.sweep("gentle ape smile", [[-0.075, -0.15, 0.257], [0, -0.167, 0.275], [0.075, -0.15, 0.257]], [0.007, 0.008, 0.007], INK, head);
  soft(art, accent, "blunt cream bowl cut", [0, 0.245, 0.005], [0.49, 0.23, 0.41], "#e9dfba", 0.62);
  for (let i = 0; i < 6; i++) art.sweep("bowl fringe strand", [[-0.175 + i * 0.07, 0.28, 0.135], [-0.175 + i * 0.07, 0.17, 0.177]], [0.012, 0.008], "#cfcaab", accent, 6);
  art.sweep("diagonal custard sash", [[-0.36, 1.07, 0.235], [-0.17, 0.87, 0.331], [0.08, 0.69, 0.333], [0.32, 0.55, 0.27]], [0.059, 0.063, 0.065, 0.055], "#ffd46b", root, 8);
  art.sweep("jacket zipper", [[0, 0.57, 0.327], [0, 0.97, 0.333]], [0.012, 0.012], "#b59aaf", root);
  soft(art, root, "jacket zip tab", [0.012, 0.94, 0.35], [0.057, 0.078, 0.028], CREAM, 0.6);
  return riderRig(art, "hunkle", root, head, accent, { shoulder: [0.49, 0.97, 0.045], sleeve: fur, hand: "#c5c9ad", armWidth: 0.21, handSize: 0.37, shaggy: true });
}
