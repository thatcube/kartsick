import { COURSE_IDS, clamp } from "@kartsick/content";
import type { CourseId, ItemId } from "@kartsick/content";
import type { DrivingEvent, KartState, RaceEvent } from "@kartsick/simulation";
import type { Settings } from "./storage";

type Line = readonly (number | null)[];
type Patch = "wood" | "glass" | "piano" | "mallet" | "flute" | "brass";
interface Harmony { roots: readonly number[]; thirds: readonly number[] }
interface Score extends Harmony {
  bpm: number;
  swing: number;
  lead: readonly Line[];
  patch: Patch;
  answer: Patch;
  bass: Line;
  kicks: readonly number[];
  chords: readonly number[];
  brush: number;
  pad?: boolean;
  arpeggio?: boolean;
}

// Original compositions/patterns: CC BY 4.0; synthesizer implementation code: MIT.
// Eight-bar call/answer forms, not transpositions of one shared course melody.
const MENU: Score = {
  bpm: 112, swing: 0.07, patch: "mallet", answer: "piano",
  roots: [36, 33, 41, 43, 36, 33, 38, 43], thirds: [4, 3, 4, 4, 4, 3, 3, 4],
  bass: [0, null, null, null, null, null, 7, null, 12, null, null, null, null, null, 7, null],
  kicks: [0, 8], chords: [4, 12], brush: 0.6,
  lead: [
    [76, null, 79, 81, 79, null, 76, 74], [72, null, 76, 79, 76, 74, 72, null],
    [77, 76, 74, null, 72, null, 69, null], [71, null, 74, 79, 77, 74, 71, null],
    [76, null, 83, 81, 79, 76, 74, null], [72, 76, null, 81, 79, 76, 72, null],
    [74, null, 77, 76, 74, 72, 69, null], [71, 74, 79, null, 77, 74, 72, null],
  ],
};
const SCORES: Readonly<Record<CourseId, Score>> = {
  butterbell: {
    bpm: 132, swing: 0.05, patch: "wood", answer: "brass",
    roots: [38, 35, 43, 45, 38, 42, 43, 45], thirds: [4, 3, 4, 4, 4, 3, 4, 4],
    bass: [0, null, null, 12, null, null, 7, null, 0, null, 12, null, null, null, 7, null],
    kicks: [0, 8, 11], chords: [4, 10, 14], brush: 0.75,
    lead: [
      [78, 74, null, 76, 81, 78, 76, null], [78, null, 81, 83, 81, 78, 74, null],
      [79, 83, 81, null, 79, 76, 74, null], [76, null, 73, 76, 81, null, 79, 76],
      [78, 81, 86, null, 83, 81, 78, 76], [81, null, 78, 76, 73, 76, 78, null],
      [79, 76, 74, 71, 74, null, 76, 79], [81, 79, 76, null, 73, 76, 74, null],
    ],
  },
  afterglow: {
    bpm: 144, swing: 0, patch: "glass", answer: "flute", pad: true, arpeggio: true,
    roots: [40, 36, 43, 38, 40, 45, 36, 38], thirds: [3, 4, 4, 4, 3, 3, 4, 4],
    bass: [0, null, null, null, null, 7, null, null, 12, null, null, 7, null, null, 0, null],
    kicks: [0, 7, 10], chords: [3, 11], brush: 0.42,
    lead: [
      [83, null, 78, 79, null, 86, 83, null], [84, 79, null, 76, 83, null, 79, null],
      [86, null, 83, 81, 79, null, 81, 83], [81, 78, null, 76, 78, 81, null, 86],
      [88, 86, null, 83, 79, null, 78, 76], [84, null, 83, 81, 76, 79, null, 81],
      [79, 83, 84, null, 88, null, 84, 79], [86, null, 81, 78, 76, null, 78, 83],
    ],
  },
  escaluna: {
    bpm: 124, swing: 0.04, patch: "piano", answer: "brass",
    roots: [34, 31, 39, 41, 38, 43, 36, 41], thirds: [4, 3, 4, 4, 3, 3, 3, 4],
    bass: [0, null, 12, null, null, 7, null, 10, 12, null, null, 7, null, 0, null, null],
    kicks: [0, 6, 10], chords: [3, 7, 11, 15], brush: 0.7,
    lead: [
      [77, null, 74, 72, null, 74, 77, 79], [74, 70, null, 69, 70, null, 74, 77],
      [79, null, 77, 75, 74, 70, null, 75], [72, 69, 67, null, 69, null, 72, 75],
      [77, 81, null, 79, 77, 74, null, 72], [79, null, 77, 74, 70, 74, 77, null],
      [75, 79, 82, null, 79, 75, 74, 72], [69, null, 72, 75, 77, 75, 72, null],
    ],
  },
  tiltglass: {
    bpm: 148, swing: 0.16, patch: "mallet", answer: "wood",
    roots: [38, 41, 43, 45, 38, 46, 43, 45], thirds: [3, 4, 3, 3, 3, 4, 3, 3],
    bass: [0, null, null, 7, 12, null, 7, null, 0, null, null, 12, 7, null, null, 10],
    kicks: [0, 6, 8, 14], chords: [4, 12], brush: 0.56,
    lead: [
      [86, 81, 77, null, 79, 77, 76, 74], [81, 84, 88, 84, null, 81, 79, null],
      [82, 79, 77, 74, null, 77, 79, 82], [81, null, 76, 79, 84, 83, 81, null],
      [89, 86, 81, 77, 79, null, 81, 86], [86, 82, null, 77, 74, 77, 82, null],
      [79, 82, 86, 82, 79, 77, null, 74], [76, 79, 81, null, 84, 81, 77, 74],
    ],
  },
  copperwhistle: {
    bpm: 128, swing: 0.08, patch: "flute", answer: "wood",
    roots: [43, 45, 40, 38, 43, 36, 45, 38], thirds: [4, 3, 3, 4, 4, 4, 3, 4],
    bass: [0, null, null, null, 7, null, null, 12, 0, null, null, null, null, 7, null, null],
    kicks: [0, 9], chords: [6, 14], brush: 0.9,
    lead: [
      [79, null, 83, 81, 79, null, 74, null], [81, 84, null, 83, 81, 79, null, 76],
      [83, null, 79, 78, 76, null, 74, 71], [78, 81, null, 86, 83, 81, 78, null],
      [86, 83, null, 81, 79, 74, null, 76], [79, null, 84, 83, 79, 76, 74, null],
      [81, 79, 76, null, 72, null, 76, 79], [78, null, 81, 79, 78, 74, 79, null],
    ],
  },
  lastlight: {
    bpm: 138, swing: 0.025, patch: "brass", answer: "glass",
    roots: [45, 41, 36, 40, 45, 43, 41, 40], thirds: [3, 4, 4, 3, 3, 4, 4, 3],
    bass: [0, null, null, 7, null, null, 12, null, 0, null, 7, null, null, null, 12, null],
    kicks: [0, 8, 11], chords: [4, 12], brush: 0.58,
    lead: [
      [81, 76, null, 79, 84, null, 83, 79], [81, null, 84, 88, 86, 84, 81, null],
      [79, 76, 72, null, 76, 79, 83, null], [83, 79, null, 76, 78, 79, 83, null],
      [88, null, 84, 83, 81, 79, 76, null], [86, 83, 81, null, 79, null, 81, 83],
      [84, 81, null, 79, 77, 79, 81, 84], [83, null, 79, 76, 79, 83, 81, null],
    ],
  },
};
const DESCENT_HARMONY: readonly Harmony[] = [
  SCORES.lastlight,
  { roots: [36, 43, 45, 41, 36, 40, 38, 43], thirds: [4, 4, 3, 4, 4, 3, 3, 4] },
  { roots: [41, 36, 43, 45, 41, 43, 36, 36], thirds: [4, 4, 4, 3, 4, 4, 4, 4] },
];
const PATCHES: Record<Patch, readonly [OscillatorType, number, number, number]> = {
  wood: ["triangle", 3.01, 0.11, 0.19], glass: ["sine", 2.76, 0.17, 0.38],
  piano: ["triangle", 2, 0.12, 0.3], mallet: ["sine", 3.98, 0.13, 0.2],
  flute: ["sine", 2.006, 0.08, 0.38], brass: ["triangle", 1.004, 0.1, 0.26],
};
const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12);
const level = (value: number) => Number.isFinite(value) ? clamp(value, 0, 1) : 0;
const hidden = () => typeof document !== "undefined" && document.hidden;
interface Voice { source: AudioScheduledSourceNode; nodes: AudioNode[]; channel: GainNode; end: number }

