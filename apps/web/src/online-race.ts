import { CHARACTERS, getCourse } from "@kartsick/content";
import {
  FixedClock, RACE_LIMITS, copyKart, copyRace, createRace, decodeRaceEvent, setRacePlayers, stepRace,
} from "@kartsick/simulation";
import type { KartState, PlayerInput, RaceEntry, RaceEvent, RaceState } from "@kartsick/simulation";
import { sequenceIsNewer } from "@kartsick/protocol";
import type { Checkpoint, InputAck, PlayerInputFrame, Room } from "@kartsick/protocol";
import type { KartsickNetwork, NetworkEvent } from "./network";
import type { SessionFrame } from "./local-race";

export type RacingTransport = Pick<KartsickNetwork<RaceState, RaceEvent[]>,
  "room" | "participantId" | "isAuthority" | "connectedPeers" | "subscribe" | "sendInputs" |
  "drainInputs" | "pendingInputs" | "broadcastSnapshot" | "broadcastEvent" | "commitCheckpoint" | "getSnapshotAcks"> & {
    connection: Pick<KartsickNetwork<RaceState>["connection"], "connected" | "serverNow" | "finishRound">;
  };

export function decodeRaceEventBatch(value: unknown): RaceEvent[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > RACE_LIMITS.eventsPerTick) throw new TypeError("Invalid race event batch.");
  if (Reflect.ownKeys(value).length !== value.length + 1) throw new TypeError("Race event batches must be dense arrays.");
  const events: RaceEvent[] = [];
  for (let index = 0; index < value.length; index++) {
    const entry = Object.getOwnPropertyDescriptor(value, index);
    if (!entry?.enumerable || !Object.hasOwn(entry, "value")) throw new TypeError("Race event batches must contain data fields.");
    events.push(decodeRaceEvent(entry.value));
  }
  if (events.some(event => event.tick !== events[0].tick)) throw new TypeError("Race event batches must contain one simulation tick.");
  return events;
}

export function roomRace(room: Room): RaceState {
  if (!room.round && !room.karts.some(kart => kart.seats.some(Boolean))) throw new RangeError("The room has no seated racers.");
  const names = new Map(room.participants.flatMap(participant => participant.players.map(player => [player.id, player.name] as const)));
  const entries: RaceEntry[] = room.karts.flatMap((kart, index) => {
    const id = `online-kart-${index + 1}`;
    const frozen = room.round?.roster.find(racer => racer.id === id);
    if (room.round ? !frozen : !room.config.bots && kart.seats.every(player => player === null)) return [];
    const humans = kart.seats.flatMap(player => player ? [names.get(player) ?? "Disconnected racer"] : []);
    const entry: RaceEntry = {
      id,
      name: frozen?.name ?? (humans.length ? humans.join(" & ") : `${CHARACTERS.find(character => character.id === kart.build.characters[0])!.name} & co.`).slice(0, 32),
      build: kart.build, players: [...kart.seats],
    };
    return [entry];
  });
  return createRace({
    courseId: room.config.course, mode: "race", speedClass: room.config.speed, mirror: room.config.mirror,
    bots: false, difficulty: room.config.difficulty, seed: room.seed,
  }, entries);
}

/** One bounded fixed-step simulation, with applied-input acknowledgments and checkpoint restoration. */
export class OnlineRaceSession {
  race: RaceState;
  private readonly clock = new FixedClock();
  private readonly previous = new Map<string, KartState>();
  private readonly applied = new Map<string, number>();
  private readonly queued = new Map<string, PlayerInputFrame[]>();
  private readonly unsubscribe: () => void;
  private latestSnapshot: RaceState | null = null;
  private latestSnapshotAt = 0;
  private predictionScale = 1;
  private confirmedFinished = false;
  private epoch: number;
  private waiting = true;
  private disposed = false;
  private checkpointInFlight = false;
  private checkpointTick = -60;
  private checkpointRetryAt = 0;
  private finishInFlight = false;
  private finishRetryAt = 0;
  private finishAcknowledged = false;
  private readonly roundId: string;
  private publishedSequence: number | null = null;
  private lastPublishedAt = 0;
  private resumeAt = 0;
  private awaitingResumeTime = false;
  private pendingEvents: RaceEvent[] = [];
  private readonly eventKeys = new Set<string>();
  private readonly eventOrder: string[] = [];
  private rtt = 0;
  private bytesSent = 0;
  private bytesReceived = 0;
  private readonly peerQuality = new Map<string, { rtt: number | null; sent: number; received: number }>();
  private eventBatchesPublished = 0;
  private eventBatchesReceived = 0;
  private readonly receivedEventCounts = new Map<RaceEvent["type"], number>();
  private snapshotsSent = 0;
  private snapshotsDropped = 0;
  private maximumSnapshotBytes = 0;
  private restoreCount = 0;
  private peers = new Set<string>();
  private remoteSamples: { at: number; poses: Map<string, KartState> }[] = [];

