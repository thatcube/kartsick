import { Atelier } from "../geometry";
import { CREAM, INK, MINT, PLUM, eyes, node, riderRig, soft } from "./rig";
import type { RiderModel } from "./rig";

export function clutch(art: Atelier): RiderModel {
  const root = node(art, "Clutch");
  const head = node(art, "Clutch face", root, [0, 1.25, 0.015]);
  const accent = node(art, "Clutch floating handlebar", head);
  const skin = "#eeb790", orange = "#ef7949";
  art.sculpt("zip-front work coverall", [[0.27, 0.24, 0.22], [0.4, 0.37, 0.29], [0.7, 0.36, 0.28], [0.95, 0.26, 0.22], [1.01, 0.15, 0.16]], orange, root, 0.8);
  art.sculpt("broad trapezoid cheeks", [[-0.3, 0.16, 0.16], [-0.23, 0.31, 0.24], [-0.02, 0.4, 0.3], [0.21, 0.34, 0.26], [0.31, 0.2, 0.16]], skin, head, 0.69);
  soft(art, head, "plum hair cap", [0, 0.28, -0.06], [0.77, 0.27, 0.62], PLUM, 0.7);
  soft(art, head, "wide button nose", [0, -0.04, 0.32], [0.29, 0.17, 0.2], "#f5c79f", 0.75);
  eyes(art, head, 0.17, 0.09, 0.298);
  art.sweep("small confident smile", [[-0.075, -0.2, 0.24], [0, -0.22, 0.26], [0.09, -0.18, 0.25]], [0.008, 0.013, 0.008], "#a16b60", head);
  for (const side of [-1, 1]) {
    soft(art, root, "navy rail boot", [side * 0.25, 0.13, 0.21], [0.41, 0.26, 0.64], INK, 0.55);
    soft(art, root, "boot sole welt", [side * 0.25, 0.04, 0.21], [0.42, 0.065, 0.65], "#536477", 0.6);
    soft(art, head, "round ear", [side * 0.39, -0.005, -0.015], [0.19, 0.24, 0.17], skin);
    soft(art, head, "tall welding goggle rim", [side * 0.2, 0.37, 0.22], [0.34, 0.3, 0.16], MINT, 0.6).rotation.z = -side * 0.07;
    soft(art, head, "inset goggle glass", [side * 0.2, 0.37, 0.302], [0.23, 0.19, 0.035], "#d9faf1", 0.63);
    art.sweep("raised brow", [[side * 0.08, 0.21, 0.29], [side * 0.17, 0.25, 0.29], [side * 0.28, 0.21, 0.27]], [0.016, 0.026, 0.007], PLUM, head);
    art.sweep("sculpted horizontal mustache", [[side * 0.01, -0.13, 0.36], [side * 0.2, -0.09, 0.37], [side * 0.4, -0.17, 0.31], [side * 0.59, -0.12, 0.24], [side * 0.64, 0.02, 0.18]], [0.06, 0.105, 0.075, 0.05, 0.006], PLUM, accent, 10);
    art.sweep("coverall pocket seam", [[side * 0.11, 0.59, 0.282], [side * 0.24, 0.59, 0.274], [side * 0.26, 0.69, 0.27]], [0.008, 0.008, 0.008], "#bf573d", root);
  }
  art.sweep("zipper", [[0, 0.33, 0.277], [0, 0.7, 0.285], [0, 0.97, 0.214]], [0.014, 0.014, 0.012], INK, root);
  soft(art, root, "zip pull", [0.015, 0.87, 0.24], [0.065, 0.095, 0.025], CREAM, 0.6);
  soft(art, root, "workshop badge", [-0.18, 0.82, 0.252], [0.18, 0.075, 0.035], "#ffd46b", 0.65).rotation.z = 0.2;
  return riderRig(art, "clutch", root, head, accent, { shoulder: [0.32, 0.86, 0.015], sleeve: orange, hand: CREAM, armWidth: 0.15, handSize: 0.28 });
}

