import { useEffect, useState } from "react";
import { FriendInviteDialog, buildMatchInviteUrl, copyText } from "@moongames/game-ui";
import { PLAYER_COLOR_HEX, type LudoColor } from "@moongames/ludo-core";
import type { OnlineLudoController } from "../hooks/useOnlineLudo";
import { TURN_CLOCKS } from "../lib/preferences";
import { Icon } from "./Icon";

export interface LudoOnlinePanelProps {
  online: OnlineLudoController;
  seats: number;
  roomInput: string;
  onRoomInput: (value: string) => void;
  onRematch: (seats: number, turnSeconds: number) => void;
  onNotify: (message: string) => void;
}

function SearchClock({ active }: { active: boolean }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - started) / 1000));
    }, 250);
    return () => window.clearInterval(timer);
  }, [active]);
  return <>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</>;
}

/** The Ludo online lobby, following Carrom's online panel structure exactly. */
export function LudoOnlinePanel({
  online, seats, roomInput, onRoomInput, onRematch, onNotify,
}: LudoOnlinePanelProps) {
  const [roomId, setRoomId] = useState(roomInput);
  const [joinAsWatcher, setJoinAsWatcher] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [lobbySeats, setLobbySeats] = useState(seats);
  const [lobbyClock, setLobbyClock] = useState(0);

  useEffect(() => setRoomId(roomInput), [roomInput]);

  useEffect(() => {
    const open = () => {
      if (online.matchId !== null) {
        void online.loadFriends();
        setInviteOpen(true);
      }
    };
    window.addEventListener("ludo:open-invite", open);
    return () => window.removeEventListener("ludo:open-invite", open);
  }, [online.matchId]);

  const connected = online.connection === "connected";
  const inMatch = online.state !== null;
  const game = online.state?.game;
  const colours: LudoColor[] = (game?.players.length
    ? game.players.slice(0, game.playerCount).map((player) => player.color)
    : (["red", "green", "yellow", "blue"] as LudoColor[]).slice(0, lobbySeats));

  async function copyRoomCode() {
    if (online.roomCode === null) return;
    const copied = await copyText(online.roomCode);
    onNotify(copied ? "Room code copied." : "Could not copy the room code.");
  }

  async function createPrivateAndInvite() {
    await online.createPrivate(lobbySeats, lobbyClock);
    void online.loadFriends();
    setInviteOpen(true);
  }

  async function joinRoom() {
    const code = roomId.trim();
    if (code.length === 0) return;
    onRoomInput(code);
    await online.joinByCode(code, joinAsWatcher);
  }

  return (
    <div className="online-panel">
      <section className="panel online-lobby">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Online table</p>
            <h2>{inMatch ? "Room" : "Find a table"}</h2>
          </div>
          <span className={`online-status online-status--${online.connection}`}>
            {connected ? "Connected"
              : online.connection === "connecting" ? "Connecting…"
                : online.connection === "error" ? "Offline" : "Not connected"}
          </span>
        </div>

        {online.error !== null ? (
          <p className="online-feedback online-feedback--error" role="alert">{online.error}</p>
        ) : null}
        {online.notice !== null ? (
          <p className="online-feedback" role="status">{online.notice}</p>
        ) : null}

        {!connected ? (
          <div className="online-connect">
            <p className="online-feedback">
              {online.connection === "connecting" ? "Connecting to MoonGames…" : "MoonGames could not be reached."}
            </p>
            <button type="button" className="button button--primary" onClick={() => void online.connect()} disabled={online.connection === "connecting"}>
              <Icon name="users" size={16} />
              {online.connection === "connecting" ? "Connecting…" : "Try again"}
            </button>
          </div>
        ) : !inMatch ? (
          <>
            <div className="online-size">
              <span className="online-size__label">Players</span>
              <div className="online-size__options" role="radiogroup">
                {[2, 3, 4].map((size) => (
                  <button
                    key={size}
                    type="button"
                    role="radio"
                    aria-checked={lobbySeats === size}
                    className={`online-size__option${lobbySeats === size ? " online-size__option--active" : ""}`}
                    onClick={() => setLobbySeats(size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
            <div className="online-size online-size--clock">
              <span className="online-size__label">Turn clock</span>
              <div className="online-size__options" role="radiogroup" aria-label="Online turn clock">
                {TURN_CLOCKS.map((seconds) => (
                  <button
                    key={seconds}
                    type="button"
                    role="radio"
                    aria-checked={lobbyClock === seconds}
                    className={`online-size__option${lobbyClock === seconds ? " online-size__option--active" : ""}`}
                    onClick={() => setLobbyClock(seconds)}
                  >
                    {seconds === 0 ? "Off" : `${seconds}s`}
                  </button>
                ))}
              </div>
            </div>
            <div className="online-actions">
              <button
                type="button"
                className="button button--primary"
                disabled={online.searching}
                onClick={() => void online.quickMatch(lobbySeats, lobbyClock)}
              >
                {online.searching ? (
                  <>Searching <SearchClock active={online.searching} /></>
                ) : (
                  "Quick match"
                )}
              </button>
              {online.searching ? (
                <button type="button" className="button button--ghost" onClick={online.cancelQuickMatch}>
                  Cancel search
                </button>
              ) : null}
              <button type="button" className="button button--ghost" onClick={() => void createPrivateAndInvite()}>
                Create & invite friend
              </button>
              <button type="button" className="button button--ghost" onClick={() => void onRematch(lobbySeats, lobbyClock)}>
                New table
              </button>
            </div>
            <div className="online-join">
              <label className="online-join__code">
                <span>Room code</span>
                <input
                  type="text"
                  value={roomId}
                  placeholder="Paste a room code"
                  onChange={(event) => { setRoomId(event.target.value); onRoomInput(event.target.value); }}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void joinRoom(); } }}
                />
                <button type="button" className="button button--ghost" disabled={roomId.trim().length === 0} onClick={() => void joinRoom()}>
                  {joinAsWatcher ? "Watch" : "Join"}
                </button>
              </label>
              <label className="online-watch">
                <input type="checkbox" checked={joinAsWatcher} onChange={(event) => setJoinAsWatcher(event.target.checked)} />
                <span>Join as spectator</span>
              </label>
            </div>
          </>
        ) : (
          <>
            {online.roomCode !== null ? (
              <div className="online-code">
                <span className="online-code__label">Room code</span>
                <div className="online-code__row">
                  <code>{online.roomCode}</code>
                  <button type="button" className="button button--ghost" onClick={() => void copyRoomCode()}>Copy</button>
                </div>
                <p className="online-code__hint">Send this code to the other player so they can join this table. It is a {game?.playerCount ?? lobbySeats} player table.</p>
              </div>
            ) : null}

            <ul className="online-seats">
              {colours.map((color, index) => {
                const seat = online.state?.seats.find((entry) => entry.colour === color);
                return (
                  <li key={`${color}-${index}`} className={`online-seat${seat?.connected === false ? " online-seat--away" : ""}`}>
                    <span className="online-seat__disc" style={{ background: PLAYER_COLOR_HEX[color] }} />
                    <span className="online-seat__name">
                      {seat?.username ?? "Waiting for a player…"}
                      {seat?.user_id === online.myUserId ? <small>you</small> : null}
                    </span>
                    <span className="online-seat__colour">{color}</span>
                  </li>
                );
              })}
            </ul>

            {online.state?.spectators.length ? (
              <p className="online-spectators">
                {online.state.spectators.length} watching the table
                {online.spectating ? " · you are watching" : ""}
              </p>
            ) : null}

            {!game ? <p className="online-feedback">Waiting for the other players to join before the race begins.</p> : null}
            {online.state?.result ? (
              <p className="online-feedback">
                {online.state.result.winnerUserId === online.myUserId
                  ? "You win."
                  : `${online.state.seats.find((seat) => seat.colour === online.state?.result?.winnerColour)?.username ?? "Opponent"} wins.`}
              </p>
            ) : null}

            <div className="online-actions">
              <button type="button" className="button button--ghost" onClick={() => { void online.loadFriends(); setInviteOpen(true); }}>
                <Icon name="users" size={16} /> Invite a friend
              </button>
              {!online.spectating && game ? (
                <>
                  <button type="button" className="button button--ghost" onClick={online.resign}>Resign</button>
                </>
              ) : null}
              <button type="button" className="button button--ghost" onClick={() => void online.leave()}>
                {online.spectating ? "Stop watching" : "Leave the table"}
              </button>
            </div>
          </>
        )}
      </section>

      {inviteOpen && online.matchId !== null ? (
        <FriendInviteDialog
          open
          matchId={online.matchId}
          spectate={game !== null || online.spectating}
          accountName={online.accountName}
          friends={online.friends}
          loading={online.friendsLoading}
          loadError={online.friendsError}
          sendingId={online.inviteSendingId}
          inviteError={online.inviteError}
          inviteNotice={online.inviteNotice}
          onClose={() => setInviteOpen(false)}
          onRetry={() => void online.loadFriends()}
          onInvite={async (friend) => {
            try {
              await online.inviteFriend({
                userId: friend.userId,
                username: friend.username,
                state: friend.state,
                matchId: online.matchId!,
                spectate: game !== null || online.spectating,
              });
              onNotify(`Invite sent to ${friend.username}`);
              return true;
            } catch {
              return false;
            }
          }}
          onCopyInvite={() => {
            void copyText(buildMatchInviteUrl(online.matchId!, game !== null || online.spectating)).then((copied) => {
              onNotify(copied ? "Invite link copied" : "Could not copy the invite link");
            });
          }}
        />
      ) : null}
    </div>
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

/** Table result dialog, built like Chess and Carrom's game-over dialogs. */
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
