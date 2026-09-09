import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
  BARNS, ORCHARD, ROAD, ROAD_WIDTH, SHOULDER_WIDTH, WATER_LEVEL, bankHeight, bankWidth,
  butterbellHazards, terrainHeight, getCourse, isGap, projectRoad, surfaceHeight, isWater,
} from "@kartsick/content";
import { Atelier } from "./geometry";
import { makeWorld } from "./world";
import { makeCourseWorld } from "./course-worlds";
import type { StudyWorld } from "./world";
import { butterbellDecorationClearance } from "./butterbell-art";
import { butterbellFieldColor, butterbellTexturePixels, BUTTERBELL_TEXTURE_SIZE, BUTTERBELL_TEXTURES } from "./butterbell-materials";

describe("Butterbell authored countryside", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const art = new Atelier(scene);
  const cylinders = vi.spyOn(art, "cylinder"), boxes = vi.spyOn(art, "box");
  const rawMeshes: [string, number[], number[]][] = [], buildMesh = art.mesh.bind(art);
  const meshCalls = vi.spyOn(art, "mesh").mockImplementation((...args) => {
    rawMeshes.push([args[0], args[1].slice(), args[2].slice()]);
    return buildMesh(...args);
  });
  const canvas = vi.spyOn(engine, "createCanvas").mockImplementation(() => ({
    width: 1024, height: 1024, getContext: () => ({
      fillRect() {}, fillText() {}, clearRect() {}, measureText: (text: string) => ({ width: text.length * 45 }),
    }),
  } as unknown as ReturnType<NullEngine["createCanvas"]>));
  let world: StudyWorld;
  beforeAll(() => { world = makeCourseWorld(art, "butterbell"); }, 20000);
  afterAll(() => {
    canvas.mockRestore(); cylinders.mockRestore(); boxes.mockRestore(); meshCalls.mockRestore();
    scene.dispose(); engine.dispose();
  });

  it("keeps terrain and pond vertices on the canonical physical surfaces", () => {
    const ground = scene.meshes.filter(m => m.name.startsWith("butterbell living pasture"));
    expect(ground).toHaveLength(36);
    for (const mesh of ground) {
      const p = mesh.getVerticesData(VertexBuffer.PositionKind)!;
      for (let i = 0; i < p.length; i += 3) expect(p[i + 1]).toBeCloseTo(terrainHeight(p[i], p[i + 2]), 4);
    }
    const water = scene.getMeshByName("butterbell irrigation water")!;
    const p = water.getVerticesData(VertexBuffer.PositionKind)!;
    for (let i = 0; i < p.length; i += 3) {
      expect(p[i + 1]).toBeCloseTo(WATER_LEVEL, 6);
      expect(((p[i] - 77) / 36) ** 2 + ((p[i + 2] + 14) / 27) ** 2).toBeLessThanOrEqual(1.000001);
    }
    for (const prefix of ["butterbell living pasture", "butterbell aggregate raceway", "butterbell enamel kerbs",
      "butterbell physical banks", "butterbell packed verges", "butterbell irrigation water"]) {
      const meshes = scene.meshes.filter(m => m.name.startsWith(prefix));
      expect(meshes.length, prefix).toBeGreaterThan(0);
      for (const mesh of meshes) {
        const normals = mesh.getVerticesData(VertexBuffer.NormalKind)!;
        for (let i = 1; i < normals.length; i += 3) expect(normals[i], mesh.name).toBeGreaterThan(0);
      }
    }
  });

  it("retains the original barn, tree and silo solid cores", () => {
    const trunks = cylinders.mock.calls.filter(([name]) => name === "orchard trunk core");
    expect(trunks).toHaveLength(ORCHARD.length);
    for (let i = 0; i < trunks.length; i++) {
      const t = ORCHARD[i], call = trunks[i];
      expect(call[1]).toEqual([t.x, terrainHeight(t.x, t.z) + 1.7 * t.scale, t.z]);
      expect(call[3]).toBe(.52 * t.scale);
      expect(call[4]).toBe(3.4 * t.scale);
    }
    const barns = boxes.mock.calls.filter(([name]) => name === "barn collider siding");
    expect(barns).toHaveLength(BARNS.length);
    for (let i = 0; i < barns.length; i++) {
      expect(barns[i][1]).toEqual([BARNS[i].x, terrainHeight(BARNS[i].x, BARNS[i].z) + 3.6, BARNS[i].z]);
      expect(barns[i][2]).toEqual([14, 7.2, 12]);
    }
    const silos = cylinders.mock.calls.filter(([name]) => name === "silo cream body");
    expect(silos.map(c => c.slice(2, 5))).toEqual([[5, 5.4, 10], [5, 5.4, 10]]);
  });

  it("has upward-facing rolling terrain outside, not through, the physical course", () => {
    const hills = scene.getMeshByName("butterbell rolling countryside")!;
    const positions = hills.getVerticesData(VertexBuffer.PositionKind)!;
    const normals = hills.getVerticesData(VertexBuffer.NormalKind)!;
    const heights = new Set<number>();
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], y = positions[i + 1], z = positions[i + 2];
      expect(Math.abs(x) >= 239.999 || Math.abs(z) >= 249.999).toBe(true);
      expect(normals[i + 1]).toBeGreaterThan(0);
      if (i < 241 * 3) expect(y).toBeCloseTo(terrainHeight(x, z), 4);
      heights.add(Math.round(y));
    }
    expect(heights.size).toBeGreaterThan(65);
    expect(world.environment!.sunIntensity + world.environment!.fillIntensity).toBeLessThanOrEqual(1);
  });

  it("does not widen, elevate or bridge the physical road and samples the exact bank equation", () => {
    for (let chunk = 0; chunk < ROAD.length - 1; chunk += 40) {
      const road = scene.getMeshByName(`butterbell aggregate raceway ${chunk}`);
      const bank = scene.getMeshByName(`butterbell physical banks ${chunk}`);
      const expectedRoad: number[] = [], expectedBank: number[] = [];
      for (let i = chunk; i < Math.min(chunk + 40, ROAD.length - 1); i++) {
        const a = ROAD[i], b = ROAD[i + 1];
        if (isGap((a.u + b.u) / 2)) continue;
        for (const p of [a, b]) for (const side of [-1, 1]) {
          expectedRoad.push(p.x + p.dz * side * ROAD_WIDTH / 2, p.y + .02, p.z - p.dx * side * ROAD_WIDTH / 2);
        }
        for (const side of [-1, 1]) for (const p of [a, b]) for (let step = 0; step <= 8; step++) {
          const width = SHOULDER_WIDTH + bankWidth(p) * step / 8;
          const x = p.x + p.dz * side * width, z = p.z - p.dx * side * width;
          expectedBank.push(x, bankHeight(p, x, z, width) + .008, z);
        }
      }
      if (!expectedRoad.length) {
        expect(road).toBeNull(); expect(bank).toBeNull();
      } else {
        expect(Array.from(road!.getVerticesData(VertexBuffer.PositionKind)!)).toEqual(expectedRoad);
        expect(Array.from(bank!.getVerticesData(VertexBuffer.PositionKind)!)).toEqual(expectedBank);
      }
    }
  });

  it("clips raw hills out of the road corridor instead of covering the orchard lane", () => {
    const course = getCourse();
    for (let step = 0; step < 480; step++) {
      const p = course.sampleRoad((step + .5) / 480);
      if (isGap(p.u)) continue;
      for (const lateral of [-6, -3, 0, 3, 6]) {
        const x = p.x + p.dz * lateral, z = p.z - p.dx * lateral;
        const tx = Math.floor((x + 240) / 80), tz = Math.floor((z + 250) / (500 / 6));
        const mesh = scene.getMeshByName(`butterbell living pasture ${tx}:${tz}`)!;
        const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!, indices = mesh.getIndices()!;
        for (let i = 0; i < indices.length; i += 3) {
          const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
          const ab = (positions[b] - positions[a]) * (z - positions[a + 2]) - (positions[b + 2] - positions[a + 2]) * (x - positions[a]);
          const bc = (positions[c] - positions[b]) * (z - positions[b + 2]) - (positions[c + 2] - positions[b + 2]) * (x - positions[b]);
          const ca = (positions[a] - positions[c]) * (z - positions[c + 2]) - (positions[a + 2] - positions[c + 2]) * (x - positions[c]);
          const inside = ab > 1e-8 && bc > 1e-8 && ca > 1e-8 || ab < -1e-8 && bc < -1e-8 && ca < -1e-8;
          if (inside) throw new Error(`Raw hill covers the road at progress ${p.u}, lateral ${lateral}.`);
        }
      }
    }
  });

  it("keeps clipped terrain and the physical bank joined without visible ground holes", () => {
    const surfaces = scene.meshes.filter(mesh => /^butterbell (living pasture|physical banks|aggregate raceway|enamel kerbs|packed verges)/.test(mesh.name))
      .map(mesh => ({ positions: mesh.getVerticesData(VertexBuffer.PositionKind)!, indices: mesh.getIndices()!,
        bounds: mesh.getBoundingInfo().boundingBox }));
    const covered = (x: number, z: number) => surfaces.some(({ positions: p, indices, bounds }) => {
      if (x < bounds.minimum.x - 1e-6 || x > bounds.maximum.x + 1e-6 ||
        z < bounds.minimum.z - 1e-6 || z > bounds.maximum.z + 1e-6) return false;
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
        const ab = (p[b] - p[a]) * (z - p[a + 2]) - (p[b + 2] - p[a + 2]) * (x - p[a]);
        const bc = (p[c] - p[b]) * (z - p[b + 2]) - (p[c + 2] - p[b + 2]) * (x - p[b]);
        const ca = (p[a] - p[c]) * (z - p[c + 2]) - (p[a + 2] - p[c + 2]) * (x - p[c]);
        if (ab >= -1e-6 && bc >= -1e-6 && ca >= -1e-6 || ab <= 1e-6 && bc <= 1e-6 && ca <= 1e-6) return true;
      }
      return false;
    });
    const course = getCourse();
    for (let sample = 0; sample < 320; sample++) {
      const p = course.sampleRoad((sample + .5) / 320);
      if (isGap(p.u)) continue;
      for (const side of [-1, 1]) for (const offset of [-.1, 0, .1]) {
        const across = side * (SHOULDER_WIDTH + bankWidth(p) + offset);
        expect(covered(p.x + p.dz * across, p.z - p.dx * across), `Bank seam ${p.u}/${across}`).toBe(true);
      }
    }
  });

  it("faces roofs outward and loads the branching orchard rather than the old single crowns", () => {
    for (const [, positions, indices] of rawMeshes.filter(([name]) =>
      name === "standing seam gambrel roof" || name === "silo spun metal cap")) {
      const normals: number[] = [];
      VertexData.ComputeNormals(positions, indices, normals);
      for (let i = 1; i < normals.length; i += 3) expect(normals[i]).toBeGreaterThanOrEqual(0);
    }
    expect(rawMeshes.filter(([name]) => name === "butterbell interlocking orchard crowns")).toHaveLength(ORCHARD.length);
    expect(rawMeshes.filter(([name]) => name === "butterbell branching orchard limbs")).toHaveLength(ORCHARD.length);
    expect(rawMeshes.some(([name]) => name === "sculpted orchard canopy")).toBe(false);
  });

  it("never sends zero or nonfinite world normals into HDR lighting and bloom", () => {
    const invalidSources = rawMeshes.flatMap(([name, positions, indices]) => {
      const normals: number[] = [];
      VertexData.ComputeNormals(positions, indices, normals);
      let count = 0;
      for (let i = 0; i < normals.length; i += 3) {
        if (!(Math.hypot(normals[i], normals[i + 1], normals[i + 2]) >= .5)) count++;
      }
      return count ? [{ name, count }] : [];
    });
    expect(invalidSources).toEqual([]);
    const invalid: { mesh: string; vertices: number }[] = [];
    for (const mesh of scene.meshes) {
      const normals = mesh.getVerticesData(VertexBuffer.NormalKind)!;
      let count = 0;
      for (let i = 0; i < normals.length; i += 3) {
        const magnitude = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
        if (!Number.isFinite(magnitude) || magnitude < .5) count++;
      }
      if (count) invalid.push({ mesh: mesh.name, vertices: count });
    }
    expect(invalid).toEqual([]);
  });

  it("keeps added raised furniture clear of the road, banks, farms and flight corridor", () => {
    const furniture = scene.metadata.butterbellFurniture as { x: number; z: number; radius: number; name: string }[];
    expect(furniture.length).toBeGreaterThan(30);
    for (const prop of furniture) {
      expect(butterbellDecorationClearance(prop.x, prop.z, prop.radius), prop.name).toBe(true);
    }
    const overhead = boxes.mock.calls.find(([name]) => name === "Butterbell nameplate border")!;
    const start = getCourse().sampleRoad(0);
    expect(overhead[1][1] - overhead[2][1] / 2 - start.y).toBeGreaterThan(6.9);
  });

  it("grounds farmyards and orchard beds without paving over racing surfaces", () => {
    const patches = rawMeshes.filter(([name]) => /butterbell (dairy cobbled yard|herb bed|orchard mulch)/.test(name));
    expect(patches.filter(([name]) => name.includes("cobbled yard"))).toHaveLength(BARNS.length);
    expect(patches.length).toBeGreaterThan(ORCHARD.length / 2);
    for (const [name, positions, indices] of patches) {
      const normals: number[] = [];
      VertexData.ComputeNormals(positions, indices, normals);
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i], z = positions[i + 2], p = projectRoad(x, z);
        expect(p.separation, name).toBeGreaterThan(SHOULDER_WIDTH + bankWidth(p));
        expect(isWater(x, z), name).toBe(false);
        expect(positions[i + 1], name).toBeCloseTo(surfaceHeight(x, z) + (name.includes("herb bed") ? .18 : .055), 4);
        expect(normals[i + 1], name).toBeGreaterThan(0);
      }
    }
    for (const name of ["butterbell yard", "butterbell verge", "butterbell meadow leaves"]) {
      const material = scene.getMaterialByName(name);
      expect(material, name).not.toBeNull();
      expect(world.casters.some(mesh => mesh.material === material), name).toBe(false);
    }
  });

  it("plants low meadow drifts outside the mown racing verge, not triangular confetti", () => {
    const meadows = rawMeshes.filter(([name]) => name.startsWith("butterbell meadow drift"));
    expect(meadows.length).toBeGreaterThan(8);
    expect(rawMeshes.some(([name]) => name.startsWith("low pasture clover"))).toBe(false);
    for (const [name, positions] of meadows) for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], z = positions[i + 2], p = projectRoad(x, z);
      expect(p.separation, name).toBeGreaterThan(SHOULDER_WIDTH + 1.8);
      expect(positions[i + 1] - surfaceHeight(x, z), name).toBeLessThan(.8);
    }
  });

  it("places the distant hamlet beyond recovery bounds rather than adding unseen driving obstacles", () => {
    const houses = boxes.mock.calls.filter(([name]) => name === "distant dairy cottage");
    expect(houses).toHaveLength(11);
    const bounds = getCourse().bounds;
    for (const [, position, size] of houses) {
      expect(position[2] - size[2] / 2).toBeGreaterThan(bounds.maxZ + 25);
    }
  });

  it("keeps the connected herb beds and hedges low and outside the racing banks", () => {
    const plants = rawMeshes.filter(([name]) => name === "butterbell layered hedge crowns" || name === "butterbell hedge leaf sprays");
    expect(plants.length).toBeGreaterThan(100);
    for (const [name, positions] of plants) for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], z = positions[i + 2], p = projectRoad(x, z);
      expect(p.separation, name).toBeGreaterThan(SHOULDER_WIDTH + bankWidth(p));
      expect(positions[i + 1] - surfaceHeight(x, z), name).toBeLessThan(1.1);
    }
  });

  it("keeps harvest hazards synchronized, including reduced motion and canonical mirroring", () => {
    const roots = [0, 1].map(i => scene.getTransformNodeByName(`hay-roller-${i}`)!);
    const rotor = scene.getTransformNodeByName("butterbell windmill rotor")!;
    const resources = [scene.meshes.length, scene.materials.length, scene.textures.length];
    for (const reduced of [false, true]) for (const time of [0, .1, 1.5, 3.49, 7, 39.37, 260]) {
      world.animate(time, reduced);
      const hazards = butterbellHazards(time), mirrored = getCourse("butterbell", true).hazards(time);
      for (let i = 0; i < roots.length; i++) {
        expect(roots[i].position.asArray()).toEqual([hazards[i].x, hazards[i].y, hazards[i].z]);
        expect(-roots[i].position.x).toBe(mirrored[i].x);
        expect(roots[i].scaling.x).toBe(1);
      }
      if (reduced) expect(rotor.rotation.z).toBe(.22);
    }
    expect([scene.meshes.length, scene.materials.length, scene.textures.length]).toEqual(resources);
  });

  it("retains individual atlas label pivots so mirror mode can keep their lettering readable", () => {
    const labels = scene.meshes.filter(mesh => mesh.name.startsWith("butterbell lettering "));
    expect(labels).toHaveLength(15);
    for (const label of labels) {
      expect(label.getTotalVertices()).toBe(4);
      expect(label.material).toBeInstanceOf(StandardMaterial);
      expect((label.material as StandardMaterial).diffuseTexture?.name).toBe("butterbell original dairy lettering");
    }
  });

  it("uses bounded shared local textures and spatially batched geometry", () => {
    const localTextures = scene.textures.filter(t => t.name.startsWith("butterbell"));
    expect(localTextures).toHaveLength(BUTTERBELL_TEXTURES.length + 3);
    expect(localTextures.filter(t => t.getSize().width === BUTTERBELL_TEXTURE_SIZE)).toHaveLength(BUTTERBELL_TEXTURES.length + 1);
    expect(localTextures.filter(t => t.getSize().width === 256)).toHaveLength(1);
    const bytes = localTextures.reduce((sum, t) => sum + t.getSize().width * t.getSize().height * 4, 0);
    expect(bytes).toBeLessThanOrEqual(5 * 1024 * 1024);
    expect(scene.meshes.length).toBeLessThan(320);
    expect(scene.meshes.reduce((sum, m) => sum + m.getTotalVertices(), 0)).toBeLessThan(280000);
    expect(scene.meshes.reduce((sum, m) => sum + m.getTotalIndices() / 3, 0)).toBeLessThan(345000);
    expect(scene.materials.length).toBeLessThan(65);
    const textured = scene.meshes.filter(m => m.material instanceof StandardMaterial && m.material.diffuseTexture);
    expect(textured.length).toBeGreaterThan(35);
    expect(world.environment?.skyStyle).toBe("day");
    expect(scene.meshes.some(m => m.name === "cloud")).toBe(false);
  });

  it("can release all course resources without disposing a shared environment", () => {
    const isolated = new Scene(engine), painter = new Atelier(isolated);
    const environment = new Texture(null, isolated);
    isolated.environmentTexture = environment;
    const kartPaint = new StandardMaterial("unrelated persistent kart paint", isolated);
    const baseline = [isolated.meshes.length, isolated.materials.length, isolated.textures.length];
    const meshes = new Set(isolated.meshes), textures = new Set(isolated.textures), materials = new Set(isolated.materials);
    makeWorld(painter);
    const roof = isolated.getMaterialByName("butterbell roof");
    expect(roof).toBeInstanceOf(StandardMaterial);
    if (!(roof instanceof StandardMaterial)) throw new Error("The roof material is missing.");
    expect(roof.reflectionTexture).toBe(environment);
    expect(roof.reflectionFresnelParameters?.rightColor.r).toBeLessThan(.1);
    const root = new TransformNode("canonical mirrored course root", isolated);
    for (const node of isolated.rootNodes.slice()) if (node !== root && node instanceof TransformNode) node.parent = root;
    root.scaling.x = -1;
    root.dispose();
    for (const mesh of isolated.meshes.slice()) if (!meshes.has(mesh)) mesh.dispose();
    for (const material of isolated.materials.slice()) if (!materials.has(material)) material.dispose();
    for (const texture of isolated.textures.slice()) if (!textures.has(texture)) texture.dispose();
    expect([isolated.meshes.length, isolated.materials.length, isolated.textures.length]).toEqual(baseline);
    expect(isolated.textures).toContain(environment);
    expect(isolated.materials).toContain(kartPaint);
    isolated.dispose();
  });
});

