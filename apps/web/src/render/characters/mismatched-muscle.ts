import { Atelier } from "../geometry";
import { CREAM, INK, PLUM, eyes, finishModel, node, riderRig, seatedLegs, soft } from "./rig";
import type { RiderModel } from "./rig";

export function bollo(art: Atelier): RiderModel {
  const root = node(art, "Bollo");
  const head = node(art, "Bollo cushion body", root, [0, 0.105, 0]);
  const accent = node(art, "Bollo folded corners", head);
  const blue = "#a9d2ed";
  art.sculpt("compressed triangular pillow with seated haunch", [[0, 0.29, 0.16, 0, 0.025],
    [0.115, 0.48, 0.28, 0, 0.01], [0.29, 0.52, 0.335], [0.55, 0.46, 0.325],
    [0.79, 0.345, 0.25], [0.99, 0.23, 0.135], [1.055, 0.11, 0.065]], blue, head, 0.62, 20);
  art.sweep("pillow perimeter piping", [[0, 0, -0.035], [-0.44, 0.115, -0.065], [-0.521, 0.29, -0.03],
    [-0.414, 0.66, -0.015], [-0.265, 0.955, 0], [0, 1.069, 0], [0.265, 0.955, 0],
    [0.414, 0.66, -0.015], [0.521, 0.29, -0.03], [0.44, 0.115, -0.065], [0, 0, -0.035]],
  [0.014, 0.014, 0.014, 0.014, 0.014, 0.014, 0.014, 0.014, 0.014, 0.014, 0.014], "#78aecb", head, 6);
  for (const side of [-1, 1]) {
    art.sculpt("folded soft pillow corner", [[0.84, 0.075, 0.06, side * 0.25, -0.015],
      [0.96, 0.103, 0.105, side * 0.275, 0.015], [1.075, 0.072, 0.08, side * 0.255, 0.055],
      [1.14, 0.018, 0.02, side * 0.19, 0.12]], blue, accent, 0.59, 12);
    art.sculpt("turned corner underside", [[0.96, 0.02, 0.008, side * 0.185, 0.119],
      [1.065, 0.055, 0.025, side * 0.225, 0.123], [1.125, 0.017, 0.012, side * 0.19, 0.14]],
    "#78aecb", accent, 0.62, 10);
    soft(art, root, "oversized plum slipper", [side * 0.3, 0.025, 0.42], [0.47, 0.25, 0.59], PLUM, 0.72);
    soft(art, root, "slipper cuff", [side * 0.3, 0.13, 0.265], [0.35, 0.11, 0.33], "#8d698b", 0.72);
    art.sweep("soft seat compression fold", [[side * 0.28, 0.09, 0.215], [side * 0.43, 0.16, 0.25],
      [side * 0.47, 0.24, 0.225]], [0.009, 0.018, 0.004], "#78aecb", head);
    art.sweep("pillow rear compression dart", [[side * 0.44, 0.19, -0.218],
      [side * 0.32, 0.29, -0.321], [side * 0.26, 0.44, -0.338]],
    [0.006, 0.017, 0.004], "#78aecb", head, 6);
  }
  art.sculpt("pillow rear envelope fold", [[0.54, 0.055, 0.012, 0.035, -0.34],
    [0.635, 0.245, 0.025, 0.01, -0.307], [0.78, 0.29, 0.024, 0, -0.239],
    [0.89, 0.215, 0.012, 0, -0.195]], "#93bfdc", head, 0.57, 12);
  art.sweep("envelope fold stitched edge", [[-0.27, 0.73, -0.268], [0.025, 0.56, -0.355],
    [0.28, 0.73, -0.268]], [0.01, 0.013, 0.01], "#78aecb", head, 6);
  eyes(art, head, 0.075, 0.69, 0.29, 0.93, false, "#586b9b");
  art.sweep("tiny sideways mouth", [[0.13, 0.49, 0.332], [0.17, 0.475, 0.33], [0.186, 0.508, 0.322]], [0.009, 0.014, 0.007], INK, head);
  soft(art, head, "stuffed smile dimple", [0.235, 0.48, 0.304], [0.1, 0.065, 0.025], "#93bfdc");
  for (let i = 0; i < 3; i++) art.sweep("hand stitched pillow seam", [[0.505, 0.3 + i * 0.04, -0.025], [0.511, 0.31 + i * 0.04, 0.025]], [0.006, 0.006], CREAM, head, 6);
  finishModel(art, root, "fabric");
  return riderRig(art, "bollo", root, head, accent, { shoulder: [0.44, 0.67, 0.015], sleeve: blue, hand: blue, armWidth: 0.08, handSize: 0.21, noodle: true });
}

