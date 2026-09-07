import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as pako from "pako";
import { DEFAULT_BUILD } from "@kartsick/content";
import { NEUTRAL_PLAYER, RACE_POINTS } from "@kartsick/simulation";
import {
  DEFAULT_LOBBY, NETWORK_VERSION, SNAPSHOT_BUFFER_LIMIT, CONTROL_BUFFER_LIMIT, WireAssembler,
  checkpointDigest, encodeDataPacket, parseDataPacket, type Room, type CheckpointRef,
} from "@kartsick/protocol";
import { KartsickNetwork, RoomConnection, type NetworkEvent } from "./index";
import { COMPRESSION_CODEC, compressMessage, decompressMessage } from "./compression";
import { COMPRESSION_CHANNEL } from "./compression-negotiation";
vi.mock("pako", { spy: true });

interface State { tick: number; body: string }
function decodeState(value: unknown): State | null {
  if (typeof value !== "object" || value === null || !("tick" in value) || typeof value.tick !== "number" ||
    !Number.isSafeInteger(value.tick) || !("body" in value) || typeof value.body !== "string" ||
    Object.keys(value).length !== 2 || value.body.length > 240_000) return null;
  return { tick: value.tick, body: value.body };
}
function terminalRoom(value: Room, checkpoint: CheckpointRef): Room {
  return { ...value, revision: value.revision + 1, phase: "results", startAt: null, pendingCheckpoint: null, checkpoint,
    lastRound: { roundId: value.round!.id, courseId: value.config.course,
      checkpoint: { id: checkpoint.id, tick: checkpoint.tick, digest: checkpoint.digest },
      results: value.round!.roster.map((racer, index) => ({
        ...racer, position: index + 1, finished: true, disconnected: false, time: 1 + index * .1,
        progress: 48, points: RACE_POINTS[index],
      })) } };
}
function decodeEvents(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 32) throw new TypeError();
  return value.map(event => { if (typeof event !== "string") throw new TypeError(); return event; });
}
function room(remoteCount = 1): Room {
  const participants = ["authority", ...Array.from({ length: remoteCount }, (_, i) => `remote-${i}`)].map(id => ({
    id, players: [{ id: `${id}-player`, name: id, ready: true }], connected: true, visible: true, capable: true, reservedUntil: null,
  }));
  return { version: NETWORK_VERSION, code: "ABCDEFGH", revision: 1, expiresAt: Date.now() + 60_000,
    phase: "racing", hostId: "authority", authorityId: "authority", epoch: 1, participants,
    karts: Array.from({ length: 8 }, (_, i) => ({ build: structuredClone(DEFAULT_BUILD), seats: [participants[i]?.players[0].id ?? null, null] })),
    config: { ...DEFAULT_LOBBY }, startAt: Date.now(), seed: 5, checkpoint: null, pendingCheckpoint: null, reason: null,
    round: { id: "round-one", courseId: "butterbell", roster: Array.from({ length: 8 }, (_, i) => ({
      id: `online-kart-${i + 1}`, name: participants[i]?.players[0].name ?? "Bot",
    })) }, series: null, lastRound: null };
}
class Socket {
  static OPEN = 1;
  static instance: Socket;
  static localId = "authority";
  static room: Room;
  readyState = 0; bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { Socket.instance = this; queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
  message(value: object): void { this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(value) })); }
  send(raw: string): void {
    const value: { type: string; requestId: string } = JSON.parse(raw);
    if (value.type === "join") this.message({ version: NETWORK_VERSION, type: "welcome", participantId: Socket.localId,
      resume: "a".repeat(64), resumed: false, room: Socket.room });
    else if (value.type === "ping") this.message({ version: NETWORK_VERSION, type: "pong", requestId: value.requestId, serverTime: Date.now() });
    else this.message({ version: NETWORK_VERSION, type: "ok", requestId: value.requestId });
  }
  close(code = 1000, reason = ""): void { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.({ code, reason }); }
}
class Channel {
  readyState = "connecting"; bufferedAmount = 0;
  readonly ordered: boolean; readonly maxRetransmits: number | null; readonly maxPacketLifeTime: number | null;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  onerror: ((event: RTCErrorEvent) => void) | null = null;
  sent: string[] = [];
  constructor(readonly label: string, options: RTCDataChannelInit = {}) {
    this.ordered = options.ordered ?? true; this.maxRetransmits = options.maxRetransmits ?? null;
    this.maxPacketLifeTime = options.maxPacketLifeTime ?? null;
  }
  open(): void { this.readyState = "open"; this.onopen?.(new Event("open")); }
  send(raw: string): void { if (this.readyState !== "open") throw new Error("Closed channel."); this.sent.push(raw); }
  receive(value: object | string): void { this.onmessage?.(new MessageEvent("message", { data: typeof value === "string" ? value : JSON.stringify(value) })); }
  close(): void { if (this.readyState === "closed") return; this.readyState = "closed"; this.onclose?.(new Event("close")); }
}
class PeerConnection {
  static instances: PeerConnection[] = [];
  static rejectProbe = false;
  channels: Channel[] = [];
  connectionState = "new"; signalingState = "stable";
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  onicecandidate: ((event: { candidate: RTCIceCandidate | null }) => void) | null = null;
  ondatachannel: ((event: { channel: Channel }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  constructor() { PeerConnection.instances.push(this); }
  createDataChannel(label: string, options: RTCDataChannelInit): Channel {
    if (PeerConnection.rejectProbe && label === COMPRESSION_CHANNEL) throw new Error("Optional channel unavailable.");
    const channel = new Channel(label, options); this.channels.push(channel); return channel;
  }
  async createOffer(): Promise<RTCSessionDescriptionInit> { return { type: "offer", sdp: "v=0" }; }
  async createAnswer(): Promise<RTCSessionDescriptionInit> { return { type: "answer", sdp: "v=0" }; }
  async setLocalDescription(value: RTCSessionDescriptionInit): Promise<void> { this.localDescription = value; this.signalingState = value.type === "offer" ? "have-local-offer" : "stable"; }
  async setRemoteDescription(value: RTCSessionDescriptionInit): Promise<void> { this.remoteDescription = value; this.signalingState = "stable"; }
  async addIceCandidate(): Promise<void> {}
  async getStats(): Promise<Map<string, never>> { return new Map<string, never>(); }
  close(): void { this.connectionState = "closed"; }
  channel(label: string): Channel { const result = this.channels.find(c => c.label === label); if (!result) throw new Error(`Missing ${label}.`); return result; }
  incoming(label: string, options: RTCDataChannelInit): Channel {
    const result = this.createDataChannel(label, options); this.ondatachannel?.({ channel: result }); return result;
  }
  open(): void { for (const channel of this.channels) channel.open(); }
}
const networks: KartsickNetwork<State, string[]>[] = [];
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
async function network(remoteCount = 1, localId = "authority") {
  Socket.room = room(remoteCount); Socket.localId = localId;
  const connection = await RoomConnection.join("ABCDEFGH", { origin: "https://example.invalid", storage: null, names: ["Test"] });
  const net = new KartsickNetwork<State, string[]>(connection, { decodeState, decodeEvent: decodeEvents, stunUrls: [],
    restoreCheckpoint() { /* This wiring test has no simulation to restore. */ } });
  networks.push(net);
  const events: NetworkEvent<State, string[]>[] = []; net.subscribe(event => events.push(event));
  await settle();
  return { net, events };
}
function accept(peer: PeerConnection): void {
  const probe = peer.channel(COMPRESSION_CHANNEL);
  const offer: { epoch: number; nonce: string } = JSON.parse(probe.sent[0]);
  probe.receive({ type: "accept", version: 1, codec: COMPRESSION_CODEC, epoch: offer.epoch, nonce: offer.nonce });
}
function decodeMessages(messages: readonly string[], compressed: boolean) {
  const assembler = new WireAssembler();
  const packets = [];
  for (const message of messages) {
    const assembled = assembler.accept(message, 1, true, 0);
    if (assembled !== null) {
      const payload = decompressMessage(assembled, compressed, 1);
      if (payload !== null) packets.push(parseDataPacket(payload, decodeState, decodeEvents));
    }
  }
  return packets;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
  vi.stubGlobal("WebSocket", Socket); vi.stubGlobal("RTCPeerConnection", PeerConnection);
  PeerConnection.instances = []; PeerConnection.rejectProbe = false; vi.mocked(pako.deflate).mockClear();
});
afterEach(() => {
  for (const net of networks.splice(0)) net.dispose();
  vi.unstubAllGlobals(); vi.useRealTimers(); vi.clearAllMocks();
});

describe("codec wiring through the current KartsickNetwork public APIs (mock channels, no browser launch)", () => {
  it("renews terminal-holder acknowledgment after signaling reconnect and epoch changes", async () => {
    const sent = vi.spyOn(Socket.prototype, "send");
    const { net } = await network(1, "remote-0");
    Socket.instance.message({ version: NETWORK_VERSION, type: "signal", from: "authority", epoch: 1, attempt: "terminal-holder",
      signal: { kind: "description", description: { type: "offer", sdp: "v=0" } } });
    await settle();
    const peer = PeerConnection.instances[0];
    peer.incoming("movement-v2", { ordered: false, maxRetransmits: 0 });
    const control = peer.incoming("control-v2", { ordered: true }); peer.open();
    const state = { tick: 200, body: "retained terminal state" };
    const checkpoint = { reference: { id: "terminal", tick: state.tick, acks: [],
      digest: await checkpointDigest(state.tick, [], state) }, state };
    Socket.room = terminalRoom(Socket.room, checkpoint.reference);
    Socket.instance.message({ version: NETWORK_VERSION, type: "room", room: Socket.room });
    control.receive(encodeDataPacket({ version: NETWORK_VERSION, type: "checkpoint", epoch: 1, checkpoint }));
    const acknowledgments = () => sent.mock.calls.map(([raw]) => JSON.parse(raw)).filter(command => command.type === "checkpoint-have");
    await vi.waitFor(() => expect(acknowledgments()).toHaveLength(1));
    net.connection.reconnect();
    await vi.advanceTimersByTimeAsync(501);
    await settle();
    expect(acknowledgments()).toHaveLength(2);
    Socket.room = { ...Socket.room, revision: Socket.room.revision + 1, epoch: 2 };
    Socket.instance.message({ version: NETWORK_VERSION, type: "room", room: Socket.room });
    await settle();
    expect(acknowledgments()).toHaveLength(3);
    expect(acknowledgments().at(-1)).toMatchObject({ epoch: 2, checkpointId: "terminal" });
    Socket.room = { ...Socket.room, revision: Socket.room.revision + 1 };
    Socket.instance.message({ version: NETWORK_VERSION, type: "room", room: Socket.room });
    await settle();
    expect(acknowledgments()).toHaveLength(3);
    sent.mockRestore();
  });
  it("keeps terminal publication immutable and preserves acknowledged departed players", async () => {
    const { net } = await network(2);
    for (const peer of PeerConnection.instances) peer.open();
    const state = { tick: 200, body: "completed state" }, acks = [{ playerId: "remote-1-player", sequence: 5 }];
    const checkpoint = await net.commitCheckpoint(state, state.tick, acks);
    Socket.room = terminalRoom(Socket.room, checkpoint.reference);
    Socket.room.participants = Socket.room.participants.filter(participant => participant.id !== "remote-1");
    Socket.room.karts[2].seats = [null, null];
    Socket.instance.message({ version: NETWORK_VERSION, type: "room", room: Socket.room });
    expect(net.isAuthority).toBe(true);
    expect(net.broadcastSnapshot(state, state.tick, acks).sent).toBe(1);
    expect(() => net.broadcastSnapshot(state, state.tick + 1, acks)).toThrow("committed tick");
    expect(() => net.broadcastSnapshot({ ...state, body: "changed" }, state.tick, acks)).toThrow("identical");
    expect(() => net.broadcastEvent(["too late"])).toThrow("active race");
    expect(net.sendInputs([{ playerId: "authority-player", tick: 201, input: { ...NEUTRAL_PLAYER, throttle: 1 } }])).toBe(false);
    await expect(net.commitCheckpoint(state, state.tick + 1, acks)).rejects.toThrow("active race");
  });
  it("accepts only the committed terminal snapshot hash after signaling reaches results", async () => {
    const { net, events } = await network(1, "remote-0");
    Socket.instance.message({ version: NETWORK_VERSION, type: "signal", from: "authority", epoch: 1, attempt: "attempt-terminal",
      signal: { kind: "description", description: { type: "offer", sdp: "v=0" } } });
    await settle();
    const peer = PeerConnection.instances[0];
    const movement = peer.incoming("movement-v2", { ordered: false, maxRetransmits: 0 });
    peer.incoming("control-v2", { ordered: true }); peer.open();
    const state = { tick: 200, body: "the accepted terminal state" };
    Socket.room = terminalRoom(Socket.room, { id: "terminal", tick: 200, acks: [],
      digest: await checkpointDigest(200, [], state) });
    Socket.instance.message({ version: NETWORK_VERSION, type: "room", room: Socket.room });
    const received = new Promise<void>(resolve => {
      const off = net.subscribe(event => { if (event.type === "snapshot") { off(); resolve(); } });
    });
    movement.receive(encodeDataPacket({ version: NETWORK_VERSION, type: "snapshot", epoch: 1, sequence: 1, tick: 200, acks: [], state }));
    await received;
    expect(events.filter(event => event.type === "snapshot")).toHaveLength(1);
    const rejected = new Promise<void>(resolve => {
      const off = net.subscribe(event => { if (event.type === "error" && event.error.message.includes("terminal snapshot")) { off(); resolve(); } });
    });
    movement.receive(encodeDataPacket({ version: NETWORK_VERSION, type: "snapshot", epoch: 1, sequence: 2, tick: 200,
      acks: [], state: { ...state, body: "changed after finish" } }));
    await rejected;
    expect(events.filter(event => event.type === "snapshot")).toHaveLength(1);
  });
  it("negotiates per peer, caches once per codec, stays synchronous, and leaves generic reliable events plain", async () => {
    const { net, events } = await network(3);
    for (const peer of PeerConnection.instances) peer.open();
    accept(PeerConnection.instances[0]); accept(PeerConnection.instances[1]);
    PeerConnection.instances[2].channel(COMPRESSION_CHANNEL).close();
    const state = { tick: 20, body: "complete state ".repeat(6000) };
    const result = net.broadcastSnapshot(state, 20, []);
    expect(result).toEqual({ sequence: 1, sent: 3, dropped: 0 });
    expect(vi.mocked(pako.deflate)).toHaveBeenCalledTimes(1);
    const [a, b, old] = PeerConnection.instances.map(p => p.channel("movement-v2").sent);
    expect(a).toEqual(b); expect(a).not.toEqual(old);
    expect(decodeMessages(a, true)[0]).toMatchObject({ type: "snapshot", state });
    expect(decodeMessages(old, false)[0]).toMatchObject({ type: "snapshot", state });
    net.broadcastEvent(["first", "second"]);
    for (const peer of PeerConnection.instances)
      expect(decodeMessages(peer.channel("control-v2").sent, false).at(-1)).toMatchObject({ type: "event", event: ["first", "second"] });
    expect(events.some(e => e.type === "error")).toBe(false);
  });
  it("preserves queued reliable ordering when control opens before movement", async () => {
    const { net } = await network();
    const peer = PeerConnection.instances[0], control = peer.channel("control-v2");
    peer.channel(COMPRESSION_CHANNEL).open(); accept(peer);
    const checkpoint = await net.commitCheckpoint({ tick: 1, body: "queued checkpoint ".repeat(1000) }, 1, []);
    net.broadcastEvent(["queued first"]);
    control.open();
    net.broadcastEvent(["queued second"]);
    expect(control.sent).toEqual([]);
    peer.channel("movement-v2").open();
    const packets = decodeMessages(control.sent, true);
    expect(packets[0]).toMatchObject({ type: "checkpoint", checkpoint });
    expect(packets.slice(1).map(p => p.type === "event" ? p.event : null)).toEqual([["queued first"], ["queued second"]]);
  });
  it("uses exact compressed complete checkpoints while uncompressed peers keep the old reliable contract", async () => {
    const { net } = await network(2);
    for (const peer of PeerConnection.instances) peer.open();
    accept(PeerConnection.instances[0]); PeerConnection.instances[1].channel(COMPRESSION_CHANNEL).close();
    const state = { tick: 99, body: "full checkpoint ".repeat(5000) };
    const checkpoint = await net.commitCheckpoint(state, 99, [{ playerId: "authority-player", sequence: 18 }]);
    expect(vi.mocked(pako.deflate)).toHaveBeenCalledTimes(1);
    for (let i = 0; i < PeerConnection.instances.length; i++) {
      const packet = decodeMessages(PeerConnection.instances[i].channel("control-v2").sent, i === 0)[0];
      expect(packet).toMatchObject({ type: "checkpoint", checkpoint });
    }
    expect(checkpoint.reference.digest).toBe(await checkpointDigest(99, checkpoint.reference.acks, state));
  });
  it("rejects unnegotiated/corrupt compression and fences old epochs before applying a snapshot", async () => {
    const { net, events } = await network(1, "remote-0");
    Socket.instance.message({ version: NETWORK_VERSION, type: "signal", from: "authority", epoch: 1, attempt: "attempt-one",
      signal: { kind: "description", description: { type: "offer", sdp: "v=0" } } });
    await settle();
    const peer = PeerConnection.instances[0];
    const movement = peer.incoming("movement-v2", { ordered: false, maxRetransmits: 0 });
    peer.incoming("control-v2", { ordered: true });
    const probe = peer.incoming(COMPRESSION_CHANNEL, { ordered: true }); peer.open();
    movement.receive(encodeDataPacket({ version: NETWORK_VERSION, type: "snapshot", epoch: 1, sequence: 1, tick: 1, acks: [],
      state: { tick: 1, body: "An uncompressed authority remains compatible." } }));
    expect(events.filter(e => e.type === "snapshot")).toHaveLength(1);
    const state = { tick: 2, body: "real state ".repeat(500) };
    const raw = encodeDataPacket({ version: NETWORK_VERSION, type: "snapshot", epoch: 1, sequence: 2, tick: 2, acks: [], state });
    const compressed = compressMessage(raw, 1)!;
    movement.receive(compressed);
    expect(events.some(e => e.type === "error" && e.error.message.includes("not negotiated"))).toBe(true);
    expect(events.filter(e => e.type === "snapshot")).toHaveLength(1);
    probe.receive({ type: "offer", version: 1, codec: COMPRESSION_CODEC, epoch: 1, nonce: crypto.randomUUID() });
    movement.receive(compressed);
    expect(events.filter(e => e.type === "snapshot")).toHaveLength(2);
    const corrupt: object = JSON.parse(compressed);
    movement.receive(JSON.stringify({ ...corrupt, bytes: 1 }));
    expect(events.filter(e => e.type === "snapshot")).toHaveLength(2);
    Socket.room = { ...Socket.room, revision: 2, epoch: 2 };
    Socket.instance.message({ version: NETWORK_VERSION, type: "room", room: Socket.room });
    movement.receive(compressed);
    expect(events.filter(e => e.type === "snapshot")).toHaveLength(2);
    expect(peer.connectionState).toBe("closed"); expect(probe.onmessage).toBeNull();
    net.dispose(); expect(vi.getTimerCount()).toBe(0);
  });
  it("retains movement/reliable backpressure caps and cleans every probe when recovery closes a peer", async () => {
    const { net, events } = await network(); const peer = PeerConnection.instances[0];
    peer.open(); accept(peer);
    peer.channel("movement-v2").bufferedAmount = SNAPSHOT_BUFFER_LIMIT;
    expect(net.broadcastSnapshot({ tick: 1, body: "full ".repeat(2000) }, 1, [])).toEqual({ sequence: 1, sent: 0, dropped: 1 });
    expect(vi.mocked(pako.deflate)).not.toHaveBeenCalled();
    peer.channel("control-v2").bufferedAmount = CONTROL_BUFFER_LIMIT;
    net.broadcastEvent(["cannot overtake the cap"]);
    expect(events.some(e => e.type === "error" && e.error.code === "control-backpressure")).toBe(true);
    expect(peer.connectionState).toBe("closed");
    for (const channel of peer.channels) { expect(channel.readyState).toBe("closed"); expect(channel.onmessage).toBeNull(); }
    net.dispose(); expect(vi.getTimerCount()).toBe(0);
  });
  it("does not turn optional-probe creation failure into a game connection failure", async () => {
    PeerConnection.rejectProbe = true;
    const { net, events } = await network(); const peer = PeerConnection.instances[0]; peer.open();
    expect(net.connectedPeers).toHaveLength(1);
    expect(net.broadcastSnapshot({ tick: 1, body: "plain compatibility ".repeat(1000) }, 1, []).sent).toBe(1);
    expect(vi.mocked(pako.deflate)).not.toHaveBeenCalled();
    expect(decodeMessages(peer.channel("movement-v2").sent, false)[0].type).toBe("snapshot");
    expect(events.some(e => e.type === "error")).toBe(false);
  });
});
