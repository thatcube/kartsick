import { Atelier } from "../geometry";
import { CREAM, INK, MINT, PLUM, eyes, finishModel, node, riderRig, seatedLegs, soft, surface } from "./rig";
import type { RiderModel } from "./rig";

export function clutch(art: Atelier): RiderModel {
  const root = node(art, "Clutch");
  const head = node(art, "Clutch face", root, [0, 1.03, 0.065]);
  const accent = node(art, "Clutch floating handlebar", head);
  const skin = "#eeb790", warm = "#e4a17d", orange = "#ef7949";
  art.sculpt("tailored squat work coverall", [[0.16, 0.23, 0.18, 0, -0.06], [0.28, 0.35, 0.25, 0, -0.04],
    [0.49, 0.36, 0.285], [0.68, 0.33, 0.25], [0.8, 0.335, 0.205],
    [0.9, 0.16, 0.14]], orange, root, 0.65, 16);
  seatedLegs(art, root, orange, 0.25, 0.17);
  art.sculpt("continuous trapezoid brow cheek and jaw", [[-0.29, 0.24, 0.17, 0, 0.025],
    [-0.235, 0.34, 0.225, 0, 0.025], [-0.105, 0.385, 0.29],
    [0.06, 0.395, 0.302], [0.23, 0.37, 0.275], [0.32, 0.29, 0.21]], skin, head, 0.61, 20);
  art.sculpt("combed workshop crown and clipped nape", [[-0.12, 0.23, 0.045, 0, -0.24],
    [0.07, 0.35, 0.085, 0, -0.225], [0.26, 0.385, 0.22, 0, -0.09],
    [0.365, 0.29, 0.23, -0.045, -0.055], [0.415, 0.1, 0.105, -0.15, -0.05]], PLUM, head, 0.65, 16);
  art.sculpt("broad wedge nose bridge and tip", [[-0.145, 0.055, 0.06, 0, 0.365],
    [-0.09, 0.13, 0.103, 0, 0.385], [-0.015, 0.123, 0.09, 0, 0.382],
    [0.13, 0.045, 0.032, 0, 0.319]], "#f5c79f", head, 0.66, 12);
  eyes(art, head, 0.18, 0.115, 0.309, 1.1, false, "#447e78");
  soft(art, head, "smiling mouth inset", [0.03, -0.212, 0.276], [0.24, 0.073, 0.025], "#905864", 0.76);
  art.sweep("rounded lower lip", [[-0.085, -0.24, 0.256], [0.025, -0.255, 0.285], [0.13, -0.21, 0.262]], [0.014, 0.022, 0.009], warm, head);
  const strap = art.sweep("goggle strap around crown", [[-0.36, 0.28, 0.12], [-0.4, 0.24, -0.06], [0, 0.25, -0.34],
    [0.4, 0.24, -0.06], [0.36, 0.28, 0.12]], [0.03, 0.032, 0.039, 0.032, 0.03], "#476e6b", head);
  strap.scaling.y = 1.25; strap.position.y = -0.06;
  surface(art, soft(art, head, "welding strap back buckle", [0, 0.25, -0.382], [0.18, 0.105, 0.035], MINT, 0.55), MINT, "paint");
  soft(art, head, "buckle inset webbing", [0, 0.25, -0.405], [0.103, 0.042, 0.014], "#476e6b", 0.55);
  art.sculpt("work coverall shoulder yoke", [[0.59, 0.18, 0.019, 0, -0.288],
    [0.67, 0.29, 0.026, 0, -0.265], [0.78, 0.31, 0.027, 0, -0.207],
    [0.84, 0.21, 0.016, 0, -0.18]], "#ff9864", root, 0.58, 12);
  art.sweep("coverall rear center seam", [[0, 0.28, -0.298], [0, 0.47, -0.297], [0, 0.62, -0.3]],
    [0.01, 0.012, 0.008], "#bf573d", root, 6);
  for (const side of [-1, 1]) {
    art.sculpt("combed nape taper", [[-0.16, 0.015, 0.012, side * 0.2, -0.245],
      [-0.05, 0.074, 0.033, side * 0.23, -0.28], [0.13, 0.085, 0.021, side * 0.19, -0.305]],
    PLUM, head, 0.65, 10);
  }
  for (const side of [-1, 1]) {
    soft(art, root, "navy rail boot", [side * 0.255, 0.055, 0.44], [0.4, 0.24, 0.54], INK, 0.58);
    soft(art, root, "boot sole welt", [side * 0.255, -0.033, 0.44], [0.41, 0.057, 0.55], "#536477", 0.6);
    soft(art, root, "rolled coverall ankle cuff", [side * 0.25, 0.165, 0.32], [0.34, 0.12, 0.3], "#d56943", 0.75);
    art.sweep("rail boot tongue", [[side * 0.25, 0.15, 0.34], [side * 0.25, 0.14, 0.51], [side * 0.25, 0.1, 0.6]], [0.044, 0.045, 0.025], "#536477", root);
    soft(art, head, "ear concha", [side * 0.405, 0.015, 0], [0.17, 0.235, 0.115], skin, 0.68);
    soft(art, head, "recessed warm inner ear", [side * 0.448, 0.01, 0.072], [0.087, 0.132, 0.036], warm);
    art.sweep("lower socket lid", [[side * 0.095, 0.07, 0.317], [side * 0.18, 0.016, 0.324],
      [side * 0.255, 0.07, 0.289]], [0.012, 0.026, 0.01], warm, head);
    surface(art, soft(art, head, "tall welding goggle rim", [side * 0.205, 0.39, 0.202], [0.35, 0.29, 0.18], MINT, 0.6), MINT, "paint").rotation.z = -side * 0.09;
    surface(art, soft(art, head, "inset dark teal goggle glass", [side * 0.205, 0.39, 0.298], [0.247, 0.184, 0.036], "#396b76", 0.63), "#396b76", "paint");
    surface(art, soft(art, head, "goggle glass sky glint", [side * 0.205 - 0.048, 0.425, 0.32], [0.065, 0.076, 0.009], "#d9faf1", 0.6), "#d9faf1", "paint").rotation.z = -0.4;
    surface(art, soft(art, head, "goggle brass hinge", [side * 0.386, 0.376, 0.2], [0.045, 0.085, 0.07], "#c79555", 0.65), "#c79555", "metal");
    art.sweep("confident brow arch", [[side * 0.085, 0.238, 0.305], [side * 0.17, 0.278, 0.303],
      [side * 0.285, 0.235, 0.26]], [0.024, 0.034, 0.009], PLUM, head);
    const mustache = art.sweep("sculpted horizontal mustache", [[side * 0.025, -0.13, 0.381], [side * 0.22, -0.12, 0.39],
      [side * 0.42, -0.175, 0.31], [side * 0.58, -0.13, 0.24], [side * 0.615, -0.018, 0.19]],
    [0.065, 0.088, 0.057, 0.039, 0.006], PLUM, accent, 10);
    mustache.scaling.y = 0.79; mustache.position.y = -0.036;
    art.sweep("rolled coverall collar", [[side * 0.055, 0.82, 0.192], [side * 0.18, 0.87, 0.16],
      [side * 0.26, 0.78, 0.18]], [0.028, 0.046, 0.017], "#ff9864", root);
    art.sweep("gusseted chest pocket", [[side * 0.115, 0.56, 0.289], [side * 0.27, 0.56, 0.262],
      [side * 0.275, 0.675, 0.243], [side * 0.13, 0.69, 0.271]], [0.01, 0.01, 0.012, 0.008], "#bf573d", root, 6);
  }
  art.sweep("zipper", [[0, 0.26, 0.241], [0, 0.54, 0.303], [0, 0.84, 0.198]], [0.014, 0.014, 0.012], INK, root);
  surface(art, soft(art, root, "zip pull", [0.015, 0.765, 0.24], [0.063, 0.079, 0.027], CREAM, 0.6), CREAM, "metal");
  soft(art, root, "workshop stitched badge", [-0.2, 0.715, 0.235], [0.16, 0.065, 0.035], "#ffd46b", 0.65).rotation.z = 0.14;
  finishModel(art, root, "fabric", { skin: [skin, warm, "#f5c79f", "#905864"], rubber: [INK, "#536477"] });
  return riderRig(art, "clutch", root, head, accent, { shoulder: [0.32, 0.735, 0.015], sleeve: orange, hand: CREAM, armWidth: 0.15, handSize: 0.285 });
}

