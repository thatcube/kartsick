import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { angleDifference, clamp, lerp, surfaceHeight } from "@kartsick/content";
import type { DriverInput, KartState } from "@kartsick/simulation";
import { rescuePose } from "@kartsick/simulation";
import type { Settings } from "../storage";
import type { KartModel, KartVisualEffects } from "./kart";

export type SurfaceQuery = (x: number, z: number) => number;

export function updateKartPose(model: KartModel, previous: KartState, state: KartState, input: DriverInput, alpha: number, dt: number,
  moving: boolean, settings: Settings, surface: SurfaceQuery = surfaceHeight, started = true, effects?: KartVisualEffects): void {
  const recovering = state.rescue !== null && state.recovery > 0;
  const before = rescuePose(previous), after = rescuePose(state);
  const x = lerp(before.x, after.x, alpha);
  const y = lerp(before.y, after.y, alpha);
  const z = lerp(before.z, after.z, alpha);
  const yaw = before.yaw + angleDifference(after.yaw, before.yaw) * alpha;
  const front = surface(x + Math.sin(yaw) * 0.8, z + Math.cos(yaw) * 0.8);
  const rear = surface(x - Math.sin(yaw) * 0.8, z - Math.cos(yaw) * 0.8);
  const slope = Math.atan2(front - rear, 1.6);
  const pitch = recovering ? 0 : state.mode === "ground" ? -slope : -Math.atan2(state.vy, Math.max(1, Math.abs(state.speed))) * 0.4 - input.pitch * 0.1;
  model.root.position.set(x, y, z);
  model.root.rotation.set(
    lerp(model.root.rotation.x, pitch, started ? 1 - Math.exp(-dt * 12) : 1),
    yaw, settings.reducedMotion ? 0 : input.steer * Math.min(Math.abs(state.speed) / 500, 0.07),
  );
  model.root.setEnabled(true);
  model.animate(state, input, moving ? dt : 0, settings.reducedMotion, effects);
}

export class ChaseCamera {
  private look = new Vector3();
  private anchor = new Vector3();
  private yaw = 0;
  private shake = 0;
  started = false;

  constructor(readonly camera: FreeCamera) {}

  bump(): void { this.shake = 1; }

  update(position: Vector3, renderedYaw: number, state: KartState, dt: number, menu: boolean, time: number, settings: Settings, surface: SurfaceQuery = surfaceHeight): void {
    const { x, y, z } = position;
    const velocityYaw = state.speed > 5 ? Math.atan2(state.vx, state.vz) : renderedYaw;
    const desiredYaw = menu ? renderedYaw + 2.45 + (settings.reducedMotion ? 0 : Math.sin(time * 0.13) * 0.12) :
      renderedYaw + clamp(angleDifference(velocityYaw, renderedYaw), -0.55, 0.55) * 0.42;
    const snap = !this.started || Vector3.DistanceSquared(this.anchor, position) > 35 ** 2;
    this.yaw += angleDifference(desiredYaw, this.yaw) * (snap ? 1 : 1 - Math.exp(-dt * 9));
    Vector3.LerpToRef(this.anchor, position, snap ? 1 : 1 - Math.exp(-dt * 28), this.anchor);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const distance = menu ? 8.4 : 7.6 + Math.abs(state.speed) * 0.015;
    const cameraTarget = new Vector3(this.anchor.x - fx * distance, this.anchor.y + (menu ? 3.9 : 3.65), this.anchor.z - fz * distance);
    cameraTarget.y = Math.max(cameraTarget.y, surface(cameraTarget.x, cameraTarget.z) + 1.25);
    const target = new Vector3(x + fx * (menu ? 0.4 : 6.4), y + (menu ? 1.25 : 1.42), z + fz * (menu ? 0.4 : 6.4));
    if (settings.shake && !settings.reducedMotion) {
      cameraTarget.x += Math.sin(time * 71) * this.shake * 0.08;
      cameraTarget.y += Math.cos(time * 57) * this.shake * 0.055;
    }
    this.shake = Math.max(0, this.shake - dt * 4);
    if (menu) {
      cameraTarget.x -= fz * 1.5;
      cameraTarget.z += fx * 1.5;
    }
    const smooth = snap ? 1 : 1 - Math.exp(-dt * 14);
    this.camera.position.copyFrom(cameraTarget);
    Vector3.LerpToRef(this.look, target, smooth, this.look);
    this.camera.setTarget(this.look);
    this.camera.fov = lerp(this.camera.fov, 0.89 + (settings.reducedMotion || menu ? 0 : Math.abs(state.speed) * 0.002 + (state.boost > 0 ? 0.04 : 0)), smooth);
    this.started = true;
  }
}
