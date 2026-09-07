// Minimal declarations for the pinned pako 2.1.0 low-level zlib interface.
// A caller-owned output buffer avoids the high-level inflater's growing result
// and automatic concatenated-stream processing.
declare module "pako/lib/zlib/zstream.js" {
  export default class ZStream {
    input: Uint8Array | null;
    output: Uint8Array | null;
    next_in: number;
    avail_in: number;
    total_in: number;
    next_out: number;
    avail_out: number;
    total_out: number;
  }
}
declare module "pako/lib/zlib/inflate.js" {
  import type ZStream from "pako/lib/zlib/zstream.js";
  export function inflateInit2(stream: ZStream, windowBits: number): number;
  export function inflate(stream: ZStream, flush: number): number;
  export function inflateEnd(stream: ZStream): number;
}
