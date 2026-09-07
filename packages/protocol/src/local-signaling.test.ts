import { afterEach, describe, expect, it } from "vitest";
import { Server } from "node:http";
import WebSocket from "ws";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { attachLocalSignaling } from "../../../apps/signaling/src/local";
import { NETWORK_VERSION, parseServerMessage } from "./rooms";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });
async function service() {
  const origins = new Set<string>();
  const server = new Server((req, res) => local.middleware(req, res, () => { res.writeHead(404); res.end(); }));
  const local = attachLocalSignaling(server, origins);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No local listen port.");
  const origin = `http://127.0.0.1:${address.port}`; origins.add(origin);
  cleanup.push(async () => { local.close(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const create = (body = JSON.stringify({ version: NETWORK_VERSION }), requestOrigin = origin) => fetch(`${origin}/rooms`, {
    method: "POST", headers: { origin: requestOrigin, "content-type": "application/json" }, body,
  });
  return { origin, create };
}
describe("real local HTTP and websocket adapter", () => {
  it("loads the protocol in native Node without pulling in extensionless simulation/content runtime graphs", async () => {
    const url = new URL("./index.ts", import.meta.url).href;
    const result = await promisify(execFile)(process.execPath, ["--input-type=module", "-e",
      `const protocol = await import(${JSON.stringify(url)}); if (protocol.NETWORK_VERSION !== ${NETWORK_VERSION}) process.exit(1);`],
    { timeout: 10_000 });
    expect(result.stderr).toBe("");
  });
  it("enforces HTTP origins, payload limits and versioned creation", async () => {
    const s = await service();
    expect((await s.create(JSON.stringify({ version: NETWORK_VERSION }), "https://uninvited.example")).status).toBe(403);
    expect((await s.create("x".repeat(1025))).status).toBe(413);
    expect((await s.create('{"version":1}')).status).toBe(400);
    const created = await s.create(); expect(created.status).toBe(201);
    const value: unknown = await created.json();
    expect(value).toMatchObject({ version: NETWORK_VERSION, code: expect.stringMatching(/^[A-Z2-9]{8}$/) });
  });
  it("joins over an actual websocket, rejects foreign origins and closes malformed traffic safely", async () => {
    const s = await service(), created: unknown = await (await s.create()).json();
    if (typeof created !== "object" || created === null || !("code" in created)) throw new Error("No invitation.");
    const url = `${s.origin.replace("http:", "ws:")}/rooms/${created.code}`;
    const denied = new WebSocket(url, { origin: "https://uninvited.example" });
    const status = await new Promise<number>(resolve => {
      denied.on("unexpected-response", (_request, response) => { resolve(response.statusCode ?? 0); response.resume(); denied.terminate(); });
      denied.on("error", () => undefined);
    });
    expect(status).toBe(403);
    const ws = new WebSocket(url, { origin: s.origin });
    cleanup.unshift(async () => { if (ws.readyState !== WebSocket.CLOSED) ws.terminate(); });
    await new Promise<void>((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
    const welcome = new Promise(resolve => ws.once("message", data => resolve(parseServerMessage(JSON.parse(data.toString())))));
    ws.send(JSON.stringify({ version: NETWORK_VERSION, requestId: "1", type: "join", names: ["Socket test"], resume: null, capability: { visible: true, capable: true } }));
    expect(await welcome).toMatchObject({ type: "welcome", resumed: false, room: { phase: "lobby" } });
    const closed = new Promise<number>(resolve => ws.once("close", code => resolve(code)));
    ws.send("{broken");
    expect(await closed).toBe(1008);
  });
});
