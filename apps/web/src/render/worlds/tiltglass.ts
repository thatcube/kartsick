import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { CourseQuery } from "@kartsick/content";
import { TILTGLASS } from "../../../../../packages/content-layouts/tiltglass";
import { hazardPosition } from "../../../../../packages/content-layouts/types";
import type { CourseHazard } from "../../../../../packages/content-layouts/types";
import { buildCourseSurface } from "../course-surface";
import type { Atelier, Triple } from "../geometry";
import type { CourseWorld } from "../world-types";
import { instanceSource, portal, ring, routeSign } from "./tiltglass-copperwhistle-art";

const PEARL = "#f2e8d6", CHERRY = "#d84756", NAVY = "#263957", BRASS = "#c7a15d";
const CHROME = "#cfdfe4", INK = "#202b45", LAMP = "#ffe2a1", AQUA = "#78c5cb";

function mechanism(art: Atelier, index: number): Mesh[] {
  const obstacle = TILTGLASS.obstacles[index];
  const [x, y, z] = obstacle.position;
  const radius = obstacle.radius!;
  const base = y;
  art.cylinder(obstacle.id, [x, y + obstacle.height / 2, z], radius * 1.75, radius * 2, obstacle.height, index === 0 ? NAVY : PEARL);
  for (const level of [0.08, 0.3, 0.72, 0.94]) {
    ring(art, `${obstacle.id} machined collar`, [x, base + obstacle.height * level, z], radius * 0.92, 0.24, BRASS);
  }
  if (index === 0) {
    art.oval("score tower lacquer crown", [x, base + obstacle.height, z], [17, 5, 16], CHERRY, undefined, 1, 10);
    for (let drum = 0; drum < 3; drum++) {
      const dx = x + (drum - 1) * 4.3;
      art.oval("score window bezel", [dx, 24, z - 7.7], [4, 6.3, 0.6], BRASS);
      art.oval("score window navy glass", [dx, 24, z - 8.03], [3.5, 5.8, 0.2], INK);
      for (let dash = 0; dash < 3; dash++) {
        art.box("score reel luminous bars", [dx, 22.7 + dash * 1.4, z - 8.18], [2.2, 0.22, 0.1], LAMP).material = art.material(LAMP, true);
      }
    }
    art.sign("Tiltglass score header", "TILTGLASS", [x, 31, z - 8.4], 16, NAVY, 3);
    art.sign("Tiltglass lap notice", "THREE LAPS · ALL SKILL", [x, 16, z - 8.8], 15, NAVY, 2.3);
  } else if (index === 1) {
    const helix: Triple[] = [];
    for (let i = 0; i <= 128; i++) {
      const a = i / 128 * Math.PI * 14;
      helix.push([x + Math.cos(a) * 3.5, base + 1.5 + i / 128 * 14, z + Math.sin(a) * 3.5]);
    }
    art.tube("monumental launch spring", helix, 0.5, CHROME);
    art.cylinder("plunger stem", [x, base + 11, z], 2.5, 2.5, 17, CHROME);
    art.oval("cherry plunger cap", [x, base + 18, z], [12, 4, 12], CHERRY, undefined, 1, 12);
  } else {
    const top = base + obstacle.height;
    art.oval("cushion drum cap", [x, top - 0.9, z], [radius * 1.8, 2.7, radius * 1.8], index % 2 ? CHERRY : AQUA);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      art.oval("drum brass rivet", [x + Math.sin(a) * radius * 0.76, top + 0.1, z + Math.cos(a) * radius * 0.76],
        [0.65, 0.3, 0.65], BRASS, undefined, 1, 6);
    }
  }
  return art.finishStatic();
}

function hazardModel(art: Atelier, hazard: CourseHazard): { root: TransformNode; casters: Mesh[] } {
  const root = new TransformNode(`tiltglass hazard ${hazard.id}`, art.scene);
  root.position.set(...hazardPosition(hazard, 0));
  const diameter = hazard.radius * 2;
  if (hazard.id === "chrome-crossing") {
    art.oval("rolling chrome crossing ball", [0, 0, 0], [diameter, hazard.height, diameter], CHROME, root, 1, 14);
    ring(art, "chrome ball equator", [0, 0, 0], hazard.radius * 0.985, 0.025, BRASS, root);
  } else if (hazard.kind === "sweeper") {
    art.oval("flipper cam rubber nose", [0, 0, 0], [diameter, hazard.height, diameter], CHERRY, root, 0.8, 12);
    art.cylinder("flipper nose pivot", [0, 0.65, 0], diameter * 0.65, diameter * 0.65, 0.25, BRASS, root);
    art.oval("flipper nose ivory inset", [0, 0.88, 0], [diameter * 0.6, 0.12, diameter * 0.6], PEARL, root, 1, 8);
  } else {
    art.cylinder("bumper brass foot", [0, -0.75, 0], diameter * 0.85, diameter, 0.7, BRASS, root);
    art.oval("rounded rebound cushion", [0, 0, 0], [diameter, 1.3, diameter], CHERRY, root, 1, 12);
    art.cylinder("bumper pearl crown", [0, 0.72, 0], diameter * 0.72, diameter * 0.85, 0.4, PEARL, root);
    ring(art, "bumper lit rim", [0, 0.94, 0], hazard.radius * 0.67, 0.08, LAMP, root);
  }
  art.batchModel(root, new Set(), true);
  return { root, casters: root.getChildMeshes().filter((mesh): mesh is Mesh => mesh instanceof Mesh) };
}