export function bramble(art: Atelier): RiderModel {
  const root = node(art, "Bramble");
  const head = node(art, "Bramble face", root, [0, 1.27, 0]);
  const accent = node(art, "Bramble ears and eyebrows", head);
  const skin = "#efc499", moss = "#80986c";
  art.sculpt("quilted tunic", [[0.29, 0.21, 0.2], [0.36, 0.32, 0.22], [0.66, 0.27, 0.2], [0.91, 0.25, 0.19], [1, 0.12, 0.12]], moss, root, 0.85);
  art.sculpt("mapmaker tapered face", [[-0.3, 0.065, 0.095], [-0.19, 0.2, 0.17], [0.04, 0.29, 0.245], [0.26, 0.25, 0.21], [0.34, 0.11, 0.09]], skin, head, 0.8);
  soft(art, head, "plum hair back", [0, 0.2, -0.065], [0.63, 0.39, 0.51], PLUM, 0.76);
  for (let i = 0; i < 4; i++) art.sweep("combed plum fringe", [[-0.24 + i * 0.13, 0.26, 0.04], [-0.18 + i * 0.14, 0.41 + i * 0.025, 0.11], [-0.15 + i * 0.12, 0.12 + (i % 2) * 0.06, 0.25]], [0.07, 0.1, 0.005], PLUM, head, 10);
  eyes(art, head, 0.125, 0.04, 0.239, 0.86);
  soft(art, head, "short nose", [0, -0.045, 0.256], [0.1, 0.15, 0.1], skin);
  art.sweep("earnest mouth", [[-0.04, -0.18, 0.181], [0.018, -0.19, 0.198], [0.07, -0.17, 0.18]], [0.006, 0.009, 0.006], INK, head);
  for (const side of [-1, 1]) {
    soft(art, root, "slate leggings", [side * 0.16, 0.26, 0.02], [0.19, 0.37, 0.21], INK);
    soft(art, root, "mapmaker trail boot", [side * 0.18, 0.1, 0.16], [0.29, 0.21, 0.48], "#997155", 0.65);
    const ear = art.sculpt("long leaf-shaped ear", [[0, 0.04, 0.03], [0.1, 0.115, 0.045], [0.27, 0.07, 0.028], [0.47, 0.002, 0.003]], skin, accent);
    ear.position.set(side * 0.26, -0.02, -0.015); ear.rotation.z = side * -0.85;
    art.sweep("inner ear leaf vein", [[side * 0.3, 0.015, 0.035], [side * 0.42, 0.15, 0.035], [side * 0.56, 0.29, 0.015]], [0.011, 0.018, 0.003], "#d79585", accent);
    art.sweep("directional eyebrows", [[side * 0.065, 0.17, 0.251], [side * 0.2, 0.2, 0.255], [side * 0.37, 0.16, 0.24]], [0.022, 0.03, 0.002], "#647d50", accent);
  }
  for (let i = 0; i < 3; i++) {
    art.sweep("quilt stitch", [[-0.22, 0.42 + i * 0.14, 0.205], [0, 0.56 + i * 0.13, 0.223], [0.21, 0.42 + i * 0.14, 0.205]], [0.006, 0.006, 0.006], "#5d7b54", root, 6);
  }
  art.sculpt("folded map cape", [[0.34, 0.29, 0.03, 0, -0.33], [0.4, 0.35, 0.055, 0, -0.32], [0.7, 0.27, 0.05, 0, -0.26], [0.97, 0.17, 0.03, 0, -0.2]], CREAM, root, 0.55);
  art.sweep("map ink trail", [[-0.2, 0.43, -0.383], [-0.12, 0.67, -0.32], [0.12, 0.63, -0.326], [0.17, 0.86, -0.269]], [0.009, 0.009, 0.009, 0.009], "#bc9d69", root, 6);
  soft(art, root, "oversized rust scarf knot", [0, 0.99, 0.012], [0.68, 0.22, 0.53], "#d66f45", 0.73);
  art.sculpt("hanging scarf fold", [[0.62, 0.07, 0.025, 0.24, 0.26], [0.77, 0.11, 0.04, 0.17, 0.28], [0.95, 0.08, 0.04, 0.06, 0.27]], "#d66f45", root, 0.6);
  const compass = art.cylinder("copper compass disc", [0, 0.59, 0.246], 0.2, 0.2, 0.035, "#cb9860", root);
  compass.rotation.x = Math.PI / 2;
  soft(art, root, "compass ivory dial", [0, 0.59, 0.268], [0.145, 0.145, 0.015], CREAM);
  art.sweep("compass needle", [[-0.033, 0.548, 0.282], [0.026, 0.64, 0.282]], [0.009, 0.002], "#3445a8", root);
  return riderRig(art, "bramble", root, head, accent, { shoulder: [0.26, 0.84, 0.015], sleeve: moss, hand: skin, armWidth: 0.105, handSize: 0.215 });
}