export function hunkle(art: Atelier): RiderModel {
  const root = node(art, "Hunkle");
  const head = node(art, "Hunkle tiny face", root, [0, 0.98, 0.19]);
  const accent = node(art, "Hunkle cream bowl fringe", head);
  const fur = "#99b9ac";
  art.sculpt("hunched seated orangutan torso", [[0.13, 0.3, 0.22, 0, -0.05], [0.32, 0.45, 0.31],
    [0.65, 0.51, 0.315], [0.91, 0.465, 0.26], [1.055, 0.27, 0.16]], fur, root, 0.69, 20);
  seatedLegs(art, root, fur, 0.29, 0.18);
  art.sculpt("tiny cropped track jacket", [[0.4, 0.47, 0.33], [0.46, 0.52, 0.35],
    [0.69, 0.555, 0.355], [0.87, 0.51, 0.325], [0.98, 0.34, 0.23]], PLUM, root, 0.65, 20);
  for (const side of [-1, 1]) {
    art.sculpt("hunched tailored shoulder", [[0.62, 0.09, 0.135, side * 0.54, -0.025],
      [0.76, 0.195, 0.245, side * 0.535, -0.02], [0.955, 0.22, 0.265, side * 0.47, -0.03],
      [1.09, 0.135, 0.17, side * 0.355, -0.045], [1.12, 0.075, 0.08, side * 0.295, -0.055]],
    fur, root, 0.62, 16);
    soft(art, root, "orangutan soft foot", [side * 0.29, 0.025, 0.44], [0.43, 0.26, 0.56], "#718d85", 0.7);
    for (let i = 0; i < 3; i++) art.sculpt("shoulder broad hanging lock", [[0.645 + i * 0.04, 0.012, 0.009, side * (0.49 + i * 0.07), -0.22],
      [0.79 + i * 0.022, 0.069, 0.035, side * (0.49 + i * 0.055), -0.27],
      [1.0 - i * 0.015, 0.075, 0.025, side * (0.4 + i * 0.055), -0.245]], fur, root, 0.61, 10);
    soft(art, head, "orangutan ear", [side * 0.22, 0.08, 0.005], [0.15, 0.19, 0.13], "#c6cdb6");
  }
  art.sculpt("small buried orangutan skull", [[-0.18, 0.095, 0.09], [-0.065, 0.195, 0.165],
    [0.155, 0.205, 0.175], [0.255, 0.135, 0.105]], fur, head, 0.66, 16);
  art.sculpt("recessed heart-shaped facial mask", [[-0.16, 0.105, 0.04, 0, 0.145], [-0.08, 0.18, 0.07, 0, 0.16],
    [0.08, 0.195, 0.072, 0, 0.16], [0.185, 0.13, 0.04, 0, 0.135]], "#d6d4b8", head, 0.69, 16);
  art.sculpt("orangutan broad little muzzle", [[-0.18, 0.065, 0.027, 0, 0.23],
    [-0.125, 0.14, 0.065, 0, 0.247], [-0.065, 0.125, 0.058, 0, 0.248],
    [-0.03, 0.075, 0.026, 0, 0.24]], "#c8bd9f", head, 0.62, 12);
  eyes(art, head, 0.093, 0.077, 0.239, 0.8, true, "#78624e");
  for (const side of [-1, 1]) soft(art, head, "small ape nostril", [side * 0.036, -0.055, 0.292], [0.03, 0.02, 0.018], INK);
  art.sweep("gentle ape smile", [[-0.075, -0.15, 0.257], [0, -0.167, 0.275], [0.075, -0.15, 0.257]], [0.007, 0.008, 0.007], INK, head);
  art.sculpt("blunt cream bowl cut", [[0.13, 0.19, 0.16, 0, -0.006],
    [0.165, 0.245, 0.205, 0, -0.003], [0.24, 0.24, 0.2, -0.015],
    [0.315, 0.16, 0.13, -0.055], [0.34, 0.07, 0.065, -0.075]], "#e9dfba", accent, 0.54, 16);
  for (const back of [false, true]) for (let i = 0; i < 3; i++) art.sweep("bowl fringe comb channel",
    [[-0.14 + i * 0.12, 0.28, back ? -0.15 : 0.145],
      [-0.12 + i * 0.12, 0.174, back ? -0.21 : 0.2]], [0.012, 0.008], "#cfcaab", accent, 6);
  art.sculpt("diagonal custard sash", [[0.43, 0.05, 0.014, 0.32, 0.3],
    [0.57, 0.085, 0.022, 0.08, 0.36], [0.74, 0.08, 0.018, -0.17, 0.35],
    [0.94, 0.047, 0.014, -0.36, 0.245]], "#ffd46b", root, 0.59, 12);
  art.sculpt("custard sash across jacket back", [[0.43, 0.05, 0.016, 0.32, -0.29],
    [0.58, 0.086, 0.021, 0.1, -0.361], [0.76, 0.081, 0.02, -0.15, -0.355],
    [0.94, 0.06, 0.018, -0.36, -0.245]], "#ffd46b", root, 0.59, 12);
  art.sweep("jacket zipper", [[0, 0.44, 0.369], [0, 0.83, 0.36]], [0.012, 0.012], "#b59aaf", root);
  soft(art, root, "jacket zip tab", [0.012, 0.8, 0.38], [0.057, 0.078, 0.028], CREAM, 0.6);
  art.sweep("jacket ribbed lower hem", [[-0.43, 0.435, 0.22], [0, 0.414, 0.37], [0.43, 0.435, 0.22]],
    [0.022, 0.029, 0.022], "#543953", root);
  art.sweep("jacket ribbed back hem", [[-0.42, 0.43, -0.25], [0, 0.415, -0.345], [0.42, 0.43, -0.25]],
    [0.022, 0.026, 0.022], "#543953", root, 6);
  finishModel(art, root, "fabric", { skin: ["#d6d4b8", "#c8bd9f", "#c6cdb6", "#718d85"] });
  return riderRig(art, "hunkle", root, head, accent, { shoulder: [0.51, 0.79, 0.045], sleeve: fur, hand: "#c5c9ad", armWidth: 0.21, handSize: 0.35, shaggy: true });
}
