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
import { angleDifference, lerp, sampleRoad } from "@kartsick/content";
import type { DriverInput, KartState } from "@kartsick/simulation";
import type { Settings } from "../storage";
import { Atelier } from "./geometry";
import { makeKart } from "./kart";
import { makeWorld } from "./world";

export class StudyScene {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: FreeCamera;
  private readonly light: DirectionalLight;
  private readonly shadows: ShadowGenerator;
  private readonly pipeline: DefaultRenderingPipeline;
  private readonly kart;
  private readonly world;
  private readonly contact;
  private look = new Vector3();
  private cameraStarted = false;
  private time = 0;
  private shake = 0;

  constructor(canvas: HTMLCanvasElement, settings: Settings) {
    this.engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false, powerPreference: "high-performance" });
    try {
      if (this.engine.webGLVersion < 2) {
        throw new Error("Kartsick needs WebGL 2. Enable hardware acceleration or open it in a current desktop browser.");
      }
      this.scene = new Scene(this.engine);
      this.scene.clearColor = Color4.FromHexString("#badce8ff");
      this.scene.ambientColor = new Color3(0.28, 0.28, 0.25);
      this.scene.fogMode = Scene.FOGMODE_LINEAR;
      this.scene.fogStart = 155;
      this.scene.fogEnd = 395;
      this.scene.fogColor = Color3.FromHexString("#badce8");
      const fill = new HemisphericLight("blue sky fill", new Vector3(0.2, 1, -0.1), this.scene);
      fill.intensity = 0.65;
      fill.diffuse = Color3.FromHexString("#e4f2f4");
      fill.groundColor = Color3.FromHexString("#839074");
      this.light = new DirectionalLight("late morning sun", new Vector3(-0.55, -1, 0.35), this.scene);
      this.light.position.set(50, 90, -80);
      this.light.diffuse = Color3.FromHexString("#f9eacd");
      this.light.intensity = 0.83;
      this.light.shadowMinZ = 1;
      this.light.shadowMaxZ = 210;
      this.light.shadowFrustumSize = 110;
      this.camera = new FreeCamera("kart chase camera", new Vector3(0, 6, -120), this.scene);
      this.camera.minZ = 0.15;
      this.camera.maxZ = 600;
      this.camera.fov = 0.89;
      this.camera.inputs.clear();
      const art = new Atelier(this.scene);
      this.world = makeWorld(art);
      this.kart = makeKart(art);
      this.shadows = new ShadowGenerator(1024, this.light);
      this.shadows.usePercentageCloserFiltering = true;
      this.shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
      this.shadows.bias = 0.0012;
      this.shadows.normalBias = 0.018;
      this.shadows.darkness = 0.55;
      for (const mesh of [...this.world.casters, ...this.kart.meshes]) this.shadows.addShadowCaster(mesh);
      for (const mesh of this.kart.meshes) mesh.receiveShadows = true;
      this.pipeline = new DefaultRenderingPipeline("clear afternoon", false, this.scene, [this.camera]);
      this.pipeline.fxaaEnabled = true;
      this.pipeline.bloomEnabled = false;
      this.pipeline.samples = 1;
      this.contact = art.oval("soft kart contact", [0, 0, 0], [2.3, 0.008, 3.2], "#3a5545");
      const contactMaterial = art.material("#3a5545");
      contactMaterial.alpha = 0.14;
      contactMaterial.disableLighting = true;
      contactMaterial.emissiveColor = Color3.FromHexString("#3a5545");
      this.contact.material = contactMaterial;
      this.applySettings(settings);
    } catch (error) {
      this.engine.dispose();
      throw error;
    }
  }

  applySettings(settings: Settings): void {
    const density = Math.min(window.devicePixelRatio || 1, settings.quality === "high" ? 1.5 : 1);
    const scale = settings.quality === "low" ? 1.5 : settings.quality === "high" ? 1 : 1.1;
    this.engine.setHardwareScalingLevel(scale / density);
    this.scene.shadowsEnabled = settings.quality !== "low";
    this.pipeline.samples = settings.quality === "high" ? 2 : 1;
    this.engine.resize();
  }

  bump(): void {
    this.shake = 1;
  }

  render(previous: KartState, state: KartState, input: DriverInput, alpha: number, dt: number, menu: boolean, settings: Settings): void {
    const boundedDt = Math.min(dt, 0.05);
    this.time += boundedDt;
    const x = lerp(previous.x, state.x, alpha);
    const y = lerp(previous.y, state.y, alpha);
    const z = lerp(previous.z, state.z, alpha);
    const yaw = previous.yaw + angleDifference(state.yaw, previous.yaw) * alpha;
    const pitchStart = sampleRoad(state.roadU - 0.006);
    const pitchEnd = sampleRoad(state.roadU + 0.006);
    const slope = Math.atan2(pitchEnd.y - pitchStart.y, Math.hypot(pitchEnd.x - pitchStart.x, pitchEnd.z - pitchStart.z));
    this.kart.root.position.set(x, y, z);
    this.kart.root.rotation.set(state.mode === "glider" ? -input.pitch * 0.13 : -slope, yaw, settings.reducedMotion ? 0 : -input.steer * Math.min(Math.abs(state.speed) / 500, 0.07));
    this.kart.root.setEnabled(state.recovery < 0.55 || Math.floor(state.tick / 4) % 2 === 0);
    this.kart.animate(state, input, boundedDt, settings.reducedMotion);
    const road = sampleRoad(state.roadU);
    this.contact.position.set(x, road.y + 0.07, z);
    this.contact.rotation.y = yaw;
    this.contact.setEnabled(state.mode === "ground");
    this.world.animate(settings.reducedMotion ? 0 : this.time);
    const followYaw = menu ? yaw + 2.45 + (settings.reducedMotion ? 0 : Math.sin(this.time * 0.13) * 0.12) : yaw - state.driftDirection * 0.12;
    const fx = Math.sin(followYaw);
    const fz = Math.cos(followYaw);
    const distance = menu ? 8.4 : 8.6 + Math.abs(state.speed) * 0.022;
    const cameraTarget = new Vector3(x - fx * distance, y + (menu ? 3.9 : 4.35), z - fz * distance);
    const lookTarget = new Vector3(x + fx * (menu ? 0.4 : 3.8), y + 1.25, z + fz * (menu ? 0.4 : 3.8));
    if (settings.shake && !settings.reducedMotion) {
      cameraTarget.x += Math.sin(this.time * 71) * this.shake * 0.08;
      cameraTarget.y += Math.cos(this.time * 57) * this.shake * 0.055;
    }
    this.shake = Math.max(0, this.shake - boundedDt * 4);
    if (menu) {
      cameraTarget.x -= fz * 1.5;
      cameraTarget.z += fx * 1.5;
    }
    const smooth = this.cameraStarted ? 1 - Math.exp(-boundedDt * 6.5) : 1;
    Vector3.LerpToRef(this.camera.position, cameraTarget, smooth, this.camera.position);
    Vector3.LerpToRef(this.look, lookTarget, smooth, this.look);
    this.camera.setTarget(this.look);
    this.camera.fov = lerp(this.camera.fov, 0.89 + (settings.reducedMotion ? 0 : Math.abs(state.speed) * 0.001), smooth);
    this.cameraStarted = true;
    this.light.position.set(x + 47, y + 83, z - 30);
    this.scene.render();
  }

  dispose(): void {
    this.scene.dispose();
    this.engine.dispose();
  }
}
