import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { terrainHeight, WINDMILL } from "@kartsick/content";
import type { Triple } from "./geometry";
import { ButterbellArt } from "./butterbell-art";
import { BUTTERBELL as C } from "./butterbell-materials";
import type { ButterbellMaterials } from "./butterbell-materials";

export function butterbellBarn(art: ButterbellArt, material: ButterbellMaterials, x: number, z: number): void {
  const y = terrainHeight(x, z);
  const body = art.box("barn collider siding", [x, y + 3.6, z], [14, 7.2, 12], C.dairy);
  body.material = material.siding;
  art.box("barn stone footing", [x, y + .25, z], [14.5, .5, 12.5], "#c0b393");
  const footing: number[] = [], footingIndices: number[] = [];
  const corners = [[-7.25, -6.25], [7.25, -6.25], [7.25, 6.25], [-7.25, 6.25], [-7.25, -6.25]];
  for (const [dx, dz] of corners) {
    const bottom = Math.min(terrainHeight(x + dx, z + dz) - .04, y + .45);
    footing.push(x + dx, bottom, z + dz, x + dx, y + .5, z + dz);
  }
  for (let edge = 0; edge < 4; edge++) {
    const n = edge * 2;
    footingIndices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
  }
  art.mesh("terrain fitted barn foundation", footing, footingIndices, art.art.material("#c0b393"));
  const profile: readonly (readonly [number, number])[] = [[-7.45, 7], [-4, 10.2], [0, 11.4], [4, 10.2], [7.45, 7]];
  const positions: number[] = [], indices: number[] = [], uv: number[] = [];
  for (let panel = 0; panel < profile.length - 1; panel++) {
    const a = profile[panel], b = profile[panel + 1], base = positions.length / 3;
    for (const depth of [-6.35, 6.35]) for (const point of [a, b]) {
      positions.push(x + point[0], y + point[1], z + depth);
      uv.push((depth + 6.35) / 4, point === a ? 0 : 1);
    }
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  art.mesh("standing seam gambrel roof", positions, indices, material.roof, undefined, uv);
  for (const side of [-1, 1]) {
    const face = z + side * 6.015;
    art.mesh("barn gambrel gable", [
      x - 7, y + 7, face, x - 4, y + 10.2, face, x, y + 11.4, face,
      x + 4, y + 10.2, face, x + 7, y + 7, face,
    ], side < 0 ? [0, 2, 1, 0, 3, 2, 0, 4, 3] : [0, 1, 2, 0, 2, 3, 0, 3, 4],
    material.siding, undefined, [0, 0, .2, .7, .5, 1, .8, .7, 1, 0]);
    art.tube("cream gable fascia", profile.map(([px, py]): Triple => [x + px, y + py, z + side * 6.38]), .12, C.cream, "paint");
    art.box("barn sliding door recess", [x, y + 2.4, face + side * .04], [5.5, 4.8, .09], C.darkDairy, "wood");
    art.box("barn door track", [x, y + 4.95, face + side * .16], [6.6, .18, .22], C.iron, "metal");
    for (const half of [-1, 1]) {
      art.box("barn door jamb", [x + half * 2.82, y + 2.4, face + side * .13], [.2, 4.9, .18], C.cream, "paint");
      art.box("barn door center", [x + half * .06, y + 2.4, face + side * .12], [.1, 4.7, .13], C.cream, "paint");
      art.tube("diagonal barn joinery", [[x + half * .15, y + .3, face + side * .17], [x + half * 2.6, y + 4.6, face + side * .17]], .085, C.cream, "paint");
      art.box("barn iron latch", [x + half * .28, y + 2.2, face + side * .22], [.07, .42, .07], C.iron, "metal");
      art.box("barn corner board", [x + half * 6.91, y + 3.8, face + side * .04], [.19, 6.8, .16], C.cream, "paint");
    }
    art.box("dairy nameboard frame", [x, y + 6, face + side * .09], [8.8, 1.16, .17], C.roofShadow, "paint");
    art.label("BUTTERBELL", [x, y + 6, face + side * .19], 8.5, .93, side < 0 ? 0 : Math.PI);
    art.cylinder("loft window surround", [x, y + 8.6, face + side * .06], 1.6, 1.6, .12, C.cream, "paint").rotation.x = Math.PI / 2;
    art.cylinder("loft window glass", [x, y + 8.6, face + side * .14], 1.32, 1.32, .1, C.roofShadow, "paint").rotation.x = Math.PI / 2;
    art.box("loft window mullion", [x, y + 8.6, face + side * .21], [.065, 1.32, .055], C.cream, "paint");
    art.box("loft window transom", [x, y + 8.6, face + side * .21], [1.32, .065, .055], C.cream, "paint");
    for (const depth of [-3.5, 1, 4]) {
      art.box("barn side window trim", [x + side * 7.035, y + 3.7, z + depth], [.11, 1.8, 1.8], C.cream, "paint");
      art.box("barn side window glass", [x + side * 7.10, y + 3.7, z + depth], [.055, 1.5, 1.48], C.roofShadow, "paint");
      art.box("barn side window bar", [x + side * 7.14, y + 3.7, z + depth], [.06, .075, 1.5], C.cream, "paint");
    }
    art.box("barn eave gutter", [x + side * 7.17, y + 7.05, z], [.15, .16, 12.45], C.roofShadow, "metal");
    art.box("barn downpipe", [x + side * 7.13, y + 3.5, z - 5.55], [.13, 6.7, .13], C.roofShadow, "metal");
  }
  const sx = x + 11, sz = z + 1;
  const lowest = Math.min(y, terrainHeight(sx - 2.7, sz), terrainHeight(sx + 2.7, sz),
    terrainHeight(sx, sz - 2.7), terrainHeight(sx, sz + 2.7));
  art.cylinder("silo grounded plinth", [sx, (lowest + y + .4) / 2, sz], 5.5, 5.5, y + .4 - lowest, "#c0b393");
  art.cylinder("silo cream body", [sx, y + 5, sz], 5, 5.4, 10, C.cream, "paint");
  const dome: number[] = [], domeIndices: number[] = [];
  for (let row = 0; row < 6; row++) for (let side = 0; side <= 24; side++) {
    const angle = side / 24 * Math.PI * 2, t = row / 6 * Math.PI / 2;
    dome.push(sx + Math.cos(angle) * 2.75 * Math.cos(t), y + 10 + Math.sin(t) * 1.25, sz + Math.sin(angle) * 2.75 * Math.cos(t));
    if (row < 5 && side < 24) {
      const a = row * 25 + side;
      domeIndices.push(a, a + 1, a + 25, a + 1, a + 26, a + 25);
    }
  }
  const top = dome.length / 3;
  dome.push(sx, y + 11.25, sz);
  for (let side = 0; side < 24; side++) domeIndices.push(5 * 25 + side, 5 * 25 + side + 1, top);
  art.mesh("silo spun metal cap", dome, domeIndices, art.art.surface(C.roof, "paint"));
  for (let ring = 0; ring < 6; ring++) art.cylinder("silo steel hoop", [sx, y + .75 + ring * 1.72, sz], 5.5 - ring * .07, 5.5 - ring * .07, .09, C.roofShadow, "metal");
  for (const side of [-1, 1]) art.box("silo ladder upright", [sx + side * .36, y + 4.95, sz - 2.68], [.075, 9.6, .075], C.iron, "metal");
  for (let rung = 0; rung < 25; rung++) art.box("silo ladder rung", [sx, y + .35 + rung * .38, sz - 2.73], [.8, .065, .065], C.iron, "metal");
}

export function butterbellHay(art: ButterbellArt, material: ButterbellMaterials, x: number, z: number): void {
  const y = terrainHeight(x, z) + 1.05;
  const hay = art.cylinder("rolled hay core", [x, y, z], 2.1, 2.1, 1.8, C.straw);
  hay.material = material.hay;
  hay.rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) {
    const ring = art.cylinder("bale jute binding", [x, y, z + side * .6], 2.115, 2.115, .075, "#957037", "fabric");
    ring.rotation.x = Math.PI / 2;
    const spiral: Triple[] = [];
    for (let i = 0; i <= 64; i++) {
      const angle = i / 64 * Math.PI * 6, radius = .08 + i / 64 * .85;
      spiral.push([x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, z + side * .913]);
    }
    art.tube("continuous cut hay spiral", spiral, .019, "#a87937", "fabric");
  }
}

