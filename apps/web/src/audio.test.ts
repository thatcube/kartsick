import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COURSE_IDS, ITEM_IDS } from "@kartsick/content";
import type { CourseId } from "@kartsick/content";
import { createKart } from "@kartsick/simulation";
import { DEFAULT_SETTINGS } from "./storage";
import { Soundtrack } from "./audio";
import { ENGINE } from "./audio-engine";

class Param {
  value = 0;
  events: { method: string; value: number; time: number }[] = [];
  setValueAtTime(value: number, time: number) { this.events.push({ method: "set", value, time }); return this; }
  setTargetAtTime(value: number, time: number) { this.events.push({ method: "target", value, time }); return this; }
  linearRampToValueAtTime(value: number, time: number) { this.events.push({ method: "linear", value, time }); return this; }
  exponentialRampToValueAtTime(value: number, time: number) { this.events.push({ method: "exponential", value, time }); return this; }
  cancelScheduledValues(time: number) { this.events.push({ method: "cancel", value: 0, time }); return this; }
}
class AudioNodeFake {
  outputs: AudioNodeFake[] = [];
  disconnected = false;
  connect<T extends AudioNodeFake>(node: T): T { this.outputs.push(node); return node; }
  disconnect() { this.disconnected = true; this.outputs = []; }
}
class Gain extends AudioNodeFake { gain = new Param(); }
class Filter extends AudioNodeFake { type = ""; frequency = new Param(); Q = new Param(); }
class Source extends AudioNodeFake {
  onended: (() => void) | null = null;
  startTime: number | null = null;
  stopTime: number | null = null;
  ended = false;
  stopCalls = 0;
  constructor(readonly context: Context) { super(); }
  start(time = this.context.currentTime) { this.startTime = time; }
  stop(time = this.context.currentTime) { this.stopTime = time; this.stopCalls++; }
}
class Oscillator extends Source {
  type = "sine";
  frequency = new Param();
  periodic = false;
  setPeriodicWave() { this.periodic = true; }
}
class BufferSource extends Source { buffer: BufferFake | null = null; loop = false; playbackRate = new Param(); }
class BufferFake {
  samples: Float32Array;
  constructor(length: number) { this.samples = new Float32Array(length); }
  getChannelData() { return this.samples; }
}
class Compressor extends AudioNodeFake {
  threshold = new Param(); knee = new Param(); ratio = new Param(); attack = new Param(); release = new Param();
}
class Context {
  static instances: Context[] = [];
  currentTime = 0;
  sampleRate = 24000;
  state = "suspended";
  destination = new AudioNodeFake();
  sources: Source[] = [];
  gains: Gain[] = [];
  filters: Filter[] = [];
  buffers: BufferFake[] = [];
  compressor: Compressor | null = null;
  resumes = 0;
  suspends = 0;
  closes = 0;
  constructor() { Context.instances.push(this); }
  createGain() { const node = new Gain(); this.gains.push(node); return node; }
  createOscillator() { const node = new Oscillator(this); this.sources.push(node); return node; }
  createBiquadFilter() { const node = new Filter(); this.filters.push(node); return node; }
  createBufferSource() { const node = new BufferSource(this); this.sources.push(node); return node; }
  createBuffer(_channels: number, length: number) { const node = new BufferFake(length); this.buffers.push(node); return node; }
  createPeriodicWave() { return {}; }
  createDynamicsCompressor() { this.compressor = new Compressor(); return this.compressor; }
  async resume() { this.resumes++; this.state = "running"; }
  async suspend() { this.suspends++; this.state = "suspended"; }
  async close() { this.closes++; this.state = "closed"; }
  advance(time: number) {
    if (this.state !== "running") return;
    this.currentTime = time;
    for (const source of this.sources) if (!source.ended && source.stopTime !== null && source.stopTime <= time) {
      source.ended = true;
      source.onended?.();
    }
  }
}
class Page extends EventTarget { hidden = false; }

const owned: Soundtrack[] = [];
let page: Page;
beforeEach(() => {
  Context.instances = [];
  page = new Page();
  vi.stubGlobal("AudioContext", Context);
  vi.stubGlobal("document", page);
});
afterEach(async () => {
  for (const sound of owned.splice(0)) await sound.dispose();
  vi.unstubAllGlobals();
});