export class Soundtrack {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private layers: GainNode[] = [];
  private layer = 0;
  private course: CourseId = "butterbell";
  private score = MENU;
  private sector = 0;
  private disposed = false;
  private paused = true;
  private activationEpoch = 0;
  private listening = false;
  private duckUntil = 0;
  private volumes = [Number.NaN, Number.NaN, Number.NaN];
  private engine: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private nextBeat = 0;
  private beat = 0;
  private voices = new Set<Voice>();
  private readonly onVisibility = () => {
    if (hidden()) void this.suspend().catch(() => { /* The graph is already muted if suspension fails. */ });
  };
  settings: Settings;

  constructor(settings: Settings) {
    this.settings = settings;
  }

  get running(): boolean {
    return !this.disposed && !this.paused && !hidden() && this.context?.state === "running";
  }

  /** Queues the selected original score for the next bar. Never activates/resumes audio. */
  setCourse(id: CourseId): void {
    if (!COURSE_IDS.includes(id)) throw new Error(`Unknown soundtrack course: ${id}`);
    this.course = id;
  }

  async activate(): Promise<void> {
    if (this.disposed || hidden()) return;
    const epoch = ++this.activationEpoch;
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.music = this.context.createGain();
      this.effects = this.context.createGain();
      this.master.gain.value = 0;
      this.music.gain.value = 0;
      this.effects.gain.value = 0;
      this.music.connect(this.master);
      this.effects.connect(this.master);
      const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 6;
      limiter.ratio.value = 5;
      limiter.attack.value = 0.006;
      limiter.release.value = 0.16;
      this.master.connect(limiter).connect(this.context.destination);
      this.layers = [this.context.createGain(), this.context.createGain()];
      this.layers.forEach((layer, index) => {
        layer.gain.value = index === 0 ? 1 : 0;
        layer.connect(this.music!);
      });
      this.engine = this.context.createOscillator();
      this.engine.setPeriodicWave(this.context.createPeriodicWave(
        new Float32Array(5), new Float32Array([0, 1, 0.45, 0.2, 0.06]),
      ));
      this.engineGain = this.context.createGain();
      this.engineGain.gain.value = 0;
      this.engineFilter = this.context.createBiquadFilter();
      this.engineFilter.type = "lowpass";
      this.engineFilter.frequency.value = 400;
      this.engine.connect(this.engineFilter).connect(this.engineGain).connect(this.effects);
      this.engine.start();
      this.noise = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * 0.5), this.context.sampleRate);
      const samples = this.noise.getChannelData(0);
      let seed = 0x4b415254;
      for (let i = 0; i < samples.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        samples[i] = seed / 0x80000000 - 1;
      }
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", this.onVisibility);
        this.listening = true;
      }
    }
    const context = this.context;
    const wasRunning = this.running;
    await context.resume();
    if (this.disposed || epoch !== this.activationEpoch) return;
    if (hidden()) { await this.suspend(); return; }
    this.paused = false;
    if (!wasRunning) this.nextBeat = context.currentTime + 0.025;
    this.updateVolumes();
  }

  private updateVolumes(): void {
    if (!this.context || !this.master || !this.music || !this.effects) return;
    const now = this.context.currentTime;
    const targets = [level(this.settings.master), level(this.settings.music) * 0.32 * (now < this.duckUntil ? 0.74 : 1), level(this.settings.effects) * 0.3];
    const buses = [this.master, this.music, this.effects];
    for (let i = 0; i < targets.length; i++) if (targets[i] !== this.volumes[i]) {
      buses[i].gain.setTargetAtTime(targets[i], now, 0.035);
      this.volumes[i] = targets[i];
    }
  }

  private release(voice: Voice): void {
    if (!this.voices.delete(voice)) return;
    voice.source.onended = null;
    for (const node of voice.nodes) node.disconnect();
  }

  private stopVoice(voice: Voice): void {
    voice.source.stop();
    this.release(voice);
  }

  private available(channel: GainNode): boolean {
    if (!this.running || level(this.settings.master) === 0) return false;
    const effect = channel === this.effects;
    if (level(effect ? this.settings.effects : this.settings.music) === 0) return false;
    if (!effect && this.voices.size >= 28) return false;
    if (this.voices.size >= 48 && effect) {
      const oldestMusic = [...this.voices].find(voice => voice.channel !== this.effects);
      if (oldestMusic) this.stopVoice(oldestMusic);
    }
    return this.voices.size < 48;
  }

  private track(source: AudioScheduledSourceNode, nodes: AudioNode[], channel: GainNode, end: number): void {
    const voice = { source, nodes, channel, end };
    this.voices.add(voice);
    source.onended = () => this.release(voice);
  }

  private note(hz: number, duration: number, gain: number, channel: GainNode, time: number, type: OscillatorType = "sine", endHz?: number, attack = 0.008): void {
    if (!this.context || gain <= 0 || !this.available(channel)) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = hz;
    if (endHz !== undefined) {
      oscillator.frequency.setValueAtTime(hz, time);
      oscillator.frequency.exponentialRampToValueAtTime(endHz, time + duration);
    }
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(gain, time + Math.min(attack, duration * 0.45));
    envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(envelope).connect(channel);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
    this.track(oscillator, [oscillator, envelope], channel, time + duration + 0.02);
  }

  private percussion(duration: number, gain: number, cutoff: number, channel: GainNode, time: number): void {
    if (!this.context || !this.noise || gain <= 0 || !this.available(channel)) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    source.buffer = this.noise;
    filter.type = "highpass";
    filter.frequency.value = cutoff;
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(gain, time + 0.003);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
    source.connect(filter).connect(envelope).connect(channel);
    source.start(time);
    source.stop(time + duration + 0.01);
    this.track(source, [source, filter, envelope], channel, time + duration + 0.01);
  }

  private play(patch: Patch, midi: number, time: number, gain: number, gate = 1): void {
    const [type, ratio, overtone, duration] = PATCHES[patch];
    const channel = this.layers[this.layer];
    const hz = frequency(midi);
    this.note(hz, duration * gate, gain, channel, time, type, undefined, patch === "flute" ? 0.035 : 0.009);
    this.note(hz * ratio, duration * 0.58 * gate, gain * overtone, channel, time, "sine");
  }

  private changeScore(score: Score, time: number): void {
    const previous = this.layers[this.layer];
    this.layer = 1 - this.layer;
    const next = this.layers[this.layer];
    for (const voice of this.voices) if (voice.channel === next) this.stopVoice(voice);
    previous.gain.cancelScheduledValues(time);
    previous.gain.setValueAtTime(1, time);
    previous.gain.linearRampToValueAtTime(0, time + 0.22);
    next.gain.cancelScheduledValues(time);
    next.gain.setValueAtTime(0, time);
    next.gain.linearRampToValueAtTime(1, time + 0.16);
    this.score = score;
    this.beat = 0;
  }

  private musicStep(step: number, bar: number, time: number, interval: number): void {
    const score = this.score, channel = this.layers[this.layer];
    const descent = score === SCORES.lastlight;
    const harmony = descent ? DESCENT_HARMONY[this.sector] : score;
    const root = harmony.roots[bar], third = harmony.thirds[bar];
    const offset = score.bass[step];
    if (offset !== null) this.note(frequency(root + offset), interval * 1.65, 0.36, channel, time, "triangle");
    if (step % 2 === 0) {
      const midi = score.lead[bar][step / 2];
      if (midi !== null) {
        const answer = bar % 4 >= 2;
        this.play(answer ? score.answer : score.patch, midi, time, score === MENU ? 0.14 : 0.18, score.patch === "flute" ? 1.22 : 1);
        if (descent && this.sector === 2 && step % 4 === 0) this.note(frequency(midi - 12), 0.22, 0.04, channel, time, "triangle");
      }
      this.percussion(score === SCORES.copperwhistle ? 0.075 : 0.038, (step % 4 === 0 ? 0.025 : 0.039) * score.brush, 5800, channel, time);
    }
    if (score.arpeggio && step % 2 === 1) {
      const intervals = [0, 7, third, 14];
      this.note(frequency(root + 36 + intervals[Math.floor(step / 2) % 4]), interval * 1.5, 0.037, channel, time, "sine");
    }
    if (score.chords.includes(step)) {
      for (const tone of [third, 7, 14]) this.note(frequency(root + 24 + tone), score === SCORES.escaluna ? 0.22 : 0.14, 0.045, channel, time, "triangle");
    }
    if (step === 0 && (score.pad || descent && this.sector > 0)) {
      for (const tone of [0, third, descent && this.sector === 2 ? 14 : 7]) {
        this.note(frequency(root + 24 + tone), interval * 14.5, descent && this.sector === 2 ? 0.033 : 0.022, channel, time, "sine", undefined, 0.18);
      }
    }
    if (step === 4 || step === 12) {
      this.percussion(score === SCORES.copperwhistle ? 0.16 : 0.085, 0.105 * score.brush, 1350, channel, time);
      this.note(score === SCORES.tiltglass ? 235 : 175, 0.065, 0.045, channel, time, "triangle", 115);
    }
    if (score.kicks.includes(step)) this.note(108, 0.14, score === MENU ? 0.28 : 0.34, channel, time, "sine", 41);
    if (score === SCORES.tiltglass && (step === 3 || step === 11 || bar % 4 === 3 && step === 15)) {
      this.note(step === 3 ? 940 : 670, 0.035, 0.06, channel, time, "triangle");
      this.percussion(0.022, 0.025, 2800, channel, time);
    }
    if ((score === SCORES.butterbell || score === SCORES.copperwhistle) && (step === 7 || step === 15)) {
      this.note(step === 7 ? 760 : 540, 0.045, 0.05, channel, time, "sine", 410);
    }
    if (bar === 7 && step >= 13 && step % 2 === 1) this.percussion(0.055, 0.025, 1700 + step * 80, channel, time);
  }

  update(state: KartState, racing: boolean, throttle: number): void {
    if (!this.context || !this.running || !this.music || !this.effects) return;
    this.updateVolumes();
    const now = this.context.currentTime;
    for (const voice of this.voices) if (voice.end <= now) this.release(voice);
    const speed = Number.isFinite(state.speed) ? clamp(Math.abs(state.speed), 0, 150) : 0;
    const load = level(throttle);
    this.engine?.frequency.setTargetAtTime(43 + speed * 3.4 + load * 10, now, 0.07);
    this.engineFilter?.frequency.setTargetAtTime(260 + speed * 14 + load * 150, now, 0.08);
    this.engineGain?.gain.setTargetAtTime(racing ? (0.06 + speed / 230 + load * 0.07) * (state.mode === "glider" ? 0.45 : 1) : 0, now, 0.07);
    // Skip missed transport steps after a stall; never synthesize a backlog of old notes.
    const oldInterval = 60 / this.score.bpm / 4;
    if (this.nextBeat < now - 0.4) {
      const missed = Math.floor((now - this.nextBeat) / oldInterval);
      this.beat += missed;
      this.nextBeat += missed * oldInterval;
    }
    for (let scheduled = 0; scheduled < 8 && this.nextBeat < now + 0.12; scheduled++) {
      const desired = racing ? SCORES[this.course] : MENU;
      if (this.beat % 16 === 0) {
        if (desired !== this.score) this.changeScore(desired, Math.max(now, this.nextBeat));
        this.sector = Number.isFinite(state.lap) ? clamp(Math.floor(state.lap) - 1, 0, 2) : 0;
      }
      const step = this.beat % 16, bar = Math.floor(this.beat / 16) % 8;
      const interval = 60 / this.score.bpm / 4;
      const time = Math.max(now, this.nextBeat) + (step % 2 ? this.score.swing * interval : 0);
      this.musicStep(step, bar, time, interval);
      this.beat = (this.beat + 1) % 128;
      this.nextBeat += interval;
    }
  }

  event(event: DrivingEvent, gain = 1): void {
    if (!this.context || !this.effects || !this.available(this.effects)) return;
    const now = this.context.currentTime;
    const volume = level(gain);
    if (volume === 0) return;
    this.duckUntil = now + 0.18;
    this.updateVolumes();
    if (event.type === "collision" || event.type === "land") {
      this.note(event.type === "land" ? 95 : 70, 0.13, 0.32 * volume, this.effects, now, "sine", 32);
      this.percussion(0.1, 0.2 * volume, 380, this.effects, now);
      return;
    }

    const melody = event.type === "charge" ? [61 + event.tier * 5] :
      event.type === "boost" ? [72, 79, 84] : event.type === "launch" ? [69, 76, 81] :
        event.type === "lap" || event.type === "finish" ? [72, 76, 79, 84] :
          event.type === "recover" ? [57, 52] :
            event.type === "swap" ? [65, 69] : [45];
    melody.forEach((note, i) => this.note(frequency(note), 0.14, 0.35 * volume, this.effects!, now + i * 0.045, "triangle"));
  }

  private item(id: ItemId, time: number, volume: number): void {
    const channel = this.effects!;
    const ping = (midi: number, offset = 0, duration = 0.14, amplitude = 0.22) =>
      this.note(frequency(midi), duration, amplitude * volume, channel, time + offset, "sine");
    const puff = (cutoff: number, duration = 0.1, amplitude = 0.14) =>
      this.percussion(duration, amplitude * volume, cutoff, channel, time);
    switch (id) {
      case "slip": case "triple-slip":
        puff(2700, 0.13); this.note(520, 0.16, 0.12 * volume, channel, time, "triangle", 180);
        if (id === "triple-slip") { ping(66, 0.08, 0.08); ping(62, 0.16, 0.08); } break;
      case "bounce": case "triple-bounce":
        this.note(210, 0.22, 0.23 * volume, channel, time, "sine", 630);
        if (id === "triple-bounce") { ping(76, 0.09, 0.09); ping(71, 0.18, 0.09); } break;
      case "homing": case "triple-homing":
        ping(78); ping(85, 0.075);
        if (id === "triple-homing") { ping(90, 0.15); ping(85, 0.225, 0.09); } break;
      case "leader": ping(69, 0, 0.22); ping(81, 0.12, 0.24); ping(86, 0.24, 0.25); break;
      case "bomb": ping(49, 0, 0.24); this.note(1400, 0.025, 0.09 * volume, channel, time + 0.09, "triangle"); break;
      case "boost": case "triple-boost": case "rapid-boost":
        puff(3800, 0.17, 0.1); ping(74, 0, 0.15); ping(81, 0.055, 0.17);
        if (id === "triple-boost") ping(86, 0.13, 0.16);
        if (id === "rapid-boost") this.note(220, 0.28, 0.11 * volume, channel, time, "triangle", 740);
        break;
      case "invincible": [72, 76, 83, 86].forEach((note, i) => ping(note, i * 0.045, 0.3, 0.16)); break;
      case "shrink": this.note(1700, 0.32, 0.18 * volume, channel, time, "sine", 190); ping(64, 0.12, 0.22); break;
      case "autopilot": this.note(145, 0.3, 0.14 * volume, channel, time, "triangle", 410); ping(79, 0.04); ping(86, 0.14); break;
      case "vision": puff(3100, 0.25, 0.18); ping(82, 0.03, 0.2, 0.08); break;
      case "theft": puff(5900, 0.17, 0.07); ping(88, 0, 0.2, 0.13); ping(81, 0.08, 0.24, 0.13); break;
      case "fire": puff(950, 0.14, 0.22); this.note(175, 0.15, 0.15 * volume, channel, time, "triangle", 65); break;
      case "returning":
        this.note(690, 0.15, 0.16 * volume, channel, time, "sine", 1160);
        this.note(1160, 0.21, 0.13 * volume, channel, time + 0.15, "sine", 570); break;
      case "shockwave": this.note(150, 0.22, 0.28 * volume, channel, time, "sine", 38); ping(90, 0.02, 0.28, 0.09); break;
      case "roadwork":
        for (let i = 0; i < 3; i++) { this.note(430 + i * 170, 0.055, 0.2 * volume, channel, time + i * 0.075, "triangle"); }
        puff(2100, 0.08, 0.09); break;
      case "velvet": ping(65, 0, 0.19); ping(72, 0.08, 0.15); ping(77, 0.15, 0.12, 0.1); break;
      case "static":
        this.note(180, 0.2, 0.17 * volume, channel, time, "triangle", 1060);
        this.note(360, 0.15, 0.085 * volume, channel, time + 0.055, "sine", 1600); break;
      case "doubles":
        this.note(320, 0.18, 0.16 * volume, channel, time, "sine", 890);
        this.note(490, 0.21, 0.13 * volume, channel, time + 0.09, "sine", 1120); break;
    }
  }

  raceEvent(event: RaceEvent, gain = 1): void {
    if (!this.context || !this.effects || !this.available(this.effects)) return;
    const volume = level(gain);
    if (volume === 0) return;
    if (event.type === "charge") { this.event({ type: "charge", tier: clamp(event.value ?? 1, 1, 3) }, volume); return; }
    if (event.type === "lap" || event.type === "finish") { this.event({ type: event.type, time: event.value ?? 0 }, volume); return; }
    switch (event.type) {
      case "boost": case "launch": case "land": case "recover": case "swap": case "collision": this.event({ type: event.type }, volume); return;
    }
    const now = this.context.currentTime;
    this.duckUntil = now + 0.22;
    this.updateVolumes();
    if (event.type === "start" || event.type === "double-start" || event.type === "start-boost") {
      [72, 79, 84].forEach((note, index) => this.note(frequency(note), 0.2, 0.23 * volume, this.effects!, now + index * 0.07, "triangle"));
    } else if (event.type === "pickup" || event.type === "pass" || event.type === "steal") {
      this.note(frequency(event.type === "steal" ? 65 : 81), 0.18, 0.24 * volume, this.effects, now, "sine", frequency(88));
    } else if (event.type === "item-used") {
      if (event.item) this.item(event.item, now, volume);
    } else if (event.type === "hit") {
      this.percussion(0.17, 0.25 * volume, 520, this.effects, now);
      this.note(170, 0.2, 0.25 * volume, this.effects, now, "triangle", 45);
    } else if (event.type === "blocked" || event.type === "reflect" || event.type === "deflect") {
      this.note(880, 0.16, 0.21 * volume, this.effects, now, "sine", 1320);
      this.note(1320, 0.08, 0.12 * volume, this.effects, now + 0.04);
    } else if (event.type === "slide") {
      this.percussion(0.13, 0.1 * volume, 2300, this.effects, now);
    }
  }

  async suspend(): Promise<void> {
    if (!this.context || this.disposed || this.context.state === "closed") return;
    this.paused = true;
    this.activationEpoch++;
    this.volumes.fill(Number.NaN);
    this.master?.gain.cancelScheduledValues(this.context.currentTime);
    this.master?.gain.setValueAtTime(0, this.context.currentTime);
    this.engineGain?.gain.cancelScheduledValues(this.context.currentTime);
    this.engineGain?.gain.setValueAtTime(0, this.context.currentTime);
    for (const voice of this.voices) this.stopVoice(voice);
    await this.context.suspend();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.activationEpoch++;
    if (this.listening) document.removeEventListener("visibilitychange", this.onVisibility);
    for (const voice of this.voices) this.stopVoice(voice);
    this.engine?.stop();
    this.engine?.disconnect();
    this.engineFilter?.disconnect();
    this.engineGain?.disconnect();
    for (const layer of this.layers) layer.disconnect();
    this.music?.disconnect();
    this.effects?.disconnect();
    this.master?.disconnect();
    if (this.context?.state !== "closed") await this.context?.close();
  }
}
