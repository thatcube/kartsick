import { afterEach, describe, expect, it, vi } from "vitest";
import { COMPRESSION_CODEC, BroadcastEncoding, decompressMessage } from "./compression";
import { CompressionNegotiation, type CompressionProbe } from "./compression-negotiation";

class Probe implements CompressionProbe {
  readyState = "connecting";
  bufferedAmount = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  onerror: ((event: RTCErrorEvent) => void) | null = null;
  sent: string[] = [];
  closeCount = 0;
  send(raw: string): void { if (this.readyState !== "open") throw new Error("Closed."); this.sent.push(raw); }
  open(): void { this.readyState = "open"; this.onopen?.(new Event("open")); }
  receive(data: unknown): void { this.onmessage?.(new MessageEvent("message", { data })); }
  close(): void {
    if (this.readyState === "closed") return;
    this.readyState = "closed"; this.closeCount++; this.onclose?.(new Event("close"));
  }
}
afterEach(() => vi.useRealTimers());
describe("explicit optional codec negotiation", () => {
  it("sends compressed bytes only after acceptance, while receiving is ready before the acceptance can be overtaken", () => {
    vi.useFakeTimers();
    const sender = new Probe(), receiver = new Probe();
    const a = new CompressionNegotiation(sender, 2, true), b = new CompressionNegotiation(receiver, 2, false);
    try {
      sender.open(); receiver.open();
      expect(a.canSend).toBe(false); expect(b.canReceive).toBe(false);
      receiver.receive(sender.sent[0]);
      expect(b.canReceive).toBe(true); expect(a.canSend).toBe(false);
      sender.receive(receiver.sent[0]);
      expect(a.canSend).toBe(true);
      // The real shared RTC channel propagates the initiator's completed close to the receiver.
      receiver.close();
      const raw = JSON.stringify({ state: "full state ".repeat(300) });
      const encoded = new BroadcastEncoding(raw, 2, true).forPeer(a.canSend);
      expect(encoded.compressed).toBe(true);
      expect(decompressMessage(encoded.messages[0], b.canReceive, 2)).toBe(raw);
      expect(sender.readyState).toBe("closed"); expect(receiver.readyState).toBe("closed");
      expect(vi.getTimerCount()).toBe(0);
    } finally { a.dispose(); b.dispose(); }
    expect(a.canSend).toBe(false); expect(b.canReceive).toBe(false);
  });
  it("keeps legacy peers usable when they close the unknown probe, without putting capability frames on game channels", () => {
    const sender = new Probe(), session = new CompressionNegotiation(sender, 2, true);
    try {
      sender.open(); sender.close();
      expect(session.canSend).toBe(false);
      const raw = '{"version":2,"type":"resync","epoch":2}';
      expect(new BroadcastEncoding(raw, 2, true).forPeer(session.canSend)).toMatchObject({ compressed: false, messages: [raw] });
      expect(sender.sent).toHaveLength(1); expect(JSON.parse(sender.sent[0]).type).toBe("offer");
      expect(sender.onmessage).toBeNull();
    } finally { session.dispose(); }
  });
  it("starts its bounded timeout when the channel opens, not while ICE negotiation is still pending", () => {
    vi.useFakeTimers();
    const sender = new Probe(), session = new CompressionNegotiation(sender, 2, true);
    vi.advanceTimersByTime(20_000); expect(sender.readyState).toBe("connecting"); expect(vi.getTimerCount()).toBe(0);
    sender.open(); vi.advanceTimersByTime(3001);
    expect(session.canSend).toBe(false); expect(sender.readyState).toBe("closed"); expect(vi.getTimerCount()).toBe(0);
    session.dispose();
  });
  it.each(["wrong-epoch", "wrong-nonce", "wrong-codec", "truncated", "oversized", "unsolicited"])("declines %s probes quietly and remains plain", fault => {
    const sender = new Probe(), session = new CompressionNegotiation(sender, 3, true);
    try {
      if (fault !== "unsolicited") sender.open();
      const sent: { nonce: string } = sender.sent.length ? JSON.parse(sender.sent[0]) : { nonce: crypto.randomUUID() };
      const accept = { type: "accept", version: 1, codec: fault === "wrong-codec" ? "future-v99" : COMPRESSION_CODEC,
        epoch: fault === "wrong-epoch" ? 2 : 3, nonce: fault === "wrong-nonce" ? crypto.randomUUID() : sent.nonce };
      sender.receive(fault === "truncated" ? "{" : fault === "oversized" ? "x".repeat(513) : JSON.stringify(accept));
      expect(session.canSend).toBe(false); expect(sender.readyState).toBe("closed");
    } finally { session.dispose(); }
  });
  it("disposes callbacks and timers, never retaining capability across a new peer/epoch", () => {
    vi.useFakeTimers();
    const sender = new Probe(), session = new CompressionNegotiation(sender, 4, true);
    sender.open(); const offer: { nonce: string } = JSON.parse(sender.sent[0]);
    session.dispose(); sender.receive(JSON.stringify({ type: "accept", version: 1, codec: COMPRESSION_CODEC, epoch: 4, nonce: offer.nonce }));
    expect(session.canSend).toBe(false); expect(sender.onopen).toBeNull(); expect(sender.onclose).toBeNull();
    expect(sender.onmessage).toBeNull(); expect(sender.onerror).toBeNull(); expect(vi.getTimerCount()).toBe(0);
    const replacement = new Probe(), next = new CompressionNegotiation(replacement, 5, true);
    replacement.open(); replacement.receive(JSON.stringify({ type: "accept", version: 1, codec: COMPRESSION_CODEC, epoch: 4, nonce: offer.nonce }));
    expect(next.canSend).toBe(false); next.dispose();
  });
});
