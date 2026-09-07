import { DATA_MAX_BYTES } from "./race.ts";
import { NETWORK_VERSION } from "./rooms.ts";
import { byteLength, id, json, keys, object, text, uint } from "./validation.ts";

export const WIRE_MAX_BYTES = 65_536;
const CHUNK_BYTES = 32_768;
interface Assembly { epoch: number; total: number; bytes: number; chunks: Map<number, Uint8Array>; expires: number; movement: boolean }

/** SCTP-safe fragments: lossy snapshot loss discards the whole snapshot, never partially applies state. */
export function fragmentPacket(raw: string, epoch: number): string[] {
  const bytes = new TextEncoder().encode(raw);
  if (bytes.length > DATA_MAX_BYTES) throw new TypeError("Race payload exceeds its byte budget.");
  if (bytes.length <= WIRE_MAX_BYTES) return [raw];
  const messageId = crypto.randomUUID(), total = Math.ceil(bytes.length / CHUNK_BYTES);
  return Array.from({ length: total }, (_, part) => {
    let binary = "";
    for (const byte of bytes.subarray(part * CHUNK_BYTES, (part + 1) * CHUNK_BYTES)) binary += String.fromCharCode(byte);
    return JSON.stringify({ version: NETWORK_VERSION, type: "fragment", epoch, id: messageId, part, total, bytes: bytes.length, data: btoa(binary) });
  });
}

export class WireAssembler {
  private readonly messages = new Map<string, Assembly>();
  accept(raw: string, epoch: number, movement: boolean, now: number): string | null {
    const v = object(json(raw, WIRE_MAX_BYTES));
    if (v.type !== "fragment") return raw;
    keys(v, ["version", "type", "epoch", "id", "part", "total", "bytes", "data"]);
    if (v.version !== NETWORK_VERSION) throw new TypeError("Unsupported fragment version.");
    if (uint(v.epoch) !== epoch) return null;
    const messageId = id(v.id), part = uint(v.part, 7), total = uint(v.total, 8), bytes = uint(v.bytes, DATA_MAX_BYTES);
    const data = text(v.data, 43_692, /^[A-Za-z0-9+/]*={0,2}$/);
    if (!total || part >= total || bytes <= WIRE_MAX_BYTES || total !== Math.ceil(bytes / CHUNK_BYTES)) throw new TypeError("Invalid fragment dimensions.");
    for (const [key, value] of this.messages) if (value.expires <= now || value.epoch !== epoch) this.messages.delete(key);
    let assembly = this.messages.get(messageId);
    if (!assembly) {
      // Two unfinished movement snapshots and two reliable messages, never an unbounded chunk backlog.
      const sameChannel = [...this.messages].filter(([, a]) => a.movement === movement);
      if (sameChannel.length >= 2) {
        if (!movement) throw new TypeError("Too many unfinished reliable messages.");
        this.messages.delete(sameChannel[0][0]);
      }
      assembly = { epoch, total, bytes, chunks: new Map(), expires: now + (movement ? 2000 : 15_000), movement };
      this.messages.set(messageId, assembly);
    }
    if (assembly.total !== total || assembly.bytes !== bytes || assembly.movement !== movement) throw new TypeError("Conflicting fragment metadata.");
    const binary = atob(data);
    if (binary.length !== Math.min(CHUNK_BYTES, bytes - part * CHUNK_BYTES)) throw new TypeError("Invalid fragment length.");
    const chunk = Uint8Array.from(binary, character => character.charCodeAt(0));
    const previous = assembly.chunks.get(part);
    if (previous && previous.some((byte, i) => byte !== chunk[i])) throw new TypeError("Conflicting duplicate fragment.");
    assembly.chunks.set(part, chunk);
    if (assembly.chunks.size !== total) return null;
    const result = new Uint8Array(bytes);
    for (const [index, value] of assembly.chunks) result.set(value, index * CHUNK_BYTES);
    this.messages.delete(messageId);
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(result);
    if (byteLength(decoded) !== bytes) throw new TypeError("Invalid UTF-8 payload.");
    return decoded;
  }
  clear(): void { this.messages.clear(); }
}
