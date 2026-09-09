import { test, expect } from "./fixture";
import { freshGame, GAME_STORAGE_KEY } from "../../apps/web/src/game-storage";
import type { RaceRuntime } from "../../apps/web/src/race-runtime";

declare global {
  interface Window {
    __KARTSICK_RACE__?: { read: () => ReturnType<RaceRuntime["snapshot"]> };
    __rouletteObservation?: { read(): string[]; stop(): void };
  }
}
const pilotUrl = "/@fs" + new URL("./pilot.ts", import.meta.url).pathname;

test("random pickups visibly spin, settle and survive a controller-operated Towbell rescue", async ({ page }, info) => {
  test.setTimeout(150_000);
  const save = freshGame("Polish driver");
  save.settings.quality = "balanced";
  save.settings.reducedMotion = false;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(({ key, save }) => {
    localStorage.setItem(key, JSON.stringify(save));
    window.__testPad = {
      id: "Xbox polish controller", index: 0, connected: true, mapping: "standard", timestamp: 1, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false })),
    };
    Object.defineProperty(navigator, "getGamepads", { value: () => [window.__testPad], configurable: true });
  }, { key: GAME_STORAGE_KEY, save });
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Main menu", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Quick race / }).click();
  await page.evaluate(() => { window.__testPad!.buttons[7] = { value: 1, pressed: true, touched: true }; });
  await expect(page.locator(".player-device")).toContainText("Xbox polish controller");
  await page.evaluate(() => { window.__testPad!.buttons[7] = { value: 0, pressed: false, touched: false }; });
  const bots = page.getByRole("button", { name: /^Fill empty karts with bots / });
  if (await bots.getAttribute("aria-pressed") === "true") await bots.click();
  await page.getByRole("button", { name: "Race!", exact: true }).click();
  await page.waitForFunction(() => window.__KARTSICK_RACE__!.read().race.phase === "racing");
  try {
    await page.evaluate(async url => { const pilot = await import(/* @vite-ignore */ url); pilot.startFullRacePilot(60_000); }, pilotUrl);
    await page.waitForFunction(() => window.__KARTSICK_RACE__!.read().race.karts[0].state.roadU > .035);
    await page.evaluate(async url => {
      const pilot = await import(/* @vite-ignore */ url);
      pilot.stopPilot();
      window.__testPad!.buttons[6] = { value: 1, pressed: true, touched: true };
    }, pilotUrl);
    await page.waitForFunction(() => Math.abs(window.__KARTSICK_RACE__!.read().race.karts[0].state.speed) < 1);
    await page.evaluate(() => { window.__testPad!.buttons[6] = { value: 0, pressed: false, touched: false }; });
    expect(await page.evaluate(() => window.__KARTSICK_RACE__!.read().race.karts[0].held.every(item => item === null))).toBe(true);
    await page.screenshot({ path: info.outputPath("delivery-case-approach.png") });
    await page.evaluate(() => {
      const symbols = new Set<string>();
      const observer = new MutationObserver(() => {
        document.querySelectorAll('.held-item[data-spinning="true"] use').forEach(use => {
          const symbol = use.getAttribute("href");
          if (symbol) symbols.add(symbol);
        });
      });
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["href", "data-spinning"] });
      window.__rouletteObservation = { read: () => [...symbols], stop: () => observer.disconnect() };
    });
    await page.evaluate(async url => { const pilot = await import(/* @vite-ignore */ url); pilot.startFullRacePilot(60_000); }, pilotUrl);
    const spinning = page.locator('.held-item[data-spinning="true"]');
    await expect(spinning.first()).toBeVisible({ timeout: 60_000 });
    await page.evaluate(async url => { const pilot = await import(/* @vite-ignore */ url); pilot.stopPilot(); }, pilotUrl);
    const selected = await page.evaluate(() => window.__KARTSICK_RACE__!.read().race.karts[0].held.map(h => h && ({ id: h.id, item: h.item })));
    await expect(spinning).toHaveCount(0);
    expect(await page.evaluate(() => window.__rouletteObservation!.read().length)).toBeGreaterThan(2);
    const after = await page.evaluate(() => window.__KARTSICK_RACE__!.read().race.karts[0].held);
    expect(after.map(h => h && ({ id: h.id, item: h.item }))).toEqual(selected);
    expect(after.every(h => !h || h.roulette === 0)).toBe(true);
    await page.screenshot({ path: info.outputPath("pickup-settled.png") });
    const before = await page.evaluate(() => window.__KARTSICK_RACE__!.read().race.karts[0].state);
    await page.evaluate(button => { window.__testPad!.buttons[button] = { value: 1, pressed: true, touched: true }; }, save.settings.buttons.recover);
    await page.waitForFunction(() => window.__KARTSICK_RACE__!.read().race.karts[0].state.recovery > 0);
    await page.evaluate(button => { window.__testPad!.buttons[button] = { value: 0, pressed: false, touched: false }; }, save.settings.buttons.recover);
    await expect(page.locator('[data-race="tell"]')).toHaveText("TOWBELL TO THE RESCUE");
    await page.screenshot({ path: info.outputPath("towbell-rescue.png") });
    await page.waitForFunction(() => window.__KARTSICK_RACE__!.read().race.karts[0].state.recovery === 0);
    const returned = await page.evaluate(() => window.__KARTSICK_RACE__!.read().race.karts[0].state);
    expect(returned.recoveries).toBe(before.recoveries + 1);
    expect(returned.nextCheckpoint).toBe(before.nextCheckpoint);
    expect(returned.rescue).toBeNull();
    await page.screenshot({ path: info.outputPath("back-on-track.png") });
    expect(errors).toEqual([]);
  } finally {
    await page.evaluate(() => {
      window.__rouletteObservation?.stop();
      delete window.__rouletteObservation;
    });
    await page.evaluate(async url => { const pilot = await import(/* @vite-ignore */ url); pilot.stopPilot(); }, pilotUrl);
  }
});
