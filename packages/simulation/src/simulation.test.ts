import { describe, expect, it } from "vitest";
import { CHECKPOINTS, GAP_START, sampleRoad } from "@kartsick/content";
import { FixedClock, NEUTRAL, STEP, copyKart, createKart, stepKart } from "./index";
import type { DriverInput, KartState } from "./index";

const drive = (changes: Partial<DriverInput> = {}): DriverInput => ({ ...NEUTRAL, ...changes });
function advance(state: KartState, input: DriverInput, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP); i++) stepKart(state, input);
}
function movingAt(u: number, speed = 20): KartState {
  const state = createKart();
  const point = sampleRoad(u);
  Object.assign(state, {
    x: point.x, z: point.z, y: point.y + 0.42, roadU: u,
    yaw: Math.atan2(point.dx, point.dz), vx: point.dx * speed, vz: point.dz * speed, speed,
  });
  return state;
}

describe("manual vehicle simulation", () => {
  it("never accelerates or steers without player input", () => {
    const state = createKart();
    const initial = copyKart(state);
    advance(state, drive(), 8);
    expect(state.speed).toBe(0);
    expect(state.x).toBe(initial.x);
    expect(state.z).toBe(initial.z);
    expect(state.yaw).toBe(initial.yaw);
  });

  it("accelerates responsively and coasts down when released", () => {
    const state = createKart();
    advance(state, drive({ throttle: 1 }), 2);
    expect(state.speed).toBeGreaterThan(16);
    const speed = state.speed;
    advance(state, drive(), 0.5);
    expect(state.speed).toBeLessThan(speed);
  });

  it("brakes, then reverses without adding a steering assist", () => {
    const state = movingAt(0.04, 8);
    advance(state, drive({ brake: 1 }), 1.5);
    expect(state.speed).toBeLessThan(0);
  });

  it("charges a drift with three distinct countersteers, not a timer", () => {
    const state = movingAt(0.01, 20);
    stepKart(state, drive({ throttle: 1, drift: true, steer: 1 }));
    expect(state.driftDirection).toBe(1);
    advance(state, drive({ throttle: 1, drift: true, steer: -1 }), 0.15);
    expect(state.driftCharge).toBe(1);
    advance(state, drive({ throttle: 1, drift: true, steer: -1 }), 0.15);
    expect(state.driftCharge).toBe(1);
    for (let i = 0; i < 2; i++) {
      advance(state, drive({ throttle: 1, drift: true, steer: 1 }), 0.14);
      advance(state, drive({ throttle: 1, drift: true, steer: -1 }), 0.14);
    }
    expect(state.driftCharge).toBe(3);
    expect(stepKart(state, drive({ throttle: 1 }))).toContainEqual({ type: "boost" });
    expect(state.boost).toBeGreaterThan(0.6);
  });

  it("does not boost from an uncharged drift or from stationary wiggling", () => {
    const state = movingAt(0.01);
    stepKart(state, drive({ drift: true, steer: 1 }));
    stepKart(state, drive());
    expect(state.boost).toBe(0);
    const stopped = createKart();
    advance(stopped, drive({ drift: true, steer: 1 }), 1);
    expect(stopped.driftDirection).toBe(0);
  });

  it("deploys the selected glider only from the launch lip at speed", () => {
    const state = movingAt(GAP_START - 0.0003, 27);
    const events = stepKart(state, drive({ throttle: 1 }));
    expect(events).toContainEqual({ type: "launch" });
    expect(state.mode).toBe("glider");
    expect(state.vy).toBeGreaterThan(0);
    const slow = movingAt(GAP_START - 0.0001, 5);
    stepKart(slow, drive());
    expect(slow.mode).not.toBe("glider");
  });

  it("makes pull-up and dive change both flight descent and airspeed", () => {
    const float = movingAt(GAP_START + 0.01, 27);
    float.mode = "glider";
    float.y = 35;
    const dive = copyKart(float);
    advance(float, drive({ pitch: 1 }), 1);
    advance(dive, drive({ pitch: -1 }), 1);
    expect(float.y).toBeGreaterThan(dive.y);
    expect(float.speed).toBeLessThan(dive.speed);
  });

  it("recovers a failed crossing to dry approach ground without granting progress", () => {
    const state = movingAt(0.67);
    state.x = 77;
    state.z = -14;
    state.y = -3;
    state.mode = "air";
    state.vy = -10;
    state.nextCheckpoint = 11;
    stepKart(state, drive());
    expect(state.recovery).toBeGreaterThan(0);
    expect(state.roadU).toBeLessThan(GAP_START);
    expect(state.nextCheckpoint).toBe(11);
    expect(state.recoveries).toBe(1);
  });

  it("swaps on a button edge, not repeatedly while it is held", () => {
    const state = createKart();
    advance(state, drive({ swap: true }), 1);
    expect(state.driver).toBe(1);
    stepKart(state, drive());
    stepKart(state, drive({ swap: true }));
    expect(state.driver).toBe(0);
  });
});

describe("ordered progress", () => {
  function cross(state: KartState, index: number, reverse = false): void {
    const gate = CHECKPOINTS[index];
    const sign = reverse ? -1 : 1;
    Object.assign(state, {
      x: gate.x - gate.dx * 0.1 * sign, z: gate.z - gate.dz * 0.1 * sign,
      y: gate.y + 0.42, vx: gate.dx * 18 * sign, vz: gate.dz * 18 * sign,
      yaw: Math.atan2(gate.dx * sign, gate.dz * sign), speed: 18,
      recovery: 0, mode: "ground",
    });
    stepKart(state, drive({ throttle: 1 }));
  }
  it("ignores finish-line loops without completing the checkpoint sequence", () => {
    const state = createKart();
    for (let i = 0; i < 10; i++) cross(state, 0);
    expect(state.lap).toBe(1);
    expect(state.lapTimes).toEqual([]);
    expect(state.nextCheckpoint).toBe(1);
  });
  it("does not count reverse checkpoint crossings", () => {
    const state = createKart();
    cross(state, 1, true);
    expect(state.nextCheckpoint).toBe(1);
  });
  it("finishes exactly three complete ordered laps", () => {
    const state = createKart();
    for (let lap = 0; lap < 3; lap++) {
      for (let gate = 1; gate <= CHECKPOINTS.length; gate++) cross(state, gate % CHECKPOINTS.length);
    }
    expect(state.finished).toBe(true);
    expect(state.lapTimes).toHaveLength(3);
    expect(state.nextCheckpoint).toBe(1);
  });
});

describe("fixed stepping", () => {
  it("interpolates render fragments without an extra simulation step", () => {
    const clock = new FixedClock();
    let ticks = 0;
    expect(clock.advance(STEP / 2, () => ticks++)).toBeCloseTo(0.5);
    expect(ticks).toBe(0);
    expect(clock.advance(STEP / 2, () => ticks++)).toBeCloseTo(0);
    expect(ticks).toBe(1);
  });
  it("bounds catch-up after a stalled render", () => {
    const clock = new FixedClock();
    let ticks = 0;
    clock.advance(5, () => ticks++);
    expect(ticks).toBe(5);
    expect(clock.droppedSeconds).toBeGreaterThan(4.9);
    expect(() => clock.advance(NaN, () => {})).toThrow();
  });
});
