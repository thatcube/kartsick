import {
  BODY_IDS, CHARACTER_IDS, COURSE_IDS, DECAL_IDS, GLIDER_IDS, PAINT_IDS, WHEEL_IDS,
  type CourseId, type KartBuild,
} from "../../content/src/catalog-types.ts";
import { array, boolean, choice, id, keys, nullableId, object, text, uint } from "./validation.ts";
export { byteLength, json } from "./validation.ts";

export const NETWORK_VERSION = 2;
export const SIGNAL_MAX_BYTES = 24_576;
export const ROOM_TTL_MS = 4 * 60 * 60 * 1000;
export const ROOM_IDLE_MS = 10 * 60 * 1000;
export const RESERVATION_MS = 60_000;
export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
export type RoomPhase = "lobby" | "racing" | "migrating" | "paused";
export interface LocalPlayer { id: string; name: string; ready: boolean }
export interface Participant {
  id: string;
  players: LocalPlayer[];
  connected: boolean;
  reservedUntil: number | null;
  visible: boolean;
  capable: boolean;
}
export interface KartSeat { kart: number; side: 0 | 1 }
export interface RoomKart { build: KartBuild; seats: [string | null, string | null] }
export interface LobbyConfig {
  course: CourseId;
  mode: "quick" | "cup" | "tour";
  cup: "town" | "horizon";
  speed: 50 | 100 | 150;
  mirror: boolean;
  bots: boolean;
  difficulty: "easy" | "normal" | "hard";
}
export const DEFAULT_LOBBY: LobbyConfig = {
  course: "butterbell", mode: "quick", cup: "town", speed: 100, mirror: false, bots: true, difficulty: "normal",
};
export interface InputAck { playerId: string; sequence: number }
export interface CheckpointRef { id: string; tick: number; digest: string; acks: InputAck[] }
export interface Room {
  version: typeof NETWORK_VERSION;
  code: string;
  revision: number;
  expiresAt: number;
  phase: RoomPhase;
  hostId: string | null;
  authorityId: string | null;
  epoch: number;
  participants: Participant[];
  karts: RoomKart[];
  config: LobbyConfig;
  startAt: number | null;
  seed: number;
  checkpoint: CheckpointRef | null;
  pendingCheckpoint: CheckpointRef | null;
  reason: string | null;
}
export interface Capability { visible: boolean; capable: boolean }
export type SignalDescription = { type: "offer" | "answer"; sdp: string };
export type SignalCandidate = { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null; usernameFragment: string | null };
export type PeerSignal = { kind: "description"; description: SignalDescription } | { kind: "ice"; candidate: SignalCandidate };
export type RoomCommand =
  | { type: "join"; names: string[]; resume: string | null; capability: Capability }
  | { type: "players"; names: string[] }
  | { type: "seat"; playerId: string; seat: KartSeat | null }
  | { type: "ready"; playerId: string; ready: boolean }
  | { type: "build"; kart: number; build: KartBuild }
  | { type: "config"; config: LobbyConfig }
  | { type: "start" | "return" | "rematch" | "leave" | "ping" }
  | { type: "capability"; capability: Capability }
  | { type: "signal"; to: string; epoch: number; attempt: string; signal: PeerSignal }
  | { type: "checkpoint-propose"; epoch: number; checkpoint: CheckpointRef }
  | { type: "checkpoint-have"; epoch: number; checkpointId: string; digest: string }
  | { type: "migration-ready"; epoch: number; checkpointId: string }
  | { type: "migration-failed"; epoch: number }
  | { type: "transport-failed"; epoch: number; peerId: string };
export type ClientMessage = RoomCommand & { version: typeof NETWORK_VERSION; requestId: string };
export type ServerMessage =
  | { version: typeof NETWORK_VERSION; type: "welcome"; participantId: string; resume: string; resumed: boolean; room: Room }
  | { version: typeof NETWORK_VERSION; type: "room"; room: Room }
  | { version: typeof NETWORK_VERSION; type: "ok"; requestId: string }
  | { version: typeof NETWORK_VERSION; type: "pong"; requestId: string; serverTime: number }
  | { version: typeof NETWORK_VERSION; type: "error"; requestId: string | null; code: string; message: string }
  | { version: typeof NETWORK_VERSION; type: "signal"; from: string; epoch: number; attempt: string; signal: PeerSignal };

