import type { Page } from "@playwright/test";
import { test, expect } from "./fixture";
import { withSecondBrowser } from "./second-browser";
import type { KartsickNetwork, NetworkEvent } from "../../apps/web/src/network";

interface TestState { tick: number; value: number; padding?: string }
interface TestEvent { kind: "test-event"; value: number }
interface Probe {
  net: KartsickNetwork<TestState, TestEvent>;
  events: NetworkEvent<TestState, TestEvent>[];
  restored: TestState | null;
  restoredAcks: { playerId: string; sequence: number }[];
  raw(packet: object, channel: "movement" | "control"): void;
}
declare global { interface Window { __networkTest: Probe } }

async function open(page: Page, code: string | null = null, failRestore = false, fastFailure = false, localHumans = 1): Promise<string> {
  await page.goto("http://127.0.0.1:4174/__network-test");
  return page.evaluate(async ({ code, failRestore, fastFailure, localHumans }) => {
    const moduleUrl = "/src/network/index.ts";
    const module: typeof import("../../apps/web/src/network") = await import(moduleUrl);
    const decodeState = (value: unknown): TestState => {
      if (typeof value !== "object" || value === null || !("tick" in value) || !("value" in value) ||
        Object.keys(value).some(key => !["tick", "value", "padding"].includes(key)) || typeof value.tick !== "number" || typeof value.value !== "number" ||
        !Number.isSafeInteger(value.tick) || value.tick < 0 || !Number.isFinite(value.value)) throw new TypeError("Invalid test state.");
      if ("padding" in value) {
        if (typeof value.padding !== "string" || value.padding.length > 180_000) throw new TypeError("Invalid padding.");
        return { tick: value.tick, value: value.value, padding: value.padding };
      }
      return { tick: value.tick, value: value.value };
    };
    const options = {
      names: Array.from({ length: localHumans }, (_, index) => `Test human ${index + 1}`), stunUrls: [], decodeState,
      decodeEvent(value: unknown): TestEvent {
        if (typeof value !== "object" || value === null || !("kind" in value) || value.kind !== "test-event" ||
          !("value" in value) || typeof value.value !== "number" || !Number.isFinite(value.value)) throw new TypeError("Invalid test event.");
        return { kind: "test-event", value: value.value };
      },
      async restoreCheckpoint(checkpoint: { state: TestState; reference: { acks: { playerId: string; sequence: number }[] } }): Promise<void> {
        if (failRestore) throw new Error("Deliberate application restore failure.");
        window.__networkTest.restored = checkpoint.state;
        window.__networkTest.restoredAcks = checkpoint.reference.acks;
      },
      connectTimeoutMs: fastFailure ? 750 : 8000,
      maxAttempts: fastFailure ? 2 : 3,
    };
    const net = code ? await module.KartsickNetwork.join(code, options) : await module.KartsickNetwork.create(options);
    const probe: Probe = { net, events: [], restored: null, restoredAcks: [], raw(packet, channel) {
      const peers: unknown = Reflect.get(net, "peers");
      if (!(peers instanceof Map)) throw new Error("No peers.");
      const peer: unknown = peers.values().next().value;
      if (typeof peer !== "object" || peer === null || !(channel in peer)) throw new Error("No channel.");
      const data: unknown = Reflect.get(peer, channel);
      if (!(data instanceof RTCDataChannel)) throw new Error("Not a real RTCDataChannel.");
      data.send(JSON.stringify(packet));
    } };
    window.__networkTest = probe;
    net.subscribe(event => { probe.events.push(event); if (probe.events.length > 500) probe.events.shift(); });
    return net.connection.code;
  }, { code, failRestore, fastFailure, localHumans });
}
async function race(host: Page, client: Page): Promise<void> {
  await host.evaluate(async () => {
    const c = window.__networkTest.net.connection;
    const player = c.room!.participants.find(p => p.id === c.participantId)!.players[0];
    await c.seat(player.id, { kart: 0, side: 0 });
  });
  await client.evaluate(async () => {
    const c = window.__networkTest.net.connection;
    const player = c.room!.participants.find(p => p.id === c.participantId)!.players[0];
    await c.seat(player.id, { kart: 1, side: 0 });
  });
  for (const page of [host, client]) await page.evaluate(async () => {
    const c = window.__networkTest.net.connection;
    await c.ready(c.room!.participants.find(p => p.id === c.participantId)!.players[0].id);
  });
  await host.evaluate(() => window.__networkTest.net.connection.start());
  for (const page of [host, client]) await page.waitForFunction(() =>
    window.__networkTest.net.room?.phase === "racing" && window.__networkTest.net.connectedPeers.length === 1);
}
test("two actual browsers negotiate WebRTC, exchange owned input/snapshot/reliable events, and reconnect", async ({ browser }, info) => {
  await withSecondBrowser(browser, info.outputPath("second-browser-owner.json"), async (host, client) => {
    const code = await open(host); await open(client, code); await race(host, client);
    const ids = await client.evaluate(() => {
      const net = window.__networkTest.net;
      return { participant: net.participantId, player: net.room!.participants.find(p => p.id === net.participantId)!.players[0].id };
    });
    await client.evaluate(() => {
      const n = window.__networkTest.net;
      const playerId = n.room!.participants.find(p => p.id === n.participantId)!.players[0].id;
      n.sendInputs([{ playerId, tick: 1, input: { throttle: 1, brake: 0, steer: 0.25, pitch: 0,
        drift: false, swap: false, recover: false, useItem: true, throwDirection: 1, slide: 0, passItem: false } }]);
    });
    await host.waitForFunction(() => window.__networkTest.events.some(e => e.type === "inputs"));
    await host.evaluate(() => {
      const net = window.__networkTest.net, frames = net.drainInputs();
      if (frames.length !== 1 || !frames[0].input.useItem || frames[0].input.steer !== 0.25) throw new Error("Input did not cross WebRTC.");
      net.broadcastSnapshot({ tick: 2, value: 17 }, 2, frames.map(f => ({ playerId: f.playerId, sequence: f.sequence })));
      net.broadcastEvent({ kind: "test-event", value: 23 });
    });
    await client.waitForFunction(() => window.__networkTest.events.some(e => e.type === "snapshot" && e.state.value === 17) &&
      window.__networkTest.events.some(e => e.type === "event" && e.event.value === 23) && window.__networkTest.net.pendingInputs().length === 0);
    await host.waitForFunction(() => window.__networkTest.net.getSnapshotAcks().size === 1);
    await client.evaluate(() => {
      const p = window.__networkTest, room = p.net.room!;
      const playerId = room.participants.find(member => member.id === room.hostId)!.players[0].id;
      p.raw({ version: 2, type: "inputs", epoch: room.epoch, snapshotAck: null,
        frames: [{ playerId, sequence: 3, tick: 2, input: { throttle: 1, brake: 0, steer: 0, pitch: 0,
          drift: false, swap: false, recover: false, useItem: false, throwDirection: 1, slide: 0, passItem: false } }] }, "movement");
    });
    await host.waitForFunction(() => window.__networkTest.events.some(e => e.type === "error" && e.error.code === "input-owner"));
    await host.evaluate(() => {
      const p = window.__networkTest, epoch = p.net.room!.epoch;
      p.raw({ version: 2, type: "snapshot", epoch: epoch - 1, sequence: 999, tick: 99, acks: [], state: { tick: 99, value: 999 } }, "movement");
      p.raw({ version: 2, type: "snapshot", epoch, sequence: 999, tick: 99, acks: [], state: { unvalidated: true } }, "movement");
    });
    await client.waitForFunction(() => window.__networkTest.events.some(e => e.type === "error" && e.error.code === "invalid-peer-message"));
    expect(await client.evaluate(() => window.__networkTest.events.filter(e => e.type === "snapshot").length)).toBe(1);
    await client.evaluate(() => window.__networkTest.net.connection.reconnect());
    await client.waitForFunction(() => window.__networkTest.events.filter(e => e.type === "signaling" && e.status === "connected").length >= 1 &&
      window.__networkTest.net.connectedPeers.length === 1);
    expect(await client.evaluate(() => {
      const n = window.__networkTest.net;
      return { participant: n.participantId, player: n.room!.karts[1].seats[0] };
    })).toEqual(ids);
    await host.waitForFunction(() => window.__networkTest.net.connectedPeers.length === 1);
    await host.evaluate(() => window.__networkTest.net.broadcastSnapshot({ tick: 3, value: 29 }, 3, []));
    await client.waitForFunction(() => window.__networkTest.events.some(e => e.type === "snapshot" && e.state.value === 29));
    await host.evaluate(() => window.__networkTest.net.broadcastSnapshot({ tick: 4, value: 30, padding: "x".repeat(120_000) }, 4, []));
    await client.waitForFunction(() => window.__networkTest.events.some(e => e.type === "snapshot" && e.state.padding?.length === 120_000));
    await host.evaluate(() => window.__networkTest.net.commitCheckpoint({ tick: 4, value: 30, padding: "x".repeat(120_000) }, 4, []));
    await client.waitForFunction(() => window.__networkTest.net.room?.checkpoint?.tick === 4);
    await client.evaluate(() => {
      const p = window.__networkTest, room = p.net.room!;
      const playerId = room.participants.find(member => member.id === p.net.participantId)!.players[0].id;
      p.raw({ version: 2, type: "inputs", epoch: room.epoch, snapshotAck: null,
        frames: [{ playerId, sequence: 1000, tick: 5, input: { throttle: 0, brake: 0, steer: 0, pitch: 0,
          drift: false, swap: false, recover: false, useItem: false, throwDirection: 1, slide: 0, passItem: false } }] }, "movement");
    });
    await host.waitForFunction(() => window.__networkTest.events.some(e => e.type === "inputs" && e.frames.some(f => f.sequence === 1000)));
    const reloadAcks = await host.evaluate(() => window.__networkTest.net.drainInputs().map(f => ({ playerId: f.playerId, sequence: f.sequence })));
    await client.evaluate(() => window.__networkTest.net.dispose());
    await open(client, code);
    await host.waitForFunction(() => window.__networkTest.net.connectedPeers.length === 1);
    await client.waitForFunction(() => window.__networkTest.net.connectedPeers.length === 1);
    await host.evaluate(acks => window.__networkTest.net.broadcastSnapshot({ tick: 5, value: 31 }, 5, acks), reloadAcks);
    await client.waitForFunction(() => window.__networkTest.events.some(e => e.type === "snapshot" && e.acks.some(a => a.sequence === 1000)));
    await client.evaluate(() => {
      const net = window.__networkTest.net;
      const playerId = net.room!.participants.find(p => p.id === net.participantId)!.players[0].id;
      net.sendInputs([{ playerId, tick: 6, input: { throttle: 0, brake: 0, steer: 0, pitch: 0,
        drift: false, swap: false, recover: false, useItem: false, throwDirection: 1, slide: 0, passItem: false } }]);
    });
    await host.waitForFunction(() => window.__networkTest.events.some(e => e.type === "inputs" && e.frames.some(f => f.sequence === 1001)));
    await host.evaluate(() => window.__networkTest.net.connection.rematch());
    for (const page of [host, client]) await page.waitForFunction(() => window.__networkTest.net.room?.phase === "lobby");
    expect(await client.evaluate(() => window.__networkTest.net.room!.code)).toBe(code);
  });
});

