import { clamp } from "@kartsick/content";
import type { DrivingEvent, KartState } from "@kartsick/simulation";
import type { Settings } from "./storage";

const MELODY = [76, 79, 83, 81, 79, 74, 76, 71, 74, 78, 81, 79, 76, 74, 69, 71];
const BASS = [40, 40, 47, 43, 45, 45, 52, 47];
const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12);

export class Soundtrack {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private engine: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private nextBeat = 0;
  private beat = 0;
  settings: Settings;

  constructor(settings: Settings) {
    this.settings = settings;
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
      this.engine.type = "triangle";
      this.engineGain = this.context.createGain();
      this.engineGain.gain.value = 0;
      const filter = this.context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 700;
      this.engine.connect(filter).connect(this.engineGain).connect(this.effects);
      this.engine.start();
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

  private note(hz: number, duration: number, gain: number, channel: GainNode, time: number, type: OscillatorType = "sine"): void {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = hz;
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

  update(state: KartState, racing: boolean): void {
    if (!this.context || this.context.state !== "running" || !this.music || !this.effects) return;
    this.updateVolumes();
    const now = this.context.currentTime;
    this.engine?.frequency.setTargetAtTime(48 + Math.abs(state.speed) * 4.3, now, 0.07);
    this.engineGain?.gain.setTargetAtTime(racing ? 0.12 + clamp(Math.abs(state.speed) / 180, 0, 0.3) : 0, now, 0.07);
    if (this.nextBeat < now - 0.4) this.nextBeat = now;
    if (this.nextBeat > now + 0.08) return;
    const interval = 60 / (racing ? 132 : 112) / 2;
    const beat = this.beat++;
    const time = Math.max(now, this.nextBeat);
    if (beat % 2 === 0) this.note(frequency(BASS[(beat / 2) % BASS.length]), 0.25, 0.5, this.music, time, "triangle");
    if (beat % 4 !== 3) this.note(frequency(MELODY[beat % MELODY.length]), 0.19, 0.23, this.music, time, "sine");
    this.note(beat % 2 === 0 ? 95 : 1100, 0.05, beat % 2 === 0 ? 0.3 : 0.035, this.music, time, "triangle");
    this.nextBeat = time + interval;
  }

  event(event: DrivingEvent): void {
    if (!this.context || !this.effects) return;
    const now = this.context.currentTime;
    const melody = event.type === "charge" ? [61 + event.tier * 5] :
      event.type === "boost" ? [72, 79, 84] : event.type === "launch" ? [69, 76, 81] :
        event.type === "lap" || event.type === "finish" ? [72, 76, 79, 84] :
          event.type === "recover" ? [57, 52] : event.type === "collision" ? [35] :
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