describe("Butterbell original material studies", () => {
  it("makes deterministic opaque aggregate, plant, grit, wood, roof and hay pixels", () => {
    for (const kind of BUTTERBELL_TEXTURES) {
      const first = butterbellTexturePixels(kind);
      expect(first).toEqual(butterbellTexturePixels(kind));
      expect(first).toHaveLength(BUTTERBELL_TEXTURE_SIZE ** 2 * 4);
      for (let i = 3; i < first.length; i += 4) expect(first[i]).toBe(255);
      expect(new Set(first).size).toBeGreaterThan(15);
    }
    const road = butterbellTexturePixels("asphalt");
    const reds = road.filter((_, i) => i % 4 === 0);
    expect(reds.reduce((sum, value) => sum + value, 0) / reds.length).toBeGreaterThan(102);
    expect(Math.max(...reds) - Math.min(...reds)).toBeLessThanOrEqual(12);
    expect(Math.max(...road.filter((_, i) => i % 4 !== 3))).toBeLessThan(113);
  });

  it("has continuous field colour across former checkerboard boundaries", () => {
    for (const x of [-86, -43, 0, 43, 86]) for (const z of [-96, -48, 0, 48, 96]) {
      const a = butterbellFieldColor(x - .001, z - .001), b = butterbellFieldColor(x + .001, z + .001);
      for (let channel = 0; channel < 3; channel++) expect(Math.abs(a[channel] - b[channel])).toBeLessThan(.0001);
    }
  });
});
