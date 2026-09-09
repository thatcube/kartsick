import { Atelier } from "../geometry";
import { CREAM, INK, MINT, PLUM, eyes, finishModel, node, riderRig, seatedLegs, soft } from "./rig";
import type { RiderModel } from "./rig";

export function rivet(art: Atelier): RiderModel {
  const root = node(art, "Rivet");
  const head = node(art, "Rivet pointed muzzle", root, [0, 1.025, 0.125]);
  const accent = node(art, "Rivet turbine crest", head);
  const fur = "#bc578b";
  art.sculpt("forward coiled tenrec torso", [[0.17, 0.19, 0.16, 0, -0.065], [0.32, 0.27, 0.22],
    [0.54, 0.225, 0.2, 0, 0.025], [0.77, 0.205, 0.165, 0, 0.065],
    [0.88, 0.11, 0.1, 0, 0.08]], fur, root, 0.7, 16);
  seatedLegs(art, root, fur, 0.18, 0.12);
  art.sculpt("cropped racer vest with flared hem", [[0.39, 0.29, 0.24], [0.47, 0.255, 0.23],
    [0.69, 0.27, 0.22, 0, 0.03], [0.79, 0.24, 0.18, 0, 0.05],
    [0.86, 0.13, 0.12, 0, 0.065]], "#543953", root, 0.63, 16);
  for (const side of [-1, 1]) {
    art.sculpt("mint swept vest back panel", [[0.455, 0.015, 0.009, side * 0.03, -0.252],
      [0.55, 0.046, 0.015, side * 0.12, -0.245], [0.7, 0.064, 0.016, side * 0.195, -0.2],
      [0.785, 0.036, 0.009, side * 0.16, -0.153]], MINT, root, 0.61, 10);
  }
  art.sweep("open vest zip", [[-0.04, 0.41, 0.24], [-0.065, 0.65, 0.252], [-0.1, 0.83, 0.21]], [0.015, 0.015, 0.01], MINT, root);
  art.sculpt("tenrec connected cheek and cranium", [[-0.245, 0.1, 0.13], [-0.13, 0.25, 0.22],
    [0.025, 0.315, 0.285], [0.195, 0.305, 0.245], [0.315, 0.195, 0.14, 0, -0.025],
    [0.39, 0.065, 0.055, 0, -0.055]], fur, head, 0.69, 20);
  const snout = art.sweep("long tapered tenrec snout", [[0, -0.085, 0.13], [0, -0.075, 0.3],
    [0, -0.14, 0.52], [0, -0.15, 0.63]], [0.16, 0.127, 0.055, 0.023], "#e2a2b7", head, 10);
  snout.scaling.y = 0.78; snout.position.y = -0.022;
  soft(art, head, "pointed plum nose", [0, -0.133, 0.64], [0.09, 0.07, 0.08], PLUM);
  eyes(art, head, 0.17, 0.105, 0.278, 1.02, true, "#649773");
  for (const side of [-1, 1]) {
    art.sweep("separate skeptical brow", [[side * 0.09, 0.196, 0.237], [side * 0.19, 0.192, 0.222], [side * 0.265, 0.235, 0.15]], [0.018, 0.025, 0.005], PLUM, head);
    art.sculpt("swept tenrec cheek blade", [[-0.19, 0.014, 0.011, side * 0.2, 0.11],
      [-0.105, 0.09, 0.053, side * 0.25, 0.14], [0.02, 0.068, 0.063, side * 0.26, 0.12]],
    fur, head, 0.66, 10);
    art.sweep("scowling lower eyelid", [[side * 0.09, 0.07, 0.29], [side * 0.18, 0.033, 0.3],
      [side * 0.26, 0.085, 0.263]], [0.01, 0.022, 0.007], "#a24480", head);
    soft(art, root, "yellow ankle cuff", [side * 0.18, 0.15, 0.32], [0.26, 0.18, 0.26], "#ffd46b", 0.72);
    art.sculpt("navy wedge running boot", [[-0.05, 0.19, 0.27, side * 0.2, 0.46], [0.015, 0.2, 0.28, side * 0.2, 0.46],
      [0.11, 0.16, 0.2, side * 0.2, 0.4], [0.17, 0.09, 0.1, side * 0.18, 0.3]], INK, root, 0.65);
    art.sweep("wedge sole mint stripe", [[side * 0.35, 0.015, 0.24], [side * 0.38, 0.025, 0.49], [side * 0.3, 0.025, 0.68]], [0.015, 0.015, 0.015], MINT, root);
  }
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.093, lift = (2 - Math.abs(i - 2)) * 0.055;
    art.sculpt("upright swept turbine vane", [[0.12, 0.04, 0.08, x, -0.1],
      [0.26, 0.075, 0.17, x * 1.22, -0.2], [0.36 + lift, 0.07, 0.225, x * 1.5, -0.28],
      [0.47 + lift, 0.038, 0.105, x * 1.64, -0.345],
      [0.495 + lift, 0.01, 0.018, x * 1.7, -0.42]], i % 2 ? "#a24480" : fur, accent, 0.66, 10);
  }
  art.sweep("one contrary forward-folded tuft", [[-0.06, 0.3, 0.04], [-0.05, 0.62, 0.035], [-0.04, 0.62, 0.27], [-0.03, 0.45, 0.28]], [0.09, 0.075, 0.045, 0.003], "#d071a1", accent, 10);
  art.sweep("crooked speedster grin", [[0.13, -0.16, 0.31], [0.17, -0.14, 0.29], [0.2, -0.09, 0.24]], [0.007, 0.009, 0.004], PLUM, head);
  finishModel(art, root, "fabric", { skin: ["#e2a2b7"], rubber: [INK], paint: [PLUM] });
  return riderRig(art, "rivet", root, head, accent, { shoulder: [0.26, 0.71, 0.045], sleeve: fur, hand: MINT, armWidth: 0.105, handSize: 0.235 });
}

