import { COMPRESSION_CODEC } from "./compression";

export const COMPRESSION_CHANNEL = "kartsick-codec-v1";
const NEGOTIATION_TIMEOUT_MS = 3000;
const MAX_PROBE_BYTES = 512;
export interface CompressionProbe {
  readonly readyState: string;
  readonly bufferedAmount: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: Event) => void) | null;
  onerror: ((event: RTCErrorEvent) => void) | null;
  send(message: string): void;
  close(): void;
}

/** An optional reliable channel: legacy peers close its unknown label without parsing new game packets. */
export class CompressionNegotiation {
  private readonly nonce = crypto.randomUUID();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private offered = false;
  private finished = false;
  private disposed = false;
  private sendEnabled = false;
  private receiveEnabled = false;
  constructor(private readonly channel: CompressionProbe, private readonly epoch: number, private readonly initiator: boolean) {
    channel.onopen = () => this.open();
    channel.onmessage = event => this.message(event.data);
    channel.onclose = () => this.stop();
    channel.onerror = () => this.stop();
    if (channel.readyState === "open") this.open();
  }
  get canSend(): boolean { return !this.disposed && this.sendEnabled; }
  get canReceive(): boolean { return !this.disposed && this.receiveEnabled; }
  private open(): void {
    if (this.disposed || this.finished) return;
    this.timer ??= setTimeout(() => this.stop(), NEGOTIATION_TIMEOUT_MS);
    if (!this.initiator || this.offered) return;
    this.offered = true;
    this.send({ type: "offer", version: 1, codec: COMPRESSION_CODEC, epoch: this.epoch, nonce: this.nonce });
  }
  private message(raw: unknown): void {
    if (this.disposed || this.finished) return;
    try {
      if (typeof raw !== "string" || raw.length > MAX_PROBE_BYTES) throw new TypeError();
      const value: unknown = JSON.parse(raw);
      if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).length !== 5 ||
        Object.keys(value).some(key => !["type", "version", "codec", "epoch", "nonce"].includes(key)) ||
        !("type" in value) || !("version" in value) || value.version !== 1 ||
        !("codec" in value) || value.codec !== COMPRESSION_CODEC ||
        !("epoch" in value) || value.epoch !== this.epoch ||
        !("nonce" in value) || typeof value.nonce !== "string" || !/^[a-f0-9-]{36}$/.test(value.nonce))
        throw new TypeError();
      if (this.initiator) {
        if (!this.offered || value.type !== "accept" || value.nonce !== this.nonce) throw new TypeError();
        this.sendEnabled = true;
        this.finished = true; this.closeProbe();
      } else {
        if (value.type !== "offer") throw new TypeError();
        // Accept receiving BEFORE sending acceptance: game channels may overtake the probe response.
        this.receiveEnabled = true;
        if (!this.send({ type: "accept", version: 1, codec: COMPRESSION_CODEC, epoch: this.epoch, nonce: value.nonce })) return;
        // Let the initiator receive acceptance before it closes the probe; keep a bounded timeout.
        this.finished = true;
      }
    } catch { this.stop(); }
  }
  private send(message: object): boolean {
    try {
      if (this.channel.readyState !== "open" || this.channel.bufferedAmount > MAX_PROBE_BYTES) throw new Error();
      this.channel.send(JSON.stringify(message)); return true;
    } catch { this.stop(); return false; }
  }
  private stop(): void {
    this.finished = true; this.sendEnabled = false;
    this.closeProbe();
    // A sent acceptance can be followed by in-flight compressed packets; retain receive permission.
  }
  private closeProbe(): void {
    clearTimeout(this.timer); this.timer = undefined;
    this.channel.onopen = null; this.channel.onmessage = null; this.channel.onclose = null; this.channel.onerror = null;
    try { this.channel.close(); } catch { /* Optional probe may already be closed by a legacy peer. */ }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.receiveEnabled = false; this.stop();
  }
}
