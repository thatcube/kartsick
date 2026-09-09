import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import type { CourseQuery, RoadPoint } from "@kartsick/content";
import { LASTLIGHT } from "../../../../../packages/content-layouts/lastlight";
import { samplePath } from "../../../../../packages/content-layouts/query";
import { hazardPosition } from "../../../../../packages/content-layouts/types";
import type { Point3 } from "../../../../../packages/content-layouts/types";
import { buildCourseSurface } from "../course-surface";
import type { Atelier } from "../geometry";
import type { CourseWorld } from "../world-types";
import { hazardApproaches } from "./terrain-art";

const colors = {
  chalk: "#f5e5c3", ice: "#d8e6ef", lilac: "#b4a6c9", rock: "#be8066",
  rockLight: "#dbab88", shadow: "#766580", wood: "#795956", pine: "#416e75",
  pineLight: "#67958c", copper: "#e9a264", roof: "#597d91", plaster: "#f3ceab",
  lamp: "#ffda8e", water: "#709aaf", waterLight: "#e8bfa9",
};
const noise = (seed: number) => { const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

function offset(point: RoadPoint, lateral: number, along = 0): Point3 {
  return [point.x + point.dz * lateral + point.dx * along, point.y, point.z - point.dx * lateral + point.dz * along];
}

/** Instances share geometry within each independently culled 96 m bucket. */
class MountainProps {
  private templates = new Map<string, Mesh[]>();
  private footprints = new Map<string, number>();
  private buckets = new Map<string, { name: string; matrices: number[] }>();

  constructor(private art: Atelier, private course: CourseQuery) {}

  define(name: string, build: (root: TransformNode) => void): void {
    const root = new TransformNode(`lastlight ${name} template`, this.art.scene);
    build(root);
    this.art.batchModel(root, new Set(), true);
    const meshes = root.getChildMeshes().filter((mesh): mesh is Mesh => mesh instanceof Mesh);
    for (const mesh of meshes) {
      mesh.parent = null;
      mesh.isVisible = false;
      mesh.isPickable = false;
    }
    this.templates.set(name, meshes);
    if (name === "rock" || name === "alpine rock") {
      let radius = 0;
      for (const mesh of meshes) {
        const vertices = mesh.getVerticesData(VertexBuffer.PositionKind)!;
        for (let i = 0; i < vertices.length; i += 3) radius = Math.max(radius, Math.hypot(vertices[i], vertices[i + 2]));
      }
      this.footprints.set(name, radius);
    }
    root.dispose();
  }

  add(name: string, position: Point3, size: Point3 = [1, 1, 1], yaw = 0): void {
    const footprint = this.footprints.get(name);
    if (footprint !== undefined) {
      const radius = footprint * Math.max(Math.abs(size[0]), Math.abs(size[2]));
      if (this.course.projectRoad(position[0], position[2]).separation < this.course.shoulderWidth + radius + 6) return;
    }
    const key = `${name}:${Math.floor(position[0] / 96)}:${Math.floor(position[2] / 96)}`;
    const bucket = this.buckets.get(key) ?? { name, matrices: [] };
    const matrix = Matrix.Compose(new Vector3(...size), Quaternion.RotationYawPitchRoll(yaw, 0, 0), new Vector3(...position));
    bucket.matrices.push(...matrix.asArray());
    this.buckets.set(key, bucket);
  }

  finish(): void {
    for (const [key, bucket] of this.buckets) {
      for (const template of this.templates.get(bucket.name)!) {
        const mesh = template.clone(`lastlight ${key}`, null, true)!;
        // Babylon stores world0..3 on Geometry: sharing it aliases other buckets' GPU matrices.
        mesh.makeGeometryUnique();
        mesh.isVisible = true;
        mesh.receiveShadows = true;
        mesh.thinInstanceSetBuffer("matrix", new Float32Array(bucket.matrices), 16, true);
        mesh.thinInstanceRefreshBoundingInfo();
        mesh.freezeWorldMatrix();
      }
    }
    for (const meshes of this.templates.values()) for (const mesh of meshes) mesh.dispose();
  }
}

function defineProps(art: Atelier, props: MountainProps): void {
  props.define("fir", root => {
    art.sculpt("flared pine trunk", [[0, 0.48, 0.46], [0.6, 0.3, 0.29], [5.8, 0.13, 0.12]], colors.wood, root, 1, 8);
    for (let tier = 0; tier < 2; tier++) {
      const y = 2.5 + tier * 2.9, width = 3.2 - tier * 0.65;
      art.sculpt("soft umbrella needles", [
        [y, width * 0.48, width * 0.45], [y + 0.2, width, width * 0.86],
        [y + 0.9, width * 0.85, width * 0.75], [y + 2.5, width * 0.35, width * 0.36],
        [y + 3.8, 0.02, 0.02],
      ], tier ? colors.pineLight : colors.pine, root, 1, 10);
    }
  });
  props.define("larch", root => {
    art.sculpt("larch trunk", [[0, 0.45, 0.5], [1.1, 0.24, 0.22], [6, 0.15, 0.12]], colors.wood, root, 1, 8);
    art.sculpt("copper larch crown", [
      [2.7, 0.8, 0.7], [3.1, 2.6, 2.3], [4.6, 3.3, 2.8],
      [6.4, 2.8, 2.5, 0.5], [8.1, 1.6, 1.6, 0.5], [8.7, 0.05, 0.05, 0.3],
    ], colors.copper, root, 0.86, 10);
    art.sweep("forked branch", [[0, 2, 0], [0.9, 3.8, 0], [1.7, 4.8, 0]], [0.18, 0.13, 0.035], colors.wood, root, 6);
  });
  props.define("rock", root => {
    art.sculpt("weather-rounded stratified rock", [
      [-0.4, 1.3, 1.1], [0, 1.8, 1.3], [0.6, 2, 1.4, 0.15],
      [1.35, 1.5, 1.2, 0.3], [1.9, 0.6, 0.7, 0.25], [2, 0.02, 0.02, 0.15],
    ], colors.rock, root, 0.6, 8);
    art.sculpt("pale sediment cap", [
      [1.27, 1.49, 1.17, 0.3], [1.5, 1.26, 1.04, 0.3],
      [1.9, 0.55, 0.65, 0.25], [2.04, 0.02, 0.02, 0.15],
    ], colors.rockLight, root, 0.62, 8);
  });
  props.define("alpine rock", root => {
    art.sculpt("lilac granite", [
      [-0.4, 1.2, 1.3], [0.1, 1.8, 1.5], [1, 1.65, 1.3],
      [2.1, 0.7, 0.8, -0.25], [2.5, 0.04, 0.03, -0.2],
    ], colors.lilac, root, 0.68, 8);
    art.sculpt("readable frost cap", [
      [1.62, 1.1, 1.03, -0.15], [1.95, 0.88, 0.87, -0.2],
      [2.4, 0.36, 0.4, -0.2], [2.54, 0.04, 0.03, -0.2],
    ], colors.ice, root, 0.72, 8);
  });
  props.define("scrub", root => {
    art.oval("rounded alpine scrub", [0, 0.5, 0], [2.4, 1.25, 1.8], colors.pineLight, root, 1, 6);
    art.oval("copper scrub shoot", [0.5, 1, 0], [1.5, 1.8, 1.2], colors.copper, root, 1, 6);
  });
  props.define("lamp", root => {
    art.sculpt("lantern stone foot", [[0, 0.8, 0.65], [0.25, 0.76, 0.6], [0.7, 0.32, 0.3]], colors.shadow, root, 0.65, 8);
    art.sweep("crook lantern", [[0, 0.3, 0], [0, 4, 0], [0.2, 5.8, 0], [1.3, 6, 0], [1.8, 5.5, 0]], [0.2, 0.17, 0.16, 0.15, 0.12], colors.wood, root, 6);
    const glow = art.oval("warm lantern glass", [1.8, 4.85, 0], [0.9, 1.35, 0.85], colors.lamp, root, 0.82, 6);
    glow.material = art.material(colors.lamp, true);
    art.sculpt("lantern rain cap", [[5.4, 0.7, 0.6, 1.8], [5.65, 0.4, 0.35, 1.8], [5.9, 0.04, 0.04, 1.8]], colors.roof, root, 1, 8);
  });
  props.define("chalet", root => {
    art.sculpt("plaster chalet", [
      [-0.6, 4.3, 3.6], [0.2, 4.3, 3.6], [5.4, 4.2, 3.5], [6, 3.7, 3.1],
    ], colors.plaster, root, 0.3, 12);
    art.sculpt("rounded overhanging roof", [
      [5.5, 4.9, 4.1], [5.8, 5, 4.2], [6.5, 4.2, 3.5],
      [8.9, 0.7, 3.3], [9.05, 0.1, 3.15],
    ], colors.roof, root, 0.44, 12);
    for (const x of [-2.25, 2.25]) for (const z of [-3.58, 3.58]) {
      const glow = art.oval("amber cottage window", [x, 3.5, z], [1.45, 1.8, 0.12], colors.lamp, root, 0.55, 6);
      glow.material = art.material(colors.lamp, true);
      art.box("window mullion", [x, 3.5, z * 1.012], [0.09, 1.8, 0.14], colors.wood, root);
      art.box("window sill", [x, 2.6, z * 1.016], [1.7, 0.15, 0.3], colors.chalk, root);
    }
    art.oval("round-headed door", [0, 1.5, -3.62], [1.65, 3, 0.15], colors.wood, root, 0.65, 8);
    art.box("timber foundation", [0, 0.45, -3.65], [8.1, 0.3, 0.16], colors.wood, root);
    art.sculpt("chimney", [[6.3, 0.6, 0.6, 2.3], [9.2, 0.55, 0.55, 2.3], [9.45, 0.75, 0.75, 2.3]], colors.rock, root, 0.3, 8);
  });
}

function bake(art: Atelier, root: TransformNode): Mesh[] {
  art.batchModel(root, new Set(), true);
  const result = root.getChildMeshes().filter((mesh): mesh is Mesh => mesh instanceof Mesh);
  for (const mesh of result) {
    mesh.receiveShadows = true;
    mesh.freezeWorldMatrix();
  }
  return result;
}

function portal(art: Atelier, course: CourseQuery, u: number, name: string, chapter: number): Mesh[] {
  const point = course.sampleRoad(u);
  const root = new TransformNode(`lastlight ${name} landmark`, art.scene);
  root.position.set(point.x, point.y, point.z);
  root.rotation.y = Math.atan2(point.dx, point.dz);
  for (const side of [-1, 1]) {
    art.sculpt("terraced relay pier", [
      [-7, 1.25, 1.35, side * 8.3], [0, 1.2, 1.2, side * 8.3],
      [5.8, 0.8, 0.8, side * 8.3], [7, 1.1, 1, side * 8.3],
    ], chapter === 1 ? colors.lilac : colors.rock, root, 0.62, 10);
    art.sculpt("relay lantern hood", [
      [7.1, 1.35, 1.3, side * 8.3], [7.5, 1.4, 1.35, side * 8.3],
      [8.5, 0.2, 0.2, side * 8.3],
    ], colors.roof, root, 0.75, 10);
    const lens = art.oval("chapter lamp", [side * 8.3, 6.6, -0.85], [0.8, 0.7, 0.2], colors.lamp, root, 1, 6);
    lens.material = art.material(colors.lamp, true);
  }
  art.sweep("arched timber relay", [[-8.3, 6, 0], [-5.5, 7.8, 0], [0, 8.6, 0], [5.5, 7.8, 0], [8.3, 6, 0]], [0.45, 0.38, 0.32, 0.38, 0.45], colors.wood, root, 8);
  for (let index = 0; index < chapter; index++) {
    const light = art.oval("countable chapter medallion", [(index - (chapter - 1) / 2) * 1.35, 8.25, -0.35], [0.7, 0.7, 0.2], colors.lamp, root, 1, 8);
    light.material = art.material(colors.lamp, true);
  }
  const board = art.sign(`lastlight ${name}`, name, [0, 6.7, -0.52], 9.8, colors.shadow, 1.3);
  board.parent = root;
  return bake(art, root);
}

function observatory(art: Atelier, course: CourseQuery): Mesh[] {
  const point = course.sampleRoad(0.007), [x, , z] = offset(point, -35, -14);
  const root = new TransformNode("lastlight summit observatory", art.scene);
  root.position.set(x, course.terrainHeight(x, z), z);
  art.sculpt("observatory terrace", [
    [-3, 16, 13], [0, 15, 12], [1.5, 14, 11], [2, 13, 10],
  ], colors.shadow, root, 0.76, 18);
  art.sculpt("lilac observatory drum", [
    [1, 8.5, 8.5], [2, 8, 8], [10, 7.7, 7.7], [11, 8.5, 8.5],
  ], colors.lilac, root, 1, 18);
  art.sculpt("copper petal dome", [
    [10.7, 9.4, 9.4], [12, 9, 9], [16, 7.2, 7.2], [19, 3.9, 3.9], [20.5, 0.04, 0.04],
  ], colors.roof, root, 1, 18);
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2;
    const window = art.oval("observatory brass porthole", [Math.sin(angle) * 7.9, 7, Math.cos(angle) * 7.9], [2.3, 3.2, 0.3], colors.chalk, root, 0.75, 8);
    window.rotation.y = angle;
    const glass = art.oval("observatory sunset glass", [Math.sin(angle) * 8.08, 7, Math.cos(angle) * 8.08], [1.7, 2.6, 0.22], colors.water, root, 0.75, 8);
    glass.rotation.y = angle;
  }
  art.sweep("tilted telescope barrel", [[0, 16, 0], [-3, 19, -3], [-8, 24, -8]], [2.1, 2, 2.7], colors.chalk, root, 14);
  art.oval("telescope smoked lens", [-8.1, 24.2, -8.1], [4.4, 1, 4.4], colors.water, root, 1, 12).rotation.z = -0.6;
  art.sweep("relay aerial", [[8, 1, 4], [8, 18, 4], [8, 25, 4]], [0.35, 0.23, 0.14], colors.chalk, root, 8);
  art.oval("relay brass finial", [8, 25.5, 4], [1.6, 2.1, 1.6], colors.copper, root, 1, 8);
  return bake(art, root);
}

