import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
  BARNS, GAP_END, GAP_START, HAY_BALES, ORCHARD, ROAD, ROAD_WIDTH, SHOULDER_WIDTH, WATER_LEVEL,
  bankHeight, bankWidth, hasRail, isGap, isWater, projectRoad, sampleRoad, surfaceHeight, terrainHeight,
} from "@kartsick/content";
import type { RoadPoint } from "@kartsick/content";
import { Atelier } from "./geometry";
import type { Triple } from "./geometry";
import type { CourseWorld } from "./world-types";
import { ButterbellArt, butterbellDecorationClearance, butterbellTree } from "./butterbell-art";
import type { ButterbellSign } from "./butterbell-art";
import { BUTTERBELL as C, butterbellFieldColor, butterbellNoise as noise, makeButterbellMaterials } from "./butterbell-materials";
import type { ButterbellMaterials } from "./butterbell-materials";
import { butterbellBarn, butterbellHay, butterbellWindmill } from "./butterbell-farm";
import { butterbellExposedGround } from "./butterbell-ground";

export interface StudyWorld extends CourseWorld {}

function surfaceMesh(art: Atelier, name: string, positions: number[], indices: number[],
  material: ButterbellMaterials[keyof ButterbellMaterials], colors?: number[], uv?: number[]): Mesh {
  // Tight inside offsets can fold a strip triangle without changing its physical vertex positions.
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const up = (positions[a + 2] - positions[b + 2]) * (positions[c] - positions[b])
      - (positions[a] - positions[b]) * (positions[c + 2] - positions[b + 2]);
    if (up < 0) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  }
  const mesh = art.mesh(name, positions, indices, colors, uv);
  mesh.material = material;
  mesh.receiveShadows = true;
  return mesh;
}

function farmland(art: Atelier, materials: ButterbellMaterials): void {
  const tiles = 6, steps = 20;
  for (let tz = 0; tz < tiles; tz++) for (let tx = 0; tx < tiles; tx++) {
    const positions: number[] = [], colors: number[] = [], indices: number[] = [], uv: number[] = [];
    const vertices = new Map<string, number>();
    const vertex = (px: number, pz: number) => {
      const key = `${px.toFixed(7)}:${pz.toFixed(7)}`;
      let index = vertices.get(key);
      if (index === undefined) {
        index = positions.length / 3;
        vertices.set(key, index);
        positions.push(px, terrainHeight(px, pz), pz);
        colors.push(...butterbellFieldColor(px, pz), 1);
        uv.push(px / 5, pz / 5);
      }
      return index;
    };
    for (let z = 0; z < steps; z++) for (let x = 0; x < steps; x++) {
      const px = -240 + (tx + x / steps) * 480 / tiles, ex = px + 480 / tiles / steps;
      const pz = -250 + (tz + z / steps) * 500 / tiles, ez = pz + 500 / tiles / steps;
      for (const triangle of [[[px, pz], [ex, pz], [px, ez]], [[ex, pz], [ex, ez], [px, ez]]] as const) {
        for (const polygon of butterbellExposedGround([...triangle])) for (let corner = 1; corner < polygon.length - 1; corner++) {
          const [a, b, c] = [polygon[0], polygon[corner], polygon[corner + 1]];
          if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-7) continue;
          indices.push(vertex(...a), vertex(...b), vertex(...c));
        }
      }
    }
    surfaceMesh(art, `butterbell living pasture ${tx}:${tz}`, positions, indices, materials.pasture, colors, uv);
  }
}

