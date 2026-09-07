import { test, expect } from "./fixture";
import type { Page } from "@playwright/test";
import { GAP_END, angleDifference, clamp, sampleRoad } from "@kartsick/content";

declare global {
  interface Window {
    __testPad?: {
      id: string;
      index: number;
      connected: boolean;
      mapping: string;
      timestamp: number;
      axes: number[];
      buttons: { pressed: boolean; touched: boolean; value: number }[];
    };
  }
}

async function openStudy(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".mode-menu, .failure")).toBeVisible();
  const failure = page.locator(".failure");
  if (await failure.isVisible()) throw new Error(await failure.innerText());
}

test("original 3D paddock, actual keyboard driving, pause and focus safety", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openStudy(page);
  await expect(page.getByRole("button", { name: "Take it for a spin" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("paddock.png") });
  await page.getByRole("button", { name: "Take it for a spin" }).click();
  await expect(page.locator(".mode-driving")).toBeVisible();
  await page.keyboard.down("w");
  await page.waitForFunction(() => (window.__KARTSICK_DIAGNOSTICS__?.read().state.speed ?? 0) > 9);
  await page.keyboard.up("w");
  const speed = await page.evaluate(() => window.__KARTSICK_DIAGNOSTICS__!.read().state.speed);
  await page.waitForFunction(before => window.__KARTSICK_DIAGNOSTICS__!.read().state.speed < before - 1, speed);
  await page.keyboard.press("c");
  await expect(page.locator('[data-hud="rider"]')).toHaveText("Bramble driving");
  await page.screenshot({ path: info.outputPath("driving.png") });
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByRole("heading", { name: "Take a breather." })).toBeVisible();
  const tick = await page.evaluate(() => window.__KARTSICK_DIAGNOSTICS__!.read().state.tick);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__KARTSICK_DIAGNOSTICS__!.read().state.tick)).toBe(tick);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("button", { name: "Back to the road" }).click();
  await expect(page.locator(".mode-driving")).toBeVisible();
  expect(errors).toEqual([]);
});

test("settings persist, render quality is real, bindings can change", async ({ page }) => {
  await openStudy(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const originalWidth = await page.evaluate(() => window.__KARTSICK_DIAGNOSTICS__!.read().renderWidth);
  await page.getByRole("button", { name: "Render quality balanced" }).click();
  await expect(page.getByRole("button", { name: "Render quality high" })).toBeVisible();
  expect(await page.evaluate(() => window.__KARTSICK_DIAGNOSTICS__!.read().renderWidth)).toBeGreaterThan(originalWidth);
  await page.getByRole("button", { name: "Reduced motion Off" }).click();
  await page.getByRole("button", { name: "Back", exact: false }).click();
  await page.getByRole("button", { name: "How to drive" }).click();
  await page.getByRole("button", { name: "Drift Space", exact: true }).click();
  await page.keyboard.press("Shift");
  await expect(page.getByRole("button", { name: "Drift ShiftLeft", exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reduced motion On" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Render quality high" })).toBeVisible();
});

test("synthetic standard gamepad can start, drive, disconnect, and reconnect safely", async ({ page }) => {
  await page.addInitScript(() => {
    window.__testPad = {
      id: "Synthetic standard gamepad (not physical hardware evidence)", index: 0,
      connected: true, mapping: "standard", timestamp: 0, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    Object.defineProperty(navigator, "getGamepads", { value: () => [window.__testPad] });
  });
  await openStudy(page);
  await expect(page.getByRole("button", { name: "Take it for a spin" })).toBeVisible();
  await page.evaluate(() => { const button = window.__testPad!.buttons[0]; button.pressed = true; button.value = 1; });
  await expect(page.locator(".mode-countdown")).toBeVisible();
  await page.evaluate(() => { const button = window.__testPad!.buttons[0]; button.pressed = false; button.value = 0; window.__testPad!.buttons[7].value = 1; });
  await page.waitForFunction(() => (window.__KARTSICK_DIAGNOSTICS__?.read().state.speed ?? 0) > 6);
  await page.evaluate(() => { window.__testPad!.connected = false; });
  await expect(page.getByRole("heading", { name: "Take a breather." })).toBeVisible();
  await expect(page.getByText("Controller disconnected. Reconnect it or resume with the keyboard.")).toBeVisible();
  const tick = await page.evaluate(() => window.__KARTSICK_DIAGNOSTICS__!.read().state.tick);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__KARTSICK_DIAGNOSTICS__!.read().state.tick)).toBe(tick);
  await page.evaluate(() => { window.__testPad!.buttons[7].value = 0; window.__testPad!.connected = true; });
  await page.getByRole("button", { name: "Back to the road" }).click();
  const speed = await page.evaluate(() => window.__KARTSICK_DIAGNOSTICS__!.read().state.speed);
  await page.waitForFunction(before => window.__KARTSICK_DIAGNOSTICS__!.read().state.speed < before - 0.5, speed);
});

