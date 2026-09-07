import { test, expect } from "./fixture";
import type { Page } from "@playwright/test";
import { freshGame, GAME_STORAGE_KEY } from "../../apps/web/src/game-storage";
import type { RaceRuntime } from "../../apps/web/src/race-runtime";
import { installControllers } from "./controllers";

declare global {
  interface Window {
    __KARTSICK_RACE__?: { read: () => ReturnType<RaceRuntime["snapshot"]> };
  }
}
test.setTimeout(180_000);
async function openGame(page: Page): Promise<void> {
  const save = freshGame("Local racer");
  save.settings.quality = "low";
  save.settings.reducedMotion = true;
  await page.addInitScript(({ key, save }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(save)); }, { key: GAME_STORAGE_KEY, save });
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Main menu", exact: true }).or(page.getByRole("heading", { name: /could not load|Let's get you rolling/ }))).toBeVisible();
  if (await page.getByRole("heading", { name: /could not load|Let's get you rolling/ }).count()) throw new Error(await page.locator("#root").innerText());
}

test("real roster garage, eight-kart race, manual controls and pause", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openGame(page);
  await page.screenshot({ path: info.outputPath("full-game-paddock.png") });
  await page.getByRole("button", { name: "Garage All riders and parts" }).click();
  await page.locator(".character-choice").filter({ hasText: "Pompa" }).click();
  await page.getByRole("button", { name: "Use Gilt Trip body" }).click();
  await page.getByRole("button", { name: "Parts", exact: true }).click();
  await page.getByRole("button", { name: /^Wheels/ }).click();
  await page.getByRole("button", { name: /^Glider/ }).click();
  const build = await page.evaluate(() => window.__KARTSICK_RACE__!.read().race.karts[0].build);
  expect(build).toMatchObject({ characters: ["pompa", "bramble"], body: "gilt-trip", wheels: "button", glider: "sunfan" });
  await page.screenshot({ path: info.outputPath("garage-selected-parts.png") });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Quick race Up to 4 local players" }).click();
  await page.getByRole("button", { name: "Race!", exact: true }).click();
  await page.waitForFunction(() => window.__KARTSICK_RACE__?.read().race.phase === "racing");
  expect(await page.evaluate(() => window.__KARTSICK_RACE__!.read().race.karts.length)).toBe(8);
  await page.keyboard.down("w");
  await page.waitForFunction(() => (window.__KARTSICK_RACE__?.read().race.karts.find(kart => kart.players.includes("local-1"))?.state.speed ?? 0) > 8);
  await page.keyboard.up("w");
  await page.screenshot({ path: info.outputPath("eight-kart-race.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Race paused." })).toBeVisible();
  const tick = await page.evaluate(() => window.__KARTSICK_RACE__!.read().race.tick);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__KARTSICK_RACE__!.read().race.tick)).toBe(tick);
  expect(errors).toEqual([]);
});