export function pipvolt(art: Atelier): RiderModel {
  const root = node(art, "Pipvolt");
  const head = node(art, "Pipvolt snout", root, [0, 0.9, 0.075]);
  const accent = node(art, "Pipvolt asymmetric ears", head);
  const fur = "#e9ae73";
  art.sculpt("jerboa tucked pear body", [[0.1, 0.18, 0.16, 0, -0.035], [0.25, 0.32, 0.245],
    [0.43, 0.31, 0.25], [0.63, 0.23, 0.2], [0.77, 0.105, 0.11]], fur, root, 0.74, 16);
  seatedLegs(art, root, fur, 0.2, 0.115);
  art.sculpt("teal belly band", [[0.33, 0.328, 0.263], [0.39, 0.326, 0.266],
    [0.5, 0.3, 0.249], [0.56, 0.282, 0.233]], "#4faaa9", root, 0.74, 16);
  art.sculpt("overlapping teal back band tab", [[0.34, 0.042, 0.008, -0.04, -0.272],
    [0.395, 0.062, 0.017, -0.015, -0.274], [0.53, 0.045, 0.014, 0.018, -0.248]],
  "#68c9be", root, 0.55, 10);
  soft(art, root, "pale belly bib", [0, 0.67, 0.16], [0.25, 0.2, 0.07], "#f4d4ac");
  art.sculpt("jerboa broad cheek jowls", [[-0.23, 0.105, 0.125], [-0.13, 0.29, 0.23],
    [0.015, 0.34, 0.285], [0.165, 0.295, 0.26], [0.29, 0.205, 0.185],
    [0.34, 0.1, 0.08]], fur, head, 0.68, 20);
  eyes(art, head, 0.15, 0.07, 0.285, 1.08, false, "#825871");
  art.sweep("tiny tapered snout", [[0, -0.09, 0.19], [0, -0.07, 0.33], [0, -0.1, 0.405]], [0.105, 0.075, 0.027], "#f5d3a7", head, 10);
  soft(art, head, "jerboa nose", [0, -0.096, 0.408], [0.068, 0.049, 0.043], PLUM);
  for (const side of [-1, 1]) {
    soft(art, root, "jerboa long hind foot", [side * 0.2, 0.015, 0.44], [0.28, 0.19, 0.53], "#bd825d", 0.7);
    art.sculpt("jerboa pale muzzle plane", [[-0.19, 0.035, 0.015, side * 0.08, 0.234],
      [-0.115, 0.092, 0.045, side * 0.1, 0.278], [-0.045, 0.057, 0.024, side * 0.12, 0.263]],
    "#f5d3a7", head, 0.7, 10);
    art.sweep("jerboa smiling eye fold", [[side * 0.08, 0.015, 0.298], [side * 0.15, -0.035, 0.312],
      [side * 0.225, 0.01, 0.27]], [0.008, 0.017, 0.004], "#bd825d", head);
    const droop = side === 1 ? 0.13 : 0;
    const ear = art.sculpt("broad square jerboa ear", [[0, 0.075, 0.035], [0.17, 0.14, 0.05],
      [0.39, 0.18, 0.056, 0, droop * 0.2], [0.515, 0.18, 0.045, 0.012, droop],
      [0.565, 0.125, 0.022, 0.018, droop * 1.3]], fur, accent, 0.48, 16);
    ear.position.set(side * 0.235, 0.19, -0.04); ear.rotation.z = side === -1 ? 0.12 : -0.58;
    const inner = art.sculpt("soft squared inner ear", [[0.08, 0.035, 0.012], [0.22, 0.085, 0.015],
      [0.4, 0.132, 0.014, 0, droop * 0.25], [0.505, 0.12, 0.01, 0.012, droop]],
    "#d38f98", accent, 0.5, 12);
    inner.position.set(side * 0.235, 0.19, 0.01); inner.rotation.z = ear.rotation.z;
    const fold = art.sculpt("jerboa broad rear ear fold", [[0.07, 0.018, 0.008, 0, -0.044],
      [0.22, 0.044, 0.013, 0, -0.055], [0.42, 0.064, 0.012, 0.008, -0.061 + droop * 0.3],
      [0.515, 0.03, 0.006, 0.018, -0.05 + droop]], "#f4d4ac", accent, 0.59, 10);
    fold.position.copyFrom(ear.position); fold.rotation.z = ear.rotation.z;
    art.sweep("alert jerboa brow", [[side * 0.075, 0.205, 0.263], [side * 0.155, 0.218, 0.26],
      [side * 0.215, 0.191, 0.228]], [0.009, 0.019, 0.005], "#bd825d", head, 6);
    for (let i = 0; i < 3; i++) art.sweep("static-lifted whisker", [[side * 0.2, -0.095, 0.21], [side * 0.35, -0.06 + i * 0.045, 0.23], [side * 0.46, 0.025 + i * 0.07, 0.19]], [0.009, 0.008, 0.002], PLUM, head, 6);
  }
  art.sweep("long insulated cable tail", [[0, 0.25, -0.2], [0.36, 0.24, -0.42], [0.46, 0.69, -0.44], [0.4, 1.02, -0.33]], [0.043, 0.037, 0.032, 0.029], "#4faaa9", root);
  soft(art, root, "tail bulb socket", [0.4, 1.025, -0.33], [0.13, 0.12, 0.13], CREAM);
  const bulb = soft(art, root, "round glowing tail bulb", [0.4, 1.135, -0.33], [0.23, 0.23, 0.23], "#ffdb84");
  bulb.material = art.material("#ffdb84", true);
  art.sweep("jerboa shy smile", [[-0.04, -0.17, 0.21], [0, -0.18, 0.225], [0.04, -0.17, 0.21]], [0.007, 0.009, 0.007], PLUM, head);
  finishModel(art, root, "fabric", { skin: ["#f5d3a7", "#d38f98", "#bd825d"], rubber: ["#4faaa9"], paint: [CREAM, PLUM] });
  return riderRig(art, "pipvolt", root, head, accent, { shoulder: [0.25, 0.61, 0.02], sleeve: fur, hand: "#f4d4ac", armWidth: 0.09, handSize: 0.19 });
}