  constructor(
    readonly network: RacingTransport,
    readonly identities: ReadonlyMap<string, string>,
    private readonly warning: (message: string) => void,
    private readonly now: () => number = () => performance.now(),
    terminal?: Checkpoint<RaceState>,
  ) {
    const room = network.room;
    if (!room || room.phase === "lobby" || !room.round) throw new RangeError("An online race requires a started room round.");
    if (terminal) {
      if (terminal.state.phase !== "finished" || terminal.state.tick !== terminal.reference.tick ||
        terminal.reference.id !== room.lastRound?.checkpoint.id || terminal.reference.digest !== room.lastRound.checkpoint.digest ||
        terminal.reference.tick !== room.lastRound.checkpoint.tick || room.lastRound.roundId !== room.round.id ||
        JSON.stringify(terminal.state.results) !== JSON.stringify(room.lastRound.results) ||
        terminal.state.options.seed !== room.seed || terminal.state.options.courseId !== room.config.course ||
        terminal.state.options.speedClass !== room.config.speed || terminal.state.options.mirror !== room.config.mirror)
        throw new RangeError("Only the accepted terminal checkpoint can restore completed race positions.");
      this.race = copyRace(terminal.state);
    } else {
      if (room.phase === "results") throw new RangeError("Completed rooms must not create a fresh race.");
      this.race = roomRace(room);
    }
    this.roundId = room.round.id;
    this.epoch = room.epoch;
    this.waiting = !network.isAuthority;
    this.remember();
    this.unsubscribe = network.subscribe(event => this.receive(event));
    if (terminal) this.restore(terminal);
  }

