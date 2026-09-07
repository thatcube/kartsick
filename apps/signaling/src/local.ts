import { Server, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { Plugin } from "vite";
import { NETWORK_VERSION, ROOM_CODE_PATTERN, SIGNAL_MAX_BYTES } from "@kartsick/protocol";
import { RoomEngine, TokenBucket, newRoomCode, randomHex } from "./room.ts";

export function attachLocalSignaling(server: Server, origins: ReadonlySet<string>) {
  const rooms = new Map<string, RoomEngine>();
  const createLimit = new TokenBucket(10, 1 / 6);
  const upgradeLimit = new TokenBucket(40, 4);
  const sockets = new WebSocketServer({ noServer: true, maxPayload: SIGNAL_MAX_BYTES, perMessageDeflate: false });
  function response(res: ServerResponse, status: number, value: object): void {
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(value));
  }
  function allowed(req: IncomingMessage): boolean {
    return typeof req.headers.origin === "string" && origins.has(req.headers.origin);
  }
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    if (req.url !== "/rooms") { next(); return; }
    if (req.method !== "POST") { response(res, 405, { error: "Use POST to create an invitation." }); return; }
    if (!allowed(req)) { response(res, 403, { error: "This origin cannot create rooms." }); return; }
    if (!createLimit.take()) { response(res, 429, { error: "Room creation limit reached; try again shortly." }); return; }
    if (rooms.size >= 256) { response(res, 503, { error: "The local room service is at capacity." }); return; }
    let body = ""; let size = 0; let ended = false;
    req.setTimeout(5000, () => {
      if (!ended) { ended = true; response(res, 408, { error: "Room creation timed out." }); }
      req.destroy();
    });
    req.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > 1024) {
        if (!ended) {
          ended = true; res.setHeader("connection", "close"); response(res, 413, { error: "Creation body exceeds 1 KiB." });
          res.once("finish", () => req.destroy());
        }
      } else body += chunk.toString("utf8");
    });
    req.on("end", () => {
      req.setTimeout(0);
      if (ended) return;
      try {
        const value: unknown = JSON.parse(body);
        if (typeof value !== "object" || value === null || !("version" in value) || value.version !== NETWORK_VERSION || Object.keys(value).length !== 1)
          throw new TypeError();
        let code = newRoomCode(); while (rooms.has(code)) code = newRoomCode();
        rooms.set(code, new RoomEngine(code));
        response(res, 201, { version: NETWORK_VERSION, code });
      } catch { response(res, 400, { error: "Expected a supported protocol version." }); }
    });
    req.on("error", () => { if (!res.headersSent) response(res, 400, { error: "Incomplete request." }); });
  };
  // Only intercept our own path; Vite owns its separate HMR websocket.
  const onUpgrade = (req: IncomingMessage, socket: import("node:stream").Duplex, head: Buffer): void => {
    if (!req.url?.startsWith("/rooms/")) return;
    const code = req.url.slice("/rooms/".length);
    const deny = (status: string) => { socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); };
    if (!allowed(req)) { deny("403 Forbidden"); return; }
    if (!upgradeLimit.take()) { deny("429 Too Many Requests"); return; }
    const room = ROOM_CODE_PATTERN.test(code) ? rooms.get(code) : undefined;
    if (!room || room.expired) { deny("404 Not Found"); return; }
    sockets.handleUpgrade(req, socket, head, ws => {
      const connectionId = randomHex();
      const accepted = room.connect(connectionId, {
        send(message) {
          if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 128 * 1024) throw new Error("Slow signaling consumer.");
          ws.send(JSON.stringify(message));
        },
        close(code, reason) {
          ws.close(code, reason);
          const deadline = setTimeout(() => { if (ws.readyState !== WebSocket.CLOSED) ws.terminate(); }, 1000);
          deadline.unref(); ws.once("close", () => clearTimeout(deadline));
        },
      });
      if (!accepted) return;
      ws.on("message", (data, binary) => {
        if (binary) { ws.close(1003, "Room messages must be JSON text."); room.disconnect(connectionId); return; }
        void room.receive(connectionId, data.toString());
      });
      ws.on("close", () => room.disconnect(connectionId));
      ws.on("error", () => room.disconnect(connectionId));
    });
  };
  server.on("upgrade", onUpgrade);
  const interval = setInterval(() => {
    for (const [code, room] of rooms) { room.tick(); if (room.expired) rooms.delete(code); }
  }, 1000);
  interval.unref();
  return { middleware, rooms, close() {
    clearInterval(interval); server.off("upgrade", onUpgrade);
    for (const room of rooms.values()) room.shutdown();
    rooms.clear(); sockets.close();
  } };
}

export function localSignalingPlugin(): Plugin {
  return {
    name: "kartsick-local-signaling",
    configureServer(server) {
      if (!(server.httpServer instanceof Server)) throw new Error("Local rooms require a Vite HTTP/1 server.");
      const port = server.config.server.port;
      const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
      const local = attachLocalSignaling(server.httpServer, origins);
      server.middlewares.use(local.middleware);
      server.middlewares.use((req, res, next) => {
        if (req.url !== "/__network-test") { next(); return; }
        res.setHeader("content-type", "text/html");
        res.end("<!doctype html><title>Owned network test</title>");
      });
      server.httpServer.once("close", () => local.close());
    },
  };
}
