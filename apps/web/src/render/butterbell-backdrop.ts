import { terrainHeight } from "@kartsick/content";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { ButterbellArt } from "./butterbell-art";
import { BUTTERBELL as C, butterbellNoise as noise } from "./butterbell-materials";
import type { Triple } from "./geometry";

export const BUTTERBELL_HORIZON_STEPS = 240;
export const BUTTERBELL_HORIZON_ROWS = 28;
const HORIZON_SPACING = 23;

function countrysideElevation(x: number, z: number): number {
  const outward = Math.max(0, Math.abs(x) - 240, Math.abs(z) - 250);
  const envelope = Math.sin(Math.min(1, outward / 230) * Math.PI / 2) ** 2;
  const rolling = 30 + 19 * Math.sin(x * .012 + Math.sin(z * .009))
    + 16 * Math.cos(z * .015 - Math.sin(x * .007)) + 9 * Math.sin((x + z) * .026);
  return terrainHeight(x, z) + envelope * rolling;
}

export function butterbellCountrysideVertex(row: number, column: number): Triple {
  const angle = column / BUTTERBELL_HORIZON_STEPS * Math.PI * 2;
  const edge = 1 / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
  const outward = row * HORIZON_SPACING;
  const x = Math.cos(angle) * edge * (240 + outward), z = Math.sin(angle) * edge * (250 + outward);
  return [x, countrysideElevation(x, z), z];
}

/** Ground props on the actual coarse hillside triangles, not an unsampled smooth hill. */
export function butterbellCountrysideHeight(x: number, z: number): number {
  const outward = Math.max(Math.abs(x) - 240, Math.abs(z) - 250);
  if (outward <= 0 || outward >= BUTTERBELL_HORIZON_ROWS * HORIZON_SPACING) return countrysideElevation(x, z);
  const row = Math.floor(outward / HORIZON_SPACING);
  const angle = (Math.atan2(z / (250 + outward), x / (240 + outward)) + Math.PI * 2) % (Math.PI * 2);
  const column = Math.floor(angle / (Math.PI * 2) * BUTTERBELL_HORIZON_STEPS);
  const a = butterbellCountrysideVertex(row, column), b = butterbellCountrysideVertex(row + 1, column);
  const c = butterbellCountrysideVertex(row, column + 1), d = butterbellCountrysideVertex(row + 1, column + 1);
  const height = (p: Triple, q: Triple, r: Triple) => {
    const determinant = (q[2] - r[2]) * (p[0] - r[0]) + (r[0] - q[0]) * (p[2] - r[2]);
    const u = ((q[2] - r[2]) * (x - r[0]) + (r[0] - q[0]) * (z - r[2])) / determinant;
    const v = ((r[2] - p[2]) * (x - r[0]) + (p[0] - r[0]) * (z - r[2])) / determinant;
    return { inside: u >= -1e-7 && v >= -1e-7 && u + v <= 1 + 1e-7, y: u * p[1] + v * q[1] + (1 - u - v) * r[1] };
  };
  const first = height(a, b, c);
  return first.inside ? first.y : height(c, b, d).y;
}

