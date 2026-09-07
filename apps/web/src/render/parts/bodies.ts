import type { BodyId, DecalId, PaintId } from "@kartsick/content";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Atelier } from "../geometry";
import type { Contour, Triple } from "../geometry";
import { soft } from "../characters/rig";

const INK = "#30394f", CREAM = "#f5f2e8";
const ORIGINAL: Record<BodyId, string> = {
  "boiler-bug": "#ef7949", "trail-mix": "#80986c", "gilt-trip": "#b49acf", "velvet-hammer": "#b6657f",
  slipstream: "#b6558e", "coil-bug": "#e9ae73", "air-pocket": "#a9d2ed", "knuckle-bus": "#8eb3a6",
};
const PAINT: Record<Exclude<PaintId, "original">, string> = {
  pool: "#5bd1c4", sunset: "#ff8051", custard: "#ffd46b", petal: "#edabdb", midnight: "#3445a8",
};

export interface BodyPalette { enamel: string; trim: string; accent: string }

export function bodyPalette(body: BodyId, paint: PaintId): BodyPalette {
  return {
    enamel: paint === "original" ? ORIGINAL[body] : PAINT[paint],
    trim: CREAM,
    accent: paint === "pool" ? "#3445a8" : paint === "midnight" ? "#5bd1c4" : "#ffd46b",
  };
}

function hull(art: Atelier, root: TransformNode, name: string, sections: readonly (readonly [number, number, number, number])[], color: string, square = 0.83): void {
  const mesh = art.sculpt(name, sections.map(([z, width, height, depth]): Contour => [z, width, depth, 0, -height]), color, root, square, 24);
  mesh.rotation.x = Math.PI / 2;
}

function pinstripe(art: Atelier, root: TransformNode, name: string, points: Triple[], color: string, width = 0.025) {
  art.sweep(name, points, points.map(() => width), color, root);
}

