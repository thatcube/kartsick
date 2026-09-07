import { describe, expect, it } from "vitest";
import { RoomEngine, TokenBucket, type RoomSocket } from "../../../apps/signaling/src/room";
import { NETWORK_VERSION, ROOM_TTL_MS, parseBuild, parseClientMessage, parseRoom, type RoomCommand, type ServerMessage } from "./rooms";
import { DATA_MAX_BYTES, checkpointDigest, encodeDataPacket, parseDataPacket } from "./race";
import { DEFAULT_BUILD } from "@kartsick/content";
import { InputQueue } from "../../../apps/web/src/network/input-queue";
import { WIRE_MAX_BYTES, WireAssembler, fragmentPacket } from "./fragments";
import { createRace, parseRaceState } from "@kartsick/simulation";

class Socket implements RoomSocket {
  messages: ServerMessage[] = [];
  closed: number | null = null;
  send(message: ServerMessage): void { this.messages.push(structuredClone(message)); }
  close(code: number): void { this.closed = code; }
  welcome() {
    const message = this.messages.find(m => m.type === "welcome");
    if (!message || message.type !== "welcome") throw new Error("No welcome.");
    return message;
  }
  error(): string | undefined { return this.messages.filter(m => m.type === "error").at(-1)?.code; }
}
function setup() {
  let now = 100_000, request = 0, connection = 0;
  const engine = new RoomEngine("ABCDEFGH", () => now);
  const send = (id: string, command: RoomCommand) => engine.receive(id, JSON.stringify({ version: NETWORK_VERSION, requestId: String(++request), ...command }));
  async function join(names = ["Racer"], resume: string | null = null) {
    const socket = new Socket(), id = String(++connection);
    engine.connect(id, socket);
    await send(id, { type: "join", names, resume, capability: { visible: true, capable: true } });
    return { socket, id };
  }
  return { engine, send, join, advance(ms: number) { now += ms; engine.tick(); } };
}
describe("actual room lifecycle", () => {
  it("counts every local human and spectator, assigns identities, and enforces 16 total / 8 karts / 4 per browser", async () => {
    const t = setup();
    for (let group = 0; group < 4; group++) {
      const peer = await t.join(["A", "B", "C", "D"]);
      expect(peer.socket.welcome().participantId).toMatch(/^[a-f0-9]{32}$/);
    }
    const overflow = await t.join();
    expect(overflow.socket.error()).toBe("room-full");
    expect(t.engine.room.participants.flatMap(p => p.players)).toHaveLength(16);
    expect(parseRoom(t.engine.room).karts).toHaveLength(8);
    expect(() => parseClientMessage({ version: NETWORK_VERSION, requestId: "x", type: "join", names: ["1", "2", "3", "4", "5"], resume: null, capability: { visible: true, capable: true } })).toThrow();
  });
  it("validates seats/readiness/build ownership and keeps late arrivals spectators", async () => {
    const t = setup(), a = await t.join(["Driver", "Rear"]), b = await t.join();
    const players = a.socket.welcome().room.participants[0].players;
    await t.send(b.id, { type: "seat", playerId: players[0].id, seat: { kart: 0, side: 0 } });
    expect(b.socket.error()).toBe("seat-owner");
    await t.send(a.id, { type: "seat", playerId: players[0].id, seat: { kart: 0, side: 0 } });
    await t.send(a.id, { type: "seat", playerId: players[1].id, seat: { kart: 0, side: 1 } });
    await t.send(b.id, { type: "build", kart: 0, build: DEFAULT_BUILD });
    expect(b.socket.error()).toBe("seat-owner");
    expect(() => parseBuild({ ...DEFAULT_BUILD, characters: ["clutch", "clutch"] })).toThrow();
    await t.send(a.id, { type: "start" }); expect(a.socket.error()).toBe("not-ready");
    for (const player of players) await t.send(a.id, { type: "ready", playerId: player.id, ready: true });
    await t.send(a.id, { type: "start" }); expect(t.engine.room.phase).toBe("racing");
    const late = await t.join(["Late"]);
    const lateId = late.socket.welcome().participantId;
    const player = t.engine.room.participants.find(p => p.id === lateId)!.players[0];
    expect(t.engine.room.karts.flatMap(k => k.seats)).not.toContain(player.id);
    await t.send(late.id, { type: "seat", playerId: player.id, seat: { kart: 1, side: 0 } });
    expect(late.socket.error()).toBe("race-in-progress");
    await t.send(b.id, { type: "return" }); expect(b.socket.error()).toBe("host-only");
    await t.send(a.id, { type: "rematch" }); expect(t.engine.room.phase).toBe("lobby");
    expect(t.engine.room.participants.flatMap(p => p.players).every(p => !p.ready)).toBe(true);
  });
  it("rotates unguessable resume credentials and restores seats for exactly sixty seconds", async () => {
    const t = setup(), a = await t.join();
    const welcome = a.socket.welcome(), playerId = welcome.room.participants[0].players[0].id;
    await t.send(a.id, { type: "seat", playerId, seat: { kart: 2, side: 1 } });
    t.engine.disconnect(a.id); t.advance(59_999);
    const resumed = await t.join(["Ignored"], welcome.resume);
    expect(resumed.socket.welcome().participantId).toBe(welcome.participantId);
    expect(resumed.socket.welcome().resume).not.toBe(welcome.resume);
    expect(resumed.socket.welcome().resume).toMatch(/^[a-f0-9]{64}$/);
    expect(t.engine.room.karts[2].seats[1]).toBe(playerId);
    const replay = await t.join(["Replay"], welcome.resume); expect(replay.socket.error()).toBe("resume-expired");
    expect(JSON.stringify(t.engine.export())).not.toContain(resumed.socket.welcome().resume);
    t.engine.disconnect(resumed.id); t.advance(60_000);
    const expired = await t.join(["Expired"], resumed.socket.welcome().resume);
    expect(expired.socket.error()).toBe("resume-expired"); expect(t.engine.room.karts[2].seats[1]).toBeNull();
  });
  it("elects the room host independently and forbids full-mesh signaling, spoofed identities and stale epochs", async () => {
    const t = setup(), a = await t.join(), b = await t.join(), c = await t.join();
    await t.send(b.id, { type: "signal", to: c.socket.welcome().participantId, epoch: 0, attempt: "try",
      signal: { kind: "description", description: { type: "offer", sdp: "v=0" } } });
    expect(b.socket.error()).toBe("not-authority-edge");
    await t.send(b.id, { type: "signal", to: a.socket.welcome().participantId, epoch: 1, attempt: "try",
      signal: { kind: "description", description: { type: "offer", sdp: "v=0" } } });
    expect(b.socket.error()).toBe("stale-epoch");
    t.engine.disconnect(a.id);
    expect(t.engine.room.hostId).toBe(b.socket.welcome().participantId);
    expect(() => parseClientMessage({ version: NETWORK_VERSION, requestId: "1", type: "ping", participantId: "spoof" })).toThrow();
  });
  it("migrates only from an acknowledged committed checkpoint and fences the old epoch", async () => {
    const t = setup(), a = await t.join(), b = await t.join();
    const playerId = a.socket.welcome().room.participants[0].players[0].id;
    await t.send(a.id, { type: "seat", playerId, seat: { kart: 0, side: 0 } });
    await t.send(a.id, { type: "ready", playerId, ready: true }); await t.send(a.id, { type: "start" });
    const epoch = t.engine.room.epoch;
    const checkpoint = { id: "checkpoint", tick: 123, digest: "a".repeat(64), acks: [{ playerId, sequence: 9 }] };
    await t.send(a.id, { type: "checkpoint-propose", epoch, checkpoint });
    expect(t.engine.room.checkpoint).toBeNull();
    await t.send(b.id, { type: "checkpoint-have", epoch, checkpointId: checkpoint.id, digest: checkpoint.digest });
    expect(t.engine.room.checkpoint).toEqual(checkpoint);
    t.engine.disconnect(a.id); expect(t.engine.room.phase).toBe("migrating");
    expect(t.engine.room.authorityId).toBe(b.socket.welcome().participantId);
    expect(t.engine.room.epoch).toBe(epoch + 1);
    await t.send(b.id, { type: "migration-ready", epoch, checkpointId: checkpoint.id });
    expect(b.socket.error()).toBe("stale-epoch");
    await t.send(b.id, { type: "migration-ready", epoch: epoch + 1, checkpointId: checkpoint.id });
    expect(t.engine.room.phase).toBe("racing");
    expect(t.engine.room.checkpoint?.acks).toEqual(checkpoint.acks);
  });
  it("does not give a replacement authority page implicit possession of the running race", async () => {
    const t = setup(), a = await t.join(), b = await t.join();
    const playerId = a.socket.welcome().room.participants[0].players[0].id;
    await t.send(a.id, { type: "seat", playerId, seat: { kart: 0, side: 0 } });
    await t.send(a.id, { type: "ready", playerId, ready: true }); await t.send(a.id, { type: "start" });
    const epoch = t.engine.room.epoch, checkpoint = { id: "handoff", tick: 10, digest: "a".repeat(64), acks: [] };
    await t.send(a.id, { type: "checkpoint-propose", epoch, checkpoint });
    await t.send(b.id, { type: "checkpoint-have", epoch, checkpointId: checkpoint.id, digest: checkpoint.digest });
    const replacement = await t.join(["Reloaded"], a.socket.welcome().resume);
    expect(replacement.socket.welcome().participantId).toBe(a.socket.welcome().participantId);
    expect(a.socket.closed).toBe(1000); expect(t.engine.room.phase).toBe("migrating");
    expect(t.engine.room.authorityId).toBe(b.socket.welcome().participantId);
    expect(t.engine.room.epoch).toBe(epoch + 1);
  });
  it("pauses a background host and returns to the same lobby without results when checkpoint handoff fails", async () => {
    const t = setup(), a = await t.join();
    const playerId = a.socket.welcome().room.participants[0].players[0].id;
    await t.send(a.id, { type: "seat", playerId, seat: { kart: 0, side: 0 } });
    await t.send(a.id, { type: "ready", playerId, ready: true }); await t.send(a.id, { type: "start" });
    await t.send(a.id, { type: "capability", capability: { visible: false, capable: true } });
    expect(t.engine.room.phase).toBe("paused");
    await t.send(a.id, { type: "capability", capability: { visible: true, capable: true } });
    expect(t.engine.room.phase).toBe("racing");
    await t.join();
    t.engine.disconnect(a.id);
    expect(t.engine.room.phase).toBe("lobby");
    expect(t.engine.room.reason).toContain("no race results");
    expect(t.engine.room.code).toBe("ABCDEFGH");
  });
  it.each(["stale", "timeout"])("recovers honestly when a checkpoint is %s", async failure => {
    const t = setup(), a = await t.join(), b = await t.join();
    const playerId = a.socket.welcome().room.participants[0].players[0].id;
    await t.send(a.id, { type: "seat", playerId, seat: { kart: 0, side: 0 } });
    await t.send(a.id, { type: "ready", playerId, ready: true }); await t.send(a.id, { type: "start" });
    const epoch = t.engine.room.epoch;
    const checkpoint = { id: "fresh", tick: 10, digest: "b".repeat(64), acks: [] };
    await t.send(a.id, { type: "checkpoint-propose", epoch, checkpoint });
    await t.send(b.id, { type: "checkpoint-have", epoch, checkpointId: checkpoint.id, digest: "c".repeat(64) });
    expect(b.socket.error()).toBe("checkpoint-mismatch"); expect(t.engine.room.checkpoint).toBeNull();
    await t.send(b.id, { type: "checkpoint-have", epoch, checkpointId: checkpoint.id, digest: checkpoint.digest });
    if (failure === "stale") t.advance(5001);
    t.engine.disconnect(a.id);
    if (failure === "timeout") { expect(t.engine.room.phase).toBe("migrating"); t.advance(12_000); }
    expect(t.engine.room.phase).toBe("lobby"); expect(t.engine.room.code).toBe("ABCDEFGH");
    expect(t.engine.room.reason).toMatch(/not finished|no race results/);
  });
  it("bounds malformed/oversize messages, pending joins, sustained traffic, and room lifetime", async () => {
    const t = setup(), a = await t.join();
    await t.engine.receive(a.id, "{bad json"); expect(a.socket.closed).toBe(1008);
    const b = await t.join();
    await t.engine.receive(b.id, " ".repeat(25_000)); expect(b.socket.closed).toBe(1009);
    const c = await t.join();
    for (let n = 0; n < 90; n++) await t.send(c.id, { type: "ping" });
    expect(c.socket.error()).toBe("rate-limited"); expect(c.socket.closed).toBe(1008);
    const pending = new Socket(); t.engine.connect("pending", pending); t.advance(5001); expect(pending.closed).toBe(1008);
    const d = await t.join(); t.advance(ROOM_TTL_MS);
    expect(t.engine.expired).toBe(true); expect(d.socket.closed).toBe(1000);
  });
  it("persists rate budgets across hibernation and expires idle rooms", async () => {
    const t = setup(), a = await t.join();
    for (let n = 0; n < 65; n++) await t.send(a.id, { type: "ping" });
    const restored = new RoomEngine("ABCDEFGH", () => 100_000, t.engine.export());
    const socket = new Socket(); restored.reattach(a.id, socket);
    for (let n = 0; n < 20; n++) await restored.receive(a.id, JSON.stringify({ version: NETWORK_VERSION, type: "ping", requestId: String(n) }));
    expect(socket.error()).toBe("rate-limited");
    const idle = setup(); idle.advance(600_000); expect(idle.engine.expired).toBe(true);
    const bucket = new TokenBucket(2, 1, 0);
    expect([bucket.take(0), bucket.take(0), bucket.take(0), bucket.take(1000)]).toEqual([true, true, false, true]);
  });
});

