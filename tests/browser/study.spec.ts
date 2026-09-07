import { test, expect } from "./fixture";
import type { Page } from "@playwright/test";
import { GAP_START } from "@kartsick/content";
import { writeFile } from "node:fs/promises";

const pilotUrl = "/@fs" + new URL("./pilot.ts", import.meta.url).pathname;

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
    // Automation evaluations can count as gestures; explicitly deny the first resume.
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      private firstAttempt = true;
      override resume(): Promise<void> {
        if (!this.firstAttempt) return super.resume();
        this.firstAttempt = false;
        return super.suspend().then(() => new Promise<void>((resolve, reject) => {
          const changed = () => {
            if (this.state === "running" || this.state === "closed") {
              this.removeEventListener("statechange", changed);
              if (this.state === "running") resolve();
              else reject(new DOMException("Test audio context closed", "AbortError"));
            }
          };
          this.addEventListener("statechange", changed);
        }));
      }
    };
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
  await expect(page.getByRole("button", { name: "Enable sound" })).toBeVisible();
  await page.getByRole("button", { name: "Enable sound" }).click();
  await expect(page.getByRole("button", { name: "Enable sound" })).toBeHidden();
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

test("analog drift has bounded world feedback and a close, stable chase camera", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.addInitScript(() => {
    window.__testPad = {
      id: "Synthetic analog drift - not physical controller evidence", index: 0, connected: true,
      mapping: "standard", timestamp: 0, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    Object.defineProperty(navigator, "getGamepads", { value: () => [window.__testPad] });
  });
  await openStudy(page);
  await page.evaluate(async url => {
    const pilot: typeof import("./pilot") = await import(url);
    pilot.startDriftPilot();
  }, pilotUrl);
  await page.getByRole("button", { name: "Take it for a spin" }).click();
  await page.waitForFunction(() => (window.__KARTSICK_DIAGNOSTICS__?.read().state.speed ?? 0) > 18);
  const atSpeed = await page.evaluate(() => window.__KARTSICK_DIAGNOSTICS__!.read());
  expect(Math.hypot(atSpeed.state.x - atSpeed.camera.x, atSpeed.state.z - atSpeed.camera.z)).toBeLessThan(10.2);
  expect(atSpeed.camera.fov).toBeGreaterThan(0.9);
  await expect(page.locator('[data-hud="charge"]')).toHaveText("3 / 3");
  await page.waitForFunction(() => {
    const feedback = window.__KARTSICK_DIAGNOSTICS__!.read().feedback;
    return feedback.marks > 0 && feedback.particles > 0;
  });
  await page.screenshot({ path: info.outputPath("drift-blue.png") });
  const feedback = await page.evaluate(() => window.__KARTSICK_DIAGNOSTICS__!.read().feedback);
  expect(feedback.marks).toBeLessThanOrEqual(160);
  expect(feedback.particles).toBeLessThanOrEqual(192);
  await page.evaluate(async url => {
    const pilot: typeof import("./pilot") = await import(url);
    pilot.stopPilot();
  }, pilotUrl);
  await page.waitForFunction(() => window.__KARTSICK_DIAGNOSTICS__!.read().state.boost > 0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Reduced motion Off" }).click();
  await page.waitForFunction(() => {
    const feedback = window.__KARTSICK_DIAGNOSTICS__!.read().feedback;
    return feedback.marks === 0 && feedback.particles === 0;
  });
  expect(errors).toEqual([]);
});

test("the rendered glider crossing leads into a valid next lap", async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__testPad = {
      id: "Synthetic course driver - not a player assist", index: 0, connected: true,
      mapping: "standard", timestamp: 0, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    Object.defineProperty(navigator, "getGamepads", { value: () => [window.__testPad] });
  });
  await openStudy(page);
  await page.evaluate(async url => {
    const pilot: typeof import("./pilot") = await import(url);
    pilot.startCoursePilot();
  }, pilotUrl);
  await page.getByRole("button", { name: "Take it for a spin" }).click();
  await expect(page.locator(".mode-driving")).toBeVisible();
  let captured = false;
  const landmarks = new Set<string>();
  const deadline = Date.now() + 100_000;
  try {
    while (Date.now() < deadline) {
      expect(errors).toEqual([]);
      const state = await page.evaluate(() => window.__KARTSICK_DIAGNOSTICS__!.read().state);
      if (state.lap > 1 || state.recoveries > 0) break;
      for (const [name, u] of [["orchard", 0.16], ["barn-bend", 0.31], ["ridge", 0.53]] as const) {
        if (state.roadU >= u && !landmarks.has(name)) {
          await page.screenshot({ path: info.outputPath(`${name}.png`) });
          landmarks.add(name);
        }
      }
      if (state.mode === "glider" && state.roadU > GAP_START + 0.016 && !captured) {
        await page.screenshot({ path: info.outputPath("gliding.png") });
        captured = true;
      }
      await page.waitForTimeout(40);
    }
  } finally {
    await page.evaluate(async url => {
      const pilot: typeof import("./pilot") = await import(url);
      pilot.stopPilot();
    }, pilotUrl);
  }
  const final = await page.evaluate(() => window.__KARTSICK_DIAGNOSTICS__!.read());
  const renderer = await page.evaluate(() => {
    const gl = document.querySelector("canvas")?.getContext("webgl2");
    if (!gl) return "WebGL 2 context unavailable";
    const extension = gl.getExtension("WEBGL_debug_renderer_info");
    return String(gl.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  });
  const observation = info.outputPath("render-observation.json");
  await writeFile(observation, JSON.stringify({ renderer, snapshot: final, caveat: "Single-kart automated browser observation, not reference-hardware or physical-controller acceptance." }, null, 2));
  await info.attach("local-render-observation", { path: observation, contentType: "application/json" });
  expect(final.state.lap, JSON.stringify(final.state)).toBe(2);
  expect(final.state.recoveries).toBe(0);
  expect(captured).toBe(true);
});
