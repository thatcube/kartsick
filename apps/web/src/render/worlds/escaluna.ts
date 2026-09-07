import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { CourseQuery } from "@kartsick/content";
import { ESCALUNA } from "../../../../../packages/content-layouts/escaluna";
import { hazardPosition } from "../../../../../packages/content-layouts/types";
import { buildCourseSurface } from "../course-surface";
import type { Atelier, Triple } from "../geometry";
import type { CourseWorld } from "../world-types";

const CREAM = "#fff2db", LILAC = "#b295d1", POOL = "#79cbdb", APRICOT = "#efb995", INK = "#65567e";

function horizontalArc(x: number, y: number, z: number, radius: number, from: number, to: number, count = 24): Triple[] {
  return Array.from({ length: count + 1 }, (_, i) => {
    const a = from + (to - from) * i / count;
    return [x + Math.cos(a) * radius, y, z + Math.sin(a) * radius];
  });
}

/** Annular masonry is actual curved architecture, not a chain of cube facades. */
function curvedWall(art: Atelier, name: string, center: Triple, radius: number, thickness: number,
  height: number, from: number, to: number, color: string): void {
  const [x, y, z] = center, positions: number[] = [], indices: number[] = [];
  const count = Math.max(8, Math.ceil(Math.abs(to - from) * radius / 4));
  for (let i = 0; i <= count; i++) {
    const a = from + (to - from) * i / count;
    for (const [r, h] of [[radius, 0], [radius, height], [radius + thickness, height], [radius + thickness, 0]]) {
      positions.push(x + Math.cos(a) * r, y + h, z + Math.sin(a) * r);
    }
    if (i < count) for (let side = 0; side < 4; side++) {
      const a = i * 4 + side, b = i * 4 + (side + 1) % 4;
      indices.push(a, a + 4, b, b, a + 4, b + 4);
    }
  }
  const end = count * 4;
  indices.push(0, 1, 2, 0, 2, 3, end, end + 2, end + 1, end, end + 3, end + 2);
  art.place(art.mesh(name, positions, indices), [0, 0, 0], art.material(color));
}

function shop(art: Atelier, name: string, position: Triple, yaw: number, color: string, variant: number): void {
  const [x, y, z] = position;
  const point = (px: number, py: number, pz: number): Triple =>
    [x + Math.cos(yaw) * px + Math.sin(yaw) * pz, y + py, z - Math.sin(yaw) * px + Math.cos(yaw) * pz];
  const box = (label: string, p: Triple, size: Triple, tint: string) => {
    const mesh = art.box(label, point(...p), size, tint);
    mesh.rotation.y = yaw;
    return mesh;
  };
  box("shopfront frame", [0, 5.3, 0], [10.6, 10.6, 0.6], CREAM);
  box("shop window", [0, 4.4, -0.36], [9.5, 7.2, 0.12], "#829eb9");
  for (const side of [-1, 1]) box("shop window mullion", [side * 1.7, 4.4, -0.47], [0.14, 7.2, 0.14], CREAM);
  box("shop fascia", [0, 9.1, -0.65], [10.2, 2.1, 0.9], color);
  for (let i = -3; i <= 3; i++) {
    const awning = art.oval("scalloped fabric awning", point(i * 1.43, 7.4, -1.05),
      [1.55, 0.95, 2.6], i % 2 ? color : CREAM, undefined, 1, 8);
    awning.rotation.y = yaw;
  }
  const board = art.sign(`shop ${name}`, name, point(0, 9.15, -1.14), 8.5, INK, 1.6);
  board.rotation.y = yaw;
  // Each window has a different authored silhouette: lamps, shoes, teapots or stacked hats.
  for (const side of [-1, 1]) {
    const p = point(side * 3.2, 2.4, -0.64);
    box("window display shelf", [side * 3.2, 1.5, -0.65], [2.5, 0.2, 0.5], CREAM);
    if (variant % 4 === 0) {
      art.cylinder("display lamp stem", [p[0], p[1] + 0.6, p[2]], 0.15, 0.2, 1.7, CREAM);
      art.cylinder("display lamp shade", [p[0], p[1] + 1.5, p[2]], 0.7, 1.7, 1.2, color);
    } else if (variant % 4 === 1) {
      const shoe = art.oval("display shoe", p, [2.1, 1.1, 0.6], color, undefined, 0.8, 8);
      shoe.rotation.y = yaw + side * 0.15;
      box("shoe sole", [side * 3.2, 1.9, -0.72], [2.2, 0.18, 0.7], CREAM);
    } else if (variant % 4 === 2) {
      art.oval("display teapot", p, [1.6, 1.5, 0.8], color, undefined, 1, 8);
      art.oval("teapot lid", [p[0], p[1] + 0.8, p[2]], [1.1, 0.35, 0.6], CREAM, undefined, 1, 6);
    } else {
      art.oval("display hat brim", p, [2.2, 0.3, 0.7], CREAM, undefined, 1, 8);
      art.oval("display hat crown", [p[0], p[1] + 0.5, p[2]], [1.35, 1, 0.6], color, undefined, 0.7, 8);
    }
  }
}

