import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { CourseId, CourseQuery, KartBuild } from "@kartsick/content";
import type { DriverInput, ItemPickup, KartState, WorldEffect } from "@kartsick/simulation";
import type { Settings } from "../storage";
import type { HudView } from "../ui/game-hud";
import { DrivingFeedback } from "./feedback";
import { ChaseCamera, updateKartPose } from "./driving-pose";
import { makeItemVisual, makePickupBox } from "./items";
import { makeKart } from "./kart";
import type { KartModel, KartVisualEffects } from "./kart";
import { applyStageQuality, createStage, loadStageCourse, makeCamera } from "./stage";

export interface RacerFrame {
  id: string;
  previous: KartState;
  state: KartState;
  input: DriverInput;
  alpha: number;
  effects: KartVisualEffects;
  visible?: boolean;
}
export interface RenderEntry { id: string; build: KartBuild; ghost?: boolean }
interface RenderKart { key: string; model: KartModel; contact: Mesh; feedback: DrivingFeedback | null; started: boolean }
interface RenderEffect { key: string; root: TransformNode; warning: Mesh; pulse: boolean }

export class RaceScene {
  private readonly stage;
  readonly engine;
  readonly scene;
  private readonly karts = new Map<string, RenderKart>();
  private readonly effects = new Map<string, RenderEffect>();
  private readonly pickups = new Map<string, { root: TransformNode; double: boolean }>();
  private readonly contactMaterial: StandardMaterial;
  private readonly warningMaterial: StandardMaterial;
  private readonly blastMaterial: StandardMaterial;
  private labels: Mesh[];
  private readonly faded = new Map<Mesh, number>();
  private rigs: { id: string; chase: ChaseCamera }[] = [];
  private time = 0;
  private mirror = false;
  private settings: Settings;

