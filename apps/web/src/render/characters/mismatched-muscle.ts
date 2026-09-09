import { Atelier } from "../geometry";
import { CREAM, INK, PLUM, eyes, finishModel, node, riderRig, seatedLegs, soft } from "./rig";
import type { RiderModel } from "./rig";

export function bollo(art: Atelier): RiderModel {
  const root = node(art, "Bollo");
  const head = node(art, "Bollo cushion body", root, [0, 0.105, 0]);
  const accent = node(art, "Bollo folded corners", head);
  const blue = "#a9d2ed";
  art.sculpt("compressed triangular pillow with seated haunch", [[0, 0.27, 0.19, 0, 0.03], [0.13, 0.49, 0.33, 0, 0.015],
    [0.35, 0.53, 0.375], [0.61, 0.47, 0.35], [0.86, 0.31, 0.255], [1.035, 0.14, 0.13], [1.075, 0.065, 0.075]], blue, head, 0.84, 24);
  art.sweep("pillow perimeter piping", [[0, 0, 0], [-0.45, 0.12, 0], [-0.514, 0.34, 0], [-0.414, 0.7, 0], [-0.25, 0.96, 0], [0, 1.071, 0], [0.25, 0.96, 0], [0.414, 0.7, 0], [0.514, 0.34, 0], [0.45, 0.12, 0], [0, 0, 0]], [0.012, 0.012, 0.012, 0.012, 0.012, 0.012, 0.012, 0.012, 0.012, 0.012, 0.012], "#78aecb", head);
  for (const side of [-1, 1]) {
    art.sweep("folded soft pillow corner", [[side * 0.245, 0.87, 0], [side * 0.33, 1.055, -0.01], [side * 0.275, 1.14, 0.09], [side * 0.205, 1.04, 0.15]], [0.12, 0.1, 0.055, 0.006], blue, accent, 12);
    soft(art, root, "oversized plum slipper", [side * 0.3, 0.025, 0.42], [0.47, 0.25, 0.59], PLUM, 0.72);
    soft(art, root, "slipper cuff", [side * 0.3, 0.13, 0.265], [0.35, 0.11, 0.33], "#8d698b", 0.72);
    art.sweep("soft seat compression fold", [[side * 0.28, 0.09, 0.215], [side * 0.43, 0.16, 0.25],
      [side * 0.47, 0.24, 0.225]], [0.009, 0.018, 0.004], "#78aecb", head);
  }
  eyes(art, head, 0.075, 0.69, 0.338, 0.93, false, "#586b9b");
  art.sweep("tiny sideways mouth", [[0.13, 0.49, 0.362], [0.17, 0.475, 0.36], [0.186, 0.508, 0.35]], [0.009, 0.014, 0.007], INK, head);
  soft(art, head, "stuffed smile dimple", [0.235, 0.48, 0.32], [0.1, 0.065, 0.035], "#93bfdc");
  for (let i = 0; i < 3; i++) art.sweep("hand stitched pillow seam", [[0.505, 0.3 + i * 0.04, -0.025], [0.511, 0.31 + i * 0.04, 0.025]], [0.006, 0.006], CREAM, head, 6);
  finishModel(art, root, "fabric");
  return riderRig(art, "bollo", root, head, accent, { shoulder: [0.44, 0.67, 0.015], sleeve: blue, hand: blue, armWidth: 0.08, handSize: 0.21, noodle: true });
}

