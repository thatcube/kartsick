import { describe, expect, it } from "vitest";
import { DEFAULT_BUILD } from "@kartsick/content";
import { NEUTRAL_PLAYER, botInput, copyRace, parseRaceState, stepRace } from "@kartsick/simulation";
import type { RaceEvent, RaceState } from "@kartsick/simulation";
import { DEFAULT_LOBBY, NETWORK_VERSION, sequenceIsNewer } from "@kartsick/protocol";
import type { Checkpoint, InputAck, PlayerInputFrame, Room } from "@kartsick/protocol";
import type { NetworkEvent } from "./network";
import { OnlineRaceSession, decodeRaceEventBatch, roomRace } from "./online-race";
import type { RacingTransport } from "./online-race";

function room(): Room {
  return {
    version: NETWORK_VERSION, code: "ABCDEFGH", revision: 1, expiresAt: 100000, phase: "racing", hostId: "host", authorityId: "host", epoch: 1,
    participants: [
      { id: "host", players: [{ id: "one", name: "One", ready: true }], connected: true, visible: true, capable: true, reservedUntil: null },
      { id: "guest", players: [{ id: "two", name: "Two", ready: true }], connected: true, visible: true, capable: true, reservedUntil: null },
    ],
    karts: Array.from({ length: 8 }, (_, index) => ({ build: structuredClone(DEFAULT_BUILD), seats: index === 0 ? ["one", null] : index === 1 ? ["two", null] : [null, null] })),
    config: { ...DEFAULT_LOBBY, bots: false }, startAt: 3000, seed: 42, checkpoint: null, pendingCheckpoint: null, reason: null,
    round: { id: "round-one", courseId: "butterbell", roster: [{ id: "online-kart-1", name: "One" }, { id: "online-kart-2", name: "Two" }] },
    series: null, lastRound: null,
  };
}
class Transport implements RacingTransport {
  room = room();
  participantId = "host";
  isAuthority = true;
  connectedPeers = ["guest"];
  time = 0;
  finishes: Parameters<RacingTransport["connection"]["finishRound"]>[0][] = [];
  finishAttempts = 0;
  finishError: Error | null = null;
  connection = { connected: true, serverNow: () => this.time,
    finishRound: async (command: Parameters<RacingTransport["connection"]["finishRound"]>[0]) => {
      this.finishAttempts++;
      if (this.finishError) throw this.finishError;
      this.finishes.push(structuredClone(command));
    },
  };
  incoming: PlayerInputFrame[] = [];
  history: PlayerInputFrame[] = [];
  snapshots: { state: RaceState; tick: number; acks: InputAck[] }[] = [];
  checkpoints: Checkpoint<RaceState>[] = [];
  events: RaceEvent[][] = [];
  snapshotAcks = new Map<string, number>();
  private sequences = new Map<string, number>();
  private listeners = new Set<(event: NetworkEvent<RaceState, RaceEvent[]>) => void>();
  subscribe(listener: (event: NetworkEvent<RaceState, RaceEvent[]>) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  emit(event: NetworkEvent<RaceState, RaceEvent[]>) {
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
  broadcastEvent(events: RaceEvent[]) { this.events.push(decodeRaceEventBatch(events)); }
  getSnapshotAcks() { return new Map(this.snapshotAcks); }
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

const flush = () => new Promise<void>(resolve => setImmediate(resolve));
async function finishOnline(network: Transport, warnings: string[] = []): Promise<OnlineRaceSession> {
  const session = new OnlineRaceSession(network, new Map([["local-1", "one"]]), message => warnings.push(message), () => network.time);
  for (let tick = 0; tick < 30000 && !session.finished; tick++) {
    network.time += 1000 / 60;
    session.advance(1 / 60, {});
  }
  expect(session.finished).toBe(true);
  await flush();
  session.advance(0, {});
  await flush();
  expect(network.checkpoints.at(-1)?.state.phase).toBe("finished");
  return session;
}

describe("authoritative browser race integration", () => {
  it("freezes input acknowledgments when a multi-step finishing frame has unused callbacks", async () => {
    const network = new Transport();
    const race = roomRace(network.room);
    let before = copyRace(race);
    for (let tick = 0; tick < 30000 && race.phase !== "finished"; tick++) {
      before = copyRace(race);
      stepRace(race, {});
    }
    expect(race.phase).toBe("finished");
    const session = new OnlineRaceSession(network, new Map([["local-1", "one"]]), () => {}, () => network.time);
    session.restore({ reference: { id: "before-finish", tick: before.tick, digest: "0".repeat(64), acks: [] }, state: before });
    network.time = 4000;
    session.advance(2 / 60, { "local-1": botInput(before, before.karts[0]) });
    await flush();
    expect(session.finished).toBe(true);
    const checkpoint = network.checkpoints.at(-1)!;
    expect(checkpoint.state.phase).toBe("finished");
    expect(checkpoint.reference.acks).toEqual([{ playerId: "one", sequence: 1 }]);
    expect(network.history).toHaveLength(1);
    network.time += 1000;
    session.advance(0, {});
    expect(network.snapshots.at(-1)?.acks).toEqual(checkpoint.reference.acks);
    expect(network.snapshots.at(-1)?.state).toEqual(checkpoint.state);
    session.dispose();
  });
  it("waits for commitment, preserves terminal state after departure, and restores results without a fresh race", async () => {
    const network = new Transport(), host = await finishOnline(network);
    const checkpoint = network.checkpoints.at(-1)!;
    network.room.pendingCheckpoint = checkpoint.reference;
    host.advance(0, {});
    expect(network.finishes).toHaveLength(0);
    network.room.checkpoint = checkpoint.reference;
    network.emit({ type: "checkpoint", checkpoint });
    await flush();
    expect(network.finishes).toEqual([{
      epoch: 1, roundId: "round-one", courseId: "butterbell", checkpointId: checkpoint.reference.id,
      tick: checkpoint.reference.tick, results: checkpoint.state.results,
    }]);
    Object.assign(network.room, {
      phase: "results", startAt: null, pendingCheckpoint: null,
      lastRound: { roundId: "round-one", courseId: "butterbell",
        checkpoint: { id: checkpoint.reference.id, tick: checkpoint.reference.tick, digest: checkpoint.reference.digest }, results: checkpoint.state.results },
    });
    network.emit({ type: "epoch", epoch: 1, authorityId: "host", phase: "results", checkpoint });
    const fixed = copyRace(host.race), publications = network.checkpoints.length;
    network.room.participants = network.room.participants.filter(participant => participant.id !== "guest");
    network.room.karts[1].seats = [null, null];
    network.emit({ type: "room", room: network.room });
    network.time += 6500;
    host.advance(10, { "local-1": { ...NEUTRAL_PLAYER, throttle: 1 } });
    expect(host.race).toEqual(fixed);
    expect(network.checkpoints).toHaveLength(publications);
    expect(network.finishes).toHaveLength(1);
    expect(() => new OnlineRaceSession(network, new Map(), () => {})).toThrow("fresh race");
    host.dispose();
    const restored = new OnlineRaceSession(network, new Map(), () => {}, () => network.time, checkpoint);
    restored.advance(10, {});
    expect(restored.race).toEqual(fixed);
    expect(restored.finished).toBe(true);
    expect(restored.connectionLabel).toBe("RESULTS SAVED TO ROOM");
    restored.dispose();
    expect(() => new OnlineRaceSession(network, new Map(), () => {}, undefined, {
      ...checkpoint, state: { ...checkpoint.state, phase: "racing" },
    })).toThrow("terminal checkpoint");
  });
  it("does not let a previous round complete a new round and bounds failed completion retries", async () => {
    const network = new Transport(), warnings: string[] = [];
    const host = await finishOnline(network, warnings);
    const checkpoint = network.checkpoints.at(-1)!;
    network.room.checkpoint = checkpoint.reference;
    network.room.round!.id = "next-round";
    network.emit({ type: "checkpoint", checkpoint });
    expect(network.finishAttempts).toBe(0);
    network.room.round!.id = "round-one";
    network.finishError = new Error("Temporarily offline");
    network.emit({ type: "checkpoint", checkpoint });
    await flush();
    for (let frame = 0; frame < 120; frame++) host.advance(1 / 60, {});
    expect(network.finishAttempts).toBe(1);
    network.time += 1001;
    host.advance(0, {});
    await flush();
    expect(network.finishAttempts).toBe(2);
    network.finishError = null;
    network.time += 1001;
    host.advance(0, {});
    await flush();
    network.time += 2000;
    host.advance(0, {});
    expect(network.finishAttempts).toBe(3);
    expect(network.finishes).toHaveLength(1);
    expect(warnings).toHaveLength(2);
    host.dispose();
  });
  it("decodes bounded same-tick event batches without sharing their input", () => {
    const events = [{ type: "start", kartId: "", tick: 180 }];
    expect(decodeRaceEventBatch(events)).toEqual(events);
    expect(decodeRaceEventBatch(events)[0]).not.toBe(events[0]);
    for (const invalid of [null, {}, [], Array(1), Array.from({ length: 513 }, () => events[0]), [{ ...events[0], tick: NaN }],
      [...events, { type: "swap", kartId: "one", tick: 181 }], [{ ...events[0], unknown: true }]]) {
      expect(() => decodeRaceEventBatch(invalid)).toThrow(TypeError);
    }
  });
  it("keeps eight actual configured builds and both fixed tandem identities", () => {
    const value = room();
    value.phase = "lobby";
    value.round = null;
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
    network.room.round!.roster = network.room.round!.roster.filter(racer => racer.id !== "online-kart-1");
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
  it("publishes real authority events in per-tick batches and does not invent predicted client feedback", () => {
    const authority = new Transport();
    const host = new OnlineRaceSession(authority, new Map([["local-1", "one"]]), () => {});
    for (let tick = 0; tick < 181; tick++) host.advance(1 / 60, { "local-1": { ...NEUTRAL_PLAYER } });
    expect(authority.events.flat().some(event => event.type === "start")).toBe(true);
    expect(authority.events.every(batch => batch.every(event => event.tick === batch[0].tick))).toBe(true);
    const network = new Transport();
    network.isAuthority = false;
    network.participantId = "guest";
    const warnings: string[] = [];
    const guest = new OnlineRaceSession(network, new Map([["local-1", "two"]]), message => warnings.push(message), () => network.time);
    network.emit({ type: "snapshot", epoch: 1, sequence: 1, tick: host.race.tick, acks: [], state: copyRace(host.race) });
    expect(guest.advance(1 / 60, { "local-1": { ...NEUTRAL_PLAYER, swap: true } }).events).toEqual([]);
    const swap: RaceEvent = { type: "swap", kartId: "online-kart-2", tick: host.race.tick + 1 };
    network.emit({ type: "event", epoch: 1, sequence: 1, event: [swap] });
    expect(guest.advance(0, {}).events).toEqual([swap]);
    network.emit({ type: "event", epoch: 1, sequence: 2, event: [swap] });
    expect(guest.advance(0, {}).events).toEqual([]);
    network.emit({ type: "event", epoch: 0, sequence: 3, event: [{ ...swap, tick: swap.tick + 1 }] });
    network.emit({ type: "event", epoch: 1, sequence: 4, event: [{ ...swap, tick: 0 }] });
    expect(guest.advance(0, {}).events).toEqual([]);
    network.emit({ type: "event", epoch: 1, sequence: 5, event: [{ ...swap, kartId: "not-a-racer" }] });
    expect(warnings).toEqual(["The host sent feedback for an unknown kart. That event batch was rejected."]);
    expect(guest.race.karts[1].players).toEqual(["two", null]);
    host.dispose();
    guest.dispose();
  });
  it("replicates completed results without more physics and retries their final snapshot until acknowledged", async () => {
    const network = new Transport();
    const host = new OnlineRaceSession(network, new Map([["local-1", "one"]]), () => {}, () => network.time);
    for (let tick = 0; tick < 30000 && !host.finished; tick++) {
      network.time += 1000 / 60;
      host.advance(1 / 60, {});
    }
    expect(host.finished).toBe(true);
    await new Promise(resolve => setImmediate(resolve));
    const finished = copyRace(host.race);
    const snapshots = network.snapshots.length;
    host.advance(1 / 60, {});
    await new Promise(resolve => setImmediate(resolve));
    expect(network.checkpoints.at(-1)?.state.phase).toBe("finished");
    network.time += 501;
    host.advance(1 / 60, {});
    expect(network.snapshots.length).toBe(snapshots + 1);
    network.snapshotAcks.set("guest", network.snapshots.length);
    network.time += 501;
    host.advance(1 / 60, {});
    expect(network.snapshots.length).toBe(snapshots + 1);
    expect(host.race).toEqual(finished);
    const remote = new Transport();
    remote.isAuthority = false;
    remote.participantId = "guest";
    const guest = new OnlineRaceSession(remote, new Map([["local-1", "two"]]), () => {});
    remote.emit({ type: "snapshot", epoch: 1, sequence: 1, tick: finished.tick, acks: [], state: finished });
    const event: RaceEvent = { type: "race-finished", kartId: "", tick: finished.tick };
    remote.emit({ type: "event", epoch: 1, sequence: 1, event: [event] });
    expect(guest.advance(0, {}).events).toEqual([event]);
    expect(guest.advance(0, {}).events).toEqual([]);
    expect(guest.race.results).toEqual(finished.results);
    host.dispose();
    guest.dispose();
  });
  it("bounds checkpoint failure retries instead of flooding signaling every render frame", async () => {
    const network = new Transport();
    let attempts = 0;
    network.commitCheckpoint = async () => { attempts++; throw new Error("Offline"); };
    const warnings: string[] = [];
    const host = new OnlineRaceSession(network, new Map([["local-1", "one"]]), message => warnings.push(message), () => network.time);
    host.advance(1 / 60, {});
    await new Promise(resolve => setImmediate(resolve));
    for (let tick = 0; tick < 120; tick++) host.advance(1 / 60, {});
    expect(attempts).toBe(1);
    network.time = 1001;
    host.advance(1 / 60, {});
    await new Promise(resolve => setImmediate(resolve));
    expect(attempts).toBe(2);
    expect(warnings).toEqual(["Race checkpoint could not be replicated: Offline", "Race checkpoint could not be replicated: Offline"]);
    host.dispose();
  });
});
