import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { CourseQuery } from "@kartsick/content";
import { COPPERWHISTLE } from "../../../../../packages/content-layouts/copperwhistle";
import { hazardPosition } from "../../../../../packages/content-layouts/types";
import type { CourseHazard } from "../../../../../packages/content-layouts/types";
import { buildCourseSurface } from "../course-surface";
import type { Atelier, Contour, Triple } from "../geometry";
import type { CourseWorld } from "../world-types";
import { instanceSource, portal, ring, routeSign } from "./tiltglass-copperwhistle-art";

const BARK = "#79533e", BARK_LIGHT = "#a77a50", WOOD = "#d3a570", CREAM = "#efd9a3";
const COPPER = "#c86f40", TEAL = "#427c79", DARK_TEAL = "#315e61";
const FOLIAGE = ["#c5753f", "#dda94f", "#b9583c", "#a6a45e", "#e6bb68"];

function treehouse(art: Atelier, course: CourseQuery, index: number, title: string): Mesh[] {
  const tree = COPPERWHISTLE.obstacles[index];
  const [x, , z] = tree.position;
  const y = course.projectRoad(x, z).y + 12;
  art.cylinder("round treehouse balcony", [x, y, z], 17, 15.5, 0.85, BARK_LIGHT);
  art.cylinder("staved treehouse body", [x, y + 4, z], 11.8, 12.5, 7.3, WOOD);
  art.oval("curved teal shingle roof", [x, y + 8.1, z], [17, 6, 16], TEAL, undefined, 0.83, 12);
  art.oval("roof copper crown", [x + 0.5, y + 10.8, z], [3.2, 1.1, 3.2], COPPER, undefined, 1, 8);
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    const dx = Math.sin(a), dz = Math.cos(a);
    art.tube("treehouse curved stave", [
      [x + dx * 6.2, y + 0.5, z + dz * 6.2],
      [x + dx * 6.05, y + 4, z + dz * 6.05],
      [x + dx * 5.9, y + 7.5, z + dz * 5.9],
    ], 0.08, BARK_LIGHT);
    if (i % 4 === 0) {
      const window = art.oval("round cream window frame", [x + dx * 6.18, y + 4.3, z + dz * 6.18], [2.7, 3.1, 0.2], CREAM);
      window.rotation.y = a;
      const pane = art.oval("warm treehouse window", [x + dx * 6.32, y + 4.3, z + dz * 6.32], [2.2, 2.6, 0.12], DARK_TEAL);
      pane.rotation.y = a;
    }
    art.tube("balcony bent spindle", [
      [x + dx * 8, y + 0.5, z + dz * 8], [x + dx * 8.1, y + 1.5, z + dz * 8.1], [x + dx * 7.9, y + 2, z + dz * 7.9],
    ], 0.1, CREAM);
  }
  ring(art, "balcony copper handrail", [x, y + 2, z], 8, 0.13, COPPER);
  art.sign(`treehouse ${title}`, title, [x, y + 1.1, z - 8.2], 10, DARK_TEAL, 1.7);
  // Instrument-shaped exhausts belong to the houses, not repetitive trackside posts.
  for (let pipe = 0; pipe < 3; pipe++) {
    const px = x + 3 + pipe * 1.1;
    art.tube("treehouse wind organ", [[px, y + 8, z + 1], [px, y + 12 + pipe, z + 1], [px, y + 13 + pipe, z + 2]], 0.38, COPPER);
    ring(art, "wind organ lip", [px, y + 13 + pipe, z + 2], 0.48, 0.11, CREAM);
  }
  return art.finishStatic();
}