  get droppedSeconds(): number { return this.clock.droppedSeconds; }
  get finished(): boolean { return this.network.isAuthority ? this.race.phase === "finished" : this.confirmedFinished; }
  get localIds(): ReadonlySet<string> { return new Set(this.identities.values()); }
  alignCountdown(): void {
    const startAt = this.network.room?.startAt;
    if (this.network.isAuthority && this.race.phase === "countdown" && startAt !== null && startAt !== undefined) {
      this.race.tick = Math.max(this.race.tick, Math.min(RACE_LIMITS.countdownTicks - 1,
        Math.floor(Math.max(0, this.network.connection.serverNow() - startAt + 3000) * 60 / 1000)));
    }
  }
  get connectionLabel(): string {
    const room = this.network.room;
    if (!this.network.connection.connected) return "SIGNALING RECONNECTING - RACE HELD";
    if (room?.phase === "migrating") return "RESTORING RACE WITH A NEW HOST";
    if (room?.phase === "paused") return "ROOM PAUSED";
    if (room?.phase === "results") return "RESULTS SAVED TO ROOM";
    if (this.waiting) return "WAITING FOR THE RACE HOST";
    return `DIRECT ONLINE${this.network.isAuthority ? " / HOST" : ""}${this.rtt ? ` / ${Math.round(this.rtt)} MS` : ""}`;
  }
  resetClock(): void { this.clock.reset(); this.remember(); }
  private remember(): void {
    this.previous.clear();
    for (const kart of this.race.karts) this.previous.set(kart.id, copyKart(kart.state));
  }
  private acknowledgments(): InputAck[] {
    return [...this.applied].map(([playerId, sequence]) => ({ playerId, sequence }));
  }
  private syncSeats(): void {
    const room = this.network.room;
    if (!room) return;
    for (const kart of this.race.karts) {
      const index = Number(kart.id.slice("online-kart-".length)) - 1;
      const seats = room.karts[index]?.seats;
      if (!seats) throw new Error("A race kart no longer has a room slot.");
      if (kart.players.some((player, side) => player !== seats[side])) setRacePlayers(this.race, kart.id, [...seats]);
    }
    const active = new Set(room.participants.flatMap(participant => participant.players.map(player => player.id)));
    for (const id of this.applied.keys()) if (!active.has(id)) this.applied.delete(id);
    for (const id of this.queued.keys()) if (!active.has(id)) this.queued.delete(id);
  }
  private receive(event: NetworkEvent<RaceState, RaceEvent[]>): void {
    if (this.disposed) return;
    switch (event.type) {
      case "epoch":
        if (event.epoch !== this.epoch) {
          this.epoch = event.epoch;
          this.queued.clear();
          this.applied.clear();
          this.pendingEvents = [];
          this.eventKeys.clear();
          this.eventOrder.length = 0;
          this.latestSnapshot = null;
          this.publishedSequence = null;
          this.checkpointRetryAt = 0;
          this.finishAcknowledged = false;
          this.remoteSamples = [];
          this.peerQuality.clear();
          this.rtt = 0;
          this.confirmedFinished = false;
          this.waiting = true;
          if (event.checkpoint && event.authorityId !== this.network.participantId) this.restore(event.checkpoint);
        }
        this.resetClock();
        if (event.phase === "results") { this.waiting = !this.finished; this.awaitingResumeTime = false; this.resumeAt = 0; }
        else if (event.phase !== "racing") this.waiting = true;
        else {
          if (this.awaitingResumeTime) {
            const startAt = this.network.room?.startAt;
            if (startAt !== null && startAt !== undefined) this.resumeAt = startAt;
            this.awaitingResumeTime = false;
          }
          if (this.network.isAuthority) this.waiting = false;
        }
        break;
      case "room":
        if (this.network.isAuthority && this.race.phase !== "finished") this.syncSeats();
        this.finishRound();
        break;
      case "checkpoint":
        this.finishRound();
        break;
      case "signaling":
        if (event.status !== "connected") { this.waiting = true; this.resetClock(); }
        else if (this.network.isAuthority) this.waiting = false;
        break;
      case "snapshot":
        if (this.network.isAuthority || event.epoch !== this.epoch || event.state.tick !== event.tick) return;
        if (event.state.options.seed !== this.race.options.seed ||
          event.state.options.courseId !== this.race.options.courseId ||
          event.state.options.mirror !== this.race.options.mirror ||
          event.state.options.speedClass !== this.race.options.speedClass) {
          this.warning("The host sent a snapshot for a different race. The race is held.");
          this.waiting = true;
          return;
        }
        {
          const now = this.now();
          const interval = now - this.latestSnapshotAt;
          if (this.latestSnapshot && interval >= 15 && interval < 1000) {
            const pace = Math.min(1.05, Math.max(.25, (event.tick - this.latestSnapshot.tick) / interval * 1000 / 60));
            this.predictionScale += (pace - this.predictionScale) * .15;
          }
          this.latestSnapshot = copyRace(event.state);
          this.latestSnapshotAt = now;
        }
        this.remoteSamples.push({ at: this.latestSnapshotAt, poses: new Map(event.state.karts.map(kart => [kart.id, copyKart(kart.state)])) });
        if (this.remoteSamples.length > 8) this.remoteSamples.shift();
        this.confirmedFinished = event.state.phase === "finished";
        this.reconcile(event.state);
        this.waiting = false;
        break;
      case "resync":
        if (this.network.isAuthority) this.publish();
        break;
      case "event":
        if (this.network.isAuthority || event.epoch !== this.epoch || this.waiting || !this.latestSnapshot) return;
        {
          const tick = event.event[0].tick;
          if (tick < this.race.tick - 120 || tick > this.race.tick + 120) return;
          const ids = new Set(this.race.karts.map(kart => kart.id));
          if (event.event.some(item => item.kartId !== "" && !ids.has(item.kartId) ||
            item.targetId !== undefined && !/^e\d+$/.test(item.targetId) && !ids.has(item.targetId))) {
            this.warning("The host sent feedback for an unknown kart. That event batch was rejected.");
            return;
          }
          this.eventBatchesReceived++;
          for (const item of event.event) this.receivedEventCounts.set(item.type, (this.receivedEventCounts.get(item.type) ?? 0) + 1);
          this.keepEvents(event.event);
        }
        break;
      case "quality":
        {
          const previous = this.peerQuality.get(event.participantId);
          this.bytesSent += event.bytesSent >= (previous?.sent ?? 0) ? event.bytesSent - (previous?.sent ?? 0) : event.bytesSent;
          this.bytesReceived += event.bytesReceived >= (previous?.received ?? 0) ? event.bytesReceived - (previous?.received ?? 0) : event.bytesReceived;
          this.peerQuality.set(event.participantId, { rtt: event.rttMs, sent: event.bytesSent, received: event.bytesReceived });
          this.rtt = Math.max(0, ...[...this.peerQuality.values()].map(peer => peer.rtt ?? 0));
        }
        break;
      case "peer":
        if (event.status === "connected") this.peers.add(event.participantId);
        else {
          this.peers.delete(event.participantId);
          this.peerQuality.delete(event.participantId);
          this.rtt = Math.max(0, ...[...this.peerQuality.values()].map(peer => peer.rtt ?? 0));
          if (!this.network.isAuthority) this.waiting = true;
        }
        break;
    }
  }

