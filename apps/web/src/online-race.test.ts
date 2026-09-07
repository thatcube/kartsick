import { describe, expect, it } from "vitest";
import { DEFAULT_BUILD } from "@kartsick/content";
import { NEUTRAL_PLAYER, copyRace, parseRaceState, stepRace } from "@kartsick/simulation";
import type { RaceState } from "@kartsick/simulation";
import { DEFAULT_LOBBY, sequenceIsNewer } from "@kartsick/protocol";
import type { Checkpoint, InputAck, PlayerInputFrame, Room } from "@kartsick/protocol";
import type { NetworkEvent } from "./network";
import { OnlineRaceSession, roomRace } from "./online-race";
import type { RacingTransport } from "./online-race";

function room(): Room {
  return {
    version: 2, code: "ABCDEFGH", revision: 1, expiresAt: 100000, phase: "racing", hostId: "host", authorityId: "host", epoch: 1,
    participants: [
      { id: "host", players: [{ id: "one", name: "One", ready: true }], connected: true, visible: true, capable: true, reservedUntil: null },
      { id: "guest", players: [{ id: "two", name: "Two", ready: true }], connected: true, visible: true, capable: true, reservedUntil: null },
    ],
    karts: Array.from({ length: 8 }, (_, index) => ({ build: structuredClone(DEFAULT_BUILD), seats: index === 0 ? ["one", null] : index === 1 ? ["two", null] : [null, null] })),
    config: { ...DEFAULT_LOBBY, bots: false }, startAt: 3000, seed: 42, checkpoint: null, pendingCheckpoint: null, reason: null,
  };
}
class Transport implements RacingTransport {
  room = room();
  participantId = "host";
  isAuthority = true;
  connectedPeers = ["guest"];
  time = 0;
  connection = { connected: true, serverNow: () => this.time };
  incoming: PlayerInputFrame[] = [];
  history: PlayerInputFrame[] = [];
  snapshots: { state: RaceState; tick: number; acks: InputAck[] }[] = [];
  checkpoints: Checkpoint<RaceState>[] = [];
  private sequences = new Map<string, number>();
  private listeners = new Set<(event: NetworkEvent<RaceState, never>) => void>();
  subscribe(listener: (event: NetworkEvent<RaceState, never>) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  emit(event: NetworkEvent<RaceState, never>) {
    if (event.type === "snapshot") this.history = this.history.filter(frame => {
      const ack = event.acks.find(ack => ack.playerId === frame.playerId);
      return !ack || sequenceIsNewer(frame.sequence, ack.sequence);
    });
    for (const listener of this.listeners) listener(event);
  }
  sendInputs(samples: Parameters<RacingTransport["sendInputs"]>[0]) {
    for (const sample of samples) {
      const sequence = (this.sequences.get(sample.playerId) ?? 0) + 1;
      this.sequences.set(sample.playerId, sequence);
      const frame = { ...sample, sequence };
      this.history.push(frame);
      if (this.isAuthority) this.incoming.push(frame);
    }
    if (this.history.length > 120) this.history.splice(0, this.history.length - 120);
    return true;
  }
  drainInputs() { const value = this.incoming; this.incoming = []; return value; }
  pendingInputs() { return structuredClone(this.history); }
  broadcastSnapshot(state: RaceState, tick: number, acks: InputAck[]) {
    this.snapshots.push({ state: copyRace(state), tick, acks: structuredClone(acks) });
    return { sequence: this.snapshots.length, sent: 1, dropped: 0 };
  }
  async commitCheckpoint(state: RaceState, tick: number, acks: InputAck[]) {
    const checkpoint: Checkpoint<RaceState> = { reference: { id: `cp-${tick}`, tick, acks, digest: "0".repeat(64) }, state };
    this.checkpoints.push(checkpoint);
    return checkpoint;
  }
}

describe("authoritative browser race integration", () => {
  it("keeps eight actual configured builds and both fixed tandem identities", () => {
    const value = room();
    value.config.bots = true;
    value.karts[0].seats = ["one", "two"];
    value.karts[1].seats = [null, null];
    value.karts[7].build.body = "knuckle-bus";
    const state = roomRace(value);
    expect(state.karts).toHaveLength(8);
    expect(state.karts[0].players).toEqual(["one", "two"]);
    expect(state.karts[7].build.body).toBe("knuckle-bus");
    expect(parseRaceState(state)).not.toBeNull();
  });
  it("applies at most one queued sample per human per physics tick and acknowledges only applied samples", () => {
    const network = new Transport();
    const session = new OnlineRaceSession(network, new Map([["local-1", "one"]]), () => {});
    network.incoming.push(...[1, 2, 3, 4].map(sequence => ({
      playerId: "two", sequence, tick: sequence, input: { ...NEUTRAL_PLAYER, throttle: 1 },
    })));
    for (let tick = 0; tick < 3; tick++) session.advance(1 / 60, { "local-1": { ...NEUTRAL_PLAYER } });
    expect(session.race.tick).toBe(3);
    expect(network.snapshots).toHaveLength(1);
    expect(network.snapshots[0].acks.find(ack => ack.playerId === "two")?.sequence).toBe(3);
    expect(network.incoming).toHaveLength(0);
    expect(parseRaceState(network.snapshots[0].state)).not.toBeNull();
    session.dispose();
  });
  it("lets a remaining tandem human drive while the missing rider has no input", () => {
    const network = new Transport();
    network.room.karts[0].seats = ["two", "one"];
    network.room.karts[1].seats = [null, null];
    const session = new OnlineRaceSession(network, new Map([["local-1", "one"]]), () => {});
    for (let tick = 0; tick < 300; tick++) session.advance(1 / 60, { "local-1": { ...NEUTRAL_PLAYER, throttle: 1 } });
    expect(session.race.karts[0].ai).toBe(false);
    expect(session.race.karts[0].missing).toEqual([30, 0]);
    expect(session.race.karts[0].state.speed).toBeGreaterThan(10);
    session.dispose();
  });
  it("never transmits spectator controls as if they owned a racing seat", () => {
    const network = new Transport();
    network.room.karts[0].seats = [null, null];
    const session = new OnlineRaceSession(network, new Map([["local-1", "one"]]), () => {});
    session.advance(1 / 60, { "local-1": { ...NEUTRAL_PLAYER, throttle: 1 } });
    expect(network.history).toHaveLength(0);
    expect(session.race.karts).toHaveLength(1);
    session.dispose();
  });
  it("bounds prediction, retains unacknowledged intent, and waits for an authoritative finish", () => {
    const network = new Transport();
    network.isAuthority = false;
    network.participantId = "guest";
    const session = new OnlineRaceSession(network, new Map([["local-1", "two"]]), () => {}, () => network.time);
    const authoritative = roomRace(network.room);
    for (let tick = 0; tick < 180; tick++) stepRace(authoritative, { one: { ...NEUTRAL_PLAYER }, two: { ...NEUTRAL_PLAYER } });
    network.emit({ type: "snapshot", epoch: 1, sequence: 1, tick: authoritative.tick, acks: [], state: authoritative });
    for (let tick = 0; tick < 30; tick++) {
      network.time += 1000 / 60;
      session.advance(1 / 60, { "local-1": { ...NEUTRAL_PLAYER, throttle: 1 } });
    }
    expect(session.metrics().predictionTicks).toBe(12);
    expect(session.metrics().waiting).toBe(false);
    network.time = 1100;
    session.advance(1 / 60, {});
    expect(session.metrics().waiting).toBe(true);
    expect(network.history.length).toBeGreaterThan(12);
    session.race.phase = "finished";
    expect(session.finished).toBe(false);
    for (let tick = 0; tick < 30000 && authoritative.phase !== "finished"; tick++) stepRace(authoritative, {});
    expect(parseRaceState(authoritative)).not.toBeNull();
    expect(authoritative.phase).toBe("finished");
    network.emit({ type: "snapshot", epoch: 1, sequence: 2, tick: authoritative.tick, acks: [{ playerId: "two", sequence: 30 }], state: authoritative });
    expect(session.finished).toBe(true);
    expect(network.history).toHaveLength(0);
    expect(session.race.results).toEqual(authoritative.results);
    session.dispose();
  });
  it("holds physics on signaling loss and restores exact checkpoint state before a host resumes", () => {
    const network = new Transport();
    const session = new OnlineRaceSession(network, new Map([["local-1", "one"]]), () => {});
    for (let tick = 0; tick < 12; tick++) session.advance(1 / 60, { "local-1": { ...NEUTRAL_PLAYER } });
    const checkpoint: Checkpoint<RaceState> = {
      reference: { id: "committed", tick: session.race.tick, digest: "0".repeat(64), acks: [{ playerId: "one", sequence: 12 }] },
      state: copyRace(session.race),
    };
    network.connection.connected = false;
    session.advance(1, { "local-1": { ...NEUTRAL_PLAYER, throttle: 1 } });
    expect(session.race.tick).toBe(12);
    network.connection.connected = true;
    session.restore(checkpoint);
    expect(session.race).toEqual(checkpoint.state);
    expect(session.race).not.toBe(checkpoint.state);
    network.time = 999;
    session.advance(1 / 60, {});
    expect(session.race.tick).toBe(12);
    network.time = 1001;
    session.advance(1 / 60, {});
    expect(session.race.tick).toBe(13);
    session.dispose();
  });
  it("resumes a restored race at the shared server time, not each browser's restoration time", () => {
    const network = new Transport();
    const session = new OnlineRaceSession(network, new Map([["local-1", "one"]]), () => {});
    for (let tick = 0; tick < 12; tick++) session.advance(1 / 60, {});
    const checkpoint: Checkpoint<RaceState> = {
      reference: { id: "committed", tick: session.race.tick, digest: "0".repeat(64), acks: [] },
      state: copyRace(session.race),
    };
    network.room.phase = "migrating";
    network.room.epoch = 2;
    network.emit({ type: "epoch", epoch: 2, authorityId: "host", phase: "migrating", checkpoint: null });
    session.restore(checkpoint);
    network.room.phase = "racing";
    network.room.startAt = 1500;
    network.emit({ type: "epoch", epoch: 2, authorityId: "host", phase: "racing", checkpoint: null });
    network.time = 1001;
    session.advance(1 / 60, {});
    expect(session.race.tick).toBe(12);
    network.time = 1501;
    session.advance(1 / 60, {});
    expect(session.race.tick).toBe(13);
    session.dispose();
  });
  it("accumulates sampled traffic across peers and reconnects instead of reporting the last peer alone", () => {
    const network = new Transport();
    const session = new OnlineRaceSession(network, new Map([["local-1", "one"]]), () => {});
    const quality = (participantId: string, bytesSent: number, bytesReceived: number, rttMs: number) =>
      network.emit({ type: "quality", participantId, bytesSent, bytesReceived, rttMs, route: "direct" });
    quality("guest", 100, 200, 30);
    quality("spectator", 300, 400, 80);
    expect(session.metrics()).toMatchObject({ bytesSent: 400, bytesReceived: 600, rttMs: 80 });
    quality("guest", 150, 225, 30);
    expect(session.metrics()).toMatchObject({ bytesSent: 450, bytesReceived: 625 });
    network.emit({ type: "peer", participantId: "spectator", status: "closed", attempt: 1 });
    expect(session.metrics().rttMs).toBe(30);
    quality("spectator", 25, 10, 90);
    expect(session.metrics()).toMatchObject({ bytesSent: 475, bytesReceived: 635, rttMs: 90 });
    network.emit({ type: "epoch", epoch: 2, authorityId: "host", phase: "migrating", checkpoint: null });
    quality("guest", 15, 10, 20);
    expect(session.metrics()).toMatchObject({ bytesSent: 490, bytesReceived: 645, rttMs: 20 });
    session.dispose();
  });
});