function terrainChapters(art: Atelier, course: CourseQuery): void {
  const alpine = Color3.FromHexString("#b3a5bd"), forest = Color3.FromHexString("#729081");
  const village = Color3.FromHexString("#bbac83"), cut = Color3.FromHexString(colors.rock);
  const upperGate = course.sampleRoad(LASTLIGHT.sectors[0]).z, lowerGate = course.sampleRoad(LASTLIGHT.sectors[1]).z;
  // Tint the shared terrain itself, rather than overlaying a second mountain.
  for (const mesh of art.scene.meshes) {
    if (!(mesh instanceof Mesh) || !mesh.name.startsWith("lastlight terrain ")) continue;
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const vertexColors: number[] = [];
    for (let vertex = 0; vertex < positions.length; vertex += 3) {
      const px = positions[vertex], py = positions[vertex + 1], pz = positions[vertex + 2];
      const upperMix = Math.max(0, Math.min(1, (pz - upperGate + 32) / 64));
      const lowerMix = Math.max(0, Math.min(1, (pz - lowerGate + 32) / 64));
      const chapter = Color3.Lerp(Color3.Lerp(alpine, forest, upperMix), village, lowerMix);
      const slope = Math.hypot(course.terrainHeight(px + 4, pz) - course.terrainHeight(px - 4, pz),
        course.terrainHeight(px, pz + 4) - course.terrainHeight(px, pz - 4)) / 8;
      const tint = Math.min(0.88, 0.1 + slope * 0.65);
      const cliff = Color3.Lerp(chapter, cut, tint);
      const snow = Math.max(0, Math.min(0.86, (py - 365) / 75)) * Math.max(0, 1 - slope * 0.25);
      const color = Color3.Lerp(cliff, Color3.FromHexString(colors.ice), snow);
      const stratum = 0.91 + 0.09 * Math.sin(py * 0.34 + Math.sin(pz * 0.011));
      color.scaleInPlace(stratum);
      vertexColors.push(color.r, color.g, color.b, 1);
    }
    mesh.setVerticesData(VertexBuffer.ColorKind, vertexColors);
  }
}

