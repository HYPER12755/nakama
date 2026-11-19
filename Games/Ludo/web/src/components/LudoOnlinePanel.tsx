import { useEffect, useState } from "react";
import { FriendInviteDialog, buildMatchInviteUrl, copyText } from "@moongames/game-ui";
import { PLAYER_COLOR_HEX, type LudoColor } from "@moongames/ludo-core";
import type { OnlineLudoController } from "../hooks/useOnlineLudo";
import { TURN_CLOCKS } from "../lib/preferences";
import { Icon } from "./Icon";

interface LudoOnlinePanelProps {
  online: OnlineLudoController;
  seats: number;
  roomInput: string;
  onRoomInput: (value: string) => void;
  onRematch: (seats: number, turnSeconds: number) => void;
  onNotify: (message: string) => void;
}

const STATUS_LABEL: Record<OnlineLudoController["connection"], string> = {
  offline: "Offline",
  connecting: "Connecting…",
  connected: "Connected",
  error: "Connection problem",
};

function formatClock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

async function writeClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const input = document.createElement("textarea");
    input.value = value;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    const ok = document.execCommand("copy");
    input.remove();
    return ok;
  }
}

/** The online table UI, following the lobby and roster language of Chess/Carrom. */
export function LudoOnlinePanel({
  online, seats, roomInput, onRoomInput, onRematch, onNotify,
}: LudoOnlinePanelProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [searchSeconds, setSearchSeconds] = useState(0);
  const [lobbySeats, setLobbySeats] = useState(seats);
  const [lobbyClock, setLobbyClock] = useState(0);
  const [inviteTarget, setInviteTarget] = useState<{
    matchId: string;
    spectate: boolean;
  } | null>(null);

  useEffect(() => {
    if (!online.searching) {
      setSearchSeconds(0);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      setSearchSeconds(Math.floor((Date.now() - started) / 1000));
    }, 500);
    return () => window.clearInterval(timer);
  }, [online.searching]);

  useEffect(() => {
    if (copied === null) return;
    const timer = window.setTimeout(() => setCopied(null), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy(label: string, value: string) {
    setCopied(await writeClipboard(value) ? label : "failed");
  }

  async function createPrivateAndInvite() {
    const matchId = await online.createPrivate(lobbySeats, lobbyClock);
    void online.loadFriends();
    setInviteTarget({ matchId, spectate: false });
  }

  const game = online.state?.game;
  const inMatch = online.state !== null;
  const colours: LudoColor[] = (game?.players.length
    ? game.players.slice(0, game.playerCount).map((player) => player.color)
    : (["red", "green", "yellow", "blue"] as LudoColor[]).slice(0, seats));
  const roster = colours.map((color) => {
    const seat = online.state?.seats.find((entry) => entry.colour === color);
    return { color, seat, me: seat?.user_id === online.myUserId };
  });
  const spectatorCount = online.state?.spectators.length ?? 0;

  return (
    <section className="panel online-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Online table</p>
          <h2>{inMatch ? "At the table" : "Find a game"}</h2>
        </div>
        <span className={`online-status online-status--${online.connection}`}>
          <span className="online-status__dot" />
          {STATUS_LABEL[online.connection]}
        </span>
      </div>

      <p className="online-account">
        {online.accountName ?? "Guest"}
        {online.myUserId ? <span className="online-seat__tag">signed in</span> : null}
      </p>

      {online.connection !== "connected" ? (
        <div className="online-banner" role="status">
          <Icon name="alert" size={16} />
          <span>{online.connection === "connecting" ? "Reaching the table…" : "The table is not connected."}</span>
          {online.connection !== "connecting" ? (
            <button type="button" className="mini-button" onClick={() => void online.connect()}>Connect</button>
          ) : null}
        </div>
      ) : null}

      {online.notice ? (
        <div className="online-banner online-banner--notice" role="status">
          <span>{online.notice}</span>
          <button type="button" className="mini-button" onClick={online.clearNotice}>Dismiss</button>
        </div>
      ) : null}

      {online.error ? (
        <div className="online-banner online-banner--error" role="alert">
          <Icon name="alert" size={16} />
          <span>{online.error}</span>
        </div>
      ) : null}

      {!inMatch ? (
        <>
          <p className="ludo-note">Players</p>
          <div className="pref-choices" role="radiogroup" aria-label="Players">
            {[2, 3, 4].map((count) => (
              <button
                key={count}
                type="button"
                role="radio"
                aria-checked={lobbySeats === count}
                className={`pref-choice${lobbySeats === count ? " is-chosen" : ""}`}
                onClick={() => setLobbySeats(count)}
              >
                {count}
              </button>
            ))}
          </div>

          <p className="ludo-note">Turn clock</p>
          <div className="pref-choices" role="radiogroup" aria-label="Online turn clock">
            {TURN_CLOCKS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                role="radio"
                aria-checked={lobbyClock === seconds}
                className={`pref-choice${lobbyClock === seconds ? " is-chosen" : ""}`}
                onClick={() => setLobbyClock(seconds)}
              >
                {seconds === 0 ? "Off" : `${seconds}s`}
              </button>
            ))}
          </div>

          <p className="ludo-note">Match</p>
          <div className="online-actions online-actions--stack">
            <button
              type="button"
              className="action-button action-button--primary"
              disabled={online.connection !== "connected" || (online.searching === false && online.matchId !== null)}
              onClick={() => void online.quickMatch(lobbySeats, lobbyClock)}
            >
              {online.searching
                ? `Searching… ${formatClock(searchSeconds)}`
                : `Quick match · ${lobbySeats}`}
            </button>
            {online.searching ? (
              <button type="button" className="action-button" onClick={() => void online.leave()}>
                Cancel search
              </button>
            ) : null}
          </div>
          <div className="toolbar-grid online-lobby-actions">
            <button
              type="button"
              className="action-button action-button--accent"
              disabled={online.connection !== "connected" || online.searching}
              onClick={() => void createPrivateAndInvite()}
            >
              Create & invite friend
            </button>
            <button
              type="button"
              className="action-button"
              disabled={online.connection !== "connected" || online.searching}
              onClick={() => onRematch(lobbySeats, lobbyClock)}
            >
              New table
            </button>
          </div>
          <p className="ludo-note">Join a room</p>
          <div className="invite-actions">
            <input
              className="room-input"
              value={roomInput}
              onChange={(event) => onRoomInput(event.target.value)}
              placeholder="Room code"
              aria-label="Room code"
            />
            <button
              type="button"
              className="mini-button"
              disabled={online.connection !== "connected"}
              onClick={() => void online.joinByCode(roomInput)}
            >
              Join
            </button>
            <button
              type="button"
              className="mini-button"
              disabled={online.connection !== "connected"}
              onClick={() => void online.joinByCode(roomInput, true)}
            >
              Watch
            </button>
          </div>
          <p className="online-hint">Private rooms give you a code to share. Watch joins as a spectator.</p>
        </>
      ) : (
        <div className="online-match">
          <div className="match-summary">
            <div><span className="field-label">Mode</span><strong>{online.roomCode !== null ? "Private" : "Quick"}</strong></div>
            <div><span className="field-label">Players</span><strong>{game?.playerCount ?? lobbySeats}</strong></div>
            <div>
              <span className="field-label">You</span>
              <strong>
                {online.spectating ? "Watching" : online.myColour ?? "—"}
              </strong>
            </div>
            <div><span className="field-label">Clock</span><strong>{lobbyClock === 0 ? "Off" : `${lobbyClock}s`}</strong></div>
          </div>

          <div className="match-code">
            <span className="field-label">Room code</span>
            <div className="match-code-row">
              <code>{online.roomCode ?? "—"}</code>
              <button type="button" className="mini-button" disabled={online.roomCode === null} onClick={() => void copy("room", online.roomCode ?? "")}>Copy</button>
            </div>
            <span className="field-label">Match ID</span>
            <div className="match-code-row">
              <code>{online.matchId ?? "—"}</code>
              <button type="button" className="mini-button" disabled={online.matchId === null} onClick={() => void copy("id", online.matchId ?? "")}>Copy</button>
            </div>
            <div className="invite-actions">
              {online.matchId !== null ? (
                <button
                  type="button"
                  className="mini-button mini-button--accent"
                  onClick={() => {
                    void online.loadFriends();
                    setInviteTarget({ matchId: online.matchId!, spectate: game !== null });
                  }}
                >
                  {game !== null ? "Invite a friend to watch" : "Invite a friend"}
                </button>
              ) : null}
              <button type="button" className="mini-button" onClick={() => void copy("link", `${window.location.origin}${window.location.pathname}?room=${online.roomCode ?? ""}`)}>
                {copied === "link" ? "Invite link copied" : "Copy invite link"}
              </button>
            </div>
          </div>

          <div className="online-players">
            {roster.map(({ color, seat, me }, index) => (
              <div key={`${color}-${index}`} className="online-player-row">
                <span
                  className={`seat-dot seat-dot--${color}`}
                  style={{ background: PLAYER_COLOR_HEX[color] }}
                />
                <span className="online-player-name">{seat?.username ?? "Open seat"}</span>
                {me ? <span className="online-seat__tag">you</span> : null}
                <span className={`online-player-connection${seat?.connected === false ? " online-player-connection--off" : ""}`}>
                  {seat ? seat.connected ? "online" : "offline" : "waiting"}
                </span>
              </div>
            ))}
          </div>

          <div className="online-spectators">
            <span className="field-label">Spectators ({spectatorCount})</span>
            <span className="online-spectator-names">
              {spectatorCount === 0
                ? "No one watching yet"
                : online.state?.spectators.map((entry) => entry.username).join(", ")}
            </span>
          </div>

          {!game ? (
            <p className="online-copy online-copy--compact">Waiting for the other players to join before the race begins.</p>
          ) : null}
          {online.spectating ? (
            <p className="online-copy online-copy--compact">You are watching this match. Tokens, dice and results update live.</p>
          ) : null}
          {online.state?.result ? (
            <p className="match-result">
              {online.state.result.winnerUserId === online.myUserId
                ? "You win"
                : `${online.state.seats.find((seat) => seat.colour === online.state?.result?.winnerColour)?.username ?? "Opponent"} wins`}
            </p>
          ) : null}

          <p className="ludo-note">Match actions</p>
          <div className="toolbar-grid">
            <button type="button" className="action-button" onClick={() => void online.leave()}>
              {online.spectating ? "Stop watching" : "Leave table"}
            </button>
            {online.spectating || !game ? null : (
              <button type="button" className="action-button action-button--danger" onClick={online.resign}>Resign</button>
            )}
          </div>
        </div>
      )}

      {inviteTarget !== null ? (
        <FriendInviteDialog
          open
          matchId={inviteTarget.matchId}
          spectate={inviteTarget.spectate}
          accountName={online.accountName}
          friends={online.friends}
          loading={online.friendsLoading}
          loadError={online.friendsError}
          sendingId={online.inviteSendingId}
          inviteError={online.inviteError}
          inviteNotice={online.inviteNotice}
          onClose={() => setInviteTarget(null)}
          onRetry={() => void online.loadFriends()}
          onInvite={async (friend) => {
            try {
              await online.inviteFriend({
                userId: friend.userId,
                username: friend.username,
                state: friend.state,
                matchId: inviteTarget.matchId,
                spectate: inviteTarget.spectate,
              });
              onNotify(`Invite sent to ${friend.username}`);
              return true;
            } catch {
              return false;
            }
          }}
          onCopyInvite={() => {
            void copyText(buildMatchInviteUrl(inviteTarget.matchId, inviteTarget.spectate)).then((copied) => {
              onNotify(copied ? "Invite link copied" : "Could not copy the invite link");
            });
          }}
        />
      ) : null}
    </section>
  );
}