const input = { throttle: 1, brake: 0, steer: 0, pitch: 0, drift: false, swap: false, recover: false, useItem: true, throwDirection: 1 as const, slide: 0 as const, passItem: false };
describe("race transport boundaries", () => {
  it("keeps a bounded sequenced input queue and drops acknowledged prediction history", () => {
    const queue = new InputQueue();
    for (let sequence = 1; sequence <= 180; sequence++) queue.push({ playerId: "one", sequence, tick: sequence, input });
    expect(queue.pending()).toHaveLength(120);
    expect(queue.latest(["one"]).map(f => f.sequence)).toEqual([177, 178, 179, 180]);
    queue.acknowledge([{ playerId: "one", sequence: 179 }]);
    expect(queue.pending().map(f => f.sequence)).toEqual([180]);
    expect(queue.drain()).toHaveLength(1); expect(queue.pending()).toHaveLength(0);
  });
  it("requires an application snapshot decoder and enforces schemas, sizes and full inputs", async () => {
    const decode = (value: unknown) => { if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(); return value; };
    const packet = { version: NETWORK_VERSION as typeof NETWORK_VERSION, type: "snapshot" as const, epoch: 2, sequence: 3, tick: 5, acks: [], state: 4 };
    expect(parseDataPacket(JSON.stringify(packet), decode, decode)).toEqual(packet);
    expect(() => parseDataPacket(JSON.stringify({ ...packet, state: { execute: "no" } }), decode, decode)).toThrow();
    expect(() => parseDataPacket(JSON.stringify({ ...packet, state: Infinity }), decode, decode)).toThrow();
    expect(() => parseDataPacket(JSON.stringify({ ...packet, version: 9 }), decode, decode)).toThrow();
    expect(() => parseDataPacket(JSON.stringify(packet), () => null, decode)).toThrow();
    expect(() => encodeDataPacket({ ...packet, state: "x".repeat(DATA_MAX_BYTES) })).toThrow();
    expect(await checkpointDigest(1, [], 4)).not.toBe(await checkpointDigest(2, [], 4));
  });
  it("reassembles large reordered Unicode snapshots without applying incomplete or stale fragments", () => {
    const raw = JSON.stringify({ payload: "λ".repeat(70_000) });
    const fragments = fragmentPacket(raw, 3);
    expect(fragments.length).toBeGreaterThan(1);
    expect(fragments.every(f => new TextEncoder().encode(f).length <= WIRE_MAX_BYTES)).toBe(true);
    const reader = new WireAssembler();
    expect(reader.accept(fragments[0], 2, true, 0)).toBeNull();
    for (const piece of fragments.slice(1).reverse()) expect(reader.accept(piece, 3, true, 1)).toBeNull();
    expect(reader.accept(fragments[0], 3, true, 1)).toBe(raw);
    const lost = new WireAssembler();
    for (const piece of fragments.slice(1)) expect(lost.accept(piece, 3, true, 0)).toBeNull();
    expect(lost.accept(fragments[0], 3, true, 2001)).toBeNull();
    const invalid: unknown = JSON.parse(fragments[0]);
    if (typeof invalid !== "object" || invalid === null) throw new Error();
    expect(() => reader.accept(JSON.stringify({ ...invalid, total: 999 }), 3, true, 0)).toThrow();
  });
  it("transports the current complete eight-kart RaceState through its real decoder", () => {
    const state = createRace({ courseId: "butterbell", mode: "race", speedClass: 100, mirror: false, bots: true, difficulty: "normal", seed: 123 },
      [{ id: "kart-0", name: "Human", build: DEFAULT_BUILD, players: ["player-0", null] }]);
    const raw = encodeDataPacket({ version: NETWORK_VERSION, type: "snapshot", epoch: 1, sequence: 1, tick: state.tick, acks: [], state });
    const packet = parseDataPacket(raw, parseRaceState, () => { throw new TypeError(); });
    expect(packet.type).toBe("snapshot");
    if (packet.type === "snapshot") expect(packet.state.karts).toHaveLength(8);
  });
});
