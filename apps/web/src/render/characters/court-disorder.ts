import { Atelier } from "../geometry";
import { CREAM, INK, PLUM, eyes, node, riderRig, soft } from "./rig";
import type { RiderModel } from "./rig";

export function pompa(art: Atelier): RiderModel {
  const root = node(art, "Pompa");
  const head = node(art, "Pompa face", root, [0, 1.23, 0]);
  const accent = node(art, "Pompa three-roll bouffant", head);
  art.sculpt("bell skirt", [[0.09, 0.34, 0.28], [0.15, 0.53, 0.35], [0.3, 0.5, 0.32], [0.55, 0.34, 0.25], [0.72, 0.22, 0.19]], "#a18ace", root);
  for (const side of [-1, 1]) {
    art.sweep("skirt draped piping", [[side * 0.17, 0.67, 0.17], [side * 0.26, 0.44, 0.255], [side * 0.37, 0.17, 0.28]], [0.017, 0.018, 0.018], "#cbb8e7", root);
    soft(art, root, "plum court slipper", [side * 0.28, 0.065, 0.22], [0.27, 0.13, 0.4], PLUM, 0.67);
    soft(art, root, "lime puff sleeve", [side * 0.32, 0.9, 0], [0.34, 0.36, 0.35], "#d4df82", 0.86);
    art.sweep("puff sleeve seam", [[side * 0.36, 1.04, 0.08], [side * 0.43, 0.92, 0.11], [side * 0.36, 0.78, 0.08]], [0.009, 0.009, 0.009], "#a6bf69", root);
    soft(art, head, "copper side roll", [side * 0.28, -0.01, -0.09], [0.27, 0.55, 0.38], "#b66b48");
  }
  art.sculpt("turquoise fitted bodice", [[0.63, 0.2, 0.19], [0.76, 0.18, 0.18], [0.94, 0.26, 0.21], [1.04, 0.12, 0.11]], "#58bfae", root, 0.83);
  art.sweep("bodice lime sash", [[-0.18, 0.75, 0.15], [0, 0.71, 0.19], [0.18, 0.75, 0.15]], [0.025, 0.025, 0.025], "#d4df82", root);
  art.sculpt("duchess oval cheeks", [[-0.23, 0.07, 0.09], [-0.12, 0.19, 0.17], [0.12, 0.23, 0.21], [0.29, 0.17, 0.13]], "#f5cbad", head, 0.88);
  eyes(art, head, 0.105, 0.02, 0.209, 0.83, true);
  soft(art, head, "small turned nose", [0, -0.05, 0.22], [0.085, 0.1, 0.08], "#f2b99b");
  art.sweep("sideways royal smile", [[0.01, -0.147, 0.156], [0.052, -0.15, 0.153], [0.073, -0.13, 0.155]], [0.011, 0.013, 0.004], "#b75070", head);
  for (const side of [-1, 1]) {
    art.sweep("sweeping lashes", [[side * 0.095, 0.077, 0.237], [side * 0.16, 0.07, 0.21], [side * 0.2, 0.12, 0.19]], [0.012, 0.012, 0.003], PLUM, head);
    art.sweep("elegant arched brow", [[side * 0.065, 0.16, 0.205], [side * 0.12, 0.182, 0.2], [side * 0.17, 0.165, 0.174]], [0.008, 0.016, 0.003], "#a76444", head);
  }
  for (let i = 0; i < 3; i++) {
    const roll = soft(art, accent, "architectural copper hair roll", [i % 2 ? -0.025 : 0.035, 0.28 + i * 0.185, -0.03], [0.73 - i * 0.14, 0.28, 0.54 - i * 0.07], i === 1 ? "#c97b51" : "#d8915d", 0.74);
    roll.rotation.z = i % 2 ? -0.12 : 0.11;
    art.sweep("bouffant comb line", [[-0.24 + i * 0.035, 0.32 + i * 0.18, 0.19], [0.03, 0.35 + i * 0.18, 0.237 - i * 0.035], [0.24 - i * 0.04, 0.3 + i * 0.18, 0.19]], [0.008, 0.01, 0.005], "#e7ad72", accent);
  }
  const tiara = node(art, "crooked bronze fan tiara", accent, [0.04, 0.69, 0.015]);
  tiara.rotation.z = -0.24;
  for (let i = -2; i <= 2; i++) {
    const rib = soft(art, tiara, "tiara fan blade", [i * 0.057, 0.035 - Math.abs(i) * 0.01, 0], [0.082, 0.27 - Math.abs(i) * 0.036, 0.055], "#c79555", 0.7);
    rib.rotation.z = -i * 0.28;
  }
  // Keep rigid fan blades on the hair rig, not five independent render parents.
  for (const mesh of tiara.getChildMeshes()) mesh.setParent(accent);
  tiara.dispose();
  return riderRig(art, "pompa", root, head, accent, { shoulder: [0.31, 0.84, 0.015], sleeve: "#f5cbad", hand: CREAM, armWidth: 0.095, handSize: 0.3 });
}

