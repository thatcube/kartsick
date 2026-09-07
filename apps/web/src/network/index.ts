import {
  CONTROL_BUFFER_LIMIT, WIRE_MAX_BYTES, NETWORK_VERSION, SNAPSHOT_BUFFER_LIMIT, WireAssembler, checkpointDigest, encodeDataPacket,
  byteLength, fragmentPacket, parseAcks, parseDataPacket, parseInputFrame, sequenceIsNewer,
  type Checkpoint, type DataPacket, type InputAck, type NetworkInput, type PeerSignal, type PlayerInputFrame, type Room,
} from "@kartsick/protocol";
import { InputQueue } from "./input-queue";
import { NetworkError, RoomConnection, type RoomConnectionEvent, type RoomOptions } from "./room-connection";
export { InputQueue, NetworkError, RoomConnection };
export type { RoomOptions };
export type NetworkEvent<T, E> =
  | { type: "room"; room: Room }
  | { type: "error"; error: NetworkError }
  | { type: "signaling"; status: "connected" | "reconnecting" | "closed" }
  | { type: "peer"; participantId: string; status: "connecting" | "connected" | "closed"; attempt: number }
  | { type: "quality"; participantId: string; rttMs: number | null; bytesSent: number; bytesReceived: number; route: "direct" | "unknown" }
  | { type: "epoch"; epoch: number; authorityId: string | null; phase: Room["phase"]; checkpoint: Checkpoint<T> | null }
  | { type: "inputs"; participantId: string; frames: PlayerInputFrame[] }
  | { type: "snapshot"; epoch: number; sequence: number; tick: number; acks: InputAck[]; state: T }
  | { type: "event"; epoch: number; sequence: number; event: E }
  | { type: "checkpoint"; checkpoint: Checkpoint<T> }
  | { type: "resync"; participantId: string; reason: string };

