import type {
  DurableObjectNamespace, DurableObjectState, Fetcher, Request as WorkerRequest,
  Response as WorkerResponse, WebSocket as WorkerSocket,
} from "@cloudflare/workers-types";
import { NETWORK_VERSION, ROOM_CODE_PATTERN, SIGNAL_MAX_BYTES } from "@kartsick/protocol";
import { RoomEngine, newRoomCode, randomHex, type StoredRoom } from "./room";

interface Env { ROOMS: DurableObjectNamespace; ADMISSION: DurableObjectNamespace; ASSETS: Fetcher; PUBLIC_ORIGIN: string }
declare const WebSocketPair: typeof import("@cloudflare/workers-types").WebSocketPair;
declare const Response: typeof import("@cloudflare/workers-types").Response;
function reply(status: number, value: object): WorkerResponse {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
/** Deploy on Workers Free only. This worker has no TURN binding or credential endpoint. */
export default {
  async fetch(request: WorkerRequest, env: Env): Promise<WorkerResponse> {
    const url = new URL(request.url);
    if (url.pathname !== "/rooms" && !url.pathname.startsWith("/rooms/")) return env.ASSETS.fetch(request);
    if (request.headers.get("Origin") !== env.PUBLIC_ORIGIN || url.origin !== env.PUBLIC_ORIGIN)
      return reply(403, { error: "Room origin is not allowed." });
    if (url.search) return reply(400, { error: "Room URLs do not accept query credentials." });
    if (url.pathname === "/rooms" && request.method === "POST") {
      if (Number(request.headers.get("content-length") ?? 0) > 1024) return reply(413, { error: "Creation body exceeds 1 KiB." });
      const reader = request.body?.getReader();
      if (!reader) return reply(400, { error: "A versioned creation body is required." });
      let body = ""; let bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 1024) { await reader.cancel(); return reply(413, { error: "Creation body exceeds 1 KiB." }); }
          body += new TextDecoder().decode(chunk.value);
        }
        const input: unknown = JSON.parse(body);
        if (typeof input !== "object" || input === null || !("version" in input) || input.version !== NETWORK_VERSION || Object.keys(input).length !== 1)
          return reply(400, { error: "Unsupported protocol version." });
      } catch { return reply(400, { error: "Malformed creation body." }); }
      const admission = await env.ADMISSION.get(env.ADMISSION.idFromName("global")).fetch("https://internal/allocate", { method: "POST" });
      if (!admission.ok) return reply(429, { error: "Free-service admission limit reached. Try again later." });
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = newRoomCode();
        const result = await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(`https://internal/create/${code}`, { method: "POST" });
        if (result.status === 201) return reply(201, { version: NETWORK_VERSION, code });
      }
      return reply(503, { error: "Could not allocate an invitation." });
    }
    const code = url.pathname.slice("/rooms/".length);
    if (!ROOM_CODE_PATTERN.test(code) || request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return reply(400, { error: "Expected a room websocket invitation." });
    const admitted = await env.ADMISSION.get(env.ADMISSION.idFromName("global")).fetch("https://internal/connect", { method: "POST" });
    if (!admitted.ok) return reply(429, { error: "Free-service connection limit reached. Try again later." });
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
  },
};

