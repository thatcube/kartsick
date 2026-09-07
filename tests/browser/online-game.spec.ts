import { writeFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixture";
import { withSecondBrowser } from "./second-browser";
import { installControllers } from "./controllers";
import { freshGame, GAME_STORAGE_KEY } from "../../apps/web/src/game-storage";
import type { RaceRuntime } from "../../apps/web/src/race-runtime";

declare global {
  interface Window { __KARTSICK_RACE__?: { read: () => ReturnType<RaceRuntime["snapshot"]> } }
}
test.setTimeout(180000);
async function open(page: Page, name: string, path = "/"): Promise<void> {
  const save = freshGame(name);
  save.settings.quality = "low";
  save.settings.reducedMotion = true;
  await page.addInitScript(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), { key: GAME_STORAGE_KEY, save });
  await page.goto(path);
  await expect(page.locator("[data-game-menu]").first()).toBeVisible();
}

test("two browsers play the actual game, reconcile remote driving, and restore a live host checkpoint", async ({ browser }, info) => {
  await withSecondBrowser(browser, info.outputPath("second-browser-owner.json"), async (host, guest) => {
    const errors: string[] = [];
    host.on("pageerror", error => errors.push(`host: ${error.message}`));
    guest.on("pageerror", error => errors.push(`guest: ${error.message}`));
    await open(host, "Host driver");
    await host.getByRole("button", { name: "Online race Invite your friends" }).click();
    await host.getByRole("button", { name: "Create a room", exact: true }).click();
    await expect(host.locator(".room-invite strong")).toHaveText(/^[A-Z2-9]{8}$/);
    const code = (await host.locator(".room-invite strong").innerText()).trim();
    await open(guest, "Guest rider", `/?room=${code}`);
    await expect(guest.locator(".room-invite strong")).toHaveText(code);
    await host.locator(".room-kart").nth(0).locator(".room-seats button").nth(0).click();
    await guest.locator(".room-kart").nth(1).locator(".room-seats button").nth(0).click();
    await host.getByRole("button", { name: "Use keyboard", exact: true }).click();
    await guest.getByRole("button", { name: "Use keyboard", exact: true }).click();
    await host.locator(".online-panel").evaluate(panel => { panel.scrollTop = 0; });
    await host.screenshot({ path: info.outputPath("real-online-lobby.png") });
    await host.getByRole("button", { name: "Ready to race", exact: true }).click();
    await expect(host.getByRole("button", { name: "Not ready", exact: true })).toBeVisible();
    await guest.getByRole("button", { name: "Ready to race", exact: true }).click();
    await expect(host.getByRole("button", { name: "Start race", exact: true })).toBeEnabled();
    await host.getByRole("button", { name: "Start race", exact: true }).click();
    for (const page of [host, guest]) await page.waitForFunction(() =>
      window.__KARTSICK_RACE__?.read().mode === "race" && window.__KARTSICK_RACE__?.read().race.phase === "racing");
    await guest.keyboard.down("w");
    await host.waitForFunction(() => {
      const kart = window.__KARTSICK_RACE__?.read().race.karts.find(kart => kart.id === "online-kart-2");
      return !!kart && !kart.ai && kart.state.speed > 8;
    });
    await guest.keyboard.up("w");
    const swaps = await guest.evaluate(() => window.__KARTSICK_RACE__!.read().online!.receivedEventCounts.swap ?? 0);
    await guest.keyboard.press("c");
    await host.waitForFunction(() => window.__KARTSICK_RACE__?.read().race.karts[1].state.driver === 1);
    await guest.waitForFunction(previous => (window.__KARTSICK_RACE__?.read().online?.receivedEventCounts.swap ?? 0) > previous, swaps);
    const hostState = await host.evaluate(() => window.__KARTSICK_RACE__!.read());
    const guestState = await guest.evaluate(() => window.__KARTSICK_RACE__!.read());
    expect(hostState.race.karts).toHaveLength(8);
    expect(hostState.online?.authority).toBe(true);
    expect(guestState.online?.authority).toBe(false);
    expect(hostState.online!.maximumSnapshotBytes).toBeGreaterThan(1000);
    expect(guestState.online!.predictionTicks).toBeLessThanOrEqual(12);
    expect(hostState.online!.eventBatchesPublished).toBeGreaterThan(0);
    expect(guestState.online!.eventBatchesReceived).toBeGreaterThan(0);
    await guest.screenshot({ path: info.outputPath("guest-live-race.png") });
    await writeFile(info.outputPath("actual-race-network-metrics.json"), JSON.stringify({ host: hostState.online, guest: guestState.online }, null, 2));
    await guest.keyboard.press("Escape");
    await expect(guest.getByRole("heading", { name: "You're in the pits." })).toBeVisible();
    await host.waitForFunction(() => window.__KARTSICK_RACE__?.read().race.karts.find(kart => kart.id === "online-kart-2")?.ai === true);
    await guest.getByRole("button", { name: "Resume", exact: true }).click();
    await host.waitForFunction(() => window.__KARTSICK_RACE__?.read().race.karts.find(kart => kart.id === "online-kart-2")?.ai === false);
    await guest.waitForFunction(() => (window.__KARTSICK_RACE__?.read().online?.checkpointTick ?? 0) > 180);
    const before = await guest.evaluate(() => window.__KARTSICK_RACE__!.read());
    await host.close();
    await guest.waitForFunction(() => {
      const state = window.__KARTSICK_RACE__?.read();
      return !!state?.online?.authority && state.online.restoreCount > 0 && !state.online.waiting;
    });
    const after = await guest.evaluate(() => window.__KARTSICK_RACE__!.read());
    expect(after.online!.epoch).toBeGreaterThan(before.online!.epoch);
    expect(after.race.options.seed).toBe(before.race.options.seed);
    expect(after.race.karts.map(kart => kart.id)).toEqual(before.race.karts.map(kart => kart.id));
    expect(after.race.tick).toBeGreaterThanOrEqual(before.online!.checkpointTick!);
    expect(after.race.tick).toBeLessThan(before.race.tick + 300);
    const spectator = await browser.newPage({ baseURL: info.project.use.baseURL });
    try {
      spectator.on("pageerror", error => errors.push(`spectator: ${error.message}`));
      await open(spectator, "Late spectator", `/?room=${code}`);
      await spectator.waitForFunction(() => window.__KARTSICK_RACE__?.read().mode === "race" &&
        (window.__KARTSICK_RACE__?.read().race.tick ?? 0) > 180);
      await expect(spectator.getByRole("button", { name: "Watch next kart" })).toBeVisible();
      const watched = await spectator.evaluate(() => window.__KARTSICK_RACE__!.read().views[0].id);
      await spectator.getByRole("button", { name: "Watch next kart" }).click();
      expect(await spectator.evaluate(() => window.__KARTSICK_RACE__!.read().views[0].id)).not.toBe(watched);
      expect(await spectator.evaluate(() => window.__KARTSICK_RACE__!.read().race.karts.length)).toBe(8);
    } finally { await spectator.close(); }
    expect(errors).toEqual([]);
  }, info.project.use.baseURL);
});