  restore(checkpoint: Checkpoint<RaceState>): void {
    if (checkpoint.state.tick !== checkpoint.reference.tick) throw new Error("The checkpoint tick does not match its race.");
    if (checkpoint.state.options.seed !== this.race.options.seed ||
      checkpoint.state.options.courseId !== this.race.options.courseId) throw new Error("The checkpoint belongs to a different race.");
    this.race = copyRace(checkpoint.state);
    this.restoreCount++;
    this.latestSnapshot = copyRace(checkpoint.state);
    this.latestSnapshotAt = this.now();
    this.applied.clear();
    for (const ack of checkpoint.reference.acks) this.applied.set(ack.playerId, ack.sequence);
    this.queued.clear();
    this.remoteSamples = [];
    this.checkpointTick = this.race.tick;
    this.confirmedFinished = this.race.phase === "finished";
    this.resumeAt = this.confirmedFinished ? 0 : this.network.connection.serverNow() + 1000;
    this.awaitingResumeTime = !this.confirmedFinished;
    this.resetClock();
  }

  private predictionInputs(state: RaceState): Record<string, PlayerInput> {
    const inputs: Record<string, PlayerInput> = Object.create(null);
    const connected = new Set(this.network.room?.participants.filter(participant => participant.connected)
      .flatMap(participant => participant.players.map(player => player.id)) ?? []);
    for (const kart of state.karts) kart.players.forEach((id, side) => {
      if (id && connected.has(id) && kart.missing[side] < RACE_LIMITS.missingInputTicks) inputs[id] = kart.previous[side];
    });
    return inputs;
  }

  private reconcile(authoritative: RaceState): void {
    const target = Math.min(Math.max(this.race.tick, authoritative.tick), authoritative.tick + 12);
    const pending = this.network.pendingInputs();
    this.race = copyRace(authoritative);
    // Replay only unacknowledged local intentions; authoritative items, RNG and remote states form the base.
    while (this.race.tick < target && this.race.phase !== "finished") {
      const inputs = this.predictionInputs(this.race);
      for (const id of this.identities.values()) {
        const index = pending.findIndex(frame => frame.playerId === id && frame.tick <= this.race.tick + 1);
        if (index >= 0) inputs[id] = pending.splice(index, 1)[0].input;
      }
      stepRace(this.race, inputs);
    }
    this.remember();
  }

  private authorityInputs(): Record<string, PlayerInput> {
    const seated = new Set(this.race.karts.flatMap(kart => kart.players.filter((id): id is string => id !== null)));
    const connected = new Set(this.network.room?.participants.filter(participant => participant.connected)
      .flatMap(participant => participant.players.map(player => player.id)) ?? []);
    for (const frame of this.network.drainInputs()) {
      const applied = this.applied.get(frame.playerId);
      if (!seated.has(frame.playerId) || !connected.has(frame.playerId) ||
        frame.tick < this.race.tick - 120 || frame.tick > this.race.tick + 120 ||
        applied !== undefined && !sequenceIsNewer(frame.sequence, applied)) continue;
      const queue = this.queued.get(frame.playerId) ?? [];
      if (!queue.some(old => old.sequence === frame.sequence)) queue.push(frame);
      if (queue.length > 120) queue.splice(0, queue.length - 120);
      this.queued.set(frame.playerId, queue);
    }
    const inputs: Record<string, PlayerInput> = Object.create(null);
    for (const [id, frames] of this.queued) {
      if (!connected.has(id)) { this.queued.delete(id); continue; }
      const frame = frames.shift();
      if (!frame) continue;
      inputs[id] = frame.input;
      // These acknowledgments are published only after the associated fixed physics step.
      this.applied.set(id, frame.sequence);
    }
    return inputs;
  }