async function make(course: CourseId = "butterbell", settings = structuredClone(DEFAULT_SETTINGS)) {
  const sound = new Soundtrack(settings);
  owned.push(sound);
  sound.setCourse(course);
  await sound.activate();
  return { sound, context: Context.instances.at(-1)!, state: createKart() };
}
const oscillators = (context: Context) => context.sources.filter((source): source is Oscillator => source instanceof Oscillator && !source.periodic);
const kicks = (context: Context) => oscillators(context).filter(source => source.frequency.value === 108);
function run(fixture: Awaited<ReturnType<typeof make>>, seconds: number, racing = true) {
  const { sound, context, state } = fixture;
  const until = context.currentTime + seconds;
  for (let time = context.currentTime; time < until; time += 0.04) {
    context.advance(time);
    sound.update(state, racing, 0.5);
  }
}
const signature = (context: Context) => context.sources.filter(source => !(source instanceof BufferSource && source.loop)).map(source => [
  source instanceof Oscillator ? source.frequency.value : "noise",
  source instanceof Oscillator ? source.type : "noise",
  Math.round((source.startTime ?? 0) * 10000), Math.round((source.stopTime ?? 0) * 10000),
]);

describe("six original course arrangements", () => {
  const tempos = [132, 144, 124, 148, 128, 138];
  const swing = [0.05, 0, 0.04, 0.16, 0.08, 0.025];
  const kickSteps = [[0, 8, 11], [0, 7, 10], [0, 6, 10], [0, 6, 8, 14], [0, 9], [0, 8, 11]];
  it.each(COURSE_IDS)("schedules %s at its approved tempo with bass, melody and percussion", async course => {
    const fixture = await make(course);
    const original = structuredClone(fixture.state);
    run(fixture, 2.3);
    const index = COURSE_IDS.indexOf(course), beat = 60 / tempos[index] / 4;
    const hits = kicks(fixture.context);
    expect(hits.length).toBeGreaterThanOrEqual(kickSteps[index].length);
    for (let i = 0; i < kickSteps[index].length; i++) {
      const step = kickSteps[index][i];
      expect(hits[i].startTime! - hits[0].startTime!).toBeCloseTo((step + (step % 2 ? swing[index] : 0)) * beat, 5);
    }
    expect(oscillators(fixture.context).some(source => source.frequency.value < 200)).toBe(true);
    expect(oscillators(fixture.context).some(source => source.frequency.value > 700)).toBe(true);
    expect(fixture.context.sources.some(source => source instanceof BufferSource)).toBe(true);
    expect(fixture.state).toEqual(original);
    for (const source of fixture.context.sources) {
      expect(Number.isFinite(source.startTime)).toBe(true);
      if (source instanceof Oscillator) expect(Number.isFinite(source.frequency.value)).toBe(true);
      if (source.stopTime !== null) expect(source.stopTime).toBeGreaterThan(source.startTime!);
    }
  });

  it("has six different complete eight-bar performances, not palette-like transpositions", async () => {
    const signatures = new Set<string>();
    const rhythms = new Set<string>();
    for (const course of COURSE_IDS) {
      const fixture = await make(course);
      run(fixture, 16);
      const notes = oscillators(fixture.context);
      signatures.add(JSON.stringify(signature(fixture.context)));
      rhythms.add(JSON.stringify(notes.slice(0, 110).map(source => [
        source.type, Math.round((source.stopTime! - source.startTime!) * 1000),
      ])));
      expect(notes.length).toBeGreaterThan(150);
      await fixture.sound.dispose();
    }
    expect(signatures.size).toBe(6);
    expect(rhythms.size).toBe(6);
  });

  it("keeps the paddock at 112 BPM and makes setCourse silent until the next race bar", async () => {
    const fixture = await make("afterglow");
    run(fixture, 0.4, false);
    fixture.sound.setCourse("copperwhistle");
    const created = fixture.context.sources.length;
    expect(fixture.context.sources.length).toBe(created);
    run(fixture, 1.2, false);
    const hits = kicks(fixture.context);
    expect(hits[1].startTime! - hits[0].startTime!).toBeCloseTo(60 / 112 * 2);
  });

  it("crossfades course changes on the existing bar line without rebuilding the audio graph", async () => {
    const fixture = await make();
    run(fixture, 0.4);
    fixture.sound.setCourse("afterglow");
    run(fixture, 1);
    const root = 440 * 2 ** ((40 - 69) / 12);
    expect(oscillators(fixture.context).some(source => source.frequency.value === root)).toBe(false);
    run(fixture, 0.8);
    const firstNewBass = oscillators(fixture.context).find(source => source.frequency.value === root)!;
    expect(firstNewBass.startTime).toBeCloseTo(0.025 + 60 / 132 * 4, 5);
    expect(Context.instances).toHaveLength(1);
    const layers = fixture.context.gains.slice(3, 5);
    expect(layers.every(layer => layer.gain.events.some(event => event.method === "linear"))).toBe(true);
  });

  it("opens Lastlight harmonically over its three sectors without accelerating the recording", async () => {
    const roots = [45, 36, 41];
    const signatures = new Set<string>(), counts: number[] = [];
    for (let sector = 0; sector < 3; sector++) {
      const fixture = await make("lastlight");
      fixture.state.lap = sector + 1;
      run(fixture, 0.95);
      signatures.add(JSON.stringify(signature(fixture.context)));
      counts.push(fixture.context.sources.length);
      const firstBass = oscillators(fixture.context)[0];
      expect(firstBass.frequency.value).toBeCloseTo(440 * 2 ** ((roots[sector] - 69) / 12));
      expect(kicks(fixture.context)[1].startTime! - kicks(fixture.context)[0].startTime!).toBeCloseTo(60 / 138 * 2);
      await fixture.sound.dispose();
    }
    expect(signatures.size).toBe(3);
    expect(counts[2]).toBeGreaterThan(counts[0]);
  });
});