export function bramble(art: Atelier): RiderModel {
  const root = node(art, "Bramble");
  const head = node(art, "Bramble face", root, [0, 1.035, 0.045]);
  const accent = node(art, "Bramble ears and eyebrows", head);
  const skin = "#efc499", moss = "#80986c";
  art.sculpt("quilted seated tunic", [[0.18, 0.265, 0.22, 0, -0.025], [0.27, 0.335, 0.24],
    [0.46, 0.28, 0.23], [0.72, 0.29, 0.2], [0.88, 0.17, 0.14]], moss, root, 0.7, 16);
  seatedLegs(art, root, INK, 0.19, 0.115);
  art.sculpt("mapmaker brow cheek and pointed chin", [[-0.29, 0.07, 0.105, 0, 0.06],
    [-0.18, 0.205, 0.195, 0, 0.025], [-0.045, 0.293, 0.25],
    [0.14, 0.285, 0.25], [0.28, 0.23, 0.19], [0.35, 0.12, 0.1]], skin, head, 0.72, 20);
  art.sculpt("swept plum hair cap and nape", [[-0.17, 0.155, 0.055, 0, -0.185],
    [-0.015, 0.285, 0.11, 0, -0.19], [0.21, 0.325, 0.24, 0, -0.065],
    [0.35, 0.27, 0.215, -0.04, -0.04], [0.435, 0.09, 0.09, -0.145, -0.025]], PLUM, head, 0.69, 16);
  for (let i = 0; i < 3; i++) {
    art.sculpt("overlapping blade-cut plum fringe", [[0.16 + i * 0.022, 0.012, 0.011, -0.23 + i * 0.145, 0.26],
      [0.25 + i * 0.02, 0.07, 0.042, -0.19 + i * 0.145, 0.235],
      [0.36, 0.105, 0.055, -0.11 + i * 0.12, 0.13],
      [0.4, 0.045, 0.026, -0.13 + i * 0.11, 0.06]], PLUM, head, 0.65, 10);
    art.sculpt("layered mapmaker nape", [[-0.21 + i * 0.027, 0.014, 0.01, -0.19 + i * 0.17, -0.218],
      [-0.02, 0.082, 0.028, -0.16 + i * 0.16, -0.292],
      [0.22, 0.09, 0.024, -0.13 + i * 0.13, -0.3]], i === 1 ? "#805572" : PLUM, head, 0.65, 10);
  }
  eyes(art, head, 0.139, 0.055, 0.25, 1.02, false, "#816444");
  art.sweep("mapmaker nose bridge and tip", [[0, 0.11, 0.252], [0, -0.014, 0.285], [0, -0.084, 0.32]],
    [0.038, 0.052, 0.035], skin, head, 10);
  art.sweep("earnest asymmetric smile", [[-0.06, -0.172, 0.219], [0.025, -0.187, 0.231], [0.115, -0.135, 0.207]], [0.007, 0.013, 0.006], "#a36563", head);
  for (const side of [-1, 1]) {
    soft(art, root, "mapmaker trail boot", [side * 0.2, 0.035, 0.43], [0.31, 0.215, 0.48], "#997155", 0.65);
    soft(art, root, "trail boot rubber welt", [side * 0.2, -0.042, 0.43], [0.32, 0.055, 0.49], "#69545b", 0.65);
    art.sweep("trail boot folded collar", [[side * 0.09, 0.14, 0.32], [side * 0.2, 0.163, 0.385],
      [side * 0.31, 0.14, 0.32]], [0.022, 0.029, 0.022], "#bb9067", root);
    art.sweep("warm lower eyelid", [[side * 0.08, 0.007, 0.265], [side * 0.15, -0.036, 0.275],
      [side * 0.225, 0.01, 0.236]], [0.012, 0.018, 0.006], "#dba080", head);
    const ear = art.sculpt("long cupped leaf ear", [[0, 0.042, 0.031], [0.09, 0.106, 0.044],
      [0.24, 0.075, 0.028, 0.015], [0.43, 0.007, 0.005, -0.015]], skin, accent, 0.72, 12);
    ear.position.set(side * 0.285, -0.02, -0.025); ear.rotation.z = side * -1.05;
    art.sweep("inner ear leaf fold", [[side * 0.32, 0.015, 0.031], [side * 0.455, 0.09, 0.037],
      [side * 0.615, 0.191, 0]], [0.021, 0.028, 0.003], "#d79585", accent);
    art.sweep("directional eyebrows", [[side * 0.066, 0.187, 0.265], [side * 0.205, 0.215, 0.264],
      [side * 0.36, 0.18, 0.223]], [0.025, 0.036, 0.003], PLUM, accent);
    for (let i = 0; i < 2; i++) soft(art, head, "mapmaker sun freckle", [side * (0.205 + i * 0.045), -0.065, 0.289 - i * 0.024], [0.016, 0.013, 0.009], "#bf856d");
  }
  for (let i = 0; i < 3; i++) art.sweep("quilt stitch", [[-0.25, 0.31 + i * 0.13, 0.215],
    [0, 0.42 + i * 0.13, 0.25], [0.25, 0.31 + i * 0.13, 0.215]], [0.007, 0.007, 0.007], "#5d7b54", root, 6);
  art.sculpt("map cape folded across crouched hips", [[0.19, 0.25, 0.031, 0.03, -0.33],
    [0.245, 0.355, 0.043, 0.025, -0.319], [0.41, 0.34, 0.048, 0.015, -0.29],
    [0.65, 0.27, 0.035, -0.005, -0.243], [0.865, 0.15, 0.02, 0, -0.16]], CREAM, root, 0.52, 16);
  art.sculpt("map cape broad pressed fold", [[0.205, 0.033, 0.009, 0.065, -0.369],
    [0.36, 0.048, 0.012, 0.04, -0.353], [0.58, 0.046, 0.011, 0.008, -0.312],
    [0.81, 0.014, 0.006, -0.025, -0.208]], "#e4cdaa", root, 0.55, 10);
  art.sweep("map ink trail", [[-0.2, 0.28, -0.364], [-0.14, 0.47, -0.335], [0.16, 0.5, -0.322],
    [0.16, 0.67, -0.276]], [0.013, 0.013, 0.012, 0.009], "#997155", root, 6);
  art.sweep("map cape hem binding", [[-0.3, 0.245, -0.347], [0.02, 0.203, -0.368], [0.345, 0.258, -0.347]],
    [0.011, 0.014, 0.01], "#bc9d69", root, 6);
  art.sculpt("oversized wrapped rust scarf", [[0.785, 0.18, 0.18], [0.825, 0.33, 0.255],
    [0.925, 0.32, 0.24], [0.965, 0.17, 0.14]], "#d66f45", root, 0.8, 20);
  art.sculpt("thick hanging scarf fold", [[0.47, 0.062, 0.028, 0.26, 0.27], [0.6, 0.115, 0.043, 0.21, 0.285],
    [0.82, 0.084, 0.048, 0.095, 0.255], [0.88, 0.04, 0.023, 0.09, 0.2]], "#d66f45", root, 0.7, 16);
  art.sculpt("rust scarf over rear shoulder", [[0.57, 0.06, 0.014, -0.27, -0.297],
    [0.64, 0.105, 0.025, -0.255, -0.298], [0.83, 0.09, 0.036, -0.17, -0.247],
    [0.925, 0.067, 0.027, -0.12, -0.16]], "#d66f45", root, 0.6, 12);
  art.sweep("scarf rolled selvedge", [[0.3, 0.49, 0.28], [0.285, 0.6, 0.308], [0.16, 0.81, 0.288]],
    [0.011, 0.015, 0.012], "#ef9666", root);
  const compass = art.cylinder("copper compass disc", [0, 0.5, 0.274], 0.18, 0.18, 0.035, "#cb9860", root);
  compass.rotation.x = Math.PI / 2;
  surface(art, compass, "#cb9860", "metal");
  surface(art, soft(art, root, "compass ivory dial", [0, 0.5, 0.296], [0.133, 0.133, 0.015], CREAM), CREAM, "paint");
  art.sweep("compass needle", [[-0.028, 0.466, 0.31], [0.024, 0.544, 0.31]], [0.009, 0.002], INK, root);
  finishModel(art, root, "fabric", { skin: [skin, "#dba080", "#d79585", "#a36563", "#bf856d"], rubber: ["#69545b"] });
  return riderRig(art, "bramble", root, head, accent, { shoulder: [0.28, 0.73, 0.015], sleeve: moss, hand: skin, armWidth: 0.115, handSize: 0.225 });
}