export function parseBuild(value: unknown): KartBuild {
  const v = object(value); keys(v, ["characters", "body", "wheels", "glider", "paint", "decal"]);
  const characters = array(v.characters, 2, c => choice(c, CHARACTER_IDS));
  if (characters.length !== 2 || characters[0] === characters[1]) throw new TypeError("A kart needs two distinct characters.");
  return { characters: [characters[0], characters[1]], body: choice(v.body, BODY_IDS), wheels: choice(v.wheels, WHEEL_IDS),
    glider: choice(v.glider, GLIDER_IDS), paint: choice(v.paint, PAINT_IDS), decal: choice(v.decal, DECAL_IDS) };
}
export function parseLobbyConfig(value: unknown): LobbyConfig {
  const v = object(value); keys(v, ["course", "mode", "cup", "speed", "mirror", "bots", "difficulty"]);
  return { course: choice(v.course, COURSE_IDS), mode: choice(v.mode, ["quick", "cup", "tour"]),
    cup: choice(v.cup, ["town", "horizon"]), speed: choice(v.speed, [50, 100, 150]),
    mirror: boolean(v.mirror), bots: boolean(v.bots), difficulty: choice(v.difficulty, ["easy", "normal", "hard"]) };
}
export function parseAcks(value: unknown): InputAck[] {
  const result = array(value, 16, entry => {
    const v = object(entry); keys(v, ["playerId", "sequence"]);
    return { playerId: id(v.playerId), sequence: uint(v.sequence) };
  });
  if (new Set(result.map(ack => ack.playerId)).size !== result.length) throw new TypeError("Duplicate acknowledgment.");
  return result;
}
export function parseCheckpointRef(value: unknown): CheckpointRef {
  const v = object(value); keys(v, ["id", "tick", "digest", "acks"]);
  return { id: id(v.id), tick: uint(v.tick), digest: text(v.digest, 64, /^[a-f0-9]{64}$/), acks: parseAcks(v.acks) };
}
function capability(value: unknown): Capability {
  const v = object(value); keys(v, ["visible", "capable"]);
  return { visible: boolean(v.visible), capable: boolean(v.capable) };
}
function names(value: unknown): string[] {
  const result = array(value, 4, n => text(n, 24, /^[^\u0000-\u001f\u007f<>]{1,24}$/).trim());
  if (!result.length || result.some(n => !n.length)) throw new TypeError("Choose one to four player names.");
  return result;
}
export function parsePeerSignal(value: unknown): PeerSignal {
  const v = object(value);
  if (v.kind === "description") {
    keys(v, ["kind", "description"]);
    const d = object(v.description); keys(d, ["type", "sdp"]);
    return { kind: "description", description: { type: choice(d.type, ["offer", "answer"]), sdp: text(d.sdp, 16_384) } };
  }
  if (v.kind === "ice") {
    keys(v, ["kind", "candidate"]);
    const c = object(v.candidate); keys(c, ["candidate", "sdpMid", "sdpMLineIndex", "usernameFragment"]);
    return { kind: "ice", candidate: { candidate: text(c.candidate, 2048),
      sdpMid: c.sdpMid === null ? null : text(c.sdpMid, 64),
      sdpMLineIndex: c.sdpMLineIndex === null ? null : uint(c.sdpMLineIndex, 8),
      usernameFragment: c.usernameFragment === null ? null : text(c.usernameFragment, 256) } };
  }
  throw new TypeError("Unsupported peer signal.");
}
export function parseClientMessage(value: unknown): ClientMessage {
  const v = object(value);
  if (v.version !== NETWORK_VERSION) throw new TypeError("Unsupported network version.");
  const common = { version: NETWORK_VERSION, requestId: id(v.requestId) } as const;
  const fields = (...extra: string[]) => keys(v, ["version", "requestId", "type", ...extra]);
  switch (v.type) {
    case "join": fields("names", "resume", "capability"); return { ...common, type: "join", names: names(v.names),
      resume: v.resume === null ? null : text(v.resume, 64, /^[a-f0-9]{64}$/), capability: capability(v.capability) };
    case "players": fields("names"); return { ...common, type: "players", names: names(v.names) };
    case "seat": {
      fields("playerId", "seat");
      if (v.seat === null) return { ...common, type: "seat", playerId: id(v.playerId), seat: null };
      const s = object(v.seat); keys(s, ["kart", "side"]);
      return { ...common, type: "seat", playerId: id(v.playerId), seat: { kart: uint(s.kart, 7), side: choice(s.side, [0, 1]) } };
    }
    case "ready": fields("playerId", "ready"); return { ...common, type: "ready", playerId: id(v.playerId), ready: boolean(v.ready) };
    case "build": fields("kart", "build"); return { ...common, type: "build", kart: uint(v.kart, 7), build: parseBuild(v.build) };
    case "config": fields("config"); return { ...common, type: "config", config: parseLobbyConfig(v.config) };
    case "capability": fields("capability"); return { ...common, type: "capability", capability: capability(v.capability) };
    case "signal": fields("to", "epoch", "attempt", "signal"); return { ...common, type: "signal",
      to: id(v.to), epoch: uint(v.epoch), attempt: id(v.attempt), signal: parsePeerSignal(v.signal) };
    case "checkpoint-propose": fields("epoch", "checkpoint"); return { ...common, type: "checkpoint-propose", epoch: uint(v.epoch), checkpoint: parseCheckpointRef(v.checkpoint) };
    case "checkpoint-have": fields("epoch", "checkpointId", "digest"); return { ...common, type: "checkpoint-have", epoch: uint(v.epoch), checkpointId: id(v.checkpointId), digest: text(v.digest, 64, /^[a-f0-9]{64}$/) };
    case "migration-ready": fields("epoch", "checkpointId"); return { ...common, type: "migration-ready", epoch: uint(v.epoch), checkpointId: id(v.checkpointId) };
    case "migration-failed": fields("epoch"); return { ...common, type: "migration-failed", epoch: uint(v.epoch) };
    case "transport-failed": fields("epoch", "peerId"); return { ...common, type: "transport-failed", epoch: uint(v.epoch), peerId: id(v.peerId) };
    case "start": case "return": case "rematch": case "leave": case "ping": fields(); return { ...common, type: v.type };
    default: throw new TypeError("Unsupported room command.");
  }
}
export function parseRoom(value: unknown): Room {
  const v = object(value);
  keys(v, ["version", "code", "revision", "expiresAt", "phase", "hostId", "authorityId", "epoch", "participants", "karts", "config", "startAt", "seed", "checkpoint", "pendingCheckpoint", "reason"]);
  if (v.version !== NETWORK_VERSION) throw new TypeError("Unsupported room version.");
  const participants = array(v.participants, 16, entry => {
    const p = object(entry); keys(p, ["id", "players", "connected", "reservedUntil", "visible", "capable"]);
    const players = array(p.players, 4, entry => {
      const player = object(entry); keys(player, ["id", "name", "ready"]);
      return { id: id(player.id), name: names([player.name])[0], ready: boolean(player.ready) };
    });
    if (!players.length) throw new TypeError("Empty browser membership.");
    return { id: id(p.id), players, connected: boolean(p.connected), reservedUntil: p.reservedUntil === null ? null : uint(p.reservedUntil, Number.MAX_SAFE_INTEGER),
      visible: boolean(p.visible), capable: boolean(p.capable) };
  });
  const players = participants.flatMap(p => p.players.map(player => player.id));
  if (players.length > 16 || new Set(players).size !== players.length || new Set(participants.map(p => p.id)).size !== participants.length) throw new TypeError("Invalid membership.");
  const karts = array(v.karts, 8, entry => {
    const k = object(entry); keys(k, ["build", "seats"]);
    const seats = array(k.seats, 2, nullableId);
    if (seats.length !== 2) throw new TypeError("Invalid seats.");
    const kart: RoomKart = { build: parseBuild(k.build), seats: [seats[0], seats[1]] };
    return kart;
  });
  const occupied = karts.flatMap(k => k.seats.filter(s => s !== null));
  if (karts.length !== 8 || new Set(occupied).size !== occupied.length || occupied.some(s => !players.includes(s))) throw new TypeError("Invalid seat ownership.");
  const hostId = nullableId(v.hostId), authorityId = nullableId(v.authorityId);
  if ([hostId, authorityId].some(pid => pid !== null && !participants.some(p => p.id === pid))) throw new TypeError("Invalid authority membership.");
  return { version: NETWORK_VERSION, code: text(v.code, 8, ROOM_CODE_PATTERN), revision: uint(v.revision),
    expiresAt: uint(v.expiresAt, Number.MAX_SAFE_INTEGER), phase: choice(v.phase, ["lobby", "racing", "migrating", "paused"]),
    hostId, authorityId, epoch: uint(v.epoch), participants, karts, config: parseLobbyConfig(v.config),
    startAt: v.startAt === null ? null : uint(v.startAt, Number.MAX_SAFE_INTEGER), seed: uint(v.seed),
    checkpoint: v.checkpoint === null ? null : parseCheckpointRef(v.checkpoint),
    pendingCheckpoint: v.pendingCheckpoint === null ? null : parseCheckpointRef(v.pendingCheckpoint),
    reason: v.reason === null ? null : text(v.reason, 240) };
}
export function parseServerMessage(value: unknown): ServerMessage {
  const v = object(value);
  if (v.version !== NETWORK_VERSION) throw new TypeError("Unsupported network version.");
  const fields = (...extra: string[]) => keys(v, ["version", "type", ...extra]);
  switch (v.type) {
    case "welcome": fields("participantId", "resume", "resumed", "room"); return { version: NETWORK_VERSION, type: "welcome",
      participantId: id(v.participantId), resume: text(v.resume, 64, /^[a-f0-9]{64}$/), resumed: boolean(v.resumed), room: parseRoom(v.room) };
    case "room": fields("room"); return { version: NETWORK_VERSION, type: "room", room: parseRoom(v.room) };
    case "ok": fields("requestId"); return { version: NETWORK_VERSION, type: "ok", requestId: id(v.requestId) };
    case "pong": fields("requestId", "serverTime"); return { version: NETWORK_VERSION, type: "pong", requestId: id(v.requestId), serverTime: uint(v.serverTime, Number.MAX_SAFE_INTEGER) };
    case "error": fields("requestId", "code", "message"); return { version: NETWORK_VERSION, type: "error",
      requestId: v.requestId === null ? null : id(v.requestId), code: id(v.code), message: text(v.message, 240) };
    case "signal": fields("from", "epoch", "attempt", "signal"); return { version: NETWORK_VERSION, type: "signal", from: id(v.from),
      epoch: uint(v.epoch), attempt: id(v.attempt), signal: parsePeerSignal(v.signal) };
    default: throw new TypeError("Unsupported server message.");
  }
}
