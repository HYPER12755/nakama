import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/chess": {
        target: "http://127.0.0.1:5173",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/chess/, "/"),
      },
    },
  },
  preview: {
    port: 4174,
    // Vite preview inherits server.proxy unless it is overridden. The built
    // launcher must serve the assembled game files, not the dev server.
    proxy: {},
  },
  build: {
    target: "es2020",
  },
});
