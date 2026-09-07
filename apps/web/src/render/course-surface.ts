import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { CourseQuery } from "@kartsick/content";
import type { RoadPoint } from "@kartsick/content";
import type { CourseLayout } from "../../../../packages/content-layouts/types";
import { samplePath } from "../../../../packages/content-layouts/query";
import { Atelier } from "./geometry";

export function buildCourseSurface(art: Atelier, course: CourseQuery, layout: CourseLayout): Mesh[] {
  const casters: Mesh[] = [];
  const { minX, maxX, minZ, maxZ } = layout.bounds;
  if (!(maxX > minX && maxZ > minZ) || maxX - minX > 10000 || maxZ - minZ > 10000) throw new RangeError("Invalid course ground bounds.");
  const groundColor = Color3.FromHexString(layout.palette.ground);
  for (let tileZ = minZ; tileZ < maxZ; tileZ += 64) {
    for (let tileX = minX; tileX < maxX; tileX += 64) {
      const endX = Math.min(tileX + 64, maxX), endZ = Math.min(tileZ + 64, maxZ);
      const positions: number[] = [], colors: number[] = [], indices: number[] = [];
      const divisions = 8;
      for (let z = 0; z <= divisions; z++) for (let x = 0; x <= divisions; x++) {
        const px = tileX + (endX - tileX) * x / divisions;
        const pz = tileZ + (endZ - tileZ) * z / divisions;
        const y = course.terrainHeight(px, pz);
        if (!Number.isFinite(y)) throw new RangeError("Terrain height must be finite.");
        const tint = 0.96 + Math.sin(px * 0.017 + pz * 0.027) * 0.035;
        positions.push(px, y, pz);
        colors.push(groundColor.r * tint, groundColor.g * tint, groundColor.b * tint, 1);
        if (x < divisions && z < divisions) {
          const a = z * (divisions + 1) + x;
          indices.push(a, a + 1, a + divisions + 1, a + 1, a + divisions + 2, a + divisions + 1);
        }
      }
      const mesh = art.mesh(`${layout.id} terrain ${tileX}:${tileZ}`, positions, indices, colors);
      mesh.material = art.material("#ffffff");
      mesh.receiveShadows = true;
      mesh.freezeWorldMatrix();
    }
  }
  const texture = new DynamicTexture(`${layout.id} original road texture`, { width: 128, height: 256 }, art.scene, false);
  const context = texture.getContext();
  context.fillStyle = layout.palette.road;
  context.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 1300; i++) {
    context.fillStyle = i % 2 ? "#ffffff0c" : "#00000009";
    context.fillRect((i * 47.31) % 128, (i * 79.27) % 256, 1, 1);
  }
  context.fillStyle = layout.palette.rail;
  context.fillRect(62, 28, 4, 90);
  texture.update();
  texture.anisotropicFilteringLevel = 4;
  const roadMaterial = new StandardMaterial(`${layout.id} paved surface`, art.scene);
  roadMaterial.diffuseTexture = texture;
  roadMaterial.specularColor = new Color3(0.04, 0.04, 0.04);
  roadMaterial.backFaceCulling = false;
  const verge = Color3.FromHexString(layout.palette.verge);
  const edgeA = Color3.FromHexString(layout.palette.rail);
  const edgeB = Color3.FromHexString(layout.palette.accent);

  function ribbon(name: string, points: readonly RoadPoint[], halfWidth: number, shoulder: number, main: boolean, rough: boolean): void {
    for (let start = 0; start < points.length - 1; start += 40) {
      const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
      const edges: number[] = [], edgeColors: number[] = [], edgeIndices: number[] = [];
      const finish = Math.min(points.length - 1, start + 40);
      for (let index = start; index < finish; index++) {
        const a = points[index], b = points[index + 1];
        if (main && course.isGap((a.u + b.u) / 2)) continue;
        const base = positions.length / 3;
        for (const point of [a, b]) for (const side of [-1, 1]) {
          positions.push(point.x + point.dz * side * halfWidth, point.y + 0.025, point.z - point.dx * side * halfWidth);
          uvs.push(side < 0 ? 0 : 1, point.distance / 13);
        }
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        if (shoulder > halfWidth) {
          const color = rough ? verge : index % 8 < 4 ? edgeA : edgeB;
          for (const side of [-1, 1]) {
            const edge = edges.length / 3;
            const widths = side < 0 ? [-shoulder, -halfWidth] : [halfWidth, shoulder];
            for (const point of [a, b]) for (const offset of widths) {
              edges.push(point.x + point.dz * offset, point.y + 0.035, point.z - point.dx * offset);
              edgeColors.push(color.r, color.g, color.b, 1);
            }
            edgeIndices.push(edge, edge + 1, edge + 2, edge + 1, edge + 3, edge + 2);
          }
        }
        if (main && course.hasRail(a.u) && index % 5 === 0) {
          const end = points[Math.min(index + 5, finish)];
          for (const side of [-1, 1]) {
            const x = a.x + a.dz * side * halfWidth, z = a.z - a.dx * side * halfWidth;
            art.box(`${layout.id} rail post`, [x, a.y + 0.55, z], [0.21, 1.1, 0.21], layout.palette.rail);
            art.tube(`${layout.id} safety rail`, [
              [x, a.y + 0.83, z],
              [end.x + end.dz * side * halfWidth, end.y + 0.83, end.z - end.dx * side * halfWidth],
            ], 0.12, layout.palette.rail);
          }
        }
      }
      if (positions.length) {
        const road = art.mesh(`${layout.id} ${name} ${start}`, positions, indices, undefined, uvs);
        road.material = rough ? art.material(layout.palette.verge) : roadMaterial;
        road.receiveShadows = true;
        road.freezeWorldMatrix();
        casters.push(road);
      }
      if (edges.length) {
        const curb = art.mesh(`${layout.id} ${name} edges ${start}`, edges, edgeIndices, edgeColors);
        curb.material = art.material("#ffffff");
        curb.receiveShadows = true;
        curb.freezeWorldMatrix();
      }
      casters.push(...art.finishStatic());
    }
  }
  ribbon("main road", course.road, layout.halfWidth, layout.shoulderWidth, true, false);
  for (const shortcut of layout.shortcuts) ribbon(shortcut.id, samplePath(shortcut.points, false, 160), shortcut.halfWidth, shortcut.halfWidth + 0.6, false, shortcut.rough);
  const markers = [0, ...layout.sectors, ...(layout.format === "sectors" ? [1] : [])];
  for (let index = 0; index < markers.length; index++) {
    const point = course.sampleRoad(markers[index]);
    const width = layout.halfWidth * 2;
    for (let row = 0; row < 2; row++) for (let column = 0; column < 12; column++) {
      const side = -layout.halfWidth + (column + 0.5) * width / 12;
      const along = (row - 0.5) * 0.7;
      const tile = art.box(`${layout.id} ${index === 0 ? "start" : "sector"} check`,
        [point.x + point.dz * side + point.dx * along, point.y + 0.052, point.z - point.dx * side + point.dz * along],
        [width / 12, 0.018, 0.7], (column + row) % 2 ? layout.palette.rail : layout.palette.secondary);
      tile.rotation.y = Math.atan2(point.dx, point.dz);
    }
    casters.push(...art.finishStatic());
  }
  return casters;
}