interface LudoOnlineResultProps {
  winnerColour?: LudoColor;
  winnerName?: string;
  winnerUserId?: string;
  myUserId?: string | null;
  reason?: string;
  onRematch: () => void;
  onView: () => void;
  onLeave: () => void;
}

/** A table result dialog like Chess and Carrom use, without touching game rules. */
export function LudoOnlineResult({
  winnerColour, winnerName, winnerUserId, myUserId, reason, onRematch, onView, onLeave,
}: LudoOnlineResultProps) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const youWon = !!winnerUserId && winnerUserId === myUserId;
  const label = youWon ? "You win" : `${winnerName ?? (winnerColour ? `${winnerColour} player` : "The table")} wins`;
  const reasonText = reason === "resign"
    ? "The other player resigned."
    : reason === "timeout"
      ? "A turn clock ran out."
      : reason;
  return (
    <div className="winner-overlay winner-overlay--fixed" role="dialog" aria-label="Race result">
      <div className="winner-card">
        <span className="winner-card__icon" style={{ background: winnerColour ? PLAYER_COLOR_HEX[winnerColour] : undefined }}>
          <Icon name="trophy" size={28} />
        </span>
        <p className="eyebrow">Race complete</p>
        <h2>{label}</h2>
        {reasonText ? <p>{reasonText}</p> : null}
        <div className="winner-card__actions">
          <button type="button" className="button" onClick={onRematch}>Rematch</button>
          <button type="button" className="button button--ghost" onClick={() => { setOpen(false); onView(); }}>View board</button>
          <button type="button" className="button button--ghost" onClick={onLeave}>Leave</button>
        </div>
      </div>
    </div>
  );
}