test("the rendered glider crossing leads into a valid next lap", async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    window.__testPad = {
      id: "Synthetic course driver - not a player assist", index: 0, connected: true,
      mapping: "standard", timestamp: 0, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    Object.defineProperty(navigator, "getGamepads", { value: () => [window.__testPad] });
  });
  await openStudy(page);
  await page.getByRole("button", { name: "Take it for a spin" }).click();
  await expect(page.locator(".mode-driving")).toBeVisible();
  let launchedAt: number | null = null;
  let captured = false;
  const deadline = Date.now() + 100_000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => window.__KARTSICK_DIAGNOSTICS__!.read().state);
    if (state.lap > 1) break;
    const flying = state.mode === "glider";
    if (flying && launchedAt === null) launchedAt = state.tick;
    const target = sampleRoad(flying ? Math.max(state.roadU + 0.025, GAP_END + 0.008) : state.roadU + 0.025);
    const error = angleDifference(Math.atan2(target.x - state.x, target.z - state.z), state.yaw);
    const near = sampleRoad(state.roadU);
    const ahead = sampleRoad(state.roadU + 0.03);
    const turn = Math.abs(angleDifference(Math.atan2(ahead.dx, ahead.dz), Math.atan2(near.dx, near.dz)));
    const desiredSpeed = turn > 0.6 ? 14 : turn > 0.32 ? 19 : 26;
    const steer = clamp(error * 2.5, -1, 1);
    await page.evaluate(input => {
      const pad = window.__testPad!;
      pad.axes[0] = input.steer === 0 ? 0 : input.steer * 0.86 + Math.sign(input.steer) * 0.14;
      pad.buttons[7].value = input.throttle;
      pad.buttons[6].value = input.brake;
      pad.buttons[7].pressed = input.throttle > 0.5;
      pad.buttons[6].pressed = input.brake > 0.5;
    }, { steer, throttle: state.speed < desiredSpeed ? 1 : 0, brake: state.speed > desiredSpeed + 2 ? 0.25 : 0 });
    if (flying && launchedAt !== null && state.tick > launchedAt + 24 && !captured) {
      await page.screenshot({ path: info.outputPath("gliding.png") });
      captured = true;
    }
    await page.waitForTimeout(40);
  }
  const final = await page.evaluate(() => window.__KARTSICK_DIAGNOSTICS__!.read());
  const renderer = await page.evaluate(() => {
    const gl = document.querySelector("canvas")?.getContext("webgl2");
    if (!gl) return "WebGL 2 context unavailable";
    const extension = gl.getExtension("WEBGL_debug_renderer_info");
    return String(gl.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  });
  await info.attach("local-render-observation", {
    body: JSON.stringify({ renderer, snapshot: final, caveat: "Single-kart automated browser observation, not reference-hardware or physical-controller acceptance." }, null, 2),
    contentType: "application/json",
  });
  expect(final.state.lap, JSON.stringify(final.state)).toBe(2);
  expect(final.state.recoveries).toBe(0);
  expect(captured).toBe(true);
});
