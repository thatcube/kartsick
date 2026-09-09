import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Atelier } from "./geometry";
import type { Triple } from "./geometry";
import type { SurfaceFinish } from "./surface-finishes";

type Section = readonly [y: number, xRadius: number, zRadius: number, x?: number, z?: number];
const TAU = Math.PI * 2;

export function itemNode(art: Atelier, name: string, parent?: TransformNode, position: Triple = [0, 0, 0]): TransformNode {
  const result = new TransformNode(name, art.scene);
  result.parent = parent ?? null;
  result.position.set(...position);
  return result;
}

/** Small closed solids: wrapped seams, single-vertex poles, and Babylon LH winding. */
export class ItemArt {
  constructor(readonly art: Atelier, readonly root: TransformNode) {}

  private mesh(name: string, positions: number[], indices: number[], color: string, finish: SurfaceFinish, position: Triple = [0, 0, 0], normals?: number[]): Mesh {
    const mesh = this.art.mesh(name, positions, indices);
    if (normals) mesh.setVerticesData("normal", normals);
    return this.art.place(mesh, position, this.art.surface(color, finish), this.root);
  }

  block(name: string, position: Triple, size: Triple, color: string, finish: SurfaceFinish = "paint", corner = 0.18, bevel = 0.09): Mesh {
    const [x, y, z] = size.map(value => value / 2);
    const cut = Math.min(x, y) * corner * 2;
    const edge = Math.min(x, y, z) * bevel * 2;
    const positions: number[] = [], indices: number[] = [], normals: number[] = [];
    const roundedRows = [
      [-z, edge, -1, 0], [-z + edge * 0.293, edge * 0.293, -Math.SQRT1_2, Math.SQRT1_2],
      [-z + edge, 0, 0, 1], [z - edge, 0, 0, 1],
      [z - edge * 0.293, edge * 0.293, Math.SQRT1_2, Math.SQRT1_2], [z, edge, 1, 0],
    ];
    const detail = Math.min(x, y, z) < .04 ? 3 : 4, sides = detail * 4;
    const rows = detail === 3 ? [roundedRows[0], roundedRows[2], roundedRows[3], roundedRows[5]] : roundedRows;
    for (const [depth, inset, nz, radial] of rows) {
      const radius = Math.max(0.0001, cut - inset);
      for (let quarter = 0; quarter < 4; quarter++) for (let step = 0; step < detail; step++) {
        const angle = quarter * Math.PI / 2 + step / (detail - 1) * Math.PI / 2;
        const cx = quarter === 0 || quarter === 3 ? x - inset - radius : -x + inset + radius;
        const cy = quarter < 2 ? y - inset - radius : -y + inset + radius;
        positions.push(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, depth);
        normals.push(Math.cos(angle) * radial, Math.sin(angle) * radial, nz);
      }
    }
    for (let row = 0; row < rows.length - 1; row++) for (let side = 0; side < sides; side++) {
      const a = row * sides + side, b = row * sides + (side + 1) % sides;
      indices.push(a, a + sides, b, b, a + sides, b + sides);
    }
    for (const [row, sign] of [[0, -1], [rows.length - 1, 1]]) {
      const center = positions.length / 3;
      positions.push(0, 0, rows[row][0]); normals.push(0, 0, sign);
      for (let side = 0; side < sides; side++) {
        const a = row * sides + side, b = row * sides + (side + 1) % sides;
        if (sign < 0) indices.push(center, a, b);
        else indices.push(center, b, a);
      }
    }
    return this.mesh(name, positions, indices, color, finish, position, normals);
  }

  puff(name: string, position: Triple, size: Triple, color: string, finish: SurfaceFinish = "paint", square = 1, sides = 20, rows = 10): Mesh {
    const positions: number[] = [0, -size[1] / 2, 0], normals: number[] = [0, -1, 0], indices: number[] = [];
    const power = (value: number, p: number) => Math.sign(value) * Math.abs(value) ** p;
    for (let row = 1; row < rows; row++) {
      const latitude = -Math.PI / 2 + row / rows * Math.PI;
      for (let side = 0; side < sides; side++) {
        const angle = side / sides * TAU;
        const p = [power(Math.cos(latitude) * Math.cos(angle), square), power(Math.sin(latitude), square), power(Math.cos(latitude) * Math.sin(angle), square)];
        positions.push(...p.map((v, axis) => v * size[axis] / 2));
        const gradient = p.map((v, axis) => power(v, 2 / square - 1) / size[axis]);
        const length = Math.hypot(...gradient);
        normals.push(...gradient.map(v => v / length));
      }
    }
    const top = positions.length / 3;
    positions.push(0, size[1] / 2, 0); normals.push(0, 1, 0);
    for (let side = 0; side < sides; side++) {
      const next = (side + 1) % sides;
      indices.push(0, 1 + next, 1 + side);
      for (let row = 0; row < rows - 2; row++) {
        const a = 1 + row * sides + side, b = 1 + row * sides + next;
        indices.push(a, b, a + sides, b, b + sides, a + sides);
      }
      indices.push(top, top - sides + side, top - sides + next);
    }
    return this.mesh(name, positions, indices, color, finish, position, normals);
  }