test("replicated checkpoint transfers authority with a new epoch and restores acknowledgments", async ({ browser }, info) => {
  await withSecondBrowser(browser, info.outputPath("second-browser-owner.json"), async (host, client) => {
    const code = await open(host); await open(client, code); await race(host, client);
    const oldEpoch = await host.evaluate(() => window.__networkTest.net.room!.epoch);
    await client.evaluate(() => {
      const net = window.__networkTest.net;
      const playerId = net.room!.participants.find(p => p.id === net.participantId)!.players[0].id;
      net.sendInputs([{ playerId, tick: 1, input: { throttle: 1, brake: 0, steer: 0, pitch: 0,
        drift: false, swap: false, recover: false, useItem: false, throwDirection: 1, slide: 0, passItem: false } }]);
    });
    await host.waitForFunction(() => window.__networkTest.events.some(e => e.type === "inputs"));
    await host.evaluate(() => {
      const net = window.__networkTest.net;
      const acks = net.drainInputs().map(f => ({ playerId: f.playerId, sequence: f.sequence }));
      return net.commitCheckpoint({ tick: 42, value: 77 }, 42, acks);
    });
    for (const page of [host, client]) await page.waitForFunction(() => window.__networkTest.net.room?.checkpoint?.tick === 42);
    await host.evaluate(() => window.__networkTest.net.dispose());
    await client.waitForFunction(() => window.__networkTest.net.isAuthority && window.__networkTest.restored?.value === 77);
    expect(await client.evaluate(() => window.__networkTest.net.room!.epoch)).toBeGreaterThan(oldEpoch);
    expect(await client.evaluate(() => window.__networkTest.net.room!.code)).toBe(code);
    expect(await client.evaluate(() => window.__networkTest.restoredAcks.map(ack => ack.sequence))).toEqual([1]);
    expect(await client.evaluate(() => {
      const net = window.__networkTest.net;
      const playerId = net.room!.participants.find(p => p.id === net.participantId)!.players[0].id;
      net.sendInputs([{ playerId, tick: 43, input: { throttle: 0, brake: 0, steer: 0, pitch: 0,
        drift: false, swap: false, recover: false, useItem: false, throwDirection: 1, slide: 0, passItem: false } }]);
      return net.drainInputs().map(f => f.sequence);
    })).toEqual([2]);
    // The former authority is a late/reconnecting peer, not a second active authority.
    await open(host, code);
    await host.waitForFunction(() => window.__networkTest.net.connectedPeers.length === 1);
    expect(await host.evaluate(() => window.__networkTest.net.isAuthority)).toBe(false);
    await client.evaluate(() => window.__networkTest.net.broadcastSnapshot({ tick: 43, value: 78 }, 43, []));
    await host.waitForFunction(() => window.__networkTest.events.some(e => e.type === "snapshot" && e.state.value === 78));
  });

});

