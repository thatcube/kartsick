import { afterEach, describe, expect, it, vi } from "vitest";
import * as content from "@kartsick/content";
import { CUPS, DEFAULT_BUILD } from "@kartsick/content";
import type { RaceResult } from "../../simulation/src/race";
import { seriesStandings } from "../../simulation/src/series";
import { RoomEngine } from "../../../apps/signaling/src/room";
import type { RoomSocket } from "../../../apps/signaling/src/room";
import {
  DEFAULT_LOBBY, NETWORK_VERSION, SIGNAL_MAX_BYTES, byteLength, isTerminalRound, parseClientMessage, parseRoom,
} from "./rooms";
import type { CheckpointRef, RoomCommand, ServerMessage } from "./rooms";

afterEach(() => vi.restoreAllMocks());

class Socket implements RoomSocket {
  messages: ServerMessage[] = [];
  closed = false;
  send(message: ServerMessage) { this.messages.push(structuredClone(message)); }
  close() { this.closed = true; }
  get welcome() {
    const welcome = this.messages.find(message => message.type === "welcome");
    if (!welcome || welcome.type !== "welcome") throw new Error("Join failed.");
    return welcome;
  }
  get error() { return this.messages.filter(message => message.type === "error").at(-1)?.code; }
}
type Peer = { id: string; socket: Socket; participantId: string; playerIds: string[] };
function setup() {
  let now = 100_000, sequence = 0, connection = 0;
  const engine = new RoomEngine("ABCDEFGH", () => now);
  const send = (peer: Peer, command: RoomCommand) => engine.receive(peer.id,
    JSON.stringify({ version: NETWORK_VERSION, requestId: String(++sequence), ...command }));
  async function join(names = ["Racer"], resume: string | null = null): Promise<Peer> {
    const socket = new Socket(), id = String(++connection);
    engine.connect(id, socket);
    await engine.receive(id, JSON.stringify({ version: NETWORK_VERSION, requestId: String(++sequence),
      type: "join", names, resume, capability: { visible: true, capable: true } }));
    const participantId = socket.welcome.participantId;
    return { id, socket, participantId, playerIds: engine.room.participants.find(p => p.id === participantId)!.players.map(p => p.id) };
  }
  async function seat(peer: Peer, kart: number, side: 0 | 1 = 0) {
    await send(peer, { type: "seat", playerId: peer.playerIds[0], seat: { kart, side } });
  }
  async function ready(...peers: Peer[]) {
    for (const peer of peers) for (const playerId of peer.playerIds) {
      if (engine.room.karts.some(kart => kart.seats.includes(playerId))) await send(peer, { type: "ready", playerId, ready: true });
    }
  }
  function advance(ms: number) { now += ms; engine.tick(); }
  async function start(host: Peer, mode: "quick" | "cup" | "tour" = "cup", bots = false, cup: "town" | "horizon" = "town") {
    await seat(host, 0);
    await send(host, { type: "config", config: { ...DEFAULT_LOBBY, mode, bots, cup } });
    await ready(host); await send(host, { type: "start" });
    expect(engine.room.phase).toBe("racing");
  }
  function rows(): RaceResult[] {
    return engine.room.round!.roster.map((racer, index) => ({ ...racer, position: index + 1,
      finished: true, disconnected: false, time: 90 + index, progress: 48, points: [10, 8, 6, 4, 3, 2, 1, 0][index] }));
  }
  async function commit(host: Peer, holder?: Peer, tick = 10_000) {
    advance(501);
    const checkpoint: CheckpointRef = {
      id: `checkpoint-${++sequence}`, tick, digest: "a".repeat(64),
      acks: engine.room.participants.flatMap(p => p.players.map(player => ({ playerId: player.id, sequence: 0xffffffff }))),
    };
    await send(host, { type: "checkpoint-propose", epoch: engine.room.epoch, checkpoint });
    if (holder) await send(holder, { type: "checkpoint-have", epoch: engine.room.epoch, checkpointId: checkpoint.id, digest: checkpoint.digest });
    expect(engine.room.checkpoint).toEqual(checkpoint);
    return checkpoint;
  }
  function finishCommand(results = rows()): Extract<RoomCommand, { type: "finish" }> {
    return { type: "finish", epoch: engine.room.epoch, roundId: engine.room.round!.id,
      courseId: engine.room.config.course, checkpointId: engine.room.checkpoint?.id ?? "missing",
      tick: engine.room.checkpoint?.tick ?? 10_000, results };
  }
  async function finish(host: Peer, holder?: Peer) {
    await commit(host, holder);
    const command = finishCommand();
    await send(host, command);
    expect(engine.room.phase).toBe("results");
    expect(parseRoom(engine.room)).toEqual(engine.room);
    return command;
  }
  async function next(host: Peer) {
    await send(host, { type: "next-course", epoch: engine.room.epoch, roundId: engine.room.lastRound!.roundId });
  }
  return { engine, join, send, seat, ready, advance, start, rows, commit, finishCommand, finish, next, now: () => now };
}