  private publish(): void {
    const result = this.network.broadcastSnapshot(this.race, this.race.tick, this.acknowledgments());
    this.publishedSequence = result.sequence;
    this.lastPublishedAt = this.now();
    this.snapshotsSent += result.sent;
    this.snapshotsDropped += result.dropped;
    this.maximumSnapshotBytes = Math.max(this.maximumSnapshotBytes, new TextEncoder().encode(JSON.stringify(this.race)).byteLength);
  }

  private publishCheckpoint(): void {
    if (this.checkpointInFlight || this.now() < this.checkpointRetryAt || this.race.tick === this.checkpointTick ||
      this.race.phase !== "finished" && this.race.tick - this.checkpointTick < 60) return;
    this.checkpointTick = this.race.tick;
    this.checkpointInFlight = true;
    const epoch = this.epoch;
    void this.network.commitCheckpoint(copyRace(this.race), this.race.tick, this.acknowledgments())
      .then(() => this.finishRound())
      .catch(error => {
        if (!this.disposed && this.epoch === epoch) {
          this.checkpointTick = -60;
          this.checkpointRetryAt = this.now() + 1000;
          this.warning(`Race checkpoint could not be replicated: ${error instanceof Error ? error.message : String(error)}`);
        }
      })
      .finally(() => { this.checkpointInFlight = false; });
  }

  private finishRound(): void {
    const room = this.network.room, checkpoint = room?.checkpoint;
    if (this.disposed || this.finishInFlight || this.finishAcknowledged || this.now() < this.finishRetryAt || !this.network.isAuthority ||
      room?.phase !== "racing" || room.round?.id !== this.roundId || this.race.phase !== "finished" ||
      checkpoint?.tick !== this.race.tick) return;
    const epoch = this.epoch;
    this.finishInFlight = true;
    void this.network.connection.finishRound({
      epoch, roundId: this.roundId, courseId: this.race.options.courseId,
      checkpointId: checkpoint.id, tick: checkpoint.tick, results: structuredClone(this.race.results),
    }).then(() => {
      if (!this.disposed && this.epoch === epoch) this.finishAcknowledged = true;
    }).catch(error => {
      if (!this.disposed && this.epoch === epoch && this.network.room?.round?.id === this.roundId &&
        this.network.room.phase === "racing") {
        this.finishRetryAt = this.now() + 1000;
        this.warning(`Room results could not be saved: ${error instanceof Error ? error.message : String(error)}`);
      }
    }).finally(() => { this.finishInFlight = false; });
  }

  private remotePoses(): SessionFrame["remote"] {
    if (this.network.isAuthority || !this.remoteSamples.length) return undefined;
    const time = this.now() - 100;
    const after = this.remoteSamples.findIndex(sample => sample.at > time);
    const a = after < 0 ? this.remoteSamples.at(-1)! : this.remoteSamples[Math.max(0, after - 1)];
    const b = after < 0 ? a : this.remoteSamples[after];
    const alpha = b.at > a.at ? Math.min(1, Math.max(0, (time - a.at) / (b.at - a.at))) : 1;
    const values = new Map<string, { previous: KartState; state: KartState; alpha: number }>();
    const localIds = this.localIds;
    for (const kart of this.race.karts) {
      if (kart.players.some(id => id !== null && localIds.has(id))) continue;
      const previous = a.poses.get(kart.id), state = b.poses.get(kart.id);
      if (!previous || !state) continue;
      const snap = state.recoveries !== previous.recoveries || Math.hypot(state.x - previous.x, state.z - previous.z) > 35;
      values.set(kart.id, { previous: snap ? state : previous, state, alpha: snap ? 1 : alpha });
    }
    return values;
  }

