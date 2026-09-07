import { Atelier } from "../geometry";
import { CREAM, INK, MINT, PLUM, eyes, node, riderRig, soft } from "./rig";
import type { RiderModel } from "./rig";

export function rivet(art: Atelier): RiderModel {
  const root = node(art, "Rivet");
  const head = node(art, "Rivet pointed muzzle", root, [0, 1.28, 0.06]);
  const accent = node(art, "Rivet turbine crest", head);
  const fur = "#bc578b";
  art.sculpt("tenrec lean torso", [[0.26, 0.17, 0.15], [0.48, 0.24, 0.21], [0.77, 0.22, 0.2], [1, 0.13, 0.14, 0, 0.05]], fur, root);
  art.sculpt("cropped plum vest", [[0.58, 0.265, 0.216], [0.66, 0.26, 0.22], [0.9, 0.25, 0.2], [1.02, 0.11, 0.12]], "#543953", root, 0.85);
  art.sweep("open vest zip", [[-0.04, 0.6, 0.22], [-0.065, 0.83, 0.22], [-0.1, 0.97, 0.16]], [0.012, 0.012, 0.012], MINT, root);
  art.sculpt("tenrec cranium", [[-0.23, 0.12, 0.11], [-0.1, 0.25, 0.22], [0.14, 0.31, 0.26], [0.3, 0.2, 0.18], [0.4, 0.04, 0.03]], fur, head);
  art.sweep("long tapered tenrec snout", [[0, -0.07, 0.1], [0, -0.06, 0.29], [0, -0.12, 0.51], [0, -0.135, 0.63]], [0.17, 0.135, 0.07, 0.025], "#e2a2b7", head, 12);
  soft(art, head, "pointed plum nose", [0, -0.133, 0.64], [0.09, 0.07, 0.08], PLUM);
  eyes(art, head, 0.17, 0.105, 0.231, 0.84, true);
  for (const side of [-1, 1]) {
    art.sweep("separate skeptical brow", [[side * 0.09, 0.196, 0.237], [side * 0.19, 0.192, 0.222], [side * 0.265, 0.235, 0.15]], [0.018, 0.025, 0.005], PLUM, head);
    soft(art, root, "yellow ankle cuff", [side * 0.18, 0.24, 0.04], [0.24, 0.2, 0.25], "#ffd46b", 0.72);
    art.sculpt("navy wedge running boot", [[0.03, 0.19, 0.3, side * 0.2, 0.24], [0.085, 0.2, 0.32, side * 0.2, 0.24], [0.17, 0.16, 0.22, side * 0.2, 0.17], [0.22, 0.08, 0.09, side * 0.18, 0.02]], INK, root, 0.65);
    art.sweep("wedge sole mint stripe", [[side * 0.35, 0.08, 0.01], [side * 0.38, 0.09, 0.31], [side * 0.3, 0.09, 0.48]], [0.015, 0.015, 0.015], MINT, root);
  }
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.085;
    art.sweep("upright swept turbine vane", [[x, 0.19, -0.02], [x * 1.5, 0.44 + (2 - Math.abs(i - 2)) * 0.04, -0.16], [x * 1.8, 0.45 + (2 - Math.abs(i - 2)) * 0.075, -0.4], [x * 1.9, 0.31, -0.53]], [0.1, 0.09, 0.04, 0.003], i % 2 ? "#a24480" : fur, accent, 10);
  }
  art.sweep("one contrary forward-folded tuft", [[-0.06, 0.3, 0.04], [-0.05, 0.62, 0.035], [-0.04, 0.62, 0.27], [-0.03, 0.45, 0.28]], [0.09, 0.075, 0.045, 0.003], "#d071a1", accent, 10);
  art.sweep("crooked speedster grin", [[0.13, -0.16, 0.31], [0.17, -0.14, 0.29], [0.2, -0.09, 0.24]], [0.007, 0.009, 0.004], PLUM, head);
  return riderRig(art, "rivet", root, head, accent, { shoulder: [0.24, 0.85, 0.025], sleeve: fur, hand: MINT, armWidth: 0.095, handSize: 0.235 });
}

