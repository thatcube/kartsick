import {
  NETWORK_VERSION, ROOM_CODE_PATTERN, SIGNAL_MAX_BYTES, json, parseClientMessage, parseServerMessage,
  type Capability, type ClientMessage, type LobbyConfig, type Room, type RoomCommand, type ServerMessage,
} from "@kartsick/protocol";
import type { KartBuild } from "@kartsick/content";

export class NetworkError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "NetworkError"; }
}
export type RoomConnectionEvent =
  | { type: "room"; room: Room }
  | Extract<ServerMessage, { type: "signal" }>
  | { type: "status"; status: "connected" | "reconnecting" | "closed" }
  | { type: "error"; error: NetworkError };
export interface RoomOptions {
  names?: string[];
  /** Same-origin by default. Cross-origin must also be explicitly allowed by the signaling operator. */
  origin?: string;
  /** null opts out of storing the rotating credential; it is never put in invitation URLs. */
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
}
interface Pending { resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout>; sentAt: number; monotonic: number }
export class RoomConnection {
  room: Room | null = null;
  participantId: string | null = null;
  private socket: WebSocket | null = null;
  private readonly listeners = new Set<(event: RoomConnectionEvent) => void>();
  private readonly requests = new Map<string, Pending>();
  private counter = 0;
  private joinRequest: string | null = null;
  private credential: string | null;
  private readonly storage: RoomOptions["storage"];
  private readonly names: string[];
  private closed = false;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly key: string;
  readonly origin: string;
  private readyResolve: (() => void) | undefined;
  private readyReject: ((error: Error) => void) | undefined;
  private capability: Capability;
  private clockOffset = 0;
  private clockRtt: number | null = null;
  private persistenceError: NetworkError | null = null;
  private constructor(readonly code: string, options: RoomOptions) {
    this.origin = new URL(options.origin ?? location.origin).origin;
    this.names = options.names ?? [`Racer ${crypto.getRandomValues(new Uint16Array(1))[0] % 1000}`];
    this.key = `kartsick-room-v2:${this.origin}:${code}`;
    let storage = options.storage;
    if (storage === undefined) {
      try { storage = sessionStorage; }
      catch { storage = null; this.persistenceError = new NetworkError("resume-storage", "This browser blocks room credential storage; reconnect is limited to this open page."); }
    }
    this.storage = storage;
    this.credential = null;
    try { this.credential = this.storage?.getItem(this.key) ?? null; }
    catch { this.persistenceError = new NetworkError("resume-storage", "The saved room credential could not be read."); }
    this.capability = { visible: document.visibilityState === "visible", capable: typeof RTCPeerConnection === "function" };
  }
  static async create(options: RoomOptions = {}): Promise<RoomConnection> {
    const origin = new URL(options.origin ?? location.origin).origin;
    const response = await fetch(`${origin}/rooms`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: NETWORK_VERSION }),
      signal: AbortSignal.timeout(10_000),
    });
    const reader = response.body?.getReader();
    if (!reader) throw new NetworkError("invalid-response", "The room service returned an empty response.");
    let raw = "", bytes = 0;
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 1024) { await reader.cancel(); throw new NetworkError("invalid-response", "The room service exceeded its response size limit."); }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode();
    let value: unknown;
    try { value = json(raw, 1024); }
    catch { throw new NetworkError(`create-${response.status}`, "The room service is unavailable or returned an invalid response."); }
    if (!response.ok) throw new NetworkError(`create-${response.status}`,
      typeof value === "object" && value !== null && "error" in value && typeof value.error === "string" ? value.error : "Room creation failed.");
    if (typeof value !== "object" || value === null || !("version" in value) || value.version !== NETWORK_VERSION ||
      !("code" in value) || typeof value.code !== "string" || !ROOM_CODE_PATTERN.test(value.code))
      throw new NetworkError("invalid-response", "The room service returned an invalid invitation.");
    return RoomConnection.join(value.code, options);
  }
  static async join(invitation: string, options: RoomOptions = {}): Promise<RoomConnection> {
    let code = invitation.trim().toUpperCase();
    if (invitation.includes("://")) code = new URL(invitation).searchParams.get("room")?.toUpperCase() ?? "";
    if (!ROOM_CODE_PATTERN.test(code)) throw new NetworkError("invalid-code", "Enter the eight-character room code.");
    const result = new RoomConnection(code, options);
    try {
      await new Promise<void>((resolve, reject) => { result.readyResolve = resolve; result.readyReject = reject; result.open(); });
      await result.syncClock();
      return result;
    } catch (error) { result.close(); throw error; }
  }
  get connected(): boolean { return !this.closed && this.socket?.readyState === WebSocket.OPEN && this.participantId !== null; }
  get inviteUrl(): string { const url = new URL("/", this.origin); url.searchParams.set("room", this.code); return url.href; }
  get clock(): { offsetMs: number; rttMs: number | null } { return { offsetMs: this.clockOffset, rttMs: this.clockRtt }; }
  get resumePersistenceError(): NetworkError | null { return this.persistenceError; }
  serverNow(): number { return Date.now() + this.clockOffset; }
  syncClock(): Promise<void> { return this.request({ type: "ping" }); }
  subscribe(listener: (event: RoomConnectionEvent) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit(event: RoomConnectionEvent): void { for (const listener of this.listeners) listener(event); }
  private open(): void {
    if (this.closed) return;
    const url = new URL(`/rooms/${this.code}`, this.origin); url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(url); this.socket = ws;
    const deadline = setTimeout(() => ws.close(1000, "Signaling connection timed out."), 10_000);
    ws.onopen = () => {
      clearTimeout(deadline);
      void this.joinSocket().catch(error => {
        if (error instanceof NetworkError) this.emit({ type: "error", error });
        if (this.readyReject) this.readyReject(error instanceof Error ? error : new Error("Join failed."));
      });
    };
    ws.onmessage = event => {
      try {
        if (typeof event.data !== "string") throw new TypeError("Expected text.");
        this.message(parseServerMessage(json(event.data, SIGNAL_MAX_BYTES)));
      } catch {
        this.emit({ type: "error", error: new NetworkError("invalid-signal", "The signaling service sent malformed data.") });
        ws.close(1008, "Invalid signaling response.");
      }
    };
    ws.onerror = () => { /* onclose performs bounded retries without exposing network addresses. */ };
    ws.onclose = event => {
      clearTimeout(deadline);
      if (ws !== this.socket) return;
      this.socket = null;
      for (const request of this.requests.values()) { clearTimeout(request.timer); request.reject(new NetworkError("disconnected", "Signaling disconnected.")); }
      this.requests.clear();
      if (this.closed) return;
      if (event.reason === "Room expired.") {
        const error = new NetworkError("room-expired", "This room expired. Create a new invitation.");
        this.readyReject?.(error); this.emit({ type: "error", error }); this.close(); return;
      }
      if ([1008, 1009, 1013].includes(event.code))
        this.emit({ type: "error", error: new NetworkError("signaling-rejected", event.reason.slice(0, 240) || "The signaling service rejected this connection.") });
      this.emit({ type: "status", status: "reconnecting" });
      if (this.retry >= 7) {
        const error = new NetworkError("signaling-unavailable", "Room signaling is unavailable. Reopen the invitation to retry.");
        this.readyReject?.(error); this.emit({ type: "error", error }); this.close(); return;
      }
      const delay = Math.min(8000, 500 * 2 ** this.retry++);
      this.retryTimer = setTimeout(() => this.open(), delay);
    };
  }
  private async joinSocket(): Promise<void> {
    try { await this.request({ type: "join", names: this.names, resume: this.credential, capability: this.capability }); }
    catch (error) {
      if (error instanceof NetworkError && error.code === "resume-expired" && this.credential) {
        this.credential = null; this.saveCredential();
        this.emit({ type: "error", error });
        await this.request({ type: "join", names: this.names, resume: null, capability: this.capability });
      } else throw error;
    }
  }
  private saveCredential(): void {
    try { if (this.credential) this.storage?.setItem(this.key, this.credential); else this.storage?.removeItem(this.key); }
    catch {
      this.persistenceError = new NetworkError("resume-storage", "The browser cannot store the room credential. Reconnect works while this page stays open.");
      this.emit({ type: "error", error: this.persistenceError });
    }
  }
  private message(message: ServerMessage): void {
    if (message.type === "welcome") {
      this.participantId = message.participantId; this.credential = message.resume; this.saveCredential(); this.retry = 0;
      if (this.joinRequest) this.finish(this.joinRequest);
      this.joinRequest = null; this.room = message.room;
      this.emit({ type: "room", room: message.room }); this.emit({ type: "status", status: "connected" });
      this.readyResolve?.(); this.readyResolve = undefined; this.readyReject = undefined;
    } else if (message.type === "room") {
      if (this.room && message.room.revision <= this.room.revision) return;
      this.room = message.room; this.emit({ type: "room", room: message.room });
    } else if (message.type === "ok") this.finish(message.requestId);
    else if (message.type === "pong") {
      const pending = this.requests.get(message.requestId);
      if (pending) {
        this.clockRtt = Math.max(0, performance.now() - pending.monotonic);
        this.clockOffset = message.serverTime - (pending.sentAt + this.clockRtt / 2);
      }
      this.finish(message.requestId);
    }
    else if (message.type === "error") {
      const error = new NetworkError(message.code, message.message);
      if (message.requestId) this.finish(message.requestId, error);
      this.emit({ type: "error", error });
    } else this.emit(message);
  }
  private finish(id: string, error?: Error): void {
    const pending = this.requests.get(id); if (!pending) return;
    clearTimeout(pending.timer); this.requests.delete(id);
    if (error) pending.reject(error); else pending.resolve();
  }
  request(command: RoomCommand): Promise<void> {
    if (this.closed || this.socket?.readyState !== WebSocket.OPEN) return Promise.reject(new NetworkError("disconnected", "Room signaling is disconnected."));
    if (this.requests.size >= 96 || this.socket.bufferedAmount > 128 * 1024) return Promise.reject(new NetworkError("signaling-busy", "Room signaling is backpressured."));
    const requestId = String(++this.counter);
    let packet: ClientMessage;
    try { packet = parseClientMessage({ version: NETWORK_VERSION, requestId, ...command }); }
    catch { return Promise.reject(new NetworkError("invalid-command", "The room command did not pass validation.")); }
    if (command.type === "join") this.joinRequest = requestId;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => this.finish(requestId, new NetworkError("request-timeout", "The room service did not acknowledge this action.")), 8000);
      this.requests.set(requestId, { resolve, reject, timer, sentAt: Date.now(), monotonic: performance.now() });
      try { this.socket?.send(JSON.stringify(packet)); }
      catch { this.finish(requestId, new NetworkError("disconnected", "Room signaling disconnected.")); }
    });
  }
  updatePlayers(names: string[]): Promise<void> { return this.request({ type: "players", names }); }
  seat(playerId: string, seat: { kart: number; side: 0 | 1 } | null): Promise<void> { return this.request({ type: "seat", playerId, seat }); }
  ready(playerId: string, ready = true): Promise<void> { return this.request({ type: "ready", playerId, ready }); }
  setBuild(kart: number, build: KartBuild): Promise<void> { return this.request({ type: "build", kart, build }); }
  configure(config: LobbyConfig): Promise<void> { return this.request({ type: "config", config }); }
  start(): Promise<void> { return this.request({ type: "start" }); }
  returnToLobby(): Promise<void> { return this.request({ type: "return" }); }
  rematch(): Promise<void> { return this.request({ type: "rematch" }); }
  finishRound(command: Omit<Extract<RoomCommand, { type: "finish" }>, "type">): Promise<void> {
    return this.request({ type: "finish", ...command });
  }
  nextCourse(epoch: number, roundId: string): Promise<void> { return this.request({ type: "next-course", epoch, roundId }); }
  setCapability(capability: Capability): Promise<void> { this.capability = capability; return this.request({ type: "capability", capability }); }
  /** Exercise an ordinary signaling reconnect without giving up the 60-second reservation. */
  reconnect(): void { this.socket?.close(1000, "Reconnecting."); }
  async leave(): Promise<void> {
    try { await this.request({ type: "leave" }); }
    finally { this.credential = null; this.saveCredential(); this.close(); }
  }
  /** Closing without leave preserves server seats for 60 seconds. */
  close(): void {
    if (this.closed) return;
    this.closed = true; clearTimeout(this.retryTimer);
    for (const request of this.requests.values()) { clearTimeout(request.timer); request.reject(new NetworkError("closed", "Room connection closed.")); }
    this.requests.clear(); this.socket?.close(1000, "Page closed."); this.socket = null;
    this.emit({ type: "status", status: "closed" }); this.listeners.clear();
  }
}
