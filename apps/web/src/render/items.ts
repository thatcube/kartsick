import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { ItemId } from "@kartsick/content";
import { Atelier } from "./geometry";
import type { Triple } from "./geometry";
import { node, soft } from "./characters/rig";

const INK = "#30394f", CREAM = "#f5f2e8", MINT = "#5bd1c4", ORANGE = "#ff8051", GOLD = "#ffd46b", PLUM = "#694665";

function torus(art: Atelier, root: TransformNode, name: string, position: Triple, diameter: number, thickness: number, color: string) {
  return art.place(MeshBuilder.CreateTorus(name, { diameter, thickness, tessellation: 24 }, art.scene), position, art.material(color), root);
}

function glow(art: Atelier, root: TransformNode, name: string, position: Triple, size: Triple, color: string) {
  const mesh = soft(art, root, name, position, size, color);
  mesh.material = art.material(color, true);
  return mesh;
}

function coil(art: Atelier, root: TransformNode, position: Triple, length: number, radius: number, color: string) {
  const points: Triple[] = [];
  for (let i = 0; i <= 64; i++) {
    const angle = i / 64 * Math.PI * 10;
    points.push([position[0] + Math.cos(angle) * radius, position[1] + Math.sin(angle) * radius, position[2] + i / 64 * length]);
  }
  art.tube("five-turn insulated coil", points, 0.024, color, root);
}

function boost(art: Atelier, root: TransformNode, rapid: boolean) {
  art.sculpt(rapid ? "rapid bellows reservoir" : "squeeze boost canister", [[-0.35, 0.09, 0.09], [-0.29, 0.2, 0.18], [0.04, 0.22, 0.18], [0.22, 0.17, 0.14], [0.28, 0.09, 0.085]], rapid ? ORANGE : MINT, root, 0.7);
  for (let i = 0; i < (rapid ? 5 : 2); i++) torus(art, root, "bellows compression rib", [0, -0.22 + i * (rapid ? 0.081 : 0.3), 0], rapid ? 0.38 : 0.34, 0.034, CREAM);
  art.sweep("bent boost spout", [[0, 0.23, 0], [0, 0.37, 0.01], [0, 0.38, 0.16]], [0.066, 0.06, 0.045], INK, root);
  glow(art, root, "boost spout tell", [0, 0.38, 0.21], [0.07, 0.07, 0.14], GOLD);
  art.sweep("embossed forward arrow", [[-0.085, -0.03, 0.183], [0, 0.11, 0.19], [0.085, -0.03, 0.183]], [0.016, 0.016, 0.016], CREAM, root);
}

function barrier(art: Atelier, root: TransformNode) {
  soft(art, root, "foldable upholstered roadwork board", [0, 0.08, 0], [0.86, 0.31, 0.14], GOLD, 0.62);
  for (let i = -2; i <= 2; i++) {
    const stripe = soft(art, root, "diagonal construction warning stripe", [i * 0.16, 0.08, 0.078], [0.074, 0.28, 0.018], INK, 0.68);
    stripe.rotation.z = -0.35;
  }
  for (const side of [-1, 1]) {
    art.tube("folding construction A frame", [[side * 0.31, -0.26, -0.2], [side * 0.31, 0.15, 0], [side * 0.31, -0.26, 0.2]], 0.03, "#91a7a8", root);
    const wheel = art.cylinder("tiny barrier roller", [side * 0.34, -0.27, 0.03], 0.18, 0.18, 0.085, INK, root);
    wheel.rotation.z = Math.PI / 2;
  }
  glow(art, root, "amber roadwork beacon", [0, 0.3, 0], [0.13, 0.15, 0.13], ORANGE);
}

function cushion(art: Atelier, root: TransformNode) {
  art.sculpt("upholstered rebound bumper", [[-0.29, 0.12, 0.08], [-0.23, 0.32, 0.19], [0, 0.36, 0.22], [0.23, 0.31, 0.19], [0.29, 0.1, 0.07]], "#b49acf", root, 0.66);
  art.sweep("cushion bound piping", [[-0.24, -0.2, 0.125], [-0.3, 0, 0.155], [-0.24, 0.2, 0.125], [0.24, 0.2, 0.125], [0.3, 0, 0.155], [0.24, -0.2, 0.125], [-0.24, -0.2, 0.125]], [0.017, 0.017, 0.017, 0.017, 0.017, 0.017, 0.017], CREAM, root);
  soft(art, root, "tufted central button", [0, 0, 0.217], [0.11, 0.11, 0.021], GOLD);
  for (const side of [-1, 1]) art.tube("cushion return chevron", [[side * 0.09, -0.09, -0.218], [side * 0.18, 0, -0.221], [side * 0.09, 0.09, -0.218]], 0.013, CREAM, root);
}

