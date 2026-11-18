import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const gamesRoot = path.resolve(here, "..");

/**
 * The public keys the menu trusts.
 *
 * A key that is pinned when the menu is built wins. When there is none, the
 * keys of the signed manifest on this machine are used, so the games that
 * were packaged here are the official ones, and the menu hands its account
 * to them.
 *
 * The keys are read from the machine and never written into the source, so
 * the same project works the same way on any machine.
 */
function trustedKeysFromManifest(): string {
  const manifestPath = path.join(gamesRoot, "releases", "release-manifest.json");
  if (!existsSync(manifestPath)) {
    return "";
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      signers?: Record<string, { publicKey?: string }>;
    };
    const parts: string[] = [];
    for (const [keyId, signer] of Object.entries(manifest.signers ?? {})) {
      if (typeof signer.publicKey === "string" && signer.publicKey.length > 0) {
        parts.push(`${keyId}=${signer.publicKey}`);
      }
    }
    return parts.join(",");
  } catch {
    return "";
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here, "VITE_");
  const pinned = env.VITE_MOONGAMES_TRUSTED_KEYS ?? "";
  const trusted = pinned.length > 0 ? pinned : trustedKeysFromManifest();

  return {
    // The launcher is served from the web root and must keep working on deep
    // links such as /invite/<token>, where relative asset URLs resolve wrongly.
    base: "/",
    plugins: [react()],
    define: {
      "import.meta.env.VITE_MOONGAMES_TRUSTED_KEYS": JSON.stringify(trusted),
    },
    server: {
      port: 5174,
      proxy: {
        "/chess": {
          target: "http://127.0.0.1:5173",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/chess/, "/"),
        },
        "/carrom": {
          target: "http://127.0.0.1:5175",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/carrom/, "/"),
        },
        "/ludo": {
          target: "http://127.0.0.1:5176",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ludo/, "/"),
        },
        "/release-manifest.json": {
          target: "http://127.0.0.1:8099",
          changeOrigin: true,
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
  };
});
