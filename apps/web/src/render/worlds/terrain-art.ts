import { Color3 } from "@babylonjs/core/Maths/math.color";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { CourseQuery } from "@kartsick/content";
import { hazardPosition } from "../../../../../packages/content-layouts/types";
import type { CourseHazard } from "../../../../../packages/content-layouts/types";
import type { Atelier } from "../geometry";

/** Shade the actual collidable earth: cliff faces, strata and terraces are not overlay hills. */
export function terrainMaterials(art: Atelier, course: CourseQuery, palette: {
  low: string; high: string; rock: string; lowY: number; highY: number;
}): void {
  const low = Color3.FromHexString(palette.low), high = Color3.FromHexString(palette.high);
  const rock = Color3.FromHexString(palette.rock);
  for (const mesh of art.scene.meshes) {
    if (!(mesh instanceof Mesh) || !mesh.name.startsWith(`${course.id} terrain `)) continue;
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const colors: number[] = [];
    for (let i = 0; i < positions.length; i += 3) {
      const [x, y, z] = positions.slice(i, i + 3);
      const slope = Math.hypot(course.terrainHeight(x + 4, z) - course.terrainHeight(x - 4, z),
        course.terrainHeight(x, z + 4) - course.terrainHeight(x, z - 4)) / 8;
      const elevation = Math.max(0, Math.min(1, (y - palette.lowY) / (palette.highY - palette.lowY)));
      const stone = Math.max(0, Math.min(0.85, (slope - 0.18) * 0.85));
      const color = Color3.Lerp(Color3.Lerp(low, high, elevation), rock, stone);
      const band = 0.94 + 0.06 * Math.sin(y * 0.55 + Math.sin(z * 0.027) * 0.7);
      colors.push(color.r * band, color.g * band, color.b * band, 1);
    }
    mesh.setVerticesData(VertexBuffer.ColorKind, colors);
  }
}

/** Position and warning state both come from the physical hazard; reduced motion must not park it. */
export function hazardApproaches(art: Atelier, course: CourseQuery, hazards: readonly CourseHazard[],
  colors: { frame: string; signal: string; dark: string }): { casters: Mesh[]; animate(time: number): void } {
  const casters: Mesh[] = [];
  const signals = hazards.filter(hazard => hazard.motion && hazard.kind !== "gust").map(hazard => {
    const road = course.projectRoad(hazard.position[0], hazard.position[2]);
    const root = new TransformNode(`${hazard.id} approach signal`, art.scene);
    root.position.set(road.x + road.dz * (course.shoulderWidth + 2.8) - road.dx * 11, road.y,
      road.z - road.dx * (course.shoulderWidth + 2.8) - road.dz * 11);
    root.rotation.y = Math.atan2(road.dx, road.dz);
    art.cylinder("crossing tell pedestal", [0, 1.3, 0], 0.2, 0.35, 2.6, colors.frame, root);
    art.box("three-lens crossing hood", [0, 2.9, 0], [2.5, 1, 0.65], colors.dark, root);
    const lenses = [-1, 0, 1].map(side => {
      const lens = art.oval("crossing amber lens", [side * 0.72, 2.9, -0.36], [0.48, 0.48, 0.12], colors.signal, root, 1, 6);
      lens.material = art.material(colors.signal, true);
      return lens;
    });
    art.batchModel(root, new Set(lenses), true);
    // Thin paint sits on the supported approach, rather than inventing a raised speed bump.
    for (const distance of [15, 11, 7]) {
      const target = course.road.reduce((best, point) =>
        Math.abs(point.distance - (road.distance - distance)) < Math.abs(best.distance - (road.distance - distance)) ? point : best);
      if (course.isGap(target.u)) continue;
      for (const side of [-1, 1]) {
        const mark = art.box("crossing approach inset", [target.x + target.dz * side * (course.roadWidth / 2 - 0.9),
          target.y + 0.065, target.z - target.dx * side * (course.roadWidth / 2 - 0.9)], [0.9, 0.015, 0.55], colors.signal);
        mark.rotation.y = Math.atan2(target.dx, target.dz);
      }
    }
    casters.push(...art.finishStatic(), ...root.getChildMeshes().filter((mesh): mesh is Mesh => mesh instanceof Mesh));
    return { hazard, road, root, lenses };
  });
  return {
    casters,
    animate(time) {
      for (const { hazard, road, lenses } of signals) {
        const position = hazardPosition(hazard, time);
        const future = hazardPosition(hazard, time + 1.1);
        const lateral = (position[0] - road.x) * road.dz - (position[2] - road.z) * road.dx;
        const ahead = (future[0] - road.x) * road.dz - (future[2] - road.z) * road.dx;
        const crossing = Math.abs(lateral) < course.roadWidth / 2 + hazard.radius;
        const approaching = Math.abs(ahead) < Math.abs(lateral);
        lenses.forEach((lens, i) => { lens.visibility = crossing || approaching && i < 2 ? 1 : 0.2; });
      }
    },
  };
}