function canopyTree(art: Atelier, index: number, leaves: readonly Mesh[], course: CourseQuery): Mesh[] {
  const tree = COPPERWHISTLE.obstacles[index];
  const [x, y, z] = tree.position;
  const radius = tree.radius!;
  const root = new TransformNode(`copperwhistle tree ${index}`, art.scene);
  root.position.set(x, y, z);
  const h = tree.height;
  const shape: Contour[] = [
    [0, radius, radius], [h * 0.12, radius * 0.91, radius * 0.94],
    [h * 0.42, radius * 0.78, radius * 0.81, -0.2, 0.15],
    [h * 0.7, radius * 0.64, radius * 0.65, 0.3, -0.15],
    [h, radius * 0.45, radius * 0.46],
  ];
  art.sculpt("old fluted canopy trunk", shape, index % 3 ? BARK : BARK_LIGHT, root, 0.86, 12);
  for (let branch = 0; branch < 3; branch++) {
    const a = branch / 3 * Math.PI * 2 + index * 1.7;
    const dx = Math.sin(a), dz = Math.cos(a);
    art.sweep("curving canopy fork", [
      [0, h * 0.91, 0], [dx * 3, h + 4, dz * 3], [dx * 7.5, h + 8, dz * 7.5], [dx * 11, h + 8.5, dz * 11],
    ], [1.8, 1.4, 0.8, 0.13], BARK, root, 8);
  }
  art.batchModel(root, new Set(), true);
  const top = y + h + 10;
  for (let cluster = 0; cluster < 7; cluster++) {
    const a = cluster * 2.4 + index;
    const crown = leaves[(index + cluster) % leaves.length].createInstance(`canopy ${index}:${cluster}`);
    crown.position.set(x + Math.sin(a) * (cluster ? 8 : 0), top + (cluster ? Math.cos(a) * 2.4 : 5), z + Math.cos(a) * (cluster ? 8 : 0));
    crown.scaling.set(17 + index % 4, 8 + cluster % 3, 15 + cluster % 4);
    crown.rotation.y = a;
    crown.isPickable = false;
  }
  // Low understory crowns reveal the depth below the boardwalk without obstructing the drive.
  if (index % 2 === 0) {
    const crown = leaves[(index + 2) % leaves.length].createInstance(`understory ${index}`);
    crown.position.set(x, course.projectRoad(x, z).y - 18, z);
    crown.scaling.set(19, 9, 16);
    crown.isPickable = false;
  }
  return root.getChildMeshes().filter((mesh): mesh is Mesh => mesh instanceof Mesh);
}

function seedBasket(art: Atelier, hazard: CourseHazard): { root: TransformNode; casters: Mesh[] } {
  const root = new TransformNode(`copperwhistle hazard ${hazard.id}`, art.scene);
  root.position.set(...hazardPosition(hazard, 0));
  const d = hazard.radius * 2;
  art.oval("rounded hanging seed basket", [0, -0.12, 0], [d, hazard.height * 0.86, d], BARK_LIGHT, root, 0.8, 12);
  for (let level = 0; level < 4; level++) ring(art, "woven seed basket binding", [0, -0.72 + level * 0.41, 0], hazard.radius * (level === 0 ? 0.73 : 0.94), 0.05, CREAM, root);
  art.cylinder("seed basket copper rim", [0, 0.78, 0], d * 0.87, d * 0.92, 0.28, COPPER, root);
  for (let seed = 0; seed < 5; seed++) {
    const a = seed * 2.4;
    art.oval("basket seed", [Math.sin(a) * 0.62, 0.84, Math.cos(a) * 0.62], [0.65, 0.5, 0.75], seed % 2 ? CREAM : COPPER, root, 1, 6);
  }
  art.batchModel(root, new Set(), true);
  return { root, casters: root.getChildMeshes().filter((mesh): mesh is Mesh => mesh instanceof Mesh) };
}

