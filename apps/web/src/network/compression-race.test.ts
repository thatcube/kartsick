import { describe, expect, it } from "vitest";
import { cpus } from "node:os";
import { BODY_IDS, CHARACTER_IDS, GLIDER_IDS, WHEEL_IDS, normalizeBuild, type ItemId } from "@kartsick/content";
import {
  NEUTRAL_PLAYER, botInput, copyRace, createRace, grantItem, parseRaceState, stepRace,
  type PlayerInput, type RaceEntry, type RaceState,
} from "@kartsick/simulation";
import { NETWORK_VERSION, WireAssembler, checkpointDigest, encodeDataPacket, parseDataPacket, type DataPacket, type InputAck } from "@kartsick/protocol";
import { BroadcastEncoding, decompressMessage } from "./compression";

const EPOCH = 5;
const SAMPLE_COUNT = 90;
function raceSamples(): { active: RaceState[]; busy: RaceState[] } {
  let seed = 0x1234abcd;
  const playerId = () => Array.from({ length: 8 }, () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return ((seed >>> 0) & 0xffff).toString(16).padStart(4, "0");
  }).join("");
  const entries: RaceEntry[] = BODY_IDS.map((body, i) => ({
    id: `kart-${i}`, name: `Tandem crew ${i + 1}`, players: [playerId(), playerId()],
    build: normalizeBuild({ body, wheels: WHEEL_IDS[i % WHEEL_IDS.length], glider: GLIDER_IDS[i % GLIDER_IDS.length],
      characters: [CHARACTER_IDS[i], CHARACTER_IDS[(i + 1) % CHARACTER_IDS.length]] }),
  }));
  const race = createRace({ courseId: "butterbell", mode: "race", speedClass: 100, mirror: false, bots: false, difficulty: "normal", seed: 34567 }, entries);
  const pressureItems: ItemId[] = ["roadwork", "triple-slip", "triple-bounce", "triple-homing", "velvet", "doubles", "fire", "bomb"];
  const advance = (busy: boolean) => {
    const inputs: Record<string, PlayerInput> = {};
    for (let i = 0; i < race.karts.length; i++) {
      const kart = race.karts[i], driver = kart.state.driver, rear = driver === 0 ? 1 : 0;
      const driverId = kart.players[driver], rearId = kart.players[rear];
      if (!driverId || !rearId) throw new Error("All sixteen synthetic owners must remain present.");
      if (busy && race.tick % 24 === 0 && kart.held[rear] === null) grantItem(race, kart.id, pressureItems[i], rear);
      inputs[driverId] = { ...botInput(race, kart), useItem: false, swap: false };
      inputs[rearId] = { ...NEUTRAL_PLAYER, steer: Math.sin(race.tick / 9) > 0 ? 1 : -1,
        useItem: busy && race.tick % 12 === 0, throwDirection: i % 2 ? -1 : 1 };
    }
    stepRace(race, inputs);
  };
  const collect = (busy: boolean) => {
    const samples: RaceState[] = [];
    for (let i = 0; i < SAMPLE_COUNT * 3; i++) {
      advance(busy);
      if (i % 3 === 0) {
        const sample = copyRace(race);
        if (!parseRaceState(sample)) throw new Error("Simulation produced an invalid compression benchmark sample.");
        samples.push(sample);
      }
    }
    return samples;
  };
  for (let tick = 0; tick < 720; tick++) advance(false);
  const active = collect(false);
  for (let tick = 0; tick < 720; tick++) advance(true);
  return { active, busy: collect(true) };
}
const acknowledgments = (state: RaceState): InputAck[] => state.karts.flatMap(k => k.players.filter(p => p !== null)
  .map(playerId => ({ playerId, sequence: state.tick })));
const median = (numbers: number[]) => [...numbers].sort((a, b) => a - b)[Math.floor(numbers.length / 2)];
const p95 = (numbers: number[]) => [...numbers].sort((a, b) => a - b)[Math.floor(numbers.length * .95)];
const mean = (numbers: number[]) => numbers.reduce((a, b) => a + b, 0) / numbers.length;
const rounded = (number: number) => Math.round(number * 1000) / 1000;
async function decodeWire(messages: readonly string[], negotiated: boolean, reliable: boolean) {
  const assembler = new WireAssembler();
  let decoded: string | null = null;
  for (const message of messages) {
    const assembled = assembler.accept(message, EPOCH, !reliable, 0);
    if (assembled !== null) decoded = decompressMessage(assembled, negotiated, EPOCH);
  }
  if (decoded === null) throw new Error("Benchmark payload was not complete.");
  const parsed = parseDataPacket(decoded, parseRaceState, () => { throw new Error("No race-event decoder expected."); });
  if (parsed.type === "checkpoint" && await checkpointDigest(parsed.checkpoint.reference.tick, parsed.checkpoint.reference.acks, parsed.checkpoint.state) !== parsed.checkpoint.reference.digest)
    throw new Error("Checkpoint changed during compression.");
  return { decoded, parsed };
}