function raceway(art: Atelier, scenery: ButterbellArt, materials: ButterbellMaterials): Mesh[] {
  const casters: Mesh[] = [];
  const cream = Color3.FromHexString(C.cream), red = Color3.FromHexString(C.dairy);
  for (let chunk = 0; chunk < ROAD.length - 1; chunk += 40) {
    const road: number[] = [], roadIndices: number[] = [], roadUV: number[] = [];
    const curbs: number[] = [], curbIndices: number[] = [], curbColors: number[] = [];
    const banks: number[] = [], bankIndices: number[] = [], bankColors: number[] = [], bankUV: number[] = [];
    const verges: number[] = [], vergeIndices: number[] = [], vergeUV: number[] = [];
    for (let i = chunk; i < Math.min(chunk + 40, ROAD.length - 1); i++) {
      const a = ROAD[i], b = ROAD[i + 1];
      if (isGap((a.u + b.u) / 2)) continue;
      const base = road.length / 3;
      for (const point of [a, b]) for (const side of [-1, 1]) {
        road.push(point.x + point.dz * side * ROAD_WIDTH / 2, point.y + .02, point.z - point.dx * side * ROAD_WIDTH / 2);
        roadUV.push(side < 0 ? 0 : 2.6, point.distance / 5);
      }
      roadIndices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      for (const side of [-1, 1]) {
        const curb = curbs.length / 3, color = Math.floor(a.distance / 3) % 2 ? cream : red;
        const widths = side < 0 ? [-SHOULDER_WIDTH, -ROAD_WIDTH / 2] : [ROAD_WIDTH / 2, SHOULDER_WIDTH];
        for (const point of [a, b]) for (const width of widths) {
          curbs.push(point.x + point.dz * width, point.y + .025, point.z - point.dx * width);
          curbColors.push(color.r, color.g, color.b, 1);
        }
        curbIndices.push(curb, curb + 1, curb + 2, curb + 1, curb + 3, curb + 2);
        const bank = banks.length / 3, bankSteps = 8;
        for (const point of [a, b]) for (let step = 0; step <= bankSteps; step++) {
          const width = SHOULDER_WIDTH + bankWidth(point) * step / bankSteps;
          const x = point.x + point.dz * side * width, z = point.z - point.dx * side * width;
          banks.push(x, bankHeight(point, x, z, width) + .008, z);
          bankColors.push(...butterbellFieldColor(x, z), 1);
          bankUV.push(x / 5, z / 5);
        }
        for (let step = 0; step < bankSteps; step++) {
          const n = bank + step, next = n + bankSteps + 1;
          if (side > 0) bankIndices.push(n, n + 1, next, n + 1, next + 1, next);
          else bankIndices.push(n, next, n + 1, n + 1, next, next + 1);
        }
        const verge = verges.length / 3;
        for (const point of [a, b]) for (let step = 0; step <= 3; step++) {
          const width = SHOULDER_WIDTH + step * .62;
          const x = point.x + point.dz * side * width, z = point.z - point.dx * side * width;
          verges.push(x, bankHeight(point, x, z, width) + .014, z);
          vergeUV.push(step * .4, point.distance / 3);
        }
        for (let step = 0; step < 3; step++) {
          const n = verge + step, next = n + 4;
          if (side > 0) vergeIndices.push(n, n + 1, next, n + 1, next + 1, next);
          else vergeIndices.push(n, next, n + 1, n + 1, next, next + 1);
        }
      }
      if (hasRail(a.u) && i % 4 === 0) {
        const end = ROAD[Math.min(i + 4, ROAD.length - 1)];
        for (const side of [-1, 1]) {
          const x = a.x + a.dz * side * ROAD_WIDTH / 2, z = a.z - a.dx * side * ROAD_WIDTH / 2;
          scenery.box("ridge guardrail stanchion", [x, a.y + .5, z], [.17, 1, .17], C.roofShadow, "metal");
          for (const height of [.43, .88]) scenery.tube("ridge cream safety rail", [
            [x, a.y + height, z],
            [end.x + end.dz * side * ROAD_WIDTH / 2, end.y + height, end.z - end.dx * side * ROAD_WIDTH / 2],
          ], .10, C.cream, "paint");
        }
      }
    }
    if (!road.length) continue;
    casters.push(surfaceMesh(art, `butterbell aggregate raceway ${chunk}`, road, roadIndices, materials.asphalt, undefined, roadUV));
    surfaceMesh(art, `butterbell enamel kerbs ${chunk}`, curbs, curbIndices, art.surface("#ffffff", "paint"), curbColors);
    surfaceMesh(art, `butterbell physical banks ${chunk}`, banks, bankIndices, materials.pasture, bankColors, bankUV);
    surfaceMesh(art, `butterbell packed verges ${chunk}`, verges, vergeIndices, materials.verge, undefined, vergeUV);
  }
  return casters;
}