  profile(name: string, sections: readonly Section[], color: string, finish: SurfaceFinish = "paint", sides = 24): Mesh {
    const positions: number[] = [], indices: number[] = [];
    for (const [y, rx, rz, x = 0, z = 0] of sections) for (let side = 0; side < sides; side++) {
      const angle = side / sides * TAU;
      positions.push(x + Math.cos(angle) * rx, y, z + Math.sin(angle) * rz);
    }
    for (let row = 0; row < sections.length - 1; row++) for (let side = 0; side < sides; side++) {
      const a = row * sides + side, b = row * sides + (side + 1) % sides;
      indices.push(a, b, a + sides, b, b + sides, a + sides);
    }
    // Separate flat cap rims keep their normals from cancelling the curved wall.
    for (const row of [0, sections.length - 1]) {
      const [y, , , x = 0, z = 0] = sections[row], center = positions.length / 3;
      positions.push(x, y, z);
      for (let side = 0; side < sides; side++) positions.push(...positions.slice((row * sides + side) * 3, (row * sides + side) * 3 + 3));
      for (let side = 0; side < sides; side++) {
        const a = center + 1 + side, b = center + 1 + (side + 1) % sides;
        if (row === 0) indices.push(center, b, a); else indices.push(center, a, b);
      }
    }
    return this.mesh(name, positions, indices, color, finish);
  }

  ring(name: string, position: Triple, diameter: number, thickness: number, color: string, finish: SurfaceFinish = "paint", segments = 32): Mesh {
    const positions: number[] = [], indices: number[] = [], normals: number[] = [], sides = 8;
    for (let i = 0; i < segments; i++) for (let j = 0; j < sides; j++) {
      const a = i / segments * TAU, b = j / sides * TAU, radius = diameter / 2 + Math.cos(b) * thickness / 2;
      positions.push(Math.cos(a) * radius, Math.sin(b) * thickness / 2, Math.sin(a) * radius);
      normals.push(Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b));
    }
    for (let i = 0; i < segments; i++) for (let j = 0; j < sides; j++) {
      const a = i * sides + j, b = i * sides + (j + 1) % sides;
      const c = (i + 1) % segments * sides + j, d = (i + 1) % segments * sides + (j + 1) % sides;
      indices.push(a, c, b, b, c, d);
    }
    return this.mesh(name, positions, indices, color, finish, position, normals);
  }

  tube(name: string, points: readonly Triple[], radius: number | readonly number[], color: string, finish: SurfaceFinish = "paint", sides = 8): Mesh {
    const positions: number[] = [], indices: number[] = [];
    const closed = Vector3.DistanceSquared(new Vector3(...points[0]), new Vector3(...points[points.length - 1])) < 1e-12;
    const path = (closed ? points.slice(0, -1) : points).map(p => new Vector3(...p));
    let normal: Vector3 | undefined;
    for (let i = 0; i < path.length; i++) {
      const next = closed ? (i + 1) % path.length : Math.min(i + 1, path.length - 1);
      const previous = closed ? (i + path.length - 1) % path.length : Math.max(0, i - 1);
      const tangent = path[next].subtract(path[previous]).normalize();
      const axis = normal ?? (Math.abs(tangent.y) < 0.9 ? Vector3.Up() : Vector3.Right());
      const binormal = Vector3.Cross(tangent, axis).normalize();
      normal = Vector3.Cross(binormal, tangent).normalize();
      const r = typeof radius === "number" ? radius : radius[i];
      for (let side = 0; side < sides; side++) {
        const a = side / sides * TAU;
        positions.push(...path[i].add(normal.scale(Math.cos(a) * r)).add(binormal.scale(Math.sin(a) * r)).asArray());
      }
    }
    for (let row = 0; row < path.length - (closed ? 0 : 1); row++) for (let side = 0; side < sides; side++) {
      const a = row * sides + side, b = row * sides + (side + 1) % sides;
      const c = (row + 1) % path.length * sides + side, d = (row + 1) % path.length * sides + (side + 1) % sides;
      indices.push(a, c, b, b, c, d);
    }
    for (const row of closed ? [] : [0, path.length - 1]) {
      const center = positions.length / 3;
      positions.push(...path[row].asArray());
      for (let side = 0; side < sides; side++) positions.push(...positions.slice((row * sides + side) * 3, (row * sides + side) * 3 + 3));
      for (let side = 0; side < sides; side++) {
        const a = center + 1 + side, b = center + 1 + (side + 1) % sides;
        if (row === 0) indices.push(center, a, b); else indices.push(center, b, a);
      }
    }
    return this.mesh(name, positions, indices, color, finish);
  }

  glow(mesh: Mesh, color: string): Mesh {
    mesh.material = this.art.material(color, true, "paint");
    return mesh;
  }
}
