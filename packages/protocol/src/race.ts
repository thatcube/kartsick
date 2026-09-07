import type { DriverInput } from "@kartsick/simulation";
import { NETWORK_VERSION, parseAcks, parseCheckpointRef, type CheckpointRef, type InputAck } from "./rooms.ts";
import { array, boolean, byteLength, choice, id, json, keys, object, uint } from "./validation.ts";

export const DATA_MAX_BYTES = 262_144;
export const INPUT_QUEUE_LIMIT = 120;
export const SNAPSHOT_BUFFER_LIMIT = 512 * 1024;
export const CONTROL_BUFFER_LIMIT = 512 * 1024;
export interface NetworkInput extends DriverInput {
  useItem: boolean;
  throwDirection: -1 | 1;
  slide: -1 | 0 | 1;
  passItem: boolean;
}
export interface PlayerInputFrame { playerId: string; sequence: number; tick: number; input: NetworkInput }
export interface Checkpoint<T> { reference: CheckpointRef; state: T }
export type DataPacket<T, E> =
  | { version: typeof NETWORK_VERSION; type: "inputs"; epoch: number; frames: PlayerInputFrame[]; snapshotAck: number | null }
  | { version: typeof NETWORK_VERSION; type: "snapshot"; epoch: number; sequence: number; tick: number; acks: InputAck[]; state: T }
  | { version: typeof NETWORK_VERSION; type: "checkpoint"; epoch: number; checkpoint: Checkpoint<T> }
  | { version: typeof NETWORK_VERSION; type: "event"; epoch: number; sequence: number; event: E }
  | { version: typeof NETWORK_VERSION; type: "resync"; epoch: number };

export function parseNetworkInput(value: unknown): NetworkInput {
  const v = object(value); keys(v, ["throttle", "brake", "steer", "pitch", "drift", "swap", "recover", "useItem", "throwDirection", "slide", "passItem"]);
  function analog(n: unknown, min: number): number {
    if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > 1) throw new TypeError("Invalid analog input.");
    return n;
  }
  return { throttle: analog(v.throttle, 0), brake: analog(v.brake, 0), steer: analog(v.steer, -1), pitch: analog(v.pitch, -1),
    drift: boolean(v.drift), swap: boolean(v.swap), recover: boolean(v.recover), useItem: boolean(v.useItem),
    throwDirection: choice(v.throwDirection, [-1, 1]), slide: choice(v.slide, [-1, 0, 1]), passItem: boolean(v.passItem) };
}
export function parseInputFrame(value: unknown): PlayerInputFrame {
  const v = object(value); keys(v, ["playerId", "sequence", "tick", "input"]);
  return { playerId: id(v.playerId), sequence: uint(v.sequence), tick: uint(v.tick), input: parseNetworkInput(v.input) };
}
export function parseDataPacket<T, E>(raw: string, decodeState: (value: unknown) => T | null, decodeEvent: (value: unknown) => E): DataPacket<T, E> {
  const state = (value: unknown): T => {
    const result = decodeState(value);
    if (result === null || result === undefined) throw new TypeError("Application rejected the race state.");
    return result;
  };
  const v = object(json(raw, DATA_MAX_BYTES));
  if (v.version !== NETWORK_VERSION) throw new TypeError("Unsupported data version.");
  const base = { version: NETWORK_VERSION, epoch: uint(v.epoch) } as const;
  const fields = (...extra: string[]) => keys(v, ["version", "epoch", "type", ...extra]);
  switch (v.type) {
    case "inputs": fields("frames", "snapshotAck"); return { ...base, type: "inputs", frames: array(v.frames, 16, parseInputFrame), snapshotAck: v.snapshotAck === null ? null : uint(v.snapshotAck) };
    case "snapshot": fields("sequence", "tick", "acks", "state"); return { ...base, type: "snapshot", sequence: uint(v.sequence), tick: uint(v.tick), acks: parseAcks(v.acks), state: state(v.state) };
    case "checkpoint": {
      fields("checkpoint"); const c = object(v.checkpoint); keys(c, ["reference", "state"]);
      return { ...base, type: "checkpoint", checkpoint: { reference: parseCheckpointRef(c.reference), state: state(c.state) } };
    }
    case "event": fields("sequence", "event"); return { ...base, type: "event", sequence: uint(v.sequence), event: decodeEvent(v.event) };
    case "resync": fields(); return { ...base, type: "resync" };
    default: throw new TypeError("Unsupported data message.");
  }
}
export function encodeDataPacket<T, E>(packet: DataPacket<T, E>): string {
  const raw = JSON.stringify(packet);
  if (byteLength(raw) > DATA_MAX_BYTES) throw new TypeError("Race packet exceeds 256 KiB; reduce the snapshot.");
  return raw;
}
export async function checkpointDigest<T>(tick: number, acks: InputAck[], state: T): Promise<string> {
  const raw = JSON.stringify({ tick, acks, state });
  if (byteLength(raw) > DATA_MAX_BYTES) throw new TypeError("Checkpoint exceeds the transport limit.");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, "0")).join("");
}
