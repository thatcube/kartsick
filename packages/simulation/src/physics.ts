import {
  angleDifference, checkpointSpan, clamp, combinedStats, getCourse, lerp, nearbyFlight, roadFeatures,
} from "@kartsick/content";
import type { CourseQuery, KartBuild, RoadProjection } from "@kartsick/content";

export const STEP = 1 / 60;
export const TUNING = {
  topSpeed: 28, boostSpeed: 37, acceleration: 12, braking: 23,
  roadGrip: 7.8, driftGrip: 2.1, driftMinimum: 8,
  miniTurboDuration: 0.72, glideLaunch: 4.2,
} as const;
export interface KartTuning {
  topSpeed: number; boostSpeed: number; acceleration: number; braking: number;
  roadGrip: number; driftGrip: number; driftMinimum: number; miniTurboDuration: number; glideLaunch: number;
  handling: number; offRoadSpeed: number; glideSpeed: number; glideLift: number; glideHandling: number; landing: number;
}
export const DEFAULT_TUNING: Readonly<KartTuning> = {
  ...TUNING, handling: 1, offRoadSpeed: 11, glideSpeed: 1, glideLift: 1, glideHandling: 1, landing: 1,
};
export const SPEED_CLASSES = { 50: .8, 100: 1, 150: 1.17 } as const;
export function tuningForBuild(build: KartBuild, speedClass: 50 | 100 | 150 = 100): KartTuning {
  const s = combinedStats(build);
  const speed = SPEED_CLASSES[speedClass];
  return {
    ...DEFAULT_TUNING, topSpeed: TUNING.topSpeed * speed * s.speed,
    boostSpeed: TUNING.boostSpeed * speed * s.speed, acceleration: TUNING.acceleration * s.acceleration * speed,
    braking: TUNING.braking * s.grip, roadGrip: TUNING.roadGrip * s.grip,
    driftGrip: TUNING.driftGrip * s.grip, handling: s.handling,
    miniTurboDuration: TUNING.miniTurboDuration / Math.sqrt(s.grip),
    offRoadSpeed: 11 * speed * s.offRoad, glideSpeed: s.glideSpeed,
    glideLift: s.glideLift, glideHandling: s.glideHandling, landing: s.glideLift,
    glideLaunch: TUNING.glideLaunch * Math.sqrt(s.glideLift),
  };
}
export interface StepKartOptions {
  course?: CourseQuery;
  tuning?: Readonly<KartTuning>;
  /** In two-human co-op the rear rider countersteers while the driver steers/drifts. */
  countersteer?: number;
  time?: number;
}

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
  impactCooldown: number;
}

export type DrivingEvent =
  | { type: "charge"; tier: number }
  | { type: "boost" | "launch" | "land" | "recover" | "swap" | "collision" }
  | { type: "lap"; time: number }
  | { type: "finish"; time: number };

