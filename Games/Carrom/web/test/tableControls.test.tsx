import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OnlinePanel } from "../src/components/OnlinePanel";
import type {
  OnlineCarromController,
  CarromServerState,
} from "../src/hooks/useOnlineCarrom";

function controller(overrides: Partial<OnlineCarromController> = {}) {
  return {
    connection: "connected",
    matchId: null,
    state: null,
    game: null,
    seats: [],
    spectators: [],
    chat: [],
    result: null,
    error: null,
    notice: null,
    searching: false,
    latencyMs: 42,
    spectating: false,
    myColour: null,
    myUserId: "u1",
    animation: null,
    profile: null,
    history: [],
    leaderboard: [],
    myLeaderboard: null,
    profileLoading: false,
    profileError: null,
    account: null,
    authBusy: false,
    authError: null,
    authNotice: null,
    opponentLeft: null,
    friends: [],
    friendsLoading: false,
    friendsError: null,
    inviteSendingId: null,
    inviteError: null,
    inviteNotice: null,
    roomCode: null,
    roomSeats: null,
    drawOffer: null,
    refreshProfile: async () => undefined,
    dismissOpponentLeft: () => undefined,
    clearAuthFeedback: () => undefined,
    loadFriends: async () => undefined,
    inviteFriend: async () => false,
    clearInviteFeedback: () => undefined,
    signIn: async () => undefined,
    signUp: async () => undefined,
    signOut: async () => undefined,
    connect: async () => undefined,
    quickMatch: async () => undefined,
    createPrivateRoom: async () => undefined,
    joinMatch: async () => undefined,
    joinByRoomCode: async () => undefined,
    leaveMatch: async () => undefined,
    sendShot: () => undefined,
    resign: () => undefined,
    offerDraw: () => undefined,
    acceptDraw: () => undefined,
    declineDraw: () => undefined,
    sendChat: () => undefined,
    requestState: () => undefined,
    clearAnimation: () => undefined,
    setNotice: () => undefined,
    ...overrides,
  } as unknown as OnlineCarromController;
}

function panel(online: OnlineCarromController) {
  return <OnlinePanel online={online} seats={2} onSeatsChange={() => undefined} />;
}

describe("the online lobby", () => {
  it("offers a way to watch a table", () => {
    const html = renderToStaticMarkup(panel(controller()));
    expect(html).toContain("Watch a table by id");
  });

  it("shows the round trip when the server has answered a ping", () => {
    const html = renderToStaticMarkup(panel(controller()));
    expect(html).toContain("42 ms");
  });

  it("offers resign and draw at a table", () => {
    const html = renderToStaticMarkup(
      panel(controller({ matchId: "match-1" })),
    );
    expect(html).toContain("Resign");
    expect(html).toContain("Offer draw");
  });

  it("lets the other player answer a draw offer", () => {
    const offer: CarromServerState["drawOffer"] = {
      by: "u2",
      colour: "black",
      username: "Onyx",
      at: 1,
    };
    const html = renderToStaticMarkup(
      panel(controller({ matchId: "match-1", drawOffer: offer })),
    );
    expect(html).toContain("Accept draw");
  });
});