function staticSling(art: Atelier, root: TransformNode) {
  soft(art, root, "static sling base", [0, -0.14, -0.06], [0.66, 0.16, 0.62], INK, 0.65);
  coil(art, root, [0, 0, -0.28], 0.58, 0.21, MINT);
  const rim = torus(art, root, "striped forward field rim", [0, 0, 0.31], 0.5, 0.055, CREAM);
  rim.rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) glow(art, root, "countable static charge segment", [side * 0.24, 0.19, -0.16], [0.13, 0.25, 0.25], GOLD);
}

function inflatable(art: Atelier, root: TransformNode) {
  soft(art, root, "obvious inflatable kart ring", [0, -0.18, 0], [0.82, 0.25, 0.88], "#b4dbe7", 0.7);
  art.sculpt("wobbly inflated rider", [[-0.17, 0.1, 0.1], [-0.02, 0.18, 0.15], [0.17, 0.2, 0.16], [0.27, 0.12, 0.12], [0.31, 0.03, 0.03]], "#e7d59d", root);
  soft(art, root, "second lopsided inflatable rider", [0, 0.05, -0.26], [0.32, 0.51, 0.24], "#d9b9d9", 0.76).rotation.z = 0.18;
  for (let i = 0; i < 3; i++) {
    soft(art, root, "conspicuous striped decoy back", [0, -0.03 + i * 0.085, -0.39], [0.25, 0.039, 0.025], PLUM, 0.7);
    soft(art, root, "striped inflatable flank", [0.388, -0.18, -0.22 + i * 0.2], [0.025, 0.17, 0.075], MINT, 0.7);
  }
  for (const side of [-1, 1]) {
    for (const z of [-0.25, 0.26]) soft(art, root, "painted inflatable wheel", [side * 0.36, -0.24, z], [0.16, 0.26, 0.26], PLUM);
    soft(art, root, "printed decoy eye", [side * 0.055, 0.17, 0.15], [0.035, 0.025, 0.016], INK);
  }
  const valve = art.cylinder("oversized unmistakable inflation valve", [0.32, 0.01, -0.18], 0.13, 0.16, 0.18, ORANGE, root);
  valve.rotation.z = -0.65;
  soft(art, root, "inflation valve plug", [0.385, 0.11, -0.18], [0.18, 0.065, 0.18], INK, 0.7);
  art.sweep("inflatable heat-sealed seam", [[-0.26, -0.07, -0.29], [-0.35, -0.075, 0.17], [0, -0.075, 0.41], [0.35, -0.075, 0.17], [0.26, -0.07, -0.29]], [0.009, 0.009, 0.009, 0.009, 0.009], CREAM, root);
}