/** The valley's distant dairy hamlet is entirely beyond the recovery boundary. */
export function butterbellDairyHamlet(art: ButterbellArt): void {
  const cottages = [[-45, 305, .35], [-32, 287, .65], [-22, 313, -.2], [-10, 289, .25], [-3, 326, -.4],
    [8, 306, .2], [25, 316, -.4], [38, 285, -.45], [46, 310, .3], [57, 330, -.1], [71, 308, -.55]];
  for (let house = 0; house < cottages.length; house++) {
    const [x, localZ, yaw] = cottages[house], z = localZ + 90, existing = new Set(art.art.scene.meshes);
    const width = 8 + noise(house + 11) * 3, depth = 10 + noise(house + 21) * 4;
    const height = 5.5 + noise(house + 61) * 2.5;
    const y = butterbellCountrysideHeight(x, z);
    const color = house % 3 === 0 ? C.cream : house % 3 === 1 ? C.dairy : "#dfa25f";
    const wall = art.box("distant dairy cottage", [x, y + height / 2, z], [width, height, depth], color, "wood");
    wall.metadata = { beyondRecoveryBounds: true };
    const corners = [[-width / 2, -depth / 2], [width / 2, -depth / 2],
      [width / 2, depth / 2], [-width / 2, depth / 2], [-width / 2, -depth / 2]];
    const foundation: number[] = [], foundationIndices: number[] = [];
    for (const [dx, dz] of corners) {
      const worldX = x + Math.cos(yaw) * dx + Math.sin(yaw) * dz;
      const worldZ = z - Math.sin(yaw) * dx + Math.cos(yaw) * dz;
      foundation.push(x + dx, Math.min(y + 1.27, butterbellCountrysideHeight(worldX, worldZ) - .08), z + dz,
        x + dx, y + 1.3, z + dz);
    }
    for (let edge = 0; edge < 4; edge++) {
      const a = edge * 2;
      foundationIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    art.mesh("distant cottage fitted footing", foundation, foundationIndices, art.art.material("#ad9977"));
    const roof = [[-width / 2 - .5, height], [0, height + 3.2], [width / 2 + .5, height]];
    const positions: number[] = [], indices: number[] = [];
    for (let panel = 0; panel < 2; panel++) {
      const base = positions.length / 3;
      for (const dz of [-depth / 2 - .5, depth / 2 + .5]) for (const [dx, dy] of [roof[panel], roof[panel + 1]]) {
        positions.push(x + dx, y + dy, z + dz);
      }
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    art.mesh("distant slate cottage roof", positions, indices, art.art.surface(C.roofShadow, "paint"));
    for (const side of [-1, 1]) {
      const face = z + side * depth / 2;
      art.mesh("distant cottage gable", [x - width / 2, y + height, face, x, y + height + 3.2, face,
        x + width / 2, y + height, face], side < 0 ? [0, 2, 1] : [0, 1, 2], art.art.surface(color, "wood"));
      art.tube("distant cottage ivory fascia", roof.map(([dx, dy]): Triple =>
        [x + dx, y + dy, z + side * (depth / 2 + .5)]), .13, C.cream, "paint");
      art.box("distant cottage door", [x, y + 1.6, face + side * .03], [1.5, 3.2, .09], C.roofShadow, "wood");
      for (const edge of [-1, 1]) {
        art.box("distant cottage corner board", [x + edge * (width / 2 - .15), y + height / 2, face],
          [.2, height, .17], C.cream, "paint");
        art.box("distant cottage window frame", [x + edge * width * .3, y + height * .58, face + side * .045],
          [1.7, 1.9, .12], C.cream, "paint");
        art.box("distant cottage window glass", [x + edge * width * .3, y + height * .58, face + side * .13],
          [1.3, 1.5, .08], C.roofShadow, "paint");
      }
    }
    art.box("distant cottage chimney", [x + width * .29, y + height + 1.9, z + depth * .2],
      [.9, 3, .9], "#b09b7b");
    art.box("distant cottage chimney cap", [x + width * .29, y + height + 3.42, z + depth * .2],
      [1.2, .18, 1.2], C.cream);
    for (const side of [-1, 1]) {
      art.box("distant cottage side eave", [x + side * (width / 2 + .25), y + height, z],
        [.28, .24, depth + 1], C.cream, "paint");
      for (const bay of [-1, 1]) {
        art.box("distant cottage side window", [x + side * (width / 2 + .045), y + height * .58, z + bay * depth * .24],
          [.12, 1.9, 1.65], C.cream, "paint");
        art.box("distant cottage side pane", [x + side * (width / 2 + .13), y + height * .58, z + bay * depth * .24],
          [.08, 1.48, 1.21], C.roofShadow, "paint");
      }
    }
    if (house === 5) {
      art.box("valley dairy bell tower", [x, y + height + 3.9, z], [3.2, 4.4, 3.2], C.cream, "paint");
      art.box("valley bell arch shadow", [x, y + height + 4.5, z - 1.63], [1.7, 2.2, .1], C.roofShadow);
      art.cylinder("valley brass bell", [x, y + height + 4.3, z - 1.73], .3, 1, 1, C.straw, "metal");
      art.cylinder("valley copper roof", [x, y + height + 7.2, z], .1, 5.2, 2.4, C.roof, "paint");
    }
    const root = art.root(x, z), pivot = new TransformNode("distant cottage orientation", art.art.scene);
    pivot.parent = root;
    pivot.position.set(x, y, z);
    const pieces = art.art.scene.meshes.filter(mesh => !existing.has(mesh));
    for (const mesh of pieces) mesh.setParent(pivot);
    pivot.rotation.y = yaw;
    pivot.computeWorldMatrix(true);
    for (const mesh of pieces) mesh.setParent(root);
    pivot.dispose();
  }
  const positions: number[] = [], indices: number[] = [];
  for (let i = 0; i <= 44; i++) {
    const x = -57 + i * 3.15, z = 389 + Math.sin(i * .19) * 8;
    for (const side of [-1, 1]) positions.push(x, butterbellCountrysideHeight(x, z + side * 2.5) + .065, z + side * 2.5);
    if (i) {
      const a = i * 2;
      indices.push(a - 2, a, a - 1, a - 1, a, a + 1);
    }
  }
  art.mesh("distant dairy lane", positions, indices, art.art.material("#b6a17b"));
}
