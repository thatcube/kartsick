import { getCourse } from "@kartsick/content";
import type { DriverInput, KartState } from "@kartsick/simulation";
import type { Settings } from "../storage";
import { makeKart } from "./kart";
import { makeTowbell } from "./rescue";
import { DrivingFeedback } from "./feedback";
import { ChaseCamera, updateKartPose } from "./driving-pose";
import { applyStageQuality, createStage, focusSun } from "./stage";
import { makeContactShadow, makeContactShadowMaterial, updateContactShadow } from "./contact-shadow";

export class StudyScene {
  private readonly course = getCourse("butterbell");
  private readonly stage;
  readonly engine;
  readonly scene;
  readonly camera;
  private readonly kart;
  private readonly rescue;
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
      this.rescue = makeTowbell(this.stage.art);
      for (const mesh of this.kart.meshes) {
        this.stage.shadows.addShadowCaster(mesh);
        mesh.receiveShadows = true;
      }
      this.contact = makeContactShadow(this.scene, makeContactShadowMaterial(this.scene));
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
    updateContactShadow(this.contact, this.course, this.kart.root);
    this.contact.setEnabled(state.mode === "ground" && state.recovery === 0);
    this.rescue.root.setEnabled(state.recovery > 0);
    this.rescue.root.position.copyFrom(position);
    this.rescue.root.rotation.y = this.kart.root.rotation.y;
    this.rescue.rotor.rotation.y = settings.reducedMotion ? .45 : state.tick * .7;
    this.stage.world.animate(menu ? this.time : state.tick / 60, settings.reducedMotion);
    this.feedback.update(state, position, this.kart.root.rotation.y, moving && state.recovery === 0, settings.reducedMotion);
    this.chase.update(position, this.kart.root.rotation.y, state, bounded, menu, this.time, settings);
    focusSun(this.stage, position);
    this.scene.render();
  }

  dispose(): void {
    this.feedback.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
