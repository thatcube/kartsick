import { Atelier } from "../geometry";
import { CREAM, INK, PLUM, eyes, finishModel, node, riderRig, seatedLegs, soft, surface } from "./rig";
import type { RiderModel } from "./rig";

export function pompa(art: Atelier): RiderModel {
  const root = node(art, "Pompa");
  const head = node(art, "Pompa face", root, [0, 1.04, 0.07]);
  const accent = node(art, "Pompa three-roll bouffant", head);
  art.sculpt("bell skirt draped over seated knees", [[0.06, 0.33, 0.28, 0, 0.14], [0.12, 0.51, 0.37, 0, 0.12],
    [0.3, 0.51, 0.39, 0, 0.055], [0.46, 0.35, 0.28], [0.62, 0.22, 0.2]], "#a18ace", root, 0.84, 24);
  for (const side of [-1, 1]) {
    art.sweep("skirt draped piping", [[side * 0.17, 0.6, 0.17], [side * 0.29, 0.36, 0.33], [side * 0.37, 0.12, 0.37]], [0.017, 0.025, 0.018], "#cbb8e7", root);
    art.sweep("sculpted skirt pleat", [[side * 0.16, 0.52, 0.15], [side * 0.33, 0.3, 0.26],
      [side * 0.44, 0.12, 0.25]], [0.02, 0.055, 0.028], "#ae98d6", root, 10);
    soft(art, root, "plum court slipper", [side * 0.28, 0.02, 0.44], [0.27, 0.16, 0.4], PLUM, 0.67);
    soft(art, root, "lime puff sleeve", [side * 0.33, 0.76, 0], [0.36, 0.32, 0.35], "#d4df82", 0.86);
    art.sweep("puff sleeve seam", [[side * 0.36, 0.91, 0.08], [side * 0.45, 0.78, 0.11], [side * 0.36, 0.64, 0.08]], [0.009, 0.012, 0.009], "#a6bf69", root);
    soft(art, head, "copper side roll", [side * 0.28, -0.01, -0.09], [0.27, 0.55, 0.38], "#b66b48");
  }
  art.sculpt("turquoise fitted bodice", [[0.53, 0.22, 0.2], [0.65, 0.19, 0.2], [0.8, 0.28, 0.23], [0.92, 0.13, 0.12]], "#58bfae", root, 0.83);
  art.sweep("bodice lime sash", [[-0.2, 0.65, 0.16], [0, 0.6, 0.205], [0.2, 0.65, 0.16]], [0.025, 0.033, 0.025], "#d4df82", root);
  art.sculpt("duchess sculpted cheekbones and chin", [[-0.24, 0.095, 0.12, 0, 0.025], [-0.13, 0.21, 0.19],
    [0.015, 0.255, 0.22], [0.19, 0.225, 0.215], [0.3, 0.16, 0.13]], "#f5cbad", head, 0.9, 24);
  eyes(art, head, 0.119, 0.02, 0.218, 0.92, true, "#697d93");
  soft(art, head, "small turned nose", [0, -0.05, 0.22], [0.085, 0.1, 0.08], "#f2b99b");
  art.sweep("sideways royal smile", [[0.01, -0.147, 0.156], [0.052, -0.15, 0.153], [0.073, -0.13, 0.155]], [0.011, 0.013, 0.004], "#b75070", head);
  for (const side of [-1, 1]) {
    soft(art, head, "duchess lifted cheek", [side * 0.168, -0.1, 0.171], [0.16, 0.14, 0.115], "#f5cbad");
    art.sweep("duchess lower eyelid", [[side * 0.06, -0.025, 0.225], [side * 0.125, -0.055, 0.242],
      [side * 0.188, -0.007, 0.203]], [0.009, 0.015, 0.004], "#e7ad96", head);
    art.sweep("sweeping lashes", [[side * 0.095, 0.077, 0.237], [side * 0.16, 0.07, 0.21], [side * 0.2, 0.12, 0.19]], [0.012, 0.012, 0.003], PLUM, head);
    art.sweep("elegant arched brow", [[side * 0.065, 0.16, 0.205], [side * 0.12, 0.182, 0.2], [side * 0.17, 0.165, 0.174]], [0.008, 0.016, 0.003], "#a76444", head);
  }
  for (let i = 0; i < 3; i++) {
    const roll = art.sculpt("interlocking architectural copper roll", [[-0.13, 0.15, 0.1], [-0.085, 0.37 - i * 0.06, 0.245 - i * 0.03],
      [0.055, 0.365 - i * 0.055, 0.25 - i * 0.03, -0.025], [0.14, 0.18, 0.13, -0.07]], i === 1 ? "#c97b51" : "#d8915d", accent, 0.82, 20);
    roll.position.set(i % 2 ? -0.025 : 0.035, 0.28 + i * 0.18, -0.03);
    roll.rotation.z = i % 2 ? -0.12 : 0.11;
    art.sweep("bouffant comb line", [[-0.24 + i * 0.035, 0.32 + i * 0.18, 0.19], [0.03, 0.35 + i * 0.18, 0.237 - i * 0.035], [0.24 - i * 0.04, 0.3 + i * 0.18, 0.19]], [0.008, 0.01, 0.005], "#e7ad72", accent);
  }
  const tiara = node(art, "crooked bronze fan tiara", accent, [0.04, 0.69, 0.015]);
  tiara.rotation.z = -0.24;
  for (let i = -2; i <= 2; i++) {
    const rib = surface(art, soft(art, tiara, "tiara fan blade", [i * 0.057, 0.035 - Math.abs(i) * 0.01, 0], [0.082, 0.27 - Math.abs(i) * 0.036, 0.055], "#c79555", 0.7), "#c79555", "metal");
    rib.rotation.z = -i * 0.28;
  }
  // Keep rigid fan blades on the hair rig, not five independent render parents.
  for (const mesh of tiara.getChildMeshes()) mesh.setParent(accent);
  tiara.dispose();
  finishModel(art, root, "fabric", { skin: ["#f5cbad", "#f2b99b", "#e7ad96", "#b75070"] });
  return riderRig(art, "pompa", root, head, accent, { shoulder: [0.31, 0.73, 0.015], sleeve: "#f5cbad", hand: CREAM, armWidth: 0.1, handSize: 0.285, sleeveFinish: "skin" });
}

