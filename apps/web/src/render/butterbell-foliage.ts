import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { terrainHeight, surfaceHeight } from "@kartsick/content";
import type { Atelier, Triple } from "./geometry";
import type { ButterbellArt } from "./butterbell-art";
import { BUTTERBELL as C, butterbellNoise as noise } from "./butterbell-materials";

interface PlantMesh {
  positions: number[];
  indices: number[];
  colors: number[];
  uvs: number[];
}

interface Crown {
  center: Triple;
  radius: Triple;
  seed: number;
}

const TAU = Math.PI * 2;
const LEAF_SIZE = 256;
const BARK_SIZE = 128;

function plantMesh(): PlantMesh {
  return { positions: [], indices: [], colors: [], uvs: [] };
}

/** A tiled leaf painting, not noise masquerading as foliage. All pixels are opaque. */
function paintedLeaves(): Uint8Array {
  const pixels = new Uint8Array(LEAF_SIZE * LEAF_SIZE * 4);
  for (let y = 0; y < LEAF_SIZE; y++) for (let x = 0; x < LEAF_SIZE; x++) {
    const shade = Math.sin(x / LEAF_SIZE * TAU * 3) * Math.cos(y / LEAF_SIZE * TAU * 2) * 3;
    const i = (y * LEAF_SIZE + x) * 4;
    pixels.set([64 + shade, 91 + shade, 47 + shade, 255], i);
  }
  const palette = [[100, 137, 66], [117, 148, 76], [86, 125, 62], [132, 155, 81], [97, 135, 74]];
  for (let leaf = 0; leaf < 310; leaf++) {
    const cx = noise(leaf * 13 + 7) * LEAF_SIZE, cy = noise(leaf * 19 + 31) * LEAF_SIZE;
    const angle = noise(leaf + 41) * TAU, dx = Math.cos(angle), dy = Math.sin(angle);
    const length = 9 + noise(leaf + 73) * 8, width = 3.4 + noise(leaf + 131) * 3;
    const color = palette[leaf % palette.length], reach = Math.ceil(length + width);
    for (let py = Math.floor(cy) - reach; py <= cy + reach; py++) {
      for (let px = Math.floor(cx) - reach; px <= cx + reach; px++) {
        const u = ((px - cx) * dx + (py - cy) * dy) / length;
        if (Math.abs(u) >= 1) continue;
        const v = -(px - cx) * dy + (py - cy) * dx;
        const edge = width * Math.cos(u * Math.PI / 2) ** .8;
        if (Math.abs(v) > edge) continue;
        const outline = edge - Math.abs(v) < .7 ? -13 : 0;
        const vein = Math.abs(v + Math.sin(u * 3) * .3) < .45 ? 9 : 0;
        const fold = v < 0 ? 5 : -4;
        const tip = u * 3;
        const x = (px % LEAF_SIZE + LEAF_SIZE) % LEAF_SIZE;
        const y = (py % LEAF_SIZE + LEAF_SIZE) % LEAF_SIZE;
        const i = (y * LEAF_SIZE + x) * 4;
        pixels.set(color.map(value => value + outline + vein + fold + tip).concat(255), i);
      }
    }
  }
  return pixels;
}

function paintedBark(): Uint8Array {
  const pixels = new Uint8Array(BARK_SIZE * BARK_SIZE * 4);
  for (let y = 0; y < BARK_SIZE; y++) for (let x = 0; x < BARK_SIZE; x++) {
    const u = x / BARK_SIZE, v = y / BARK_SIZE;
    const bend = Math.sin(v * TAU) * .045 + Math.sin(v * TAU * 3 + u * TAU) * .009;
    const furrow = Math.sin((u + bend) * TAU * 11);
    const grain = Math.sin((u + bend * .7) * TAU * 29) * 3;
    const split = furrow < -.84 ? -20 : furrow > .75 ? 8 : 0;
    const lenticel = Math.sin(u * TAU * 7 + Math.sin(v * TAU * 4)) > .88
      && Math.cos(v * TAU * 17) > .93 ? 15 : 0;
    const shade = split + grain + lenticel;
    pixels.set([116 + shade, 88 + shade * .82, 61 + shade * .58, 255], (y * BARK_SIZE + x) * 4);
  }
  return pixels;
}

