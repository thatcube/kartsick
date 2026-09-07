import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { localSignalingPlugin } from "../signaling/src/local.ts";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [localSignalingPlugin()],
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 1800,
  },
});
