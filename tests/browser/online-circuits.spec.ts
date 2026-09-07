import { writeFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { parseClientMessage, parseServerMessage, type Room } from "@kartsick/protocol";
import { freshGame, GAME_STORAGE_KEY } from "../../apps/web/src/game-storage";
import { test, expect } from "./fixture";
import { withSecondBrowser } from "./second-browser";

const pilotUrl = "/@fs" + new URL("./pilot.ts", import.meta.url).pathname;

function observeRoom(page: Page) {
  let room: Room | null = null;
  const checkpoints = new Set<string>();
  const pending = new Map<string, string>(), acknowledgments = new Map<string, number>();
  page.on("websocket", socket => {
    if (!new URL(socket.url()).pathname.startsWith("/rooms/")) return;
    socket.on("framereceived", frame => {
      const message = parseServerMessage(JSON.parse(frame.payload.toString()));
      if (message.type === "room" || message.type === "welcome") room = message.room;
      if (message.type === "ok" && pending.has(message.requestId)) {
        const id = pending.get(message.requestId)!;
        pending.delete(message.requestId);
        checkpoints.add(id);
        acknowledgments.set(id, (acknowledgments.get(id) ?? 0) + 1);
      }
    });
    socket.on("framesent", frame => {
      const message = parseClientMessage(JSON.parse(frame.payload.toString()));
      if (message.type === "checkpoint-have") pending.set(message.requestId, message.checkpointId);
    });
  });
  return {
    read(): Room {
      if (!room) throw new Error("The browser has not received a room yet.");
      return room;
    },
    checkpoints,
    acknowledgments,
  };
}

async function open(page: Page, name: string, path = "/"): Promise<void> {
  const save = freshGame(name);
  save.settings.quality = "low";
  save.settings.reducedMotion = true;
  await page.addInitScript(({ key, save }) => {
    localStorage.setItem(key, JSON.stringify(save));
    window.__testPad = {
      id: "Xbox circuit controller", index: 0, connected: true, mapping: "standard", timestamp: 1, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false })),
    };
    Object.defineProperty(navigator, "getGamepads", { value: () => [window.__testPad], configurable: true });
  }, { key: GAME_STORAGE_KEY, save });
  await page.goto(path);
  await expect(page.locator("[data-game-menu]").first()).toBeVisible();
}

async function connectController(page: Page): Promise<void> {
  await page.evaluate(() => { window.__testPad!.buttons[7] = { value: 1, pressed: true, touched: true }; });
  await expect(page.locator(".online-local-players")).toContainText("Xbox circuit controller");
  await page.evaluate(() => { window.__testPad!.buttons[7] = { value: 0, pressed: false, touched: false }; });
}

async function drive(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__KARTSICK_RACE__?.read().race.phase === "racing");
  try {
    await page.evaluate(async url => { (await import(url)).startFullRacePilot(580_000, "online-kart-1"); }, pilotUrl);
    await page.waitForFunction(() => window.__KARTSICK_RACE__?.read().race.phase === "finished", null, { timeout: 590_000 });
  } finally {
    if (!page.isClosed()) await page.evaluate(async url => { (await import(url)).stopPilot(); }, pilotUrl);
  }
}

