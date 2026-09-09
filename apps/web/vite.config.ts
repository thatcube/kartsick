import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { localSignalingPlugin } from "../signaling/src/local.ts";

const browserTest = process.env.KARTSICK_BROWSER_TEST === "1";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  cacheDir: browserTest
    ? fileURLToPath(new URL(`../../node_modules/.vite-browser-${Number(process.env.KARTSICK_TEST_PORT ?? 4174)}/`, import.meta.url))
    : undefined,
  plugins: [localSignalingPlugin()],
  server: { hmr: browserTest ? false : undefined },
  // Renderer-only fixtures bypass index.html; discover their lazy Babylon imports before serving shaders.
  optimizeDeps: browserTest ? {
    entries: ["index.html", "src/**/*.{ts,tsx}", "!src/**/*.test.ts"],
    force: true,
  } : undefined,
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 1800,
  },
});