test("synthetic sixteen-human room exchanges all four local players per browser across eight tandem karts", async ({ browser }, info) => {
    await withSecondBrowser(browser, info.outputPath("second-browser-owner.json"), async (host, client, first) => {
      const extra = [await first.newPage(), await first.newPage()];
      const pages = [host, client, ...extra];
      try {
        const code = await open(host, null, false, false, 4);
        for (const page of pages.slice(1)) await open(page, code, false, false, 4);
        for (let group = 0; group < pages.length; group++) await pages[group].evaluate(async group => {
          const c = window.__networkTest.net.connection;
          const players = c.room!.participants.find(p => p.id === c.participantId)!.players;
          for (let i = 0; i < players.length; i++) {
            const slot = group * 4 + i;
            await c.seat(players[i].id, { kart: Math.floor(slot / 2), side: slot % 2 === 0 ? 0 : 1 });
          }
        }, group);
        for (const page of pages) await page.evaluate(async () => {
          const c = window.__networkTest.net.connection;
          for (const p of c.room!.participants.find(p => p.id === c.participantId)!.players) await c.ready(p.id);
        });
        await host.evaluate(() => window.__networkTest.net.connection.start());
        await host.waitForFunction(() => window.__networkTest.net.connectedPeers.length === 3);
        for (const page of pages.slice(1)) await page.waitForFunction(() =>
          window.__networkTest.net.room?.phase === "racing" && window.__networkTest.net.connectedPeers.length === 1);
        for (const page of pages) await page.evaluate(() => {
          const net = window.__networkTest.net;
          net.sendInputs(net.room!.participants.find(p => p.id === net.participantId)!.players.map(p => ({
            playerId: p.id, tick: 1, input: { throttle: 1, brake: 0, steer: 0, pitch: 0,
              drift: false, swap: false, recover: false, useItem: false, throwDirection: 1, slide: 0, passItem: false },
          })));
        });
        await host.waitForFunction(() => window.__networkTest.events.filter(e => e.type === "inputs").reduce((sum, event) => sum + event.frames.length, 0) === 16);
        expect(await host.evaluate(() => {
          const net = window.__networkTest.net, frames = net.drainInputs();
          net.broadcastSnapshot({ tick: 2, value: 16 }, 2, frames.map(f => ({ playerId: f.playerId, sequence: f.sequence })));
          return { humans: frames.length, karts: net.room!.karts.filter(k => k.seats.every(Boolean)).length, owners: new Set(frames.map(f => f.playerId)).size };
        })).toEqual({ humans: 16, karts: 8, owners: 16 });
        for (const page of pages.slice(1)) await page.waitForFunction(() => window.__networkTest.events.some(e => e.type === "snapshot" && e.acks.length === 16) &&
          window.__networkTest.net.pendingInputs().length === 0);
      } finally {
        for (const page of extra) {
          await page.evaluate(() => window.__networkTest?.net.dispose()).catch(() => undefined);
          await page.close();
        }
      }
    });
  });

