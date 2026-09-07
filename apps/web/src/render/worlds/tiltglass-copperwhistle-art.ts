import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/instancedMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { CourseQuery } from "@kartsick/content";
import type { Atelier, Triple } from "../geometry";

export function ring(art: Atelier, name: string, center: Triple, radius: number, tube: number, color: string, parent?: TransformNode): Mesh {
  const path: Triple[] = [];
  for (let i = 0; i <= 32; i++) {
    const angle = i / 32 * Math.PI * 2;
    path.push([center[0] + Math.sin(angle) * radius, center[1], center[2] + Math.cos(angle) * radius]);
  }
  return art.tube(name, path, tube, color, parent);
}

export function routeSign(art: Atelier, course: CourseQuery, text: string, u: number, side: number, color: string, width = 8): void {
  const p = course.sampleRoad(u);
  const offset = (course.roadWidth / 2 + width * 0.55 + 2.5) * side;
  const x = p.x + p.dz * offset, z = p.z - p.dx * offset;
  const board = art.sign(`${course.id}: ${text}`, text, [x, p.y + 4.7, z], width, color);
  board.rotation.y = Math.atan2(p.dx, p.dz);
  art.tube(`${course.id} bent sign stem`, [
    [x, p.y - 2, z], [x, p.y + 3.5, z], [x - p.dz * side * 0.5, p.y + 4.2, z + p.dx * side * 0.5],
  ], 0.18, color);
}

export function portal(art: Atelier, course: CourseQuery, name: string, u: number, color: string, trim: string): Mesh[] {
  const p = course.sampleRoad(u);
  const root = new TransformNode(name, art.scene);
  root.position.set(p.x, p.y, p.z);
  root.rotation.y = Math.atan2(p.dx, p.dz);
  const w = course.roadWidth / 2 + 1.6;
  art.tube(name, [[-w, -1.5, 0], [-w, 5, 0], [-w + 1.5, 7.5, 0], [0, 8.5, 0], [w - 1.5, 7.5, 0], [w, 5, 0], [w, -1.5, 0]], 0.48, color, root);
  for (const side of [-1, 1]) {
    art.oval(`${name} rounded footing`, [side * w, 0.8, 0], [1.25, 2.4, 1.5], trim, root, 1, 8);
  }
  art.batchModel(root, new Set(), true);
  return root.getChildMeshes().filter((mesh): mesh is Mesh => mesh instanceof Mesh);
}

/** Source meshes stay out of Atelier's static merger; instances retain independent bounds. */
export function instanceSource(art: Atelier, name: string, color: string, segments = 8): Mesh {
  const root = new TransformNode(`${name} source`, art.scene);
  const source = art.oval(name, [0, 0, 0], [1, 1, 1], color, root, 1, segments);
  source.isVisible = false;
  return source;
}
