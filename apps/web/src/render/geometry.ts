import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Scene } from "@babylonjs/core/scene";
import { applySurfaceFinish } from "./surface-finishes";
import type { SurfaceFinish } from "./surface-finishes";

export type Triple = readonly [number, number, number];
/** Height, half width, half depth, optional horizontal and depth offsets. */
export type Contour = readonly [number, number, number, number?, number?];

export class Atelier {
  private materials = new Map<string, StandardMaterial>();
  private staticMeshes = new Map<StandardMaterial, Mesh[]>();

  constructor(readonly scene: Scene) {}

  material(hex: string, glow = false, finish: SurfaceFinish = "matte"): StandardMaterial {
    const key = `${hex}:${glow}:${finish}`;
    const existing = this.materials.get(key);
    if (existing) return existing;
    const material = new StandardMaterial(key, this.scene);
    material.diffuseColor = Color3.FromHexString(hex);
    applySurfaceFinish(material, finish, this.scene.environmentTexture);
    if (glow) {
      material.specularColor = Color3.Black();
      material.reflectionTexture = null;
      material.emissiveColor = material.diffuseColor;
      material.disableLighting = true;
    }
    this.materials.set(key, material);
    return material;
  }

  surface(hex: string, finish: SurfaceFinish): StandardMaterial {
    return this.material(hex, false, finish);
  }

  place(mesh: Mesh, position: Triple, material: StandardMaterial, parent?: TransformNode): Mesh {
    mesh.position.set(...position);
    mesh.material = material;
    mesh.isPickable = false;
    if (parent) mesh.parent = parent;
    else {
      const batch = this.staticMeshes.get(material) ?? [];
      batch.push(mesh);
      this.staticMeshes.set(material, batch);
    }
    return mesh;
  }

  oval(name: string, position: Triple, size: Triple, color: string, parent?: TransformNode, square = 1, segments = 14): Mesh {
    const mesh = MeshBuilder.CreateSphere(name, { segments, diameter: 1, updatable: square !== 1 }, this.scene);
    if (square !== 1) {
      const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
      for (let i = 0; i < positions.length; i++) positions[i] = Math.sign(positions[i]) * Math.abs(positions[i] * 2) ** square * 0.5;
      const normals: number[] = [];
      // Analytic superellipsoid normals stay smooth across the UV seam and poles.
      for (let i = 0; i < positions.length; i += 3) {
        const gradient = positions.slice(i, i + 3).map(value => Math.sign(value) * Math.abs(value * 2) ** (2 / square - 1));
        const length = Math.hypot(...gradient);
        normals.push(...gradient.map(value => value / length));
      }
      mesh.updateVerticesData(VertexBuffer.PositionKind, positions);
      mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
    }
    mesh.scaling.set(...size);
    return this.place(mesh, position, this.material(color), parent);
  }

  box(name: string, position: Triple, size: Triple, color: string, parent?: TransformNode): Mesh {
    return this.place(MeshBuilder.CreateBox(name, { width: size[0], height: size[1], depth: size[2] }, this.scene), position, this.material(color), parent);
  }

  tube(name: string, points: Triple[], radius: number, color: string, parent?: TransformNode): Mesh {
    return this.place(MeshBuilder.CreateTube(name, {
      path: points.map(point => new Vector3(...point)), radius, tessellation: 8, cap: Mesh.CAP_ALL,
    }, this.scene), [0, 0, 0], this.material(color), parent);
  }

  cylinder(name: string, position: Triple, top: number, bottom: number, height: number, color: string, parent?: TransformNode): Mesh {
    return this.place(MeshBuilder.CreateCylinder(name, {
      diameterTop: top, diameterBottom: bottom, height, tessellation: 20,
    }, this.scene), position, this.material(color), parent);
  }