test("online Town circuit retains terminal state through two hosts, admits a late holder, and saves final standings", async ({ browser }, info) => {
  test.setTimeout(1_800_000);
  await withSecondBrowser(browser, info.outputPath("second-browser-owner.json"), async (host, guest) => {
    const errors: string[] = [];
    function watch(page: Page, name: string): void {
      page.on("pageerror", error => errors.push(`${name}: ${error.message}`));
      page.on("console", message => { if (message.type() === "error") errors.push(`${name}: ${message.text()}`); });
    }
    watch(host, "host"); watch(guest, "guest");
    const hostRoom = observeRoom(host), guestRoom = observeRoom(guest);
    const guestSignaling: { interrupt?: () => Promise<void>; connections: number } = { connections: 0 };
    await guest.routeWebSocket(/\/rooms\/[A-Z2-9]{8}$/, socket => {
      const upstream = socket.connectToServer();
      guestSignaling.connections++;
      guestSignaling.interrupt = async () => {
        await upstream.close({ code: 1001, reason: "Synthetic signaling interruption." });
        await socket.close({ code: 1001, reason: "Synthetic signaling interruption." });
      };
    });
    await open(host, "First driver");
    await host.getByRole("button", { name: "Online race Invite your friends" }).click();
    await host.getByRole("button", { name: "Create a room", exact: true }).click();
    await expect(host.locator(".room-invite strong")).toHaveText(/^[A-Z2-9]{8}$/);
    const code = (await host.locator(".room-invite strong").innerText()).trim();
    await host.getByRole("button", { name: /^Program / }).click();
    await expect(host.getByRole("button", { name: /^Program / })).toContainText("Town");
    await host.getByRole("button", { name: /^Fill empty karts with bots / }).click();
    await expect.poll(() => hostRoom.read().config.bots).toBe(false);
    await host.locator(".room-kart").first().locator(".room-seats button").first().click();
    await connectController(host);
    await open(guest, "Second driver", `/?room=${code}`);
    await expect(guest.locator(".room-invite strong")).toHaveText(code);
    await guest.locator(".room-kart").first().locator(".room-seats button").nth(1).click();
    await guest.getByRole("button", { name: "Use keyboard", exact: true }).click();
    await host.getByRole("button", { name: "Ready to race", exact: true }).click();
    await guest.getByRole("button", { name: "Ready to race", exact: true }).click();
    await expect(host.getByRole("button", { name: "Start race", exact: true })).toBeEnabled();
    await host.getByRole("button", { name: "Start race", exact: true }).click();
    await drive(host);
    await expect.poll(() => hostRoom.read().phase).toBe("results");
    await expect.poll(() => guestRoom.read().phase).toBe("results");
    const completed = hostRoom.read().lastRound!;
    const terminal = await host.evaluate(() => window.__KARTSICK_RACE__!.read().race);
    expect(terminal.karts).toHaveLength(1);
    expect(terminal.karts[0].state.recoveries).toBe(0);
    expect(completed.results[0].finished).toBe(true);
    expect(completed.results[0].disconnected).toBe(false);
    expect(guestRoom.read().lastRound).toEqual(completed);
    await expect(guest.getByRole("region", { name: "Race results" })).toBeVisible();
    await expect(host.getByRole("button", { name: "Next course", exact: true })).toBeEnabled();
    await expect(guest.getByRole("button", { name: "Next course", exact: true })).toBeDisabled();
    await host.waitForTimeout(6100);
    expect(await host.evaluate(() => window.__KARTSICK_RACE__!.read().race)).toEqual(terminal);

    const acknowledgments = guestRoom.acknowledgments.get(completed.checkpoint.id) ?? 0;
    expect(acknowledgments).toBeGreaterThan(0);
    if (!guestSignaling.interrupt) throw new Error("The guest has no owned signaling route to interrupt.");
    await guestSignaling.interrupt();
    await expect.poll(() => guestSignaling.connections, { timeout: 20_000 }).toBeGreaterThan(1);
    await expect.poll(() => guestRoom.acknowledgments.get(completed.checkpoint.id) ?? 0, { timeout: 20_000 })
      .toBeGreaterThan(acknowledgments);
    await host.close();
    await guest.waitForFunction(() => {
      const current = window.__KARTSICK_RACE__?.read();
      return current?.online?.authority && current.online.restoreCount > 0 && !current.online.waiting && current.mode === "results";
    });
    expect(await guest.evaluate(() => window.__KARTSICK_RACE__!.read().race)).toEqual(terminal);
    expect(guestRoom.read().lastRound).toEqual(completed);

    const late = await browser.newPage({ baseURL: info.project.use.baseURL });
    try {
      watch(late, "late");
      const lateRoom = observeRoom(late);
      await open(late, "New driver", `/?room=${code}`);
      await expect(late.getByRole("region", { name: "Race results" })).toBeVisible();
      expect(lateRoom.read().lastRound).toEqual(completed);
      // A scoreboard-only arrival must not invent a finished simulation or count a race.
      expect(await late.evaluate(() => window.__KARTSICK_RACE__!.read().online)).toBeNull();
      expect(await late.evaluate(key => JSON.parse(localStorage.getItem(key)!).races, GAME_STORAGE_KEY)).toBe(0);
      await expect.poll(() => lateRoom.checkpoints.has(completed.checkpoint.id), { timeout: 20_000 }).toBe(true);
      await guest.close();
      await late.waitForFunction(() => {
        const current = window.__KARTSICK_RACE__?.read();
        return current?.online?.authority && current.race.phase === "finished" && !current.online.waiting && current.mode === "results";
      });
      expect(await late.evaluate(() => window.__KARTSICK_RACE__!.read().race)).toEqual(terminal);
      expect(lateRoom.read().lastRound).toEqual(completed);
      expect(await late.evaluate(key => JSON.parse(localStorage.getItem(key)!).races, GAME_STORAGE_KEY)).toBe(0);
      await late.screenshot({ path: info.outputPath("late-terminal-authority.png") });

      // Reconnection reservations expire naturally; no server clocks or room state are injected.
      await expect.poll(() => lateRoom.read().participants.length, { timeout: 80_000 }).toBe(1);
      for (const [index, course] of ["escaluna", "tiltglass"].entries()) {
        const before = lateRoom.read().series!;
        await late.getByRole("button", { name: "Next course", exact: true }).click();
        await expect(late.getByRole("region", { name: "Online room" })).toBeVisible();
        expect(lateRoom.read().phase).toBe("lobby");
        expect(lateRoom.read().series).toEqual(before);
        expect(lateRoom.read().config.course).toBe(course);
        await expect(late.getByRole("alert").filter({ hasText: "Next circuit course" })).toHaveCount(0);
        await expect(late.getByRole("button", { name: /^Program / })).toHaveCount(0);
        await expect(late.getByRole("button", { name: "Start race", exact: true })).toBeDisabled();
        if (index === 0) {
          await late.locator(".room-kart").first().locator(".room-seats button").first().click();
          await connectController(late);
        }
        await late.getByRole("button", { name: "Ready to race", exact: true }).click();
        await expect(late.getByRole("button", { name: "Start race", exact: true })).toBeEnabled();
        await late.getByRole("button", { name: "Start race", exact: true }).click();
        await drive(late);
        await expect.poll(() => lateRoom.read().phase).toBe("results");
        expect(lateRoom.read().series!.rounds).toHaveLength(index + 2);
        expect(lateRoom.read().lastRound!.results[0].finished).toBe(true);
      }
      expect(lateRoom.read().series!.rounds.map(round => round.courseId)).toEqual(["butterbell", "escaluna", "tiltglass"]);
      await expect(late.getByRole("region", { name: "Circuit standings" })).toContainText("3 of 3");
      await expect(late.getByRole("region", { name: "Circuit standings" }).locator("tbody tr").first()).toContainText("30");
      await expect(late.getByRole("button", { name: "Next course", exact: true })).toHaveCount(0);
      const saved = await late.evaluate(key => JSON.parse(localStorage.getItem(key)!), GAME_STORAGE_KEY);
      expect(saved.races).toBe(2);
      expect(saved.medals).toHaveLength(1);
      expect(saved.medals[0]).toMatchObject({ cup: "town", medal: "gold" });
      await late.screenshot({ path: info.outputPath("online-town-final.png") });
      await writeFile(info.outputPath("circuit-evidence.json"), JSON.stringify({
        courses: lateRoom.read().series!.rounds.map(round => round.courseId),
        results: lateRoom.read().series!.rounds.map(round => round.results),
        terminalTick: terminal.tick, terminalHosts: 3, latePlayerRaces: saved.races, medals: saved.medals,
      }, null, 2));
      await late.getByRole("button", { name: "Set up a rematch", exact: true }).click();
      await expect(late.getByRole("region", { name: "Online room" })).toBeVisible();
      expect(lateRoom.read().series).toBeNull();
      expect(lateRoom.read().lastRound).toBeNull();
      await expect(late.getByRole("button", { name: /^Program / })).toBeVisible();
      expect(errors).toEqual([]);
    } finally {
      if (!late.isClosed()) {
        await late.evaluate(async url => { (await import(url)).stopPilot(); }, pilotUrl);
        await late.close();
      }
    }
  }, info.project.use.baseURL);
});