export function hunkle(art: Atelier): RiderModel {
  const root = node(art, "Hunkle");
  const head = node(art, "Hunkle tiny face", root, [0, 0.98, 0.19]);
  const accent = node(art, "Hunkle cream bowl fringe", head);
  const fur = "#99b9ac";
  art.sculpt("hunched seated orangutan torso", [[0.13, 0.29, 0.23, 0, -0.05], [0.32, 0.48, 0.34],
    [0.64, 0.54, 0.335], [0.93, 0.44, 0.27], [1.1, 0.23, 0.18]], fur, root, 0.85, 24);
  seatedLegs(art, root, fur, 0.29, 0.18);
  art.sculpt("tiny cropped track jacket", [[0.4, 0.51, 0.365], [0.46, 0.55, 0.37], [0.7, 0.58, 0.37],
    [0.91, 0.48, 0.325], [1.02, 0.3, 0.22]], PLUM, root, 0.84, 24);
  for (const side of [-1, 1]) {
    soft(art, root, "hunched shaggy shoulder", [side * 0.49, 0.89, -0.015], [0.48, 0.52, 0.56], fur);
    soft(art, root, "orangutan soft foot", [side * 0.29, 0.025, 0.44], [0.43, 0.26, 0.56], "#718d85", 0.7);
    for (let i = 0; i < 3; i++) art.sweep("shoulder hanging locks", [[side * (0.46 + i * 0.065), 0.99, -0.16], [side * (0.5 + i * 0.067), 0.82, -0.22], [side * (0.49 + i * 0.067), 0.67, -0.21]], [0.08, 0.058, 0.003], fur, root);
    soft(art, head, "orangutan ear", [side * 0.22, 0.08, 0.005], [0.15, 0.19, 0.13], "#c6cdb6");
  }
  art.sculpt("small buried orangutan skull", [[-0.18, 0.08, 0.1], [-0.08, 0.2, 0.18], [0.17, 0.21, 0.18], [0.28, 0.13, 0.1]], fur, head);
  art.sculpt("recessed heart-shaped facial mask", [[-0.16, 0.105, 0.04, 0, 0.145], [-0.08, 0.18, 0.07, 0, 0.16],
    [0.08, 0.195, 0.08, 0, 0.16], [0.185, 0.13, 0.05, 0, 0.135]], "#d6d4b8", head, 0.9, 20);
  soft(art, head, "orangutan broad little muzzle", [0, -0.105, 0.217], [0.28, 0.14, 0.17], "#c8bd9f", 0.72);
  eyes(art, head, 0.093, 0.077, 0.239, 0.8, true, "#78624e");
  for (const side of [-1, 1]) soft(art, head, "small ape nostril", [side * 0.036, -0.055, 0.292], [0.03, 0.02, 0.018], INK);
  art.sweep("gentle ape smile", [[-0.075, -0.15, 0.257], [0, -0.167, 0.275], [0.075, -0.15, 0.257]], [0.007, 0.008, 0.007], INK, head);
  soft(art, accent, "blunt cream bowl cut", [0, 0.245, 0.005], [0.49, 0.23, 0.41], "#e9dfba", 0.62);
  for (let i = 0; i < 6; i++) art.sweep("bowl fringe strand", [[-0.175 + i * 0.07, 0.28, 0.135], [-0.175 + i * 0.07, 0.17, 0.177]], [0.012, 0.008], "#cfcaab", accent, 6);
  art.sweep("diagonal custard sash", [[-0.36, 0.94, 0.245], [-0.17, 0.74, 0.37], [0.08, 0.56, 0.374], [0.32, 0.43, 0.3]], [0.059, 0.063, 0.065, 0.055], "#ffd46b", root, 8);
  art.sweep("jacket zipper", [[0, 0.44, 0.369], [0, 0.83, 0.36]], [0.012, 0.012], "#b59aaf", root);
  soft(art, root, "jacket zip tab", [0.012, 0.8, 0.38], [0.057, 0.078, 0.028], CREAM, 0.6);
  art.sweep("jacket ribbed lower hem", [[-0.43, 0.435, 0.22], [0, 0.414, 0.37], [0.43, 0.435, 0.22]],
    [0.022, 0.029, 0.022], "#543953", root);
  finishModel(art, root, "fabric", { skin: ["#d6d4b8", "#c8bd9f", "#c6cdb6", "#718d85"] });
  return riderRig(art, "hunkle", root, head, accent, { shoulder: [0.51, 0.79, 0.045], sleeve: fur, hand: "#c5c9ad", armWidth: 0.21, handSize: 0.35, shaggy: true });
}