export function pipvolt(art: Atelier): RiderModel {
  const root = node(art, "Pipvolt");
  const head = node(art, "Pipvolt snout", root, [0, 1.02, 0.025]);
  const accent = node(art, "Pipvolt asymmetric ears", head);
  const fur = "#e9ae73";
  art.sculpt("jerboa pear body", [[0.14, 0.16, 0.15], [0.24, 0.29, 0.23], [0.48, 0.3, 0.245], [0.73, 0.19, 0.18], [0.86, 0.1, 0.1]], fur, root);
  art.sculpt("teal belly band", [[0.33, 0.285, 0.237], [0.4, 0.31, 0.25], [0.51, 0.3, 0.247], [0.58, 0.267, 0.225]], "#4faaa9", root);
  soft(art, root, "pale belly bib", [0, 0.67, 0.16], [0.25, 0.2, 0.07], "#f4d4ac");
  art.sculpt("jerboa round cheeks", [[-0.22, 0.08, 0.1], [-0.13, 0.25, 0.23], [0.08, 0.32, 0.27], [0.28, 0.24, 0.19], [0.33, 0.08, 0.08]], fur, head);
  eyes(art, head, 0.14, 0.045, 0.268, 0.98);
  art.sweep("tiny tapered snout", [[0, -0.09, 0.19], [0, -0.07, 0.33], [0, -0.1, 0.405]], [0.105, 0.075, 0.027], "#f5d3a7", head, 10);
  soft(art, head, "jerboa nose", [0, -0.096, 0.408], [0.068, 0.049, 0.043], PLUM);
  for (const side of [-1, 1]) {
    soft(art, root, "jerboa long hind foot", [side * 0.2, 0.09, 0.2], [0.26, 0.18, 0.52], "#bd825d", 0.7);
    const ear = art.sculpt("broad square jerboa ear", [[0, 0.09, 0.04], [0.16, 0.14, 0.066], [0.46, 0.19, 0.065], [0.55, 0.14, 0.045], [0.59, 0.045, 0.013]], fur, accent, 0.52);
    ear.position.set(side * 0.235, 0.19, -0.04); ear.rotation.z = side === -1 ? 0.12 : -0.58;
    const inner = art.sculpt("soft squared inner ear", [[0.09, 0.047, 0.016], [0.22, 0.09, 0.018], [0.43, 0.13, 0.016], [0.49, 0.07, 0.008]], "#d38f98", accent, 0.57);
    inner.position.set(side * 0.235, 0.19, 0.027); inner.rotation.z = ear.rotation.z;
    for (let i = 0; i < 3; i++) art.sweep("static-lifted whisker", [[side * 0.2, -0.095, 0.21], [side * 0.35, -0.06 + i * 0.045, 0.23], [side * 0.46, 0.025 + i * 0.07, 0.19]], [0.009, 0.008, 0.002], PLUM, head, 6);
  }
  art.sweep("long insulated cable tail", [[0, 0.25, -0.2], [0.36, 0.24, -0.42], [0.46, 0.69, -0.44], [0.4, 1.02, -0.33]], [0.043, 0.037, 0.032, 0.029], "#4faaa9", root);
  soft(art, root, "tail bulb socket", [0.4, 1.025, -0.33], [0.13, 0.12, 0.13], CREAM);
  const bulb = soft(art, root, "round glowing tail bulb", [0.4, 1.135, -0.33], [0.23, 0.23, 0.23], "#ffdb84");
  bulb.material = art.material("#ffdb84", true);
  art.sweep("jerboa shy smile", [[-0.04, -0.17, 0.21], [0, -0.18, 0.225], [0.04, -0.17, 0.21]], [0.007, 0.009, 0.007], PLUM, head);
  return riderRig(art, "pipvolt", root, head, accent, { shoulder: [0.21, 0.67, 0.02], sleeve: fur, hand: "#f4d4ac", armWidth: 0.075, handSize: 0.18 });
}
