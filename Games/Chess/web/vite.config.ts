import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import manifest from "../manifest.json";

export default defineConfig({
  base: "./",
  define: {
    __MOONGAMES_GAME_ID__: JSON.stringify(manifest.id),
    __MOONGAMES_GAME_VERSION__: JSON.stringify(manifest.version),
  },
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2020",
  },
});