function fieldDetails(art: ButterbellArt, materials: ButterbellMaterials): void {
  for (let row = 0; row < 25; row++) {
    const positions: number[] = [], indices: number[] = [], uv: number[] = [], colors: number[] = [];
    for (let step = 0; step <= 28; step++) {
      const x = -115 + step * 2.35;
      const z = -122 + row * 2.25 + Math.sin(step * .07 + row * .025) * 5;
      const p = projectRoad(x, z);
      if (p.separation < SHOULDER_WIDTH + bankWidth(p) + 2) break;
      for (const offset of [-.16, .16]) {
        positions.push(x, surfaceHeight(x, z + offset) + .021, z + offset);
        uv.push(x / 3, (z + offset) / 3);
        colors.push(.93, .91, .71, 1);
      }
      if (step) {
        const n = step * 2;
        indices.push(n - 2, n, n - 1, n - 1, n, n + 1);
      }
    }
    if (indices.length) art.mesh("contour-cut barley swath", positions, indices, materials.verge, colors, uv);
  }
  const clover = new Map<string, { positions: number[]; colors: number[]; indices: number[] }>();
  for (let i = 0; i < 1000; i++) {
    const p = sampleRoad(noise(i + 581)), side = i % 2 ? -1 : 1;
    const across = SHOULDER_WIDTH + bankWidth(p) + 1 + noise(i + 88) * 11;
    const x = p.x + p.dz * side * across, z = p.z - p.dx * side * across;
    if (isWater(x, z) || isGap(p.u)) continue;
    const y = surfaceHeight(x, z) + .025, radius = .10 + noise(i + 212) * .12;
    const key = `${Math.floor(x / 64)}:${Math.floor(z / 64)}`;
    let patch = clover.get(key);
    if (!patch) {
      patch = { positions: [], colors: [], indices: [] };
      clover.set(key, patch);
    }
    const { positions, colors, indices } = patch;
    const base = positions.length / 3, color = i % 9 === 0 ? C.cream : i % 9 === 1 ? C.straw : C.leaf;
    const tint = Color3.FromHexString(color);
    // Clover, mower clippings and buttercups sit below the kart's contact plane.
    positions.push(x - radius, y, z, x + radius, y, z, x, y + .075, z + radius * .7,
      x, y + .075, z + radius * .7, x + radius, y, z, x - radius, y, z);
    for (let corner = 0; corner < 6; corner++) colors.push(tint.r, tint.g, tint.b, 1);
    indices.push(base, base + 1, base + 2, base + 3, base + 4, base + 5);
  }
  for (const [key, { positions, colors, indices }] of clover) {
    art.mesh(`low pasture clover ${key}`, positions, indices, art.art.material("#ffffff"), colors);
  }
  for (const line of [{ x: -17, start: -157, end: -52 }, { x: -109, start: -122, end: 74 }]) {
    for (let z = line.start; z < line.end; z += 4.5) {
      const x = line.x + Math.sin(z * .018) * 2, ex = line.x + Math.sin((z + 4.5) * .018) * 2;
      if (!butterbellDecorationClearance(x, z, .3) || !butterbellDecorationClearance(ex, z + 4.5, .3)) continue;
      const y = surfaceHeight(x, z), ey = surfaceHeight(ex, z + 4.5);
      art.furniture.push({ name: "paddock fence", x, z, radius: .3 });
      art.box("paddock mortised post", [x, y + .65, z], [.2, 1.3, .2], C.cream, "wood");
      for (const height of [.42, .99]) art.tube("paddock painted rail", [[x, y + height, z], [ex, ey + height, z + 4.5]], .065, C.cream, "wood");
    }
  }
}

