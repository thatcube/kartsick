import { Atelier } from "../geometry";
import { CREAM, INK, PLUM, eyes, finishModel, node, riderRig, seatedLegs, soft, surface } from "./rig";
import type { RiderModel } from "./rig";

export function pompa(art: Atelier): RiderModel {
  const root = node(art, "Pompa");
  const head = node(art, "Pompa face", root, [0, 1.04, 0.07]);
  const accent = node(art, "Pompa three-roll bouffant", head);
  art.sculpt("bell skirt draped over seated knees", [[0.065, 0.35, 0.29, 0, 0.13], [0.12, 0.51, 0.37, 0, 0.12],
    [0.25, 0.475, 0.38, 0, 0.065], [0.43, 0.34, 0.28], [0.62, 0.2, 0.185]], "#a18ace", root, 0.67, 20);
  for (const side of [-1, 1]) {
    art.sweep("skirt draped piping", [[side * 0.17, 0.6, 0.17], [side * 0.29, 0.36, 0.33], [side * 0.37, 0.12, 0.37]], [0.017, 0.025, 0.018], "#cbb8e7", root);
    art.sweep("sculpted skirt pleat", [[side * 0.16, 0.52, 0.15], [side * 0.33, 0.3, 0.26],
      [side * 0.44, 0.12, 0.25]], [0.02, 0.055, 0.028], "#ae98d6", root, 10);
    soft(art, root, "plum court slipper", [side * 0.28, 0.02, 0.44], [0.27, 0.16, 0.4], PLUM, 0.67);
    art.sculpt("gathered lime puff sleeve", [[0.62, 0.06, 0.075, side * 0.35],
      [0.68, 0.13, 0.135, side * 0.37], [0.79, 0.165, 0.16, side * 0.345],
      [0.88, 0.12, 0.12, side * 0.295], [0.91, 0.065, 0.075, side * 0.27]], "#d4df82", root, 0.66, 12);
    art.sweep("puff sleeve seam", [[side * 0.36, 0.91, 0.08], [side * 0.45, 0.78, 0.11], [side * 0.36, 0.64, 0.08]], [0.009, 0.012, 0.009], "#a6bf69", root);
    art.sculpt("copper swept temple", [[-0.225, 0.04, 0.025, side * 0.26, -0.1],
      [-0.1, 0.105, 0.11, side * 0.285, -0.115], [0.1, 0.085, 0.16, side * 0.29, -0.085],
      [0.27, 0.1, 0.12, side * 0.235, -0.04]], "#b66b48", head, 0.64, 12);
    art.sculpt("back skirt fan pleat", [[0.105, 0.085, 0.013, side * 0.34, -0.22],
      [0.24, 0.08, 0.021, side * 0.29, -0.315], [0.43, 0.057, 0.017, side * 0.175, -0.268],
      [0.59, 0.02, 0.009, side * 0.06, -0.198]], "#cbb8e7", root, 0.57, 10);
  }
  art.sculpt("turquoise fitted bodice", [[0.53, 0.21, 0.19], [0.65, 0.175, 0.185],
    [0.79, 0.255, 0.225], [0.88, 0.22, 0.17], [0.92, 0.115, 0.1]], "#58bfae", root, 0.68, 16);
  art.sculpt("lime rear court sash", [[0.54, 0.07, 0.014, 0.03, -0.205],
    [0.595, 0.225, 0.025, 0, -0.21], [0.65, 0.165, 0.02, 0, -0.193]],
  "#d4df82", root, 0.54, 12);
  art.sweep("bodice rear tailored seam", [[0, 0.67, -0.204], [0, 0.78, -0.239], [0, 0.89, -0.168]],
    [0.009, 0.013, 0.008], "#368f8e", root, 6);
  art.sweep("bodice lime sash", [[-0.2, 0.65, 0.16], [0, 0.6, 0.205], [0.2, 0.65, 0.16]], [0.025, 0.033, 0.025], "#d4df82", root);
  art.sculpt("duchess sculpted cheekbones and chin", [[-0.24, 0.085, 0.1, 0.01, 0.03],
    [-0.135, 0.18, 0.185], [-0.04, 0.24, 0.222], [0.105, 0.225, 0.212],
    [0.245, 0.2, 0.17], [0.3, 0.135, 0.115]], "#f5cbad", head, 0.7, 20);
  eyes(art, head, 0.119, 0.02, 0.218, 0.92, true, "#697d93");
  art.sculpt("small turned nose", [[-0.105, 0.018, 0.019, 0, 0.244],
    [-0.062, 0.045, 0.044, 0, 0.254], [0.026, 0.018, 0.019, 0, 0.222]], "#f2b99b", head, 0.72, 10);
  art.sweep("sideways royal smile", [[0.01, -0.147, 0.156], [0.052, -0.15, 0.153], [0.073, -0.13, 0.155]], [0.011, 0.013, 0.004], "#b75070", head);
  for (const side of [-1, 1]) {
    art.sweep("duchess lower eyelid", [[side * 0.06, -0.025, 0.225], [side * 0.125, -0.055, 0.242],
      [side * 0.188, -0.007, 0.203]], [0.009, 0.015, 0.004], "#e7ad96", head);
    art.sweep("sweeping lashes", [[side * 0.095, 0.077, 0.237], [side * 0.16, 0.07, 0.21], [side * 0.2, 0.12, 0.19]], [0.012, 0.012, 0.003], PLUM, head);
    art.sweep("elegant arched brow", [[side * 0.065, 0.16, 0.205], [side * 0.12, 0.182, 0.2], [side * 0.17, 0.165, 0.174]], [0.008, 0.016, 0.003], "#a76444", head);
  }
  art.sculpt("lower architectural copper roll", [[0.085, 0.15, 0.11, 0.025, -0.12],
    [0.17, 0.32, 0.2, -0.005, -0.085], [0.285, 0.345, 0.245, -0.025, -0.04],
    [0.36, 0.265, 0.21, -0.11, -0.025], [0.43, 0.11, 0.1, -0.18, -0.05]], "#d8915d", accent, 0.61, 16);
  art.sculpt("middle architectural copper roll", [[0.29, 0.17, 0.12, -0.1, -0.075],
    [0.37, 0.285, 0.22, 0.015, -0.06], [0.47, 0.32, 0.21, 0.06, -0.055],
    [0.54, 0.225, 0.16, 0.115, -0.05], [0.6, 0.09, 0.08, 0.18, -0.05]], "#c97b51", accent, 0.61, 16);
  art.sculpt("upper architectural copper roll", [[0.465, 0.145, 0.12, 0.06, -0.07],
    [0.55, 0.265, 0.19, -0.025, -0.065], [0.66, 0.295, 0.18, -0.055, -0.05],
    [0.72, 0.21, 0.13, -0.1, -0.025], [0.755, 0.08, 0.06, -0.16, -0.02]], "#d8915d", accent, 0.6, 16);
  for (let i = 0; i < 3; i++) {
    const y = 0.24 + i * 0.18, width = 0.305 - i * 0.02, side = i === 1 ? -1 : 1;
    art.sweep("bouffant swept front engraving", [[-width, y + 0.025, 0.14 - i * 0.023],
      [-0.06, y + 0.062, 0.215 - i * 0.028], [width, y - 0.015, 0.12 - i * 0.015]],
    [0.009, 0.013, 0.005], "#e7ad72", accent, 6);
    art.sweep("bouffant rolled back channel", [[side * width, y + 0.015, -0.2 + i * 0.012],
      [side * 0.11, y + 0.095, -0.28 + i * 0.029], [-side * 0.135, y + 0.065, -0.297 + i * 0.03],
      [-side * 0.19, y - 0.01, -0.282 + i * 0.026], [-side * 0.07, y - 0.045, -0.291 + i * 0.025],
      [-side * 0.035, y + 0.009, -0.31 + i * 0.029]], [0.008, 0.013, 0.019, 0.023, 0.018, 0.007],
    "#b66b48", accent, 8);
    art.sweep("bouffant rolled back highlight", [[side * (width - 0.015), y + 0.045, -0.211 + i * 0.015],
      [side * 0.105, y + 0.12, -0.261 + i * 0.025], [-side * 0.14, y + 0.09, -0.279 + i * 0.029]],
    [0.009, 0.02, 0.009], "#e7ad72", accent, 6);
  }
  const tiara = node(art, "crooked bronze fan tiara", accent, [0.04, 0.69, 0.015]);
  tiara.rotation.z = -0.24;
  for (let i = -2; i <= 2; i++) {
    const height = 0.27 - Math.abs(i) * 0.036;
    const rib = surface(art, art.sculpt("tiara fan blade", [[-height * 0.5, 0.012, 0.012],
      [0, 0.036, 0.025], [height * 0.4, 0.046, 0.021], [height * 0.5, 0.025, 0.011]],
    "#c79555", tiara, 0.6, 8), "#c79555", "metal");
    rib.position.set(i * 0.057, 0.035 - Math.abs(i) * 0.01, 0);
    rib.rotation.z = -i * 0.28;
  }
  // Keep rigid fan blades on the hair rig, not five independent render parents.
  for (const mesh of tiara.getChildMeshes()) mesh.setParent(accent);
  tiara.dispose();
  finishModel(art, root, "fabric", { skin: ["#f5cbad", "#f2b99b", "#e7ad96", "#b75070"],
    paint: ["#b66b48", "#d8915d", "#c97b51", "#e7ad72", "#a76444"] });
  return riderRig(art, "pompa", root, head, accent, { shoulder: [0.31, 0.73, 0.015], sleeve: "#f5cbad", hand: CREAM, armWidth: 0.1, handSize: 0.285, sleeveFinish: "skin" });
}