  private keepEvents(events: readonly RaceEvent[]): void {
    for (const event of events) {
      const key = `${this.epoch}:${event.tick}:${event.type}:${event.kartId}:${event.effectId ?? ""}:${event.targetId ?? ""}:${event.value ?? ""}`;
      if (this.eventKeys.has(key)) continue;
      this.eventKeys.add(key);
      this.eventOrder.push(key);
      if (this.eventOrder.length > 512) this.eventKeys.delete(this.eventOrder.shift()!);
      this.pendingEvents.push(event);
      if (this.pendingEvents.length > 512) this.pendingEvents.shift();
    }
  }

  advance(elapsed: number, localInputs: Readonly<Record<string, PlayerInput>>, _onStep?: (race: RaceState) => void): SessionFrame {
    const room = this.network.room;
    if (this.disposed || !room || (room.phase !== "racing" && room.phase !== "results") || !this.network.connection.connected ||
      this.network.connection.serverNow() < this.resumeAt) { this.resetClock(); return this.paused(); }
    if (this.race.phase === "finished" && this.finished) {
      this.resetClock();
      if (this.network.isAuthority) {
        if (this.now() - this.lastPublishedAt >= 500) {
          const acks = this.network.getSnapshotAcks();
          if (this.publishedSequence === null || this.network.connectedPeers.some(id =>
            !acks.has(id) || sequenceIsNewer(this.publishedSequence!, acks.get(id)!))) this.publish();
        }
        if (room.phase === "racing") { this.publishCheckpoint(); this.finishRound(); }
      }
      return this.takeFrame(1);
    }
    if (room.phase === "results") { this.resetClock(); return this.paused(); }
    const alpha = this.clock.advance(elapsed * (this.network.isAuthority ? 1 : this.predictionScale), () => {
      if (this.finished) return;
      const seated = new Set(this.race.karts.flatMap(kart => kart.players));
      const samples = [...this.identities].flatMap(([local, playerId]) => seated.has(playerId) && localInputs[local] ? [{
        playerId, tick: this.race.tick + 1, input: localInputs[local],
      }] : []);
      if (samples.length) this.network.sendInputs(samples);
      if (this.network.isAuthority) {
        this.waiting = false;
        this.remember();
        const inputs = this.authorityInputs();
        const events = stepRace(this.race, inputs);
        this.keepEvents(events);
        if (events.length) {
          this.network.broadcastEvent(events);
          this.eventBatchesPublished++;
        }
        if (this.race.tick % 3 === 0 || this.race.phase === "finished") this.publish();
        this.publishCheckpoint();
      } else {
        if (this.latestSnapshot && this.now() - this.latestSnapshotAt > 1000) this.waiting = true;
        if (this.waiting || !this.latestSnapshot || this.race.tick >= this.latestSnapshot.tick + 12 || this.race.phase === "finished") return;
        this.remember();
        const inputs = this.predictionInputs(this.race);
        for (const [local, playerId] of this.identities) {
          if (localInputs[local]) inputs[playerId] = localInputs[local];
          else delete inputs[playerId];
        }
        // Continuous engine/drift feedback follows prediction; discrete feedback is authoritative.
        stepRace(this.race, inputs);
      }
    });
    return this.takeFrame(alpha);
  }
  private takeFrame(alpha: number): SessionFrame {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return { race: this.race, previous: this.previous, alpha, events, remote: this.remotePoses() };
  }
  paused(): SessionFrame { return { race: this.race, previous: this.previous, alpha: 1, events: [] }; }
  metrics() {
    return {
      authority: this.network.isAuthority, epoch: this.epoch, rttMs: this.rtt, bytesSent: this.bytesSent, bytesReceived: this.bytesReceived,
      snapshotsSent: this.snapshotsSent, snapshotsDropped: this.snapshotsDropped, maximumSnapshotBytes: this.maximumSnapshotBytes,
      predictionTicks: this.latestSnapshot ? this.race.tick - this.latestSnapshot.tick : 0,
      peers: Math.max(this.peers.size, this.network.connectedPeers.length), waiting: this.waiting,
      checkpointTick: this.network.room?.checkpoint?.tick ?? null, restoreCount: this.restoreCount,
      courseVersion: getCourse(this.race.options.courseId).version,
      eventBatchesPublished: this.eventBatchesPublished, eventBatchesReceived: this.eventBatchesReceived,
      receivedEventCounts: Object.fromEntries(this.receivedEventCounts),
    };
  }
  dispose(): void { this.disposed = true; this.unsubscribe(); this.queued.clear(); this.pendingEvents = []; }
}