export function makeEscalunaWorld(art: Atelier, course: CourseQuery): CourseWorld {
  const casters: Mesh[] = [...buildCourseSurface(art, course, ESCALUNA)];
  const scene = art.scene;
  const painted = new Set<DynamicTexture>();
  for (const caster of casters) {
    const texture = caster.material instanceof StandardMaterial ? caster.material.diffuseTexture : null;
    if (!(texture instanceof DynamicTexture) || painted.has(texture)) continue;
    painted.add(texture);
    const context = texture.getContext(), size = texture.getSize();
    for (let i = 0; i < 180; i++) {
      const x = (i * 41.37) % size.width, y = (i * 67.93) % size.height;
      if (Math.abs(x - size.width / 2) < 7) continue;
      context.fillStyle = [CREAM, "#bdb6d7", "#b7c9d8"][i % 3];
      context.fillRect(x, y, i % 2 ? 1.6 : 2.6, i % 3 ? 1.2 : 2.1);
    }
    texture.update();
  }
  for (const obstacle of ESCALUNA.obstacles) {
    const [x, y, z] = obstacle.position, height = obstacle.height;
    if (obstacle.shape === "box") {
      art.box(obstacle.id, [x, y + height / 2, z], [obstacle.halfX! * 2, height, obstacle.halfZ! * 2], APRICOT);
      art.box("parcel strap", [x, y + height + 0.03, z], [0.35, 0.06, obstacle.halfZ! * 2], INK);
    } else {
      art.cylinder(obstacle.id, [x, y + height / 2, z], obstacle.radius! * 2, obstacle.radius! * 2,
        height, obstacle.id.includes("fountain") ? LILAC : CREAM);
    }
    casters.push(...art.finishStatic());
  }

  // Atrium: an airy, open bowl of curved galleries, with a glazed petal-shaped skylight above.
  const cx = -76, cz = 26;
  for (const [from, to] of [[-0.3, 0.94], [1.65, 2.52], [3.3, 4.12]] as const) {
    curvedWall(art, "atrium upper cornice", [cx, 19, cz], 78, 2.3, 2.4, from, to, CREAM);
    curvedWall(art, "atrium pool-blue frieze", [cx, 17.6, cz], 78.1, 1.5, 1.4, from, to, POOL);
    art.tube("curved brass gallery trim", horizontalArc(cx, 22, cz, 79, from, to), 0.18, APRICOT);
    casters.push(...art.finishStatic());
  }
  // All roof geometry is well above the road; the open perimeter avoids ambiguous invisible walls.
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2;
    const rib: Triple[] = [];
    const positions: number[] = [], indices: number[] = [];
    for (let j = 0; j <= 12; j++) {
      const t = j / 12, r = t * 76, y = 42 - t * t * 18;
      rib.push([cx + Math.cos(angle) * r, y, cz + Math.sin(angle) * r]);
      for (const side of [0, 1]) {
        const a = angle + side * Math.PI / 4;
        positions.push(cx + Math.cos(a) * r, y + 0.03, cz + Math.sin(a) * r);
      }
      if (j < 12) {
        const a = j * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    art.tube("skylight radial rib", rib, 0.3, CREAM);
    const glass = art.mesh("skylight petal glazing", positions, indices);
    const material = art.material(i % 2 ? "#c5e1e4" : "#d8dbee");
    material.backFaceCulling = false;
    glass.material = material;
    glass.freezeWorldMatrix();
    for (const r of [25, 51, 76]) {
      art.tube("skylight curved glazing bar", horizontalArc(cx, 42 - (r / 76) ** 2 * 18 + 0.08, cz,
        r, angle, angle + Math.PI / 4, 8), 0.15, CREAM);
    }
    art.finishStatic();
  }
  art.oval("skylight central boss", [cx, 42.3, cz], [6, 1, 6], APRICOT, undefined, 1, 10);
  art.finishStatic();

  // The basin is deliberately shallow decorative water, not a water-driving or kill volume.
  art.cylinder("fountain water", [cx, 2.75, cz], 20.8, 20.8, 0.07, POOL);
  art.cylinder("fountain central pedestal", [cx, 4.5, cz], 3, 5, 3.5, CREAM);
  art.oval("fountain upper bowl", [cx, 6.5, cz], [9, 1.6, 9], LILAC, undefined, 1, 14);
  art.cylinder("fountain upper pool", [cx, 7.1, cz], 7.6, 7.6, 0.06, POOL);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, jet: Triple[] = [];
    for (let j = 0; j <= 12; j++) {
      const t = j / 12, r = 1 + t * 7.3;
      jet.push([cx + Math.cos(a) * r, 7.3 + Math.sin(t * Math.PI) * 2.8 - 4.5 * t, cz + Math.sin(a) * r]);
    }
    art.tube("fountain arcing jet", jet, 0.09, "#b1e9eb");
  }
  casters.push(...art.finishStatic());

  const displays = new TransformNode("galleria kinetic display", scene);
  displays.position.set(cx, 15, cz);
  art.tube("kinetic suspension", [[cx, 19, cz], [cx, 41.5, cz]], 0.07, CREAM);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    const px = Math.cos(a) * 9, pz = Math.sin(a) * 9;
    art.tube("display spoke", [[0, 0, 0], [px, i % 2 ? -0.8 : 0.8, pz]], 0.09, CREAM, displays);
    const petal = art.oval("display enamel petal", [px, i % 2 ? -0.8 : 0.8, pz], [4.6, 1.4, 2.6],
      i % 2 ? APRICOT : LILAC, displays, 1, 10);
    petal.rotation.y = -a;
  }
  art.oval("display moon hub", [0, 0, 0], [3.2, 3.2, 3.2], POOL, displays, 1, 12);
  art.batchModel(displays, new Set());
  art.finishStatic();

  // A bespoke shopping run alternates awning palettes and window contents.
  const shops: readonly [string, Triple, number, string][] = [
    ["SOFT ORBIT", [-107, 1.2, -72], 0, LILAC],
    ["SOLE PARADE", [-80, 1.2, -74], 0, APRICOT],
    ["CUP & COMET", [-51, 1.2, -72], 0, POOL],
    ["HAT HALO", [-22, 1.2, -66], -0.27, LILAC],
    ["PAPER MOON", [29, 4, -19], -1.02, APRICOT],
    ["LITTLE LUMEN", [-216, 1.2, -47], -Math.PI / 2, POOL],
    ["VELVET LOOP", [-120, 7, 107], 0, APRICOT],
    ["ODD HOURS", [-69, 7, 110], 0, LILAC],
  ];
  shops.forEach(([name, position, yaw, color], index) => {
    shop(art, name, position, yaw, color, index);
    casters.push(...art.finishStatic());
  });

  // Rounded balcony trims follow the actual climb; no second road overlaps it in XZ.
  for (const [from, to] of [[0.118, 0.31], [0.71, 0.88]] as const) {
    const count = 48;
    for (let group = 0; group < 4; group++) {
      for (const side of [-1, 1]) {
        const rim: Triple[] = [];
        for (let i = group * count / 4; i <= (group + 1) * count / 4; i++) {
          const p = course.sampleRoad(from + (to - from) * i / count);
          rim.push([p.x + p.dz * side * 7.3, p.y - 0.32, p.z - p.dx * side * 7.3]);
        }
        art.tube("promenade rounded apron", rim, 0.37, APRICOT);
      }
      art.finishStatic();
    }
  }
  for (let i = 0; i < 17; i++) {
    const p = course.sampleRoad(0.13 + i * 0.0055);
    for (const side of [-1, 1]) {
      const step = art.box("escalator side tread", [p.x + p.dz * side * 6.7, p.y + 0.07,
        p.z - p.dx * side * 6.7], [0.35, 0.14, 0.8], INK);
      step.rotation.y = Math.atan2(p.dx, p.dz);
    }
  }
  art.finishStatic();

  // The outdoor skycourt frames the straight glide; its arch ends never enter the landing lane.
  for (const z of [-73, -106]) {
    const p = course.sampleRoad(z === -73 ? 0.378 : 0.405);
    const arch: Triple[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = i / 24 * Math.PI;
      arch.push([p.x + Math.cos(a) * 15, p.y + 3 + Math.sin(a) * 16, z]);
    }
    art.tube("skycourt petal arch", arch, 0.55, CREAM);
    art.tube("skycourt apricot inset", arch.map(([x, y, z]) => [x, y + 0.8, z]), 0.15, APRICOT);
    casters.push(...art.finishStatic());
  }
  const flight = course.sampleRoad(0.355);
  const flySign = art.sign("skycourt departure sign", "SKYCOURT", [flight.x, flight.y + 9.5, flight.z], 12, INK, 2.5);
  flySign.rotation.y = Math.PI;
  for (const u of [0.348, 0.355, 0.365, 0.397, 0.407, 0.417]) {
    const p = course.sampleRoad(u);
    for (const side of [-1, 1]) {
      art.oval("skycourt approach bollard", [p.x + p.dz * side * 8.1, p.y + 0.7,
        p.z - p.dx * side * 8.1], [0.7, 1.4, 0.7], POOL, undefined, 0.7, 8);
    }
  }
  art.finishStatic();

  // Planters share their visible, closed pot dimensions with the layout collision cylinders.
  for (const id of ["citrus-planter", "promenade-planter"]) {
    const pot = ESCALUNA.obstacles.find(obstacle => obstacle.id === id)!;
    const [x, y, z] = pot.position, top = y + pot.height;
    art.cylinder("planter pool-blue rim", [x, top - 0.2, z], pot.radius! * 2 + 0.12,
      pot.radius! * 2 + 0.12, 0.4, POOL);
    art.cylinder("planter soil", [x, top + 0.02, z], pot.radius! * 1.8, pot.radius! * 1.8, 0.04, INK);
    art.cylinder("citrus trunk", [x, top + 1.7, z], 0.4, 0.6, 3.4, "#a47c69");
    art.oval("citrus crown", [x, top + 4, z], [6, 5, 6], "#91b99d", undefined, 1, 12);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      art.oval("citrus fruit", [x + Math.cos(a) * 2.4, top + 3.5, z + Math.sin(a) * 2.4], [0.6, 0.65, 0.6], APRICOT, undefined, 1, 6);
    }
    casters.push(...art.finishStatic());
  }

  // A rotunda kiosk and two open loading canopies distinguish the low outdoor return.
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    art.tube("kiosk window divider", [[115 + Math.cos(a) * 7.55, 2, -116 + Math.sin(a) * 7.55],
      [115 + Math.cos(a) * 7.55, 8, -116 + Math.sin(a) * 7.55]], 0.12, LILAC);
  }
  art.cylinder("kiosk glass belt", [115, 5, -116], 15.05, 15.05, 6, POOL);
  art.oval("kiosk domed roof", [115, 10, -116], [16, 5, 16], APRICOT, undefined, 1, 14);
  casters.push(...art.finishStatic());
  for (const x of [-65, -119]) {
    art.oval("loading bay cantilever", [x, 11, -224], [43, 2.2, 16], CREAM, undefined, 0.75, 12);
    art.box("loading bay lintel", [x, 7.6, -228], [36, 5, 1.2], LILAC);
    for (let i = -2; i <= 2; i++) {
      art.box("loading door", [x + i * 6.6, 4, -228.65], [5.6, 6.8, 0.15], "#899bb1");
      for (let y = 1; y < 7; y++) art.box("loading door slat", [x + i * 6.6, y, -228.76], [5.5, 0.08, 0.08], CREAM);
    }
    art.sign("loading bay lettering", "GOODS IN", [x, 8.4, -228.8], 11, INK, 1.7);
    casters.push(...art.finishStatic());
  }
  const dock = course.sampleRoad(0.511);
  const dockSign = art.sign("loading shortcut marker", "LOADING DOCK", [dock.x, dock.y + 5, dock.z + 10], 10, INK, 1.8);
  dockSign.rotation.y = Math.atan2(dock.dx, dock.dz);
  for (const [x, y, z] of ESCALUNA.shortcuts[0].points.slice(1, -1)) {
    for (const side of [-1, 1]) art.box("dock path edge stud", [x + side * 2.7, y + 0.06, z], [0.35, 0.12, 0.9], APRICOT);
  }
  art.finishStatic();

  // Exterior perimeter is composed in short curved groups, leaving the skycourt open to the sky.
  for (const [x, z, radius, from, to] of [[-118, -73, 123, 2.7, 4.55], [65, -70, 174, 4.3, 5.6], [-63, 24, 123, 0.1, 2.4]] as const) {
    curvedWall(art, "galleria distant curved shell", [x, 0, z], radius, 3, 20, from, to, LILAC);
    curvedWall(art, "galleria exterior fascia", [x, 17, z], radius - 0.5, 4, 3, from, to, CREAM);
    curvedWall(art, "galleria high ribbon glazing", [x, 11, z], radius + 3.05, 0.12, 4.5, from, to, POOL);
    art.finishStatic();
  }

  const hazardRoots = ESCALUNA.hazards.map(hazard => {
    const root = new TransformNode(hazard.id, scene);
    art.cylinder(`${hazard.id} collision body`, [0, 0, 0], hazard.radius * 2, hazard.radius * 2,
      hazard.height, hazard.kind === "sweeper" ? POOL : APRICOT, root);
    if (hazard.kind === "sweeper") {
      art.cylinder("cleaning cart apron", [0, -0.55, 0], hazard.radius * 2.01, hazard.radius * 2.01, 0.35, INK, root);
      art.box("cart face display", [0, 0.2, -1.24], [1.2, 0.55, 0.12], CREAM, root);
      for (const side of [-1, 1]) art.oval("cart eye", [side * 0.3, 0.2, -1.32], [0.16, 0.18, 0.1], INK, root, 1, 6);
    } else {
      art.cylinder("bumper visible belt", [0, 0, 0], hazard.radius * 2.03, hazard.radius * 2.03, 0.35, LILAC, root);
    }
    art.batchModel(root, new Set());
    casters.push(...root.getChildMeshes().filter((mesh): mesh is Mesh => mesh instanceof Mesh));
    root.position.set(...hazardPosition(hazard, 0));
    return root;
  });
  for (const z of [-104, -94]) {
    art.box("cleaning cart stop", [-63, 1.26, z], [3.4, 0.08, 1], APRICOT);
  }
  for (const z of [-106.6, -91.4]) {
    art.oval("cleaning crossing warning", [-63, 2.5, z], [0.65, 0.65, 0.65], APRICOT, undefined, 1, 6);
  }
  art.sign("cleaning cart caution", "CLEANING CROSSING", [-63, 6.7, -87], 9.8, INK, 1.5);
  art.finishStatic();
  const start = course.sampleRoad(0);
  const welcome = art.sign("galleria race welcome", "ESCALUNA GALLERIA", [start.x, start.y + 8.6, start.z], 17, INK, 2.8);
  welcome.rotation.y = Math.atan2(start.dx, start.dz);

  return {
    casters,
    environment: {
      sky: ESCALUNA.palette.sky, fogStart: 140, fogEnd: 380,
      sun: "#fff0d9", sunIntensity: 0.95, fill: "#d9d6f4", fillIntensity: 0.9, ground: "#a69aaa",
    },
    animate(time, reducedMotion = false) {
      hazardRoots.forEach((root, index) => root.position.set(...hazardPosition(ESCALUNA.hazards[index], time)));
      displays.rotation.y = reducedMotion ? 0 : time * 0.22;
    },
  };
}
