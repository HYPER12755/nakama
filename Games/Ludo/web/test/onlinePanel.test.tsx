import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LudoOnlinePanel } from "../src/components/LudoOnlinePanel";
import type { OnlineLudoController } from "../src/hooks/useOnlineLudo";

function controller(searching: boolean) {
  return {
    connection: "connected",
    state: null,
    error: null,
    notice: null,
    searching,
    spectating: false,
    roomCode: null,
    accountName: null,
    account: null,
    authBusy: false,
    authError: null,
    authNotice: null,
    myUserId: null,
    myColour: null,
    matchId: null,
    profile: null,
    history: [],
    leaderboard: [],
    profileLoading: false,
    profileError: null,
    friends: [],
    friendsLoading: false,
    friendsError: null,
    inviteSendingId: null,
    inviteError: null,
    inviteNotice: null,
    quickMatch: async () => undefined,
    cancelQuickMatch: () => undefined,
    createPrivate: async () => "",
    joinByCode: async () => undefined,
    leave: async () => undefined,
    roll: () => undefined,
    move: () => undefined,
    chat: () => undefined,
    resign: () => undefined,
    clearNotice: () => undefined,
    clearAuthFeedback: () => undefined,
    signIn: async () => undefined,
    signUp: async () => undefined,
    signOut: async () => undefined,
    refreshProfile: async () => undefined,
    loadFriends: async () => undefined,
    inviteFriend: async () => undefined,
    connect: async () => undefined,
  } as unknown as OnlineLudoController;
}

function panel(searching: boolean) {
  return (
    <LudoOnlinePanel
      online={controller(searching)}
      seats={2}
      roomInput=""
      onRoomInput={() => undefined}
      onRematch={() => undefined}
      onNotify={() => undefined}
    />
  );
}

describe("the Ludo online lobby", () => {
  it("shows a counting clock while searching", () => {
    const html = renderToStaticMarkup(panel(true));
    expect(html).toMatch(/00:0\d/);
  });

  it("offers to cancel the search", () => {
    const html = renderToStaticMarkup(panel(true));
    expect(html).toContain("Cancel search");
  });
});
