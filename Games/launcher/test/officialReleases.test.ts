import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { fetchVerifiedCatalog } from "@moongames/host-core";
import type { GamesCatalog } from "@moongames/game-sdk";
import { configuredTrustedKeys } from "../src/lib/official";

const here = path.dirname(fileURLToPath(import.meta.url));
const gamesRoot = path.resolve(here, "..", "..");

/**
 * The menu only hands its account to a game that it has verified as an
 * official release. This checks that the real catalog and the real signed
 * manifest still agree, so the games are official and the shared account is
 * handed over.
 */
describe("the official games of this machine", () => {
  it("are verified against the signed manifest", async () => {
    const catalog = JSON.parse(
      readFileSync(path.join(gamesRoot, "launcher", "public", "games.json"), "utf8"),
    ) as GamesCatalog;
    const manifest = JSON.parse(
      readFileSync(
        path.join(gamesRoot, "releases", "release-manifest.json"),
        "utf8",
      ),
    );

    const result = await fetchVerifiedCatalog(catalog, "file://manifest", {
      fetchImpl: async () =>
        new Response(JSON.stringify(manifest), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      trustedKeys: configuredTrustedKeys(),
    } as never);

    const available = catalog.games.filter(
      (game) => game.status === "available",
    );
    for (const game of available) {
      expect(
        result.games.has(game.id),
        `${game.id} was not verified: ${
          result.errors.get(game.id) ?? "no reason given"
        }`,
      ).toBe(true);
    }
  });
});
