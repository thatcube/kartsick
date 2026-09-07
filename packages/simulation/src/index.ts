import {
  CHECKPOINTS, GAP_START, ROAD_WIDTH, STUDY, angleDifference, clamp, hasRail,
  isGap, isWater, lerp, projectRoad, sampleRoad, terrainHeight, wrap,
} from "@kartsick/content";
import type { RoadProjection } from "@kartsick/content";

export const STEP = 1 / 60;
export const TUNING = {
  topSpeed: 28, boostSpeed: 37, acceleration: 12, braking: 23,
  roadGrip: 7.8, driftGrip: 2.1, driftMinimum: 8,
  miniTurboDuration: 0.72, glideLaunch: 4.2,
} as const;

export interface DriverInput {
  throttle: number;
  brake: number;
  steer: number;
  pitch: number;
  drift: boolean;
  recover: boolean;
  swap: boolean;
}

export const NEUTRAL: Readonly<DriverInput> = Object.freeze({
  throttle: 0, brake: 0, steer: 0, pitch: 0, drift: false, recover: false, swap: false,
});

export interface KartState {
  tick: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  vy: number;
  speed: number;
  mode: "ground" | "air" | "glider";
  driftDirection: number;
  driftCharge: number;
  counterArmed: boolean;
  counterCooldown: number;
  boost: number;
  recovery: number;
  previousRecover: boolean;
  previousSwap: boolean;
  driver: 0 | 1;
  swapTime: number;
  nextCheckpoint: number;
  lap: number;
  lapStart: number;
  elapsed: number;
  lapTimes: number[];
  finished: boolean;
  roadU: number;
  offRoad: boolean;
  wrongWay: boolean;
  recoveries: number;
}

export type DrivingEvent =
  | { type: "charge"; tier: number }
  | { type: "boost" | "launch" | "land" | "recover" | "swap" | "collision" }
  | { type: "lap"; time: number }
  | { type: "finish"; time: number };

export function createKart(): KartState {
  const start = sampleRoad(0.006);
  return {
    tick: 0, x: start.x, y: start.y + 0.42, z: start.z,
    yaw: Math.atan2(start.dx, start.dz), vx: 0, vz: 0, vy: 0, speed: 0,
    mode: "ground", driftDirection: 0, driftCharge: 0, counterArmed: true,
    counterCooldown: 0, boost: 0, recovery: 0, previousRecover: false,
    previousSwap: false, driver: 0, swapTime: 0, nextCheckpoint: 1,
    lap: 1, lapStart: 0, elapsed: 0, lapTimes: [], finished: false,
    roadU: start.u, offRoad: false, wrongWay: false, recoveries: 0,
  };
}

export function copyKart(state: KartState): KartState {
  return { ...state, lapTimes: [...state.lapTimes] };
}

function clearDrift(state: KartState): void {
  state.driftDirection = 0;
  state.driftCharge = 0;
  state.counterArmed = true;
}

export function recoverKart(state: KartState): void {
  const previousGate = wrap(state.nextCheckpoint - 1, CHECKPOINTS.length);
  const checkpoint = sampleRoad(previousGate / CHECKPOINTS.length + 0.004);
  // A failed flight must restart on the approach, not on a checkpoint over water.
  const recoveryPoint = isGap(checkpoint.u) ? sampleRoad(GAP_START - 0.075) : checkpoint;
  state.x = recoveryPoint.x;
  state.z = recoveryPoint.z;
  state.y = recoveryPoint.y + 0.42;
  state.yaw = Math.atan2(recoveryPoint.dx, recoveryPoint.dz);
  state.vx = state.vz = state.vy = state.speed = 0;
  state.mode = "ground";
  state.boost = 0;
  state.recovery = 0.65;
  state.recoveries++;
  state.roadU = recoveryPoint.u;
  clearDrift(state);
}

function updateProgress(state: KartState, oldX: number, oldZ: number, events: DrivingEvent[]): void {
  const gate = CHECKPOINTS[state.nextCheckpoint];
  const before = (oldX - gate.x) * gate.dx + (oldZ - gate.z) * gate.dz;
  const after = (state.x - gate.x) * gate.dx + (state.z - gate.z) * gate.dz;
  const crossing = after - before;
  if (before > 0 || after < 0 || crossing <= 0) return;
  const t = clamp(-before / crossing, 0, 1);
  const crossingX = lerp(oldX, state.x, t);
  const crossingZ = lerp(oldZ, state.z, t);
  const lateral = Math.abs((crossingX - gate.x) * gate.dz - (crossingZ - gate.z) * gate.dx);
  if (lateral > (isGap(gate.u) ? 21 : ROAD_WIDTH * 0.8)) return;
  state.nextCheckpoint = (state.nextCheckpoint + 1) % CHECKPOINTS.length;
  if (state.nextCheckpoint !== 1) return;
  const time = state.elapsed - state.lapStart;
  state.lapTimes.push(time);
  state.lapStart = state.elapsed;
  events.push({ type: "lap", time });
  if (state.lap === STUDY.laps) {
    state.finished = true;
    events.push({ type: "finish", time: state.elapsed });
  } else {
    state.lap++;
  }
}

