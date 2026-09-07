import type { Page } from "@playwright/test";

declare global {
  interface Window {
    __racePads?: {
      id: string; index: number; connected: boolean; mapping: string; timestamp: number; axes: number[];
      buttons: { value: number; pressed: boolean; touched: boolean }[];
    }[];
  }
}

export async function installControllers(page: Page, count = 4): Promise<void> {
  await page.addInitScript(count => {
    window.__racePads = Array.from({ length: count }, (_, index) => ({
      id: `Xbox test controller ${index + 1}`, index, connected: false, mapping: "standard", timestamp: 1, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false })),
    }));
    Object.defineProperty(navigator, "getGamepads", { value: () => window.__racePads!.map(pad => pad.connected ? pad : null), configurable: true });
  }, count);
}
