import { test as base, chromium } from "@playwright/test";
import type { Browser } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "node:process";

export { expect } from "@playwright/test";
export const test = base.extend({
  browser: [async ({}, use, worker) => {
    const server = await chromium.launchServer({ headless: true, timeout: 30_000, executablePath: env.KARTSICK_TEST_BROWSER_EXECUTABLE });
    const process = server.process();
    const profile = process.spawnargs.find(argument => argument.startsWith("--user-data-dir="))?.slice("--user-data-dir=".length);
    let browser: Browser | undefined;
    try {
      if (!profile || !process.pid) throw new Error("The owned test browser must expose its PID and temporary profile.");
      await mkdir(worker.project.outputDir, { recursive: true });
      const owner = {
        owner: "kartsick-playwright", pid: process.pid, temporaryProfile: profile, executable: process.spawnfile,
        started: new Date().toISOString(),
        cleanup: "Playwright BrowserServer.close owns removal of this temporary profile.",
      };
      const record = join(worker.project.outputDir, `browser-owner-${worker.workerIndex}.json`);
      await writeFile(record, JSON.stringify(owner, null, 2));
      browser = await chromium.connect(server.wsEndpoint(), { timeout: 15_000 });
      await writeFile(record, JSON.stringify({ ...owner, browser: browser.version() }, null, 2));
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