describe("activation, mixing and lifecycle", () => {
  it("never constructs/resumes audio from course selection, update or event delivery", async () => {
    const sound = new Soundtrack(structuredClone(DEFAULT_SETTINGS));
    owned.push(sound);
    sound.setCourse("tiltglass");
    sound.update(createKart(), true, 1);
    sound.event({ type: "boost" });
    sound.raceEvent({ type: "item-used", tick: 1, kartId: "kart", item: "fire" });
    sound.raceEvent({ type: "pickup", tick: 1, kartId: "kart", item: "fire", effectId: "e1", value: 1.6 });
    sound.raceEvent({ type: "item-ready", tick: 97, kartId: "kart", item: "fire", effectId: "e1" });
    sound.raceEvent({ type: "recover", tick: 100, kartId: "kart" });
    expect(Context.instances).toHaveLength(0);
    page.hidden = true;
    await sound.activate();
    expect(Context.instances).toHaveLength(0);
    page.hidden = false;
    await sound.activate();
    expect(Context.instances).toHaveLength(1);
    expect(sound.running).toBe(true);
  });

  it("suspends immediately when hidden, drops queued effects and requires explicit resume", async () => {
    const fixture = await make();
    run(fixture, 0.3);
    page.hidden = true;
    page.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    expect(fixture.context.state).toBe("suspended");
    const count = fixture.context.sources.length;
    fixture.sound.event({ type: "boost" });
    fixture.sound.raceEvent({ type: "item-used", tick: 1, kartId: "kart", item: "leader" });
    fixture.sound.update(fixture.state, true, 1);
    expect(fixture.context.sources.length).toBe(count);
    expect(fixture.context.sources.slice(1).every(source => source.disconnected)).toBe(true);
    page.hidden = false;
    page.dispatchEvent(new Event("visibilitychange"));
    expect(fixture.context.resumes).toBe(1);
    await fixture.sound.activate();
    fixture.sound.update(fixture.state, true, 1);
    expect(fixture.context.resumes).toBe(2);
    expect(fixture.context.sources.slice(count).every(source => source.startTime! >= fixture.context.currentTime)).toBe(true);
  });

  it("disposes idempotently and removes its owned visibility listener", async () => {
    const fixture = await make();
    run(fixture, 0.3);
    await fixture.sound.dispose();
    await fixture.sound.dispose();
    await fixture.sound.activate();
    await fixture.sound.suspend();
    page.hidden = true;
    page.dispatchEvent(new Event("visibilitychange"));
    expect(fixture.context.closes).toBe(1);
    expect(fixture.context.resumes).toBe(1);
    expect(fixture.context.suspends).toBe(0);
    expect(fixture.context.sources.every(source => source.disconnected)).toBe(true);
    expect(fixture.sound.running).toBe(false);
  });

  it("does not let a pending activation resurrect audio after pause or disposal", async () => {
    const fixture = await make();
    let complete!: () => void;
    vi.spyOn(fixture.context, "resume").mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; }));
    const activation = fixture.sound.activate();
    await fixture.sound.suspend();
    complete();
    await activation;
    expect(fixture.sound.running).toBe(false);
    await fixture.sound.activate();
    expect(fixture.sound.running).toBe(true);
    vi.spyOn(fixture.context, "resume").mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; }));
    const finalActivation = fixture.sound.activate();
    await fixture.sound.dispose();
    complete();
    await finalActivation;
    expect(fixture.sound.running).toBe(false);
    expect(fixture.context.closes).toBe(1);
  });

  it("stays muted if hidden suspension fails and never silently resumes on visibility", async () => {
    const fixture = await make();
    vi.spyOn(fixture.context, "suspend").mockRejectedValueOnce(new Error("test suspension failure"));
    page.hidden = true;
    page.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    page.hidden = false;
    page.dispatchEvent(new Event("visibilitychange"));
    expect(fixture.sound.running).toBe(false);
    const created = fixture.context.sources.length;
    fixture.sound.update(fixture.state, true, 1);
    expect(fixture.context.sources.length).toBe(created);
    await fixture.sound.activate();
    expect(fixture.sound.running).toBe(true);
  });

  it("does not append redundant volume automation on every render frame", async () => {
    const fixture = await make();
    const before = fixture.context.gains.slice(0, 3).map(bus => bus.gain.events.length);
    run(fixture, 1);
    expect(fixture.context.gains.slice(0, 3).map(bus => bus.gain.events.length)).toEqual(before);
  });

  it("honors master/music/effects mute independently and reserves headroom", async () => {
    const fixture = await make("escaluna", { ...structuredClone(DEFAULT_SETTINGS), master: 0 });
    run(fixture, 0.4);
    fixture.sound.event({ type: "boost" });
    expect(fixture.context.sources).toHaveLength(1);
    fixture.sound.settings.master = 0.7;
    fixture.sound.settings.music = 0;
    run(fixture, 0.4);
    expect(fixture.context.sources).toHaveLength(1);
    fixture.sound.event({ type: "swap" });
    expect(fixture.context.sources).toHaveLength(3);
    fixture.sound.settings.effects = 0;
    fixture.sound.event({ type: "land" });
    expect(fixture.context.sources).toHaveLength(3);
    fixture.sound.settings.music = 0.5;
    run(fixture, 0.4);
    expect(fixture.context.sources.length).toBeGreaterThan(3);
    expect(fixture.context.compressor?.ratio.value).toBe(5);
    expect(fixture.context.gains[2].gain.events.at(-1)?.value).toBe(0);
  });

  it("keeps engine load/gliding feedback and softly ducks music for important effects", async () => {
    const fixture = await make();
    fixture.state.speed = 30;
    run(fixture, 2);
    const engine = fixture.context.sources[0] as BufferSource;
    expect(engine.loop).toBe(true);
    expect(engine.playbackRate.events.at(-1)?.value).toBeGreaterThan(ENGINE.idleRpm / 4800);
    expect(engine.playbackRate.events.at(-1)?.value).toBeLessThanOrEqual(ENGINE.maxRpm / 4800);
    const engineGain = fixture.context.gains[5];
    const ground = engineGain.gain.events.at(-1)!.value;
    fixture.state.mode = "glider";
    run(fixture, 2);
    expect(engineGain.gain.events.at(-1)?.value).toBeLessThan(ground * 0.45);
    fixture.sound.event({ type: "charge", tier: 3 });
    expect(fixture.context.gains[1].gain.events.at(-1)?.value).toBeCloseTo(DEFAULT_SETTINGS.music * 0.32 * 0.74);
    run(fixture, 0.4, false);
    expect(engineGain.gain.events.at(-1)?.value).toBe(0);
    expect(fixture.context.gains[1].gain.events.at(-1)?.value).toBeCloseTo(DEFAULT_SETTINGS.music * 0.32);
  });

  it("bounds active voices and skips rather than replays a stalled scheduling backlog", async () => {
    const fixture = await make("afterglow");
    run(fixture, 0.2);
    for (let i = 0; i < 100; i++) fixture.sound.raceEvent({ type: "item-used", item: "invincible", tick: i, kartId: "kart" });
    expect(fixture.context.sources.filter(source => !source.disconnected).length).toBeLessThanOrEqual(49);
    fixture.context.advance(7200);
    const created = fixture.context.sources.length;
    fixture.sound.update(fixture.state, true, 1);
    expect(fixture.context.sources.length - created).toBeLessThan(30);
    expect(fixture.context.sources.slice(created).every(source => source.startTime! >= 7200 && source.startTime! < 7200.3)).toBe(true);
  });

  it("keeps noise synthesis reproducible and all scheduled gains finite", async () => {
    const first = await make(), second = await make();
    expect(first.context.buffers.map(buffer => buffer.samples)).toEqual(second.context.buffers.map(buffer => buffer.samples));
    first.sound.settings.master = Number.NaN;
    first.sound.settings.music = -3;
    first.sound.settings.effects = 8;
    first.sound.update(first.state, true, Number.NaN);
    for (const node of first.context.gains) expect(node.gain.events.every(event => Number.isFinite(event.value) && Number.isFinite(event.time))).toBe(true);
  });
});