/** A common tandem interface, not eight skins over the same silhouette. */
export function makeBody(art: Atelier, root: TransformNode, id: BodyId, paint: PaintId, decal: DecalId): BodyPalette {
  const palette = bodyPalette(id, paint);
  const { enamel, trim, accent } = palette;
  root.metadata = { ...root.metadata, bodyId: id, paintId: paint, decalId: decal };
  soft(art, root, "rigid lower chassis", [0, 0.12, -0.1], [1.55, 0.27, 2.62], INK, 0.52);
  switch (id) {
    case "boiler-bug":
      hull(art, root, "Boiler Bug enamel tub", [[-1.6, 0.08, 0.37, 0.07], [-1.34, 0.75, 0.35, 0.23], [-0.63, 0.81, 0.39, 0.28], [0.38, 0.7, 0.38, 0.26], [1.16, 0.45, 0.27, 0.2], [1.56, 0.07, 0.25, 0.04]], enamel);
      for (let i = 0; i < 6; i++) pinstripe(art, root, "ribbed boiler nose", [[-0.27 + i * 0.025, 0.593 - i * 0.032, 0.81 + i * 0.1], [0, 0.61 - i * 0.032, 0.84 + i * 0.1], [0.27 - i * 0.025, 0.593 - i * 0.032, 0.81 + i * 0.1]], trim, 0.018);
      for (const side of [-1, 1]) {
        art.sweep("twin short exhaust", [[side * 0.6, 0.43, -0.68], [side * 0.78, 0.5, -1.2], [side * 0.81, 0.65, -1.65]], [0.095, 0.102, 0.095], "#6a8191", root, 12);
        soft(art, root, "dark exhaust mouth", [side * 0.81, 0.66, -1.666], [0.145, 0.145, 0.035], INK);
      }
      break;
    case "trail-mix":
      hull(art, root, "Trail Mix cutaway buggy shell", [[-1.6, 0.18, 0.31, 0.06], [-1.32, 0.72, 0.34, 0.19], [-0.4, 0.73, 0.33, 0.18], [0.7, 0.57, 0.34, 0.23], [1.37, 0.5, 0.4, 0.23], [1.53, 0.19, 0.37, 0.09]], enamel);
      soft(art, root, "rolled map bonnet", [0, 0.54, 1.03], [1.07, 0.37, 0.65], "#e8dabc", 0.7);
      for (const side of [-1, 1]) {
        const roll = art.cylinder("map paper rolled end", [side * 0.53, 0.55, 1.06], 0.31, 0.31, 0.07, trim, root); roll.rotation.z = Math.PI / 2;
        const core = art.cylinder("map roll hollow center", [side * 0.572, 0.55, 1.06], 0.1, 0.1, 0.01, "#b39d73", root); core.rotation.z = Math.PI / 2;
        pinstripe(art, root, "curved trail strut", [[side * 0.78, 0.23, -1.43], [side * 0.85, 0.55, -0.8], [side * 0.74, 0.64, 0.36], [side * 0.6, 0.33, 1.45]], "#c6925c", 0.042);
        soft(art, root, "map leather strap", [side * 0.31, 0.67, 1.05], [0.09, 0.11, 0.56], "#ad7956", 0.68);
      }
      pinstripe(art, root, "bonnet route ink", [[-0.18, 0.728, 0.85], [0.02, 0.735, 1], [-0.1, 0.727, 1.19], [0.17, 0.695, 1.28]], "#8a986f", 0.012);
      break;
    case "gilt-trip":
      hull(art, root, "Gilt Trip parade skiff", [[-1.63, 0.36, 0.37, 0.09], [-1.35, 0.87, 0.41, 0.23], [-0.4, 0.82, 0.39, 0.26], [0.43, 0.63, 0.35, 0.25], [1.17, 0.35, 0.4, 0.26], [1.6, 0.025, 0.51, 0.025]], enamel);
      for (const side of [-1, 1]) {
        pinstripe(art, root, "scalloped pearl gunwale", [[side * 0.16, 0.67, 1.35], [side * 0.44, 0.61, 0.8], [side * 0.6, 0.67, 0.32], [side * 0.8, 0.6, -0.35], [side * 0.82, 0.68, -1.12]], trim, 0.055);
        for (let i = 0; i < 5; i++) soft(art, root, "pearl stud", [side * (0.47 + i * 0.08), 0.52, 0.57 - i * 0.38], [0.09, 0.09, 0.09], trim);
      }
      for (let i = -3; i <= 3; i++) {
        const fan = soft(art, root, "parade fan rear deck blade", [i * 0.21, 0.65, -1.3 - (3 - Math.abs(i)) * 0.055], [0.28, 0.11, 0.64], i % 2 ? trim : "#cfa969", 0.7);
        fan.rotation.y = i * -0.18;
      }
      break;
    case "velvet-hammer":
      hull(art, root, "Velvet Hammer ceremonial saloon", [[-1.64, 0.35, 0.34, 0.1], [-1.39, 0.86, 0.35, 0.22], [-0.2, 0.86, 0.36, 0.26], [0.99, 0.73, 0.33, 0.24], [1.5, 0.63, 0.32, 0.22], [1.61, 0.12, 0.31, 0.07]], enamel, 0.5);
      for (const side of [-1, 1]) {
        for (const z of [-1.12, 0.99]) soft(art, root, "squared-round saloon fender", [side * 0.77, 0.39, z], [0.47, 0.25, 0.94], enamel, 0.5);
        pinstripe(art, root, "saloon chrome waistline", [[side * 0.7, 0.55, 1.33], [side * 0.83, 0.57, 0.03], [side * 0.83, 0.55, -1.35]], trim, 0.023);
      }
      soft(art, root, "wide ceremonial grille", [0, 0.36, 1.644], [0.84, 0.3, 0.055], INK, 0.58);
      for (let i = -3; i <= 3; i++) soft(art, root, "saloon vertical grille slat", [i * 0.105, 0.35, 1.679], [0.025, 0.22, 0.025], "#c6bcb5", 0.7);
      break;
    case "slipstream":
      hull(art, root, "Slipstream narrow teardrop", [[-1.61, 0.15, 0.33, 0.09], [-1.27, 0.66, 0.35, 0.21], [-0.4, 0.71, 0.32, 0.22], [0.64, 0.47, 0.3, 0.24], [1.45, 0.26, 0.27, 0.17], [1.7, 0.015, 0.24, 0.015]], enamel);
      soft(art, root, "asymmetric air scoop shell", [-0.26, 0.46, 1.04], [0.47, 0.34, 0.74], enamel, 0.67);
      soft(art, root, "offset intake mouth", [-0.26, 0.46, 1.405], [0.34, 0.2, 0.039], INK, 0.62);
      art.sweep("curved aft speed fin", [[0.24, 0.37, -1.22], [0.21, 0.71, -1.49], [0.08, 1.2, -1.63], [-0.15, 1.23, -1.4]], [0.14, 0.15, 0.1, 0.004], enamel, root, 12);
      pinstripe(art, root, "mint asymmetric pinstripe", [[0.19, 0.39, 1.49], [0.37, 0.56, 0.79], [0.64, 0.51, -0.12], [0.59, 0.52, -1.12]], "#63cab9", 0.035);
      break;
    case "coil-bug":
      hull(art, root, "Coil Bug rounded utility shell", [[-1.57, 0.12, 0.34, 0.07], [-1.3, 0.73, 0.34, 0.23], [-0.23, 0.73, 0.35, 0.24], [0.93, 0.62, 0.36, 0.3], [1.49, 0.34, 0.37, 0.22], [1.62, 0.04, 0.36, 0.05]], enamel);
      for (const side of [-1, 1]) {
        const points: Triple[] = [];
        for (let i = 0; i <= 56; i++) { const a = i / 56 * Math.PI * 10; points.push([side * 0.73 + Math.cos(a) * 0.055, 0.4 + Math.sin(a) * 0.1, -0.7 + i / 56 * 1.3]); }
        art.tube("visible insulated coil side motif", points, 0.028, "#4faaa9", root);
      }
      soft(art, root, "utility porcelain nose panel", [0, 0.51, 1.26], [0.5, 0.15, 0.4], trim, 0.62);
      for (let i = -1; i <= 1; i++) soft(art, root, "utility amber indicator", [i * 0.125, 0.548, 1.445], [0.08, 0.055, 0.04], accent);
      break;
    case "air-pocket":
      hull(art, root, "Air Pocket inflated flotation shell", [[-1.64, 0.15, 0.35, 0.05], [-1.37, 0.82, 0.35, 0.26], [-0.32, 0.9, 0.35, 0.29], [0.84, 0.74, 0.34, 0.27], [1.44, 0.45, 0.33, 0.23], [1.61, 0.04, 0.32, 0.04]], enamel);
      for (const side of [-1, 1]) {
        pinstripe(art, root, "flotation perimeter seam", [[side * 0.19, 0.42, 1.52], [side * 0.66, 0.49, 1.01], [side * 0.87, 0.48, -0.3], [side * 0.76, 0.46, -1.36]], trim, 0.017);
        pinstripe(art, root, "contrasting rigid flotation rail", [[side * 0.71, 0.22, 1.13], [side * 0.81, 0.2, -0.4], [side * 0.7, 0.2, -1.49]], "#694665", 0.064);
        for (let i = 0; i < 3; i++) soft(art, root, "fabric tension dimple", [side * 0.858, 0.42, -0.62 + i * 0.48], [0.04, 0.07, 0.06], "#718fab");
      }
      soft(art, root, "flotation shell valve", [-0.62, 0.61, -0.89], [0.16, 0.13, 0.16], "#694665", 0.7);
      break;
    case "knuckle-bus":
      hull(art, root, "Knuckle Bus chopped miniature coach", [[-1.67, 0.38, 0.37, 0.12], [-1.43, 0.84, 0.39, 0.25], [-0.1, 0.84, 0.38, 0.24], [0.93, 0.8, 0.43, 0.33], [1.48, 0.68, 0.43, 0.31], [1.62, 0.21, 0.41, 0.12]], enamel, 0.53);
      soft(art, root, "wide bus radiator grille", [0, 0.4, 1.64], [1.12, 0.35, 0.04], INK, 0.56);
      for (let i = 0; i < 4; i++) soft(art, root, "coach horizontal grille", [0, 0.28 + i * 0.077, 1.669], [1, 0.023, 0.023], trim, 0.62);
      for (const side of [-1, 1]) {
        soft(art, root, "coach side step", [side * 0.82, 0.15, -0.08], [0.3, 0.12, 0.74], "#694665", 0.6);
        soft(art, root, "coach inset panel", [side * 0.837, 0.4, -0.36], [0.026, 0.21, 0.76], trim, 0.64);
        soft(art, root, "coach amber marker", [side * 0.57, 0.729, 1.03], [0.12, 0.075, 0.15], accent, 0.7);
      }
      break;
  }
  soft(art, root, "rear standing deck", [0, 0.62, -1.06], [1.54, 0.14, 0.85], "#f9e8be", 0.45);
  for (let i = -2; i <= 2; i++) soft(art, root, "deck rubber grip", [i * 0.23, 0.696, -1.06], [0.085, 0.019, 0.59], "#687d87", 0.7);
  soft(art, root, "seat cushion", [0, 0.61, 0.27], [0.94, 0.18, 0.76], "#657c91", 0.6);
  soft(art, root, "seat back", [0, 0.81, -0.08], [0.94, 0.49, 0.18], "#657c91", 0.6);
  pinstripe(art, root, "tube front bumper", [[-0.81, 0.18, 1.14], [-0.61, 0.22, 1.7], [0.61, 0.22, 1.7], [0.81, 0.18, 1.14]], trim, 0.065);
  pinstripe(art, root, "tube rear bumper", [[-0.76, 0.23, -1.47], [-0.61, 0.25, -1.69], [0.61, 0.25, -1.69], [0.76, 0.23, -1.47]], trim, 0.055);
  pinstripe(art, root, "rear handrail", [[-0.75, 0.57, -1.49], [-0.75, 1, -1.49], [0.75, 1, -1.49], [0.75, 0.57, -1.49]], accent, 0.041);
  const lampZ = id === "velvet-hammer" || id === "knuckle-bus" ? 1.59 : 1.36;
  for (const side of [-1, 1]) {
    pinstripe(art, root, "rear side grip", [[side * 0.55, 0.66, -1.35], [side * 0.55, 1.02, -1.35], [side * 0.55, 1.02, -0.85]], accent, 0.042);
    soft(art, root, "headlight enamel bezel", [side * 0.49, 0.45, lampZ], [0.25, 0.21, 0.22], INK, 0.65);
    soft(art, root, "porcelain headlight lens", [side * 0.49, 0.45, lampZ + 0.105], [0.19, 0.15, 0.049], trim, 0.75);
    soft(art, root, "tail lamp", [side * 0.58, 0.4, -1.511], [0.16, 0.1, 0.055], "#ff8051", 0.65);
  }
  if (decal !== "plain") for (const side of [-1, 1]) {
    const x = side * 0.877;
    // Decal plates follow the universal side mount, clear of variable sculpted noses.
    soft(art, root, "enamel decal plate", [x, 0.405, -0.25], [0.032, 0.28, 0.63], INK, 0.65);
    const face = x + side * 0.019;
    if (decal === "checks") {
      for (let y = 0; y < 2; y++) for (let z = 0; z < 4; z++) if ((y + z) % 2 === 0) art.box("checker decal", [face, 0.347 + y * 0.114, -0.445 + z * 0.13], [0.003, 0.11, 0.125], trim, root);
    } else {
      const points: Triple[] = decal === "bolt"
        ? [[face, 0.51, -0.4], [face, 0.405, -0.24], [face, 0.405, -0.36], [face, 0.3, -0.1]]
        : [[face, 0.51, -0.4], [face, 0.405, -0.24], [face, 0.3, -0.4]];
      art.tube(`${decal} decal`, points, 0.024, decal === "bolt" ? accent : trim, root);
      if (decal === "chevrons") art.tube("second chevron decal", points.map(([px, py, pz]) => [px, py, pz + 0.22]), 0.024, trim, root);
    }
  }
  return palette;
}
