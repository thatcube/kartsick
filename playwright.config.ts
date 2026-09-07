import { defineConfig } from "@playwright/test";

const port = Number(process.env.KARTSICK_TEST_PORT ?? 4174);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new RangeError("KARTSICK_TEST_PORT must be an integer from 1024 to 65535.");
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/browser",
  outputDir: "./test-results",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: origin,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    env: { KARTSICK_BROWSER_TEST: "1" },
    command: `node node_modules/vite/bin/vite.js --config apps/web/vite.config.ts --configLoader runner --host 127.0.0.1 --port ${port} --strictPort`,
    url: origin,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
