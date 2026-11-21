import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

const here = path.dirname(new URL(import.meta.url).pathname);
const manifest = JSON.parse(
  readFileSync(path.join(here, "../manifest.json"), "utf8")
);

export default defineConfig({
  base: "./",
  define: {
    __MOONGAMES_GAME_ID__: JSON.stringify(manifest.id),
    __MOONGAMES_GAME_VERSION__: JSON.stringify(manifest.version),
  },
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true })],
  server: { port: 5177, host: "0.0.0.0" },
  build: { outDir: "../dist", emptyOutDir: true, target: "es2020" },
});
