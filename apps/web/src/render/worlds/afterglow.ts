import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { CourseQuery } from "@kartsick/content";
import { AFTERGLOW } from "../../../../../packages/content-layouts/afterglow";
import { hazardPosition } from "../../../../../packages/content-layouts/types";
import type { CourseObstacle } from "../../../../../packages/content-layouts/types";
import { buildCourseSurface } from "../course-surface";
import type { Atelier, Triple } from "../geometry";
import type { CourseWorld } from "../world-types";

const PEACH = "#ffd0ad", INK = "#464c7c", GLASS = "#80e4df", SIGNAL = "#ef78b3";

function arc(x: number, y: number, z: number, rx: number, ry: number): Triple[] {
  return Array.from({ length: 25 }, (_, i) => {
    const angle = i / 24 * Math.PI;
    return [x + Math.cos(angle) * rx, y + Math.sin(angle) * ry, z];
  });
}

function solid(art: Atelier, obstacle: CourseObstacle): void {
  const [x, y, z] = obstacle.position;
  if (obstacle.shape === "box") {
    art.box(obstacle.id, [x, y + obstacle.height / 2, z],
      [obstacle.halfX! * 2, obstacle.height, obstacle.halfZ! * 2], INK);
  } else {
    art.cylinder(obstacle.id, [x, y + obstacle.height / 2, z],
      obstacle.radius! * 2, obstacle.radius! * 2, obstacle.height,
      obstacle.id.startsWith("deck") ? "#6c769b" : PEACH);
  }
}

