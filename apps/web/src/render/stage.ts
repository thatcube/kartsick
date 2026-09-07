import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { Engine } from "@babylonjs/core/Engines/engine";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { CourseId } from "@kartsick/content";
import type { Settings } from "../storage";
import { Atelier } from "./geometry";
import { makeCourseWorld } from "./course-worlds";
import type { CourseWorld } from "./world-types";

const MORNING = {
  sky: "#badce8", fogStart: 155, fogEnd: 395, sun: "#f9eacd", sunIntensity: 0.83,
  fill: "#e4f2f4", fillIntensity: 0.65, ground: "#839074",
};

function buildWorld(scene: Scene, id: CourseId) {
  const existing = new Set(scene.rootNodes);
  const materials = new Set(scene.materials), textures = new Set(scene.textures);
  // World materials have their own atelier; unloading a course cannot dispose a kart's paint.
  const world = makeCourseWorld(new Atelier(scene), id);
  const root = new TransformNode(`course geometry ${id}`, scene);
  for (const node of scene.rootNodes.slice()) {
    if (existing.has(node) || node === root || !(node instanceof TransformNode)) continue;
    if (node instanceof Mesh) node.unfreezeWorldMatrix();
    node.parent = root;
  }
  const ownedMaterials = scene.materials.filter(material => !materials.has(material));
  const ownedTextures = scene.textures.filter(texture => !textures.has(texture));
  return { world, root, dispose() {
    root.dispose();
    for (const material of ownedMaterials) material.dispose();
    for (const texture of ownedTextures) texture.dispose();
  } };
}

export function makeCamera(scene: Scene, name: string): FreeCamera {
  const camera = new FreeCamera(name, new Vector3(0, 6, -120), scene);
  camera.minZ = 0.15;
  camera.maxZ = 600;
  camera.fov = 0.89;
  camera.inputs.clear();
  return camera;
}

export function createStage(canvas: HTMLCanvasElement, settings: Settings) {
  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false, powerPreference: "high-performance" });
  try {
    if (engine.webGLVersion < 2) throw new Error("Kartsick needs WebGL 2. Enable hardware acceleration or open it in a current desktop browser.");
    const scene = new Scene(engine);
    scene.clearColor = Color4.FromHexString("#badce8ff");
    scene.ambientColor = new Color3(0.28, 0.28, 0.25);
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogStart = 155;
    scene.fogEnd = 395;
    scene.fogColor = Color3.FromHexString("#badce8");
    const fill = new HemisphericLight("blue sky fill", new Vector3(0.2, 1, -0.1), scene);
    fill.intensity = 0.65;
    fill.diffuse = Color3.FromHexString("#e4f2f4");
    fill.groundColor = Color3.FromHexString("#839074");
    const light = new DirectionalLight("late morning sun", new Vector3(-0.55, -1, 0.35), scene);
    light.position.set(50, 90, -80);
    light.diffuse = Color3.FromHexString("#f9eacd");
    light.intensity = 0.83;
    light.shadowMinZ = 1;
    light.shadowMaxZ = 210;
    light.shadowFrustumSize = 110;
    const camera = makeCamera(scene, "kart chase camera");
    const art = new Atelier(scene);
    const bundle = buildWorld(scene, "butterbell");
    const shadows = new ShadowGenerator(1024, light);
    shadows.usePercentageCloserFiltering = true;
    shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
    shadows.bias = 0.0012;
    shadows.normalBias = 0.018;
    shadows.darkness = 0.55;
    for (const mesh of bundle.world.casters) shadows.addShadowCaster(mesh);
    const pipeline = new DefaultRenderingPipeline("clear afternoon", false, scene, [camera]);
    pipeline.fxaaEnabled = true;
    pipeline.bloomEnabled = false;
    pipeline.samples = 1;
    const current: { courseId: CourseId } = { courseId: "butterbell" };
    const stage = {
      ...current, engine, scene, camera, art, world: bundle.world, worldRoot: bundle.root,
      releaseWorld: bundle.dispose, fill, light, shadows, pipeline,
    };
    applyStageQuality(stage, settings);
    return stage;
  } catch (error) {
    engine.dispose();
    throw error;
  }
}
export type RenderStage = ReturnType<typeof createStage>;

function applyEnvironment(stage: RenderStage, world: CourseWorld): void {
  const environment = world.environment ?? MORNING;
  stage.scene.clearColor = Color4.FromHexString(`${environment.sky}ff`);
  stage.scene.fogColor = Color3.FromHexString(environment.sky);
  stage.scene.fogStart = environment.fogStart;
  stage.scene.fogEnd = environment.fogEnd;
  stage.light.diffuse = Color3.FromHexString(environment.sun);
  stage.light.intensity = environment.sunIntensity;
  stage.fill.diffuse = Color3.FromHexString(environment.fill);
  stage.fill.intensity = environment.fillIntensity;
  stage.fill.groundColor = Color3.FromHexString(environment.ground);
}

export function loadStageCourse(stage: RenderStage, id: CourseId): boolean {
  if (id === stage.courseId) return false;
  const next = buildWorld(stage.scene, id);
  for (const mesh of stage.world.casters) stage.shadows.removeShadowCaster(mesh);
  stage.releaseWorld();
  stage.world = next.world;
  stage.worldRoot = next.root;
  stage.releaseWorld = next.dispose;
  stage.courseId = id;
  for (const mesh of next.world.casters) stage.shadows.addShadowCaster(mesh);
  applyEnvironment(stage, next.world);
  return true;
}

export function applyStageQuality(stage: Pick<RenderStage, "engine" | "scene" | "pipeline">, settings: Settings, views = 1): void {
  const density = Math.min(window.devicePixelRatio || 1, settings.quality === "high" ? 1.5 : 1);
  const scale = settings.quality === "low" ? 1.5 : settings.quality === "high" ? 1 : 1.1;
  const splitScale = views >= 3 ? 1.35 : views === 2 ? 1.15 : 1;
  stage.engine.setHardwareScalingLevel(scale * splitScale / density);
  stage.scene.shadowsEnabled = settings.quality !== "low" && views === 1;
  stage.pipeline.samples = settings.quality === "high" && views === 1 ? 2 : 1;
  stage.engine.resize();
}