function horizon(art: Atelier, materials: ButterbellMaterials): void {
  const positions: number[] = [], indices: number[] = [], colors: number[] = [], uv: number[] = [];
  const around = 160, rows = 28;
  for (let row = 0; row <= rows; row++) for (let i = 0; i <= around; i++) {
    const angle = i / around * Math.PI * 2;
    const edge = 1 / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
    const outward = row * 23;
    const x = Math.cos(angle) * edge * (240 + outward), z = Math.sin(angle) * edge * (250 + outward);
    const envelope = Math.sin(Math.min(1, outward / 230) * Math.PI / 2) ** 2;
    const rolling = 30 + 19 * Math.sin(x * .012 + Math.sin(z * .009))
      + 16 * Math.cos(z * .015 - Math.sin(x * .007)) + 9 * Math.sin((x + z) * .026);
    positions.push(x, terrainHeight(x, z) + envelope * rolling, z);
    const field = .5 + .5 * Math.sin(x * .025 + Math.sin(z * .018) * 2.4);
    colors.push(.5 + field * .1, .66 + field * .09, .33 + field * .05, 1);
    uv.push(x / 9, z / 9);
    if (row < rows && i < around) {
      const a = row * (around + 1) + i, next = a + around + 1;
      indices.push(a, next, a + 1, a + 1, next, next + 1);
    }
  }
  surfaceMesh(art, "butterbell rolling countryside", positions, indices, materials.pasture, colors, uv);
}

function pond(art: Atelier, scenery: ButterbellArt): void {
  const positions = [77, WATER_LEVEL, -14], indices: number[] = [];
  for (let i = 0; i <= 72; i++) {
    const angle = i / 72 * Math.PI * 2;
    positions.push(77 + Math.cos(angle) * 36, WATER_LEVEL, -14 + Math.sin(angle) * 27);
    if (i < 72) indices.push(0, i + 1, i + 2);
  }
  surfaceMesh(art, "butterbell irrigation water", positions, indices, art.surface("#4ca9ae", "paint"));
  for (let i = 0; i < 18; i++) {
    const x = 51 + noise(i + 30) * 51, z = -31 + noise(i + 50) * 32;
    if (!isWater(x, z) || !isWater(x + 3, z)) continue;
    scenery.box("irrigation water glint", [x, WATER_LEVEL + .012, z], [1.8 + noise(i) * 2, .008, .06], "#9dd4ce");
  }
}

function routeSign(art: ButterbellArt, text: ButterbellSign, u: number, side: number, width = 5.2): void {
  const p = sampleRoad(u), radius = width / 2 + .2;
  let across = SHOULDER_WIDTH + bankWidth(p) + 3 + radius;
  let x = p.x + p.dz * side * across, z = p.z - p.dx * side * across;
  for (let step = 0; step < 10 && !butterbellDecorationClearance(x, z, radius); step++) {
    across += 2;
    x = p.x + p.dz * side * across; z = p.z - p.dx * side * across;
  }
  if (!butterbellDecorationClearance(x, z, radius)) return;
  art.furniture.push({ name: text, x, z, radius });
  const y = surfaceHeight(x, z), yaw = Math.atan2(p.dx, p.dz);
  art.cylinder("enamel route post", [x, y + 1.65, z], .14, .18, 3.3, C.roofShadow, "metal");
  const board = art.box("route nameboard", [x, y + 3.3, z], [width + .18, .95, .14], C.dairy, "paint");
  board.rotation.y = yaw;
  art.label(text, [x - p.dx * .09, y + 3.3, z - p.dz * .09], width, .76, yaw);
}