export function makeAfterglowWorld(art: Atelier, course: CourseQuery): CourseWorld {
  const casters: Mesh[] = [...buildCourseSurface(art, course, AFTERGLOW)];
  const scene = art.scene;

  // Collision volumes are the visible solid cores; trim stays outside the driving envelope.
  for (const obstacle of AFTERGLOW.obstacles) {
    solid(art, obstacle);
    if (obstacle.id.startsWith("deck")) {
      const [x, y, z] = obstacle.position;
      const top = y + obstacle.height;
      art.oval("flared skyway bearing", [x, top - 0.7, z], [9, 1.4, 4], PEACH, undefined, 1, 8);
      art.cylinder("support collar", [x, top - 3, z], 3.1, 3.1, 0.25, GLASS);
    }
    casters.push(...art.finishStatic());
  }

  // The long terminal has bowed roof brows, alternating glazing and a ticketing mezzanine.
  art.oval("terminal enamel roof", [-15, 32, -94], [65, 5, 24], PEACH, undefined, 0.7, 16);
  for (const level of [15, 23, 29]) {
    art.box("terminal window ribbon", [-15, level, -105.06], [59, 3.8, 0.12], GLASS);
    art.box("terminal sunshade", [-15, level + 2.2, -106], [63, 0.35, 2.2], PEACH);
    for (let x = -43; x < 16; x += 5) {
      art.box("window mullion", [x, level, -105.2], [0.25, 4, 0.2], INK);
      if (level === 23) art.box("departure counter", [x + 1.5, 21.8, -105.24], [2, 0.5, 0.18], SIGNAL);
    }
  }
  art.sign("municipal terminal name", "AFTERGLOW AIRWAY", [-15, 30, -107], 27, INK, 3.4);
  art.sign("terminal departures", "DEPARTURES  •  08", [-15, 23, -107.3], 15, INK, 2.5);
  casters.push(...art.finishStatic());

  // A restrained, circular tower silhouette is visible from both the runway and return lane.
  for (const y of [12, 24, 36, 48]) {
    art.cylinder("tower luminous belt", [83, y, -83], 11.06, 11.06, 0.35, GLASS);
  }
  art.cylinder("control room glass", [83, 52, -83], 11.08, 11.08, 6, GLASS);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    art.tube("control room rib", [[83 + Math.cos(a) * 5.6, 49, -83 + Math.sin(a) * 5.6],
      [83 + Math.cos(a) * 5.6, 55, -83 + Math.sin(a) * 5.6]], 0.12, INK);
  }
  art.oval("tower roof", [83, 57, -83], [11.5, 2, 11.5], PEACH, undefined, 1, 12);
  art.cylinder("tower aerial", [83, 63, -83], 0.13, 0.25, 10, PEACH);
  art.oval("tower signal", [83, 68.2, -83], [0.7, 0.7, 0.7], SIGNAL, undefined, 1, 6);
  casters.push(...art.finishStatic());

  // The runway's signature is an open departure portal, not a filled ring across the flight.
  for (const z of [-0.8, 6.8]) {
    art.tube("departure arch enamel", arc(152, 35, z, 22, 25), 1.1, PEACH);
    art.tube("departure arch inner light", arc(152, 35, z - 0.2, 20.5, 23.5), 0.2, GLASS);
  }
  for (let i = 0; i <= 12; i++) {
    const a = i / 12 * Math.PI;
    const x = 152 + Math.cos(a) * 22, y = 35 + Math.sin(a) * 25;
    art.tube("portal transverse rib", [[x, y, -0.8], [x, y, 6.8]], 0.22, SIGNAL);
  }
  art.sign("flight departure", "TAKE FLIGHT", [152, 53, -1.9], 16, INK, 3);
  for (const u of [0.226, 0.235, 0.243, 0.283, 0.292, 0.302]) {
    const p = course.sampleRoad(u);
    for (const side of [-1, 1]) {
      const x = p.x + p.dz * side * 8.3, z = p.z - p.dx * side * 8.3;
      art.cylinder("approach light stalk", [x, p.y + 0.9, z], 0.17, 0.17, 1.8, PEACH);
      const light = art.oval("approach light", [x, p.y + 1.8, z], [0.65, 0.5, 0.65], SIGNAL, undefined, 1, 6);
      light.material = art.material(SIGNAL, true);
    }
  }
  casters.push(...art.finishStatic());

  // Platform-edge beacons and canopy groups are culled in local stretches of the interchange.
  for (let group = 0; group < 12; group++) {
    for (let i = 0; i < 6; i++) {
      const u = (group * 6 + i) / 72;
      if (course.isGap(u)) continue;
      const p = course.sampleRoad(u);
      for (const side of [-1, 1]) {
        const x = p.x + p.dz * side * 7.5, z = p.z - p.dx * side * 7.5;
        const lamp = art.box("skyway edge beacon", [x, p.y + 0.18, z], [0.35, 0.3, 0.8], GLASS);
        lamp.rotation.y = Math.atan2(p.dx, p.dz);
        lamp.material = art.material(GLASS, true);
      }
    }
    art.finishStatic();
  }
  for (const u of [0.035, 0.145, 0.435, 0.575, 0.705, 0.955]) {
    const p = course.sampleRoad(u), yaw = Math.atan2(p.dx, p.dz);
    for (const side of [-1, 1]) {
      const x = p.x + p.dz * side * 12.7, z = p.z - p.dx * side * 12.7;
      const canopy = art.oval("turquoise platform shelter", [x, p.y + 6.8, z], [6, 1.5, 13], GLASS, undefined, 0.85, 12);
      canopy.rotation.y = yaw;
      const canopyRim = art.oval("shelter enamel rim", [x, p.y + 6.45, z], [6.3, 0.5, 13.3], PEACH, undefined, 0.85, 10);
      canopyRim.rotation.y = yaw;
      for (const along of [-4.4, 4.4]) {
        art.cylinder("shelter suspended mast", [x + p.dx * along, p.y + 3.2, z + p.dz * along], 0.25, 0.4, 6.4, PEACH);
      }
    }
    casters.push(...art.finishStatic());
  }

  // Technical-sector hangar has a rounded barrel vault and a luminous sliding-door rhythm.
  const roofPositions: number[] = [], roofIndices: number[] = [];
  for (let row = 0; row <= 1; row++) {
    for (let i = 0; i <= 20; i++) {
      const a = i / 20 * Math.PI;
      roofPositions.push(-205 + Math.cos(a) * 12.6, 20 + Math.sin(a) * 8, -13.5 + row * 27);
      if (row === 0 && i < 20) roofIndices.push(i, i + 21, i + 1, i + 1, i + 21, i + 22);
    }
  }
  art.place(art.mesh("hangar barrel vault", roofPositions, roofIndices), [0, 0, 0], art.material(PEACH));
  for (let x = -215; x < -194; x += 3.5) {
    art.box("hangar door glazing", [x, 14, -13.06], [2.5, 9, 0.1], GLASS);
  }
  art.sign("return route hangar", "AIR MAIL", [-205, 23, -13.7], 12, INK, 2.4);
  casters.push(...art.finishStatic());
  art.cylinder("arrival planter rim", [-101, 20.6, 86], 7.3, 7.3, 0.7, PEACH);
  art.oval("arrival cloud topiary", [-101, 23.5, 86], [6.8, 5.5, 6.8], GLASS, undefined, 1, 10);
  casters.push(...art.finishStatic());

  for (const [u, label] of [[0.728, "EXPRESS RETURN"], [0.19, "DEPARTURE 08"], [0.415, "ARRIVALS"]] as const) {
    const p = course.sampleRoad(u);
    const board = art.sign(`airway ${label}`, label,
      [p.x + p.dz * 10.5, p.y + 4.7, p.z - p.dx * 10.5], 8, INK, 1.7);
    board.rotation.y = Math.atan2(p.dx, p.dz);
  }
  // Decorative direction-free chevrons mark the narrow, rough low-return spur.
  const shortcut = AFTERGLOW.shortcuts[0];
  for (let i = 1; i < shortcut.points.length - 1; i++) {
    const [x, y, z] = shortcut.points[i];
    art.tube("express return inset", [[x - 1.1, y + 0.08, z + 1], [x, y + 0.08, z - 0.6], [x + 1.1, y + 0.08, z + 1]], 0.1, PEACH);
  }
  art.finishStatic();

  // Two depth layers of municipal skyline, deliberately outside the playable interchange.
  for (let group = 0; group < 7; group++) {
    for (let i = 0; i < 4; i++) {
      const x = -330 + group * 91 + i * 19;
      const z = 246 + (i % 2) * 35;
      const height = 19 + ((group * 13 + i * 7) % 37);
      const color = i % 2 ? "#66769a" : "#526587";
      art.box("skyline plinth", [x, -7 + height / 2, z], [12, height, 15], color);
      art.oval("skyline rounded crown", [x, -7 + height, z], [12, 6, 15], color, undefined, 0.8, 8);
      for (let floor = 1; floor < height / 7; floor++) {
        art.box("distant lit floor", [x, floor * 7 - 7, z - 7.56], [9, 0.55, 0.1], "#b4a0bc");
      }
    }
    art.finishStatic();
  }
  for (let group = 0; group < 3; group++) {
    const x = -315 + group * 235, z = -231 - group * 12;
    art.oval("distant airport hall", [x, 1, z], [88, 18, 37], "#596b91", undefined, 0.75, 10);
    for (let i = -3; i <= 3; i++) art.box("airport hall glazing", [x + i * 10, 1, z - 17], [7, 6, 0.2], "#809ab1");
    art.finishStatic();
  }

  const balloons: TransformNode[] = [];
  for (const [index, position] of ([[-266, 70, 175], [247, 91, 134], [-99, 107, 232]] as Triple[]).entries()) {
    const balloon = new TransformNode(`weather balloon ${index}`, scene);
    balloon.position.set(...position);
    art.oval("weather balloon envelope", [0, 0, 0], [7, 10, 7], index % 2 ? PEACH : SIGNAL, balloon, 1, 12);
    art.cylinder("weather balloon instrument", [0, -6.4, 0], 0.8, 0.9, 1.2, GLASS, balloon);
    art.tube("weather balloon tether", [[0, -4.8, 0], [0, -6, 0]], 0.04, PEACH, balloon);
    art.batchModel(balloon, new Set());
    balloons.push(balloon);
  }

  const hazardRoots = AFTERGLOW.hazards.map(hazard => {
    const root = new TransformNode(hazard.id, scene);
    art.cylinder("maintenance collision pod", [0, 0, 0], hazard.radius * 2,
      hazard.radius * 2, hazard.height, PEACH, root);
    art.cylinder("maintenance caution belt", [0, 0.1, 0], hazard.radius * 2.02,
      hazard.radius * 2.02, 0.38, SIGNAL, root);
    for (const side of [-1, 1]) {
      art.oval("maintenance eye", [side * 0.55, 0.48, -1.5], [0.4, 0.3, 0.12], INK, root, 1, 6);
    }
    art.batchModel(root, new Set());
    casters.push(...root.getChildMeshes().filter((mesh): mesh is Mesh => mesh instanceof Mesh));
    root.position.set(...hazardPosition(hazard, 0));
    return root;
  });
  const hazard = AFTERGLOW.hazards[0];
  art.tube("maintenance gantry overhead", [[-65, 18, -149], [-65, 25, -149], [-65, 26, -140], [-65, 25, -131], [-65, 18, -131]], 0.28, PEACH);
  for (const z of [-147.5, -132.5]) {
    art.box("maintenance waiting pad", [-65, 18.04, z], [4, 0.05, 2], SIGNAL);
  }
  art.sign("maintenance warning", "SERVICE CROSSING", [-70, 23.5, -149], 9, INK, 1.6);
  const caution = art.oval("maintenance caution lamp", [hazard.position[0], 26.4, hazard.position[2]], [0.75, 0.75, 0.75], SIGNAL, undefined, 1, 6);
  caution.material = art.material(SIGNAL, true);
  casters.push(...art.finishStatic());

  return {
    casters,
    environment: {
      sky: AFTERGLOW.palette.sky, fogStart: 145, fogEnd: 470,
      sun: "#ffd1b0", sunIntensity: 1.05, fill: "#acb6ee", fillIntensity: 0.85, ground: "#626586",
    },
    animate(time, reducedMotion = false) {
      hazardRoots.forEach((root, index) => root.position.set(...hazardPosition(AFTERGLOW.hazards[index], time)));
      balloons.forEach((balloon, index) => {
        balloon.rotation.z = reducedMotion ? 0 : Math.sin(time * 0.3 + index * 1.7) * 0.055;
      });
    },
  };
}