export function butterbellWindmill(art: ButterbellArt): TransformNode {
  const x = WINDMILL.x, z = WINDMILL.z, y = terrainHeight(x, z);
  let bottom = y;
  for (let i = 0; i < 12; i++) bottom = Math.min(bottom,
    terrainHeight(x + Math.cos(i / 12 * Math.PI * 2) * 3.5, z + Math.sin(i / 12 * Math.PI * 2) * 3.5));
  art.cylinder("windmill stone base", [x, (bottom + y + .84) / 2, z], 7, 7, y + .84 - bottom, "#a89b7d");
  art.cylinder("windmill plaster core", [x, y + 9, z], 4, 7, 18, C.cream);
  for (const level of [3.8, 8, 12.2]) {
    const diameter = 7 - level / 18 * 3;
    art.cylinder("windmill timber belt", [x, y + level, z], diameter + .035, diameter + .055, .2, C.timber, "wood");
  }
  art.box("windmill oak doorway", [x, y + 1.4, z - 3.29], [1.65, 2.8, .18], C.roofShadow, "wood");
  art.box("windmill doorway lintel", [x, y + 2.85, z - 3.25], [1.94, .16, .22], C.dairy, "paint");
  for (const level of [6, 10.5]) {
    const front = z - (3.5 - level / 18 * 1.5);
    art.box("mill recessed window", [x, y + level, front - .02], [1.1, 1.3, .1], C.roofShadow, "paint");
    for (const side of [-1, 1]) art.box("mill window shutter", [x + side * .73, y + level, front + .07], [.28, 1.35, .12], C.dairy, "paint");
  }
  art.cylinder("windmill roof skirt", [x, y + 18.03, z], 5.9, 5.9, .12, C.roofShadow, "metal");
  art.cylinder("windmill conical roof", [x, y + 19, z], .2, 5.9, 2, C.roof, "paint");
  const rotor = new TransformNode("butterbell windmill rotor", art.art.scene);
  rotor.position.set(x, y + 16, z - 3.2);
  const hub = art.cylinder("windmill hub", [0, 0, 0], 1.1, 1.1, .75, C.iron, "metal", rotor);
  hub.rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const blade = new TransformNode("windmill lattice sail", art.art.scene);
    blade.parent = rotor;
    blade.rotation.z = i * Math.PI / 2;
    art.box("windmill tapered spar", [0, 4.2, 0], [.16, 8.4, .18], C.timber, "wood", blade);
    art.mesh("windmill shaped canvas", [
      .08, 2.2, .03, 1.6, 2.45, .03, 1.9, 8.2, .03, .08, 7.95, .03,
      .08, 2.2, .03, 1.6, 2.45, .03, 1.9, 8.2, .03, .08, 7.95, .03,
    ], [0, 1, 2, 0, 2, 3, 6, 5, 4, 7, 6, 4], art.art.surface(C.cream, "fabric"), undefined, undefined, blade);
    for (let rung = 0; rung < 8; rung++) art.box("windmill canvas batten", [.84, 2.5 + rung * .77, -.03], [1.78, .07, .1], C.timber, "wood", blade);
    art.box("windmill sail outer rail", [1.7, 5.25, -.03], [.075, 6.1, .1], C.timber, "wood", blade);
  }
  art.art.batchModel(rotor, new Set(), true);
  return rotor;
}