function shape(art: Atelier, root: TransformNode, id: ItemId): void {
  switch (id) {
    case "slip":
      soft(art, root, "flat waxed slip cloth", [0, -0.15, 0], [0.85, 0.08, 0.68], "#ddb86e", 0.55).rotation.y = 0.17;
      art.sculpt("squashed polishing wax pouch", [[-0.15, 0.25, 0.21], [-0.09, 0.29, 0.23], [0.08, 0.19, 0.14], [0.14, 0.07, 0.045]], ORANGE, root, 0.7);
      art.tube("pouch folded crimp", [[-0.12, 0.13, 0], [0, 0.18, 0.025], [0.12, 0.13, 0]], 0.025, CREAM, root);
      art.tube("slip crossed warning", [[-0.08, -0.005, 0.218], [0.08, 0.08, 0.154]], 0.022, INK, root);
      break;
    case "bounce":
      soft(art, root, "rounded carom rubber cube", [0, 0, 0], [0.59, 0.56, 0.59], MINT, 0.6);
      for (const z of [-1, 1]) {
        const band = torus(art, root, "carom impact ring", [0, 0, z * 0.2], 0.48, 0.055, CREAM); band.rotation.x = Math.PI / 2;
      }
      for (const side of [-1, 1]) soft(art, root, "carom impact pad", [side * 0.29, 0, 0], [0.075, 0.21, 0.24], INK, 0.64);
      break;
    case "homing":
      art.sweep("compass dart body", [[0, 0, -0.35], [0, 0, -0.1], [0, 0, 0.22], [0, 0, 0.43]], [0.06, 0.18, 0.12, 0.002], "#b49acf", root, 12);
      for (const side of [-1, 1]) {
        art.sweep("split arrow tail fin", [[0, 0, -0.17], [side * 0.32, 0.055, -0.26], [side * 0.34, 0.07, -0.39]], [0.06, 0.09, 0.005], CREAM, root);
      }
      torus(art, root, "homing compass gimbal", [0, 0.05, -0.05], 0.48, 0.027, GOLD).rotation.x = 0.5;
      glow(art, root, "homing direction lens", [0, 0.16, 0.09], [0.1, 0.09, 0.12], MINT);
      break;
    case "leader":
      art.sculpt("leader ceremonial beacon", [[-0.28, 0.13, 0.13], [-0.16, 0.24, 0.24], [0.15, 0.22, 0.22], [0.27, 0.09, 0.09]], "#3445a8", root, 0.67);
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * Math.PI * 2;
        art.sweep("leader tracking outrigger", [[Math.cos(a) * 0.14, 0.1, Math.sin(a) * 0.14], [Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35], [Math.cos(a) * 0.29, -0.31, Math.sin(a) * 0.29]], [0.04, 0.055, 0.01], CREAM, root);
      }
      torus(art, root, "leader halo", [0, 0.32, 0], 0.53, 0.035, GOLD);
      glow(art, root, "leader beacon lamp", [0, 0.2, 0], [0.22, 0.25, 0.22], ORANGE);
      break;
    case "bomb":
      art.sculpt("ceramic timer bell", [[-0.31, 0.13, 0.13], [-0.24, 0.28, 0.28], [0.06, 0.26, 0.26], [0.26, 0.12, 0.12]], ORANGE, root, 0.83);
      torus(art, root, "bomb warning seam", [0, -0.17, 0], 0.52, 0.04, INK);
      art.tube("bomb wound fuse", [[0, 0.24, 0], [0.03, 0.38, 0], [0.14, 0.4, 0]], 0.025, INK, root);
      glow(art, root, "burning fuse tell", [0.145, 0.4, 0], [0.1, 0.1, 0.1], GOLD);
      soft(art, root, "timer ivory face", [0, 0, 0.257], [0.27, 0.27, 0.031], CREAM);
      art.tube("timer hand", [[0, -0.065, 0.281], [0, 0, 0.286], [0.055, 0.065, 0.28]], 0.013, INK, root);
      break;
    case "boost": boost(art, root, false); break;
    case "rapid-boost": boost(art, root, true); break;
    case "triple-slip": case "triple-bounce": case "triple-homing": case "triple-boost": {
      const single = id.slice(7) as "slip" | "bounce" | "homing" | "boost";
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * Math.PI * 2;
        const part = node(art, `countable ${single} ${i + 1}`, root, [Math.cos(a) * 0.28, i === 0 ? 0.12 : -0.07, Math.sin(a) * 0.28]);
        part.scaling.setAll(0.57);
        shape(art, part, single);
      }
      break;
    }
    case "invincible":
      torus(art, root, "invincible rosette rim", [0, 0, 0], 0.53, 0.045, GOLD).rotation.x = Math.PI / 2;
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2;
        const petal = soft(art, root, "radiant rosette petal", [Math.sin(a) * 0.24, Math.cos(a) * 0.24, 0], [0.15, 0.34, 0.11], i % 2 ? MINT : GOLD);
        petal.rotation.z = -a;
      }
      glow(art, root, "rosette porcelain heart", [0, 0, 0.08], [0.26, 0.26, 0.12], CREAM);
      break;
    case "shrink":
      art.sweep("shrinking measuring caliper", [[-0.26, 0.2, 0.09], [-0.32, 0.3, 0], [-0.28, -0.24, 0], [0.28, -0.24, 0], [0.32, 0.3, 0], [0.26, 0.2, 0.09]], [0.055, 0.055, 0.055, 0.055, 0.055, 0.055], "#b49acf", root);
      for (const side of [-1, 1]) art.tube("inward shrink arrow", [[side * 0.22, -0.08, 0.08], [side * 0.1, 0, 0.08], [side * 0.22, 0.08, 0.08]], 0.028, GOLD, root);
      soft(art, root, "small measured toy", [0, 0.01, 0], [0.1, 0.12, 0.1], MINT, 0.64);
      break;
    case "autopilot":
      art.sweep("wind-up tow bird", [[0, 0, -0.33], [0, 0.02, -0.1], [0, 0.04, 0.23], [0, 0.06, 0.43]], [0.025, 0.14, 0.16, 0.007], ORANGE, root, 12);
      for (const side of [-1, 1]) {
        art.sweep("tow bird folded wing", [[side * 0.06, 0, 0.05], [side * 0.36, 0.08, -0.04], [side * 0.41, 0.03, -0.25]], [0.065, 0.08, 0.005], CREAM, root);
        soft(art, root, "bird navigation eye", [side * 0.125, 0.09, 0.18], [0.055, 0.07, 0.075], INK);
      }
      torus(art, root, "wind-up key loop", [0, 0.25, -0.13], 0.2, 0.034, GOLD).rotation.x = Math.PI / 2;
      break;
    case "vision":
      soft(art, root, "folding haze visor frame", [0, 0, 0], [0.75, 0.35, 0.11], "#b49acf", 0.62);
      soft(art, root, "visor pale mesh", [0, 0, 0.061], [0.63, 0.23, 0.023], "#d1e5d7", 0.7);
      for (let i = -2; i <= 2; i++) art.tube("visor visible mesh slat", [[i * 0.11, -0.105, 0.08], [i * 0.11 + 0.045, 0.1, 0.08]], 0.01, MINT, root);
      art.sweep("elastic visor strap", [[-0.36, 0, 0], [-0.3, 0, -0.26], [0.3, 0, -0.26], [0.36, 0, 0]], [0.018, 0.018, 0.018, 0.018], INK, root);
      break;
    case "theft":
      art.sculpt("floating handkerchief thief", [[-0.3, 0.26, 0.17], [-0.2, 0.17, 0.14, -0.045], [0.04, 0.24, 0.2], [0.28, 0.13, 0.13], [0.34, 0.03, 0.03]], "#d6e5e9", root);
      for (const side of [-1, 1]) {
        soft(art, root, "stitched thief eye", [side * 0.07, 0.12, 0.19], [0.057, 0.041, 0.023], "#537088", 0.6);
        art.sweep("handkerchief reaching corner", [[side * 0.18, -0.07, 0], [side * 0.36, 0, 0.07], [side * 0.3, 0.05, 0.19]], [0.065, 0.04, 0.009], "#d6e5e9", root);
      }
      torus(art, root, "stolen brass keyring", [0.28, 0.07, 0.22], 0.19, 0.025, GOLD).rotation.x = Math.PI / 2;
      break;
    case "fire":
      for (let i = -1; i <= 1; i++) art.sweep("curved fire pennant", [[i * 0.13, -0.22, 0], [i * 0.15, -0.02, 0.025], [i * 0.1 + 0.1, 0.21 + (i === 0 ? 0.14 : 0), 0], [i * 0.13, 0.31 + (i === 0 ? 0.14 : 0), -0.06]], [0.13, 0.12, 0.065, 0.004], i === 0 ? GOLD : ORANGE, root, 10);
      glow(art, root, "fire bright core", [0, -0.06, 0.1], [0.19, 0.28, 0.11], CREAM);
      break;
    case "returning":
      art.sweep("returning brass tuning fork", [[-0.35, 0.08, 0.24], [-0.21, 0, -0.2], [0, 0, -0.31], [0.21, 0, -0.2], [0.35, 0.08, 0.24]], [0.034, 0.085, 0.095, 0.085, 0.034], GOLD, root, 12);
      for (const side of [-1, 1]) soft(art, root, "returning fork rubber tip", [side * 0.35, 0.08, 0.22], [0.15, 0.13, 0.23], MINT, 0.65);
      break;
    case "shockwave":
      for (let i = 0; i < 3; i++) torus(art, root, "concentric defensive tuning ring", [0, i * 0.06 - 0.06, 0], 0.31 + i * 0.24, 0.034, i % 2 ? MINT : CREAM);
      soft(art, root, "shockwave tuning bell", [0, 0.02, 0], [0.26, 0.27, 0.26], "#3445a8");
      glow(art, root, "shockwave resonator", [0, 0.17, 0], [0.13, 0.13, 0.13], GOLD);
      break;
    case "roadwork": barrier(art, root); break;
    case "velvet": cushion(art, root); break;
    case "static": staticSling(art, root); break;
    case "doubles": inflatable(art, root); break;
  }
}

