import { describe, expect, it } from "vitest";
import {
  bundleSigningPayload,
  checkPinnedSigner,
  compareSemver,
  parseReleaseManifest,
  selectLatestBundle,
  type GameBundleDescriptor,
  type ReleaseManifest,
} from "@moongames/game-sdk";
import {
  buildMatchInviteUrl,
  parseLaunchInvite,
  parseMatchInvite,
} from "../src/lib/invite";
import {
  normalizedOnlineState,
  type OnlineHistoryEntry,
  type OnlineStatePayload,
} from "../src/lib/onlineProtocol";
import { exportPgn, replayFromHistory } from "../src/lib/replay";

function historyEntry(
  overrides: Partial<OnlineHistoryEntry> = {},
): OnlineHistoryEntry {
  return {
    matchId: "match-1",
    mode: "quick",
    rated: true,
    color: "w",
    outcome: "win",
    status: "checkmate",
    reason: "checkmate",
    winnerColor: "w",
    opponent: { userId: "user-2", username: "Bob" },
    moves: 3,
    sans: ["e4", "e5", "Nf3"],
    pgn: "1. e4 e5 2. Nf3",
    timeControl: { initialMs: 300000, incrementMs: 0 },
    ratingBefore: 1200,
    ratingAfter: 1216,
    ratingDelta: 16,
    endedAt: Date.UTC(2026, 10, 11),
    ...overrides,
  };
}

describe("match invite links", () => {
  it("parses player and spectator links", () => {
    expect(parseMatchInvite("?match=abc.def")).toEqual({
      matchId: "abc.def",
      spectate: false,
    });
    expect(parseMatchInvite("?match=abc.def&spectate=1")).toEqual({
      matchId: "abc.def",
      spectate: true,
    });
    expect(parseMatchInvite("?match=abc.def&watch=1")).toEqual({
      matchId: "abc.def",
      spectate: true,
    });
    expect(parseMatchInvite("?spectate=1")).toBeNull();
    expect(parseMatchInvite("?match=")).toBeNull();
  });

  it("parses invite links delivered by a native host", () => {
    expect(parseLaunchInvite(undefined)).toBeNull();
    expect(
      parseLaunchInvite({
        query: "match=abc.def&spectate=1",
        params: { match: "abc.def", spectate: "1" },
      }),
    ).toEqual({ matchId: "abc.def", spectate: true });
    expect(
      parseLaunchInvite({
        query: "unrelated=1",
        params: { unrelated: "1" },
      }),
    ).toBeNull();
  });

  it("builds links without leaking an old spectator flag", () => {
    const playerLink = buildMatchInviteUrl(
      "match-1",
      false,
      "https://games.example.com/chess/?spectate=1&foo=bar",
    );
    const playerUrl = new URL(playerLink);
    expect(playerUrl.searchParams.get("match")).toBe("match-1");
    expect(playerUrl.searchParams.get("spectate")).toBeNull();
    expect(playerUrl.searchParams.get("foo")).toBe("bar");

    const spectatorLink = buildMatchInviteUrl(
      "match-1",
      true,
      "https://games.example.com/chess/?foo=bar",
    );
    const url = new URL(spectatorLink);
    expect(url.searchParams.get("match")).toBe("match-1");
    expect(url.searchParams.get("spectate")).toBe("1");
    expect(url.searchParams.get("foo")).toBe("bar");
  });
});

describe("state normalization", () => {
  it("turns Lua empty arrays into client arrays", () => {
    const payload = {
      state: {
        fen: "",
        turn: "w",
        status: "active",
        winner: null,
        inCheck: false,
        moveNumber: 1,
        history: {},
        lastMove: null,
        board: [],
        legalMoves: {},
      },
      match: {
        id: "match-1",
        mode: "private",
        rated: false,
        started: false,
        open: true,
        timeControl: { initialMs: 300000, incrementMs: 0 },
      },
      players: {},
      spectators: {},
      clock: { whiteMs: 300000, blackMs: 300000, turn: "w" },
      result: null,
      drawOffer: null,
    } as unknown as OnlineStatePayload;

    const normalized = normalizedOnlineState(payload);
    expect(normalized.state.history).toEqual([]);
    expect(normalized.players).toEqual([]);
    expect(normalized.spectators).toEqual([]);
  });
});

