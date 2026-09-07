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
import { angleDifference, clamp, lerp, surfaceHeight } from "@kartsick/content";
import type { DriverInput, KartState } from "@kartsick/simulation";
import type { Settings } from "../storage";
import { Atelier } from "./geometry";
import { makeKart } from "./kart";
import { makeWorld } from "./world";
import { DrivingFeedback } from "./feedback";

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
  private readonly feedback: DrivingFeedback;
  private look = new Vector3();
  private anchor = new Vector3();
  private followYaw = 0;
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
      this.feedback = new DrivingFeedback(this.scene);
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

  get feedbackStats(): { particles: number; marks: number } {
    return this.feedback.stats;
  }

  render(previous: KartState, state: KartState, input: DriverInput, alpha: number, dt: number, menu: boolean, moving: boolean, settings: Settings): void {
    const boundedDt = Math.min(dt, 0.05);
    this.time += boundedDt;
    const x = lerp(previous.x, state.x, alpha);
    const y = lerp(previous.y, state.y, alpha);
    const z = lerp(previous.z, state.z, alpha);
    const yaw = previous.yaw + angleDifference(state.yaw, previous.yaw) * alpha;
    const frontHeight = surfaceHeight(x + Math.sin(yaw) * 0.8, z + Math.cos(yaw) * 0.8);
    const backHeight = surfaceHeight(x - Math.sin(yaw) * 0.8, z - Math.cos(yaw) * 0.8);
    const slope = Math.atan2(frontHeight - backHeight, 1.6);
    const bodyPitch = state.mode === "ground" ? -slope : -Math.atan2(state.vy, Math.max(1, Math.abs(state.speed))) * 0.4 - input.pitch * 0.1;
    this.kart.root.position.set(x, y, z);
    this.kart.root.rotation.set(
      lerp(this.kart.root.rotation.x, bodyPitch, this.cameraStarted ? 1 - Math.exp(-boundedDt * 12) : 1),
      yaw, settings.reducedMotion ? 0 : input.steer * Math.min(Math.abs(state.speed) / 500, 0.07),
    );
    this.kart.root.setEnabled(state.recovery < 0.55 || Math.floor(state.tick / 4) % 2 === 0);
    this.kart.animate(state, input, moving ? boundedDt : 0, settings.reducedMotion);
    this.contact.position.set(x, y - 0.35, z);
    this.contact.rotation.y = yaw;
    this.contact.setEnabled(state.mode === "ground");
    this.world.animate(settings.reducedMotion ? 0 : this.time);
    this.feedback.update(state, this.kart.root.position, yaw, moving, settings.reducedMotion);
    const velocityYaw = state.speed > 5 ? Math.atan2(state.vx, state.vz) : yaw;
    const desiredYaw = menu ? yaw + 2.45 + (settings.reducedMotion ? 0 : Math.sin(this.time * 0.13) * 0.12) :
      yaw + clamp(angleDifference(velocityYaw, yaw), -0.55, 0.55) * 0.42;
    const snap = !this.cameraStarted || Vector3.DistanceSquared(this.anchor, this.kart.root.position) > 35 ** 2;
    this.followYaw += angleDifference(desiredYaw, this.followYaw) * (snap ? 1 : 1 - Math.exp(-boundedDt * 9));
    // Translation follows quickly; smoothing the whole camera adds meters of lag at speed.
    Vector3.LerpToRef(this.anchor, this.kart.root.position, snap ? 1 : 1 - Math.exp(-boundedDt * 28), this.anchor);
    const fx = Math.sin(this.followYaw);
    const fz = Math.cos(this.followYaw);
    const distance = menu ? 8.4 : 7.6 + Math.abs(state.speed) * 0.015;
    const cameraTarget = new Vector3(this.anchor.x - fx * distance, this.anchor.y + (menu ? 3.9 : 3.65), this.anchor.z - fz * distance);
    cameraTarget.y = Math.max(cameraTarget.y, surfaceHeight(cameraTarget.x, cameraTarget.z) + 1.25);
    const lookTarget = new Vector3(x + fx * (menu ? 0.4 : 6.4), y + (menu ? 1.25 : 1.42), z + fz * (menu ? 0.4 : 6.4));
    if (settings.shake && !settings.reducedMotion) {
      cameraTarget.x += Math.sin(this.time * 71) * this.shake * 0.08;
      cameraTarget.y += Math.cos(this.time * 57) * this.shake * 0.055;
    }
    this.shake = Math.max(0, this.shake - boundedDt * 4);
    if (menu) {
      cameraTarget.x -= fz * 1.5;
      cameraTarget.z += fx * 1.5;
    }
    const smooth = snap ? 1 : 1 - Math.exp(-boundedDt * 14);
    this.camera.position.copyFrom(cameraTarget);
    Vector3.LerpToRef(this.look, lookTarget, smooth, this.look);
    this.camera.setTarget(this.look);
    this.camera.fov = lerp(this.camera.fov, 0.89 + (settings.reducedMotion || menu ? 0 : Math.abs(state.speed) * 0.002 + (state.boost > 0 ? 0.04 : 0)), smooth);
    this.cameraStarted = true;
    this.light.position.set(x + 47, y + 83, z - 30);
    this.scene.render();
  }

  dispose(): void {
    this.feedback.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