function hollowLog(art: Atelier, course: CourseQuery): Mesh[] {
  const positions: number[] = [], indices: number[] = [];
  const rows = 18, sides = 16, shell = (rows + 1) * (sides + 1);
  for (let layer = 0; layer < 2; layer++) {
    for (let row = 0; row <= rows; row++) {
      const p = course.sampleRoad(0.383 + row / rows * 0.033);
      for (let side = 0; side <= sides; side++) {
        const angle = side / sides * Math.PI;
        const across = Math.cos(angle) * (8.4 + layer * 1.25);
        positions.push(p.x + p.dz * across, p.y + Math.sin(angle) * (7.8 + layer * 1.25) - 0.15, p.z - p.dx * across);
        if (row < rows && side < sides) {
          const a = layer * shell + row * (sides + 1) + side, b = a + sides + 1;
          if (layer) indices.push(a, b, a + 1, a + 1, b, b + 1);
          else indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
  }
  for (const row of [0, rows]) {
    for (let side = 0; side < sides; side++) {
      const a = row * (sides + 1) + side, b = a + shell;
      if (row === 0) indices.push(a, b, a + 1, a + 1, b, b + 1);
      else indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const p = course.sampleRoad(0.383 + row / rows * 0.033);
    for (const radius of [8.55, 9.1, 9.55]) {
      const grain: Triple[] = [];
      for (let side = 0; side <= 24; side++) {
        const angle = side / 24 * Math.PI;
        const across = Math.cos(angle) * radius;
        grain.push([p.x + p.dz * across + p.dx * (row ? 0.07 : -0.07), p.y + Math.sin(angle) * (radius - 0.6) - 0.15, p.z - p.dx * across + p.dz * (row ? 0.07 : -0.07)]);
      }
      art.tube("hollow-log end grain", grain, 0.045, CREAM);
    }
  }
  const log = art.mesh("curved hollow-log shell", positions, indices);
  log.material = art.material(BARK_LIGHT);
  log.receiveShadows = true;
  log.freezeWorldMatrix();
  return [log, ...art.finishStatic()];
}

export function makeCopperwhistleWorld(art: Atelier, course: CourseQuery): CourseWorld {
  const casters = buildCourseSurface(art, course, COPPERWHISTLE);
  const crownSources = FOLIAGE.map(color => instanceSource(art, "layered autumn crown", color, 10));
  casters.push(...crownSources);
  for (let i = 0; i < COPPERWHISTLE.obstacles.length; i++) casters.push(...canopyTree(art, i, crownSources, course));
  for (const [index, title] of [[0, "COPPERWHISTLE"], [5, "DRAFT HOUSE"], [6, "LANDING LOFT"], [14, "SEED POST"]] as const) {
    casters.push(...treehouse(art, course, index, title));
  }
  casters.push(...hollowLog(art, course));

  for (let sector = 0; sector < 12; sector++) {
    for (let j = 0; j < 32; j++) {
      const u = (sector * 32 + j) / 384;
      if (course.isGap(u)) continue;
      const p = course.sampleRoad(u);
      const plank = art.box("boardwalk rounded-grain seam", [p.x, p.y + 0.048, p.z], [course.roadWidth - 0.12, 0.018, 0.09], j % 3 ? BARK_LIGHT : WOOD);
      plank.rotation.y = Math.atan2(p.dx, p.dz);
      if (j % 4 === 0) {
        for (const side of [-1, 1]) {
          const x = p.x + p.dz * side * 5.6, z = p.z - p.dx * side * 5.6;
          art.oval("boardwalk copper peg", [x, p.y + 0.075, z], [0.16, 0.035, 0.16], COPPER, undefined, 1, 6);
        }
      }
    }
    for (const side of [-1, 1]) {
      const bough: Triple[] = [];
      for (let step = 0; step <= 12; step++) {
        const p = course.sampleRoad((sector + step / 12) / 12);
        if (course.isGap(p.u)) {
          if (bough.length > 1) art.tube("curved branch viaduct", bough, 0.8, BARK);
          bough.length = 0;
          continue;
        }
        bough.push([p.x + p.dz * side * 5.5, p.y - 1.2, p.z - p.dx * side * 5.5]);
      }
      if (bough.length > 1) art.tube("curved branch viaduct", bough, 0.8, BARK);
    }
    casters.push(...art.finishStatic());
  }
  for (const [start, end] of [[0.08, 0.19], [0.345, 0.42], [0.82, 0.92]]) {
    for (const side of [-1, 1]) {
      const cable: Triple[] = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const p = course.sampleRoad(start + (end - start) * t);
        const x = p.x + p.dz * 6.75 * side, z = p.z - p.dx * 6.75 * side;
        const height = 1.3 + 4 * (2 * t - 1) ** 2;
        cable.push([x, p.y + height, z]);
        if (i % 3 === 0) art.tube("bridge rope hanger", [[x, p.y - 0.7, z], [x, p.y + height, z]], 0.055, CREAM);
      }
      art.tube("sagging suspension rope", cable, 0.15, CREAM);
    }
    casters.push(...art.finishStatic());
  }

  // The shortcut's ribbed bark and low outer lip explain its rough, narrow support.
  const shortcut = COPPERWHISTLE.shortcuts[0];
  art.tube("inner-bough underside", shortcut.points.map(([x, y, z]) => [x, y - 1.9, z]), 1.7, BARK);
  routeSign(art, course, "LEAF-DRAFT LAUNCH", 0.225, -1, DARK_TEAL, 12);
  routeSign(art, course, "INNER BOUGH · ROUGH", 0.487, 1, DARK_TEAL, 12);
  routeSign(art, course, "SEED BASKETS AHEAD", 0.10, 1, DARK_TEAL, 12);
  casters.push(...portal(art, course, "Copperwhistle start bough", 0.985, BARK_LIGHT, TEAL));
  casters.push(...portal(art, course, "leaf draft launch arch", 0.245, COPPER, CREAM));
  casters.push(...portal(art, course, "landing loft arch", 0.289, TEAL, CREAM));
  casters.push(...art.finishStatic());

  const baskets = COPPERWHISTLE.hazards.filter(hazard => hazard.kind === "sweeper").map(hazard => {
    const rig = seedBasket(art, hazard);
    casters.push(...rig.casters);
    const [x, y, z] = hazard.position;
    const axis = hazard.motion!.axis;
    const span = hazard.motion!.amplitude + 3;
    const beam: Triple[] = axis === "x"
      ? [[x - span, y + 8, z], [x, y + 9, z], [x + span, y + 8, z]]
      : [[x, y + 8, z - span], [x, y + 9, z], [x, y + 8, z + span]];
    art.tube("seed basket overhead branch", beam, 0.65, BARK);
    const tetherRoot = new TransformNode("basket animated tether", art.scene);
    const tether = art.cylinder("basket suspension cord", [x, y + 4.8, z], 0.11, 0.11, 8, CREAM, tetherRoot);
    return { hazard, ...rig, tether };
  });
  casters.push(...art.finishStatic());

  const leafSources = [COPPER, CREAM, "#c79b43"].map(color => instanceSource(art, "copperwhistle drifting leaf", color, 6));
  const falling = Array.from({ length: 42 }, (_, i) => {
    const p = course.sampleRoad((i * 0.61803398875) % 1);
    const leaf = leafSources[i % leafSources.length].createInstance(`drifting leaf ${i}`);
    leaf.scaling.set(0.75, 0.06, 1.45);
    leaf.isPickable = false;
    return { leaf, x: p.x + Math.sin(i * 2.4) * 15, y: p.y + 5 + i % 8, z: p.z + Math.cos(i * 2.4) * 15, phase: i * 1.7 };
  });
  const gust = COPPERWHISTLE.hazards.find(hazard => hazard.kind === "gust")!;
  const gustRoot = new TransformNode("leaf draft gameplay field", art.scene);
  const draftLeaves = Array.from({ length: 9 }, (_, i) => {
    const leaf = leafSources[i % leafSources.length].createInstance(`leaf draft tell ${i}`);
    leaf.parent = gustRoot;
    leaf.scaling.set(0.55, 0.06, 1.1);
    leaf.isPickable = false;
    return leaf;
  });
  const frame = art.tube("leaf draft field outline", [
    [-gust.radius, -4, 0], [-gust.radius, 0, 0], [-gust.radius * 0.8, 3, 0],
  ], 0.07, CREAM, gustRoot);
  frame.visibility = 0.7;
  return {
    casters,
    environment: {
      sky: COPPERWHISTLE.palette.sky, fogStart: 195, fogEnd: 560, sun: "#ffe3b0", sunIntensity: 1.27,
      fill: "#c1d2bd", fillIntensity: 0.6, ground: COPPERWHISTLE.palette.ground,
    },
    animate(time, reducedMotion = false) {
      for (const { hazard, root, tether } of baskets) {
        const position = hazardPosition(hazard, time);
        root.position.set(...position);
        const [x, y, z] = hazard.position;
        const dx = position[0] - x, dz = position[2] - z, dy = 8;
        tether.position.set(x + dx / 2, y + 0.8 + dy / 2, z + dz / 2);
        tether.scaling.y = Math.hypot(dx, dy, dz) / 8;
        tether.rotation.z = Math.atan2(dx, dy);
        tether.rotation.x = -Math.atan2(dz, dy);
      }
      gustRoot.position.set(...hazardPosition(gust, time));
      for (let i = 0; i < draftLeaves.length; i++) {
        const a = i * 2.4 + time * 0.8;
        draftLeaves[i].position.set(Math.sin(a) * 4.7, ((time * 1.8 + i * 1.3) % 10 + 10) % 10 - 5, Math.cos(a) * 4.7);
        draftLeaves[i].rotation.y = -a;
      }
      const decorationTime = reducedMotion ? 0 : time;
      for (const { leaf, x, y, z, phase } of falling) {
        leaf.position.set(x + Math.sin(decorationTime * 0.24 + phase) * 2, y - ((decorationTime * 0.55 + phase) % 8 + 8) % 8, z + Math.cos(decorationTime * 0.18 + phase));
        leaf.rotation.set(0.25 * Math.sin(decorationTime + phase), phase + decorationTime * 0.3, 0.3);
      }
    },
  };
}