  loft(name: string, sections: readonly (readonly [number, number, number, number])[], color: string, parent?: TransformNode): Mesh {
    const positions: number[] = [];
    const indices: number[] = [];
    const sides = 24;
    for (const [z, width, height, depth] of sections) {
      for (let i = 0; i <= sides; i++) {
        const angle = i / sides * Math.PI * 2;
        positions.push(Math.cos(angle) * width, height + Math.sin(angle) * depth, z);
      }
    }
    for (let row = 0; row < sections.length - 1; row++) {
      for (let side = 0; side < sides; side++) {
        const a = row * (sides + 1) + side;
        const b = a + sides + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    return this.place(this.mesh(name, positions, indices), [0, 0, 0], this.material(color), parent);
  }

  /** Smooth, closed artist-authored cross sections; useful for anatomy, fabric and enamel. */
  sculpt(name: string, contours: readonly Contour[], color: string, parent: TransformNode, square = 1, sides = 20): Mesh {
    const positions: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    const rows = (contours.length - 1) * 3;
    const component = (row: number, axis: number) => contours[Math.max(0, Math.min(contours.length - 1, row))][axis] ?? 0;
    for (let row = 0; row <= rows; row++) {
      const segment = Math.min(contours.length - 2, Math.floor(row / 3));
      const t = row / 3 - segment;
      const values = Array.from({ length: 5 }, (_, axis) => {
        const a = component(segment - 1, axis), b = component(segment, axis);
        const c = component(segment + 1, axis), d = component(segment + 2, axis);
        return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
      });
      for (let side = 0; side <= sides; side++) {
        const angle = side / sides * Math.PI * 2;
        const x = Math.cos(angle), z = Math.sin(angle);
        positions.push(values[3] + Math.sign(x) * Math.abs(x) ** square * Math.max(0.001, values[1]),
          values[0], values[4] + Math.sign(z) * Math.abs(z) ** square * Math.max(0.001, values[2]));
        uvs.push(side / sides, row / rows);
        if (row < rows && side < sides) {
          const a = row * (sides + 1) + side, b = a + sides + 1;
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    for (const row of [0, rows]) {
      const ring = row * (sides + 1), center = positions.length / 3;
      const contour = contours[row === 0 ? 0 : contours.length - 1];
      positions.push(contour[3] ?? 0, contour[0], contour[4] ?? 0);
      uvs.push(0.5, row / rows);
      for (let side = 0; side < sides; side++) {
        if (row === 0) indices.push(center, ring + side + 1, ring + side);
        else indices.push(center, ring + side, ring + side + 1);
      }
    }
    const mesh = this.mesh(name, positions, indices, undefined, uvs);
    const normals = mesh.getVerticesData(VertexBuffer.NormalKind)!;
    // Cross-section UV seams share one smooth normal, rather than a visible lighting stripe.
    for (let row = 0; row <= rows; row++) {
      const a = row * (sides + 1) * 3, b = a + sides * 3;
      const n = new Vector3(normals[a] + normals[b], normals[a + 1] + normals[b + 1], normals[a + 2] + normals[b + 2]).normalize();
      for (const index of [a, b]) { normals[index] = n.x; normals[index + 1] = n.y; normals[index + 2] = n.z; }
    }
    mesh.setVerticesData(VertexBuffer.NormalKind, normals);
    return this.place(mesh, [0, 0, 0], this.material(color), parent);
  }

  /** Rounded, tapering spline; radius values correspond to the supplied control points. */
  sweep(name: string, points: readonly Triple[], radii: readonly number[], color: string, parent: TransformNode, sides = 8): Mesh {
    const path: Vector3[] = [];
    const radius: number[] = [];
    const at = (i: number) => new Vector3(...points[Math.max(0, Math.min(points.length - 1, i))]);
    for (let i = 0; i < points.length - 1; i++) {
      for (let step = 0; step < 4; step++) {
        const t = step / 4;
        path.push(Vector3.CatmullRom(at(i - 1), at(i), at(i + 1), at(i + 2), t));
        radius.push(radii[i] + (radii[i + 1] - radii[i]) * t);
      }
    }
    path.push(at(points.length - 1));
    radius.push(radii[radii.length - 1]);
    return this.place(MeshBuilder.CreateTube(name, {
      path, radiusFunction: i => radius[i], tessellation: sides, cap: Mesh.CAP_ALL,
    }, this.scene), [0, 0, 0], this.material(color), parent);
  }

  mesh(name: string, positions: number[], indices: number[], colors?: number[], uvs?: number[]): Mesh {
    const mesh = new Mesh(name, this.scene);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.normals = [];
    VertexData.ComputeNormals(positions, indices, data.normals);
    if (colors) data.colors = colors;
    data.uvs = uvs ?? new Array(positions.length / 3 * 2).fill(0);
    data.applyToMesh(mesh);
    mesh.isPickable = false;
    return mesh;
  }

  sign(name: string, text: string, position: Triple, width: number, color = "#3445a8", height = width * 0.26): Mesh {
    const texture = new DynamicTexture(name, { width: 1024, height: 256 }, this.scene, true);
    const context = texture.getContext();
    context.font = "bold 102px Trebuchet MS, sans-serif";
    const fontSize = Math.min(102, 940 / context.measureText(text).width * 102);
    texture.drawText(text, null, 128 + fontSize * 0.35, `bold ${fontSize}px Trebuchet MS, sans-serif`, color, "#fff0bf", true);
    texture.anisotropicFilteringLevel = 4;
    const material = new StandardMaterial(name, this.scene);
    material.diffuseTexture = texture;
    material.emissiveColor = new Color3(0.15, 0.15, 0.15);
    material.specularColor = Color3.Black();
    const sign = MeshBuilder.CreatePlane(name, { width, height }, this.scene);
    sign.position.set(...position);
    sign.material = material;
    sign.isPickable = false;
    const backingDepth = Math.max(0.08, width * 0.004);
    this.box(name + " backing", [0, 0, backingDepth * 0.8], [width + 0.1, height + 0.1, backingDepth], "#d0bc8d", sign);
    return sign;
  }

  finishStatic(): Mesh[] {
    const batches: Mesh[] = [];
    for (const [material, meshes] of this.staticMeshes) {
      for (let offset = 0; offset < meshes.length; offset += 140) {
        const batch = Mesh.MergeMeshes(meshes.slice(offset, offset + 140), true, true);
        if (!batch) throw new Error(`Could not batch the ${material.name} scenery.`);
        batch.name = `scenery:${material.name}:${offset}`;
        batch.freezeWorldMatrix();
        batch.isPickable = false;
        batch.receiveShadows = true;
        batches.push(batch);
      }
    }
    this.staticMeshes.clear();
    return batches;
  }

  batchModel(root: TransformNode, animated: ReadonlySet<Mesh>, vertexColors = false): void {
    const groups = new Map<TransformNode, Map<StandardMaterial, Mesh[]>>();
    for (const mesh of root.getChildMeshes()) {
      if (!(mesh instanceof Mesh) || animated.has(mesh) ||
        !(mesh.parent instanceof TransformNode) || !(mesh.material instanceof StandardMaterial)) continue;
      const source = mesh.material;
      let batchMaterial = source;
      if (vertexColors && source.alpha === 1 &&
        source.getActiveTextures().every(texture => texture === source.reflectionTexture) &&
        source.backFaceCulling && !mesh.hasVertexAlpha && !source.wireframe &&
        !source.pointsCloud && source.ambientColor.equalsFloats(0, 0, 0) &&
        source.emissiveColor.equals(source.disableLighting ? source.diffuseColor : Color3.Black())) {
        const color = source.diffuseColor;
        const existing = mesh.getVerticesData(VertexBuffer.ColorKind);
        const colors: number[] = [];
        for (let i = 0; i < mesh.getTotalVertices(); i++) {
          colors.push(color.r * (existing?.[i * 4] ?? 1), color.g * (existing?.[i * 4 + 1] ?? 1),
            color.b * (existing?.[i * 4 + 2] ?? 1), 1);
        }
        mesh.setVerticesData(VertexBuffer.ColorKind, colors);
        const finish = source.metadata?.surfaceFinish ?? "custom";
        const key = `vertex:${finish}:${source.disableLighting}:${source.specularColor.toHexString()}:${source.specularPower}:${source.roughness}:${source.reflectionTexture?.uniqueId ?? "none"}`;
        let shared = this.materials.get(key);
        if (!shared) {
          shared = new StandardMaterial(key, this.scene);
          shared.diffuseColor = Color3.White();
          shared.specularColor = source.specularColor.clone();
          shared.specularPower = source.specularPower;
          shared.roughness = source.roughness;
          shared.reflectionTexture = source.reflectionTexture;
          shared.reflectionFresnelParameters = source.reflectionFresnelParameters?.clone() ?? null;
          shared.metadata = { surfaceFinish: finish };
          shared.disableLighting = source.disableLighting;
          shared.emissiveColor = source.disableLighting ? Color3.White() : Color3.Black();
          this.materials.set(key, shared);
        }
        mesh.material = shared;
        batchMaterial = shared;
      }
      const materials = groups.get(mesh.parent) ?? new Map<StandardMaterial, Mesh[]>();
      const meshes = materials.get(batchMaterial) ?? [];
      meshes.push(mesh);
      materials.set(batchMaterial, meshes);
      groups.set(mesh.parent, materials);
    }
    for (const [parent, materials] of groups) {
      const inverse = Matrix.Invert(parent.computeWorldMatrix(true));
      for (const meshes of materials.values()) {
        if (meshes.length < 2) continue;
        const batch = Mesh.MergeMeshes(meshes, true, true);
        if (!batch) throw new Error(`Could not batch the rigid parts of ${parent.name}.`);
        // MergeMeshes bakes world space; bring the result back into its animated rig.
        batch.bakeTransformIntoVertices(inverse);
        batch.parent = parent;
        batch.name = `${parent.name}:rigid:${batch.material?.name ?? "solid"}`;
        batch.isPickable = false;
      }
    }
  }
}
