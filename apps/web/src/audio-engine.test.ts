import { describe, expect, it } from "vitest";
import { ENGINE, combustionSamples, createEngineState, stepEngine } from "./audio-engine";
import type { EngineInput, EngineState } from "./audio-engine";

const drive: EngineInput = { speed: 0, throttle: 1, mode: "ground", boosting: false, active: true };
function run(input: (time: number) => EngineInput, seconds: number, hz = 60, initial = createEngineState()) {
  let state = initial;
  const frames: EngineState[] = [];
  for (let i = 0; i < seconds * hz; i++) {
    state = stepEngine(state, input(i / hz), 1 / hz);
    frames.push(state);
  }
  return { state, frames };
}

describe("engine load, virtual gears and clock control", () => {
  it("idles quietly and responds to throttle before wheel speed changes", () => {
    const idle = run(() => ({ ...drive, throttle: 0 }), 3).state;
    const rev = run(() => drive, 2, 60, idle).state;
    expect(idle.rpm).toBe(ENGINE.idleRpm);
    expect(idle.gain).toBeCloseTo(0.055);
    expect(rev.rpm).toBeGreaterThan(idle.rpm + 1000);
    expect(rev.rpm).toBeLessThan(3000);
    expect(rev.gain).toBeGreaterThan(idle.gain);
    expect(rev.cutoff).toBeGreaterThan(idle.cutoff);
  });

  it("upshifts through acceleration with genuine, bounded RPM drops and no repeated cruise shifting", () => {
    const { frames, state } = run(t => ({ ...drive, speed: Math.min(t * 5, 42) }), 18);
    const shifts = frames.flatMap((frame, index) => index && frame.gear > frames[index - 1].gear ? [index] : []);
    expect(shifts).toHaveLength(4);
    for (const index of shifts) {
      expect(Math.min(...frames.slice(index, index + 14).map(frame => frame.rpm))).toBeLessThan(frames[index - 1].rpm - 80);
    }
    expect(new Set(frames.slice(-240).map(frame => frame.gear)).size).toBe(1);
    expect(Math.max(...frames.slice(-240).map(frame => frame.rpm)) - Math.min(...frames.slice(-240).map(frame => frame.rpm))).toBeLessThan(0.1);
    expect(state.gear).toBe(4);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].rpm - frames[i - 1].rpm).toBeLessThanOrEqual(ENGINE.risePerSecond / 60 + 1e-9);
      expect(frames[i - 1].rpm - frames[i].rpm).toBeLessThanOrEqual(ENGINE.fallPerSecond / 60 + 1e-9);
    }
  });

  it.each([8.5, 16, 25, 36])("does not gear-hunt around the %s m/s boundary", speed => {
    const initial = run(() => ({ ...drive, speed: speed + 0.5 }), 2).state;
    const { frames } = run(t => ({ ...drive, speed: speed + Math.sin(t * 11) * 0.4 }), 10, 60, initial);
    expect(new Set(frames.map(frame => frame.gear))).toEqual(new Set([initial.gear]));
  });

  it("respects the shift dwell on alternating large speed changes", () => {
    const { frames } = run(t => ({ ...drive, speed: Math.floor(t * 4) % 2 ? 4 : 45 }), 8);
    const shifts = frames.flatMap((frame, index) => index && frame.gear !== frames[index - 1].gear ? [index] : []);
    for (let i = 1; i < shifts.length; i++) expect((shifts[i] - shifts[i - 1]) / 60).toBeGreaterThanOrEqual(ENGINE.shiftSeconds - 1 / 60);
  });

  it("separates acceleration load, settled cruise, coast and inferred heavy braking", () => {
    const cruise = run(() => ({ ...drive, speed: 28 }), 3).state;
    const acceleration = run(t => ({ ...drive, speed: 15 + t * 10 }), 1).state;
    const coast = run(t => ({ ...drive, throttle: 0, speed: 28 - t * 2 }), 0.8, 60, cruise).state;
    const brake = run(t => ({ ...drive, throttle: 0, speed: 28 - t * 23 }), 0.8, 60, cruise).state;
    expect(acceleration.load).toBeGreaterThan(cruise.load + 0.1);
    expect(coast.load).toBeLessThan(cruise.load * 0.1);
    expect(coast.braking).toBe(0);
    expect(brake.braking).toBeGreaterThan(0.8);
    expect(brake.rpm).toBeLessThan(coast.rpm);
    expect(brake.gain).toBeLessThan(coast.gain);
    expect(coast.cutoff).toBeLessThan(cruise.cutoff);
  });

  it.each(["air", "glider"] as const)("unloads %s without shifting or over-revving, then smoothly lands", mode => {
    const ground = run(() => ({ ...drive, speed: 23 }), 3).state;
    const air = run(() => ({ ...drive, mode, speed: 40 }), 2, 60, ground).state;
    expect(air.gear).toBe(ground.gear);
    expect(air.load).toBeLessThan(ground.load * 0.5);
    expect(air.gain).toBeLessThan(ground.gain * 0.65);
    expect(air.rpm).toBeLessThan(4600);
    const landed = stepEngine(air, { ...drive, speed: 28 }, 1 / 60);
    expect(Math.abs(landed.rpm - air.rpm)).toBeLessThanOrEqual(ENGINE.fallPerSecond / 60);
  });

  it("keeps boosts, extreme speed and reverse finite and bounded", () => {
    for (const speed of [37, 150, 10000, -28, Number.NaN, Infinity]) {
      const { state, frames } = run(() => ({ ...drive, speed, boosting: true }), 6);
      expect(Object.values(state).every(value => typeof value !== "number" || Number.isFinite(value))).toBe(true);
      expect(frames.every(frame => frame.rpm >= ENGINE.idleRpm && frame.rpm <= ENGINE.maxRpm && frame.gain <= ENGINE.maxGain)).toBe(true);
      expect(state.cutoff).toBeLessThan(950);
    }
    const reverse = run(() => ({ ...drive, speed: -4, throttle: 0 }), 2).state;
    expect(reverse.rpm).toBeGreaterThan(ENGINE.idleRpm);
  });

  it("does not mistake first samples, teleports, stalls or duplicate timestamps for acceleration", () => {
    let state = stepEngine(createEngineState(), { ...drive, speed: 37 }, 1 / 60);
    expect(state.acceleration).toBe(0);
    for (const dt of [0, 7200, Number.NaN, -1]) {
      const next = stepEngine(state, { ...drive, speed: 150, throttle: Number.NaN }, dt);
      expect(next.acceleration).toBe(0);
      expect(Math.abs(next.rpm - state.rpm)).toBeLessThanOrEqual(ENGINE.fallPerSecond * 0.1);
      expect(Object.values(next).every(value => typeof value !== "number" || Number.isFinite(value))).toBe(true);
      state = next;
    }
  });

  it("has comparable envelopes and gear selections at 30, 60 and 144 Hz", () => {
    const states = [30, 60, 144].map(hz => run(t => ({
      ...drive, speed: Math.min(28, Math.floor(t * 60) / 60 * 6), throttle: t < 6 ? 1 : 0,
    }), 7, hz).state);
    expect(new Set(states.map(state => state.gear)).size).toBe(1);
    expect(Math.max(...states.map(state => state.rpm)) - Math.min(...states.map(state => state.rpm))).toBeLessThan(10);
    expect(Math.max(...states.map(state => state.gain)) - Math.min(...states.map(state => state.gain))).toBeLessThan(0.002);
    const accelerating = [30, 60, 144].map(hz => run(t => ({
      ...drive, speed: 2 + Math.floor(t * 60) / 60 * 12,
    }), 0.9, hz).state);
    expect(Math.max(...accelerating.map(state => state.acceleration)) - Math.min(...accelerating.map(state => state.acceleration))).toBeLessThan(0.3);
    expect(Math.min(...accelerating.map(state => state.acceleration))).toBeGreaterThan(11);
  });

  it("resets silence without retaining an old racing gear or acceleration", () => {
    const cruising = run(() => ({ ...drive, speed: 37 }), 3).state;
    const input = Object.freeze({ ...drive, active: false });
    expect(stepEngine(Object.freeze(cruising), input, 1 / 60)).toEqual(createEngineState());
  });
});