function raceFestival(art: ButterbellArt): void {
  const start = sampleRoad(0), yaw = Math.atan2(start.dx, start.dz);
  const at = (across: number, height: number, forward = 0): Triple =>
    [start.x + start.dz * across + start.dx * forward, start.y + height, start.z - start.dx * across + start.dz * forward];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 12; col++) {
    const tile = art.box("start checker", at((col - 5.5) * ROAD_WIDTH / 12, .04, row * .8 - .8),
      [ROAD_WIDTH / 12, .02, .8], (row + col) % 2 ? C.iron : C.cream, "paint");
    tile.rotation.y = yaw;
  }
  for (const side of [-1, 1]) {
    const [x, , z] = at(side * 14.8, 0);
    const ground = surfaceHeight(x, z);
    art.furniture.push({ name: "festival gate pier", x, z, radius: Math.SQRT2 * .85 });
    const plinth = art.box("dairy gate stone plinth", [x, ground + .28, z], [1.7, .56, 1.7], "#c0b393");
    plinth.rotation.y = yaw;
    const post = art.box("dairy gate enamel pier", [x, (ground + start.y + 7.5) / 2, z], [1.1, start.y + 7.5 - ground, 1.1], C.dairy, "paint");
    post.rotation.y = yaw;
    for (const edge of [-1, 1]) {
      const trim = art.box("gate cream corner", at(side * 14.8 + edge * .48, 3.9, -.59), [.12, 6.9, .12], C.cream, "paint");
      trim.rotation.y = yaw;
    }
    art.cylinder("gate pier crown", at(side * 14.8, 7.67), 1.65, 1.65, .3, C.cream, "paint");
    art.cylinder("gate pier finial", at(side * 14.8, 8.04), .05, 1.8, .5, C.roof, "paint");
  }
  art.tube("festival double-span truss", [at(-14.8, 7.35), at(-8, 7.8), at(0, 8.9), at(8, 7.8), at(14.8, 7.35)], .18, C.roof, "paint");
  art.tube("festival lower truss", [at(-14.8, 6.95), at(14.8, 6.95)], .13, C.roofShadow, "metal");
  for (let i = -6; i < 7; i++) {
    art.tube("festival diagonal truss", [at(i * 2, 7.04), at(i * 2 + 1, 7.62 + (1 - Math.abs(i) / 7) * .65)], .045, C.roofShadow, "metal");
  }
  const backing = art.box("Butterbell nameplate border", at(0, 8), [12.9, 1.93, .28], C.dairy, "paint");
  backing.rotation.y = yaw;
  art.label("BUTTERBELL", at(0, 8, -.16), 12.55, 1.67, yaw);
  art.label("DAIRY ROAD RACES", at(0, 6.71, -.03), 7.3, .57, yaw);
  art.cylinder("Butterbell bell shoulder", at(0, 9.76), .42, 1.28, 1.16, C.straw, "metal");
  art.cylinder("Butterbell bell lip", at(0, 9.19), 1.5, 1.5, .15, C.straw, "metal");
  art.cylinder("Butterbell bell crown", at(0, 10.4), .14, .32, .16, C.roofShadow, "metal");
  for (const side of [-1, 1]) {
    const pos = at(side * 9.4, 7.03, -.04);
    art.label("PASTURES", pos, 4.1, .62, yaw);
  }
  const launch = sampleRoad(GAP_START - .006);
  for (let i = 0; i < 4; i++) {
    const p = sampleRoad(GAP_START - .005 - i * .006);
    const stripe = art.box("launch stripes", [p.x, p.y + .045, p.z], [ROAD_WIDTH - 1, .035, .55], i % 2 ? C.roof : C.straw, "paint");
    stripe.rotation.y = Math.atan2(p.dx, p.dz);
  }
  for (const side of [-1, 1]) {
    const x = launch.x + launch.dz * side * 7.2, z = launch.z - launch.dx * side * 7.2;
    // Flight masts retain the canonical shoulder positions and sit outside the launch lane.
    art.cylinder("flight pennant pole", [x, launch.y + 2.5, z], .13, .13, 5, C.cream, "paint");
    const flag = art.box("flight pennant", [x, launch.y + 4.3, z], [1.2, 1, .06], C.straw, "fabric");
    flag.rotation.y = Math.atan2(launch.dx, launch.dz);
    for (let i = 0; i < 5; i++) {
      const p = sampleRoad(GAP_END + .005 + i * .008);
      const marker = art.box("landing edge", [p.x + p.dz * side * 6.2, p.y + .05, p.z - p.dx * side * 6.2], [.45, .03, 2.5], C.cream, "paint");
      marker.rotation.y = Math.atan2(p.dx, p.dz);
    }
  }
  routeSign(art, "ORCHARD BEND", .115, 1);
  routeSign(art, "BARN BEND", .27, -1);
  routeSign(art, "WINDMILL RIDGE", .46, -1, 6);
  routeSign(art, "GLIDE AHEAD", GAP_START - .055, 1);
  routeSign(art, "LANDING", GAP_END + .018, -1);
  routeSign(art, "ROLLING HARVEST", .153, -1, 6);
  routeSign(art, "ROLLING HARVEST", .838, 1, 6);
}

