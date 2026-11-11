import { useState, type FormEvent } from "react";
import type { OnlineChessController } from "../hooks/useOnlineChess";
import { copyText } from "../lib/clipboard";
import { buildMatchInviteUrl } from "../lib/invite";
import { TIME_CONTROLS, formatClock } from "../lib/onlineProtocol";

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
  const [joinAsSpectator, setJoinAsSpectator] = useState(false);
  const {
    connection,
    session,
    serverAddress,
    setServerAddress,
    timeControlId,
    setTimeControlId,
    matchId,
    serverState,
    players,
    spectators,
    spectating,
    myColor,
    drawOffer,
    matchmaking,
    matchmakingSeconds,
    profile,
    connect,
    disconnect,
    quickMatch,
    cancelQuickMatch,
    createPrivateMatch,
    joinMatch,
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
            <span className="field-label">Match ID</span>
            <div className="match-code-row">
              <code>{matchId}</code>
              <button type="button" className="mini-button" onClick={() => void copyMatchId()}>
                Copy
              </button>
            </div>
            <div className="invite-actions">
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
                ? "Share the invite link or match ID with your opponent. White stays reserved for the match creator."
                : "This quick table is open. Another player searching the same time control will join automatically, or share the invite link."}
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
              className="action-button"
              onClick={() => void createPrivateMatch()}
              disabled={matchmaking || matchId !== null}
            >
              Create private match
            </button>
          </div>

          {matchmaking && (
            <p className="online-copy online-copy--compact" aria-live="polite">
              Pairing you with the same time control. If nobody is waiting, a
              quick table opens so the next player can join.
            </p>
          )}

          <form className="join-form" onSubmit={(event) => void submitJoin(event)}>
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
    </section>
  );
}
