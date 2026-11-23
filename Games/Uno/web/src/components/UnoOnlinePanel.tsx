import { useEffect, useState } from "react";
import { FriendInviteDialog, buildMatchInviteUrl, copyText } from "@moongames/game-ui";
import { UNO_MODE } from "@moongames/uno-core";
import type { UnoController } from "../hooks/useUnoGame";
import { JUMP_IN_MODE, rulesModeLabel } from "../lib/view";

export interface UnoOnlinePanelProps {
  controller: UnoController;
  seats: number;
  roomInput: string;
  onRoomInput: (value: string) => void;
  onRematch: () => Promise<void> | void;
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

export function UnoOnlinePanel({
  controller, seats, roomInput, onRoomInput, onRematch, onNotify,
}: UnoOnlinePanelProps) {
  const [roomId, setRoomId] = useState(roomInput);
  const [joinAsWatcher, setJoinAsWatcher] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  useEffect(() => setRoomId(roomInput), [roomInput]);

  const connected = controller.connection === "connected";
  const result = controller.view.result;
  const inMatch = controller.view.started || result !== null;
  const spectating = controller.spectating;
  const inviteAsSpectator = spectating || inMatch;
  const winner = result?.winnerUserId == null
    ? null
    : controller.view.players.find((player) => player.userId === result.winnerUserId) ?? null;
  const shareMatchId = controller.matchId ?? "";
  const shareLink = buildMatchInviteUrl(shareMatchId, inviteAsSpectator, window.location.href);
  const effectiveMode = controller.view.mode ?? controller.rulesMode;
  const jumpIn = effectiveMode === JUMP_IN_MODE;
  const attack = effectiveMode === UNO_MODE.ATTACK;
  const noMercy = effectiveMode === UNO_MODE.NO_MERCY;
  const flip = effectiveMode === UNO_MODE.FLIP;

  async function joinRoom() {
    const code = roomId.trim();
    if (code.length === 0) {
      return;
    }
    onRoomInput(code);
    try {
      await controller.joinByCode(code, joinAsWatcher);
    } catch (cause) {
      onNotify(cause instanceof Error ? cause.message : "Could not join that room.");
    }
  }

  function openInvite() {
    if (controller.matchId === null) {
      onNotify("Create or join a room first.");
      return;
    }
    void controller.loadFriends();
    setInviteOpen(true);
  }

  async function copyInviteLink() {
    const copied = await copyText(shareLink);
    onNotify(copied ? "Invite link copied" : "Could not copy the invite link");
  }

  const statusLabel = connected
    ? "Connected"
    : controller.connection === "connecting"
      ? "Connecting…"
      : controller.connection === "error"
        ? "Offline"
        : "Not connected";

  return (
    <section className="panel online-panel">
      {!inMatch ? (
        <>
          <div className="panel-heading">
            <div><p className="eyebrow">Online</p><h2>Find a table</h2></div>
            <span className={`online-status online-status--${controller.connection}`}>{statusLabel}</span>
          </div>
          {controller.error !== null ? (
            <p className="online-feedback online-feedback--error" role="alert">{controller.error}</p>
          ) : null}
          {controller.notice !== null ? (
            <p className="online-feedback" role="status">{controller.notice}</p>
          ) : null}
          {!connected ? (
            <div className="online-connect">
              <p className="online-feedback">
                {controller.connection === "connecting"
                  ? "Connecting to MoonGames…"
                  : "MoonGames could not be reached."}
              </p>
              <button
                type="button"
                className="button button--primary"
                disabled={controller.connection === "connecting"}
                onClick={() => void controller.connect()}
              >
                {controller.connection === "connecting" ? "Connecting…" : "Try again"}
              </button>
            </div>
          ) : (
            <>
              <div className="online-size">
                <span className="online-size__label">Rules</span>
                <strong className="online-size__value">{controller.rulesModeLabel}</strong>
              </div>
              {jumpIn ? (
                <p className="online-mode-hint">Jump-In is on: play an exact colour and number match to jump into the turn.</p>
              ) : null}
              {attack ? (
                <p className="online-mode-hint">Attack is on: Hit cards make the target take the launcher or deflect; Wild Attack redirects the hit.</p>
              ) : null}
              {noMercy ? (
                <p className="online-mode-hint">No Mercy is on: draw until playable, stack equal or higher +2/+4/+6/+10, and drop out at 25 cards.</p>
              ) : null}
              {flip ? (
                <p className="online-mode-hint">Flip is on: a Flip card turns the table over to the dark side, swapping the colours to pink/teal/orange/purple and the actions to Draw Five, Skip Everyone and Wild Draw Color.</p>
              ) : null}
              <div className="online-size">
                <span className="online-size__label">Players</span>
                <div className="online-size__options" role="radiogroup" aria-label="Players">
                  {[2, 3, 4].map((count) => (
                    <button
                      type="button"
                      key={count}
                      role="radio"
                      aria-checked={seats === count}
                      className={`online-size__option${seats === count ? " online-size__option--active" : ""}`}
                      onClick={() => controller.setSeats(count)}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
              <div className="online-actions">
                <button
                  type="button"
                  className="button button--primary"
                  disabled={controller.searching}
                  onClick={() => void controller.quickMatch(seats)}
                >
                  {controller.searching ? <>Searching <SearchClock active /></> : "Quick match"}
                </button>
                {controller.searching ? (
                  <button type="button" className="button button--ghost" onClick={controller.cancelQuickMatch}>
                    Cancel search
                  </button>
                ) : null}
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => void controller.createPrivate(seats).catch((cause: unknown) => {
                    onNotify(cause instanceof Error ? cause.message : "The private room could not be created.");
                  })}
                >
                  Private room
                </button>
              </div>
              <div className="online-join">
                <label className="online-join__code">
                  <span>Room code</span>
                  <input
                    type="text"
                    value={roomId}
                    placeholder="Paste a room code"
                    onChange={(event) => {
                      setRoomId(event.target.value);
                      onRoomInput(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void joinRoom();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={roomId.trim().length === 0}
                    onClick={() => void joinRoom()}
                  >
                    {joinAsWatcher ? "Watch" : "Join"}
                  </button>
                </label>
                <label className="online-watch">
                  <input
                    type="checkbox"
                    checked={joinAsWatcher}
                    onChange={(event) => setJoinAsWatcher(event.target.checked)}
                  />
                  <span>Join as spectator</span>
                </label>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="panel-heading">
            <div><p className="eyebrow">Online</p><h2>{spectating ? "Watching" : "At the table"}</h2></div>
            <span className={`online-status online-status--${controller.connection}`}>{statusLabel}</span>
          </div>
          <div className="online-size">
            <span className="online-size__label">Rules</span>
            <strong className="online-size__value">{rulesModeLabel(controller.view.mode ?? controller.rulesMode)}</strong>
          </div>
          {jumpIn ? (
            <p className="online-mode-hint">Jump-In is on: an exact colour and number match can steal the turn.</p>
          ) : null}
          {attack ? (
            <p className="online-mode-hint">Attack is on: take the hit or deflect with a Hit or Wild Attack card.</p>
          ) : null}
          {noMercy ? (
            <p className="online-mode-hint">No Mercy is on: stack draw cards, choose colours for Wild Roulette, and survive to 25 cards.</p>
          ) : null}
          {flip ? (
            <p className="online-mode-hint">Flip is on: the {controller.view.flipSide === "dark" ? "dark" : "light"} side is active; Flip cards turn every card over.</p>
          ) : null}
          {controller.error !== null ? (
            <p className="online-feedback online-feedback--error" role="alert">{controller.error}</p>
          ) : null}
          {controller.notice !== null ? (
            <p className="online-feedback" role="status">{controller.notice}</p>
          ) : null}
          {controller.roomCode !== null ? (
            <div className="room-code-row">
              <div>
                <p className="eyebrow">Room code</p>
                <code>{controller.roomCode}</code>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => void copyText(controller.roomCode ?? "").then((copied) => {
                  onNotify(copied ? "Room code copied" : "Could not copy the room code");
                })}
                aria-label="Copy room code"
                title="Copy room code"
              >
                <span>⧉</span>
              </button>
            </div>
          ) : null}
          <div className="online-code">
            <span className="online-code__label">Invite link</span>
            <div className="online-code__row">
              <code>{shareMatchId.slice(0, 8)}</code>
              <button type="button" className="button button--ghost" onClick={() => void copyInviteLink()}>
                Copy link
              </button>
            </div>
            <p className="online-code__hint">
              Share this link to invite a player into this match{inviteAsSpectator ? " as a spectator" : ""}.
            </p>
          </div>
          <div className="online-seats">
            {controller.view.players.map((player) => (
              <div
                key={player.userId || player.seat}
                className={`online-seat${player.connected === false ? " online-seat--away" : ""}${player.out === true ? " online-seat--out" : ""}`}
              >
                <span className="online-seat__name">
                  {player.username}
                  {player.userId === controller.myUserId ? <small>you</small> : null}
                </span>
                <span className="online-seat__state">
                  {player.out === true ? "OUT" : player.connected === false ? "away" : `${player.count} cards`}
                </span>
              </div>
            ))}
          </div>
          {controller.view.spectators.length > 0 ? (
            <p className="online-spectators">
              {controller.view.spectators.length} watching
              {spectating ? " · you are watching" : ""}
            </p>
          ) : null}
          {result !== null ? (
            <p className="online-feedback" role="status">
              {result.winnerUserId === controller.myUserId
                ? "You win."
                : `${winner?.username ?? "Opponent"} wins.`}
              {result.reason ? ` ${result.reason}.` : ""}
            </p>
          ) : null}
          <div className="online-actions">
            <button type="button" className="button button--ghost" onClick={openInvite}>
              Invite friend
            </button>
            {!spectating && inMatch && result === null ? (
              <button type="button" className="button button--ghost" onClick={controller.resign}>
                Resign
              </button>
            ) : null}
            {result !== null && !spectating ? (
              <button
                type="button"
                className="button"
                onClick={() => {
                  void Promise.resolve(onRematch()).catch(() => undefined);
                }}
              >
                Rematch
              </button>
            ) : null}
            <button type="button" className="button button--ghost" onClick={() => void controller.leave()}>
              {spectating ? "Stop watching" : "Leave table"}
            </button>
          </div>
        </>
      )}
      {inviteOpen && controller.matchId !== null ? (
        <FriendInviteDialog
          open
          matchId={controller.matchId}
          spectate={inviteAsSpectator}
          accountName={controller.accountName}
          friends={controller.friends}
          loading={controller.friendsLoading}
          loadError={controller.friendsError}
          sendingId={controller.inviteSendingId}
          inviteError={controller.inviteError}
          inviteNotice={controller.inviteNotice}
          onClose={() => setInviteOpen(false)}
          onRetry={() => void controller.loadFriends()}
          onInvite={async (friend) => {
            try {
              await controller.inviteFriend({
                userId: friend.userId,
                username: friend.username,
                state: friend.state,
                matchId: controller.matchId ?? "",
                spectate: inviteAsSpectator,
              });
              onNotify(`Invite sent to ${friend.username}`);
              return true;
            } catch (cause) {
              onNotify(cause instanceof Error ? cause.message : "Could not send that friend invitation.");
              return false;
            }
          }}
          onCopyInvite={() => void copyInviteLink()}
        />
      ) : null}
    </section>
  );
}