/**
 * Original, unanimated 0.5–1 m item/effect source. Origin is the effect center, +Z forward.
 * Roadwork/velvet/doubles each represent ONE authoritative barrier/bumper/decoy;
 * spawn the authoritative count, never extra visual racers. Triple IDs show three charges.
 * Dispose the returned root recursively, without disposing shared Atelier materials.
 */
export function makeItemVisual(art: Atelier, id: ItemId): TransformNode {
  const root = node(art, `item:${id}`);
  root.metadata = { kind: "item", itemId: id };
  shape(art, root, id);
  art.batchModel(root, new Set(), true);
  return root;
}

/** Closed, flat-faced enamel with broad chamfers that catch the track's real lighting. */
function parcelBlock(art: Atelier, root: TransformNode, name: string, position: Triple, size: Triple, color: string, corner = 0.08, bevel = 0.018) {
  const [width, height, depth] = size.map(value => value / 2);
  const edge = Math.min(bevel, depth * 0.45, width * 0.3, height * 0.3);
  const cut = Math.min(corner, width * 0.6, height * 0.6);
  const ring = (inset: number, z: number): Triple[] => {
    const x = width - inset, y = height - inset, c = Math.max(0.002, cut - inset * 0.4);
    return [[-x + c, -y, z], [x - c, -y, z], [x, -y + c, z], [x, y - c, z],
      [x - c, y, z], [-x + c, y, z], [-x, y - c, z], [-x, -y + c, z]];
  };
  const rings = [ring(edge, depth), ring(0, depth - edge), ring(0, -depth + edge), ring(edge, -depth)];
  const positions: number[] = [], indices: number[] = [];
  const face = (points: Triple[]) => {
    const start = positions.length / 3;
    for (const point of points) positions.push(...point);
    for (let i = 1; i < points.length - 1; i++) indices.push(start, start + i, start + i + 1);
  };
  for (let row = 0; row < rings.length - 1; row++) for (let side = 0; side < 8; side++) {
    const next = (side + 1) % 8;
    face([rings[row][side], rings[row][next], rings[row + 1][next], rings[row + 1][side]]);
  }
  face([...rings[0]].reverse());
  face(rings[3]);
  return art.place(art.mesh(name, positions, indices), position, art.material(color), root);
}

