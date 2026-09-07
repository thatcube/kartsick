import { clamp } from "@kartsick/content";
import type { DrivingEvent, KartState } from "@kartsick/simulation";
import type { Settings } from "./storage";

const PHRASES: readonly (readonly (number | null)[])[] = [
  [76, null, 79, 81, 79, null, 76, 74],
  [72, null, 76, 79, 76, 74, 72, null],
  [77, 76, 74, null, 72, null, 69, null],
  [71, null, 74, 79, 77, 74, 71, null],
  [76, null, 83, 81, 79, 76, 74, null],
  [72, 76, null, 81, 79, 76, 72, null],
  [74, null, 77, 76, 74, 72, 69, null],
  [71, 74, 79, null, 77, 74, 72, null],
];
const BASS = [36, 33, 41, 43, 36, 33, 38, 43];
const THIRDS = [4, 3, 4, 4, 4, 3, 3, 4];
const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12);

export class Soundtrack {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private engine: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private nextBeat = 0;
  private beat = 0;
  settings: Settings;

  constructor(settings: Settings) {
    this.settings = settings;
  }

  get running(): boolean {
    return this.context?.state === "running";
  }

  async activate(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.music = this.context.createGain();
      this.effects = this.context.createGain();
      this.music.connect(this.master);
      this.effects.connect(this.master);
      this.master.connect(this.context.destination);
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
      this.nextBeat = this.context.currentTime;
    }
    await this.context.resume();
    this.updateVolumes();
  }

  private updateVolumes(): void {
    if (!this.context || !this.master || !this.music || !this.effects) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.settings.master, now, 0.035);
    this.music.gain.setTargetAtTime(this.settings.music * 0.32, now, 0.035);
    this.effects.gain.setTargetAtTime(this.settings.effects * 0.3, now, 0.035);
  }

  private note(hz: number, duration: number, gain: number, channel: GainNode, time: number, type: OscillatorType = "sine", endHz?: number): void {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = hz;
    if (endHz !== undefined) {
      oscillator.frequency.setValueAtTime(hz, time);
      oscillator.frequency.exponentialRampToValueAtTime(endHz, time + duration);
    }
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(gain, time + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(envelope).connect(channel);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
  }

  private percussion(duration: number, gain: number, cutoff: number, channel: GainNode, time: number): void {
    if (!this.context || !this.noise) return;
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
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
  }

  update(state: KartState, racing: boolean, throttle: number): void {
    if (!this.context || this.context.state !== "running" || !this.music || !this.effects) return;
    this.updateVolumes();
    const now = this.context.currentTime;
    const speed = Math.abs(state.speed);
    const load = clamp(throttle, 0, 1);
    this.engine?.frequency.setTargetAtTime(43 + speed * 3.4 + load * 10, now, 0.07);
    this.engineFilter?.frequency.setTargetAtTime(260 + speed * 14 + load * 150, now, 0.08);
    this.engineGain?.gain.setTargetAtTime(racing ? (0.06 + speed / 230 + load * 0.07) * (state.mode === "glider" ? 0.45 : 1) : 0, now, 0.07);
    if (this.nextBeat < now - 0.4) this.nextBeat = now;
    const interval = 60 / (racing ? 132 : 112) / 4;
    while (this.nextBeat < now + 0.12) {
      const beat = this.beat++;
      const step = beat % 16;
      const bar = Math.floor(beat / 16) % PHRASES.length;
      const time = Math.max(now, this.nextBeat);
      const root = BASS[bar];
      if (step === 0 || step === 6 || step === 8 || step === 14) {
        this.note(frequency(root + (step === 8 ? 7 : step === 14 ? 12 : 0)), 0.24, 0.42, this.music, time, "triangle");
      }
      if (step % 2 === 0) {
        const note = PHRASES[bar][step / 2];
        if (note !== null) {
          this.note(frequency(note), 0.3, 0.19, this.music, time);
          this.note(frequency(note) * 2.005, 0.1, 0.035, this.music, time);
        }
        this.percussion(0.045, step % 4 === 0 ? 0.028 : 0.046, 6500, this.music, time);
      }
      if (step === 4 || step === 12) {
        for (const interval of [0, THIRDS[bar], 7]) this.note(frequency(root + 24 + interval), 0.13, 0.07, this.music, time, "triangle");
        this.percussion(0.09, 0.09, 1400, this.music, time);
        this.note(175, 0.07, 0.08, this.music, time, "triangle");
      }
      if (step === 0 || step === 8 || (racing && step === 11)) this.note(115, 0.13, 0.38, this.music, time, "sine", 43);
      this.nextBeat += interval;
    }
  }

  event(event: DrivingEvent): void {
    if (!this.context || !this.effects) return;
    const now = this.context.currentTime;
    if (event.type === "collision" || event.type === "land") {
      this.note(event.type === "land" ? 95 : 70, 0.13, 0.32, this.effects, now, "sine", 32);
      this.percussion(0.1, 0.2, 380, this.effects, now);
      return;
    }
    const melody = event.type === "charge" ? [61 + event.tier * 5] :
      event.type === "boost" ? [72, 79, 84] : event.type === "launch" ? [69, 76, 81] :
        event.type === "lap" || event.type === "finish" ? [72, 76, 79, 84] :
          event.type === "recover" ? [57, 52] :
            event.type === "swap" ? [65, 69] : [45];
    melody.forEach((note, i) => this.note(frequency(note), 0.14, 0.35, this.effects!, now + i * 0.045, "triangle"));
  }

  async suspend(): Promise<void> {
    await this.context?.suspend();
  }

  async dispose(): Promise<void> {
    this.engine?.stop();
    await this.context?.close();
  }
}
