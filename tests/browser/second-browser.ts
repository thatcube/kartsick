import { chromium } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";

export async function withSecondBrowser(
  first: Browser, outputPath: string,
  run: (host: Page, client: Page, first: Browser) => Promise<void>,
  baseURL?: string,
): Promise<void> {
  const server = await chromium.launchServer({ headless: true });
  const process = server.process();
  const profile = process.spawnargs.find(argument => argument.startsWith("--user-data-dir="))?.slice("--user-data-dir=".length);
  let second: Browser | undefined, host: Page | undefined, client: Page | undefined;
  try {
    if (!process.pid || !profile) throw new Error("Second browser ownership could not be recorded.");
    second = await chromium.connect(server.wsEndpoint());
    await writeFile(outputPath, JSON.stringify({
      owner: "kartsick-two-browser-test", pid: process.pid, temporaryProfile: profile, browser: second.version(),
      cleanup: "BrowserServer.close in finally owns this process and profile.",
    }, null, 2));
    host = await first.newPage({ baseURL });
    client = await second.newPage({ baseURL });
    await run(host, client, first);
  } finally {
    try { if (host && !host.isClosed()) await host.close(); }
    finally {
      try { if (client && !client.isClosed()) await client.close(); }
      finally { try { await second?.close(); } finally { await server.close(); } }
    }
  }
}