/**
 * Original brass-trimmed delivery-reel case, 1.72 × 1.541 × 1.41 m (W/H/D).
 * Origin is the case center, with the handle extending above the enamel body.
 * +Z and -Z carry matching readable stamps, with side spindles for a full-turn silhouette.
 * Animate bob/spin/pop/respawn on the root, not shared materials. `pickup:lamps` owns
 * the one emissive batch (mesh visibility may pulse); `pickup:burst` and `pickup:handle`
 * are geometry-free attachment anchors. Dispose recursively without shared materials.
 */
export function makePickupBox(art: Atelier): TransformNode {
  const root = node(art, "Belltumble item parcel");
  root.metadata = { kind: "pickup", visual: "delivery-reel", forward: "+Z", stampFaces: 2, reelWindows: 3 };
  const enamel = "#287f83", lid = "#42a9a5", shadow = "#204b56", brass = "#cf9a4f", edge = "#f2cc83", paper = "#fff0cf";
  const lamps = node(art, "pickup:lamps", root);
  lamps.metadata = { kind: "pickup-highlight", animation: "mesh-visibility" };
  node(art, "pickup:burst", root).metadata = { kind: "pickup-attachment" };
  node(art, "pickup:handle", root, [0, 0.83, 0]).metadata = { kind: "pickup-attachment" };

  parcelBlock(art, root, "faceted deep lagoon enamel case", [0, 0, 0], [1.64, 1.18, 1.12], enamel, 0.16, 0.07);
  parcelBlock(art, root, "recessed case lid seam", [0, 0.39, 0], [1.64, 0.055, 1.12], shadow, 0.14);
  parcelBlock(art, root, "lighter enamel domed lid", [0, 0.48, 0], [1.61, 0.21, 1.10], lid, 0.1, 0.038);
  for (const side of [-1, 1]) {
    parcelBlock(art, root, "brass parcel strap across lid", [side * 0.48, 0.587, 0], [0.14, 0.045, 1.02], brass, 0.025);
    parcelBlock(art, root, "brass parcel strap under case", [side * 0.48, -0.583, 0], [0.14, 0.045, 1.02], brass, 0.025);
    for (const end of [-1, 1]) for (const top of [-1, 1]) {
      parcelBlock(art, root, "chamfered brass corner shoe", [side * 0.72, top * 0.48, end * 0.49], [0.26, 0.25, 0.22], brass, 0.075, 0.03);
      art.oval("corner shoe ivory rivet", [side * 0.72, top * 0.48, end * 0.607], [0.055, 0.055, 0.021], edge, root, 1, 6);
    }
    const hub = art.cylinder("brass delivery reel spindle", [side * 0.809, 0.015, 0], 0.4, 0.4, 0.054, brass, root);
    hub.rotation.z = Math.PI / 2;
    const inset = art.cylinder("reel spindle dark inset", [side * 0.839, 0.015, 0], 0.27, 0.27, 0.012, shadow, root);
    inset.rotation.z = Math.PI / 2;
    art.oval("side spindle porcelain key", [side * 0.849, 0.015, 0], [0.022, 0.16, 0.065], paper, root, 0.55, 6);
  }

  for (const side of [-1, 1]) {
    const z = (depth: number) => side * depth;
    parcelBlock(art, root, "brass three-reel face bezel", [0, 0, z(0.567)], [1.43, 0.98, 0.065], brass, 0.12);
    parcelBlock(art, root, "ink recessed reel bed", [0, 0, z(0.607)], [1.31, 0.86, 0.045], shadow, 0.085);
    for (const column of [-1, 0, 1]) {
      const x = column * 0.435;
      parcelBlock(art, root, "porcelain delivery reel ticket", [x, 0.07, z(0.638)], [column === 0 ? 0.49 : 0.28, 0.61, 0.031], paper, 0.038, 0.008);
      for (const y of [-0.185, 0.325]) {
        art.box("ticket edge impression", [x, y, z(0.657)], [column === 0 ? 0.33 : 0.15, 0.018, 0.01], brass, root);
      }
      if (column !== 0) {
        soft(art, root, "bold reel pip", [x, 0.07, z(0.664)], [0.13, 0.13, 0.028], enamel);
      }
      art.oval("amber indicator socket", [column * 0.31, -0.329, z(0.633)], [0.17, 0.10, 0.029], brass, root, 0.5, 6);
      const lamp = art.oval("small warm delivery-ready lamp", [column * 0.31, -0.329, z(0.651)], [0.098, 0.042, 0.013], "#ffd793", lamps, 1, 6);
      lamp.material = art.material("#ffd793", true);
    }
    parcelBlock(art, root, "embossed envelope stamp", [0, 0.095, z(0.665)], [0.35, 0.245, 0.025], enamel, 0.027, 0.005);
    art.tube("clear folded envelope flap", [[-0.151, 0.186, z(0.686)], [0, 0.065, z(0.688)], [0.151, 0.186, z(0.686)]], 0.017, paper, root);
    soft(art, root, "copper delivery wax seal", [0, -0.104, z(0.672)], [0.105, 0.105, 0.027], ORANGE);
    art.box("wax seal stamped dash", [0, -0.104, z(0.689)], [0.045, 0.016, 0.009], paper, root);
    art.box("bezel upper highlight", [0, 0.457, z(0.606)], [0.89, 0.019, 0.014], edge, root);
  }

  for (const side of [-1, 1]) {
    parcelBlock(art, root, "handle brass mounting foot", [side * 0.265, 0.606, 0], [0.21, 0.085, 0.22], brass, 0.03);
  }
  art.tube("raised brass courier handle", [[-0.265, 0.61, 0], [-0.265, 0.8, 0], [-0.18, 0.885, 0], [0.18, 0.885, 0], [0.265, 0.8, 0], [0.265, 0.61, 0]], 0.045, brass, root);
  parcelBlock(art, root, "stitched ink handle grip", [0, 0.885, 0], [0.35, 0.10, 0.12], shadow, 0.035);
  art.box("handle grip light stitch", [0, 0.904, 0.063], [0.22, 0.012, 0.009], paper, root);
  art.batchModel(root, new Set(), true);
  return root;
}