test("four controllers produce four kart cameras; tandem shares one view", async ({ page }, info) => {
  await installControllers(page);
  await openGame(page);
  for (let index = 0; index < 4; index++) {
    await page.evaluate(index => {
      const pad = window.__racePads![index];
      pad.connected = true;
      pad.buttons[0] = { value: 1, pressed: true, touched: true };
    }, index);
    await expect(page.locator(".local-player-card")).toHaveCount(index + 1);
    await page.evaluate(index => { window.__racePads![index].buttons[0] = { value: 0, pressed: false, touched: false }; }, index);
  }
  await page.getByRole("button", { name: "Race!", exact: true }).click();
  await page.waitForFunction(() => window.__KARTSICK_RACE__?.read().mode === "race");
  expect(await page.evaluate(() => window.__KARTSICK_RACE__!.read().views.length)).toBe(4);
  await page.screenshot({ path: info.outputPath("four-local-karts.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Leave race", exact: true }).click();
  await page.getByRole("button", { name: "Quick race Up to 4 local players" }).click();
  const kartChoice = page.locator(".local-player-card").nth(1).getByRole("button", { name: /^Kart/ });
  await kartChoice.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(kartChoice).toContainText("Kart 1 - shared");
  await page.getByRole("button", { name: "Race!", exact: true }).click();
  await page.waitForFunction(() => window.__KARTSICK_RACE__?.read().mode === "race");
  const snapshot = await page.evaluate(() => window.__KARTSICK_RACE__!.read());
  expect(snapshot.views).toHaveLength(3);
  expect(snapshot.race.karts.find(kart => kart.players.includes("local-1"))?.players).toEqual(["local-1", "local-2"]);
  await page.screenshot({ path: info.outputPath("tandem-plus-split.png") });
  await page.evaluate(() => { window.__racePads![2].connected = false; });
  await expect(page.getByRole("heading", { name: "Race paused." })).toBeVisible();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Race paused." })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Reconnect a controller or choose the keyboard");
  await page.getByRole("button", { name: "Use keyboard", exact: true }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.waitForFunction(() => window.__KARTSICK_RACE__?.read().race.phase === "racing");
  await page.keyboard.down("w");
  await page.waitForFunction(() => (window.__KARTSICK_RACE__!.read().race.karts.find(kart => kart.players.includes("local-3"))?.state.speed ?? 0) > 5);
  await page.keyboard.up("w");
  expect(await page.evaluate(() => window.__KARTSICK_RACE__!.read().race.karts.find(kart => kart.players.includes("local-3"))?.ai)).toBe(false);
});

test("time trials use their actual fixed boost inventory and mirrored course", async ({ page }) => {
  await openGame(page);
  await page.getByRole("button", { name: "Time trials You versus your ghost" }).click();
  await page.getByRole("button", { name: "Mirror Off" }).click();
  await page.getByRole("button", { name: "Start time trial", exact: true }).click();
  await page.waitForFunction(() => window.__KARTSICK_RACE__?.read().race.phase === "racing");
  const before = await page.evaluate(() => window.__KARTSICK_RACE__!.read().race);
  expect(before.options.mirror).toBe(true);
  expect(before.karts).toHaveLength(1);
  expect(before.pickups).toHaveLength(0);
  const charges = before.karts[0].held.reduce((sum, item) => sum + (item?.charges ?? 0), 0);
  expect(charges).toBeGreaterThan(0);
  await page.keyboard.press("e");
  await page.waitForFunction(charges => window.__KARTSICK_RACE__!.read().race.karts[0].held.reduce((sum, item) => sum + (item?.charges ?? 0), 0) < charges, charges);
  expect(await page.evaluate(() => window.__KARTSICK_RACE__!.read().race.karts[0].state.boost)).toBeGreaterThan(0);
});

test("a complete driven time trial saves a real ghost and renders it on rematch", async ({ page }, info) => {
  const pilotUrl = "/@fs" + new URL("./pilot.ts", import.meta.url).pathname;
  await page.addInitScript(() => {
    window.__testPad = {
      id: "Xbox ghost trial controller", index: 0, connected: true, mapping: "standard", timestamp: 1, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false })),
    };
    Object.defineProperty(navigator, "getGamepads", { value: () => [window.__testPad], configurable: true });
  });
  await openGame(page);
  await page.getByRole("button", { name: "Time trials You versus your ghost" }).click();
  await page.evaluate(() => { window.__testPad!.buttons[7] = { value: 1, pressed: true, touched: true }; });
  await expect(page.locator(".player-device")).toContainText("Xbox ghost trial controller");
  await page.evaluate(() => { window.__testPad!.buttons[7] = { value: 0, pressed: false, touched: false }; });
  await page.getByRole("button", { name: "Start time trial", exact: true }).click();
  await page.waitForFunction(() => window.__KARTSICK_RACE__?.read().race.phase === "racing");
  try {
    await page.evaluate(async url => { const pilot = await import(url); pilot.startFullRacePilot(); }, pilotUrl);
    await expect(page.getByRole("region", { name: "Race results", exact: true })).toBeVisible({ timeout: 165_000 });
  } finally {
    await page.evaluate(async url => { const pilot = await import(url); pilot.stopPilot(); }, pilotUrl);
  }
  await expect(page.locator(".result-message")).toContainText("New best time!");
  const recorded = await page.evaluate(() => ({
    save: JSON.parse(localStorage.getItem("kartsick.save.v2")!),
    ghosts: JSON.parse(localStorage.getItem("kartsick.ghosts.v1")!),
    vertices: window.__KARTSICK_RACE__!.read().totalVertices,
  }));
  expect(recorded.save.records).toHaveLength(1);
  expect(recorded.ghosts).toHaveLength(1);
  expect(recorded.ghosts[0].frames.length).toBeGreaterThan(300);
  expect(recorded.ghosts[0].time).toBe(recorded.save.records[0].time);
  await page.screenshot({ path: info.outputPath("time-trial-results.png") });
  await page.getByRole("button", { name: "Race again", exact: true }).click();
  await page.waitForFunction(() => window.__KARTSICK_RACE__?.read().mode === "race");
  expect(await page.evaluate(() => window.__KARTSICK_RACE__!.read().race.karts.length)).toBe(1);
  expect(await page.evaluate(() => window.__KARTSICK_RACE__!.read().totalVertices)).toBeGreaterThan(recorded.vertices);
  await expect(page.locator("[data-race='ghost']")).toContainText("GHOST");
});
