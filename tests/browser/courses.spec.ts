import { test, expect } from "./fixture";
import type { Page } from "@playwright/test";
import { COURSES, type CourseId } from "@kartsick/content";
import { freshGame, GAME_STORAGE_KEY } from "../../apps/web/src/game-storage";
import type { RaceRuntime } from "../../apps/web/src/race-runtime";
import type { Quality } from "../../apps/web/src/storage";

declare global {
  interface Window {
    __KARTSICK_RACE__?: { read: () => ReturnType<RaceRuntime["snapshot"]> };
  }
}

const pilotUrl = "/@fs" + new URL("./pilot.ts", import.meta.url).pathname;

async function openTrial(page: Page, quality: Quality = "low"): Promise<void> {
  const save = freshGame("Course driver");
  save.settings.quality = quality;
  save.settings.reducedMotion = true;
  await page.addInitScript(({ key, save }) => {
    localStorage.setItem(key, JSON.stringify(save));
    window.__testPad = {
      id: "Xbox course controller", index: 0, connected: true, mapping: "standard", timestamp: 1, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false })),
    };
    Object.defineProperty(navigator, "getGamepads", { value: () => [window.__testPad], configurable: true });
  }, { key: GAME_STORAGE_KEY, save });
  await page.goto("/");
  await page.getByRole("button", { name: "Time trials You versus your ghost" }).click();
  await page.evaluate(() => { window.__testPad!.buttons[7] = { value: 1, pressed: true, touched: true }; });
  await expect(page.locator(".player-device")).toContainText("Xbox course controller");
  await page.evaluate(() => { window.__testPad!.buttons[7] = { value: 0, pressed: false, touched: false }; });
}

async function selectCourse(page: Page, id: CourseId): Promise<void> {
  const choice = page.getByRole("button", { name: /^Course / });
  const name = COURSES.find(course => course.id === id)!.name;
  for (let index = 0; index < COURSES.length && !(await choice.innerText()).includes(name); index++) await choice.click();
  await expect(choice).toContainText(name);
}

test("each authored world drives normally and mirrored without accumulating course resources", async ({ page }, info) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await openTrial(page, "balanced");
  const counts: { materials: number; textures: number; vertices: number }[] = [];
  for (const mirror of [false, true]) {
    for (const course of [...COURSES.filter(course => course.available), COURSES[0]]) {
      await selectCourse(page, course.id);
      const mirrorChoice = page.getByRole("button", { name: /^Mirror / });
      if ((await mirrorChoice.innerText()).includes(mirror ? "Off" : "On")) await mirrorChoice.click();
      await page.getByRole("button", { name: "Start time trial", exact: true }).click();
      await page.waitForFunction(() => window.__KARTSICK_RACE__?.read().race.phase === "racing");
      const before = await page.evaluate(() => window.__KARTSICK_RACE__!.read());
      expect(before.renderedCourse).toBe(course.id);
      expect(before.race.options.mirror).toBe(mirror);
      expect(before.totalVertices).toBeGreaterThan(10_000);
      if (course.id === "butterbell") counts.push({ materials: before.materials, textures: before.textures, vertices: before.totalVertices });
      try {
        await page.evaluate(async url => { (await import(url)).startFullRacePilot(); }, pilotUrl);
        await page.waitForFunction(tick => {
          const kart = window.__KARTSICK_RACE__!.read().race.karts[0];
          return kart.state.tick > tick + 120 && kart.state.speed > 8;
        }, before.race.karts[0].state.tick);
        await page.screenshot({ path: info.outputPath(`${course.id}-${mirror ? "mirror" : "normal"}.png`) });
      } finally {
        await page.evaluate(async url => { (await import(url)).stopPilot(); }, pilotUrl);
      }
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Leave race", exact: true }).click();
      await page.getByRole("button", { name: "Time trials You versus your ghost" }).click();
    }
  }
  expect(counts).toHaveLength(4);
  for (const count of counts.slice(1)) {
    expect(count.materials).toBeLessThanOrEqual(counts[0].materials);
    expect(count.textures).toBe(counts[0].textures);
    expect(count.vertices).toBe(counts[0].vertices);
  }
  for (const count of counts.slice(2)) expect(count).toEqual(counts[1]);
  expect(errors).toEqual([]);
});

test("Lastlight is one genuinely driven descent with three sectors, a glide and a landing", async ({ page }, info) => {
  test.setTimeout(450_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await openTrial(page);
  await selectCourse(page, "lastlight");
  await page.getByRole("button", { name: "Start time trial", exact: true }).click();
  await page.waitForFunction(() => window.__KARTSICK_RACE__?.read().race.phase === "racing");
  try {
    await page.evaluate(async url => { (await import(url)).startFullRacePilot(420_000); }, pilotUrl);
    await page.waitForFunction(() => window.__KARTSICK_RACE__!.read().race.karts[0].state.mode === "glider", null, { timeout: 350_000 });
    const airborne = await page.evaluate(() => window.__KARTSICK_RACE__!.read());
    expect(airborne.race.karts[0].state.lap).toBe(3);
    expect(airborne.race.karts[0].state.lapTimes).toHaveLength(2);
    await page.screenshot({ path: info.outputPath("lastlight-canyon-glide.png") });
    await page.waitForFunction(() => {
      const state = window.__KARTSICK_RACE__!.read().race.karts[0].state;
      return state.mode === "ground" && state.roadU > .86;
    }, null, { timeout: 45_000 });
    await expect(page.getByRole("region", { name: "Race results", exact: true })).toBeVisible({ timeout: 90_000 });
    const finished = await page.evaluate(() => window.__KARTSICK_RACE__!.read().race);
    expect(finished.karts[0].state.recoveries).toBe(0);
    expect(finished.karts[0].state.lapTimes).toHaveLength(3);
    expect(finished.karts[0].state.lap).toBe(3);
    expect(finished.results[0].finished).toBe(true);
    await page.screenshot({ path: info.outputPath("lastlight-descent-results.png") });
  } finally {
    await page.evaluate(async url => { (await import(url)).stopPilot(); }, pilotUrl);
  }
  expect(errors).toEqual([]);
});