describe("server-attested terminal rounds and circuit scheduling", () => {
  it("starts actual available quick courses and exact initial cup schedules", async () => {
    const t = setup(), host = await t.join();
    await t.seat(host, 3);
    await t.send(host, { type: "config", config: { ...DEFAULT_LOBBY, mode: "quick", course: "lastlight", bots: false } });
    await t.ready(host); await t.send(host, { type: "start" });
    expect(t.engine.room).toMatchObject({ config: { course: "lastlight" }, series: null, lastRound: null,
      round: { courseId: "lastlight", roster: [{ id: "online-kart-4", name: "Racer" }] } });
    await t.send(host, { type: "return" });
    await t.send(host, { type: "config", config: { ...DEFAULT_LOBBY, mode: "cup", cup: "horizon", course: "butterbell" } });
    await t.ready(host); await t.send(host, { type: "start" });
    expect(t.engine.room.config.course).toBe(CUPS.find(cup => cup.id === "horizon")!.courses[0]);
    expect(t.engine.room.series).toEqual({ version: 1, cup: "horizon", rounds: [] });
    expect(t.engine.room.round!.roster).toHaveLength(8);
  });

  it("rejects incomplete schedules using real availability rather than substituting a course", async () => {
    const available = vi.spyOn(content, "availableSeries").mockImplementation(courses => !courses.includes("tiltglass"));
    const t = setup(), host = await t.join();
    await t.seat(host, 0);
    await t.send(host, { type: "config", config: { ...DEFAULT_LOBBY, mode: "cup" } });
    await t.ready(host); await t.send(host, { type: "start" });
    expect(available).toHaveBeenCalledWith(CUPS.find(cup => cup.id === "town")!.courses);
    expect(host.socket.error).toBe("course-unavailable");
    expect(t.engine.room).toMatchObject({ phase: "lobby", round: null, series: null, lastRound: null, checkpoint: null });
  });

  it.each(["town", "horizon", "tour"] as const)("runs %s once in schedule order and rejects a next course after its final round", async id => {
    const t = setup(), host = await t.join();
    await t.start(host, id === "tour" ? "tour" : "cup", false, id === "tour" ? "town" : id);
    const definition = CUPS.find(cup => cup.id === id)!;
    const started = new Set<string>();
    for (const [index, course] of definition.courses.entries()) {
      expect(t.engine.room.config.course).toBe(course);
      expect(started.has(t.engine.room.round!.id)).toBe(false);
      started.add(t.engine.room.round!.id);
      await t.finish(host);
      expect(t.engine.room.series!.rounds).toHaveLength(index + 1);
      if (index < definition.courses.length - 1) {
        const epoch = t.engine.room.epoch;
        await t.next(host);
        expect(t.engine.room).toMatchObject({ phase: "lobby", round: null, checkpoint: null, pendingCheckpoint: null });
        expect(t.engine.room.epoch).toBe(epoch + 1);
        expect(t.engine.room.karts[0].seats[0]).toBe(host.playerIds[0]);
        expect(t.engine.room.participants[0].players[0].ready).toBe(false);
        await t.ready(host); await t.send(host, { type: "start" });
        expect(t.engine.room.epoch).toBe(epoch + 2);
      }
    }
    expect(seriesStandings(t.engine.room.series!)[0].points).toBe(definition.courses.length * 10);
    await t.next(host);
    expect(host.socket.error).toBe("circuit-complete");
    expect(t.engine.room.phase).toBe("results");
  });

  it("requires the current authority, epoch, round, course, committed ID/tick, exact roster and plausible finish times", async () => {
    const t = setup(), host = await t.join(["Host"]), holder = await t.join(["Spectator"]);
    await t.start(host);
    const uncommitted = t.finishCommand();
    await t.send(host, uncommitted); expect(host.socket.error).toBe("checkpoint-mismatch");
    await t.commit(host, holder);
    const valid = t.finishCommand();
    await t.send(holder, valid); expect(holder.socket.error).toBe("authority-only");
    const invalid: [Partial<typeof valid>, string][] = [
      [{ epoch: valid.epoch - 1 }, "stale-epoch"], [{ roundId: "old-round" }, "round-mismatch"],
      [{ courseId: "afterglow" }, "round-mismatch"], [{ checkpointId: "other-checkpoint" }, "checkpoint-mismatch"],
      [{ tick: valid.tick - 1 }, "checkpoint-mismatch"],
      [{ results: [{ ...valid.results[0], id: "online-kart-8" }] }, "roster-mismatch"],
      [{ results: [{ ...valid.results[0], name: "Not the started racer" }] }, "roster-mismatch"],
      [{ results: [{ ...valid.results[0], time: 1800 }] }, "invalid-results"],
    ];
    for (const [change, code] of invalid) {
      await t.send(host, { ...valid, ...change });
      expect(host.socket.error).toBe(code);
      expect(t.engine.room.phase).toBe("racing");
      expect(t.engine.room.lastRound).toBeNull();
    }
    await t.send(host, valid);
    expect(t.engine.room.phase).toBe("results");
    const completed = structuredClone(t.engine.room.lastRound);
    await t.send(host, valid);
    expect(host.socket.error).toBe("not-racing");
    expect(t.engine.room.lastRound).toEqual(completed);
    expect(t.engine.room.series!.rounds).toHaveLength(1);
  });

  it("waits for the final proposal's commitment and never refreshes an identical active tick", async () => {
    const t = setup(), host = await t.join(), holder = await t.join();
    await t.start(host);
    const old = await t.commit(host, holder);
    const committedAt = t.engine.state.committedAt;
    t.advance(1000);
    await t.send(host, { type: "checkpoint-propose", epoch: t.engine.room.epoch, checkpoint: { ...old, id: "same-tick" } });
    expect(host.socket.error).toBe("old-checkpoint");
    await t.send(holder, { type: "checkpoint-have", epoch: t.engine.room.epoch, checkpointId: old.id, digest: old.digest });
    expect(t.engine.state.committedAt).toBe(committedAt);
    const terminal = { ...old, id: "terminal", tick: old.tick + 1 };
    await t.send(host, { type: "checkpoint-propose", epoch: t.engine.room.epoch, checkpoint: terminal });
    await t.send(host, t.finishCommand());
    expect(host.socket.error).toBe("checkpoint-pending");
    await t.send(holder, { type: "checkpoint-have", epoch: t.engine.room.epoch, checkpointId: terminal.id, digest: terminal.digest });
    await t.send(host, t.finishCommand());
    expect(t.engine.room.lastRound?.checkpoint).toMatchObject({ id: "terminal", tick: terminal.tick });
  });

  it.each(["disconnect", "leave"] as const)("commits an authority-held terminal proposal when the last guest exits via %s", async departure => {
    const t = setup(), host = await t.join(), holder = await t.join();
    await t.start(host);
    const old = await t.commit(host, holder);
    t.advance(501);
    const terminal = { ...old, id: "terminal", tick: old.tick + 1 };
    await t.send(host, { type: "checkpoint-propose", epoch: t.engine.room.epoch, checkpoint: terminal });
    expect(t.engine.room.checkpoint).toEqual(old);
    if (departure === "disconnect") t.engine.disconnect(holder.id);
    else await t.send(holder, { type: "leave" });
    expect(t.engine.room.checkpoint).toEqual(terminal);
    expect(t.engine.state.holders).toEqual([host.participantId]);
    await t.send(host, t.finishCommand());
    expect(t.engine.room.phase).toBe("results");
  });

  it("does not commit an unheld proposal just because the authority's departure leaves one guest", async () => {
    const t = setup(), host = await t.join(), holder = await t.join();
    await t.start(host);
    const old = await t.commit(host, holder);
    t.advance(501);
    await t.send(host, { type: "checkpoint-propose", epoch: t.engine.room.epoch,
      checkpoint: { ...old, id: "unreceived-terminal", tick: old.tick + 1 } });
    t.engine.disconnect(host.id);
    expect(t.engine.room.checkpoint).toEqual(old);
    expect(t.engine.room.phase).toBe("migrating");
    expect(t.engine.room.authorityId).toBe(holder.participantId);
  });

  it("fences an old round even when a stale async completion accidentally borrows the new epoch", async () => {
    const t = setup(), host = await t.join();
    await t.start(host);
    const old = await t.finish(host), build = structuredClone(t.engine.room.karts[0].build);
    await t.next(host);
    await t.send(host, { type: "config", config: { ...t.engine.room.config, speed: 150, mirror: true } });
    expect(host.socket.error).toBe("circuit-locked");
    expect(t.engine.room.config).toMatchObject({ speed: 100, mirror: false, mode: "cup" });
    await t.ready(host); await t.send(host, { type: "start" });
    expect(t.engine.room.karts[0].build).toEqual(build);
    expect(t.engine.room.checkpoint).toBeNull();
    await t.send(host, old); expect(host.socket.error).toBe("stale-epoch");
    await t.send(host, { ...old, epoch: t.engine.room.epoch }); expect(host.socket.error).toBe("round-mismatch");
    expect(t.engine.room.series!.rounds).toHaveLength(1);
    await t.send(host, { type: "rematch" });
    expect(t.engine.room).toMatchObject({ phase: "lobby", round: null, lastRound: null, series: null, checkpoint: null });
    await t.ready(host); await t.send(host, { type: "start" });
    expect(t.engine.room.config.course).toBe("butterbell");
    expect(t.engine.room.series!.rounds).toHaveLength(0);
  });

  it("finishes quick races without a circuit and rejects dropped roster slots or post-terminal checkpoint mutation", async () => {
    const t = setup(), host = await t.join();
    await t.start(host, "quick", true);
    await t.commit(host);
    await t.send(host, t.finishCommand(t.rows().slice(0, 7)));
    expect(host.socket.error).toBe("roster-mismatch");
    await t.send(host, t.finishCommand());
    expect(t.engine.room).toMatchObject({ phase: "results", series: null, startAt: null });
    const checkpoint = structuredClone(t.engine.room.checkpoint!), committedAt = t.engine.state.committedAt;
    t.advance(6000);
    await t.send(host, { type: "checkpoint-propose", epoch: t.engine.room.epoch, checkpoint: { ...checkpoint, id: "new", tick: checkpoint.tick + 1 } });
    expect(host.socket.error).toBe("not-racing");
    await t.send(host, { type: "checkpoint-have", epoch: t.engine.room.epoch, checkpointId: checkpoint.id, digest: checkpoint.digest });
    expect(t.engine.state.committedAt).toBe(committedAt);
    expect(t.engine.room.checkpoint).toEqual(checkpoint);
    await t.next(host);
    expect(host.socket.error).toBe("not-a-circuit");
    await t.send(host, { type: "rematch" });
    expect(t.engine.room).toMatchObject({ phase: "lobby", lastRound: null, series: null, checkpoint: null });
  });

  it("reserves next-course control for the host, including when a different peer restores terminal authority", async () => {
    const t = setup(), host = await t.join(), holder = await t.join();
    await t.start(host); await t.finish(host, holder);
    await t.send(host, { type: "capability", capability: { visible: false, capable: true } });
    expect(t.engine.room.phase).toBe("migrating");
    expect(t.engine.room.hostId).toBe(host.participantId);
    await t.send(holder, { type: "migration-ready", epoch: t.engine.room.epoch, checkpointId: t.engine.room.checkpoint!.id });
    expect(t.engine.room).toMatchObject({ phase: "results", startAt: null, authorityId: holder.participantId });
    await t.next(holder);
    expect(holder.socket.error).toBe("host-only");
    const epoch = t.engine.room.epoch, roundId = t.engine.room.lastRound!.roundId;
    await t.next(host);
    expect(t.engine.room.phase).toBe("lobby");
    await t.send(host, { type: "next-course", epoch, roundId });
    expect(host.socket.error).toBe("stale-epoch");
    expect(t.engine.room.config.course).toBe("escaluna");
  });

  it("keeps points on stable kart slots while grace expiry and late spectators replace their humans between rounds", async () => {
    const t = setup(), host = await t.join(["Host"]), departing = await t.join(["First driver"]);
    await t.seat(host, 0); await t.seat(departing, 3);
    await t.send(host, { type: "config", config: { ...DEFAULT_LOBBY, mode: "cup", bots: false } });
    await t.ready(host, departing); await t.send(host, { type: "start" });
    const late = await t.join(["Next driver"]);
    await t.seat(late, 3); expect(late.socket.error).toBe("race-in-progress");
    await t.finish(host, departing);
    await t.next(host);
    t.engine.disconnect(departing.id); t.advance(60_000);
    expect(t.engine.room.karts[3].seats[0]).toBeNull();
    expect(t.engine.room.series!.rounds[0].results[1]).toMatchObject({ id: "online-kart-4", name: "First driver", points: 8 });
    await t.seat(late, 3);
    await t.ready(host, late); await t.send(host, { type: "start" });
    expect(t.engine.room.round!.roster[1]).toEqual({ id: "online-kart-4", name: "Next driver" });
    await t.finish(host, late);
    expect(seriesStandings(t.engine.room.series!).find(row => row.id === "online-kart-4")).toMatchObject({ points: 16, name: "Next driver" });
  });
});

