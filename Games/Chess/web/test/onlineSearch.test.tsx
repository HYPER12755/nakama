import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OnlinePanel } from "../src/components/OnlinePanel";
import type { OnlineChessController } from "../src/hooks/useOnlineChess";

describe("the Chess online lobby", () => {
  it("shows a cancellable search instead of opening a table", () => {
    const controller = {
      matchmaking: true,
      matchmakingSeconds: 3,
      matchId: null,
      serverState: null,
      drawOffer: null,
      myColor: null,
      incomingInvite: null,
      opponentLeft: null,
      error: null,
      notice: null,
      friends: [],
      profile: null,
      history: [],
      leaderboard: [],
      myLeaderboard: null,
      pendingPromotion: null,
      connection: "connected",
      timeControlId: "5+0",
      cancelQuickMatch: () => undefined,
    } as unknown as OnlineChessController;
    const html = renderToStaticMarkup(
      <OnlinePanel controller={controller} onNotify={() => undefined} />,
    );
    expect(html).toContain("Cancel search");
    expect(html).toMatch(/Searching/);
    expect(html).toContain("A table is");
  });
});