test("four couch controllers mix tandem and split-screen with a remote human", async ({ browser }, info) => {
  await withSecondBrowser(browser, info.outputPath("second-browser-owner.json"), async (host, guest) => {
    const errors: string[] = [];
    host.on("pageerror", error => errors.push(error.message));
    guest.on("pageerror", error => errors.push(error.message));
    await installControllers(host);
    await open(host, "Couch captain");
    for (let index = 0; index < 4; index++) {
      await host.evaluate(index => {
        const pad = window.__racePads![index];
        pad.connected = true;
        pad.buttons[0] = { value: 1, pressed: true, touched: true };
      }, index);
      await expect(host.locator(".local-player-card")).toHaveCount(index + 1);
      await host.evaluate(index => { window.__racePads![index].buttons[0] = { value: 0, pressed: false, touched: false }; }, index);
    }
    await host.getByRole("button", { name: "Back", exact: true }).click();
    await host.getByRole("button", { name: "Online race Invite your friends" }).click();
    await host.getByRole("button", { name: "Create a room", exact: true }).click();
    await expect(host.locator(".room-invite strong")).toHaveText(/^[A-Z2-9]{8}$/);
    const code = (await host.locator(".room-invite strong").innerText()).trim();
    const seats = [[0, 0], [0, 1], [1, 0], [2, 0]];
    for (let index = 0; index < 4; index++) {
      if (index) await host.getByRole("button", { name: /^Your local player/ }).click();
      await host.locator(".room-kart").nth(seats[index][0]).locator(".room-seats button").nth(seats[index][1]).click();
    }
    await open(guest, "Remote friend", `/?room=${code}`);
    await expect(guest.locator(".room-invite strong")).toHaveText(code);
    await guest.locator(".room-kart").nth(3).locator(".room-seats button").nth(0).click();
    await guest.getByRole("button", { name: "Use keyboard", exact: true }).click();
    await host.getByRole("button", { name: "Ready to race", exact: true }).click();
    await expect(host.getByRole("button", { name: "Not ready", exact: true })).toBeVisible();
    await guest.getByRole("button", { name: "Ready to race", exact: true }).click();
    await expect(host.getByRole("button", { name: "Start race", exact: true })).toBeEnabled();
    await host.getByRole("button", { name: "Start race", exact: true }).click();
    await host.waitForFunction(() => window.__KARTSICK_RACE__?.read().race.phase === "racing");
    await guest.waitForFunction(() => window.__KARTSICK_RACE__?.read().race.phase === "racing");
    expect(await host.evaluate(() => window.__KARTSICK_RACE__!.read().views.length)).toBe(3);
    expect(await guest.evaluate(() => window.__KARTSICK_RACE__!.read().views.length)).toBe(1);
    const swaps = await guest.evaluate(() => window.__KARTSICK_RACE__!.read().online!.receivedEventCounts.swap ?? 0);
    await host.evaluate(() => {
      for (const index of [0, 1]) window.__racePads![index].buttons[3] = { value: 1, pressed: true, touched: true };
    });
    await host.waitForFunction(() => window.__KARTSICK_RACE__?.read().race.karts[0].state.driver === 1);
    await host.evaluate(() => {
      for (const index of [0, 1]) window.__racePads![index].buttons[3] = { value: 0, pressed: false, touched: false };
      window.__racePads![1].buttons[7] = { value: 1, pressed: true, touched: true };
    });
    await guest.waitForFunction(() => {
      const kart = window.__KARTSICK_RACE__?.read().race.karts[0];
      return kart?.state.driver === 1 && kart.state.speed > 8 && !kart.ai;
    });
    await host.evaluate(() => { window.__racePads![1].buttons[7] = { value: 0, pressed: false, touched: false }; });
    await guest.waitForFunction(previous => (window.__KARTSICK_RACE__?.read().online?.receivedEventCounts.swap ?? 0) > previous, swaps);
    await host.screenshot({ path: info.outputPath("online-tandem-plus-split.png") });
    expect(await guest.evaluate(() => window.__KARTSICK_RACE__!.read().race.karts.flatMap(kart => kart.players.filter(Boolean)).length)).toBe(5);
    expect(errors).toEqual([]);
  }, info.project.use.baseURL);
});