function railCollision(state: KartState, road: RoadProjection, events: DrivingEvent[]): void {
  if (!hasRail(road.u) || road.separation < ROAD_WIDTH / 2 - 0.5 || road.separation > ROAD_WIDTH / 2 + 2.5) return;
  const side = Math.sign(road.lateral);
  const nx = road.dz * side;
  const nz = -road.dx * side;
  const outward = state.vx * nx + state.vz * nz;
  if (outward <= 0) return;
  state.x = road.x + nx * (ROAD_WIDTH / 2 - 0.6);
  state.z = road.z + nz * (ROAD_WIDTH / 2 - 0.6);
  state.vx = (state.vx - outward * nx * 1.25) * 0.78;
  state.vz = (state.vz - outward * nz * 1.25) * 0.78;
  clearDrift(state);
  events.push({ type: "collision" });
}

export function stepKart(state: KartState, input: DriverInput): DrivingEvent[] {
  const events: DrivingEvent[] = [];
  if (state.finished) return events;
  state.tick++;
  state.elapsed += STEP;
  state.boost = Math.max(0, state.boost - STEP);
  state.swapTime = Math.max(0, state.swapTime - STEP);
  state.counterCooldown = Math.max(0, state.counterCooldown - STEP);

  if (input.recover && !state.previousRecover) {
    recoverKart(state);
    events.push({ type: "recover" });
  }
  state.previousRecover = input.recover;
  if (input.swap && !state.previousSwap && state.swapTime === 0) {
    state.driver = state.driver === 0 ? 1 : 0;
    state.swapTime = 0.42;
    events.push({ type: "swap" });
  }
  state.previousSwap = input.swap;
  if (state.recovery > 0) {
    state.recovery = Math.max(0, state.recovery - STEP);
    return events;
  }

  const steer = clamp(input.steer, -1, 1);
  const throttle = clamp(input.throttle, 0, 1);
  const brake = clamp(input.brake, 0, 1);
  const roadBefore = projectRoad(state.x, state.z);
  const oldX = state.x;
  const oldZ = state.z;
  const onRoad = roadBefore.separation < ROAD_WIDTH / 2 + 0.6 && !isGap(roadBefore.u);

  if (state.mode === "ground") {
    const forwardX = Math.sin(state.yaw);
    const forwardZ = Math.cos(state.yaw);
    let longitudinal = state.vx * forwardX + state.vz * forwardZ;
    const previousLongitudinal = longitudinal;
    if (input.drift && !state.driftDirection && longitudinal > TUNING.driftMinimum && Math.abs(steer) > 0.16 && onRoad) {
      state.driftDirection = Math.sign(steer);
      state.counterArmed = true;
    }
    if (state.driftDirection && (!input.drift || longitudinal < TUNING.driftMinimum || !onRoad)) {
      if (!input.drift && state.driftCharge === 3 && onRoad) {
        state.boost = TUNING.miniTurboDuration;
        events.push({ type: "boost" });
      }
      clearDrift(state);
    }
    if (state.driftDirection) {
      const directional = steer * state.driftDirection;
      if (directional > 0.2) state.counterArmed = true;
      if (directional < -0.35 && state.counterArmed && state.counterCooldown === 0 && state.driftCharge < 3) {
        state.driftCharge++;
        state.counterArmed = false;
        state.counterCooldown = 0.12;
        events.push({ type: "charge", tier: state.driftCharge });
      }
    }

    const topSpeed = state.boost > 0 ? TUNING.boostSpeed : onRoad ? TUNING.topSpeed : 11;
    const push = state.boost > 0 ? 23 : throttle * TUNING.acceleration;
    longitudinal += (push - (brake * (longitudinal > 0.8 ? TUNING.braking : 7))) * STEP;
    longitudinal *= 1 - (throttle || state.boost > 0 ? 0.16 : 1.1) * STEP;
    if (longitudinal > topSpeed) longitudinal = Math.max(topSpeed, longitudinal - 20 * STEP);
    longitudinal = clamp(longitudinal, -6.5, TUNING.boostSpeed);
    if (Math.abs(longitudinal) < 0.06 && !throttle && !brake) longitudinal = 0;

    const turn = state.driftDirection
      ? state.driftDirection * 0.57 + steer * 0.63
      : steer * 1.22;
    state.yaw += turn * clamp(Math.abs(longitudinal) / 7, 0, 1) * Math.sign(longitudinal || 1) * STEP;
    const targetX = Math.sin(state.yaw) * longitudinal;
    const targetZ = Math.cos(state.yaw) * longitudinal;
    const grip = state.driftDirection ? TUNING.driftGrip : TUNING.roadGrip;
    state.vx += forwardX * (longitudinal - previousLongitudinal);
    state.vz += forwardZ * (longitudinal - previousLongitudinal);
    state.vx = lerp(state.vx, targetX, grip * STEP);
    state.vz = lerp(state.vz, targetZ, grip * STEP);
  } else {
    clearDrift(state);
    const horizontal = Math.hypot(state.vx, state.vz);
    const pitch = clamp(input.pitch, -1, 1);
    const airspeed = state.mode === "glider"
      ? clamp(horizontal + (-pitch * 4.5 - (horizontal - 26) * 0.3) * STEP, 9, 39)
      : horizontal * (1 - 0.12 * STEP);
    state.yaw += steer * (state.mode === "glider" ? 0.66 : 0.38) * STEP;
    state.vx = lerp(state.vx, Math.sin(state.yaw) * airspeed, 3 * STEP);
    state.vz = lerp(state.vz, Math.cos(state.yaw) * airspeed, 3 * STEP);
    if (state.mode === "glider" && airspeed > 12) {
      state.vy += (-4.6 + pitch * 3.1 - state.vy) * 1.7 * STEP;
    } else {
      state.vy -= 9.81 * STEP;
    }
    state.y += state.vy * STEP;
  }

  state.x += state.vx * STEP;
  state.z += state.vz * STEP;
  const road = projectRoad(state.x, state.z);
  state.offRoad = road.separation > ROAD_WIDTH / 2 + 0.6;
  const supported = !state.offRoad && !isGap(road.u);
  const surface = supported ? road.y : terrainHeight(state.x, state.z);
  if (state.mode === "ground") {
    const crossedLip = roadBefore.u < GAP_START && road.u >= GAP_START && road.u < GAP_START + 0.03;
    if (crossedLip && onRoad && Math.hypot(state.vx, state.vz) > 11) {
      state.mode = "glider";
      state.vy = TUNING.glideLaunch;
      clearDrift(state);
      events.push({ type: "launch" });
    } else if (state.y - surface > 1.6 || isGap(road.u)) {
      state.mode = "air";
      state.vy = 0;
    } else {
      state.y = surface + 0.42;
      railCollision(state, road, events);
    }
  } else if (state.y <= surface + 0.42 && state.vy <= 0) {
    state.mode = "ground";
    state.y = surface + 0.42;
    state.vy = 0;
    events.push({ type: "land" });
  }

  if ((state.mode === "ground" && !supported && isWater(state.x, state.z)) ||
    state.y < -12 || Math.abs(state.x) > 240 || Math.abs(state.z) > 245) {
    recoverKart(state);
    events.push({ type: "recover" });
  } else {
    updateProgress(state, oldX, oldZ, events);
    state.roadU = road.u;
  }
  state.speed = Math.hypot(state.vx, state.vz) * Math.sign(state.vx * Math.sin(state.yaw) + state.vz * Math.cos(state.yaw) || 1);
  state.wrongWay = Math.cos(angleDifference(state.yaw, Math.atan2(road.dx, road.dz))) < -0.4 && Math.abs(state.speed) > 3;
  return events;
}

export class FixedClock {
  private accumulator = 0;
  droppedSeconds = 0;

  reset(): void {
    this.accumulator = 0;
  }

  advance(elapsed: number, step: () => void): number {
    if (!Number.isFinite(elapsed) || elapsed < 0) throw new RangeError("Frame duration must be finite and nonnegative.");
    this.accumulator += elapsed;
    const maximum = STEP * 5;
    if (this.accumulator > maximum) {
      this.droppedSeconds += this.accumulator - maximum;
      this.accumulator = maximum;
    }
    while (this.accumulator >= STEP - 1e-10) {
      step();
      this.accumulator -= STEP;
    }
    return clamp(this.accumulator / STEP, 0, 1);
  }
}
