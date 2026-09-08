import { test, expect } from "./fixture";
import { writeFile } from "node:fs/promises";
import { COURSE_IDS, ITEM_IDS } from "@kartsick/content";
import type { Soundtrack } from "../../apps/web/src/audio";
import type { DEFAULT_SETTINGS } from "../../apps/web/src/storage";
import type { createKart } from "@kartsick/simulation";

const audioUrl = "/@fs" + new URL("../../apps/web/src/audio.ts", import.meta.url).pathname;
const storageUrl = "/@fs" + new URL("../../apps/web/src/storage.ts", import.meta.url).pathname;
const physicsUrl = "/@fs" + new URL("../../packages/simulation/src/physics.ts", import.meta.url).pathname;

test("native Web Audio plays bounded engine, roulette, rescue and full-volume item/music mixes", async ({ page }, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/__network-test");
  const result = await page.evaluate(async ({ audioUrl, storageUrl, physicsUrl, items, courses }) => {
    const NativeContext = window.AudioContext;
    const contexts: AudioContext[] = [];
    const meters: AnalyserNode[] = [];
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) { super(options); contexts.push(this); }
      override createDynamicsCompressor(): DynamicsCompressorNode {
        const limiter = super.createDynamicsCompressor();
        const meter = this.createAnalyser(), silentTap = this.createGain();
        meter.fftSize = 2048;
        silentTap.gain.value = 0;
        limiter.connect(meter).connect(silentTap).connect(this.destination);
        meters.push(meter);
        return limiter;
      }
    };
    let sound: Soundtrack | undefined;
    try {
      const audio: { Soundtrack: typeof Soundtrack } = await import(/* @vite-ignore */ audioUrl);
      const storage: { DEFAULT_SETTINGS: typeof DEFAULT_SETTINGS } = await import(/* @vite-ignore */ storageUrl);
      const physics: { createKart: typeof createKart } = await import(/* @vite-ignore */ physicsUrl);
      const settings = { ...storage.DEFAULT_SETTINGS, master: 1, music: 1, effects: 1 };
      sound = new audio.Soundtrack(settings);
      await sound.activate();
      if (!sound.running || meters.length !== 1) throw new Error("Native browser audio did not activate.");
      const state = physics.createKart(), samples = new Float32Array(2048);
      let peak = 0, squares = 0, count = 0, clipped = 0, audibleFrames = 0, lastBeat = -1;
      const started = performance.now();
      while (performance.now() - started < 24_000) {
        const elapsed = (performance.now() - started) / 1000;
        const tick = Math.floor(elapsed * 60), beat = Math.floor(elapsed * 5);
        state.tick = tick;
        state.speed = Math.min(42, elapsed * 8);
        state.boost = elapsed > 15 ? 1 : 0;
        state.mode = elapsed > 18 && elapsed < 21 ? "glider" : "ground";
        state.lap = Math.min(3, 1 + Math.floor(elapsed / 8));
        sound.setCourse(courses[Math.min(courses.length - 1, Math.floor(elapsed / 4))]);
        if (beat !== lastBeat) {
          lastBeat = beat;
          for (let kart = 0; kart < 4; kart++) {
            const kartId = `kart-${kart}`, effectId = `e${beat * 4 + kart + 1}`, item = items[(beat + kart) % items.length];
            sound.raceEvent({ type: "item-used", tick, kartId, effectId, item });
            if (beat % 12 === 0) sound.raceEvent({ type: "pickup", tick, kartId, effectId, item, value: 1.6 });
            if (beat % 12 === 8) sound.raceEvent({ type: "item-ready", tick, kartId, effectId: `e${(beat - 8) * 4 + kart + 1}`, item });
            if (beat % 20 === 0) sound.raceEvent({ type: "recover", tick, kartId });
          }
        }
        sound.update(state, true, 1);
        meters[0].getFloatTimeDomainData(samples);
        let framePeak = 0;
        for (const value of samples) {
          if (!Number.isFinite(value)) throw new Error("Native mix produced nonfinite PCM.");
          const amplitude = Math.abs(value);
          framePeak = Math.max(framePeak, amplitude);
          squares += value * value;
          if (amplitude >= 1) clipped++;
        }
        peak = Math.max(peak, framePeak);
        if (framePeak > .001) audibleFrames++;
        count += samples.length;
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
      await sound.suspend();
      const suspended = contexts.every(context => context.state === "suspended");
      await sound.activate();
      const resumed = sound.running;
      await sound.dispose();
      return { peak, rms: Math.sqrt(squares / count), clipped, audibleFrames, samples: count,
        suspended, resumed, closed: contexts.every(context => context.state === "closed") };
    } finally {
      try { await sound?.dispose(); }
      finally { window.AudioContext = NativeContext; }
    }
  }, { audioUrl, storageUrl, physicsUrl, items: [...ITEM_IDS], courses: [...COURSE_IDS] });
  const evidence = info.outputPath("native-mix-levels.json");
  await writeFile(evidence, JSON.stringify(result, null, 2));
  await info.attach("native-mix-levels", { path: evidence, contentType: "application/json" });
  expect(result.peak).toBeGreaterThan(.02);
  expect(result.peak).toBeLessThan(.95);
  expect(result.clipped).toBe(0);
  expect(result.audibleFrames).toBeGreaterThan(100);
  expect(result.suspended && result.resumed && result.closed).toBe(true);
  expect(errors).toEqual([]);
});