export function bront(art: Atelier): RiderModel {
  const root = node(art, "Bront");
  const head = node(art, "Bront shovel jaw", root, [0, 1.31, 0.01]);
  const accent = node(art, "Bront polite brow", head);
  const coral = "#e98671";
  art.sculpt("caiman pear torso", [[0.15, 0.29, 0.24], [0.29, 0.5, 0.33], [0.65, 0.55, 0.36], [0.94, 0.47, 0.31], [1.14, 0.26, 0.21]], coral, root, 0.79);
  soft(art, root, "soft belly plate", [0, 0.58, 0.302], [0.65, 0.75, 0.15], "#f5c3a2");
  for (let i = 0; i < 3; i++) art.sweep("belly fold", [[-0.21, 0.41 + i * 0.15, 0.37], [0, 0.38 + i * 0.15, 0.388], [0.21, 0.41 + i * 0.15, 0.37]], [0.006, 0.008, 0.006], "#dba18a", root);
  art.sculpt("broad caiman skull", [[-0.26, 0.24, 0.2], [-0.1, 0.4, 0.3], [0.16, 0.33, 0.27], [0.29, 0.16, 0.17]], coral, head, 0.64);
  soft(art, head, "shovel muzzle", [0, -0.12, 0.28], [0.95, 0.35, 0.53], "#f3aa89", 0.58);
  eyes(art, head, 0.2, 0.1, 0.27, 0.83);
  art.sweep("wide gentle jawline", [[-0.39, -0.2, 0.43], [0, -0.23, 0.54], [0.39, -0.2, 0.43]], [0.009, 0.012, 0.009], "#a35e58", head);
  for (const side of [-1, 1]) {
    soft(art, root, "caiman heavy foot", [side * 0.32, 0.12, 0.2], [0.46, 0.25, 0.61], "#ca7569", 0.6);
    soft(art, root, "navy rectangular shoulder plate", [side * 0.49, 0.97, -0.015], [0.38, 0.26, 0.46], "#414b68", 0.46).rotation.z = side * 0.21;
    soft(art, head, "blunt corner tooth", [side * 0.335, -0.238, 0.457], [0.1, 0.145, 0.085], CREAM, 0.65);
    soft(art, head, "nostril", [side * 0.2, -0.013, 0.484], [0.055, 0.037, 0.02], "#a56b62");
    art.sweep("courteous heavy brow", [[side * 0.11, 0.23, 0.251], [side * 0.2, 0.265, 0.251], [side * 0.3, 0.215, 0.214]], [0.023, 0.037, 0.012], "#414b68", accent);
    for (let i = 0; i < 3; i++) soft(art, root, "blunt toe nail", [side * 0.32 + (i - 1) * 0.095, 0.09, 0.477], [0.07, 0.055, 0.09], "#e6bb9d");
  }
  art.sweep("long stepped caiman tail", [[0, 0.4, -0.23], [0.29, 0.29, -0.46], [0.57, 0.42, -0.67], [0.65, 0.76, -0.77], [0.55, 0.96, -0.79]], [0.2, 0.18, 0.135, 0.09, 0.009], coral, root, 12);
  for (let i = 0; i < 3; i++) soft(art, root, "tail rectangular step", [0.35 + i * 0.12, 0.41 + i * 0.14, -0.54 - i * 0.09], [0.2, 0.09, 0.2], INK, 0.5).rotation.z = 0.3;
  return riderRig(art, "bront", root, head, accent, { shoulder: [0.43, 0.8, 0.09], sleeve: coral, hand: coral, armWidth: 0.135, handSize: 0.31 });
}
