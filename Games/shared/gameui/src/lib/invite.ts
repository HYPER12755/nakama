import type { GameLaunchContext } from "@moongames/game-sdk";

export interface MatchInvite {
  matchId: string;
  spectate: boolean;
}

export function parseMatchInvite(search: string): MatchInvite | null {
  const params = new URLSearchParams(search);
  const matchId = params.get("match")?.trim() ?? "";
  if (matchId.length === 0) {
    return null;
  }

  return {
    matchId,
    spectate:
      params.get("spectate") === "1" || params.get("watch") === "1",
  };
}

/** Parse the launch query supplied by a native host during init. */
export function parseLaunchInvite(
  launch: GameLaunchContext | undefined,
): MatchInvite | null {
  if (launch === undefined) {
    return null;
  }
  return parseMatchInvite(`?${launch.query}`);
}

export function buildMatchInviteUrl(
  matchId: string,
  spectate = false,
  base = window.location.href,
): string {
  const url = new URL(base);
  url.searchParams.set("match", matchId);
  if (spectate) {
    url.searchParams.set("spectate", "1");
  } else {
    url.searchParams.delete("spectate");
    url.searchParams.delete("watch");
  }
  return url.toString();
}

export function clearMatchInviteFromLocation(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("match")) {
    return;
  }

  url.searchParams.delete("match");
  url.searchParams.delete("spectate");
  url.searchParams.delete("watch");
  window.history.replaceState({}, "", url.toString());
}