export function bront(art: Atelier): RiderModel {
  const root = node(art, "Bront");
  const head = node(art, "Bront shovel jaw", root, [0, 1.09, 0.09]);
  const accent = node(art, "Bront polite brow", head);
  const coral = "#e98671";
  art.sculpt("seated caiman heavyweight torso", [[0.12, 0.31, 0.24, 0, -0.05], [0.29, 0.49, 0.32],
    [0.55, 0.53, 0.35], [0.78, 0.485, 0.305], [0.96, 0.27, 0.21]], coral, root, 0.66, 20);
  seatedLegs(art, root, coral, 0.32, 0.185);
  art.sculpt("continuous warm caiman belly", [[0.22, 0.16, 0.035, 0, 0.29], [0.36, 0.32, 0.065, 0, 0.345],
    [0.62, 0.33, 0.055, 0, 0.35], [0.8, 0.17, 0.025, 0, 0.283]], "#f5c3a2", root, 0.86, 20);
  for (let i = 0; i < 3; i++) art.sweep("belly fold", [[-0.21, 0.33 + i * 0.13, 0.37], [0, 0.31 + i * 0.13, 0.411], [0.21, 0.33 + i * 0.13, 0.37]], [0.006, 0.008, 0.006], "#dba18a", root);
  art.sculpt("broad caiman skull", [[-0.24, 0.25, 0.18], [-0.08, 0.365, 0.27],
    [0.105, 0.355, 0.26], [0.23, 0.295, 0.23], [0.28, 0.17, 0.14]], coral, head, 0.56, 16);
  art.sculpt("continuous shovel muzzle and cheek pads", [[-0.285, 0.29, 0.18, 0, 0.24],
    [-0.24, 0.425, 0.235, 0, 0.29], [-0.145, 0.47, 0.26, 0, 0.27],
    [-0.04, 0.425, 0.235, 0, 0.265], [0.035, 0.295, 0.185, 0, 0.225],
    [0.085, 0.17, 0.1, 0, 0.14]], "#f3aa89", head, 0.53, 20);
  eyes(art, head, 0.205, 0.127, 0.276, 1, false, "#aa7643");
  art.sweep("wide gentle jawline", [[-0.39, -0.2, 0.43], [0, -0.23, 0.54], [0.39, -0.2, 0.43]], [0.009, 0.012, 0.009], "#a35e58", head);
  for (const side of [-1, 1]) {
    soft(art, root, "caiman heavy foot", [side * 0.32, 0.045, 0.43], [0.46, 0.25, 0.56], "#ca7569", 0.6);
    surface(art, soft(art, root, "navy rectangular shoulder plate", [side * 0.49, 0.8, -0.015], [0.38, 0.26, 0.46], "#414b68", 0.46), "#414b68", "paint").rotation.z = side * 0.21;
    art.sculpt("caiman integrated brow shelf", [[0.025, 0.085, 0.055, side * 0.245, 0.2],
      [0.18, 0.12, 0.085, side * 0.235, 0.205], [0.275, 0.08, 0.055, side * 0.22, 0.18]],
    coral, head, 0.61, 12);
    soft(art, head, "blunt corner tooth", [side * 0.335, -0.238, 0.457], [0.1, 0.145, 0.085], CREAM, 0.65);
    soft(art, head, "nostril", [side * 0.2, -0.013, 0.484], [0.055, 0.037, 0.02], "#a56b62");
    art.sweep("courteous heavy brow", [[side * 0.11, 0.23, 0.251], [side * 0.2, 0.265, 0.251], [side * 0.3, 0.215, 0.214]], [0.023, 0.037, 0.012], "#414b68", accent);
    for (let i = 0; i < 3; i++) soft(art, root, "blunt toe nail", [side * 0.32 + (i - 1) * 0.095, 0.025, 0.68], [0.07, 0.055, 0.09], "#e6bb9d");
    art.sculpt("shoulder plate rear inset", [[0.72, 0.1, 0.013, side * 0.49, -0.24],
      [0.77, 0.15, 0.02, side * 0.49, -0.256], [0.865, 0.12, 0.017, side * 0.47, -0.243]],
    "#687b94", root, 0.52, 10);
    for (let i = 0; i < 3; i++) {
      art.sculpt("caiman low dorsal scute", [[0.37 + i * 0.17, 0.09, 0.012, side * 0.125, -0.345 + i * 0.035],
        [0.425 + i * 0.17, 0.13, 0.026, side * 0.14, -0.355 + i * 0.035],
        [0.51 + i * 0.17, 0.085, 0.014, side * 0.12, -0.335 + i * 0.035]],
      "#ca7569", root, 0.51, 10);
    }
  }
  art.sweep("long stepped caiman tail", [[0, 0.4, -0.23], [0.29, 0.29, -0.46], [0.57, 0.42, -0.67], [0.65, 0.76, -0.77], [0.55, 0.96, -0.79]], [0.2, 0.18, 0.135, 0.09, 0.009], coral, root, 12);
  for (let i = 0; i < 3; i++) {
    art.sculpt("tail rectangular step", [[0.34 + i * 0.15, 0.06, 0.045, 0.36 + i * 0.11, -0.57 - i * 0.085],
      [0.405 + i * 0.15, 0.095, 0.105, 0.38 + i * 0.11, -0.57 - i * 0.085],
      [0.44 + i * 0.15, 0.058, 0.075, 0.4 + i * 0.11, -0.58 - i * 0.085]], INK, root, 0.53, 10);
  }
  finishModel(art, root, "skin", { paint: [CREAM, "#687b94"], fabric: [INK] });
  return riderRig(art, "bront", root, head, accent, { shoulder: [0.45, 0.69, 0.09], sleeve: coral, hand: coral, armWidth: 0.15, handSize: 0.31, sleeveFinish: "skin" });
}
