// Pako 2.1.0 (MIT AND Zlib); complete retained notices are in compression-license.ts.
import { deflate } from "pako";
import ZStream from "pako/lib/zlib/zstream.js";
import { inflate, inflateEnd, inflateInit2 } from "pako/lib/zlib/inflate.js";
import { DATA_MAX_BYTES, byteLength, fragmentPacket } from "@kartsick/protocol";

export const COMPRESSION_CODEC = "zlib-v1";
const MARKER = "kartsickCompression";
const Z_OK = 0, Z_STREAM_END = 1, Z_FINISH = 4, Z_BUF_ERROR = -5;
const MIN_COMPRESS_BYTES = 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export interface PreparedWireMessage {
  readonly messages: readonly string[];
  readonly bytes: number;
  readonly compressed: boolean;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
// Reject oversized UTF-8 without first allocating an oversized encoded byte array.
function boundedRaw(raw: string): number {
  if (raw.length > DATA_MAX_BYTES) throw new TypeError("Race payload exceeds 256 KiB.");
  if (/^[\x00-\x7f]*$/.test(raw)) return raw.length;
  let bytes = 0;
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code < 0x80) bytes++;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && raw.charCodeAt(i + 1) >= 0xdc00 && raw.charCodeAt(i + 1) <= 0xdfff) {
      bytes += 4; i++;
    } else bytes += 3;
    if (bytes > DATA_MAX_BYTES) throw new TypeError("Race payload exceeds 256 KiB.");
  }
  return bytes;
}
function validEpoch(epoch: number): void {
  if (!Number.isSafeInteger(epoch) || epoch < 0 || epoch > 0xffffffff) throw new TypeError("Invalid compression epoch.");
}
function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
function fromBase64(value: unknown): Uint8Array {
  if (typeof value !== "string" || value.length < 8 || value.length > Math.ceil(DATA_MAX_BYTES / 3) * 4 ||
    value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))
    throw new TypeError("Invalid compressed bytes.");
  const binary = atob(value);
  if (binary.length > DATA_MAX_BYTES) throw new TypeError("Compressed input exceeds its byte budget.");
  const result = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) result[i] = binary.charCodeAt(i);
  if (base64(result) !== value) throw new TypeError("Non-canonical compressed bytes.");
  return result;
}

/** Exactly one complete zlib stream, never an allocated/truncated output prefix. */
export function inflateBounded(compressed: Uint8Array, declaredBytes: number): Uint8Array {
  if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 1 || declaredBytes > DATA_MAX_BYTES ||
    compressed.length < 6 || compressed.length > DATA_MAX_BYTES) throw new TypeError("Invalid decompression bounds.");
  // All variable output allocation is decided BEFORE entering the inflater.
  const output = new Uint8Array(declaredBytes);
  const stream = new ZStream();
  if (inflateInit2(stream, 15) !== Z_OK) throw new TypeError("Could not initialize the bounded zlib decoder.");
  try {
    stream.input = compressed; stream.next_in = 0; stream.avail_in = compressed.length;
    stream.output = output; stream.next_out = 0; stream.avail_out = output.length;
    let status = inflate(stream, Z_FINISH);
    if ((status === Z_OK || status === Z_BUF_ERROR) && stream.total_out === declaredBytes) {
      // Permit only end-marker/checksum consumption; even one extra output byte is an error.
      stream.output = new Uint8Array(1); stream.next_out = 0; stream.avail_out = 1;
      status = inflate(stream, Z_FINISH);
    }
    if (status !== Z_STREAM_END || stream.total_out !== declaredBytes ||
      stream.avail_in !== 0 || stream.total_in !== compressed.length || stream.next_in !== compressed.length)
      throw new TypeError("Compressed state is truncated, corrupt, concatenated, or has a dishonest length.");
    return output;
  } finally { inflateEnd(stream); }
}

/** Returns null rather than expanding traffic for small/incompressible packets. */
export function compressMessage(raw: string, epoch: number): string | null {
  const length = boundedRaw(raw); validEpoch(epoch);
  if (length < MIN_COMPRESS_BYTES) return null;
  const bytes = encoder.encode(raw);
  const compressed = deflate(bytes, { level: 1, windowBits: 15, memLevel: 8 });
  if (compressed.length * 4 / 3 >= bytes.length) return null;
  const envelope = JSON.stringify({ kartsickCompression: 1, codec: COMPRESSION_CODEC, epoch, bytes: bytes.length, data: base64(compressed) });
  return envelope.length <= DATA_MAX_BYTES && envelope.length < bytes.length ? envelope : null;
}

/** Decode only after successful capability acceptance; old peers continue to use plain JSON. */
export function decompressMessage(raw: string, negotiated: boolean, epoch: number): string | null {
  boundedRaw(raw);
  // Plain packets avoid another JSON parse; the marker is reserved at the envelope root.
  if (!raw.includes(`"${MARKER}"`)) return raw;
  const value: unknown = JSON.parse(raw);
  if (!record(value) || !(MARKER in value)) return raw;
  if (value.kartsickCompression !== 1 || value.codec !== COMPRESSION_CODEC ||
    Object.keys(value).length !== 5 || !["kartsickCompression", "codec", "epoch", "bytes", "data"].every(k => Object.hasOwn(value, k)))
    throw new TypeError("Unsupported compression envelope.");
  if (typeof value.epoch !== "number") throw new TypeError("Invalid compression epoch.");
  validEpoch(value.epoch);
  if (value.epoch !== epoch) return null;
  if (!negotiated) throw new TypeError("Compression was not negotiated.");
  if (typeof value.bytes !== "number" || !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > DATA_MAX_BYTES)
    throw new TypeError("Invalid decompression bounds.");
  return decoder.decode(inflateBounded(fromBase64(value.data), value.bytes));
}

/** One serialization/compression/fragmentation per broadcast and selected codec, not per peer. */
export class BroadcastEncoding {
  private plain: PreparedWireMessage | null = null;
  private compressed: PreparedWireMessage | null | undefined;
  constructor(private readonly raw: string, private readonly epoch: number, private readonly compressible: boolean) {
    boundedRaw(raw); validEpoch(epoch);
  }
  forPeer(negotiated: boolean): PreparedWireMessage {
    if (negotiated && this.compressible) {
      if (this.compressed === undefined) {
        const raw = compressMessage(this.raw, this.epoch);
        this.compressed = raw === null ? null : this.prepare(raw, true);
      }
      if (this.compressed) return this.compressed;
    }
    return this.plain ??= this.prepare(this.raw, false);
  }
  private prepare(raw: string, compressed: boolean): PreparedWireMessage {
    const messages = fragmentPacket(raw, this.epoch);
    return { messages, bytes: messages.reduce((sum, message) => sum + byteLength(message), 0), compressed };
  }
}
