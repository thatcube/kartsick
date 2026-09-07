import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
  BARNS, GAP_END, GAP_START, HAY_BALES, ORCHARD, ROAD, ROAD_WIDTH, SHOULDER_WIDTH, WATER_LEVEL, WINDMILL,
  bankHeight, bankWidth, hasRail, isGap, projectRoad, sampleRoad, surfaceHeight, terrainHeight,
} from "@kartsick/content";
import { Atelier } from "./geometry";
import type { Triple } from "./geometry";

export interface StudyWorld {
  casters: Mesh[];
  animate(time: number): void;
}

function noise(index: number): number {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function tree(art: Atelier, x: number, z: number, scale: number, seed: number): void {
  const y = terrainHeight(x, z);
  art.cylinder("orchard trunk", [x, y + 1.7 * scale, z], 0.32 * scale, 0.52 * scale, 3.4 * scale, "#9d7952");
  const colors = ["#7cab50", "#9dbc61", "#5c9868"];
  for (const side of [-1, 1]) {
    art.tube("orchard fork", [[x, y + 2.1 * scale, z], [x + side * 0.75 * scale, y + 3 * scale, z], [x + side * 1.6 * scale, y + 3.6 * scale, z]], 0.13 * scale, "#9d7952");
  }
  art.oval("leaf crown", [x, y + 4.5 * scale, z], [5.5 * scale, 3.9 * scale, 4.9 * scale], colors[seed % colors.length], undefined, 1, 10);
  art.oval("leaf crown", [x + 1.85 * scale, y + 3.8 * scale, z + 0.3], [3.9 * scale, 3.1 * scale, 3.7 * scale], colors[(seed + 1) % colors.length], undefined, 1, 10);
  art.oval("leaf crown", [x - 1.5 * scale, y + 3.9 * scale, z + scale], [3.5 * scale, 3.3 * scale, 3.8 * scale], colors[seed % colors.length], undefined, 1, 10);
  for (let i = 0; i < 6; i++) {
    const angle = i / 6 * Math.PI * 2 + seed;
    const px = x + Math.sin(angle) * 2.1 * scale;
    const pz = z + Math.cos(angle) * 2.1 * scale;
    const py = y + (3.2 + noise(seed + i) * 0.7) * scale;
    art.oval("orchard fruit", [px, py, pz], [0.44 * scale, 0.48 * scale, 0.44 * scale], i % 2 ? "#ef7949" : "#f3c368", undefined, 1, 6);
  }
}

function barn(art: Atelier, x: number, z: number): void {
  const y = terrainHeight(x, z);
  const yard: number[] = [x + 2, y + 0.035, z - 2];
  const yardIndices: number[] = [];
  for (let i = 0; i <= 40; i++) {
    const angle = i / 40 * Math.PI * 2;
    const px = x + 2 + Math.cos(angle) * 16;
    const pz = z - 2 + Math.sin(angle) * 12;
    yard.push(px, terrainHeight(px, pz) + 0.035, pz);
    if (i < 40) yardIndices.push(0, i + 2, i + 1);
  }
  const yardMesh = art.mesh("packed barnyard", yard, yardIndices);
  yardMesh.material = art.material("#c9b485");
  yardMesh.receiveShadows = true;
  art.box("barn siding", [x, y + 3.6, z], [14, 7.2, 12], "#dc765a");
  art.box("barn footing", [x, y + 0.25, z], [14.5, 0.5, 12.5], "#d9c4a0");
  const roof = art.mesh("gambrel roof", [
    x - 7.7, y + 7, z - 6.7, x - 4, y + 10.2, z - 6.7, x, y + 11.4, z - 6.7,
    x + 4, y + 10.2, z - 6.7, x + 7.7, y + 7, z - 6.7,
    x - 7.7, y + 7, z + 6.7, x - 4, y + 10.2, z + 6.7, x, y + 11.4, z + 6.7,
    x + 4, y + 10.2, z + 6.7, x + 7.7, y + 7, z + 6.7,
  ], [0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 8, 3, 8, 4, 4, 8, 9, 0, 1, 2, 0, 2, 3, 0, 3, 4, 5, 7, 6, 5, 8, 7, 5, 9, 8]);
  art.place(roof, [0, 0, 0], art.material("#4d8190"));
  for (const side of [-1, 1]) {
    const face = z + side * 6.03;
    art.box("barn door", [x, y + 2.35, face], [5.2, 4.7, 0.08], "#914f46");
    art.box("door lintel", [x, y + 4.83, face + side * 0.06], [5.7, 0.26, 0.13], "#fff0cf");
    for (const corner of [-1, 1]) {
      art.box("door trim", [x + corner * 2.65, y + 2.35, face + side * 0.06], [0.25, 4.8, 0.13], "#fff0cf");
      art.tube("cross brace", [[x - 2.4, y + (corner < 0 ? 0.3 : 4.5), face + side * 0.11], [x + 2.4, y + (corner < 0 ? 4.5 : 0.3), face + side * 0.11]], 0.105, "#f3d6af");
    }
    art.oval("loft window rim", [x, y + 7.75, face], [1.9, 1.9, 0.14], "#ffe9bd");
    art.oval("loft window", [x, y + 7.75, face + side * 0.11], [1.45, 1.45, 0.1], "#416879");
  }
  for (let i = -6; i <= 6; i++) {
    for (const side of [-1, 1]) art.box("siding join", [x + i, y + 3.4, z + side * 6.06], [0.045, 6.5, 0.025], "#e9926d");
  }
  art.cylinder("silo", [x + 11, y + 5, z + 1], 5, 5.4, 10, "#f0dcad");
  art.oval("silo roof", [x + 11, y + 10, z + 1], [5.5, 2.5, 5.5], "#5a8892");
  for (let i = 0; i < 5; i++) art.cylinder("silo ring", [x + 11, y + i * 2 + 0.5, z + 1], 5.5, 5.5, 0.09, "#bba983");
  for (const side of [-1, 1]) {
    art.box("barn corner trim", [x + side * 6.86, y + 3.5, z - 6.08], [0.2, 7, 0.15], "#fff0cf");
    const shutter = art.box("side loft shutter", [x + side * 7.04, y + 4.3, z + 1], [0.1, 2.2, 1.8], "#416879");
    shutter.receiveShadows = true;
  }
}

function roadsideSign(art: Atelier, text: string, u: number, side: number, width = 5): void {
  const point = sampleRoad(u);
  const x = point.x + point.dz * side * 9.4;
  const z = point.z - point.dx * side * 9.4;
  const y = surfaceHeight(x, z);
  art.cylinder("route signpost", [x, y + 1.5, z], 0.2, 0.25, 3, "#977756");
  const board = art.sign("route: " + text, text, [x, y + 3, z], width);
  board.rotation.y = Math.atan2(point.dx, point.dz);
}

export function makeWorld(art: Atelier): StudyWorld {
  const scene = art.scene;
  const groundPositions: number[] = [];
  const groundColors: number[] = [];
  const groundIndices: number[] = [];
  const fieldColors = ["#9fbb68", "#b5c67b", "#90b567", "#c0c676", "#86ab63"].map(hex => Color3.FromHexString(hex));
  const fieldColor = (x: number, z: number) => fieldColors[Math.abs(Math.floor(x / 43) + Math.floor(z / 48) * 7) % fieldColors.length];
  const divisions = 110;
  for (let z = 0; z <= divisions; z++) {
    for (let x = 0; x <= divisions; x++) {
      const px = (x / divisions - 0.5) * 480;
      const pz = (z / divisions - 0.5) * 500;
      const py = terrainHeight(px, pz);
      groundPositions.push(px, py, pz);
      const color = fieldColor(px, pz).scale(0.95 + noise(x + z * 13) * 0.09);
      groundColors.push(color.r, color.g, color.b, 1);
      if (x < divisions && z < divisions) {
        const a = z * (divisions + 1) + x;
        groundIndices.push(a, a + 1, a + divisions + 1, a + 1, a + divisions + 2, a + divisions + 1);
      }
    }
  }
  const terrain = art.mesh("quilted farmland", groundPositions, groundIndices, groundColors);
  terrain.material = art.material("#ffffff");
  terrain.receiveShadows = true;

  const asphalt = new DynamicTexture("original road surface", { width: 128, height: 512 }, scene, false);
  const context = asphalt.getContext();
  context.fillStyle = "#d7cfb0";
  context.fillRect(0, 0, 128, 512);
  for (let i = 0; i < 2600; i++) {
    context.fillStyle = i % 2 ? "#c9c3a844" : "#eee4c633";
    context.fillRect(noise(i) * 128, noise(i + 6000) * 512, 1.3, 1.3);
  }
  context.fillStyle = "#fff1c1";
  context.fillRect(61, 20, 6, 125);
  context.fillRect(61, 275, 6, 125);
  asphalt.update();
  asphalt.anisotropicFilteringLevel = 4;
  const roadMaterial = new StandardMaterial("warm asphalt", scene);
  roadMaterial.diffuseTexture = asphalt;
  roadMaterial.specularColor = new Color3(0.03, 0.03, 0.03);
  const positions: number[] = [];
  const indices: number[] = [];
  const uv: number[] = [];
  const curbPositions: number[] = [];
  const curbIndices: number[] = [];
  const curbColors: number[] = [];
  const banks: number[] = [];
  const bankIndices: number[] = [];
  const bankColors: number[] = [];
  for (let i = 0; i < ROAD.length - 1; i++) {
    const a = ROAD[i];
    const b = ROAD[i + 1];
    if (isGap((a.u + b.u) / 2)) continue;
    const base = positions.length / 3;
    for (const point of [a, b]) {
      for (const side of [-1, 1]) {
        positions.push(point.x + point.dz * side * ROAD_WIDTH / 2, point.y + 0.02, point.z - point.dx * side * ROAD_WIDTH / 2);
        uv.push(side < 0 ? 0 : 1, point.distance / 17);
      }
    }
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    for (const side of [-1, 1]) {
      const curbBase = curbPositions.length / 3;
      const curbColor = Color4.FromHexString(i % 8 < 4 ? "#f4e7bdff" : "#e49570ff");
      for (const point of [a, b]) {
        for (const width of [ROAD_WIDTH / 2, ROAD_WIDTH / 2 + 0.6]) {
          curbPositions.push(point.x + point.dz * side * width, point.y + 0.025, point.z - point.dx * side * width);
          curbColors.push(curbColor.r, curbColor.g, curbColor.b, 1);
        }
      }
      if (side > 0) curbIndices.push(curbBase, curbBase + 1, curbBase + 2, curbBase + 1, curbBase + 3, curbBase + 2);
      else curbIndices.push(curbBase, curbBase + 2, curbBase + 1, curbBase + 1, curbBase + 2, curbBase + 3);
      const bankBase = banks.length / 3;
      const bankSteps = 6;
      for (const point of [a, b]) {
        for (let step = 0; step <= bankSteps; step++) {
          const width = SHOULDER_WIDTH + bankWidth(point) * step / bankSteps;
          const x = point.x + point.dz * side * width;
          const z = point.z - point.dx * side * width;
          banks.push(x, bankHeight(point, x, z, width) + 0.008, z);
          const color = fieldColor(x, z);
          bankColors.push(color.r, color.g, color.b, 1);
        }
      }
      for (let step = 0; step < bankSteps; step++) {
        const first = bankBase + step;
        const next = first + bankSteps + 1;
        if (side > 0) bankIndices.push(first, first + 1, next, first + 1, next + 1, next);
        else bankIndices.push(first, next, first + 1, first + 1, next, next + 1);
      }
    }
    if (hasRail(a.u) && i % 4 === 0) {
      const end = ROAD[Math.min(i + 4, ROAD.length - 1)];
      for (const side of [-1, 1]) {
        const x = a.x + a.dz * side * ROAD_WIDTH / 2;
        const z = a.z - a.dx * side * ROAD_WIDTH / 2;
        art.box("ridge rail post", [x, a.y + 0.5, z], [0.19, 1, 0.19], "#f5e7c1");
        art.tube("ridge rail", [[x, a.y + 0.8, z], [end.x + end.dz * side * ROAD_WIDTH / 2, end.y + 0.8, end.z - end.dx * side * ROAD_WIDTH / 2]], 0.13, i % 8 ? "#78b9a1" : "#f5e7c1");
      }
    }
  }
  const roadMesh = art.mesh("study road", positions, indices, undefined, uv);
  roadMesh.material = roadMaterial;
  roadMesh.receiveShadows = true;
  roadMaterial.backFaceCulling = false;
  const curbs = art.mesh("painted edge markers", curbPositions, curbIndices, curbColors);
  const curbMaterial = art.material("#fffffe");
  curbMaterial.backFaceCulling = false;
  curbs.material = curbMaterial;
  curbs.receiveShadows = true;
  const bankMesh = art.mesh("grassy road banks", banks, bankIndices, bankColors);
  const bankMaterial = art.material("#ffffff");
  bankMaterial.backFaceCulling = false;
  bankMesh.material = bankMaterial;
  bankMesh.receiveShadows = true;

  const water = art.oval("irrigation reservoir", [77, WATER_LEVEL, -14], [72, 0.08, 54], "#62b6bb");
  water.material = art.material("#62b6bb");
  for (let i = 0; i < 12; i++) {
    const x = 53 + noise(i + 30) * 44;
    const z = -28 + noise(i + 50) * 27;
    art.box("water glint", [x, WATER_LEVEL + 0.06, z], [2.5 + noise(i) * 3, 0.01, 0.12], "#b6dfce");
  }
  for (const item of ORCHARD) tree(art, item.x, item.z, item.scale, item.seed);
  for (let row = 0; row < 7; row++) {
    for (let column = 0; column < 9; column++) {
      const x = -92 + column * 4.6;
      const z = -106 + row * 6;
      const y = terrainHeight(x, z);
      art.oval("barley row", [x, y + 0.65, z], [0.65, 1.35, 4.3], row % 2 ? "#d1c881" : "#c5bc76");
    }
  }
  for (const farm of BARNS) {
    barn(art, farm.x, farm.z);
    art.sign("farm sign", "BUTTERBELL", [farm.x, terrainHeight(farm.x, farm.z) + 6, farm.z - 6.15], 9, "#3445a8", 1.2);
  }
  for (const bale of HAY_BALES) {
    const y = terrainHeight(bale.x, bale.z) + 1.05;
    art.cylinder("rolled hay", [bale.x, y, bale.z], 2.1, 2.1, 1.8, "#e3bf67").rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      art.cylinder("bale binding", [bale.x, y, bale.z + side * 0.6], 2.12, 2.12, 0.09, "#ab874c").rotation.x = Math.PI / 2;
      for (const radius of [0.35, 0.7]) {
        art.tube("cut hay rings", Array.from({ length: 25 }, (_, i): Triple => [
          bale.x + Math.sin(i / 24 * Math.PI * 2) * radius, y + Math.cos(i / 24 * Math.PI * 2) * radius, bale.z + side * 0.91,
        ]), 0.025, "#ab874c");
      }
    }
  }
  roadsideSign(art, "ORCHARD LEFT", 0.115, 1, 5.5);
  roadsideSign(art, "BARN BEND", 0.27, -1);
  roadsideSign(art, "WINDMILL RIDGE", 0.46, -1, 6);
  roadsideSign(art, "GLIDE AHEAD", GAP_START - 0.055, 1, 5.5);
  for (const u of [0.065, 0.13, 0.21, 0.29, 0.355, 0.78, 0.88, 0.94]) {
    for (let flower = 0; flower < 10; flower++) {
      const p = sampleRoad(u + noise(flower) * 0.015);
      const side = flower % 2 ? -1 : 1;
      const across = 8.2 + noise(flower + 40) * 2.5;
      const x = p.x + p.dz * side * across;
      const z = p.z - p.dx * side * across;
      const y = surfaceHeight(x, z);
      art.cylinder("butterbell stem", [x, y + 0.2, z], 0.035, 0.055, 0.4, "#5c9868");
      art.cylinder("butterbell bloom", [x, y + 0.49, z], 0.31, 0.08, 0.27, flower % 3 ? "#f3c368" : "#fff0cf");
    }
  }

  for (let i = 0; i < 24; i++) {
    const x = -12;
    const z = -151 + i * 4.5;
    const y = terrainHeight(x, z);
    if (projectRoad(x, z).separation < 9) continue;
    art.box("paddock fence post", [x, y + 0.7, z], [0.22, 1.4, 0.22], "#f4e7c2");
    for (const height of [0.4, 0.95]) art.box("paddock fence rail", [x, y + height, z + 2.1], [0.15, 0.14, 4.4], "#f4e7c2");
  }
  for (let i = 0; i < 14; i++) {
    const angle = i / 14 * Math.PI * 2;
    const x = 45 + Math.cos(angle) * 300;
    const z = Math.sin(angle) * 300;
    art.oval("distant rolling hill", [x, -8, z], [125 + noise(i) * 60, 48 + noise(i + 9) * 55, 140], i % 2 ? "#8eb698" : "#a0bca0");
  }
  for (let i = 0; i < 18; i++) {
    const x = -240 + noise(i + 130) * 520;
    const z = -245 + noise(i + 300) * 490;
    const y = 65 + noise(i + 660) * 18;
    for (let puff = 0; puff < 3; puff++) {
      art.oval("cloud", [x + puff * 9, y + (puff % 2) * 2.5, z], [22, 8 + puff * 2, 12], "#fff6da");
    }
  }

  const start = sampleRoad(0);
  const startYaw = Math.atan2(start.dx, start.dz);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 12; col++) {
      const across = (col - 5.5) * (ROAD_WIDTH / 12);
      const forward = row * 0.8 - 0.8;
      const tile = art.box("start checker", [start.x + start.dz * across + start.dx * forward, start.y + 0.04, start.z - start.dx * across + start.dz * forward], [ROAD_WIDTH / 12, 0.02, 0.8], (row + col) % 2 ? "#4b6382" : "#fff0bf");
      tile.rotation.y = startYaw;
    }
  }
  for (const side of [-1, 1]) {
    art.cylinder("start gate post", [start.x + start.dz * side * 8, start.y + 4, start.z - start.dx * side * 8], 0.48, 0.65, 8, "#f3c368");
  }
  art.tube("start gate arch", [
    [start.x - start.dz * 8, start.y + 7.8, start.z + start.dx * 8],
    [start.x, start.y + 9.4, start.z],
    [start.x + start.dz * 8, start.y + 7.8, start.z - start.dx * 8],
  ], 0.24, "#5b9b9b");
  const gateSign = art.sign("start wordmark", "KARTSICK", [start.x, start.y + 8.1, start.z], 11.5, "#3445a8", 2);
  gateSign.rotation.y = startYaw;
  const launch = sampleRoad(GAP_START - 0.006);
  for (const side of [-1, 1]) {
    const x = launch.x + launch.dz * side * 7.2;
    const z = launch.z - launch.dx * side * 7.2;
    art.cylinder("flight pennant pole", [x, launch.y + 2.5, z], 0.13, 0.13, 5, "#fff0c2");
    const pennant = art.box("flight pennant", [x, launch.y + 4.3, z], [1.2, 1, 0.06], "#f5bf60");
    pennant.rotation.y = Math.atan2(launch.dx, launch.dz);
  }
  const glideSign = art.sign("glide sign", "SPREAD YOUR WINGS", [launch.x + launch.dz * 10, launch.y + 3, launch.z - launch.dx * 10], 6, "#3445a8");
  glideSign.rotation.y = Math.atan2(launch.dx, launch.dz);
  for (let i = 0; i < 4; i++) {
    const p = sampleRoad(GAP_START - 0.005 - i * 0.006);
    const marker = art.box("launch stripes", [p.x, p.y + 0.045, p.z], [ROAD_WIDTH - 1, 0.035, 0.55], i % 2 ? "#5caaa0" : "#f5ce69");
    marker.rotation.y = Math.atan2(p.dx, p.dz);
  }
  const landing = sampleRoad(GAP_END + 0.018);
  const landingYaw = Math.atan2(landing.dx, landing.dz);
  for (const side of [-1, 1]) {
    const x = landing.x + landing.dz * side * 8;
    const z = landing.z - landing.dx * side * 8;
    art.cylinder("landing mast", [x, landing.y + 3, z], 0.24, 0.3, 6, "#f3c368");
    const flag = art.sign("landing flag", "LANDING", [x, landing.y + 4.9, z], 3.6, "#3445a8", 0.95);
    flag.rotation.y = landingYaw;
    for (let i = 0; i < 5; i++) {
      const point = sampleRoad(GAP_END + 0.005 + i * 0.008);
      const marker = art.box("landing edge", [point.x + point.dz * side * 6.2, point.y + 0.05, point.z - point.dx * side * 6.2], [0.45, 0.03, 2.5], "#fff0cf");
      marker.rotation.y = Math.atan2(point.dx, point.dz);
    }
  }

  const millPosition: Triple = [WINDMILL.x, terrainHeight(WINDMILL.x, WINDMILL.z), WINDMILL.z];
  art.cylinder("windmill tower", [millPosition[0], millPosition[1] + 9, millPosition[2]], 4, 7, 18, "#f3dfa7");
  art.oval("windmill cap", [millPosition[0], millPosition[1] + 18, millPosition[2]], [6, 4, 6], "#dd825a");
  const rotor = new TransformNode("windmill rotor", scene);
  rotor.position.set(millPosition[0], millPosition[1] + 16, millPosition[2] - 3.2);
  art.oval("windmill hub", [0, 0, 0], [1.2, 1.2, 1.2], "#537a84", rotor);
  for (let i = 0; i < 4; i++) {
    const blade = new TransformNode("windmill blade", scene);
    blade.parent = rotor;
    blade.rotation.z = i * Math.PI / 2;
    art.box("blade spar", [0, 4.2, 0], [0.18, 8.4, 0.18], "#977756", blade);
    art.box("cream sail", [0.7, 4.5, 0], [1.5, 5.6, 0.1], "#fff1cd", blade);
    for (let rung = 0; rung < 5; rung++) art.box("sail rib", [0.7, 2.3 + rung * 1.1, -0.07], [1.6, 0.09, 0.06], "#c6aa79", blade);
  }
  art.batchModel(rotor, new Set());
  const scenery = art.finishStatic();
  const nonCastingColors = ["#fff6da", "#8eb698", "#a0bca0", "#62b6bb", "#b6dfce"];
  return {
    casters: [...scenery.filter(mesh => !nonCastingColors.some(color => mesh.material?.name.startsWith(color))),
      ...rotor.getChildMeshes().filter((mesh): mesh is Mesh => mesh instanceof Mesh)],
    animate(time) { rotor.rotation.z = time * 0.24; },
  };
}