const HARVEST_POINTS: readonly RoadPoint[] = [sampleRoad(.18), sampleRoad(.865)];
/** Mirrors the canonical hazard equation without creating query arrays every render frame. */
export function updateButterbellHarvest(roots: readonly TransformNode[], time: number): void {
  for (let index = 0; index < HARVEST_POINTS.length; index++) {
    const p = HARVEST_POINTS[index], root = roots[index];
    const phase = Math.sin(time * Math.PI * 2 / 7 + index);
    const lane = (index ? -1 : 1) * (4.9 + phase * 1.1);
    root.position.set(p.x + p.dz * lane, p.y + .95, p.z - p.dx * lane);
    root.rotation.set(0, Math.atan2(p.dx, p.dz), phase);
  }
}

export function makeWorld(art: Atelier): StudyWorld {
  const materials = makeButterbellMaterials(art), scenery = new ButterbellArt(art);
  farmland(art, materials);
  const roadCasters = raceway(art, scenery, materials);
  fieldDetails(scenery, materials);
  for (const item of ORCHARD) butterbellTree(scenery, item.x, item.z, item.scale, item.seed);
  for (const farm of BARNS) butterbellBarn(scenery, materials, farm.x, farm.z);
  for (const bale of HAY_BALES) butterbellHay(scenery, materials, bale.x, bale.z);
  const rotor = butterbellWindmill(scenery);
  pond(art, scenery);
  horizon(art, materials);
  raceFestival(scenery);
  const rollers = HARVEST_POINTS.map((_, index) => {
    const root = new TransformNode(`hay-roller-${index}`, art.scene);
    const body = scenery.cylinder("rolling harvest bale", [0, 0, 0], 2.2, 2.2, 1.9, C.straw, "matte", root);
    body.material = materials.hay;
    body.rotation.z = Math.PI / 2;
    for (const side of [-1, 1]) {
      scenery.cylinder("harvest cloth ribbon", [side * .53, 0, 0], 2.23, 2.23, .15, C.roof, "fabric", root).rotation.z = Math.PI / 2;
      const spiral: Triple[] = [];
      for (let i = 0; i <= 48; i++) {
        const angle = i / 48 * Math.PI * 5, radius = .08 + i / 48 * .87;
        spiral.push([side * .965, Math.cos(angle) * radius, Math.sin(angle) * radius]);
      }
      scenery.tube("rolling cut hay spiral", spiral, .03, "#a87937", "fabric", root);
    }
    art.batchModel(root, new Set(), true);
    return root;
  });
  updateButterbellHarvest(rollers, 0);
  const staticCasters = scenery.finish();
  const meshes = (root: TransformNode) => root.getChildMeshes().filter((mesh): mesh is Mesh => mesh instanceof Mesh);
  art.scene.metadata = { ...art.scene.metadata, butterbellFurniture: scenery.furniture };
  return {
    environment: {
      sky: "#258bd7", skyStyle: "day", fog: "#b7ced5", fogStart: 240, fogEnd: 1000, sun: "#fff1d7", sunIntensity: .5,
      fill: "#e1ebff", fillIntensity: .5, ground: "#899382",
    },
    casters: [...roadCasters, ...staticCasters, ...meshes(rotor), ...rollers.flatMap(meshes)],
    animate(time, reducedMotion = false) {
      rotor.rotation.z = reducedMotion ? .22 : time * .24;
      updateButterbellHarvest(rollers, time);
    },
  };
}
