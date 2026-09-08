import { BODY_IDS, CHARACTER_IDS, DEFAULT_BUILD, PAINT_IDS } from "../../../packages/content/src/catalog-types.ts";
import { CHARACTERS, CUPS, availableSeries } from "../../../packages/content/src/index.ts";
import { appendSeriesResults, createSeries, nextSeriesCourse } from "../../../packages/simulation/src/series-metadata.ts";
import {
  DEFAULT_LOBBY, NETWORK_VERSION, RESERVATION_MS, ROOM_IDLE_MS, ROOM_MAX_BYTES, ROOM_TTL_MS, SIGNAL_MAX_BYTES,
  byteLength, isTerminalRound, json, parseClientMessage, parseRoom,
  type ClientMessage, type Participant, type Room, type RoomRound, type ServerMessage,
} from "@kartsick/protocol";

export interface RoomSocket { send(message: ServerMessage): void; close(code: number, reason: string): void }
interface MemberSecret { participantId: string; tokenHash: string; connectionId: string | null }
interface Connection { socket: RoomSocket; openedAt: number; tokens: number; refilledAt: number }
export interface StoredRoom {
  room: Room;
  secrets: MemberSecret[];
  lastActivity: number;
  holders: string[];
  pendingHolders: string[];
  migrationDeadline: number | null;
  lastProposalAt: number;
  committedAt: number;
  rates: Record<string, { openedAt: number; tokens: number; refilledAt: number }>;
}
export class RoomError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}
function fail(code: string, message: string): never { throw new RoomError(code, message); }
export function randomHex(bytes = 16): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map(n => n.toString(16).padStart(2, "0")).join("");
}
export function newRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return [...crypto.getRandomValues(new Uint8Array(8))].map(n => alphabet[n % alphabet.length]).join("");
}
async function hashToken(token: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))]
    .map(n => n.toString(16).padStart(2, "0")).join("");
}
export class TokenBucket {
  private tokens: number;
  private updated: number;
  constructor(private readonly capacity: number, private readonly perSecond: number, now = Date.now()) { this.tokens = capacity; this.updated = now; }
  take(now = Date.now()): boolean {
    this.tokens = Math.min(this.capacity, this.tokens + Math.max(0, now - this.updated) * this.perSecond / 1000);
    this.updated = now;
    if (this.tokens < 1) return false;
    this.tokens--; return true;
  }
}

