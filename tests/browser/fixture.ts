import { test as base, chromium } from "@playwright/test";
import type { Browser } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export { expect } from "@playwright/test";
export const test = base.extend({
  browser: [async ({}, use, worker) => {
    const server = await chromium.launchServer({ headless: true });
    const process = server.process();
    const profile = process.spawnargs.find(argument => argument.startsWith("--user-data-dir="))?.slice("--user-data-dir=".length);
    let browser: Browser | undefined;
    try {
      if (!profile || !process.pid) throw new Error("The owned test browser must expose its PID and temporary profile.");
      await mkdir(worker.project.outputDir, { recursive: true });
      browser = await chromium.connect(server.wsEndpoint());
      await writeFile(join(worker.project.outputDir, `browser-owner-${worker.workerIndex}.json`), JSON.stringify({
        owner: "kartsick-playwright", pid: process.pid, temporaryProfile: profile,
        browser: browser.version(), started: new Date().toISOString(),
        cleanup: "Playwright BrowserServer.close owns removal of this temporary profile.",
      }, null, 2));
      await use(browser);
    } finally {
      try {
        await browser?.close();
      } finally {
        await server.close();
      }
    }
  }, { scope: "worker" }],
});