export interface NetworkOptions<T, E = never> extends RoomOptions {
  /** Mandatory application decoder: arbitrary network snapshots are never applied directly. */
  decodeState(value: unknown): T | null;
  decodeEvent?: (value: unknown) => E;
  /** Must restore the complete race (including item/RNG state and input acknowledgments) before resolving. */
  restoreCheckpoint?: (checkpoint: Checkpoint<T>) => void | Promise<void>;
  /** STUN only. TURN remains deliberately unavailable until the budget gate is resolved. */
  stunUrls?: string[];
  connectTimeoutMs?: number;
  maxAttempts?: number;
}
interface Peer {
  id: string;
  attempt: string;
  number: number;
  epoch: number;
  pc: RTCPeerConnection;
  movement: RTCDataChannel | null;
  control: RTCDataChannel | null;
  candidates: RTCIceCandidateInit[];
  timer: ReturnType<typeof setTimeout> | undefined;
  disconnectTimer: ReturnType<typeof setTimeout> | undefined;
  connected: boolean;
  closed: boolean;
  receivedAt: number;
  allowance: number;
  lastEvent: number | null;
  pendingControl: string[];
  pendingControlBytes: number;
  assembler: WireAssembler;
}
const neutralDecodeEvent = (): never => { throw new TypeError("Application event decoder was not provided."); };
export class KartsickNetwork<T, E = never> {
  private readonly peers = new Map<string, Peer>();
  private readonly failedEdges = new Map<string, number>();
  private readonly listeners = new Set<(event: NetworkEvent<T, E>) => void>();
  private readonly pending = new InputQueue();
  private readonly incoming = new InputQueue();
  private readonly inputSequence = new Map<string, number>();
  private readonly receivedSequence = new Map<string, number>();
  private readonly snapshotAcks = new Map<string, number>();
  private readonly checkpoints = new Map<string, Checkpoint<T>>();
  private readonly earlyIce = new Map<string, RTCIceCandidateInit[]>();
  private readonly lastHave = new Set<string>();
  private readonly decodeEvent: (value: unknown) => E;
  private readonly decodeState: (value: unknown) => T;
  private readonly unsubscribe: () => void;
  private readonly qualityTimer: ReturnType<typeof setInterval>;
  private disposed = false;
  private epoch = -1;
  private authorityId: string | null = null;
  private phase: Room["phase"] = "lobby";
  private snapshotSequence = 0;
  private lastSnapshot: number | null = null;
  private lastSnapshotTick = 0;
  private eventSequence = 0;
  private lastCommitted: string | null = null;
  private migrationEpoch = -1;
  private proposalInProgress = false;
  private signalQueue: Promise<void> = Promise.resolve();
  private readonly timeout: number;
  private readonly attempts: number;
  private readonly rtcConfig: RTCConfiguration;
  private readonly visibility = () => {
    void this.connection.setCapability({ visible: document.visibilityState === "visible", capable: true })
      .catch(error => this.error("capability-update", error));
  };
  constructor(readonly connection: RoomConnection, private readonly options: NetworkOptions<T, E>) {
    this.decodeEvent = options.decodeEvent ?? neutralDecodeEvent;
    this.decodeState = value => {
      const result = options.decodeState(value);
      if (result === null || result === undefined) throw new TypeError("Application rejected the race state.");
      return result;
    };
    this.timeout = Math.max(500, Math.min(20_000, options.connectTimeoutMs ?? 8000));
    this.attempts = Math.max(1, Math.min(3, Math.floor(options.maxAttempts ?? 3)));
    const urls = options.stunUrls ?? ["stun:stun.cloudflare.com:3478"];
    if (urls.length > 4 || urls.some(url => !/^stuns?:[a-zA-Z0-9.-]+(?::\d{1,5})?$/.test(url)))
      throw new NetworkError("relay-disabled", "Only direct STUN is allowed. Relay activation remains blocked by the total-budget gate.");
    this.rtcConfig = { iceServers: urls.length ? [{ urls }] : [], iceTransportPolicy: "all", bundlePolicy: "max-bundle" };
    this.unsubscribe = connection.subscribe(event => this.roomEvent(event));
    document.addEventListener("visibilitychange", this.visibility);
    this.qualityTimer = setInterval(() => { void this.reportQuality(); }, 5000);
    if (connection.room) this.updateRoom(connection.room);
  }
  static async create<T, E = never>(options: NetworkOptions<T, E>): Promise<KartsickNetwork<T, E>> {
    const connection = await RoomConnection.create(options);
    try { return new KartsickNetwork(connection, options); } catch (error) { connection.close(); throw error; }
  }
  static async join<T, E = never>(code: string, options: NetworkOptions<T, E>): Promise<KartsickNetwork<T, E>> {
    const connection = await RoomConnection.join(code, options);
    try { return new KartsickNetwork(connection, options); } catch (error) { connection.close(); throw error; }
  }
  get room(): Room | null { return this.connection.room; }
  get participantId(): string | null { return this.connection.participantId; }
  get isAuthority(): boolean { return !this.disposed && document.visibilityState === "visible" && this.connection.connected && this.authorityId === this.participantId && this.phase === "racing"; }
  get connectedPeers(): string[] { return [...this.peers.values()].filter(p => p.connected).map(p => p.id); }
  subscribe(listener: (event: NetworkEvent<T, E>) => void): () => void {
    this.listeners.add(listener);
    if (this.connection.resumePersistenceError) listener({ type: "error", error: this.connection.resumePersistenceError });
    if (this.room) listener({ type: "room", room: this.room });
    listener({ type: "epoch", epoch: this.epoch, authorityId: this.authorityId, phase: this.phase,
      checkpoint: this.currentCheckpoint() });
    return () => this.listeners.delete(listener);
  }
  private emit(event: NetworkEvent<T, E>): void { for (const listener of this.listeners) listener(event); }
  private error(code: string, error: unknown): void {
    this.emit({ type: "error", error: error instanceof NetworkError ? error : new NetworkError(code,
      error instanceof Error ? error.message.slice(0, 240) : "Network operation failed.") });
  }
  private roomEvent(event: RoomConnectionEvent): void {
    if (this.disposed) return;
    if (event.type === "room") this.updateRoom(event.room);
    else if (event.type === "error") this.emit(event);
    else if (event.type === "status") {
      if (event.status !== "connected") this.closePeers();
      else if (this.room) { this.failedEdges.clear(); this.syncPeers(this.room); }
      this.emit({ type: "signaling", status: event.status });
    } else {
      this.signalQueue = this.signalQueue.then(() => this.signal(event.from, event.epoch, event.attempt, event.signal))
        .catch(error => this.error("negotiation", error));
    }
  }
  private updateRoom(room: Room): void {
    const changed = room.epoch !== this.epoch || room.authorityId !== this.authorityId;
    const phaseChanged = room.phase !== this.phase;
    if (changed) {
      this.failedEdges.clear();
      this.closePeers(); this.earlyIce.clear(); this.pending.clear(); this.incoming.clear(); this.receivedSequence.clear();
      this.inputSequence.clear(); this.snapshotAcks.clear(); this.snapshotSequence = 0; this.lastSnapshot = null; this.lastSnapshotTick = 0; this.eventSequence = 0;
      this.epoch = room.epoch; this.authorityId = room.authorityId;
      const checkpoint = this.currentCheckpoint();
      for (const ack of checkpoint?.reference.acks ?? []) {
        this.receivedSequence.set(ack.playerId, ack.sequence); this.inputSequence.set(ack.playerId, ack.sequence);
      }
    }
    this.phase = room.phase;
    if (room.phase === "lobby" && phaseChanged) { this.checkpoints.clear(); this.lastHave.clear(); this.lastCommitted = null; }
    if (changed || phaseChanged) this.emit({ type: "epoch", epoch: room.epoch, authorityId: room.authorityId, phase: room.phase, checkpoint: this.currentCheckpoint() });
    this.emit({ type: "room", room });
    this.acknowledgeCheckpoint();
    if (room.checkpoint && this.lastCommitted !== room.checkpoint.id) {
      const checkpoint = this.currentCheckpoint();
      if (checkpoint) { this.lastCommitted = checkpoint.reference.id; this.emit({ type: "checkpoint", checkpoint: structuredClone(checkpoint) }); }
    }
    if (room.phase === "migrating" && room.authorityId === this.participantId && this.migrationEpoch !== room.epoch) {
      this.migrationEpoch = room.epoch; void this.restoreAuthority(room);
    }
    this.syncPeers(room);
  }
  private currentCheckpoint(): Checkpoint<T> | null {
    const ref = this.room?.checkpoint; if (!ref) return null;
    const checkpoint = this.checkpoints.get(ref.id);
    return checkpoint && checkpoint.reference.digest === ref.digest ? structuredClone(checkpoint) : null;
  }
  private async restoreAuthority(room: Room): Promise<void> {
    try {
      const checkpoint = this.currentCheckpoint();
      if (!checkpoint || !this.options.restoreCheckpoint) throw new Error("The application cannot restore the committed race checkpoint.");
      if (await checkpointDigest(checkpoint.reference.tick, checkpoint.reference.acks, checkpoint.state) !== checkpoint.reference.digest)
        throw new Error("Committed checkpoint checksum failed.");
      await this.options.restoreCheckpoint(structuredClone(checkpoint));
      if (this.disposed || this.epoch !== room.epoch || this.phase !== "migrating") return;
      await this.connection.request({ type: "migration-ready", epoch: room.epoch, checkpointId: checkpoint.reference.id });
    } catch (error) {
      this.error("migration-failed", error);
      if (!this.disposed && this.epoch === room.epoch)
        void this.connection.request({ type: "migration-failed", epoch: room.epoch }).catch(error => this.error("migration-failed", error));
    }
  }
  private syncPeers(room: Room): void {
    if (!this.connection.connected || !room.authorityId) return;
    const expected = room.authorityId === this.participantId
      ? room.participants.filter(p => p.connected && p.id !== this.participantId).map(p => p.id)
      : [room.authorityId];
    for (const id of this.failedEdges.keys()) if (!expected.includes(id)) this.failedEdges.delete(id);
    for (const peer of this.peers.values()) if (!expected.includes(peer.id)) this.closePeer(peer);
    if (room.authorityId === this.participantId) for (const id of expected)
      if (!this.peers.has(id) && this.failedEdges.get(id) !== this.epoch) void this.offer(id, 1);
  }
  private createPeer(id: string, attempt: string, number: number): Peer {
    const previous = this.peers.get(id); if (previous) this.closePeer(previous);
    const pc = new RTCPeerConnection(this.rtcConfig);
    const peer: Peer = { id, attempt, number, epoch: this.epoch, pc, movement: null, control: null,
      candidates: [], timer: undefined, disconnectTimer: undefined, connected: false, closed: false,
      receivedAt: performance.now(), allowance: 600, lastEvent: null, pendingControl: [], pendingControlBytes: 0, assembler: new WireAssembler() };
    this.peers.set(id, peer);
    this.emit({ type: "peer", participantId: id, status: "connecting", attempt: number });
    pc.onicecandidate = event => {
      if (!event.candidate || peer.closed) return;
      const c = event.candidate;
      this.sendSignal(peer, { kind: "ice", candidate: { candidate: c.candidate, sdpMid: c.sdpMid,
        sdpMLineIndex: c.sdpMLineIndex, usernameFragment: c.usernameFragment } });
    };
    pc.ondatachannel = event => this.bindChannel(peer, event.channel);
    pc.onconnectionstatechange = () => {
      if (peer.closed) return;
      if (pc.connectionState === "failed") this.retryPeer(peer);
      else if (pc.connectionState === "disconnected" && !peer.disconnectTimer)
        peer.disconnectTimer = setTimeout(() => this.retryPeer(peer), 2500);
      else if (pc.connectionState === "connected") { clearTimeout(peer.disconnectTimer); peer.disconnectTimer = undefined; }
    };
    peer.timer = setTimeout(() => this.retryPeer(peer), this.timeout);
    return peer;
  }
  private async offer(id: string, number: number): Promise<void> {
    if (this.disposed || this.authorityId !== this.participantId || !this.connection.connected) return;
    let peer: Peer;
    try { peer = this.createPeer(id, crypto.randomUUID(), number); }
    catch {
      this.failedEdges.set(id, this.epoch);
      this.error("webrtc-unavailable", new NetworkError("webrtc-unavailable", "This browser could not create a WebRTC connection. Check browser permissions; relay is disabled."));
      void this.connection.request({ type: "transport-failed", epoch: this.epoch, peerId: id })
        .catch(error => this.error("failure-recovery", error));
      return;
    }
    try {
      this.bindChannel(peer, peer.pc.createDataChannel("movement-v2", { ordered: false, maxRetransmits: 0 }));
      this.bindChannel(peer, peer.pc.createDataChannel("control-v2", { ordered: true }));
      const offer = await peer.pc.createOffer();
      if (peer.closed) return;
      await peer.pc.setLocalDescription(offer);
      if (!peer.closed && peer.pc.localDescription) this.sendSignal(peer, { kind: "description",
        description: { type: "offer", sdp: peer.pc.localDescription.sdp } });
    } catch (error) { if (!peer.closed) { this.error("offer-failed", error); this.retryPeer(peer); } }
  }
  private sendSignal(peer: Peer, signal: PeerSignal): void {
    if (peer.closed || peer.epoch !== this.epoch) return;
    void this.connection.request({ type: "signal", to: peer.id, epoch: peer.epoch, attempt: peer.attempt, signal })
      .catch(error => { if (!peer.closed) this.error("signaling", error); });
  }
  private async signal(from: string, epoch: number, attempt: string, signal: PeerSignal): Promise<void> {
    if (this.disposed || epoch !== this.epoch || (this.authorityId !== this.participantId && from !== this.authorityId)) return;
    if (!this.room?.participants.some(p => p.id === from && p.connected)) return;
    let peer = this.peers.get(from);
    if (signal.kind === "description" && signal.description.type === "offer") {
      if (from !== this.authorityId) return;
      if (!peer || peer.attempt !== attempt) peer = this.createPeer(from, attempt, (peer?.number ?? 0) + 1);
      if (peer.pc.remoteDescription) {
        const answer = peer.pc.localDescription;
        if (answer?.type === "answer") this.sendSignal(peer, { kind: "description", description: { type: "answer", sdp: answer.sdp } });
        return;
      }
      await peer.pc.setRemoteDescription(signal.description);
      if (peer.closed) return;
      const earlyKey = `${from}:${attempt}`;
      peer.candidates.push(...this.earlyIce.get(earlyKey) ?? []); this.earlyIce.delete(earlyKey);
      for (const candidate of peer.candidates.splice(0)) await peer.pc.addIceCandidate(candidate);
      await peer.pc.setLocalDescription(await peer.pc.createAnswer());
      if (!peer.closed && peer.pc.localDescription) this.sendSignal(peer, { kind: "description",
        description: { type: "answer", sdp: peer.pc.localDescription.sdp } });
    } else if (signal.kind === "description") {
      if (!peer || peer.attempt !== attempt || this.authorityId !== this.participantId || peer.pc.signalingState !== "have-local-offer") return;
      await peer.pc.setRemoteDescription(signal.description);
      for (const candidate of peer.candidates.splice(0)) await peer.pc.addIceCandidate(candidate);
    } else if (peer?.attempt === attempt) {
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(signal.candidate);
      else if (peer.candidates.length < 64) peer.candidates.push(signal.candidate);
    } else if (from === this.authorityId) {
      const key = `${from}:${attempt}`;
      if (!this.earlyIce.has(key) && this.earlyIce.size >= 3) this.earlyIce.delete(this.earlyIce.keys().next().value ?? "");
      const candidates = this.earlyIce.get(key) ?? [];
      if (candidates.length < 64) candidates.push(signal.candidate);
      this.earlyIce.set(key, candidates);
    }
  }
  private bindChannel(peer: Peer, channel: RTCDataChannel): void {
    const movement = channel.label === "movement-v2";
    if (movement ? channel.ordered || channel.maxRetransmits !== 0 || peer.movement !== null :
      channel.label !== "control-v2" || !channel.ordered || channel.maxRetransmits !== null || channel.maxPacketLifeTime !== null || peer.control !== null) {
      channel.close(); return;
    }
    if (movement) peer.movement = channel; else peer.control = channel;
    channel.onopen = () => {
      if (peer.closed || peer.connected || peer.movement?.readyState !== "open" || peer.control?.readyState !== "open") return;
      peer.connected = true; clearTimeout(peer.timer);
      try { for (const message of peer.pendingControl) peer.control.send(message); }
      catch (error) { this.error("control-send", error); this.failDirect(peer); return; }
      peer.pendingControl = []; peer.pendingControlBytes = 0;
      this.emit({ type: "peer", participantId: peer.id, status: "connected", attempt: peer.number });
      if (this.isAuthority) this.emit({ type: "resync", participantId: peer.id, reason: "New or reconnected peer needs a fresh authoritative snapshot." });
      else this.sendControl(peer, { version: NETWORK_VERSION, type: "resync", epoch: this.epoch });
    };
    channel.onclose = () => { if (!peer.closed) this.retryPeer(peer); };
    channel.onerror = () => { if (!peer.closed) this.retryPeer(peer); };
    channel.onmessage = event => { void this.receiveData(peer, movement, event.data); };
  }
  private retryPeer(peer: Peer): void {
    if (peer.closed || this.disposed) return;
    if (this.authorityId === this.participantId && peer.number < this.attempts) {
      this.closePeer(peer); void this.offer(peer.id, peer.number + 1); return;
    }
    // The authority retries offers. Give its retries time to arrive before the client declares failure.
    if (this.authorityId !== this.participantId && peer.number < this.attempts) {
      clearTimeout(peer.timer); peer.timer = setTimeout(() => this.failDirect(peer), this.timeout * (this.attempts - peer.number + 1));
      return;
    }
    this.failDirect(peer);
  }
  private failDirect(peer: Peer): void {
    if (peer.closed || this.disposed) return;
    this.failedEdges.set(peer.id, this.epoch);
    this.closePeer(peer);
    this.error("direct-unavailable", new NetworkError("direct-unavailable",
      "Direct WebRTC could not connect. Relay is disabled until an enforceable $5 total monthly budget is approved. Try another network; remain in this lobby."));
    void this.connection.request({ type: "transport-failed", epoch: this.epoch, peerId: peer.id })
      .catch(error => this.error("failure-recovery", error));
  }
  private async receiveData(peer: Peer, movement: boolean, raw: unknown): Promise<void> {
    if (peer.closed || this.disposed || typeof raw !== "string" || raw.length > WIRE_MAX_BYTES) return;
    peer.allowance = Math.min(600, peer.allowance + (performance.now() - peer.receivedAt) * 0.5); peer.receivedAt = performance.now();
    if (peer.allowance < 1) { this.error("peer-rate", ""); this.failDirect(peer); return; }
    peer.allowance--;
    try {
      const assembled = peer.assembler.accept(raw, this.epoch, movement, performance.now());
      if (assembled === null) return;
      const packet = parseDataPacket(assembled, this.decodeState, this.decodeEvent);
      if (packet.epoch !== this.epoch || peer.epoch !== this.epoch) return;
      if (movement !== (packet.type === "inputs" || packet.type === "snapshot")) throw new TypeError("Wrong data channel.");
      if (packet.type === "inputs") {
        if (this.isAuthority) this.acceptInputs(peer.id, packet.frames, packet.snapshotAck);
      } else if (packet.type === "snapshot") {
        if (peer.id !== this.authorityId || this.phase !== "racing" || packet.tick < this.lastSnapshotTick ||
          (this.lastSnapshot !== null && !sequenceIsNewer(packet.sequence, this.lastSnapshot))) return;
        this.validateAcks(packet.acks);
        this.lastSnapshot = packet.sequence; this.lastSnapshotTick = packet.tick; this.pending.acknowledge(packet.acks);
        for (const ack of packet.acks) if (this.participantId && this.owns(this.participantId, ack.playerId)) {
          const previous = this.inputSequence.get(ack.playerId);
          if (previous === undefined || sequenceIsNewer(ack.sequence, previous)) this.inputSequence.set(ack.playerId, ack.sequence);
        }
        this.emit({ type: "snapshot", epoch: packet.epoch, sequence: packet.sequence, tick: packet.tick, acks: packet.acks, state: packet.state });
        this.sendMovement(peer, { version: NETWORK_VERSION, type: "inputs", epoch: this.epoch, frames: [], snapshotAck: packet.sequence });
      } else if (packet.type === "checkpoint") {
        if (peer.id !== this.authorityId || this.phase !== "racing") return;
        this.validateAcks(packet.checkpoint.reference.acks);
        const digest = await checkpointDigest(packet.checkpoint.reference.tick, packet.checkpoint.reference.acks, packet.checkpoint.state);
        if (peer.closed || this.epoch !== packet.epoch) return;
        if (digest !== packet.checkpoint.reference.digest) throw new TypeError("Invalid checkpoint checksum.");
        this.storeCheckpoint(packet.checkpoint); this.acknowledgeCheckpoint();
      } else if (packet.type === "event") {
        if (peer.id !== this.authorityId || this.phase !== "racing" || (peer.lastEvent !== null && !sequenceIsNewer(packet.sequence, peer.lastEvent))) return;
        peer.lastEvent = packet.sequence;
        this.emit({ type: "event", epoch: packet.epoch, sequence: packet.sequence, event: packet.event });
      } else if (this.isAuthority) this.emit({ type: "resync", participantId: peer.id, reason: "Peer requested an authoritative resync." });
    } catch (error) { this.error("invalid-peer-message", error); }
  }
  private owns(participantId: string, playerId: string): boolean {
    return Boolean(this.room?.participants.some(p => p.id === participantId && p.players.some(player => player.id === playerId)) &&
      this.room?.karts.some(k => k.seats.includes(playerId)));
  }
  private acceptInputs(participantId: string, frames: PlayerInputFrame[], snapshotAck: number | null): void {
    if (frames.some(frame => !this.owns(participantId, frame.playerId))) throw new NetworkError("input-owner", "A browser sent inputs for seats it does not own.");
    if (snapshotAck !== null && !sequenceIsNewer(snapshotAck, this.snapshotSequence)) {
      const old = this.snapshotAcks.get(participantId);
      if (old === undefined || sequenceIsNewer(snapshotAck, old)) this.snapshotAcks.set(participantId, snapshotAck);
    }
    const accepted: PlayerInputFrame[] = [];
    for (const frame of frames) {
      const previous = this.receivedSequence.get(frame.playerId);
      if (previous !== undefined && !sequenceIsNewer(frame.sequence, previous)) continue;
      this.receivedSequence.set(frame.playerId, frame.sequence); this.incoming.push(frame); accepted.push(frame);
    }
    if (accepted.length) this.emit({ type: "inputs", participantId, frames: structuredClone(accepted) });
  }
  sendInputs(samples: readonly { playerId: string; tick: number; input: NetworkInput }[]): boolean {
    if (this.phase !== "racing" || !this.connection.connected || !this.participantId) return false;
    if (samples.length > 4 || new Set(samples.map(s => s.playerId)).size !== samples.length) throw new RangeError("At most four distinct local humans may send inputs.");
    for (const sample of samples) {
      if (!this.owns(this.participantId, sample.playerId)) throw new NetworkError("input-owner", "Only your seated local players can send inputs.");
      const sequence = ((this.inputSequence.get(sample.playerId) ?? 0) + 1) >>> 0;
      const frame = parseInputFrame({ ...sample, sequence }); this.pending.push(frame); this.inputSequence.set(sample.playerId, sequence);
    }
    const playerIds = this.room?.participants.find(p => p.id === this.participantId)?.players.map(p => p.id) ?? [];
    const frames = this.pending.latest(playerIds);
    if (this.isAuthority) { this.acceptInputs(this.participantId, frames, null); return true; }
    const peer = this.peers.get(this.authorityId ?? "");
    return peer ? this.sendMovement(peer, { version: NETWORK_VERSION, type: "inputs", epoch: this.epoch, frames, snapshotAck: this.lastSnapshot }) : false;
  }
  drainInputs(): PlayerInputFrame[] { return this.isAuthority ? this.incoming.drain() : []; }
  pendingInputs(playerId?: string): PlayerInputFrame[] { return this.pending.pending(playerId); }
  retryConnections(): void { this.failedEdges.clear(); this.connection.reconnect(); }
  getSnapshotAcks(): ReadonlyMap<string, number> { return new Map(this.snapshotAcks); }
  private validateAcks(acks: InputAck[]): void {
    if (acks.some(ack => !this.room?.participants.some(p => p.players.some(player => player.id === ack.playerId))))
      throw new TypeError("Unknown player in snapshot acknowledgments.");
  }
  broadcastSnapshot(state: T, tick: number, acknowledgments: InputAck[]): { sequence: number; sent: number; dropped: number } {
    if (!this.isAuthority) throw new NetworkError("not-authority", "Only the active visible authority publishes race state.");
    const acks = parseAcks(acknowledgments); this.validateAcks(acks);
    const decoded = this.decodeState(structuredClone(state));
    const sequence = this.snapshotSequence = (this.snapshotSequence + 1) >>> 0;
    const packet = parseDataPacket(encodeDataPacket<T, E>({ version: NETWORK_VERSION, type: "snapshot", epoch: this.epoch, sequence, tick, acks, state: decoded }),
      this.decodeState, this.decodeEvent);
    let sent = 0, dropped = 0;
    for (const peer of this.peers.values()) if (this.sendMovement(peer, packet)) sent++; else dropped++;
    this.pending.acknowledge(acks);
    return { sequence, sent, dropped };
  }
  broadcastEvent(event: E): void {
    if (!this.isAuthority) throw new NetworkError("not-authority", "Only the authority sends reliable race events.");
    const packet: DataPacket<T, E> = { version: NETWORK_VERSION, type: "event", epoch: this.epoch,
      sequence: this.eventSequence = (this.eventSequence + 1) >>> 0, event: this.decodeEvent(structuredClone(event)) };
    for (const peer of this.peers.values()) this.sendControl(peer, packet);
  }
  async commitCheckpoint(state: T, tick: number, acknowledgments: InputAck[]): Promise<Checkpoint<T>> {
    if (!this.isAuthority || this.proposalInProgress) throw new NetworkError("checkpoint-unavailable", "A checkpoint publication is already running or this browser is not authority.");
    this.proposalInProgress = true;
    const epoch = this.epoch;
    try {
      const acks = parseAcks(acknowledgments); this.validateAcks(acks);
      const decoded = this.decodeState(structuredClone(state));
      const digest = await checkpointDigest(tick, acks, decoded);
      const checkpoint: Checkpoint<T> = { reference: { id: crypto.randomUUID(), tick, digest, acks }, state: decoded };
      const packet: DataPacket<T, E> = { version: NETWORK_VERSION, type: "checkpoint", epoch, checkpoint };
      parseDataPacket(encodeDataPacket(packet), this.decodeState, this.decodeEvent);
      if (!this.isAuthority || this.epoch !== epoch) throw new NetworkError("stale-epoch", "Authority changed during checkpoint creation.");
      this.storeCheckpoint(checkpoint);
      await this.connection.request({ type: "checkpoint-propose", epoch, checkpoint: checkpoint.reference });
      if (this.epoch !== epoch || !this.isAuthority) throw new NetworkError("stale-epoch", "Authority changed during checkpoint publication.");
      for (const peer of this.peers.values()) this.sendControl(peer, packet);
      return structuredClone(checkpoint);
    } finally { this.proposalInProgress = false; }
  }
  private storeCheckpoint(checkpoint: Checkpoint<T>): void {
    this.checkpoints.set(checkpoint.reference.id, structuredClone(checkpoint));
    for (const id of this.checkpoints.keys()) {
      if (this.checkpoints.size <= 3) break;
      if (id !== this.room?.checkpoint?.id && id !== checkpoint.reference.id) this.checkpoints.delete(id);
    }
  }
  private acknowledgeCheckpoint(): void {
    const ref = this.room?.pendingCheckpoint;
    if (!ref || this.authorityId === this.participantId || this.lastHave.has(ref.id) || this.phase !== "racing") return;
    const local = this.checkpoints.get(ref.id); if (!local || local.reference.digest !== ref.digest) return;
    this.lastHave.add(ref.id); if (this.lastHave.size > 4) this.lastHave.delete(this.lastHave.values().next().value ?? "");
    void this.connection.request({ type: "checkpoint-have", epoch: this.epoch, checkpointId: ref.id, digest: ref.digest })
      .catch(error => { this.lastHave.delete(ref.id); this.error("checkpoint-ack", error); });
  }
  private sendMovement(peer: Peer, packet: DataPacket<T, E>): boolean {
    const channel = peer.movement;
    if (peer.closed || channel?.readyState !== "open") return false;
    const messages = fragmentPacket(encodeDataPacket(packet), this.epoch);
    if (channel.bufferedAmount + messages.reduce((sum, message) => sum + byteLength(message), 0) > SNAPSHOT_BUFFER_LIMIT) return false;
    try { for (const raw of messages) channel.send(raw); return true; } catch { return false; }
  }
  private sendControl(peer: Peer, packet: DataPacket<T, E>): boolean {
    const channel = peer.control;
    if (peer.closed) return false;
    const messages = fragmentPacket(encodeDataPacket(packet), this.epoch), bytes = messages.reduce((sum, raw) => sum + byteLength(raw), 0);
    if ((channel?.bufferedAmount ?? 0) + peer.pendingControlBytes + bytes > CONTROL_BUFFER_LIMIT || peer.pendingControl.length + messages.length > 64) {
      this.error("control-backpressure", new Error("Reliable race events could not be delivered.")); this.failDirect(peer); return false;
    }
    if (channel?.readyState !== "open") { peer.pendingControl.push(...messages); peer.pendingControlBytes += bytes; return true; }
    try { for (const raw of messages) channel.send(raw); return true; }
    catch (error) { this.error("control-send", error); this.failDirect(peer); return false; }
  }
  private async reportQuality(): Promise<void> {
    for (const peer of this.peers.values()) {
      if (!peer.connected || peer.closed) continue;
      try {
        const stats = await peer.pc.getStats();
        if (peer.closed || this.disposed) continue;
        let rttMs: number | null = null, bytesSent = 0, bytesReceived = 0;
        let route: "direct" | "unknown" = "unknown";
        stats.forEach(stat => {
          if (stat.type === "candidate-pair" && stat.state === "succeeded" && stat.nominated) {
            rttMs = typeof stat.currentRoundTripTime === "number" ? stat.currentRoundTripTime * 1000 : null;
            const candidate: unknown = stats.get(stat.localCandidateId);
            if (typeof candidate === "object" && candidate !== null && "candidateType" in candidate && candidate.candidateType !== "relay") route = "direct";
          }
          if (stat.type === "data-channel") { bytesSent += Number(stat.bytesSent ?? 0); bytesReceived += Number(stat.bytesReceived ?? 0); }
        });
        this.emit({ type: "quality", participantId: peer.id, rttMs, bytesSent, bytesReceived, route });
      } catch { /* A closed peer has no final stats to report. */ }
    }
  }
  private closePeer(peer: Peer): void {
    if (peer.closed) return;
    peer.closed = true; clearTimeout(peer.timer); clearTimeout(peer.disconnectTimer);
    peer.assembler.clear(); peer.pendingControl = []; peer.pendingControlBytes = 0;
    peer.pc.onicecandidate = null; peer.pc.ondatachannel = null; peer.pc.onconnectionstatechange = null;
    for (const channel of [peer.movement, peer.control]) if (channel) {
      channel.onopen = null; channel.onclose = null; channel.onmessage = null; channel.onerror = null; channel.close();
    }
    peer.pc.close(); if (this.peers.get(peer.id) === peer) this.peers.delete(peer.id);
    this.emit({ type: "peer", participantId: peer.id, status: "closed", attempt: peer.number });
  }
  private closePeers(): void { for (const peer of [...this.peers.values()]) this.closePeer(peer); }
  async leave(): Promise<void> { try { await this.connection.leave(); } finally { this.dispose(); } }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; clearInterval(this.qualityTimer); document.removeEventListener("visibilitychange", this.visibility);
    this.unsubscribe(); this.closePeers(); this.connection.close(); this.listeners.clear();
    this.pending.clear(); this.incoming.clear(); this.checkpoints.clear();
  }
}