describe("durable terminal checkpoints, authority departure and aborts", () => {
  it("upgrades pre-attestation persisted rooms without inventing results or losing seats", async () => {
    const t = setup(), host = await t.join();
    await t.start(host); await t.commit(host);
    const saved = t.engine.export();
    Reflect.set(saved.room, "version", 2);
    Reflect.deleteProperty(saved.room, "round");
    Reflect.deleteProperty(saved.room, "series");
    Reflect.deleteProperty(saved.room, "lastRound");
    const restored = new RoomEngine("ABCDEFGH", t.now, saved);
    expect(restored.room).toMatchObject({ version: NETWORK_VERSION, phase: "lobby", round: null,
      series: null, lastRound: null, checkpoint: null, pendingCheckpoint: null });
    expect(restored.room.karts[0].seats[0]).toBe(host.playerIds[0]);
    expect(restored.room.participants[0].players[0].ready).toBe(false);
    expect(restored.room.reason).toContain("without results");
    expect(restored.state.holders).toHaveLength(0);
  });

  it("migrates old accepted terminal data through process persistence back to results, never to a ticking race", async () => {
    const t = setup(), host = await t.join(), holder = await t.join();
    await t.start(host); await t.finish(host, holder);
    const checkpoint = structuredClone(t.engine.room.checkpoint), series = structuredClone(t.engine.room.series);
    const committedAt = t.engine.state.committedAt;
    t.advance(30_000);
    t.engine.disconnect(host.id);
    expect(t.engine.room.phase).toBe("migrating");
    expect(isTerminalRound(t.engine.room)).toBe(true);
    const restored = new RoomEngine("ABCDEFGH", t.now, t.engine.export());
    const socket = new Socket(); restored.reattach(holder.id, socket);
    await restored.receive(holder.id, JSON.stringify({ version: NETWORK_VERSION, requestId: "restored",
      type: "migration-ready", epoch: restored.room.epoch, checkpointId: checkpoint!.id }));
    expect(restored.room.phase).toBe("results");
    expect(restored.room.startAt).toBeNull();
    expect(restored.room.checkpoint).toEqual(checkpoint);
    expect(restored.room.series).toEqual(series);
    expect(restored.state.committedAt).toBe(committedAt);
    expect(parseRoom(restored.room)).toEqual(restored.room);
  });

  it("retains completed scoreboards and references even when every holder departs and reservations expire", async () => {
    const t = setup(), host = await t.join();
    await t.start(host); await t.finish(host);
    const completed = structuredClone(t.engine.room.lastRound), checkpoint = structuredClone(t.engine.room.checkpoint);
    t.engine.disconnect(host.id);
    expect(t.engine.room).toMatchObject({ phase: "results", authorityId: null, lastRound: completed, checkpoint });
    expect(t.engine.room.reason).toContain("checkpoint holder");
    t.advance(60_000);
    expect(t.engine.room.participants).toHaveLength(0);
    expect(t.engine.room.series!.rounds).toHaveLength(1);
    const restored = new RoomEngine("ABCDEFGH", t.now, t.engine.export());
    expect(restored.room.lastRound).toEqual(completed);
    const newcomer = await t.join(["New host"]);
    expect(t.engine.room.phase).toBe("results");
    expect(t.engine.room.authorityId).toBeNull();
    await t.next(newcomer);
    expect(t.engine.room.config.course).toBe("escaluna");
    expect(t.engine.room.series!.rounds).toHaveLength(1);
  });

  it("does not let a resumed page inherit checkpoint possession from its credential", async () => {
    const t = setup(), host = await t.join();
    await t.start(host); await t.finish(host);
    const resume = host.socket.welcome.resume;
    t.engine.disconnect(host.id);
    const reloaded = await t.join(["Reload"], resume);
    expect(reloaded.participantId).toBe(host.participantId);
    expect(t.engine.room).toMatchObject({ phase: "results", authorityId: null });
    expect(t.engine.state.holders).not.toContain(host.participantId);
    const checkpoint = t.engine.room.checkpoint!;
    await t.send(reloaded, { type: "checkpoint-have", epoch: t.engine.room.epoch, checkpointId: checkpoint.id, digest: checkpoint.digest });
    expect(t.engine.room.phase).toBe("migrating");
    await t.send(reloaded, { type: "migration-ready", epoch: t.engine.room.epoch, checkpointId: checkpoint.id });
    expect(t.engine.room.phase).toBe("results");
  });

  it.each(["failed", "timeout", "transport"] as const)("preserves terminal metadata on a %s handoff", async failure => {
    const t = setup(), host = await t.join(), holder = await t.join();
    await t.start(host); await t.finish(host, holder);
    const completed = structuredClone(t.engine.room.lastRound);
    t.engine.disconnect(host.id);
    if (failure === "failed") await t.send(holder, { type: "migration-failed", epoch: t.engine.room.epoch });
    else if (failure === "timeout") t.advance(12_000);
    else await t.send(holder, { type: "transport-failed", epoch: t.engine.room.epoch, peerId: host.participantId });
    expect(t.engine.room.phase).toBe("results");
    expect(t.engine.room.lastRound).toEqual(completed);
    expect(t.engine.room.series!.rounds).toHaveLength(1);
    expect(t.engine.room.reason).toMatch(/retained|could not|unavailable|timed out/);
  });

  it("keeps active-race freshness strict and never promotes an unaccepted checkpoint into results", async () => {
    const t = setup(), host = await t.join(), holder = await t.join();
    await t.start(host);
    const checkpoint = await t.commit(host, holder);
    const committedAt = t.engine.state.committedAt;
    t.advance(5001);
    await t.send(holder, { type: "checkpoint-have", epoch: t.engine.room.epoch, checkpointId: checkpoint.id, digest: checkpoint.digest });
    expect(t.engine.state.committedAt).toBe(committedAt);
    t.engine.disconnect(host.id);
    expect(t.engine.room).toMatchObject({ phase: "lobby", round: null, lastRound: null, checkpoint: null });
    expect(t.engine.room.series!.rounds).toHaveLength(0);
  });

  it("aborts only the incomplete current round, allows its retry, and resets standings only on explicit return", async () => {
    const t = setup(), host = await t.join(), holder = await t.join();
    await t.start(host); await t.finish(host, holder); await t.next(host);
    await t.ready(host); await t.send(host, { type: "start" });
    const abandoned = t.engine.room.round!.id;
    await t.commit(host, holder);
    expect(isTerminalRound(t.engine.room)).toBe(false);
    t.advance(5001);
    t.engine.disconnect(host.id);
    expect(t.engine.room.phase).toBe("lobby");
    expect(t.engine.room.config.course).toBe("escaluna");
    expect(t.engine.room.series!.rounds).toHaveLength(1);
    t.advance(60_000);
    await t.seat(holder, 0); await t.ready(holder); await t.send(holder, { type: "start" });
    expect(t.engine.room.phase).toBe("racing");
    expect(t.engine.room.round!.id).not.toBe(abandoned);
    expect(t.engine.room.series!.rounds).toHaveLength(1);
    await t.send(holder, { type: "return" });
    expect(t.engine.room).toMatchObject({ phase: "lobby", round: null, series: null, lastRound: null, checkpoint: null });
    await t.send(holder, { type: "config", config: { ...DEFAULT_LOBBY, course: "afterglow", speed: 150, mirror: true } });
    expect(t.engine.room.config).toMatchObject({ mode: "quick", course: "afterglow", speed: 150, mirror: true });
  });
});