export function createKart(course = getCourse()): KartState {
  const start = course.sampleRoad(0.006);
  return {
    tick: 0, x: start.x, y: start.y + 0.42, z: start.z,
    yaw: Math.atan2(start.dx, start.dz), vx: 0, vz: 0, vy: 0, speed: 0,
    mode: "ground", driftDirection: 0, driftCharge: 0, counterArmed: true,
    counterCooldown: 0, boost: 0, recovery: 0, previousRecover: false,
    previousSwap: false, driver: 0, swapTime: 0, nextCheckpoint: 1,
    lap: 1, lapStart: 0, elapsed: 0, lapTimes: [], finished: false,
    roadU: start.u, offRoad: false, wrongWay: false, recoveries: 0, impactCooldown: 0,
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

export function recoverKart(state: KartState, course = getCourse()): void {
  const { previous, span } = checkpointSpan(course, state.nextCheckpoint);
  const checkpoint = course.sampleRoad(previous.u + Math.min(0.004, span * 0.25));
  // A failed flight must restart on the approach, not on a checkpoint over water.
  const flight = nearbyFlight(course, checkpoint.u);
  const recoveryPoint = course.isGap(checkpoint.u) && flight ? course.sampleRoad(flight.start - 0.075) : checkpoint;
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
  state.offRoad = false;
  state.wrongWay = false;
  state.impactCooldown = 0;
  clearDrift(state);
}

function impact(state: KartState, events: DrivingEvent[]): void {
  clearDrift(state);
  if (state.impactCooldown > 0) return;
  state.impactCooldown = 0.18;
  events.push({ type: "collision" });
}

function sceneryCollision(state: KartState, events: DrivingEvent[], course: CourseQuery): void {
  const kartRadius = 0.85;
  for (const collider of course.colliders) {
    if (state.y - 0.42 > collider.top || state.y + 0.6 < collider.bottom) continue;
    let dx: number;
    let dz: number;
    let radius = kartRadius;
    if (collider.shape === "circle") {
      dx = state.x - collider.x;
      dz = state.z - collider.z;
      radius += collider.radius;
    } else {
      dx = state.x - clamp(state.x, collider.x - collider.halfX, collider.x + collider.halfX);
      dz = state.z - clamp(state.z, collider.z - collider.halfZ, collider.z + collider.halfZ);
      if (dx === 0 && dz === 0) {
        const xDepth = collider.halfX - Math.abs(state.x - collider.x);
        const zDepth = collider.halfZ - Math.abs(state.z - collider.z);
        if (xDepth < zDepth) {
          dx = state.x >= collider.x ? 1 : -1;
          state.x = collider.x + dx * collider.halfX;
        } else {
          dz = state.z >= collider.z ? 1 : -1;
          state.z = collider.z + dz * collider.halfZ;
        }
        radius += 1;
      }
    }
    const distance = Math.hypot(dx, dz);
    if (distance >= radius) continue;
    // Exact center overlap has no geometric normal; eject opposite travel.
    const nx = distance > 0 ? dx / distance : -Math.sin(state.yaw);
    const nz = distance > 0 ? dz / distance : -Math.cos(state.yaw);
    state.x += nx * (radius - distance + 0.005);
    state.z += nz * (radius - distance + 0.005);
    const inward = state.vx * nx + state.vz * nz;
    if (inward < 0) {
      state.vx -= inward * nx * 1.18;
      state.vz -= inward * nz * 1.18;
    }
    impact(state, events);
  }
}

export function advanceKartProgress(state: KartState, oldX: number, oldZ: number, events: DrivingEvent[], course = getCourse()): void {
  if (state.finished || state.recovery > 0) return;
  const gate = course.checkpoints[state.nextCheckpoint];
  const before = (oldX - gate.x) * gate.dx + (oldZ - gate.z) * gate.dz;
  const after = (state.x - gate.x) * gate.dx + (state.z - gate.z) * gate.dz;
  const crossing = after - before;
  if (before > 0 || after < 0 || crossing <= 0) return;
  const t = clamp(-before / crossing, 0, 1);
  const crossingX = lerp(oldX, state.x, t);
  const crossingZ = lerp(oldZ, state.z, t);
  const lateral = Math.abs((crossingX - gate.x) * gate.dz - (crossingZ - gate.z) * gate.dx);
  if (lateral > (course.isGap(gate.u) ? 21 : course.roadWidth * 0.8)) return;
  if (state.y < gate.y - 3 || state.y > gate.y + (course.isGap(gate.u) ? 18 : 12)) return;
  const descent = course.format === "sectors";
  const finalGate = descent && state.nextCheckpoint === course.checkpoints.length - 1;
  if (!finalGate) state.nextCheckpoint = (state.nextCheckpoint + 1) % course.checkpoints.length;
  if (descent ? !finalGate && !course.sectors.includes(gate.u) : state.nextCheckpoint !== 1) return;
  const time = state.elapsed - state.lapStart;
  state.lapTimes.push(time);
  state.lapStart = state.elapsed;
  events.push({ type: "lap", time });
  if (finalGate || !descent && state.lap === course.laps) {
    state.finished = true;
    events.push({ type: "finish", time: state.elapsed });
  } else {
    state.lap++;
  }
}

function railCollision(state: KartState, road: RoadProjection, events: DrivingEvent[], course: CourseQuery): void {
  const features = roadFeatures(course, road);
  if (!features.rail || road.separation < features.halfWidth - 0.5 || road.separation > features.halfWidth + 2.5) return;
  const side = Math.sign(road.lateral);
  const nx = road.dz * side;
  const nz = -road.dx * side;
  const outward = state.vx * nx + state.vz * nz;
  if (outward <= 0) return;
  state.x = road.x + nx * (features.halfWidth - 0.6);
  state.z = road.z + nz * (features.halfWidth - 0.6);
  state.vx = (state.vx - outward * nx * 1.25) * 0.78;
  state.vz = (state.vz - outward * nz * 1.25) * 0.78;
  impact(state, events);
}

function courseHazards(state: KartState, events: DrivingEvent[], course: CourseQuery, time: number): void {
  for (const hazard of course.hazards(time)) {
    if (state.y - 0.42 > hazard.y + hazard.height / 2 || state.y + 0.6 < hazard.y - hazard.height / 2) continue;
    const dx = state.x - hazard.x, dz = state.z - hazard.z;
    const distance = Math.hypot(dx, dz), radius = hazard.radius + 0.85;
    if (distance >= radius) continue;
    const nx = distance > 0.001 ? dx / distance : -Math.sin(state.yaw);
    const nz = distance > 0.001 ? dz / distance : -Math.cos(state.yaw);
    if (hazard.kind === "gust") {
      state.vx += nx * hazard.strength * STEP;
      state.vz += nz * hazard.strength * STEP;
      if (state.mode === "glider") state.vy += hazard.strength * 0.2 * STEP;
      continue;
    }
    state.x += nx * (radius - distance + 0.005);
    state.z += nz * (radius - distance + 0.005);
    const inward = state.vx * nx + state.vz * nz;
    const impulse = Math.max(0, -inward) * 1.25 + hazard.strength;
    state.vx += nx * impulse;
    state.vz += nz * impulse;
    impact(state, events);
  }
}

export function stepKart(state: KartState, input: DriverInput, options: StepKartOptions = {}): DrivingEvent[] {
  const course = options.course ?? getCourse();
  const tuning = options.tuning ?? DEFAULT_TUNING;
  const events: DrivingEvent[] = [];
  if (state.finished) return events;
  state.tick++;
  state.elapsed += STEP;
  state.boost = Math.max(0, state.boost - STEP);
  state.swapTime = Math.max(0, state.swapTime - STEP);
  state.counterCooldown = Math.max(0, state.counterCooldown - STEP);
  state.impactCooldown = Math.max(0, state.impactCooldown - STEP);

  if (input.recover && !state.previousRecover) {
    recoverKart(state, course);
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
  const roadBefore = course.projectRoad(state.x, state.z);
  const oldX = state.x;
  const oldZ = state.z;
  const oldY = state.y;
  const beforeFeatures = roadFeatures(course, roadBefore);
  const onRoad = roadBefore.separation < beforeFeatures.shoulderWidth && !beforeFeatures.gap && !beforeFeatures.rough &&
    Math.abs(state.y - 0.42 - roadBefore.y) < 2;

  if (state.mode === "ground") {
    const forwardX = Math.sin(state.yaw);
    const forwardZ = Math.cos(state.yaw);
    let longitudinal = state.vx * forwardX + state.vz * forwardZ;
    const previousLongitudinal = longitudinal;
    if (input.drift && !state.driftDirection && longitudinal > tuning.driftMinimum && Math.abs(steer) > 0.16 && onRoad) {
      state.driftDirection = Math.sign(steer);
      state.counterArmed = true;
      // Reference co-op starts with the drift sparks: the rear rider supplies two counters.
      if (options.countersteer !== undefined) state.driftCharge = 1;
    }
    if (state.driftDirection && (!input.drift || longitudinal < tuning.driftMinimum || !onRoad)) {
      if (!input.drift && state.driftCharge === 3 && onRoad) {
        state.boost = tuning.miniTurboDuration;
        events.push({ type: "boost" });
      }
      clearDrift(state);
    }
    if (state.driftDirection) {
      const directional = clamp(options.countersteer ?? steer, -1, 1) * state.driftDirection;
      if (directional > 0.2) state.counterArmed = true;
      if (directional < -0.35 && state.counterArmed && state.counterCooldown === 0 && state.driftCharge < 3) {
        state.driftCharge++;
        state.counterArmed = false;
        state.counterCooldown = 0.12;
        events.push({ type: "charge", tier: state.driftCharge });
      }
    }

    const topSpeed = state.boost > 0 ? tuning.boostSpeed : onRoad ? tuning.topSpeed : tuning.offRoadSpeed;
    const push = state.boost > 0 ? 23 : throttle * tuning.acceleration;
    longitudinal += (push - (brake * (longitudinal > 0.8 ? tuning.braking : 7))) * STEP;
    longitudinal *= 1 - (throttle || state.boost > 0 ? 0.16 : 1.1) * STEP;
    if (longitudinal > topSpeed) longitudinal = Math.max(topSpeed, longitudinal - 20 * STEP);
    longitudinal = clamp(longitudinal, -6.5, tuning.boostSpeed);
    if (Math.abs(longitudinal) < 0.06 && !throttle && !brake) longitudinal = 0;

    const turn = state.driftDirection
      ? state.driftDirection * 0.57 + steer * 0.63
      : steer * 1.22;
    state.yaw += turn * tuning.handling * clamp(Math.abs(longitudinal) / 7, 0, 1) * Math.sign(longitudinal || 1) * STEP;
    const targetX = Math.sin(state.yaw) * longitudinal;
    const targetZ = Math.cos(state.yaw) * longitudinal;
    const grip = state.driftDirection ? tuning.driftGrip : tuning.roadGrip;
    state.vx += forwardX * (longitudinal - previousLongitudinal);
    state.vz += forwardZ * (longitudinal - previousLongitudinal);
    state.vx = lerp(state.vx, targetX, grip * STEP);
    state.vz = lerp(state.vz, targetZ, grip * STEP);
  } else {
    clearDrift(state);
    const horizontal = Math.hypot(state.vx, state.vz);
    const pitch = clamp(input.pitch, -1, 1);
    const airspeed = state.mode === "glider"
      ? clamp(horizontal + (-pitch * 4.5 - (horizontal - 26 * tuning.glideSpeed) * 0.3 + (state.boost > 0 ? 18 : 0)) * STEP, 9, 39 * tuning.glideSpeed)
      : horizontal * (1 - 0.12 * STEP);
    state.yaw += steer * (state.mode === "glider" ? 0.66 * tuning.glideHandling : 0.38) * STEP;
    state.vx = lerp(state.vx, Math.sin(state.yaw) * airspeed, 3 * STEP);
    state.vz = lerp(state.vz, Math.cos(state.yaw) * airspeed, 3 * STEP);
    if (state.mode === "glider" && airspeed > 12 / tuning.glideLift) {
      state.vy += (-4.6 / tuning.glideLift + pitch * 3.1 - state.vy) * 1.7 * STEP;
    } else {
      state.vy -= 9.81 * STEP;
    }
    state.y += state.vy * STEP;
  }

  state.x += state.vx * STEP;
  state.z += state.vz * STEP;
  sceneryCollision(state, events, course);
  courseHazards(state, events, course, options.time ?? state.tick * STEP);
  const road = course.projectRoad(state.x, state.z);
  const features = roadFeatures(course, road);
  state.offRoad = road.separation > features.shoulderWidth || features.gap || features.rough;
  const deck = course.surfaceHeight(state.x, state.z, road);
  // A kart beneath an elevated deck must not snap upward through it.
  const ground = course.terrainHeight(state.x, state.z);
  const surface = oldY + 0.8 < deck && ground < deck - 0.8 ? ground : deck;
  if (state.mode === "ground") {
    const crossedLip = features.gap && course.glides.some(gap =>
      roadBefore.u < gap.start && road.u >= gap.start && road.u < gap.start + 0.03);
    if (crossedLip && onRoad && Math.hypot(state.vx, state.vz) > 11) {
      state.mode = "glider";
      state.vy = tuning.glideLaunch;
      clearDrift(state);
      events.push({ type: "launch" });
    } else if (state.y - surface > 1.6) {
      state.mode = "air";
      state.vy = 0;
    } else {
      state.y = surface + 0.42;
      railCollision(state, road, events, course);
    }
  } else if (state.y <= surface + 0.42 && oldY >= surface + 0.27 && state.vy <= 0) {
    state.mode = "ground";
    state.y = surface + 0.42;
    const retention = clamp(1 - Math.max(0, -state.vy - 6 * tuning.landing) * .025, .65, 1);
    state.vx *= retention;
    state.vz *= retention;
    state.vy = 0;
    events.push({ type: "land" });
  }

  if ((course.isWater(state.x, state.z) && state.y <= course.waterLevel + 0.42) ||
    state.y < course.bounds.minY || state.x < course.bounds.minX || state.x > course.bounds.maxX ||
    state.z < course.bounds.minZ || state.z > course.bounds.maxZ) {
    recoverKart(state, course);
    events.push({ type: "recover" });
  } else {
    advanceKartProgress(state, oldX, oldZ, events, course);
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