export function bront(art: Atelier): RiderModel {
  const root = node(art, "Bront");
  const head = node(art, "Bront shovel jaw", root, [0, 1.09, 0.09]);
  const accent = node(art, "Bront polite brow", head);
  const coral = "#e98671";
  art.sculpt("seated caiman pear torso", [[0.12, 0.3, 0.25, 0, -0.05], [0.28, 0.53, 0.35],
    [0.55, 0.56, 0.38], [0.78, 0.49, 0.32], [0.96, 0.27, 0.23]], coral, root, 0.85, 24);
  seatedLegs(art, root, coral, 0.32, 0.185);
  art.sculpt("continuous warm caiman belly", [[0.22, 0.16, 0.035, 0, 0.29], [0.36, 0.32, 0.065, 0, 0.345],
    [0.62, 0.33, 0.055, 0, 0.35], [0.8, 0.17, 0.025, 0, 0.283]], "#f5c3a2", root, 0.86, 20);
  for (let i = 0; i < 3; i++) art.sweep("belly fold", [[-0.21, 0.33 + i * 0.13, 0.37], [0, 0.31 + i * 0.13, 0.411], [0.21, 0.33 + i * 0.13, 0.37]], [0.006, 0.008, 0.006], "#dba18a", root);
  art.sculpt("broad caiman skull", [[-0.26, 0.24, 0.2], [-0.1, 0.4, 0.3], [0.16, 0.33, 0.27], [0.29, 0.16, 0.17]], coral, head, 0.64);
  art.sculpt("continuous shovel muzzle and cheek pads", [[-0.285, 0.27, 0.18, 0, 0.22], [-0.23, 0.43, 0.255, 0, 0.28],
    [-0.1, 0.49, 0.28, 0, 0.25], [0.045, 0.37, 0.22, 0, 0.19], [0.09, 0.19, 0.16, 0, 0.12]], "#f3aa89", head, 0.66, 24);
  eyes(art, head, 0.205, 0.127, 0.276, 1, false, "#aa7643");
  art.sweep("wide gentle jawline", [[-0.39, -0.2, 0.43], [0, -0.23, 0.54], [0.39, -0.2, 0.43]], [0.009, 0.012, 0.009], "#a35e58", head);
  for (const side of [-1, 1]) {
    soft(art, root, "caiman heavy foot", [side * 0.32, 0.045, 0.43], [0.46, 0.25, 0.56], "#ca7569", 0.6);
    surface(art, soft(art, root, "navy rectangular shoulder plate", [side * 0.49, 0.8, -0.015], [0.38, 0.26, 0.46], "#414b68", 0.46), "#414b68", "paint").rotation.z = side * 0.21;
    soft(art, head, "raised caiman eye socket", [side * 0.235, 0.13, 0.16], [0.24, 0.26, 0.22], coral);
    soft(art, head, "blunt corner tooth", [side * 0.335, -0.238, 0.457], [0.1, 0.145, 0.085], CREAM, 0.65);
    soft(art, head, "nostril", [side * 0.2, -0.013, 0.484], [0.055, 0.037, 0.02], "#a56b62");
    art.sweep("courteous heavy brow", [[side * 0.11, 0.23, 0.251], [side * 0.2, 0.265, 0.251], [side * 0.3, 0.215, 0.214]], [0.023, 0.037, 0.012], "#414b68", accent);
    for (let i = 0; i < 3; i++) soft(art, root, "blunt toe nail", [side * 0.32 + (i - 1) * 0.095, 0.025, 0.68], [0.07, 0.055, 0.09], "#e6bb9d");
  }
  art.sweep("long stepped caiman tail", [[0, 0.4, -0.23], [0.29, 0.29, -0.46], [0.57, 0.42, -0.67], [0.65, 0.76, -0.77], [0.55, 0.96, -0.79]], [0.2, 0.18, 0.135, 0.09, 0.009], coral, root, 12);
  for (let i = 0; i < 3; i++) soft(art, root, "tail rectangular step", [0.35 + i * 0.12, 0.41 + i * 0.14, -0.54 - i * 0.09], [0.2, 0.09, 0.2], INK, 0.5).rotation.z = 0.3;
  finishModel(art, root, "skin", { paint: [CREAM], fabric: [INK] });
  return riderRig(art, "bront", root, head, accent, { shoulder: [0.45, 0.69, 0.09], sleeve: coral, hand: coral, armWidth: 0.15, handSize: 0.31, sleeveFinish: "skin" });
}