/** Bounded room/checkpoint/result metadata only. This service never runs the race simulation. */
export class RoomEngine {
  private readonly connections = new Map<string, Connection>();
  private serial: Promise<void> = Promise.resolve();
  readonly state: StoredRoom;
  expired = false;
  constructor(code: string, private readonly now: () => number = Date.now, saved?: StoredRoom) {
    // Changed inventory, recovery or course geometry invalidates old checkpoints, not room seats.
    if (saved && [2, 3, 4].includes(Number(saved.room.version))) {
      saved = {
        ...saved,
        room: {
          ...saved.room, version: NETWORK_VERSION, epoch: saved.room.epoch + 1, phase: "lobby", authorityId: null,
          startAt: null, checkpoint: null, pendingCheckpoint: null, round: null, series: null, lastRound: null,
          participants: saved.room.participants.map(p => ({ ...p, players: p.players.map(player => ({ ...player, ready: false })) })),
          reason: "Room protocol updated. Seats were retained, but the unverified previous race was ended without results. Ready again.",
        },
        holders: [], pendingHolders: [], migrationDeadline: null, committedAt: 0, lastProposalAt: 0,
      };
    }
    this.state = saved ? { ...saved, room: parseRoom(saved.room) } : {
      room: { version: NETWORK_VERSION, code, revision: 0, expiresAt: now() + ROOM_TTL_MS, phase: "lobby",
        hostId: null, authorityId: null, epoch: 0, participants: [],
        karts: Array.from({ length: 8 }, (_, index) => ({
          build: {
            ...structuredClone(DEFAULT_BUILD), characters: [CHARACTER_IDS[index], CHARACTER_IDS[(index + 1) % CHARACTER_IDS.length]],
            body: BODY_IDS[index], paint: PAINT_IDS[index % PAINT_IDS.length],
          },
          seats: [null, null],
        })),
        config: { ...DEFAULT_LOBBY }, startAt: null, seed: 0, checkpoint: null, pendingCheckpoint: null,
        round: null, series: null, lastRound: null, reason: null },
      secrets: [], lastActivity: now(), holders: [], pendingHolders: [], migrationDeadline: null, lastProposalAt: 0, committedAt: 0, rates: {},
    };
  }
  get room(): Room { return this.state.room; }
  export(): StoredRoom {
    this.state.rates = Object.fromEntries([...this.connections].map(([id, c]) => [id, {
      openedAt: c.openedAt, tokens: c.tokens, refilledAt: c.refilledAt,
    }]));
    return structuredClone(this.state);
  }
  connect(connectionId: string, socket: RoomSocket): boolean {
    this.tick();
    if (this.expired) { socket.close(1008, "Room expired."); return false; }
    if (this.connections.size >= 24) { socket.close(1013, "Room connection limit reached."); return false; }
    this.connections.set(connectionId, { socket, openedAt: this.now(), tokens: 80, refilledAt: this.now() });
    return true;
  }
  /** Rebind hibernated sockets without joining again or rotating a credential. */
  reattach(connectionId: string, socket: RoomSocket): void {
    this.connections.set(connectionId, { socket, ...(this.state.rates[connectionId] ??
      { openedAt: this.now(), tokens: 20, refilledAt: this.now() }) });
  }
  receive(connectionId: string, raw: string): Promise<void> {
    const operation = this.serial.then(() => this.handle(connectionId, raw));
    this.serial = operation.catch(() => undefined);
    return operation;
  }
  private async handle(connectionId: string, raw: string): Promise<void> {
    this.tick();
    const connection = this.connections.get(connectionId);
    if (!connection || this.expired) return;
    let requestId: string | null = null;
    try {
      if (byteLength(raw) > SIGNAL_MAX_BYTES) {
        this.sendError(connectionId, null, "message-too-large", "Signaling messages are limited to 24 KiB.");
        this.close(connectionId, 1009, "Message too large."); return;
      }
      connection.tokens = Math.min(80, connection.tokens + Math.max(0, this.now() - connection.refilledAt) * 20 / 1000);
      connection.refilledAt = this.now();
      if (connection.tokens < 1) {
        this.sendError(connectionId, null, "rate-limited", "Too many room messages. Reconnect in a moment.");
        this.close(connectionId, 1008, "Room message rate exceeded."); return;
      }
      connection.tokens--;
      const message = parseClientMessage(json(raw, SIGNAL_MAX_BYTES));
      requestId = message.requestId;
      if (message.type === "join") {
        await this.join(connectionId, message); return;
      }
      const secret = this.state.secrets.find(s => s.connectionId === connectionId);
      const participant = this.room.participants.find(p => p.id === secret?.participantId);
      if (!participant) fail("join-required", "Join the room before sending commands.");
      this.state.lastActivity = this.now();
      const changed = this.command(participant, connectionId, message);
      this.send(connectionId, { version: NETWORK_VERSION, type: "ok", requestId });
      if (changed) this.broadcast();
    } catch (error) {
      if (error instanceof RoomError) this.sendError(connectionId, requestId, error.code, error.message);
      else {
        this.sendError(connectionId, requestId, "invalid-message", "Malformed message or unsupported protocol version.");
        this.close(connectionId, 1008, "Invalid room message.");
      }
    }
  }
  private async join(connectionId: string, message: Extract<ClientMessage, { type: "join" }>): Promise<void> {
    if (this.state.secrets.some(s => s.connectionId === connectionId)) fail("already-joined", "This connection already joined.");
    const digest = message.resume === null ? null : await hashToken(message.resume);
    const found = this.state.secrets.find(s => s.tokenHash === digest);
    const existing = this.room.participants.find(p => p.id === found?.participantId);
    if (message.resume !== null && !existing) fail("resume-expired", "Your 60-second seat reservation ended. Join as a spectator or for the next race.");
    const resume = randomHex(32);
    const tokenHash = await hashToken(resume);
    // Hashing can yield to socket closure; never create a ghost member afterward.
    if (!this.connections.has(connectionId) || this.expired) return;
    let participant: Participant;
    if (existing && found) {
      if (!existing.connected && (existing.reservedUntil ?? 0) <= this.now()) fail("resume-expired", "Your seat reservation expired.");
      const previous = found.connectionId;
      // A replacement page has no implicit authority state, even when it has the credential.
      if (previous && previous !== connectionId) this.close(previous, 1000, "Resumed in a new connection.");
      found.connectionId = connectionId;
      found.tokenHash = tokenHash;
      participant = existing;
      participant.connected = true; participant.reservedUntil = null;
    } else {
      const humans = this.room.participants.reduce((sum, p) => sum + p.players.length, 0);
      if (humans + message.names.length > 16) fail("room-full", "This room already reserves its sixteen human places, including spectators.");
      participant = { id: randomHex(), players: message.names.map(name => ({ id: randomHex(), name, ready: false })),
        connected: true, reservedUntil: null, ...message.capability };
      this.room.participants.push(participant);
      this.state.secrets.push({ participantId: participant.id, tokenHash, connectionId });
    }
    Object.assign(participant, message.capability);
    this.state.lastActivity = this.now();
    if (!this.room.hostId) this.room.hostId = participant.id;
    if (!this.room.authorityId && this.room.phase === "lobby") this.room.authorityId = this.chooseCapable()?.id ?? null;
    this.checkAuthority();
    this.room.revision++;
    this.send(connectionId, { version: NETWORK_VERSION, type: "welcome", participantId: participant.id, resume, resumed: Boolean(existing), room: this.room });
    this.broadcast();
  }
  private command(p: Participant, connectionId: string, m: Exclude<ClientMessage, { type: "join" }>): boolean {
    const host = () => { if (this.room.hostId !== p.id) fail("host-only", "Only the room host can do that."); };
    const lobby = () => { if (this.room.phase !== "lobby") fail("race-in-progress", "Late arrivals spectate. Change seats and players in the lobby."); };
    const epoch = (value: number) => { if (value !== this.room.epoch) fail("stale-epoch", "That message belongs to an old authority."); };
    const authority = () => { if (this.room.authorityId !== p.id) fail("authority-only", "Only the current authority can do that."); };
    switch (m.type) {
      case "ping":
        this.send(connectionId, { version: NETWORK_VERSION, type: "pong", requestId: m.requestId, serverTime: this.now() }); return false;
      case "leave":
        this.send(connectionId, { version: NETWORK_VERSION, type: "ok", requestId: m.requestId });
        this.remove(p.id); this.close(connectionId, 1000, "Left room."); this.electHost(); this.checkAuthority(); return true;
      case "players": {
        lobby();
        const humans = this.room.participants.reduce((sum, entry) => sum + entry.players.length, 0) - p.players.length + m.names.length;
        if (humans > 16) fail("room-full", "The sixteen-human limit includes spectators and reservations.");
        for (const removed of p.players.slice(m.names.length)) this.unseat(removed.id);
        p.players = m.names.map((name, index) => ({ id: p.players[index]?.id ?? randomHex(), name, ready: false }));
        this.clearReady(); return true;
      }
      case "seat": {
        lobby();
        if (!p.players.some(player => player.id === m.playerId)) fail("seat-owner", "You can only seat your own local players.");
        if (m.seat && this.room.karts[m.seat.kart].seats[m.seat.side] !== null &&
          this.room.karts[m.seat.kart].seats[m.seat.side] !== m.playerId) fail("seat-taken", "That seat is occupied or reserved.");
        this.unseat(m.playerId);
        if (m.seat) this.room.karts[m.seat.kart].seats[m.seat.side] = m.playerId;
        this.clearReady(); return true;
      }
      case "ready": {
        lobby(); const player = p.players.find(player => player.id === m.playerId);
        if (!player) fail("seat-owner", "You can only ready your own local players.");
        if (!this.isSeated(player.id)) fail("spectator", "Choose a seat before readying.");
        player.ready = m.ready; return true;
      }
      case "build": {
        lobby();
        const occupants = this.room.karts[m.kart].seats.filter(s => s !== null);
        if (occupants.length ? !occupants.some(s => p.players.some(player => player.id === s)) : this.room.hostId !== p.id)
          fail("seat-owner", "Only this kart's humans can change its build; the host configures vacant karts.");
        this.room.karts[m.kart].build = m.build; this.clearReady(); return true;
      }
      case "config":
        host(); lobby();
        if (this.room.series) fail("circuit-locked", "Return or rematch to end this circuit before changing race settings.");
        this.room.config = m.config; this.clearReady(); return true;
      case "start": {
        host(); lobby();
        const active = this.room.participants.flatMap(member => member.players.filter(player => this.isSeated(player.id)).map(player => ({ player, member })));
        if (!active.length || active.some(({ player, member }) => !player.ready || !member.connected)) fail("not-ready", "Every seated human must be connected and ready.");
        const selected = this.chooseCapable();
        if (!selected) fail("no-authority", "A visible WebRTC-capable browser is needed to host the race.");
        const definition = this.room.config.mode === "quick" ? null :
          CUPS.find(cup => cup.id === (this.room.config.mode === "tour" ? "tour" : this.room.config.cup))!;
        const schedule = definition?.courses ?? [this.room.config.course];
        if (!availableSeries(schedule)) fail("course-unavailable", "Every course in the selected schedule must be available before this race can start.");
        const series = definition ? this.room.series ?? createSeries(definition.id) : null;
        if (series && series.cup !== definition!.id) fail("circuit-mismatch", "End this circuit before starting a different schedule.");
        const courseId = series ? nextSeriesCourse(series) : this.room.config.course;
        if (courseId === null) fail("circuit-complete", "This circuit is complete. Choose return or rematch to start a new race.");
        this.room.series = series;
        this.room.config.course = courseId;
        this.room.round = { id: randomHex(), courseId, roster: this.roundRoster() };
        this.room.authorityId = selected.id; this.room.epoch++;
        this.room.phase = "racing"; this.room.reason = null; this.room.startAt = this.now() + 3000;
        this.room.seed = crypto.getRandomValues(new Uint32Array(1))[0]; this.resetCheckpoint(); return true;
      }
      case "return": case "rematch": host(); this.returnToLobby(m.type === "rematch" ? "Rematch: choose seats and ready for the next round." : "The host returned everyone to the same lobby."); return true;
      case "finish": {
        epoch(m.epoch); authority();
        if (this.room.phase !== "racing" || !this.room.round || this.room.lastRound?.roundId === this.room.round.id)
          fail("not-racing", "Only an active round may be completed once.");
        if (m.roundId !== this.room.round.id || m.courseId !== this.room.round.courseId || m.courseId !== this.room.config.course)
          fail("round-mismatch", "These results belong to a different round or course.");
        const checkpoint = this.room.checkpoint;
        if (!checkpoint || checkpoint.id !== m.checkpointId || checkpoint.tick !== m.tick)
          fail("checkpoint-mismatch", "Completion must reference the currently committed checkpoint identifier and tick.");
        if (this.room.pendingCheckpoint && this.room.pendingCheckpoint.id !== checkpoint.id)
          fail("checkpoint-pending", "Wait for the terminal checkpoint to be committed before completing the round.");
        if (m.results.length !== this.room.round.roster.length || m.results.some(result =>
          !this.room.round!.roster.some(racer => racer.id === result.id && racer.name === result.name)))
          fail("roster-mismatch", "Results must contain exactly the stable kart slots and names captured at this round's start.");
        if (m.results.some(result => result.time !== null && result.time > checkpoint.tick / 60))
          fail("invalid-results", "A finish time cannot exceed the committed simulation tick.");
        if (this.room.series && nextSeriesCourse(this.room.series) !== m.courseId)
          fail("circuit-mismatch", "Only the next scheduled circuit course can be completed.");
        // This is the trusted authority's terminal attestation, not verification of a simulation body.
        const series = this.room.series ? appendSeriesResults(this.room.series, m.courseId, m.results) : null;
        const lastRound = {
          roundId: m.roundId, courseId: m.courseId,
          checkpoint: { id: checkpoint.id, tick: checkpoint.tick, digest: checkpoint.digest },
          results: structuredClone(m.results),
        };
        const reason = "Completed results accepted from the simulation authority and retained with their committed checkpoint.";
        if (byteLength(JSON.stringify({ ...this.room, series, lastRound, phase: "results", startAt: null,
          pendingCheckpoint: null, reason })) > ROOM_MAX_BYTES) fail("room-metadata-limit", "Completed room metadata exceeds the bounded signaling budget.");
        this.room.series = series; this.room.lastRound = lastRound;
        this.room.phase = "results"; this.room.startAt = null; this.room.pendingCheckpoint = null;
        this.state.pendingHolders = []; this.state.migrationDeadline = null;
        this.room.reason = reason;
        return true;
      }
      case "next-course": {
        host(); epoch(m.epoch);
        if (this.room.phase !== "results" || !isTerminalRound(this.room) || m.roundId !== this.room.lastRound?.roundId)
          fail("round-mismatch", "Advance only the currently completed round.");
        if (!this.room.series) fail("not-a-circuit", "Quick races have no next circuit course. Choose rematch instead.");
        const course = nextSeriesCourse(this.room.series);
        if (!course) fail("circuit-complete", "The final circuit scoreboard is complete; there is no next course.");
        const definition = CUPS.find(cup => cup.id === this.room.series!.cup)!;
        if (!availableSeries(definition.courses)) fail("course-unavailable", "The complete circuit schedule is no longer available.");
        this.room.epoch++; this.room.phase = "lobby"; this.room.startAt = null; this.room.round = null;
        this.room.config.course = course; this.room.authorityId = this.chooseCapable()?.id ?? null;
        this.resetCheckpoint(); this.clearReady();
        this.room.reason = "Next circuit course: kart slots and standings are retained. Seat new players and ready up.";
        return true;
      }
      case "capability": {
        Object.assign(p, m.capability);
        if (this.room.phase === "lobby") this.room.authorityId = this.chooseCapable()?.id ?? null;
        else this.checkAuthority();
        return true;
      }
      case "signal": {
        epoch(m.epoch);
        const target = this.state.secrets.find(s => s.participantId === m.to && s.connectionId);
        if (!target?.connectionId || m.to === p.id) fail("peer-unavailable", "That browser is not connected.");
        if (p.id !== this.room.authorityId && m.to !== this.room.authorityId) fail("not-authority-edge", "Race transport is a star, not a peer mesh.");
        this.send(target.connectionId, { version: NETWORK_VERSION, type: "signal", from: p.id, epoch: m.epoch, attempt: m.attempt, signal: m.signal });
        return false;
      }
      case "checkpoint-propose": {
        epoch(m.epoch); authority();
        if (this.room.phase !== "racing") fail("not-racing", "Checkpoint publication requires an active race.");
        if (this.now() - this.state.lastProposalAt < 500) fail("checkpoint-rate", "Publish at most two committed checkpoints per second.");
        const previous = this.room.pendingCheckpoint ?? this.room.checkpoint;
        if (previous && (m.checkpoint.tick <= previous.tick || m.checkpoint.id === previous.id))
          fail("old-checkpoint", "Checkpoints must advance the race tick with a new identifier.");
        if (m.checkpoint.acks.some(ack => !this.room.participants.some(member => member.players.some(player => player.id === ack.playerId))))
          fail("invalid-acks", "Checkpoint acknowledgments must identify room players.");
        this.state.lastProposalAt = this.now(); this.room.pendingCheckpoint = m.checkpoint;
        this.state.pendingHolders = [p.id]; this.commitIfReplicated(); return true;
      }
      case "checkpoint-have": {
        epoch(m.epoch);
        if (isTerminalRound(this.room)) {
          const checkpoint = this.room.checkpoint!;
          if (checkpoint.id !== m.checkpointId || checkpoint.digest !== m.digest)
            fail("checkpoint-mismatch", "That is not the accepted terminal checkpoint.");
          if (!this.state.holders.includes(p.id)) this.state.holders.push(p.id);
          this.checkAuthority();
          return true;
        }
        const pending = this.room.pendingCheckpoint;
        if (!pending || pending.id !== m.checkpointId || pending.digest !== m.digest) fail("checkpoint-mismatch", "That checkpoint is no longer pending.");
        if (!this.state.pendingHolders.includes(p.id)) this.state.pendingHolders.push(p.id);
        this.commitIfReplicated(); return true;
      }
      case "migration-ready": {
        epoch(m.epoch); authority();
        if (this.room.phase !== "migrating" || this.room.checkpoint?.id !== m.checkpointId || !this.state.holders.includes(p.id))
          fail("checkpoint-mismatch", "The committed checkpoint was not restored.");
        const terminal = isTerminalRound(this.room);
        this.room.phase = terminal ? "results" : "racing";
        this.room.reason = terminal ? "The completed checkpoint was restored; terminal results remain final." : "Authority transferred from the last committed checkpoint.";
        this.room.startAt = terminal ? null : this.now() + 1000; this.state.migrationDeadline = null; return true;
      }
      case "migration-failed":
        epoch(m.epoch); authority();
        if (this.room.phase !== "migrating") fail("not-migrating", "There is no authority transfer to fail.");
        if (isTerminalRound(this.room)) {
          this.state.holders = this.state.holders.filter(id => id !== p.id);
          this.keepResults("Completed scoreboard retained. The terminal simulation checkpoint could not be restored.");
        } else this.returnToLobby("Authority transfer could not restore the committed checkpoint. No results were generated for this round.", false);
        return true;
      case "transport-failed": {
        epoch(m.epoch);
        if (p.id !== this.room.authorityId && m.peerId !== this.room.authorityId) fail("not-authority-edge", "Not your authority connection.");
        if (!this.room.participants.some(member => member.id === m.peerId)) fail("peer-unavailable", "Peer left the room.");
        const reason = "Direct WebRTC failed. Relay is disabled pending an enforceable total budget. Reconnect in this lobby; no race results were generated.";
        if (isTerminalRound(this.room)) this.keepResults("Completed scoreboard retained. Peer transport failed; the finished simulation may be unavailable.");
        else if (this.room.phase !== "lobby") this.returnToLobby(reason, false);
        else this.room.reason = reason;
        return true;
      }
    }
  }
  private commitIfReplicated(): void {
    const connected = this.room.participants.filter(p => p.connected);
    const holders = connected.filter(p => this.state.pendingHolders.includes(p.id));
    if (this.room.pendingCheckpoint && (holders.length >= 2 ||
      connected.length === 1 && holders.length === 1 && holders[0].id === this.room.authorityId)) {
      if (this.room.checkpoint?.id !== this.room.pendingCheckpoint.id) this.state.committedAt = this.now();
      this.room.checkpoint = this.room.pendingCheckpoint;
      this.state.holders = holders.map(p => p.id);
      // Keep the committed proposal visible so later receivers can acknowledge it.
    }
  }
  private resetCheckpoint(): void {
    this.room.checkpoint = null; this.room.pendingCheckpoint = null;
    this.state.holders = []; this.state.pendingHolders = []; this.state.migrationDeadline = null; this.state.lastProposalAt = 0; this.state.committedAt = 0;
  }
  private chooseCapable(exclude?: string): Participant | undefined {
    return this.room.participants.find(p => p.id !== exclude && p.connected && p.visible && p.capable);
  }
  private roundRoster(): RoomRound["roster"] {
    const names = new Map(this.room.participants.flatMap(p => p.players.map(player => [player.id, player.name] as const)));
    return this.room.karts.flatMap((kart, index) => {
      if (!this.room.config.bots && kart.seats.every(seat => seat === null)) return [];
      const humans = kart.seats.flatMap(seat => seat ? [names.get(seat)!] : []);
      const name = (humans.length ? humans.join(" & ") :
        `${CHARACTERS.find(character => character.id === kart.build.characters[0])!.name} & co.`).slice(0, 32);
      return [{ id: `online-kart-${index + 1}`, name }];
    });
  }
  private clearReady(): void { for (const p of this.room.participants) for (const player of p.players) player.ready = false; }
  private isSeated(playerId: string): boolean { return this.room.karts.some(kart => kart.seats.includes(playerId)); }
  private unseat(playerId: string): void {
    for (const kart of this.room.karts) kart.seats = [kart.seats[0] === playerId ? null : kart.seats[0], kart.seats[1] === playerId ? null : kart.seats[1]];
  }
  private remove(participantId: string): void {
    const p = this.room.participants.find(p => p.id === participantId);
    for (const player of p?.players ?? []) this.unseat(player.id);
    this.room.participants = this.room.participants.filter(p => p.id !== participantId);
    this.state.secrets = this.state.secrets.filter(s => s.participantId !== participantId);
    this.state.holders = this.state.holders.filter(id => id !== participantId);
    this.state.pendingHolders = this.state.pendingHolders.filter(id => id !== participantId);
  }
  private electHost(): void {
    if (!this.room.participants.some(p => p.id === this.room.hostId && p.connected))
      this.room.hostId = this.room.participants.find(p => p.connected)?.id ?? null;
  }
  private checkAuthority(): void {
    if (this.room.phase === "lobby") { this.room.authorityId = this.chooseCapable()?.id ?? null; return; }
    this.commitIfReplicated();
    const current = this.room.participants.find(p => p.id === this.room.authorityId);
    if (isTerminalRound(this.room)) {
      if (current?.connected && current.visible && current.capable && this.state.holders.includes(current.id)) return;
      const candidate = this.room.participants.find(p => p.connected && p.visible && p.capable && this.state.holders.includes(p.id));
      if (candidate) {
        this.room.epoch++; this.room.authorityId = candidate.id; this.room.phase = "migrating"; this.room.startAt = null;
        this.room.reason = "Restoring the accepted terminal checkpoint. The completed scoreboard is already retained.";
        this.state.migrationDeadline = this.now() + 12_000;
      } else if (this.room.phase !== "results" || this.room.authorityId !== null) {
        this.keepResults("Completed scoreboard retained. No connected visible checkpoint holder survives; the finished simulation cannot currently be restored.");
      }
      return;
    }
    if (current?.connected && current.visible && current.capable) {
      if (this.room.phase === "paused") {
        this.room.phase = "racing"; this.room.startAt = this.now() + 1000; this.room.reason = "The visible authority resumed.";
      }
      return;
    }
    const candidate = this.room.participants.find(p => this.now() - this.state.committedAt <= 5000 && p.connected && p.visible && p.capable &&
      p.id !== current?.id && this.state.holders.includes(p.id));
    if (candidate && this.room.checkpoint) {
      this.room.epoch++; this.room.authorityId = candidate.id; this.room.phase = "migrating";
      this.room.reason = "Race paused while a visible browser restores the committed checkpoint.";
      this.room.pendingCheckpoint = this.room.checkpoint; this.state.pendingHolders = [...this.state.holders];
      this.state.migrationDeadline = this.now() + 12_000; return;
    }
    if (current?.connected && current.capable) {
      if (this.room.phase !== "paused") this.room.epoch++;
      this.room.phase = "paused"; this.room.reason = "Race paused: no visible browser has a committed checkpoint to take authority.";
      return;
    }
    this.returnToLobby("Authority was lost without a valid replicated checkpoint. Everyone stays in this lobby; no race results were generated for this round.", false);
  }
  private keepResults(reason: string): void {
    if (this.room.phase !== "results" || this.room.authorityId !== null) this.room.epoch++;
    this.room.phase = "results"; this.room.authorityId = null; this.room.startAt = null;
    this.room.pendingCheckpoint = null; this.state.pendingHolders = []; this.state.migrationDeadline = null; this.room.reason = reason;
  }
  private returnToLobby(reason: string, resetSeries = true): void {
    this.room.epoch++; this.room.phase = "lobby"; this.room.startAt = null;
    this.room.round = null;
    if (resetSeries) {
      this.room.series = null; this.room.lastRound = null;
      if (this.room.config.mode !== "quick") this.room.config.course =
        CUPS.find(cup => cup.id === (this.room.config.mode === "tour" ? "tour" : this.room.config.cup))!.courses[0];
    }
    this.room.authorityId = this.chooseCapable()?.id ?? null; this.room.reason = reason;
    this.resetCheckpoint(); this.clearReady();
  }
  disconnect(connectionId: string): void {
    if (!this.connections.delete(connectionId)) return;
    const secret = this.state.secrets.find(s => s.connectionId === connectionId);
    const participant = this.room.participants.find(p => p.id === secret?.participantId);
    if (!secret || !participant) return;
    secret.connectionId = null; participant.connected = false; participant.reservedUntil = this.now() + RESERVATION_MS;
    // A resumed page must explicitly acknowledge possession; credentials are not a checkpoint.
    this.state.holders = this.state.holders.filter(id => id !== participant.id);
    this.state.pendingHolders = this.state.pendingHolders.filter(id => id !== participant.id);
    this.state.lastActivity = this.now();
    this.electHost(); this.checkAuthority(); this.broadcast();
  }
  tick(): void {
    if (this.expired) return;
    let changed = false;
    for (const [id, c] of this.connections) {
      if (this.now() - c.openedAt > 5000 && !this.state.secrets.some(s => s.connectionId === id)) this.close(id, 1008, "Join timed out.");
    }
    for (const p of [...this.room.participants]) {
      if (!p.connected && (p.reservedUntil ?? Infinity) <= this.now()) { this.remove(p.id); changed = true; }
    }
    if (this.state.migrationDeadline !== null && this.now() >= this.state.migrationDeadline) {
      if (isTerminalRound(this.room)) {
        this.state.holders = this.state.holders.filter(id => id !== this.room.authorityId);
        this.keepResults("Completed scoreboard retained. Restoring the terminal simulation timed out.");
      } else this.returnToLobby("Authority transfer timed out. The race was not finished; ready again in the same lobby.", false);
      changed = true;
    }
    if (this.now() >= this.room.expiresAt || (!this.connections.size && this.now() - this.state.lastActivity >= ROOM_IDLE_MS)) {
      this.expired = true;
      for (const [id] of this.connections) this.close(id, 1000, "Room expired.");
      return;
    }
    if (changed) { this.electHost(); this.checkAuthority(); this.broadcast(); }
  }
  nextAlarm(): number {
    return Math.min(this.room.expiresAt,
      this.state.migrationDeadline ?? Infinity,
      ...this.room.participants.filter(p => !p.connected).map(p => p.reservedUntil ?? Infinity),
      ...[...this.connections].filter(([id]) => !this.state.secrets.some(s => s.connectionId === id)).map(([, c]) => c.openedAt + 5001),
      !this.connections.size ? this.state.lastActivity + ROOM_IDLE_MS : Infinity);
  }
  private close(connectionId: string, code: number, reason: string): void {
    const c = this.connections.get(connectionId);
    this.disconnect(connectionId);
    try { c?.socket.close(code, reason); } catch { /* Already closed by the transport. */ }
  }
  shutdown(): void {
    this.expired = true;
    for (const [id] of this.connections) this.close(id, 1001, "Signaling service stopped.");
  }
  private send(connectionId: string, message: ServerMessage): void {
    try {
      if (byteLength(JSON.stringify(message)) > SIGNAL_MAX_BYTES) {
        this.close(connectionId, 1009, "Room message exceeds its signaling budget.");
        return;
      }
      this.connections.get(connectionId)?.socket.send(message);
    }
    catch { this.close(connectionId, 1013, "Signaling consumer too slow."); }
  }
  private sendError(connectionId: string, requestId: string | null, code: string, message: string): void {
    this.send(connectionId, { version: NETWORK_VERSION, type: "error", requestId, code, message });
  }
  private broadcast(): void {
    this.room.revision++;
    for (const s of this.state.secrets) if (s.connectionId) this.send(s.connectionId, { version: NETWORK_VERSION, type: "room", room: this.room });
  }
}