describe("original combustion waveform", () => {
  it.each([24000, 44100, 48000])("is reproducible, DC-free, quiet and seam-safe at %s Hz", rate => {
    const samples = combustionSamples(rate);
    expect(samples).toEqual(combustionSamples(rate));
    expect(samples.length).toBe(Math.round(rate * 1.6));
    let peak = 0, sum = 0, energy = 0, differenceEnergy = 0;
    for (let i = 0; i < samples.length; i++) {
      const value = samples[i], delta = value - samples[(i + samples.length - 1) % samples.length];
      peak = Math.max(peak, Math.abs(value));
      sum += value;
      energy += value * value;
      differenceEnergy += delta * delta;
    }
    const rms = Math.sqrt(energy / samples.length);
    expect(peak).toBeCloseTo(ENGINE.peak, 6);
    expect(Math.abs(sum / samples.length)).toBeLessThan(1e-7);
    expect(rms).toBeGreaterThan(0.15);
    expect(rms).toBeLessThan(0.45);
    expect(Math.abs(samples[0] - samples.at(-1)!)).toBeLessThan(0.025);
    // Parseval's first-difference bound: energy above 2 kHz, before the runtime lowpass.
    const highFrequencyBound = differenceEnergy / (4 * Math.sin(Math.PI * 2000 / rate) ** 2 * energy);
    expect(highFrequencyBound).toBeLessThan(0.025);
    expect(ENGINE.peak * ENGINE.maxGain * 0.3).toBeLessThan(0.044);
  });

  it("varies firing strength over a long loop instead of repeating one perfect oscillator cycle", () => {
    const rate = 24000, samples = combustionSamples(rate), cycleLength = rate / ENGINE.baseFiringHz;
    const powers = Array.from({ length: ENGINE.cycles }, (_, cycle) =>
      samples.slice(cycle * cycleLength, (cycle + 1) * cycleLength).reduce((sum, value) => sum + value * value, 0) / cycleLength);
    expect(Math.max(...powers) / Math.min(...powers)).toBeGreaterThan(1.2);
    expect(Math.max(...powers) / Math.min(...powers)).toBeLessThan(2.5);
  });

  it.each([0, -1, 4000, 500000, Infinity, Number.NaN])("rejects unbounded sample allocations: %s", rate => {
    expect(() => combustionSamples(rate)).toThrow(RangeError);
  });
});