describe("actual active-race compression measurements", () => {
  it("measures evolving eight-kart/16-owner races, busy real item effects and complete committed checkpoints", async () => {
    const samples = raceSamples();
    expect(samples.active[0].phase).toBe("racing");
    expect(samples.active.at(-1)!.karts.some((k, i) => Math.hypot(k.state.x - samples.active[0].karts[i].state.x, k.state.z - samples.active[0].karts[i].state.z) > 20)).toBe(true);
    expect(Math.max(...samples.busy.map(s => s.items.length))).toBeGreaterThanOrEqual(20);
    const results: object[] = [];
    for (const kind of ["active-snapshot", "busy-snapshot", "busy-checkpoint"] as const) {
      const states = kind === "active-snapshot" ? samples.active : samples.busy;
      const plainBytes: number[] = [], compressedBytes: number[] = [], encodeTimes: number[] = [], decodeTimes: number[] = [];
      const plainEncodeTimes: number[] = [], plainDecodeTimes: number[] = [];
      for (let sample = -10; sample < states.length; sample++) {
        const state = states[Math.max(0, sample)], acks = acknowledgments(state);
        const started = performance.now();
        const packet: DataPacket<RaceState, never> = kind === "busy-checkpoint"
          ? { version: NETWORK_VERSION, type: "checkpoint", epoch: EPOCH, checkpoint: {
            reference: { id: `sample-${Math.max(0, sample)}`, tick: state.tick, digest: await checkpointDigest(state.tick, acks, state), acks }, state,
          } }
          : { version: NETWORK_VERSION, type: "snapshot", epoch: EPOCH, sequence: Math.max(0, sample), tick: state.tick, acks, state };
        const raw = encodeDataPacket(packet);
        const encoding = new BroadcastEncoding(raw, EPOCH, true);
        const compressed = encoding.forPeer(true);
        const encodeTime = performance.now() - started;
        const decodeStarted = performance.now();
        const { decoded, parsed } = await decodeWire(compressed.messages, true, kind === "busy-checkpoint");
        const decodeTime = performance.now() - decodeStarted;
        const plainStarted = performance.now();
        if (kind === "busy-checkpoint") await checkpointDigest(state.tick, acks, state);
        const plain = new BroadcastEncoding(encodeDataPacket(packet), EPOCH, false).forPeer(false);
        const plainEncodeTime = performance.now() - plainStarted;
        const plainDecodeStarted = performance.now();
        const plainDecoded = await decodeWire(plain.messages, false, kind === "busy-checkpoint");
        const plainDecodeTime = performance.now() - plainDecodeStarted;
        expect(decoded).toBe(raw);
        expect(plainDecoded.decoded).toBe(raw);
        expect(parsed).toEqual(JSON.parse(raw));
        expect(compressed.compressed).toBe(true);
        if (sample >= 0) {
          plainBytes.push(plain.bytes); compressedBytes.push(compressed.bytes); encodeTimes.push(encodeTime); decodeTimes.push(decodeTime);
          plainEncodeTimes.push(plainEncodeTime); plainDecodeTimes.push(plainDecodeTime);
        }
      }
      expect(mean(compressedBytes) / mean(plainBytes)).toBeLessThan(.6);
      results.push({
        scenario: kind, samples: states.length, maxLiveEffects: Math.max(...states.map(s => s.items.length)),
        plainMeanBytes: Math.round(mean(plainBytes)), compressedMeanBytes: Math.round(mean(compressedBytes)),
        reductionPercent: rounded(100 * (1 - mean(compressedBytes) / mean(plainBytes))),
        encodeMedianMs: rounded(median(encodeTimes)), encodeP95Ms: rounded(p95(encodeTimes)),
        decodeMedianMs: rounded(median(decodeTimes)), decodeP95Ms: rounded(p95(decodeTimes)),
        plainEncodeMedianMs: rounded(median(plainEncodeTimes)), plainEncodeP95Ms: rounded(p95(plainEncodeTimes)),
        plainDecodeMedianMs: rounded(median(plainDecodeTimes)), plainDecodeP95Ms: rounded(p95(plainDecodeTimes)),
      });
    }
    console.log(JSON.stringify({ compressionMeasurements: results, runtime: process.version, platform: process.platform,
      cpu: cpus()[0]?.model, note: "UTF-8 data-channel payload bytes, including existing envelopes/fragments. Synthetic 60 Hz pilots, 20 Hz snapshots. No browsers or network overhead included." }, null, 2));
  }, 30_000);
});
