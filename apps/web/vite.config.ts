import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { localSignalingPlugin } from "../signaling/src/local.ts";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  cacheDir: process.env.KARTSICK_BROWSER_TEST === "1"
    ? fileURLToPath(new URL(`../../node_modules/.vite-browser-${Number(process.env.KARTSICK_TEST_PORT ?? 4174)}/`, import.meta.url))
    : undefined,
  plugins: [localSignalingPlugin()],
  server: { hmr: process.env.KARTSICK_BROWSER_TEST === "1" ? false : undefined },
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 1800,
  },
});
