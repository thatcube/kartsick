import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { DriverInput, KartState } from "@kartsick/simulation";
import type { Settings } from "../storage";
import { makeKart } from "./kart";
import { DrivingFeedback } from "./feedback";
import { ChaseCamera, updateKartPose } from "./driving-pose";
import { applyStageQuality, createStage } from "./stage";

export class StudyScene {
  private readonly stage;
  readonly engine;
  readonly scene;
  readonly camera;
  private readonly kart;
  private readonly contact;
  private readonly feedback: DrivingFeedback;
  private readonly chase: ChaseCamera;
  private time = 0;

  constructor(canvas: HTMLCanvasElement, settings: Settings) {
    this.stage = createStage(canvas, settings);
    this.engine = this.stage.engine;
    this.scene = this.stage.scene;
    this.camera = this.stage.camera;
    try {
      this.kart = makeKart(this.stage.art);
      for (const mesh of this.kart.meshes) {
        this.stage.shadows.addShadowCaster(mesh);
        mesh.receiveShadows = true;
      }
      this.contact = this.stage.art.oval("soft kart contact", [0, 0, 0], [2.3, 0.008, 3.2], "#3a5545");
      const material = this.stage.art.material("#3a5545");
      material.alpha = 0.14;
      material.disableLighting = true;
      material.emissiveColor = Color3.FromHexString("#3a5545");
      this.contact.material = material;
      this.feedback = new DrivingFeedback(this.scene);
      this.chase = new ChaseCamera(this.camera);
    } catch (error) {
      this.engine.dispose();
      throw error;
    }
  }

  applySettings(settings: Settings): void { applyStageQuality(this.stage, settings); }
  bump(): void { this.chase.bump(); }
  get feedbackStats(): { particles: number; marks: number } { return this.feedback.stats; }

  render(previous: KartState, state: KartState, input: DriverInput, alpha: number, dt: number, menu: boolean, moving: boolean, settings: Settings): void {
    const bounded = Math.min(dt, 0.05);
    this.time += bounded;
    updateKartPose(this.kart, previous, state, input, alpha, bounded, moving, settings, undefined, this.chase.started);
    const position = this.kart.root.position;
    this.contact.position.set(position.x, position.y - 0.35, position.z);
    this.contact.rotation.y = this.kart.root.rotation.y;
    this.contact.setEnabled(state.mode === "ground");
    this.stage.world.animate(settings.reducedMotion ? 0 : this.time);
    this.feedback.update(state, position, this.kart.root.rotation.y, moving, settings.reducedMotion);
    this.chase.update(position, this.kart.root.rotation.y, state, bounded, menu, this.time, settings);
    this.stage.light.position.set(position.x + 47, position.y + 83, position.z - 30);
    this.scene.render();
  }

  dispose(): void {
    this.feedback.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