  constructor(canvas: HTMLCanvasElement, settings: Settings) {
    this.settings = settings;
    this.stage = createStage(canvas, settings);
    this.engine = this.stage.engine;
    this.scene = this.stage.scene;
    this.contactMaterial = new StandardMaterial("shared kart contact", this.scene);
    this.contactMaterial.alpha = 0.18;
    this.contactMaterial.disableLighting = true;
    this.contactMaterial.emissiveColor = Color3.FromHexString("#3a5545");
    this.warningMaterial = new StandardMaterial("item warning footprint", this.scene);
    this.warningMaterial.emissiveColor = Color3.FromHexString("#ffd46b");
    this.warningMaterial.disableLighting = true;
    this.warningMaterial.alpha = 0.8;
    this.blastMaterial = new StandardMaterial("item impact ring", this.scene);
    this.blastMaterial.emissiveColor = Color3.FromHexString("#ef927f");
    this.blastMaterial.disableLighting = true;
    this.blastMaterial.alpha = 0.7;
    this.labels = this.stage.worldRoot.getChildMeshes().filter((mesh): mesh is Mesh =>
      mesh instanceof Mesh && mesh.getTotalVertices() === 4 && mesh.material instanceof StandardMaterial &&
      mesh.material.diffuseTexture instanceof DynamicTexture);
    this.scene.onBeforeCameraRenderObservable.add(camera => {
      const rig = this.rigs.find(rig => rig.chase.camera === camera);
      const own = rig && this.karts.get(rig.id);
      if (!own) return;
      const position = camera.globalPosition;
      const target = own.model.root.position;
      const dx = target.x - position.x;
      const dz = target.z - position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.1) return;
      for (const [id, kart] of this.karts) {
        if (id === rig.id || !kart.model.root.isEnabled()) continue;
        const x = kart.model.root.position.x - position.x;
        const z = kart.model.root.position.z - position.z;
        const along = (x * dx + z * dz) / distance;
        const across = Math.abs(x * dz - z * dx) / distance;
        // Fade a following kart only in the camera it obstructs, not in another player's view.
        if (along < -2 || along >= distance - 0.8 || across >= 2.6) continue;
        for (const mesh of kart.model.meshes) {
          this.faded.set(mesh, mesh.visibility);
          mesh.visibility *= 0.16;
        }
      }
    });
    this.scene.onAfterCameraRenderObservable.add(() => {
      for (const [mesh, visibility] of this.faded) mesh.visibility = visibility;
      this.faded.clear();
    });
  }

  setRoster(entries: readonly RenderEntry[]): void {
    if (entries.length > 9 || new Set(entries.map(entry => entry.id)).size !== entries.length) throw new RangeError("Invalid visual race roster.");
    const ids = new Set(entries.map(entry => entry.id));
    for (const [id, kart] of this.karts) {
      if (ids.has(id)) continue;
      this.removeKart(kart);
      this.karts.delete(id);
    }
    for (const entry of entries) {
      const key = JSON.stringify([entry.build, !!entry.ghost]);
      const old = this.karts.get(entry.id);
      if (old?.key === key) continue;
      if (old) this.removeKart(old);
      const model = makeKart(this.stage.art, entry.build);
      for (const mesh of model.meshes) {
        if (!entry.ghost) this.stage.shadows.addShadowCaster(mesh);
        mesh.receiveShadows = true;
      }
      const contact = MeshBuilder.CreateDisc(`contact ${entry.id}`, { radius: 1, tessellation: 24 }, this.scene);
      contact.rotation.x = Math.PI / 2;
      contact.material = this.contactMaterial;
      contact.isPickable = false;
      this.karts.set(entry.id, { key, model, contact, feedback: entry.ghost ? null : new DrivingFeedback(this.scene), started: false });
    }
  }

  private removeKart(kart: RenderKart): void {
    for (const mesh of kart.model.meshes) this.stage.shadows.removeShadowCaster(mesh);
    kart.feedback?.dispose();
    kart.contact.dispose();
    kart.model.root.dispose();
  }

  setViews(views: readonly HudView[]): void {
    if (views.length < 1 || views.length > 4) throw new RangeError("One to four kart cameras are supported.");
    const countChanged = views.length !== this.rigs.length;
    while (this.rigs.length > views.length) {
      const removed = this.rigs.pop()!;
      this.stage.pipeline.removeCamera(removed.chase.camera);
      if (removed.chase.camera !== this.stage.camera) removed.chase.camera.dispose();
    }
    views.forEach((view, index) => {
      let rig = this.rigs[index];
      if (!rig) {
        const camera = index === 0 ? this.stage.camera : makeCamera(this.scene, `local view ${index + 1}`);
        if (index !== 0) this.stage.pipeline.addCamera(camera);
        rig = { id: view.id, chase: new ChaseCamera(camera) };
        this.rigs.push(rig);
      }
      if (rig.id !== view.id) {
        rig.id = view.id;
        rig.chase.started = false;
      }
      const rect = view.viewport;
      rig.chase.camera.viewport = new Viewport(rect.x, rect.y, rect.width, rect.height);
    });
    this.scene.activeCameras = this.rigs.map(rig => rig.chase.camera);
    if (countChanged) this.applySettings(this.settings);
  }

  applySettings(settings: Settings): void {
    this.settings = settings;
    applyStageQuality(this.stage, settings, Math.max(1, this.rigs.length));
  }

  loadCourse(id: CourseId): void {
    if (id === this.stage.courseId) return;
    this.setMirror(false);
    loadStageCourse(this.stage, id);
    this.labels = this.stage.worldRoot.getChildMeshes().filter((mesh): mesh is Mesh =>
      mesh instanceof Mesh && mesh.getTotalVertices() === 4 && mesh.material instanceof StandardMaterial &&
      mesh.material.diffuseTexture instanceof DynamicTexture);
    for (const rig of this.rigs) rig.chase.started = false;
  }

  bump(id: string): void { for (const rig of this.rigs) if (rig.id === id) rig.chase.bump(); }

  private setMirror(mirror: boolean): void {
    if (mirror === this.mirror) return;
    this.mirror = mirror;
    for (const mesh of this.stage.worldRoot.getChildMeshes()) mesh.unfreezeWorldMatrix();
    this.stage.worldRoot.scaling.x = mirror ? -1 : 1;
    for (const label of this.labels) label.scaling.x *= -1;
    this.stage.light.direction.x *= -1;
    for (const rig of this.rigs) rig.chase.started = false;
  }

  private drawPickups(pickups: readonly ItemPickup[], reducedMotion: boolean): void {
    const live = new Set(pickups.map(pickup => pickup.id));
    for (const [id, model] of this.pickups) if (!live.has(id)) { model.root.dispose(); this.pickups.delete(id); }
    pickups.forEach((pickup, index) => {
      let model = this.pickups.get(pickup.id);
      if (model && model.double !== pickup.double) { model.root.dispose(); this.pickups.delete(pickup.id); model = undefined; }
      if (!model) {
        const root = new TransformNode(`pickup ${pickup.id}`, this.scene);
        const first = makePickupBox(this.stage.art);
        first.parent = root;
        if (pickup.double) {
          const second = makePickupBox(this.stage.art);
          second.parent = root;
          first.position.x = -0.46;
          second.position.x = 0.46;
          first.scaling.setAll(0.7);
          second.scaling.setAll(0.7);
        }
        model = { root, double: pickup.double };
        this.pickups.set(pickup.id, model);
      }
      model.root.position.set(pickup.x, pickup.y + (reducedMotion ? 0 : Math.sin(this.time * 2 + index) * 0.12), pickup.z);
      model.root.rotation.y = reducedMotion ? 0.35 : this.time * 0.7 + index;
      model.root.setEnabled(pickup.cooldown <= 0);
    });
  }

  private drawEffects(effects: readonly WorldEffect[], course: CourseQuery, reducedMotion: boolean): void {
    const live = new Set(effects.map(effect => effect.id));
    for (const [id, model] of this.effects) if (!live.has(id)) { model.root.dispose(); this.effects.delete(id); }
    for (const effect of effects) {
      const key = `${effect.item}:${effect.kind}`;
      let model = this.effects.get(effect.id);
      if (model && model.key !== key) { model.root.dispose(); this.effects.delete(effect.id); model = undefined; }
      if (!model) {
        const pulse = effect.kind === "blast" || effect.kind === "pulse" || effect.kind === "weather" || effect.kind === "theft";
        const root = new TransformNode(`effect ${effect.id}`, this.scene);
        if (pulse) {
          const ring = MeshBuilder.CreateTorus(`impact ${effect.id}`, { diameter: 2, thickness: 0.12, tessellation: 32 }, this.scene);
          ring.parent = root;
          ring.material = this.blastMaterial;
        } else {
          const item = makeItemVisual(this.stage.art, effect.item);
          item.parent = root;
        }
        const warning = MeshBuilder.CreateTorus(`warning ${effect.id}`, { diameter: 2, thickness: 0.055, tessellation: 32 }, this.scene);
        warning.parent = root;
        warning.material = this.warningMaterial;
        model = { key, root, warning, pulse };
        this.effects.set(effect.id, model);
      }
      model.root.position.set(effect.x, effect.y, effect.z);
      const direction = course.sampleRoad(effect.u);
      model.root.rotation.y = Math.hypot(effect.vx, effect.vz) > 0.1 ? Math.atan2(effect.vx, effect.vz) : Math.atan2(direction.dx, direction.dz);
      if (effect.kind === "dropped" && !reducedMotion) model.root.rotation.y = this.time;
      model.root.scaling.set(model.pulse ? effect.radius : 1, 1, model.pulse ? effect.radius : 1);
      model.warning.scaling.set(model.pulse ? 1 : effect.radius, 1, model.pulse ? 1 : effect.radius);
      model.warning.position.y = course.surfaceHeight(effect.x, effect.z) + 0.055 - effect.y;
      model.warning.setEnabled(effect.arm > 0 || effect.kind === "bomb" || effect.kind === "barrier");
    }
  }

  render(frames: readonly RacerFrame[], course: CourseQuery, pickups: readonly ItemPickup[], effects: readonly WorldEffect[], dt: number, menu: boolean, moving: boolean, raceTime: number): void {
    const bounded = Math.min(0.05, Math.max(0, dt));
    this.time += bounded;
    this.setMirror(course.mirror);
    for (const frame of frames) {
      const kart = this.karts.get(frame.id);
      if (!kart) throw new Error(`Missing visual kart ${frame.id}.`);
      if (frame.visible === false) { kart.model.root.setEnabled(false); kart.contact.setEnabled(false); continue; }
      updateKartPose(kart.model, frame.previous, frame.state, frame.input, frame.alpha, bounded, moving, this.settings, course.surfaceHeight, kart.started, frame.effects);
      const position = kart.model.root.position;
      kart.contact.position.set(position.x, course.surfaceHeight(position.x, position.z) + 0.02, position.z);
      kart.contact.rotation.y = kart.model.root.rotation.y;
      kart.contact.scaling.set(1.15 * kart.model.root.scaling.x, 1.6 * kart.model.root.scaling.z, 1);
      kart.contact.setEnabled(frame.state.mode === "ground" && !frame.effects.ghost);
      kart.feedback?.update(frame.state, position, kart.model.root.rotation.y, moving && !frame.effects.ghost, this.settings.reducedMotion);
      kart.started = true;
    }
    for (const rig of this.rigs) {
      const frame = frames.find(frame => frame.id === rig.id);
      const kart = this.karts.get(rig.id);
      if (!frame || !kart) throw new Error(`The camera has no matching kart ${rig.id}.`);
      rig.chase.update(kart.model.root.position, kart.model.root.rotation.y, frame.state, bounded, menu, this.time, this.settings, course.surfaceHeight);
    }
    const focus = this.rigs[0] && this.karts.get(this.rigs[0].id);
    if (focus) {
      const position = focus.model.root.position;
      this.stage.light.position.set(position.x + (course.mirror ? -47 : 47), position.y + 83, position.z - 30);
    }
    this.stage.world.animate(menu ? this.time : raceTime, this.settings.reducedMotion);
    this.drawPickups(pickups, this.settings.reducedMotion);
    this.drawEffects(effects, course, this.settings.reducedMotion);
    this.scene.render();
  }

  dispose(): void {
    for (const kart of this.karts.values()) kart.feedback?.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