function retainingWalls(art: Atelier, course: CourseQuery): void {
  const routes = [
    { name: "main", points: course.road, width: LASTLIGHT.shoulderWidth },
    ...LASTLIGHT.shortcuts.map(shortcut => ({
      name: shortcut.id, points: samplePath(shortcut.points, false, 160), width: shortcut.halfWidth + 0.6,
    })),
  ];
  const sandstone = Color3.FromHexString(colors.rockLight), granite = Color3.FromHexString(colors.shadow);
  for (const route of routes) for (let chunk = 0; chunk < route.points.length - 1; chunk += 40) {
    const positions: number[] = [], indices: number[] = [], vertexColors: number[] = [];
    for (let i = chunk; i < Math.min(chunk + 40, route.points.length - 1); i++) {
      const a = route.points[i], b = route.points[i + 1];
      if (route.name === "main" && course.isGap((a.u + b.u) / 2)) continue;
      for (const side of [-1, 1]) {
        const base = positions.length / 3;
        for (const point of [a, b]) {
          const [x, , z] = offset(point, side * (route.width - 0.01));
          const bridge = route.name === "main" && point.u > 23.4 / 48 && point.u < 26.2 / 48;
          const bottom = bridge ? point.y - 0.8 : course.terrainHeight(x, z) - 0.3;
          positions.push(x, bottom, z, x, point.y + 0.015, z);
          const tint = 0.24 + noise(i % 4) * 0.14;
          const shade = Color3.Lerp(granite, sandstone, tint);
          vertexColors.push(shade.r, shade.g, shade.b, 1, sandstone.r, sandstone.g, sandstone.b, 1);
        }
        if (side > 0) indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        else indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }
    if (!positions.length) continue;
    const mesh = art.mesh(`lastlight retaining ${route.name} ${chunk}`, positions, indices, vertexColors);
    mesh.material = art.material("#ffffff");
    mesh.receiveShadows = true;
    mesh.freezeWorldMatrix();
  }
}

function viaduct(art: Atelier, course: CourseQuery): void {
  for (let segment = 0; segment < 6; segment++) {
    const u = (23.65 + segment * 0.38) / 48, point = course.sampleRoad(u);
    const foot = course.terrainHeight(point.x, point.z);
    const root = new TransformNode(`lastlight viaduct bay ${segment}`, art.scene);
    root.position.set(point.x, point.y, point.z);
    root.rotation.y = Math.atan2(point.dx, point.dz);
    const height = Math.max(4, point.y - foot);
    for (const side of [-1, 1]) {
      art.sculpt("tapered viaduct pier", [
        [-height - 1, 2.2, 2.6, side * 4.8], [-height + 1, 1.5, 2.1, side * 4.8],
        [-2, 1, 1.8, side * 4.8], [-0.2, 1.7, 2.6, side * 4.8],
      ], colors.rockLight, root, 0.55, 8);
      art.sweep("viaduct stone arch", [
        [side * 5.7, -12, -15], [side * 5.7, -5, -10], [side * 5.7, -1.8, 0],
        [side * 5.7, -5, 10], [side * 5.7, -12, 15],
      ], [1.1, 1, 1, 1, 1.1], colors.rock, root, 8);
    }
    bake(art, root);
  }
}

function lake(art: Atelier, course: CourseQuery): void {
  for (let z = 1280; z < 2176; z += 64) for (let x = 192; x < 576; x += 64) {
    const y = LASTLIGHT.waterLevel;
    const water = art.mesh(`lastlight lake ${x}:${z}`, [x, y, z, x + 64, y, z, x, y, z + 64, x + 64, y, z + 64], [0, 2, 1, 1, 2, 3]);
    water.material = art.material(colors.water);
    water.freezeWorldMatrix();
  }
  for (let i = 0; i < 38; i++) {
    const x = 405 + Math.sin(i * 8.21) * 36, z = 1380 + i * 17;
    const width = 8 + noise(i + 54) * 24;
    if (!course.isWater(x - width, z) || !course.isWater(x + width, z)) continue;
    const glint = art.mesh(`lastlight sunset on water ${i}`, [
      x - width, LASTLIGHT.waterLevel + 0.025, z, x + width, LASTLIGHT.waterLevel + 0.025, z,
      x - width * 0.8, LASTLIGHT.waterLevel + 0.025, z + 1.4, x + width * 0.8, LASTLIGHT.waterLevel + 0.025, z + 1.4,
    ], [0, 2, 1, 1, 2, 3]);
    glint.material = art.material(i % 3 ? colors.waterLight : colors.lamp, true);
    glint.freezeWorldMatrix();
  }
}

function glideLandmarks(art: Atelier, course: CourseQuery): Mesh[] {
  const casters: Mesh[] = [];
  for (const [index, u] of [LASTLIGHT.glides[0].start, LASTLIGHT.glides[0].end].entries()) {
    const point = course.sampleRoad(u);
    const root = new TransformNode(`lastlight ${index ? "landing" : "launch"} lanterns`, art.scene);
    root.position.set(point.x, point.y, point.z);
    for (const side of [-1, 1]) {
      art.sculpt("canyon relay column", [
        [-36, 1.6, 1.7, side * 9.6], [-4, 1.25, 1.4, side * 9.6],
        [0, 1.7, 1.7, side * 9.6], [7.5, 1, 1, side * 9.6], [8, 1.5, 1.5, side * 9.6],
      ], colors.rock, root, 0.65, 10);
      const light = art.oval("wing beacon", [side * 9.6, 9, 0], [2, 2.5, 2], colors.lamp, root, 0.8, 8);
      light.material = art.material(colors.lamp, true);
      art.sculpt("beacon petal hood", [
        [10, 1.8, 1.8, side * 9.6], [10.7, 1.2, 1.2, side * 9.6], [11.5, 0.03, 0.03, side * 9.6],
      ], colors.roof, root, 1, 10);
    }
    casters.push(...bake(art, root));
  }
  for (const side of [-1, 1]) {
    const root = new TransformNode(`lastlight canyon cable ${side}`, art.scene);
    art.sweep("glide corridor cable", [
      [side * 9.6, 76, 1432], [side * 11.2, 58, 1456], [side * 9.6, 59, 1488],
    ], [0.11, 0.11, 0.11], colors.wood, root, 6);
    bake(art, root);
  }
  for (const [u, text] of [[39 / 48, "LAKE GLIDE"], [42 / 48, "LASTLIGHT"]] as const) {
    const point = course.sampleRoad(u);
    const [x, , z] = offset(point, -10.2);
    const board = art.sign(`lastlight ${text} board`, text, [x, point.y + 3.4, z], 5.3, colors.shadow, 1);
    board.rotation.y = Math.atan2(point.dx, point.dz);
  }
  return casters;
}

function maintenance(art: Atelier) {
  return LASTLIGHT.hazards.map(hazard => {
    const root = new TransformNode(hazard.id, art.scene);
    art.sculpt("round maintenance trolley", [
      [-1.04, 0.78, 0.75], [-0.6, 1.2, 1.1], [0.4, 1.05, 1],
      [0.75, 0.8, 0.75], [0.85, 0.4, 0.4],
    ], colors.copper, root, 0.6, 10);
    art.oval("trolley custard nose", [0, -0.15, -1.05], [1.5, 0.45, 0.15], colors.chalk, root, 0.65, 6);
    art.oval("trolley warning dome", [0, 0.88, 0], [0.45, 0.42, 0.45], colors.lamp, root, 1, 6)
      .material = art.material(colors.lamp, true);
    for (const x of [-0.85, 0.85]) for (const z of [-0.6, 0.6]) {
      const wheel = art.cylinder("trolley rubber wheel", [x, -0.75, z], 0.6, 0.6, 0.24, colors.shadow, root);
      wheel.rotation.z = Math.PI / 2;
    }
    art.batchModel(root, new Set(), true);
    root.position.set(...hazardPosition(hazard, 0));
    const tracks = new TransformNode(`${hazard.id} trolley rails`, art.scene);
    const [cx, cy, cz] = hazard.position;
    tracks.position.set(cx, cy - hazard.height / 2, cz);
    for (const side of [-1, 1]) {
      art.sweep("maintenance wheel rail", [[side * 0.85, -0.08, -12], [side * 0.85, -0.08, 12]], [0.1, 0.1], colors.shadow, tracks, 6);
      for (const end of [-1, 1]) {
        const ground = LASTLIGHT.groundHeight(cx + side * 0.85, cz + end * 11);
        art.sweep("maintenance rail trestle", [
          [side * 0.85, ground - (cy - hazard.height / 2), end * 11],
          [side * 0.85, -0.2, end * 11],
        ], [0.22, 0.14], colors.wood, tracks, 6);
      }
    }
    bake(art, tracks);
    const signals: Mesh[] = [];
    for (const side of [-1, 1]) {
      const post = new TransformNode(`${hazard.id} signal ${side}`, art.scene);
      const [x, y, z] = hazard.position;
      post.position.set(x - 3, y - 1.1, z + side * 12);
      art.sweep("crossing signal mast", [[0, -8, 0], [0, 2.5, 0]], [0.24, 0.18], colors.wood, post, 6);
      art.oval("signal amber rim", [0, 2.8, 0], [1.1, 1.1, 0.35], colors.chalk, post, 1, 8);
      const signal = art.oval("crossing warning lamp", [0, 2.8, -0.25], [0.72, 0.72, 0.2], colors.lamp, post, 1, 8);
      signal.material = art.material(colors.lamp, true);
      signals.push(signal);
      art.batchModel(post, new Set([signal]), true);
    }
    return { hazard, root, signals };
  });
}

function cornerMarkers(art: Atelier, course: CourseQuery): Mesh[] {
  const casters: Mesh[] = [];
  for (const index of [4, 10, 16, 22, 28, 34, 45]) {
    const point = course.sampleRoad(index / 48);
    const before = course.sampleRoad((index - 0.4) / 48), after = course.sampleRoad((index + 0.4) / 48);
    const turn = Math.sign(after.dx * before.dz - after.dz * before.dx);
    const [x, , z] = offset(point, -turn * 12);
    const root = new TransformNode(`lastlight hairpin ${index}`, art.scene);
    root.position.set(x, point.y + 1, z);
    root.rotation.y = Math.atan2(before.dx, before.dz);
    art.sculpt("rounded hairpin direction board", [
      [0, 3.9, 0.35], [0.35, 4.2, 0.35], [2.4, 4.2, 0.35], [2.75, 3.9, 0.35],
    ], colors.shadow, root, 0.35, 8);
    for (const side of [-1, 1]) art.sweep("hairpin sign legs", [[side * 2.8, -12, 0], [side * 2.8, 1, 0]], [0.19, 0.19], colors.wood, root, 6);
    for (let arrow = -1; arrow <= 1; arrow++) {
      art.sweep("direction chevron", [
        [arrow * 2.3 - turn * 0.6, 0.55, -0.42],
        [arrow * 2.3 + turn * 0.5, 1.35, -0.42],
        [arrow * 2.3 - turn * 0.6, 2.15, -0.42],
      ], [0.18, 0.18, 0.18], colors.chalk, root, 6);
    }
    casters.push(...bake(art, root));
  }
  return casters;
}

export function makeLastlightWorld(art: Atelier, course: CourseQuery): CourseWorld {
  const casters = buildCourseSurface(art, course, LASTLIGHT);
  terrainChapters(art, course);
  retainingWalls(art, course);
  const approaches = hazardApproaches(art, course, LASTLIGHT.hazards,
    { frame: colors.chalk, signal: colors.lamp, dark: colors.shadow });
  casters.push(...approaches.casters);
  // Cross-valley strata make the cut faces read as one mountain rather than isolated rock props.
  for (const side of [-1, 1]) for (let shelf = 0; shelf < 8; shelf++) {
    const positions: number[] = [], indices: number[] = [];
    for (let i = 0; i <= 16; i++) {
      const z = 60 + shelf * 152 + i * 8;
      const x = side * (348 + 26 * Math.sin(z * 0.012 + shelf * 0.5));
      for (const across of [-0.7, 0.7]) {
        const px = x + across;
        positions.push(px, course.terrainHeight(px, z) + 0.18, z);
      }
      if (i < 16) {
        const a = i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const seam = art.mesh(`lastlight exposed strata ${side}:${shelf}`, positions, indices);
    seam.material = art.material(shelf < 3 ? colors.ice : colors.rockLight);
    seam.material.backFaceCulling = false;
    seam.freezeWorldMatrix();
  }
  const props = new MountainProps(art, course);
  defineProps(art, props);

  // Keep the road, shortcut mouths, and corner sightlines free of decorative solids.
  for (let i = 1; i < 125; i++) {
    const point = course.sampleRoad(i / 125), summit = point.u < LASTLIGHT.sectors[0];
    for (const side of [-1, 1]) {
      const [x, , z] = offset(point, side * (22 + noise(i * 2 + side) * 12));
      if (course.projectRoad(x, z).separation > 13) {
        const size = 0.95 + noise(i * 7 + side) * 1.2;
        props.add(summit ? "alpine rock" : "rock", [x, course.terrainHeight(x, z), z], [size, size * 1.3, size], i * 1.73);
        props.add("scrub", [x + side * 3, course.terrainHeight(x + side * 3, z + 5), z + 5], [1.3, 1.3, 1.3], i);
      }
      if (point.u > 0.32 && point.u < 0.82) for (let row = 0; row < 3; row++) {
        const [tx, , tz] = offset(point, side * (22 + row * 15 + noise(i * 17 + row) * 9), noise(i + row) * 14);
        if (course.projectRoad(tx, tz).separation < 14) continue;
        const scale = 0.8 + noise(i * 31 + row) * 0.8;
        props.add((i + row) % 5 ? "fir" : "larch", [tx, course.terrainHeight(tx, tz), tz], [scale, scale, scale], i);
      }
    }
  }
  for (let i = 0; i < 24; i++) {
    const point = course.sampleRoad(0.02 + i / 24 * 0.91);
    for (const side of [-1, 1]) {
      const x = side * (440 + noise(i * 3) * 65), z = point.z + noise(i) * 45;
      const scale = 18 + noise(i * 7) * 15;
      props.add(i < 8 ? "alpine rock" : "rock", [x, course.terrainHeight(x, z) - 5, z], [scale, scale * (1.8 + noise(i)), scale * 1.4], i);
    }
  }
  for (let i = 0; i < 30; i++) {
    const point = course.sampleRoad(0.85 + i / 30 * 0.149);
    for (const side of [-1, 1]) {
      const [x, , z] = offset(point, side * 10.3);
      props.add("lamp", [x, course.terrainHeight(x, z), z], [1, 1.7, 1], Math.atan2(point.dx, point.dz) + (side < 0 ? 0 : Math.PI));
    }
    if (i % 2) continue;
    const side = i % 4 ? 1 : -1;
    for (let row = 0; row < 2; row++) {
      const [x, , z] = offset(point, side * (26 + row * 24), row * 13);
      if (course.projectRoad(x, z).separation < 18 || course.isWater(x, z)) continue;
      const scale = 0.8 + noise(i + row) * 0.4;
      props.add("chalet", [x, course.terrainHeight(x, z), z], [scale, scale, scale], Math.atan2(point.dx, point.dz) + (side > 0 ? -0.4 : 0.4));
      props.add("larch", [x + side * 10, course.terrainHeight(x + side * 10, z + 4), z + 4], [1.1, 1.1, 1.1]);
    }
  }
  props.finish();
  casters.push(...observatory(art, course));
  casters.push(...portal(art, course, 0, "SUMMIT RELAY", 1));
  casters.push(...portal(art, course, LASTLIGHT.sectors[0], "SWITCHBACK WORKS", 2));
  casters.push(...portal(art, course, LASTLIGHT.sectors[1], "LASTLIGHT VILLAGE", 3));
  casters.push(...portal(art, course, 1, "LASTLIGHT FINISH", 3));
  casters.push(...glideLandmarks(art, course));
  casters.push(...cornerMarkers(art, course));
  viaduct(art, course);
  lake(art, course);

  for (const obstacle of LASTLIGHT.obstacles) {
    const root = new TransformNode(obstacle.id, art.scene);
    root.position.set(...obstacle.position);
    const radius = obstacle.radius!;
    art.sculpt("mile stone", [
      [0, radius, radius], [0.4, radius, radius], [obstacle.height - 0.8, radius * 0.9, radius * 0.9],
      [obstacle.height, radius * 0.4, radius * 0.4],
    ], colors.rockLight, root, 1, 10);
    const cap = art.oval("mile stone lamp", [0, obstacle.height - 0.4, -radius * 0.9], [0.6, 0.3, 0.15], colors.lamp, root, 1, 6);
    cap.material = art.material(colors.lamp, true);
    casters.push(...bake(art, root));
  }
  const moving = maintenance(art);
  for (const actor of moving) casters.push(...actor.root.getChildMeshes().filter((mesh): mesh is Mesh => mesh instanceof Mesh));
  const ledge = course.sampleRoad(LASTLIGHT.shortcuts[0].from);
  const [sx, , sz] = offset(ledge, 10.2, -6);
  const ledgeSign = art.sign("lastlight ledge choice", "GOAT LEDGE", [sx, ledge.y + 2.7, sz], 4.8, colors.shadow, 1);
  ledgeSign.rotation.y = Math.atan2(ledge.dx, ledge.dz);
  return {
    casters,
    environment: {
      sky: LASTLIGHT.palette.sky, skyStyle: "dusk", fogStart: 170, fogEnd: 850,
      sun: "#ffcfad", sunIntensity: 1.12, fill: "#d2d4f0", fillIntensity: 0.72, ground: "#777486",
    },
    animate(time: number) {
      approaches.animate(time);
      for (const actor of moving) {
        const position = hazardPosition(actor.hazard, time);
        actor.root.position.set(...position);
        const imminent = Math.abs(position[2] - actor.hazard.position[2]) < 7;
        for (const signal of actor.signals) signal.scaling.setAll(imminent ? 1 : 0.7);
      }
    },
  };
}
