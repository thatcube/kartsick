import { afterEach, describe, expect, it, vi } from "vitest";
import { constants, deflateSync, gzipSync } from "node:zlib";
import * as pako from "pako";
import { DATA_MAX_BYTES, NETWORK_VERSION, WireAssembler, WIRE_MAX_BYTES, parseDataPacket } from "@kartsick/protocol";
import { BroadcastEncoding, COMPRESSION_CODEC, compressMessage, decompressMessage, inflateBounded } from "./compression";
vi.mock("pako", { spy: true });

const encode = (value: string) => new TextEncoder().encode(value);
const text = (value: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(value);
const payload = () => JSON.stringify({ version: NETWORK_VERSION, type: "snapshot", epoch: 7, sequence: 2, tick: 200, acks: [],
  state: { repeated: "tandem racing ".repeat(3000), numbers: [0, .1, Math.PI, 1e-20, -1e100], unicode: "Bramble 🌲 — λ", nested: [true, false, null] } });
const envelope = (compressed: Uint8Array, bytes: number, epoch = 7) => JSON.stringify({
  kartsickCompression: 1, codec: COMPRESSION_CODEC, epoch, bytes, data: Buffer.from(compressed).toString("base64"),
});
afterEach(() => vi.restoreAllMocks());

describe("bounded lossless zlib wire codec", () => {
  it("roundtrips the exact original JSON bytes including full-precision numbers and Unicode", () => {
    const raw = payload(), compressed = compressMessage(raw, 7);
    expect(compressed).not.toBeNull();
    expect(decompressMessage(compressed!, true, 7)).toBe(raw);
    expect(decompressMessage(raw, false, 7)).toBe(raw);
    expect(() => decompressMessage(compressed!, false, 7)).toThrow("not negotiated");
    expect(decompressMessage(compressed!, false, 8)).toBeNull();
  });
  it.each([1, 2, 32768, 65535, 65536, DATA_MAX_BYTES])("accepts an exact %i-byte stream without requiring a growing output buffer", size => {
    const bytes = new Uint8Array(size).fill(97);
    expect(inflateBounded(deflateSync(bytes), size)).toEqual(bytes);
  });
  it.each([
    { level: 0 },
    { level: 9 },
    { strategy: constants.Z_FIXED },
  ])("accepts stored/fixed/dynamic DEFLATE blocks from independent Node zlib: %j", options => {
    const source = encode(payload());
    expect(inflateBounded(deflateSync(source, options), source.length)).toEqual(source);
  });
  it("rejects dishonest lengths, stream truncation at every boundary, corruption, trailing bytes and concatenated streams", () => {
    const source = encode('{"a":"complete JSON"}'), compressed = deflateSync(source);
    for (const length of [0, -1, 1.5, NaN, Infinity, DATA_MAX_BYTES + 1, Number.MAX_SAFE_INTEGER, source.length - 1, source.length + 1])
      expect(() => inflateBounded(compressed, length), String(length)).toThrow();
    for (let end = 0; end < compressed.length; end++) expect(() => inflateBounded(compressed.subarray(0, end), source.length)).toThrow();
    const corrupt = compressed.slice(); corrupt[corrupt.length - 1] ^= 1;
    expect(() => inflateBounded(corrupt, source.length)).toThrow();
    expect(() => inflateBounded(Buffer.concat([compressed, Buffer.from([0])]), source.length)).toThrow();
    expect(() => inflateBounded(Buffer.concat([compressed, deflateSync(new Uint8Array())]), source.length)).toThrow();
    expect(() => inflateBounded(Buffer.concat([compressed, compressed]), source.length * 2)).toThrow();
    expect(() => inflateBounded(gzipSync(source), source.length)).toThrow();
  });
  it("never accepts a truncated valid JSON prefix from a compressed amplification payload", () => {
    const prefix = '{"version":2,"type":"resync","epoch":7}';
    const bomb = deflateSync(encode(prefix + " ".repeat(8 * 1024 * 1024)));
    expect(bomb.length).toBeLessThan(DATA_MAX_BYTES);
    expect(() => decompressMessage(envelope(bomb, prefix.length), true, 7)).toThrow();
    expect(() => decompressMessage(envelope(bomb, DATA_MAX_BYTES), true, 7)).toThrow();
    expect(() => decompressMessage(envelope(bomb, 8 * 1024 * 1024), true, 7)).toThrow();
  });
  it("bounds allocation before decoding a bomb and refuses an oversized declared length without allocating output", () => {
    const bomb = deflateSync(new Uint8Array(16 * 1024 * 1024).fill(97));
    const allocations: number[] = [];
    const observe = <T extends typeof Uint8Array | typeof Uint16Array | typeof Int32Array>(constructor: T): T =>
      new Proxy(constructor, { construct(target, args, newTarget) {
        const result: unknown = Reflect.construct(target, args, newTarget);
        if (!ArrayBuffer.isView(result)) throw new TypeError("Expected a typed array.");
        allocations.push(result.byteLength);
        return result;
      } });
    vi.stubGlobal("Uint8Array", observe(Uint8Array)); vi.stubGlobal("Uint16Array", observe(Uint16Array)); vi.stubGlobal("Int32Array", observe(Int32Array));
    try {
      expect(() => inflateBounded(bomb, DATA_MAX_BYTES + 1)).toThrow();
      expect(allocations).toEqual([]);
      expect(() => decompressMessage('{"kartsickCompression":1,"data":"' + "💥".repeat(70_000) + '"}', true, 7)).toThrow();
      expect(allocations).toEqual([]);
      expect(() => inflateBounded(bomb, DATA_MAX_BYTES)).toThrow();
      expect(Math.max(...allocations)).toBeLessThanOrEqual(DATA_MAX_BYTES);
      expect(allocations.reduce((a, b) => a + b, 0)).toBeLessThan(DATA_MAX_BYTES + 70_000);
    } finally { vi.unstubAllGlobals(); }
  });
  it("rejects unsupported envelopes, malformed base64 and UTF-8, without allowing generic events to bypass their decoder", () => {
    const compressed = compressMessage(payload(), 7)!;
    const parsed: object = JSON.parse(compressed);
    for (const change of [{ kartsickCompression: 2 }, { codec: "gzip" }, { epoch: -1 }, { bytes: DATA_MAX_BYTES + 1 },
      { bytes: 0 }, { data: "!!!!" }, { data: "AAAA====" }, { unexpected: true }])
      expect(() => decompressMessage(JSON.stringify({ ...parsed, ...change }), true, 7)).toThrow();
    const invalidUtf8 = Uint8Array.from([0xff, 0xff, 0xff]);
    expect(() => decompressMessage(envelope(deflateSync(invalidUtf8), 3), true, 7)).toThrow();
    const event = JSON.stringify({ version: NETWORK_VERSION, type: "event", epoch: 7, sequence: 1,
      event: { kartsickCompression: "ordinary event property" } });
    expect(decompressMessage(event, false, 7)).toBe(event);
    expect(parseDataPacket(event, () => null, value => value).type).toBe("event");
  });
  it("keeps small/incompressible or legacy messages plain and caches each codec once for a broadcast", () => {
    const spy = vi.mocked(pako.deflate); spy.mockClear();
    const plan = new BroadcastEncoding(payload(), 7, true);
    const plain = plan.forPeer(false);
    expect(spy).not.toHaveBeenCalled();
    expect(plain.compressed).toBe(false);
    const compressed = plan.forPeer(true);
    expect(compressed.compressed).toBe(true);
    for (let peer = 0; peer < 15; peer++) {
      expect(plan.forPeer(true)).toBe(compressed); expect(plan.forPeer(false)).toBe(plain);
    }
    expect(spy).toHaveBeenCalledTimes(1);
    const event = new BroadcastEncoding(payload(), 7, false);
    expect(event.forPeer(true).compressed).toBe(false);
    expect(compressMessage("{}", 7)).toBeNull();
    let seed = 9;
    const random = Array.from({ length: 2000 }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return String.fromCharCode(33 + seed % 90); }).join("");
    expect(compressMessage(random, 7)).toBeNull();
    expect(() => new BroadcastEncoding("x".repeat(DATA_MAX_BYTES + 1), 7, true)).toThrow();
  });
  it("uses the existing bounded fragment protocol for large compressed messages and treats each snapshot independently", () => {
    let seed = 11;
    const random = Array.from({ length: 20_000 }, () => {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      return (seed >>> 0).toString(16).padStart(8, "0");
    }).join("");
    const first = new BroadcastEncoding(JSON.stringify({ tick: 1, random }), 7, true).forPeer(true);
    const secondRaw = JSON.stringify({ tick: 2, random: random.slice(3) });
    const second = new BroadcastEncoding(secondRaw, 7, true).forPeer(true);
    expect(first.compressed).toBe(true); expect(first.messages.length).toBeGreaterThan(1);
    expect(first.messages.every(message => encode(message).length <= WIRE_MAX_BYTES)).toBe(true);
    const assembler = new WireAssembler();
    for (const piece of first.messages.slice(1)) expect(assembler.accept(piece, 7, true, 0)).toBeNull();
    let complete: string | null = null;
    for (const piece of [...second.messages].reverse()) {
      const value = assembler.accept(piece, 7, true, 1); if (value !== null) complete = value;
    }
    expect(decompressMessage(complete!, true, 7)).toBe(secondRaw);
    assembler.clear();
    expect(assembler.accept(first.messages[0], 8, true, 2)).toBeNull();
  });
  it("does not accept a valid JSON prefix followed by corrupt compressed data or another stream", () => {
    const prefix = encode('{"valid":true}'), first = deflateSync(prefix);
    const remainder = deflateSync(encode('{"extra":true}')).subarray(0, 7);
    expect(() => inflateBounded(Buffer.concat([first, remainder]), prefix.length)).toThrow();
    expect(text(inflateBounded(first, prefix.length))).toBe(text(prefix));
  });
});