export function makeTiltglassWorld(art: Atelier, course: CourseQuery): CourseWorld {
  const casters = buildCourseSurface(art, course, TILTGLASS);
  const polished = art.material(CHROME);
  polished.specularColor = new Color3(0.8, 0.87, 0.92);
  polished.specularPower = 112;
  const glass = art.material(INK);
  glass.specularColor = new Color3(0.38, 0.54, 0.68);
  glass.specularPower = 96;

  const frame: Triple[] = [
    [-241, -0.5, -142], [-249, -0.5, -134], [-249, -0.5, 195], [-237, -0.5, 208],
    [155, -0.5, 208], [167, -0.5, 195], [167, -0.5, -134], [155, -0.5, -147],
    [-231, -0.5, -147], [-241, -0.5, -142],
  ];
  art.tube("monumental cherry table cushion", frame, 2.5, CHERRY);
  art.tube("brass outer table piping", frame.map(([x, y, z]) => [x, y + 2.35, z]), 0.23, BRASS);
  art.tube("pearl table skirt", frame.map(([x, y, z]) => [x, y - 1.9, z]), 2.8, PEARL);
  casters.push(...art.finishStatic());
  for (let i = 0; i < TILTGLASS.obstacles.length; i++) casters.push(...mechanism(art, i));

  // Per-sector batches keep the rounded bank furniture spatially cullable.
  for (let sector = 0; sector < 12; sector++) {
    for (let j = 0; j < 8; j++) {
      const u = (sector * 8 + j) / 96;
      if (course.isGap(u) || (u > 0.48 && u < 0.65)) continue;
      const p = course.sampleRoad(u);
      for (const side of [-1, 1]) {
        const lateral = (course.roadWidth / 2 + 1) * side;
        const x = p.x + p.dz * lateral, z = p.z - p.dx * lateral;
        const cushion = art.oval("rounded perimeter cushion", [x, p.y + 0.08, z], [1.1, 0.45, 4.7], j % 3 === 0 ? PEARL : CHERRY, undefined, 0.9, 8);
        cushion.rotation.y = Math.atan2(p.dx, p.dz);
        art.oval("cushion brass button", [x, p.y + 0.4, z], [0.28, 0.15, 0.28], BRASS, undefined, 1, 6);
      }
    }
    casters.push(...art.finishStatic());
  }

  const lamps = [LAMP, AQUA, CHERRY].map(color => {
    const source = instanceSource(art, "table chase lamp", color, 6);
    source.material = art.material(color, true);
    return source;
  });
  const chase: InstancedMesh[] = [];
  for (let i = 0; i < 90; i++) {
    const p = course.sampleRoad(i / 90);
    if (course.isGap(p.u)) continue;
    const light = lamps[Math.floor(i / 3) % lamps.length].createInstance(`table chase ${i}`);
    light.position.set(p.x + p.dz * 8, p.y + 0.45, p.z - p.dx * 8);
    light.scaling.set(0.62, 0.14, 0.62);
    light.isPickable = false;
    chase.push(light);
  }
  const crossing = TILTGLASS.hazards[0];
  const warningRoot = new TransformNode("chrome crossing warning", art.scene);
  const countdown = Array.from({ length: 3 }, (_, i) => {
    const lamp = art.oval(`crossing countdown ${3 - i}`, [-21 - i * 3.2, 4, -122], [1.7, 0.1, 1.7], LAMP, warningRoot, 1, 8);
    lamp.material = art.material(LAMP, true);
    return lamp;
  });
  routeSign(art, course, "BALL CROSSING", 0.012, 1, NAVY, 10);
  routeSign(art, course, "SPRING LAUNCH", 0.225, -1, NAVY, 10);
  routeSign(art, course, "SERVICE CUT", 0.487, -1, NAVY, 9);
  routeSign(art, course, "MOVING FLIPPER", 0.68, 1, NAVY, 11);
  casters.push(...portal(art, course, "Tiltglass start arch", 0.985, PEARL, CHERRY));
  casters.push(...portal(art, course, "spring launch mouth", 0.246, CHERRY, BRASS));
  casters.push(...portal(art, course, "spring landing hoop", 0.289, AQUA, PEARL));

  // A high, stationary flipper mechanism spans the service cut; its cam is a layout collider.
  art.tube("under-flipper upper lever", [[-104, 14, 113], [-99, 14.5, 104], [-88, 14.2, 94]], 1.9, CHERRY);
  art.tube("under-flipper brass spine", [[-104, 15.8, 113], [-99, 16.3, 104], [-88, 16, 94]], 0.3, BRASS);
  casters.push(...art.finishStatic());
  const hazards = TILTGLASS.hazards.map(hazard => ({ hazard, ...hazardModel(art, hazard) }));
  for (const hazard of hazards) casters.push(...hazard.casters);
  return {
    casters,
    environment: {
      sky: TILTGLASS.palette.sky, fogStart: 260, fogEnd: 590, sun: "#ffe6c3", sunIntensity: 1.15,
      fill: "#b1c8e1", fillIntensity: 0.67, ground: TILTGLASS.palette.ground,
    },
    animate(time, reducedMotion = false) {
      for (const { hazard, root } of hazards) {
        root.position.set(...hazardPosition(hazard, time));
        if (hazard.id === "chrome-crossing") root.rotation.x = (root.position.z - hazard.position[2]) / hazard.radius;
      }
      // This is a gameplay warning, so it continues in reduced-motion mode.
      const motion = crossing.motion!;
      const phase = time * Math.PI * 2 / motion.period + motion.phase;
      const arriving = Math.abs(Math.sin(phase));
      for (let i = 0; i < countdown.length; i++) countdown[i].visibility = arriving < 0.35 + i * 0.22 ? 1 : 0.16;
      for (let i = 0; i < chase.length; i++) {
        const pulse = reducedMotion ? 0.8 : 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(time * 1.8 - i * 0.45));
        chase[i].scaling.set(0.62 * pulse, 0.14, 0.62 * pulse);
      }
    },
  };
}