describe("history replay", () => {
  it("rebuilds every position from a stored PGN", () => {
    const replay = replayFromHistory(historyEntry());
    expect(replay.error).toBeNull();
    expect(replay.sans).toEqual(["e4", "e5", "Nf3"]);
    expect(replay.frames).toHaveLength(4);
    expect(replay.frames[0]?.state.history).toEqual([]);
    expect(replay.frames[3]?.state.lastMove?.san).toBe("Nf3");
  });

  it("falls back to SAN history when a PGN is unavailable", () => {
    const replay = replayFromHistory(
      historyEntry({ pgn: "", sans: ["e4", "e5"] }),
    );
    expect(replay.error).toBeNull();
    expect(replay.frames).toHaveLength(3);
  });

  it("returns a readable error for a malformed PGN", () => {
    const replay = replayFromHistory(
      historyEntry({ pgn: "1. e4 definitely-not-a-move", sans: [] }),
    );
    expect(replay.error).toContain("Could not replay this game");
    expect(replay.frames).toHaveLength(1);
  });

  it("exports tagged PGN with the stored result", () => {
    const pgn = exportPgn(historyEntry());
    expect(pgn).toContain('[Event "MoonGames Chess"]');
    expect(pgn).toContain('[White "You"]');
    expect(pgn).toContain('[Black "Bob"]');
    expect(pgn).toContain('[Result "1-0"]');
    expect(pgn.trimEnd().endsWith("1-0")).toBe(true);
  });
});

const PUBLIC_KEY = `${"A".repeat(43)}=`;

function bundleDescriptor(
  overrides: Partial<GameBundleDescriptor> = {},
): GameBundleDescriptor {
  return {
    format: 1,
    gameId: "chess",
    gameName: "Chess",
    version: "0.2.0",
    sdkVersion: "0.1.0",
    minHostProtocol: 1,
    entry: "index.html",
    capabilities: ["local"],
    publishedAt: "2026-01-02T03:04:05.000Z",
    sha256: "a".repeat(64),
    size: 123,
    url: "chess/0.2.0/chess-0.2.0.zip",
    keyId: "test-1",
    publicKey: PUBLIC_KEY,
    signature: `${"A".repeat(86)}==`,
    ...overrides,
  };
}

function releaseManifest(bundles: GameBundleDescriptor[]): ReleaseManifest {
  return {
    format: 1,
    generatedAt: "2026-01-02T03:04:05.000Z",
    signers: {
      "test-1": { algorithm: "ed25519", publicKey: PUBLIC_KEY },
    },
    bundles,
  };
}

describe("bundle delivery contract", () => {
  it("keeps the signed payload stable across host implementations", () => {
    expect(bundleSigningPayload(bundleDescriptor())).toBe(
      [
        "moongames-bundle-v1",
        "1",
        "chess",
        "0.2.0",
        "0.1.0",
        "1",
        "index.html",
        "a".repeat(64),
        "123",
        "test-1",
      ].join("\n"),
    );
  });

  it("selects the newest compatible bundle", () => {
    const manifest = parseReleaseManifest(
      releaseManifest([
        bundleDescriptor({ version: "0.1.0" }),
        bundleDescriptor({ version: "0.3.0" }),
        bundleDescriptor({ version: "0.4.0", minHostProtocol: 2 }),
      ]),
    );
    expect(selectLatestBundle(manifest, "chess", 1)?.version).toBe("0.3.0");
    expect(selectLatestBundle(manifest, "checkers", 1)).toBeNull();
    expect(selectLatestBundle(manifest, "chess", 2)?.version).toBe("0.4.0");
    expect(compareSemver("1.0.0", "1.0.0-beta")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0-beta.2", "1.0.0-beta.10")).toBeLessThan(0);
  });

  it("rejects malformed manifests and checks pinned signers", () => {
    expect(() =>
      parseReleaseManifest({ ...releaseManifest([]), format: 2 }),
    ).toThrow();
    const descriptor = bundleDescriptor();
    const manifest = releaseManifest([descriptor]);
    expect(
      checkPinnedSigner(manifest, descriptor, { "test-1": PUBLIC_KEY }),
    ).toBeNull();
    expect(
      checkPinnedSigner(manifest, descriptor, { "test-1": `${"B".repeat(43)}=` }),
    ).toContain("does not match");
    expect(checkPinnedSigner(manifest, descriptor, {})).toContain(
      "No trusted public key",
    );
  });
});
