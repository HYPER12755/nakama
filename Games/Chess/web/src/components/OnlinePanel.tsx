import { useState, type FormEvent } from "react";
import {
  inviteWantsSpectator,
  type SocialFriend,
} from "@moongames/game-sdk";
import type { OnlineChessController } from "../hooks/useOnlineChess";
import { copyText } from "@moongames/game-ui";
import { buildMatchInviteUrl } from "@moongames/game-ui";
import { TIME_CONTROLS, formatClock } from "../lib/onlineProtocol";
import { FriendInviteDialog } from "@moongames/game-ui";

export interface OnlinePanelProps {
  controller: OnlineChessController;
  onNotify: (message: string) => void;
}

function resultText(controller: OnlineChessController): string {
  const result = controller.serverState?.result;
  if (!result) {
    return "";
  }

  if (result.winnerColor) {
    const winner = result.winnerColor === "w" ? "White" : "Black";
    return `${winner} wins by ${result.reason.replace(/_/g, " ")}`;
  }

  if (result.status === "draw" || result.status === "stalemate") {
    return `Draw by ${result.reason.replace(/_/g, " ")}`;
  }

  return "Match ended";
}

export function OnlinePanel({ controller, onNotify }: OnlinePanelProps) {
  const [joinId, setJoinId] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [joinAsSpectator, setJoinAsSpectator] = useState(false);
  const [creatingPrivate, setCreatingPrivate] = useState(false);
  const [inviteTarget, setInviteTarget] = useState<{
    matchId: string;
    spectate: boolean;
  } | null>(null);
  const {
    connection,
    session,
    serverAddress,
    setServerAddress,
    timeControlId,
    setTimeControlId,
    matchId,
    roomCode,
    serverState,
    players,
    spectators,
    spectating,
    myColor,
    drawOffer,
    matchmaking,
    matchmakingSeconds,
    friends,
    friendsLoading,
    friendsError,
    inviteSendingId,
    inviteError,
    inviteNotice,
    incomingInvite,
    loadFriends,
    clearInviteFeedback,
    inviteFriend,
    acceptIncomingInvite,
    dismissIncomingInvite,
    profile,
    timeControl,
    connect,
    disconnect,
    quickMatch,
    cancelQuickMatch,
    createPrivateMatch,
    joinMatch,
    joinByRoomCode,
    leaveMatch,
    acceptDraw,
    declineDraw,
  } = controller;

  const inMatch = matchId !== null && serverState !== null;
  const waitingForOpponent = inMatch && !serverState.match.started;
  const pendingOffer =
    drawOffer !== null && myColor !== null && drawOffer.by !== myColor;

  const copyMatchId = async () => {
    if (matchId === null) {
      return;
    }
    const copied = await copyText(matchId);
    onNotify(copied ? "Match ID copied" : "Could not copy the match ID");
  };

  const copyRoomCode = async () => {
    if (roomCode === null) {
      return;
    }
    const copied = await copyText(roomCode);
    onNotify(copied ? "Room code copied" : "Could not copy the room code");
  };

  const joinByCode = async () => {
    const code = roomCodeInput.trim();
    if (code.length === 0) {
      return;
    }
    const joined = await joinByRoomCode(code);
    if (joined) {
      setRoomCodeInput("");
    }
  };

  const copyInvite = async (spectate: boolean) => {
    if (matchId === null) {
      return;
    }
    const copied = await copyText(buildMatchInviteUrl(matchId, spectate));
    const successMessage = spectate
      ? "Spectator link copied"
      : "Invite link copied";
    onNotify(copied ? successMessage : "Could not copy the invite link");
  };

  const openFriendInvite = (target: { matchId: string; spectate: boolean }) => {
    clearInviteFeedback();
    setInviteTarget(target);
    void loadFriends();
  };

  const closeFriendInvite = () => {
    setInviteTarget(null);
    clearInviteFeedback();
  };

  const createAndInvite = async () => {
    setCreatingPrivate(true);
    try {
      const createdMatchId = await createPrivateMatch();
      if (createdMatchId !== null) {
        openFriendInvite({ matchId: createdMatchId, spectate: false });
      }
    } finally {
      setCreatingPrivate(false);
    }
  };

  const sendFriendInvite = async (
    friend: SocialFriend,
  ): Promise<boolean> => {
    if (inviteTarget === null) {
      return false;
    }
    try {
      await inviteFriend({
        userId: friend.userId,
        username: friend.username,
        state: friend.state,
        matchId: inviteTarget.matchId,
        spectate: inviteTarget.spectate,
        timeControl: serverState?.match.timeControl ?? timeControl,
      });
      onNotify(`Invite sent to ${friend.username}`);
      return true;
    } catch {
      return false;
    }
  };

  const submitJoin = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await joinMatch(joinId, { spectator: joinAsSpectator });
      setJoinId("");
      setJoinAsSpectator(false);
    } catch (cause) {
      onNotify(
        cause instanceof Error ? cause.message : "Could not join that match",
      );
    }
  };

  return (
    <section className="panel online-panel">
      <div className="panel-heading">
        <h2>Online</h2>
        <span className={`online-state online-state--${connection}`}>
          {connection}
        </span>
      </div>

      {incomingInvite !== null && (
        <div className="incoming-invite" role="status">
          <div className="incoming-invite__copy">
            <span className="field-label">Game invite</span>
            <strong>
              {incomingInvite.sender.username} invited you to{" "}
              {incomingInvite.gameTitle}
            </strong>
            <span>
              {inviteWantsSpectator(incomingInvite)
                ? "Watch their live room."
                : "Join their private room."}
            </span>
          </div>
          <div className="incoming-invite__actions">
            <button
              type="button"
              className="mini-button mini-button--accent"
              onClick={() => void acceptIncomingInvite()}
            >
              Accept &amp; join
            </button>
            <button
              type="button"
              className="mini-button"
              onClick={dismissIncomingInvite}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {connection !== "connected" ? (
        <div className="online-setup">
          <p className="online-copy">
            Play a friend or find an opponent through the shared MoonGames
            server. Device sign-in is automatic.
          </p>
          <label className="field">
            <span>Server</span>
            <input
              type="url"
              value={serverAddress}
              onChange={(event) => setServerAddress(event.target.value)}
              placeholder="http://127.0.0.1:7350"
              spellCheck={false}
              disabled={connection === "connecting"}
            />
          </label>
          <button
            type="button"
            className="action-button action-button--primary"
            onClick={() =>
              void connect().catch(() => {
                // Connection failures are surfaced through controller.error.
              })
            }
            disabled={connection === "connecting"}
          >
            {connection === "connecting" ? "Connecting…" : "Connect"}
          </button>
        </div>
      ) : inMatch ? (
        <div className="online-match">
          <div className="match-summary">
            <div>
              <span className="field-label">Mode</span>
              <strong>{serverState.match.mode === "private" ? "Private" : "Quick"}</strong>
            </div>
            <div>
              <span className="field-label">Time</span>
              <strong>
                {Math.round(serverState.match.timeControl.initialMs / 60000)}+
                {Math.round(serverState.match.timeControl.incrementMs / 1000)}
              </strong>
            </div>
            <div>
              <span className="field-label">You</span>
              <strong>
                {spectating
                  ? "Spectating"
                  : myColor === "w"
                    ? "White"
                    : myColor === "b"
                      ? "Black"
                      : "—"}
              </strong>
            </div>
            <div>
              <span className="field-label">Rating</span>
              <strong>{profile?.rating ?? "—"}</strong>
            </div>
          </div>

          <div className="match-code">
            <span className="field-label">Room code</span>
            <div className="match-code-row">
              <code>{roomCode ?? "—"}</code>
              <button
                type="button"
                className="mini-button"
                disabled={roomCode === null}
                onClick={() => void copyRoomCode()}
              >
                Copy
              </button>
            </div>
            <p className="online-copy online-copy--compact">
              Read this code out to the other player so they can join this
              table.
            </p>
            <span className="field-label">Match ID</span>
            <div className="match-code-row">
              <code>{matchId}</code>
              <button type="button" className="mini-button" onClick={() => void copyMatchId()}>
                Copy
              </button>
            </div>
            <div className="invite-actions">
              {serverState.match.mode === "private" &&
                serverState.result === null &&
                matchId !== null && (
                  <button
                    type="button"
                    className="mini-button mini-button--accent"
                    onClick={() =>
                      openFriendInvite({
                        matchId,
                        spectate:
                          serverState.match.started ||
                          !serverState.match.open,
                      })
                    }
                  >
                    {serverState.match.started || !serverState.match.open
                      ? "Invite a friend to watch"
                      : "Invite a friend"}
                  </button>
                )}
              <button
                type="button"
                className="mini-button"
                onClick={() => void copyInvite(false)}
              >
                Copy invite link
              </button>
              <button
                type="button"
                className="mini-button"
                onClick={() => void copyInvite(true)}
              >
                Copy spectator link
              </button>
            </div>
          </div>

          <div className="online-players">
            {(["w", "b"] as const).map((color) => {
              const player = players.find((candidate) => candidate.color === color);
              const remaining =
                controller.displayClock === null
                  ? null
                  : controller.displayClock[color === "w" ? "whiteMs" : "blackMs"];

              return (
                <div key={color} className="online-player-row">
                  <span className={`seat-dot seat-dot--${color}`} />
                  <span className="online-player-name">
                    {player?.username ??
                      (waitingForOpponent ? "Waiting for opponent" : "Open seat")}
                  </span>
                  {player && (
                    <span
                      className={`online-player-connection ${player.connected ? "" : "online-player-connection--off"}`}
                    >
                      {player.connected ? "online" : "offline"}
                    </span>
                  )}
                  {remaining !== null && (
                    <span className="online-player-clock">{formatClock(remaining)}</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="online-spectators">
            <span className="field-label">
              Spectators ({spectators.length})
            </span>
            <span className="online-spectator-names">
              {spectators.length === 0
                ? "No one watching yet"
                : spectators.map((spectator) => spectator.username).join(", ")}
            </span>
          </div>

          {waitingForOpponent && (
            <p className="online-copy online-copy--compact">
              {serverState.match.mode === "private"
                ? "Invite a MoonGames friend directly, or share the room link. White stays reserved for the match creator."
                : "Waiting for the other player to join this room. Share the invite link to bring them in."}
            </p>
          )}

          {spectating && (
            <p className="online-copy online-copy--compact">
              You are watching this match. Moves, clocks, and results update live.
            </p>
          )}

          {serverState.result !== null && (
            <p className="match-result">{resultText(controller)}</p>
          )}

          {!serverState.match.started && connection === "connected" && (
            <div className="online-actions">
              <button
                type="button"
                className="action-button"
                onClick={() => void leaveMatch()}
              >
                Leave
              </button>
            </div>
          )}

          {pendingOffer && (
            <div className="draw-offer">
              <span>Opponent offers a draw.</span>
              <div className="online-actions">
                <button type="button" className="action-button" onClick={acceptDraw}>
                  Accept
                </button>
                <button type="button" className="action-button" onClick={declineDraw}>
                  Decline
                </button>
              </div>
            </div>
          )}

          {drawOffer !== null && drawOffer.by === myColor && (
            <p className="online-copy online-copy--compact">
              Draw offer sent. Waiting for your opponent.
            </p>
          )}
        </div>
      ) : (
        <div className="online-lobby">
          <p className="online-copy">
            Signed in as <strong>{session?.username ?? "Player"}</strong>.
          </p>

          {profile !== null && (
            <p className="online-copy online-copy--compact">
              Rating {profile.rating} · {profile.wins}W {profile.losses}L{" "}
              {profile.draws}D
            </p>
          )}

          <label className="field">
            <span>Time control</span>
            <select
              value={timeControlId}
              onChange={(event) => setTimeControlId(event.target.value)}
              disabled={matchmaking}
            >
              {TIME_CONTROLS.map((control) => (
                <option key={control.id} value={control.id}>
                  {Math.round(control.initialMs / 60000)} min +{" "}
                  {Math.round(control.incrementMs / 1000)} sec
                </option>
              ))}
            </select>
          </label>

          <div className="online-actions online-actions--stack">
            <button
              type="button"
              className="action-button action-button--primary"
              onClick={() => void quickMatch()}
              disabled={matchmaking || matchId !== null}
            >
              {matchmaking
                ? `Searching… ${formatClock(matchmakingSeconds * 1000)}`
                : "Quick match"}
            </button>
            {matchmaking && (
              <button
                type="button"
                className="action-button"
                onClick={cancelQuickMatch}
              >
                Cancel search
              </button>
            )}
            <button
              type="button"
              className="action-button action-button--accent"
              onClick={() => void createAndInvite()}
              disabled={matchmaking || matchId !== null || creatingPrivate}
            >
              {creatingPrivate ? "Creating room…" : "Create & invite friend"}
            </button>
            <button
              type="button"
              className="action-button"
              onClick={() => void createPrivateMatch()}
              disabled={matchmaking || matchId !== null || creatingPrivate}
            >
              Create private match
            </button>
          </div>

          {matchmaking && (
            <p className="online-copy online-copy--compact" aria-live="polite">
              Waiting for an opponent with the same time control. A table is
              created only once both players are paired.
            </p>
          )}

          <form className="join-form" onSubmit={(event) => void submitJoin(event)}>
            <label className="field">
              <span>Join with room code</span>
              <input
                type="text"
                value={roomCodeInput}
                onChange={(event) => setRoomCodeInput(event.target.value)}
                placeholder="Paste a room code"
                spellCheck={false}
                disabled={matchmaking || matchId !== null}
              />
            </label>
            <button
              type="button"
              className="action-button"
              disabled={
                roomCodeInput.trim().length === 0 ||
                matchmaking ||
                matchId !== null
              }
              onClick={() => void joinByCode()}
            >
              Join by code
            </button>
            <label className="field">
              <span>Join with match ID</span>
              <input
                type="text"
                value={joinId}
                onChange={(event) => setJoinId(event.target.value)}
                placeholder="Paste a match ID"
                spellCheck={false}
                disabled={matchmaking || matchId !== null}
              />
            </label>
            <label className="spectator-toggle">
              <input
                type="checkbox"
                checked={joinAsSpectator}
                onChange={(event) => setJoinAsSpectator(event.target.checked)}
                disabled={matchmaking || matchId !== null}
              />
              <span>Join as spectator</span>
            </label>
            <button
              type="submit"
              className="action-button"
              disabled={
                joinId.trim().length === 0 ||
                matchmaking ||
                matchId !== null
              }
            >
              {joinAsSpectator ? "Watch" : "Join"}
            </button>
          </form>

          {matchId !== null && serverState === null && (
            <p className="online-copy online-copy--compact">
              Joining match {matchId}…
            </p>
          )}

          <button type="button" className="text-button" onClick={disconnect}>
            Disconnect
          </button>
        </div>
      )}

      {inviteTarget !== null && (
        <FriendInviteDialog
          open
          matchId={inviteTarget.matchId}
          spectate={inviteTarget.spectate}
          accountName={session?.username ?? null}
          friends={friends}
          loading={friendsLoading}
          loadError={friendsError}
          sendingId={inviteSendingId}
          inviteError={inviteError}
          inviteNotice={inviteNotice}
          onClose={closeFriendInvite}
          onRetry={() => void loadFriends()}
          onInvite={sendFriendInvite}
          onCopyInvite={() =>
            void copyText(
              buildMatchInviteUrl(
                inviteTarget.matchId,
                inviteTarget.spectate,
              ),
            ).then((copied) => {
              onNotify(
                copied ? "Invite link copied" : "Could not copy the invite link",
              );
            })
          }
        />
      )}
    </section>
  );
}
