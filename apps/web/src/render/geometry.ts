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

export type Triple = readonly [number, number, number];

export class Atelier {
  private materials = new Map<string, StandardMaterial>();
  private staticMeshes = new Map<StandardMaterial, Mesh[]>();

  constructor(readonly scene: Scene) {}

  material(hex: string, glow = false): StandardMaterial {
    const key = hex + glow;
    const existing = this.materials.get(key);
    if (existing) return existing;
    const material = new StandardMaterial(key, this.scene);
    material.diffuseColor = Color3.FromHexString(hex);
    material.specularColor = glow ? Color3.Black() : new Color3(0.13, 0.12, 0.1);
    material.specularPower = 48;
    if (glow) {
      material.emissiveColor = material.diffuseColor;
      material.disableLighting = true;
    }
    this.materials.set(key, material);
    return material;
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
    this.box(name + " backing", [0, 0, 0.05], [width + 0.1, height + 0.1, 0.08], "#d0bc8d", sign);
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

  batchModel(root: TransformNode, animated: ReadonlySet<Mesh>): void {
    const groups = new Map<TransformNode, Map<StandardMaterial, Mesh[]>>();
    for (const mesh of root.getChildMeshes()) {
      if (!(mesh instanceof Mesh) || animated.has(mesh) ||
        !(mesh.parent instanceof TransformNode) || !(mesh.material instanceof StandardMaterial)) continue;
      const materials = groups.get(mesh.parent) ?? new Map<StandardMaterial, Mesh[]>();
      const meshes = materials.get(mesh.material) ?? [];
      meshes.push(mesh);
      materials.set(mesh.material, meshes);
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
        batch.isPickable = false;
      }
    }
  }
}