test("failed application checkpoint restore returns the actual browsers to their same lobby without results", async ({ browser }, info) => {
  await withSecondBrowser(browser, info.outputPath("second-browser-owner.json"), async (host, client) => {
    const code = await open(host); await open(client, code, true); await race(host, client);
    await host.evaluate(() => window.__networkTest.net.commitCheckpoint({ tick: 20, value: 11 }, 20, []));
    await client.waitForFunction(() => window.__networkTest.net.room?.checkpoint?.tick === 20);
    await host.evaluate(() => window.__networkTest.net.dispose());
    await client.waitForFunction(() => window.__networkTest.net.room?.phase === "lobby" && window.__networkTest.net.room.reason?.includes("No race results"));
    expect(await client.evaluate(() => window.__networkTest.net.room!.code)).toBe(code);
    expect(await client.evaluate(() => window.__networkTest.events.some(e => e.type === "event"))).toBe(false);
  });
});

test("blocked direct negotiation retries then explicitly reports disabled relay, without signaling movement", async ({ browser }, info) => {
  await withSecondBrowser(browser, info.outputPath("second-browser-owner.json"), async (host, client) => {
    const signalingTypes: string[] = [];
    await host.routeWebSocket(/\/rooms\/[A-Z2-9]{8}$/, socket => {
      const upstream = socket.connectToServer();
      socket.onMessage(message => {
        if (typeof message === "string") {
          const value: unknown = JSON.parse(message);
          if (typeof value === "object" && value !== null && "type" in value && typeof value.type === "string")
            signalingTypes.push(value.type);
          // Withhold outbound descriptions/ICE, while the actual RTC peer and retry timers run.
          if (typeof value === "object" && value !== null && "type" in value && value.type === "signal") return;
        }
        upstream.send(message);
      });

      upstream.onMessage(message => socket.send(message));
    });
    const code = await open(host, null, false, true); await open(client, code, false, true);
    await host.waitForFunction(() => window.__networkTest.events.some(e => e.type === "error" && e.error.code === "direct-unavailable"));
    expect(await host.evaluate(() => window.__networkTest.net.connectedPeers)).toEqual([]);
    expect(await host.evaluate(() => window.__networkTest.events.filter(e => e.type === "peer" && e.status === "connecting").length)).toBe(2);
    expect(signalingTypes).not.toContain("inputs"); expect(signalingTypes).not.toContain("snapshot");
    expect(await host.evaluate(() => window.__networkTest.net.room?.phase)).toBe("lobby");
  });
});

test("blocked credential storage is surfaced while in-page reconnect still works", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "sessionStorage", {
    configurable: true, get() { throw new DOMException("Storage blocked.", "SecurityError"); },
  }));
  try {
    await open(page);
    const participant = await page.evaluate(() => window.__networkTest.net.participantId);
    expect(await page.evaluate(() => window.__networkTest.events.some(e => e.type === "error" && e.error.code === "resume-storage"))).toBe(true);
    await page.evaluate(() => window.__networkTest.net.connection.reconnect());
    await page.waitForFunction(() => window.__networkTest.events.some(e => e.type === "signaling" && e.status === "connected"));
    expect(await page.evaluate(() => window.__networkTest.net.participantId)).toBe(participant);
  } finally { await page.evaluate(() => window.__networkTest?.net.dispose()).catch(() => undefined); }
});
