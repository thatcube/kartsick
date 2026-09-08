const bound = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const finite = (value: number) => Number.isFinite(value) ? value : 0;
const approach = (value: number, target: number, dt: number, seconds: number) =>
  value + (target - value) * -Math.expm1(-dt / seconds);

export const ENGINE = Object.freeze({
  idleRpm: 1450,
  maxRpm: 6100,
  baseFiringHz: 40,
  cycles: 64,
  peak: 0.8,
  maxGain: 0.18,
  risePerSecond: 3000,
  fallPerSecond: 4000,
  shiftSeconds: 0.7,
});
const UPSHIFT = [8.5, 16, 25, 36] as const;
const RATIOS = [1, 0.7, 0.52, 0.4, 0.32] as const;

export interface EngineInput {
  speed: number;
  throttle: number;
  mode: "ground" | "air" | "glider";
  boosting: boolean;
  active: boolean;
}
export interface EngineState {
  initialized: boolean;
  speed: number;
  previousSpeed: number;
  acceleration: number;
  load: number;
  braking: number;
  gear: number;
  cooldown: number;
  shift: number;
  rpm: number;
  gain: number;
  cutoff: number;
}

export function createEngineState(): EngineState {
  return {
    initialized: false, speed: 0, previousSpeed: 0, acceleration: 0, load: 0, braking: 0,
    gear: 0, cooldown: 0, shift: 0, rpm: ENGINE.idleRpm, gain: 0, cutoff: 420,
  };
}

/** Audio-clock control only: never changes the kart or advances the simulation. */
export function stepEngine(previous: Readonly<EngineState>, input: Readonly<EngineInput>, elapsed: number): EngineState {
  if (!input.active) return createEngineState();
  const rawDt = Math.max(0, finite(elapsed));
  if (rawDt === 0 && previous.initialized) return { ...previous };
  const dt = Math.min(rawDt, 0.1);
  const speed = bound(Math.abs(finite(input.speed)), 0, 150);
  const throttle = bound(finite(input.throttle), 0, 1);
  const ground = input.mode === "ground";
  const next = { ...previous, initialized: true, previousSpeed: speed };
  if (!previous.initialized) {
    next.gear = UPSHIFT.filter(threshold => speed > threshold).length;
  }
  // A stalled render, snapshot correction or initial activation is not engine load.
  const continuous = previous.initialized && rawDt > 0 && rawDt <= 0.25 &&
    Math.abs(speed - previous.previousSpeed) <= Math.max(2, 30 * rawDt);
  next.speed = continuous ? approach(previous.speed, speed, dt, 0.14) : speed;
  // Differentiate filtered speed: render frames can repeat a 60 Hz physics sample.
  const acceleration = continuous ? bound((next.speed - previous.speed) / dt, -30, 20) : 0;
  next.acceleration = approach(previous.acceleration, acceleration, dt, 0.18);
  next.braking = approach(previous.braking,
    ground && throttle < 0.15 ? bound((-next.acceleration - 5) / 14, 0, 1) : 0, dt, 0.12);
  next.cooldown = Math.max(0, previous.cooldown - dt);
  next.shift = Math.max(0, previous.shift - dt);
  if (ground && next.cooldown === 0 && dt > 0) {
    const gear = next.gear;
    if (gear < RATIOS.length - 1 && next.speed > UPSHIFT[gear] && throttle > 0.15) next.gear++;
    else if (gear > 0 && next.speed < UPSHIFT[gear - 1] * 0.72) next.gear--;
    if (next.gear !== gear) {
      next.cooldown = ENGINE.shiftSeconds;
      next.shift = 0.18;
    }
  }
  const demand = ground
    ? throttle * (0.57 + bound(next.acceleration / 12, 0, 1) * 0.3) + (input.boosting ? 0.1 : 0)
    : throttle * 0.24;
  const load = bound(demand * (next.shift > 0 ? 0.66 : 1) * (1 - next.braking * 0.55), 0, 1);
  next.load = approach(previous.load, load, dt, load > previous.load ? 0.12 : 0.24);
  const coupledRpm = ENGINE.idleRpm + next.speed * RATIOS[next.gear] * 245;
  const targetRpm = bound(ground
    ? coupledRpm + next.load * 480 + throttle * Math.max(0, 1 - next.speed / 7) * 900 - next.braking * 300
    : ENGINE.idleRpm + throttle * 2550 + Math.min(next.speed, 40) * 10, ENGINE.idleRpm, ENGINE.maxRpm);
  const smoothedRpm = approach(previous.rpm, targetRpm, dt, next.shift > 0 ? 0.09 : 0.18);
  next.rpm = bound(smoothedRpm, previous.rpm - ENGINE.fallPerSecond * dt, previous.rpm + ENGINE.risePerSecond * dt);
  const airGain = input.mode === "glider" ? 0.38 : ground ? 1 : 0.62;
  const gain = (0.055 + next.load * 0.095 + Math.min(next.speed / 42, 1) * 0.018) *
    airGain * (1 - next.braking * 0.24);
  next.gain = approach(previous.gain, bound(gain, 0, ENGINE.maxGain), dt, 0.12);
  next.cutoff = approach(previous.cutoff, 350 + next.load * 420 + (next.rpm / ENGINE.maxRpm) * 170, dt, 0.16);
  return next;
}

/** A seamless, DC-free series of uneven exhaust pulses, not a pitched saw/square wave. */
export function combustionSamples(sampleRate: number): Float32Array {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new RangeError("Unsupported engine sample rate");
  const samples = new Float32Array(Math.round(sampleRate * ENGINE.cycles / ENGINE.baseFiringHz));
  let seed = 0x4b415254;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const pulseLength = Math.ceil(sampleRate * 0.064);
  const turbulenceResponse = -Math.expm1(-2 * Math.PI * 850 / sampleRate);
  for (let cycle = 0; cycle < ENGINE.cycles; cycle++) {
    const start = Math.round((cycle + (random() - 0.5) * 0.045) * sampleRate / ENGINE.baseFiringHz);
    const strength = 0.84 + random() * 0.16;
    let turbulence = 0;
    for (let frame = 0; frame < pulseLength; frame++) {
      const t = frame / sampleRate;
      const envelope = (1 - Math.exp(-t / 0.0018)) * Math.exp(-t / 0.012) *
        (0.5 + 0.5 * Math.cos(Math.PI * frame / pulseLength));
      turbulence += (random() * 2 - 1 - turbulence) * turbulenceResponse;
      const body = Math.sin(2 * Math.PI * 92 * t) + 0.26 * Math.sin(2 * Math.PI * 187 * t + 0.3);
      const index = (start + frame + samples.length) % samples.length;
      samples[index] += strength * envelope * (body + turbulence * 0.2);
    }
  }
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample - mean));
  for (let i = 0; i < samples.length; i++) samples[i] = (samples[i] - mean) * ENGINE.peak / peak;
  return samples;
}