export class RoomObject {
  private engine: RoomEngine | null = null;
  private readonly state: DurableObjectState;
  constructor(ctx: DurableObjectState) {
    this.state = ctx;
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS room_state (singleton INTEGER PRIMARY KEY CHECK(singleton=1), json TEXT NOT NULL)");
    const row = ctx.storage.sql.exec<{ json: string }>("SELECT json FROM room_state WHERE singleton=1").toArray()[0];
    if (row) {
      // Only this class writes this private SQLite row, never websocket payloads.
      const saved: StoredRoom = JSON.parse(row.json);
      this.engine = new RoomEngine(saved.room.code, Date.now, saved);
      for (const ws of ctx.getWebSockets()) {
        const attachment: unknown = ws.deserializeAttachment();
        if (typeof attachment === "string") this.engine.reattach(attachment, this.adapter(ws));
        else ws.close(1008, "Invalid socket attachment.");
      }
    }
  }
  private adapter(ws: WorkerSocket) {
    return {
      send(message: import("@kartsick/protocol").ServerMessage) { ws.send(JSON.stringify(message)); },
      close(code: number, reason: string) { ws.close(code, reason); },
    };
  }
  private async persist(): Promise<void> {
    const engine = this.engine;
    if (!engine || engine.expired) {
      await this.state.storage.deleteAll(); this.engine = null; return;
    }
    this.state.storage.sql.exec("INSERT OR REPLACE INTO room_state(singleton,json) VALUES (1,?)", JSON.stringify(engine.export()));
    await this.state.storage.setAlarm(engine.nextAlarm());
  }
  async fetch(request: WorkerRequest): Promise<WorkerResponse> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/create/") && request.method === "POST") {
      if (this.engine) return reply(409, { error: "Invitation exists." });
      const code = url.pathname.slice("/create/".length);
      if (!ROOM_CODE_PATTERN.test(code)) return reply(400, { error: "Invalid code." });
      this.state.storage.sql.exec("CREATE TABLE IF NOT EXISTS room_state (singleton INTEGER PRIMARY KEY CHECK(singleton=1), json TEXT NOT NULL)");
      this.engine = new RoomEngine(code); await this.persist(); return reply(201, { created: true });
    }
    this.engine?.tick();
    if (!this.engine || this.engine.expired) { await this.persist(); return reply(404, { error: "Room expired or not found." }); }
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    const connectionId = randomHex();
    this.state.acceptWebSocket(server);
    server.serializeAttachment(connectionId);
    this.engine.connect(connectionId, this.adapter(server));
    await this.persist();
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws: WorkerSocket, message: string | ArrayBuffer): Promise<void> {
    const connectionId: unknown = ws.deserializeAttachment();
    if (!this.engine || typeof connectionId !== "string") { ws.close(1008, "Room expired."); return; }
    if (typeof message !== "string") { ws.close(1003, "Use JSON text."); this.engine.disconnect(connectionId); }
    else if (new TextEncoder().encode(message).length > SIGNAL_MAX_BYTES) { ws.close(1009, "Message too large."); this.engine.disconnect(connectionId); }
    else await this.engine.receive(connectionId, message);
    await this.persist();
  }
  async webSocketClose(ws: WorkerSocket, code: number): Promise<void> {
    const connectionId: unknown = ws.deserializeAttachment();
    if (typeof connectionId === "string") this.engine?.disconnect(connectionId);
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, "Connection closed."); } catch { /* Peer already closed. */ }
    await this.persist();
  }
  async webSocketError(ws: WorkerSocket): Promise<void> { await this.webSocketClose(ws, 1011); }
  async alarm(): Promise<void> { this.engine?.tick(); await this.persist(); }
}

/** Global, persisted admission bound without IP storage; not a monetary billing cap. */
export class Admission {
  private readonly state: DurableObjectState;
  constructor(ctx: DurableObjectState) {
    this.state = ctx;
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS admissions (at INTEGER NOT NULL)");
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS connections (at INTEGER NOT NULL)");
  }
  fetch(request: WorkerRequest): WorkerResponse {
    const now = Date.now();
    if (new URL(request.url).pathname === "/connect") {
      this.state.storage.sql.exec("DELETE FROM connections WHERE at <= ?", now - 60_000);
      const total = this.state.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM connections").toArray()[0].count;
      if (total >= 240) return reply(429, { limited: true });
      this.state.storage.sql.exec("INSERT INTO connections(at) VALUES (?)", now);
      return reply(200, { allowed: true });
    }
    this.state.storage.sql.exec("DELETE FROM admissions WHERE at < ?", now - 3_600_000);
    const row = this.state.storage.sql.exec<{ total: number; recent: number }>(
      "SELECT COUNT(*) AS total, COALESCE(SUM(at > ?), 0) AS recent FROM admissions", now - 60_000).toArray()[0];
    if (row.total >= 120 || row.recent >= 10) return reply(429, { limited: true });
    this.state.storage.sql.exec("INSERT INTO admissions(at) VALUES (?)", now);
    return reply(200, { allowed: true });
  }
}