/**
 * Allocate once per course: three shared materials and two opaque RGBA textures
 * (256² leaf painting + 128² bark). The course owns their disposal; no scene cache.
 */
export function makeButterbellFoliageMaterials(art: Atelier) {
  const texture = (name: string, data: Uint8Array, size: number) => {
    const result = RawTexture.CreateRGBATexture(data, size, size, art.scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
    result.name = name;
    result.wrapU = result.wrapV = Texture.WRAP_ADDRESSMODE;
    result.anisotropicFilteringLevel = 4;
    result.hasAlpha = false;
    return result;
  };
  const material = (name: string, finish: string) => {
    const result = new StandardMaterial(name, art.scene);
    result.diffuseColor = Color3.White();
    result.specularColor = Color3.FromHexString("#10120c");
    result.specularPower = 24;
    result.roughness = .88;
    result.transparencyMode = StandardMaterial.MATERIAL_OPAQUE;
    result.metadata = { originalProcedural: true, surfaceFinish: finish, butterbellFoliage: true };
    return result;
  };
  const crown = material("butterbell orchard leaf painting", "matte");
  crown.diffuseTexture = texture("butterbell original orchard leaves", paintedLeaves(), LEAF_SIZE);
  // Leaf edges are real folded geometry, not cards; reverse sides need their own lighting.
  crown.backFaceCulling = false;
  crown.twoSidedLighting = true;
  const bark = material("butterbell orchard bark grain", "wood");
  bark.diffuseTexture = texture("butterbell original orchard bark", paintedBark(), BARK_SIZE);
  const fruit = material("butterbell orchard apple skin", "paint");
  fruit.backFaceCulling = false;
  fruit.twoSidedLighting = true;
  fruit.specularColor = Color3.FromHexString("#29231a");
  fruit.specularPower = 48;
  fruit.roughness = .56;
  return { crown, bark, fruit };
}

type FoliageMaterials = ReturnType<typeof makeButterbellFoliageMaterials>;

function vertex(batch: PlantMesh, point: Triple, color: Triple, u: number, v: number): number {
  const index = batch.positions.length / 3;
  batch.positions.push(...point);
  batch.colors.push(...color, 1);
  batch.uvs.push(u, v);
  return index;
}

function crownPoint(crown: Crown, angle: number, latitude: number): Triple {
  const ring = Math.cos(latitude);
  const scallop = 1 + Math.sin(angle * 5 + crown.seed + latitude * 2) * .065
    + Math.sin(angle * 3 - latitude * 3 + crown.seed * .7) * .035;
  return [
    crown.center[0] + Math.cos(angle) * ring * crown.radius[0] * scallop,
    crown.center[1] + Math.sin(latitude) * crown.radius[1]
      + Math.sin(angle * 3 + crown.seed) * ring * .065 * crown.radius[1],
    crown.center[2] + Math.sin(angle) * ring * crown.radius[2] * scallop,
  ];
}

/** Closed crowns share poles, never duplicated zero-area pole rings. */
function addCrown(batch: PlantMesh, crown: Crown, sides = 12, rings = 6): void {
  const base = batch.positions.length / 3;
  const tint = .95 + noise(crown.seed + 129) * .1;
  const color = (height: number): Triple => {
    const value = (.78 + height * .29) * tint;
    return [value, value, value * (.94 + noise(crown.seed) * .08)];
  };
  vertex(batch, crownPoint(crown, 0, -Math.PI / 2), color(0), 1, 0);
  for (let row = 1; row < rings; row++) for (let side = 0; side <= sides; side++) {
    const v = row / rings, u = side / sides;
    vertex(batch, crownPoint(crown, u * TAU, (v - .5) * Math.PI), color(v),
      u * 2 + noise(crown.seed), v + noise(crown.seed + 16));
    if (row < rings - 1 && side < sides) {
      const a = base + 1 + (row - 1) * (sides + 1) + side, b = a + sides + 1;
      batch.indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const top = vertex(batch, crownPoint(crown, 0, Math.PI / 2), color(1), 1, 1);
  for (let side = 0; side < sides; side++) {
    batch.indices.push(base, base + 2 + side, base + 1 + side);
    const last = base + 1 + (rings - 2) * (sides + 1) + side;
    batch.indices.push(top, last, last + 1);
  }
}

function addLeaf(batch: PlantMesh, origin: Vector3, direction: Vector3, length: number, seed: number): void {
  const along = direction.normalizeToNew();
  const across = Vector3.Cross(along, Vector3.Up()).normalize().scaleInPlace(length * .27);
  const normal = Vector3.Cross(across, along).normalize();
  const tint = .91 + noise(seed) * .18;
  const points = [[0, 0], [.3, .8], [.65, 1], [1, 0], [.65, -1], [.3, -.8], [.5, 0]];
  const base = batch.positions.length / 3;
  for (let i = 0; i < points.length; i++) {
    const [forward, sideways] = points[i];
    const point = origin.add(along.scale(forward * length)).add(across.scale(sideways))
      .add(normal.scale((i === 6 ? .10 : forward * forward * -.05) * length));
    const shade = tint * (i === 0 ? .78 : i === 3 ? 1.09 : 1);
    vertex(batch, point.asArray() as [number, number, number], [shade, shade, shade * .94],
      .17 + forward * .065, .26 + sideways * .025);
  }
  for (let side = 0; side < 6; side++) batch.indices.push(base + 6, base + (side + 1) % 6, base + side);
}

function addSprays(batch: PlantMesh, crown: Crown, scale: number, count = 3): void {
  for (let spray = 0; spray < count; spray++) {
    const angle = crown.seed + spray * TAU / count;
    const latitude = -.16 + noise(crown.seed + spray * 21) * .94;
    const anchor = new Vector3(...crownPoint(crown, angle, latitude));
    const outward = new Vector3(Math.cos(angle), .28 + latitude * .4, Math.sin(angle)).normalize();
    const across = new Vector3(-Math.sin(angle), 0, Math.cos(angle));
    for (let leaf = 0; leaf < 3; leaf++) {
      const direction = outward.scale(leaf === 2 ? 1 : .55).add(across.scale(leaf === 0 ? -.83 : leaf === 1 ? .83 : .12));
      const length = (.23 + noise(crown.seed + spray * 11 + leaf) * .12) * scale;
      addLeaf(batch, anchor.add(outward.scale((leaf === 2 ? .12 : -.055) * scale)), direction,
        length, crown.seed + spray * 3 + leaf);
    }
  }
}

function addBranch(batch: PlantMesh, points: Triple[], radii: number[], seed: number): void {
  const sides = 6, base = batch.positions.length / 3;
  for (let row = 0; row < points.length; row++) {
    const center = new Vector3(...points[row]);
    const tangent = new Vector3(...points[Math.min(row + 1, points.length - 1)])
      .subtract(new Vector3(...points[Math.max(0, row - 1)])).normalize();
    const across = Vector3.Cross(tangent, Vector3.Right()).normalize();
    const other = Vector3.Cross(across, tangent).normalize();
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * TAU;
      const point = center.add(across.scale(Math.cos(angle) * radii[row]))
        .add(other.scale(Math.sin(angle) * radii[row]));
      vertex(batch, point.asArray() as [number, number, number], [1, 1, 1], side / sides + seed, row * .65);
      if (row < points.length - 1 && side < sides) {
        const a = base + row * (sides + 1) + side, b = a + sides + 1;
        batch.indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  for (const row of [0, points.length - 1]) {
    const cap = vertex(batch, points[row], [1, 1, 1], .5, .5), ring = base + row * (sides + 1);
    for (let side = 0; side < sides; side++) {
      if (row === 0) batch.indices.push(cap, ring + side + 1, ring + side);
      else batch.indices.push(cap, ring + side, ring + side + 1);
    }
  }
}

function addApple(batch: PlantMesh, point: Triple, scale: number, seed: number): void {
  const base = batch.positions.length / 3, sides = 6;
  const tint = Color3.FromHexString(noise(seed + 719) > .83 ? "#ceb653" : "#c95138");
  const profile = [[-.1, 0], [-.071, .066], [.007, .101], [.078, .073], [.093, 0]];
  const color = (height: number): Triple => {
    const light = .83 + height * .18;
    return [tint.r * light, tint.g * light, tint.b * light];
  };
  vertex(batch, [point[0], point[1] + profile[0][0] * scale, point[2]], color(0), .5, 0);
  for (let row = 1; row < profile.length - 1; row++) for (let side = 0; side <= sides; side++) {
    const angle = side / sides * TAU, [height, width] = profile[row];
    vertex(batch, [point[0] + Math.cos(angle) * width * scale,
      point[1] + height * scale, point[2] + Math.sin(angle) * width * scale], color(row / 4), side / sides, row / 4);
    if (row < profile.length - 2 && side < sides) {
      const a = base + 1 + (row - 1) * (sides + 1) + side, b = a + sides + 1;
      batch.indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const top = vertex(batch, [point[0], point[1] + profile[4][0] * scale, point[2]], color(1), .5, 1);
  for (let side = 0; side < sides; side++) {
    batch.indices.push(base, base + 2 + side, base + 1 + side);
    const last = base + 1 + 2 * (sides + 1) + side;
    batch.indices.push(top, last, last + 1);
  }
}

function emit(art: ButterbellArt, name: string, batch: PlantMesh, material: StandardMaterial, x: number, z: number): void {
  const mesh = art.mesh(name, batch.positions, batch.indices, material, batch.colors, batch.uvs, art.root(x, z));
  // Weld only the lighting at UV seams; separate opposite-facing surfaces stay separate.
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind)!;
  const seams = new Map<string, number[]>();
  for (let i = 0; i < batch.positions.length; i += 3) {
    const key = batch.positions.slice(i, i + 3).map(value => value.toFixed(6)).join(":");
    const group = seams.get(key) ?? [];
    group.push(i);
    seams.set(key, group);
  }
  for (const group of seams.values()) {
    if (group.length < 2) continue;
    const total = Vector3.Zero();
    for (const i of group) total.addInPlace(new Vector3(normals[i], normals[i + 1], normals[i + 2]));
    if (total.lengthSquared() < .25) continue;
    total.normalize();
    for (const i of group) {
      normals[i] = total.x; normals[i + 1] = total.y; normals[i + 2] = total.z;
    }
  }
  mesh.setVerticesData(VertexBuffer.NormalKind, normals);
}

/** Seven overlapping branch-led crowns with leaf-spray edges, at the existing tree location. */
export function butterbellOrchardTree(art: ButterbellArt, materials: FoliageMaterials,
  x: number, z: number, scale: number, seed: number): void {
  const ground = terrainHeight(x, z);
  const trunk = art.cylinder("orchard trunk core", [x, terrainHeight(x, z) + 1.7 * scale, z],
    .32 * scale, .52 * scale, 3.4 * scale, C.timber, "wood");
  trunk.material = materials.bark;
  trunk.setVerticesData(VertexBuffer.ColorKind, new Array(trunk.getTotalVertices() * 4).fill(1));
  const yaw = seed * .73, c = Math.cos(yaw), s = Math.sin(yaw);
  const point = (px: number, py: number, pz: number): Triple =>
    [x + (px * c - pz * s) * scale, ground + py * scale, z + (px * s + pz * c) * scale];
  const layout: readonly (readonly [Triple, Triple])[] = [
    [[0, 4.46, 0], [1.46, 1.12, 1.35]],
    [[1.21, 4.61, .16], [1.19, 1.27, 1.13]],
    [[-.62, 4.77, 1.12], [1.27, 1.3, 1.16]],
    [[-.71, 4.61, -1.02], [1.27, 1.25, 1.13]],
    [[.16, 5.7, -.22], [1.23, 1.08, 1.08]],
    [[.89, 5.68, .85], [.96, .87, .93]],
    [[-1.31, 5.22, -.12], [1.01, 1.04, 1.08]],
  ];
  const crowns = layout.map(([center, radius], i): Crown => ({
    center: point(center[0] + (noise(seed + i * 29) - .5) * .14,
      center[1] + (noise(seed + i * 19) - .5) * .22,
      center[2] + (noise(seed + i * 31) - .5) * .14),
    radius: radius.map((value, axis) => value * scale * (.95 + noise(seed + i * 17 + axis * 13) * .1)) as [number, number, number],
    seed: seed + i * 7.13,
  }));
  const wood = plantMesh(), leaves = plantMesh(), sprays = plantMesh(), apples = plantMesh();
  for (let branch = 0; branch < 4; branch++) {
    const target = layout[branch + 1][0], angle = Math.atan2(target[2], target[0]);
    const bend = angle + (noise(seed + branch * 23) - .5) * .58;
    const split = 3.94 + noise(seed + branch * 41) * .16;
    const elbow: Triple = [target[0] * .72, split, target[2] * .72];
    addBranch(wood, [
      point(Math.cos(angle) * .035, 2.86 + noise(seed + branch * 37) * .21, Math.sin(angle) * .035),
      point(Math.cos(bend) * .36, 3.43 + noise(seed + branch * 43) * .12, Math.sin(bend) * .36),
      point(...elbow), point(target[0], target[1], target[2]),
    ], [.16, .125, .079, .028].map(value => value * scale), noise(seed + branch));
    const tip = layout[branch + 3][0];
    addBranch(wood, [
      point(...elbow),
      point(elbow[0] * .62 + tip[0] * .38, split + .36, elbow[2] * .62 + tip[2] * .38),
      point(tip[0], tip[1], tip[2]),
    ], [.069, .047, .016].map(value => value * scale), noise(seed + branch + 30));
  }
  for (const crown of crowns) {
    addCrown(leaves, crown);
    addSprays(sprays, crown, scale);
  }
  // Small, irregular pairs sit below the boughs; fruit is not a ring of giant canopy dots.
  for (let pair = 0; pair < 6; pair++) {
    const crown = crowns[1 + pair % 3], angle = seed + pair * 2.39;
    const anchor = crownPoint(crown, angle, -.39 - noise(seed + pair) * .23);
    for (let fruit = 0; fruit < 2; fruit++) {
      addApple(apples, [anchor[0] + Math.cos(angle + 1.57) * fruit * .21 * scale,
        anchor[1] - (.075 + fruit * .11) * scale,
        anchor[2] + Math.sin(angle + 1.57) * fruit * .21 * scale],
      scale * (.83 + noise(seed + pair * 11 + fruit) * .24), seed + pair * 2 + fruit);
    }
  }
  emit(art, "butterbell branching orchard limbs", wood, materials.bark, x, z);
  emit(art, "butterbell interlocking orchard crowns", leaves, materials.crown, x, z);
  emit(art, "butterbell orchard leaf sprays", sprays, materials.crown, x, z);
  emit(art, "butterbell clustered orchard apples", apples, materials.fruit, x, z);
}

/**
 * Herb/hedge unit: (art, sharedMaterials, x, z, scale, seed, height = .55).
 * Scale controls the approximately 2 m footprint; height is the total height in
 * metres above surfaceHeight, independent of scale. Three overlapping masses
 * share the orchard materials. No trunk/collider; the caller owns clearance.
 */
export function butterbellShrub(art: ButterbellArt, materials: FoliageMaterials,
  x: number, z: number, scale: number, seed: number, height = .55): void {
  const ground = surfaceHeight(x, z), leaves = plantMesh(), sprays = plantMesh();
  for (let i = 0; i < 3; i++) {
    const angle = seed + i * TAU / 3;
    const crown: Crown = {
      center: [x + Math.cos(angle) * .38 * scale, ground + (.44 + (i === 0 ? .18 : 0)) * scale,
        z + Math.sin(angle) * .32 * scale],
      radius: [.61 * scale, .42 * scale, .55 * scale], seed: seed + i * 7.13,
    };
    addCrown(leaves, crown, 10, 5);
    addSprays(sprays, crown, scale * .63, 2);
  }
  let bottom = Infinity, top = -Infinity;
  for (const batch of [leaves, sprays]) for (let i = 1; i < batch.positions.length; i += 3) {
    bottom = Math.min(bottom, batch.positions[i]);
    top = Math.max(top, batch.positions[i]);
  }
  for (const batch of [leaves, sprays]) for (let i = 1; i < batch.positions.length; i += 3) {
    batch.positions[i] = ground + (batch.positions[i] - bottom) / (top - bottom) * height;
  }
  emit(art, "butterbell layered hedge crowns", leaves, materials.crown, x, z);
  emit(art, "butterbell hedge leaf sprays", sprays, materials.crown, x, z);
}