describe("strict bounded room completion metadata", () => {
  it("rejects malformed IDs, rows, order, names, times, points, extra bodies, old versions and missing fields", async () => {
    const t = setup(), host = await t.join(); await t.start(host); await t.commit(host);
    const command = { ...t.finishCommand(), version: NETWORK_VERSION, requestId: "finish" };
    const invalid = [
      { ...command, version: NETWORK_VERSION - 1 }, { ...command, state: { phase: "finished" } },
      { ...command, results: [] }, { ...command, results: [{ ...command.results[0], id: "random-racer" }] },
      { ...command, results: [{ ...command.results[0], points: 100 }] },
      { ...command, results: [{ ...command.results[0], position: 2 }] },
      { ...command, results: [{ ...command.results[0], time: -1 }] },
      { ...command, results: [{ ...command.results[0], name: "<invalid>" }] },
      { ...command, results: [{ ...command.results[0], name: "\u0000" }] },
      { ...command, results: [{ ...command.results[0], disconnected: 0 }] },
      { ...command, results: [{ ...command.results[0], finished: false }] },
    ];
    for (const value of invalid) expect(() => parseClientMessage(value)).toThrow();
    expect(parseClientMessage(command)).toEqual(command);
    for (const field of ["round", "series", "lastRound"]) {
      const room: Record<string, unknown> = { ...structuredClone(t.engine.room) };
      delete room[field];
      expect(() => parseRoom(room)).toThrow();
    }
    await t.send(host, t.finishCommand());
    expect(() => parseRoom({ ...t.engine.room, phase: "racing" })).toThrow();
    expect(() => parseRoom({ ...t.engine.room, config: { ...t.engine.room.config, mode: "quick" } })).toThrow();
    expect(() => parseRoom({ ...t.engine.room, checkpoint: { ...t.engine.room.checkpoint, tick: 1 } })).toThrow();
  });

  it("fits a full six-course tour, sixteen maximal Unicode names, eight stable slots and complete acks in signaling envelopes", async () => {
    const t = setup(), peers: Peer[] = [];
    for (let i = 0; i < 16; i++) peers.push(await t.join(["界".repeat(24)]));
    const host = peers[0], holder = peers[1];
    for (const [i, peer] of peers.entries()) await t.seat(peer, Math.floor(i / 2), i % 2 as 0 | 1);
    const longest = <T extends string>(ids: readonly T[]): T => [...ids].sort((a, b) => b.length - a.length)[0];
    const characters = [...content.CHARACTER_IDS].sort((a, b) => b.length - a.length);
    for (let kart = 0; kart < 8; kart++) await t.send(peers[kart * 2], { type: "build", kart, build: {
      ...DEFAULT_BUILD, characters: [characters[0], characters[1]], body: longest(content.BODY_IDS),
      wheels: longest(content.WHEEL_IDS), glider: longest(content.GLIDER_IDS),
      paint: longest(content.PAINT_IDS), decal: longest(content.DECAL_IDS),
    } });
    await t.send(host, { type: "config", config: { ...DEFAULT_LOBBY, mode: "tour", bots: true } });
    await t.ready(...peers); await t.send(host, { type: "start" });
    const envelope = () => JSON.stringify({ version: NETWORK_VERSION, type: "welcome",
      participantId: host.participantId, resume: "f".repeat(64), resumed: false, room: t.engine.room });
    for (let round = 0; round < 6; round++) {
      await t.commit(host, holder, 108_000);
      expect(byteLength(envelope())).toBeLessThanOrEqual(SIGNAL_MAX_BYTES);
      const rows = t.rows().map(row => ({ ...row, time: 0.0000010000000000000002, progress: 0.0000010000000000000002 }));
      await t.send(host, t.finishCommand(rows));
      expect(t.engine.room.phase).toBe("results");
      expect(byteLength(envelope())).toBeLessThanOrEqual(SIGNAL_MAX_BYTES);
      expect(parseRoom(t.engine.room)).toEqual(t.engine.room);
      if (round < 5) {
        await t.next(host); await t.ready(...peers); await t.send(host, { type: "start" });
      }
    }
    expect(t.engine.room.series!.rounds).toHaveLength(6);
    expect(t.engine.room.lastRound!.results).toHaveLength(8);
    // Captured names come from the started roster, including vacant-kart bot labels and stable slots.
    expect(t.engine.room.round!.roster[0].name).toHaveLength(32);
  });
});
