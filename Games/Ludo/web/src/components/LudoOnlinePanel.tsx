import { useEffect, useState } from "react";
import { PLAYER_COLOR_HEX, type LudoColor } from "@moongames/ludo-core";
import type { OnlineLudoController } from "../hooks/useOnlineLudo";
import { Icon } from "./Icon";

interface LudoOnlinePanelProps {
  online: OnlineLudoController;
  seats: number;
  roomInput: string;
  onRoomInput: (value: string) => void;
  onRematch: (seats: number) => void;
}

const STATUS_LABEL: Record<OnlineLudoController["connection"], string> = {
  offline: "Offline",
  connecting: "Connecting…",
  connected: "Connected",
  error: "Connection problem",
};

async function copyText(value: string): Promise<boolean> {
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
  online, seats, roomInput, onRoomInput, onRematch,
}: LudoOnlinePanelProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [searchSeconds, setSearchSeconds] = useState(0);
  const [lobbySeats, setLobbySeats] = useState(seats);

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
    if (await copyText(value)) setCopied(label);
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
          <p className="ludo-note">Private room players</p>
          <div className="pref-choices" role="radiogroup" aria-label="Private room players">
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

          <p className="ludo-note">Quick match</p>
          <div className="toolbar-grid">
            {[2, 3, 4].map((count) => (
              <button
                key={count}
                type="button"
                className="action-button"
                disabled={online.connection !== "connected" || online.searching}
                onClick={() => void online.quickMatch(count)}
              >
                Quick {count}
              </button>
            ))}
          </div>
          <div className="toolbar-grid online-lobby-actions">
            <button
              type="button"
              className="action-button action-button--accent"
              disabled={online.connection !== "connected" || online.searching}
              onClick={() => void online.createPrivate(lobbySeats)}
            >
              Private room
            </button>
            <button
              type="button"
              className="action-button"
              disabled={online.connection !== "connected" || online.searching}
              onClick={() => onRematch(lobbySeats)}
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
          {online.searching ? (
            <div className="online-search" role="status">
              <span className="online-search__pulse" />
              Looking for players · {searchSeconds}s
              <button type="button" className="mini-button" onClick={() => void online.leave()}>Stop</button>
            </div>
          ) : null}
          <p className="online-hint">Private rooms give you a code to share. Watch joins as a spectator.</p>
        </>
      ) : (
        <>
          {online.roomCode ? (
            <div className="copy-code">
              <div>
                <p className="eyebrow">Room code</p>
                <strong>{online.roomCode}</strong>
              </div>
              <button
                type="button"
                className="mini-button"
                onClick={() => void copy("room", online.roomCode!)}
                title="Copy room code"
              >
                <Icon name="copy" size={14} />
                {copied === "room" ? "Copied" : "Copy"}
              </button>
            </div>
          ) : null}

          {online.matchId ? (
            <button
              type="button"
              className="online-link"
              onClick={() => void copy("link", `${window.location.origin}${window.location.pathname}?room=${online.roomCode ?? ""}`)}
            >
              <Icon name="link" size={14} />
              {copied === "link" ? "Invite link copied" : "Copy invite link"}
            </button>
          ) : null}

          {!game ? (
            <div className="online-banner online-banner--notice" role="status">
              <Icon name="users" size={16} />
              <span>Waiting for the other players to join before the race begins.</span>
            </div>
          ) : null}

          <p className="ludo-note">Players</p>
          <div className="online-roster">
            {roster.length === 0 ? <p className="online-hint">Waiting for the table to seat players…</p> : null}
            {roster.map(({ color, seat, me }, index) => (
              <div className={`online-seat${seat?.connected === false ? " is-away" : ""}`} key={`${color}-${index}`}>
                <span className="online-seat__disc" style={{ background: PLAYER_COLOR_HEX[color as LudoColor] }} />
                <span className="online-seat__name">{seat?.username ?? "Open seat"}</span>
                {me ? <span className="online-seat__tag">you</span> : null}
                {seat ? (
                  <span className="online-seat__state">{seat.connected ? "here" : "away"}</span>
                ) : (
                  <span className="online-seat__state">waiting</span>
                )}
              </div>
            ))}
          </div>

          {spectatorCount > 0 ? (
            <p className="online-hint">
              {online.spectating ? "You are watching · " : ""}
              {spectatorCount} spectator{spectatorCount === 1 ? "" : "s"} at the table
            </p>
          ) : null}
          {online.spectating ? <p className="online-banner online-banner--notice">You are watching this table.</p> : null}

          <p className="ludo-note">Match actions</p>
          <div className="toolbar-grid">
            <button type="button" className="action-button" onClick={() => void online.leave()}>
              {online.spectating ? "Stop watching" : "Leave table"}
            </button>
            {online.spectating || !game ? null : (
              <button type="button" className="action-button action-button--danger" onClick={online.resign}>Resign</button>
            )}
          </div>
        </>
      )}
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