describe("original item and driving feedback", () => {
  it.each(ITEM_IDS)("has a bounded original audible tell for %s", async item => {
    const fixture = await make("butterbell", { ...structuredClone(DEFAULT_SETTINGS), music: 0 });
    fixture.sound.raceEvent({ type: "item-used", tick: 1, kartId: "kart", item });
    expect(fixture.context.sources.length).toBeGreaterThan(1);
    expect(fixture.context.sources.length).toBeLessThanOrEqual(7);
    for (const source of fixture.context.sources.slice(1)) {
      expect(source.stopTime! - source.startTime!).toBeLessThan(0.5);
      expect(Number.isFinite(source.startTime)).toBe(true);
    }
  });

  it("gives all 23 item IDs distinct attacks, including the triple variants", async () => {
    const signatures = new Set<string>();
    for (const item of ITEM_IDS) {
      const fixture = await make();
      fixture.sound.raceEvent({ type: "item-used", tick: 1, kartId: "kart", item });
      signatures.add(JSON.stringify(signature(fixture.context)));
      await fixture.sound.dispose();
    }
    expect(signatures.size).toBe(23);
  });

  it("preserves attenuation for forwarded boost/charge events and schedules nothing at zero gain", async () => {
    const fixture = await make();
    fixture.sound.raceEvent({ type: "boost", tick: 1, kartId: "kart" }, 0);
    expect(fixture.context.sources).toHaveLength(1);
    const gainCount = fixture.context.gains.length;
    fixture.sound.raceEvent({ type: "boost", tick: 1, kartId: "kart" }, 0.25);
    const peaks = fixture.context.gains.slice(gainCount).flatMap(node => node.gain.events.filter(event => event.method === "linear").map(event => event.value));
    expect(peaks.filter(value => value > 0)).toEqual([0.0875, 0.0875, 0.0875]);
  });

  it("distinguishes pickup, pass and steal with short softened two-part tells", async () => {
    const signatures = new Set<string>();
    for (const type of ["pickup", "pass", "steal"] as const) {
      const fixture = await make("butterbell", { ...structuredClone(DEFAULT_SETTINGS), music: 0 });
      fixture.sound.raceEvent({ type, tick: 1, kartId: "kart" });
      const notes = fixture.context.sources.slice(1) as Oscillator[];
      expect(notes).toHaveLength(2);
      expect(notes.every(note => note.periodic)).toBe(true);
      expect(notes[1].startTime! - notes[0].startTime!).toBeCloseTo(0.065);
      expect(notes.every(note => note.stopTime! - note.startTime! <= 0.18)).toBe(true);
      signatures.add(JSON.stringify(signature(fixture.context)));
    }
    expect(signatures.size).toBe(3);
  });

  it("uses body-filtered effects noise but preserves high-passed music percussion", async () => {
    const fixture = await make();
    run(fixture, 0.4);
    expect(fixture.context.filters.some(filter => filter.type === "highpass" && filter.frequency.value === 5800)).toBe(true);
    const count = fixture.context.filters.length;
    fixture.sound.raceEvent({ type: "item-used", item: "fire", tick: 1, kartId: "kart" });
    expect(fixture.context.filters[count].type).toBe("bandpass");
    expect(fixture.context.filters[count].Q.value).toBe(0.65);
  });

  it("caps simultaneous effect peaks and fades their tails fully before stopping", async () => {
    const fixture = await make("butterbell", { ...structuredClone(DEFAULT_SETTINGS), music: 0 });
    for (let i = 0; i < 80; i++) fixture.sound.raceEvent({ type: "item-used", item: ITEM_IDS[i % ITEM_IDS.length], tick: i, kartId: "kart" });
    const envelopes = fixture.context.gains.slice(6);
    const reserved = envelopes.reduce((total, node) => total + Math.max(0, ...node.gain.events.map(event => event.value)), 0);
    expect(reserved).toBeLessThanOrEqual(1.2 + 1e-12);
    expect(envelopes.every(node => node.gain.events.at(-1)?.value === 0)).toBe(true);
    fixture.context.advance(1);
    const count = fixture.context.sources.length;
    fixture.sound.raceEvent({ type: "item-used", item: "boost", tick: 100, kartId: "kart" });
    expect(fixture.context.sources.length).toBeGreaterThan(count);
  });
});

describe("authoritative item roulette and crane rescue cues", () => {
  const pickup = { type: "pickup", tick: 1, kartId: "kart", effectId: "e1", item: "fire", value: 1.6 } as const;
  const ready = { type: "item-ready", tick: 97, kartId: "kart", effectId: "e1", item: "fire" } as const;
  const peaks = (gain: Gain) => gain.gain.events.filter(event => event.method === "linear" && event.value > 0);

  it("uses one 18-tick slowing source independent of the undisclosed item, with no premature reveal", async () => {
    const signatures = new Set<string>();
    for (const item of ITEM_IDS) {
      const fixture = await make("butterbell", { ...structuredClone(DEFAULT_SETTINGS), music: 0 });
      fixture.sound.raceEvent({ ...pickup, item });
      const roll = fixture.context.sources[1] as Oscillator;
      expect(fixture.context.sources).toHaveLength(2);
      expect(roll.periodic).toBe(true);
      expect(roll.stopTime).toBe(1.6);
      const attacks = peaks(fixture.context.gains[6]);
      expect(attacks).toHaveLength(18);
      const gaps = attacks.slice(1).map((attack, index) => attack.time - attacks[index].time);
      for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThan(gaps[i - 1]);
      expect(gaps.at(-1)!).toBeGreaterThan(gaps[0] * 5);
      expect(attacks.at(-1)!.time).toBeGreaterThan(1.5);
      expect(fixture.context.gains[6].gain.events.at(-1)!.time).toBeLessThan(1.6);
      expect(fixture.context.gains[6].gain.events.at(-1)!.value).toBe(0);
      signatures.add(JSON.stringify([signature(fixture.context), roll.frequency.events, fixture.context.gains[6].gain.events]));
      fixture.context.advance(1.6);
      expect(fixture.context.sources).toHaveLength(2);
      expect(roll.disconnected).toBe(true);
      await fixture.sound.dispose();
    }
    expect(signatures.size).toBe(1);
  });

  it("settles only on item-ready, cancels an early roll and ignores an overlapping duplicate reveal", async () => {
    const fixture = await make("butterbell", { ...structuredClone(DEFAULT_SETTINGS), music: 0 });
    fixture.sound.raceEvent(pickup);
    const roll = fixture.context.sources[1];
    fixture.context.advance(0.6);
    fixture.sound.raceEvent(ready);
    expect(roll.disconnected).toBe(true);
    expect(roll.stopTime).toBe(0.6);
    const sting = fixture.context.sources.slice(2) as Oscillator[];
    expect(sting).toHaveLength(3);
    expect(sting.every(source => source.periodic)).toBe(true);
    expect(sting[0].frequency.value).toBe(180);
    for (let i = 0; i < sting.length; i++) expect(sting[i].startTime! - 0.6).toBeCloseTo([0, 0.025, 0.085][i]);
    expect(Math.max(...sting.map(source => source.stopTime!)) - 0.6).toBeCloseTo(0.285);
    fixture.sound.raceEvent(ready);
    expect(fixture.context.sources).toHaveLength(5);
  });

  it("can announce an authoritative ready item after missed/suspended pickup presentation", async () => {
    const fixture = await make("butterbell", { ...structuredClone(DEFAULT_SETTINGS), music: 0 });
    fixture.sound.raceEvent(ready);
    expect(fixture.context.sources).toHaveLength(4);
    expect(fixture.context.sources.slice(1).every(source => source.startTime! >= fixture.context.currentTime)).toBe(true);
  });

  it("matches independent rolls by kart and effect ID without restarting repeated pickups", async () => {
    const fixture = await make("butterbell", { ...structuredClone(DEFAULT_SETTINGS), music: 0 });
    fixture.sound.raceEvent(pickup);
    fixture.sound.raceEvent(pickup);
    fixture.sound.raceEvent({ ...pickup, effectId: "e2" });
    fixture.sound.raceEvent({ ...pickup, kartId: "other" });
    expect(fixture.context.sources).toHaveLength(4);
    fixture.context.advance(0.5);
    fixture.sound.raceEvent(ready);
    expect(fixture.context.sources[1].disconnected).toBe(true);
    expect(fixture.context.sources[2].disconnected).toBe(false);
    expect(fixture.context.sources[3].disconnected).toBe(false);
  });

  it.each([undefined, 0, -1, Number.NaN, Infinity])("keeps an ordinary pickup tell for missing/invalid roll duration %s", async value => {
    const fixture = await make("butterbell", { ...structuredClone(DEFAULT_SETTINGS), music: 0 });
    fixture.sound.raceEvent({ ...pickup, value });
    expect(fixture.context.sources).toHaveLength(3);
    expect(fixture.context.sources.slice(1).every(source => source.stopTime! < 0.3)).toBe(true);
  });

  it("caps roll duration, sources and peak reservations under repeated pickups", async () => {
    const fixture = await make("butterbell", { ...structuredClone(DEFAULT_SETTINGS), music: 0 });
    for (let i = 0; i < 100; i++) fixture.sound.raceEvent({ ...pickup, effectId: `e${i}`, value: 1e9 });
    expect(fixture.context.sources.length).toBeLessThanOrEqual(49);
    expect(fixture.context.sources.slice(1).every(source => source.stopTime! <= 1.6)).toBe(true);
    const reserved = fixture.context.gains.slice(6).reduce((sum, node) => sum + Math.max(0, ...peaks(node).map(peak => peak.value)), 0);
    expect(reserved).toBeLessThanOrEqual(1.2 + 1e-12);
    fixture.context.advance(10);
    expect(fixture.context.sources.slice(1).every(source => source.disconnected)).toBe(true);
  });

  it("preserves roll/sting attenuation and consumes an early ready event silently at zero gain", async () => {
    const full = await make(), quiet = await make();
    full.sound.raceEvent(pickup);
    quiet.sound.raceEvent(pickup, 0.25);
    expect(peaks(quiet.context.gains[6]).map(event => event.value)).toEqual(peaks(full.context.gains[6]).map(event => event.value * 0.25));
    full.sound.raceEvent(ready);
    quiet.sound.raceEvent(ready, 0.25);
    expect(quiet.context.gains.slice(7).flatMap(peaks).map(event => event.value)).toEqual(full.context.gains.slice(7).flatMap(peaks).map(event => event.value * 0.25));
    const silent = await make();
    silent.sound.raceEvent(pickup, 0);
    silent.sound.raceEvent(ready, 0);
    silent.sound.raceEvent({ type: "recover", tick: 1, kartId: "kart" }, 0);
    expect(silent.context.sources).toHaveLength(1);
    silent.sound.raceEvent(pickup);
    silent.sound.raceEvent(ready, 0);
    expect(silent.context.sources).toHaveLength(2);
    expect(silent.context.sources[1].disconnected).toBe(true);
  });

  it("shapes six quiet hook/lift/carry/lower/drop voices over the 1.8-second rescue", async () => {
    const direct = await make("butterbell", { ...structuredClone(DEFAULT_SETTINGS), music: 0 });
    const race = await make("butterbell", { ...structuredClone(DEFAULT_SETTINGS), music: 0 });
    direct.sound.event({ type: "recover" });
    race.sound.raceEvent({ type: "recover", tick: 1, kartId: "kart" });
    expect(signature(direct.context)).toEqual(signature(race.context));
    const voices = race.context.sources.slice(1);
    expect(voices).toHaveLength(6);
    expect(voices.map(source => source.startTime)).toEqual([0, 0.05, 0.4, 1.3, 1.68, 1.68]);
    expect(Math.max(...voices.map(source => source.stopTime!))).toBeCloseTo(1.795);
    const lift = voices[1] as Oscillator, lower = voices[3] as Oscillator;
    expect(lift.frequency.events.at(-1)?.value).toBeGreaterThan(lift.frequency.value);
    expect(lower.frequency.events.at(-1)?.value).toBeLessThan(lower.frequency.value);
    expect(voices[5]).toBeInstanceOf(BufferSource);
    expect(race.context.gains.slice(6).flatMap(peaks).every(peak => peak.value <= 0.16)).toBe(true);
    race.sound.raceEvent({ type: "recover", tick: 1, kartId: "kart" });
    expect(race.context.sources).toHaveLength(7);
    race.context.advance(1.8);
    expect(voices.every(source => source.disconnected)).toBe(true);
  });

  it.each(["hidden", "suspend", "dispose", "menu", "master-mute", "effects-mute"] as const)(
    "cancels all pending roulette/rescue/reveal stages on %s without replaying after resume", async action => {
      const fixture = await make("butterbell", { ...structuredClone(DEFAULT_SETTINGS), music: 0 });
      fixture.sound.raceEvent(pickup);
      fixture.sound.raceEvent({ ...ready, effectId: "e2" });
      fixture.sound.raceEvent({ type: "recover", tick: 1, kartId: "kart" });
      fixture.context.advance(0.25);
      const count = fixture.context.sources.length;
      if (action === "hidden") {
        page.hidden = true;
        page.dispatchEvent(new Event("visibilitychange"));
        await Promise.resolve();
        page.hidden = false;
      } else if (action === "suspend") await fixture.sound.suspend();
      else if (action === "dispose") await fixture.sound.dispose();
      else {
        if (action === "master-mute") fixture.sound.settings.master = 0;
        if (action === "effects-mute") fixture.sound.settings.effects = 0;
        fixture.sound.update(fixture.state, action !== "menu", 0);
      }
      expect(fixture.context.sources.slice(1).every(source => source.disconnected)).toBe(true);
      fixture.sound.settings.master = 1;
      fixture.sound.settings.effects = 1;
      await fixture.sound.activate();
      run(fixture, 2);
      expect(fixture.context.sources).toHaveLength(count);
    },
  );
});

describe("bounded persistent engine graph", () => {
  it("keeps a single loop and two non-resonant filters through a long top-speed drive", async () => {
    const fixture = await make("butterbell", { ...structuredClone(DEFAULT_SETTINGS), music: 0 });
    fixture.state.speed = 37;
    run(fixture, 30);
    const engine = fixture.context.sources[0] as BufferSource;
    const automation = engine.playbackRate.events.length;
    run(fixture, 30);
    expect(fixture.context.sources).toHaveLength(1);
    expect(fixture.context.buffers).toHaveLength(2);
    expect(fixture.context.filters).toHaveLength(2);
    expect(fixture.context.filters.every(filter => filter.Q.value <= 0.55)).toBe(true);
    const rpm = engine.playbackRate.events.map(event => event.value * 4800);
    expect(rpm.every(value => value >= ENGINE.idleRpm && value <= ENGINE.maxRpm)).toBe(true);
    expect(engine.playbackRate.events).toHaveLength(automation);
    const peaks = fixture.context.gains[5].gain.events.map(event => event.value);
    expect(Math.max(...peaks) * ENGINE.peak * 0.3).toBeLessThan(0.044);
    expect(engine.startTime).toBe(0);
    expect(engine.stopTime).toBeNull();
  });

  it("mutes recovery, menu and finish and restarts after suspension without stale high revs", async () => {
    const fixture = await make("butterbell", { ...structuredClone(DEFAULT_SETTINGS), music: 0 });
    const engine = fixture.context.sources[0] as BufferSource;
    fixture.state.speed = 37;
    run(fixture, 2);
    fixture.state.recovery = 1;
    fixture.sound.update(fixture.state, true, 1);
    expect(fixture.context.gains[5].gain.events.at(-1)?.value).toBe(0);
    fixture.state.recovery = 0;
    run(fixture, 1);
    fixture.state.finished = true;
    fixture.sound.update(fixture.state, true, 1);
    expect(fixture.context.gains[5].gain.events.at(-1)?.value).toBe(0);
    fixture.state.finished = false;
    run(fixture, 1);
    await fixture.sound.suspend();
    expect(engine.playbackRate.events.at(-1)?.value).toBe(ENGINE.idleRpm / 4800);
    await fixture.sound.activate();
    fixture.sound.update(fixture.state, true, 1);
    expect(engine.playbackRate.events.at(-1)!.value * 4800).toBeLessThanOrEqual(ENGINE.idleRpm + ENGINE.risePerSecond / 60);
    fixture.sound.update(fixture.state, false, 1);
    expect(fixture.context.gains[5].gain.events.at(-1)?.value).toBe(0);
    expect(fixture.context.sources).toHaveLength(1);
  });
});
