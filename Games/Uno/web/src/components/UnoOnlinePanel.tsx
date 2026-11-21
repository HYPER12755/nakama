import { useEffect, useState } from "react";
import { FriendInviteDialog, buildMatchInviteUrl, copyText } from "@moongames/game-ui";
import type { UnoController } from "../hooks/useUnoGame";

export interface UnoOnlinePanelProps {
  controller: UnoController;
  seats: number;
  roomInput: string;
  onRoomInput: (value: string) => void;
  onRematch: () => void;
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
  controller, seats, roomInput, onRoomInput, onNotify,
}: UnoOnlinePanelProps) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roomId, setRoomId] = useState(roomInput);
  useEffect(() => setRoomId(roomInput), [roomInput]);
  const inMatch = controller.view.started;
  const joinRoom = () => {
    if (roomId.trim().length === 0) {
      return;
    }
    void controller.joinByCode(roomId);
  };
  const shareLink = buildMatchInviteUrl(
    controller.roomCode ?? controller.matchId ?? "",
    false,
    window.location.href,
  );

  return (
    <section className="panel online-panel">
      {!inMatch ? (
        <>
          <div className="panel-heading">
            <div><p className="eyebrow">Online</p><h2>Find a table</h2></div>
            <span className="panel-heading__meta">{controller.connection}</span>
          </div>
          <p className="ludo-note">Players</p>
          <div className="pref-choices" role="radiogroup" aria-label="Players">
            {[2, 3, 4].map((count) => (
              <button
                type="button"
                key={count}
                role="radio"
                aria-checked={seats === count}
                className={`pref-choice${seats === count ? " is-chosen" : ""}`}
                onClick={() => controller.setSeats(count)}
              >
                {count} players
              </button>
            ))}
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
                Cancel
              </button>
            ) : null}
            <button type="button" className="button button--ghost" onClick={() => void controller.createPrivate(seats)}>
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
                    joinRoom();
                  }
                }}
              />
              <button
                type="button"
                className="button button--ghost"
                disabled={roomId.trim().length === 0}
                onClick={joinRoom}
              >
                Join
              </button>
            </label>
          </div>
        </>
      ) : (
        <>
          <div className="panel-heading">
            <div><p className="eyebrow">Online</p><h2>At the table</h2></div>
            <span className="panel-heading__meta">{seats} players</span>
          </div>
          {controller.roomCode !== null ? (
            <div className="room-code-row">
              <code>{controller.roomCode}</code>
              <button
                type="button"
                className="icon-button"
                onClick={() => void copyText(shareLink).then(() => onNotify("Invite link copied"))}
                aria-label="Copy invite link"
              >
                <span>⧉</span>
              </button>
            </div>
          ) : null}
          <div className="online-actions">
            <button type="button" className="button button--ghost" onClick={() => setInviteOpen(true)}>
              Invite friend
            </button>
            <button type="button" className="button button--ghost" onClick={() => void controller.leave()}>
              Leave table
            </button>
          </div>
        </>
      )}
      {inviteOpen ? (
        <FriendInviteDialog
          open={inviteOpen}
          matchId={controller.matchId ?? ""}
          spectate={false}
          accountName={null}
          friends={[]}
          loading={false}
          loadError={null}
          sendingId={null}
          inviteError={null}
          inviteNotice={null}
          onClose={() => setInviteOpen(false)}
          onRetry={() => undefined}
          onInvite={async () => false}
          onCopyInvite={() => undefined}
        />
      ) : null}
    </section>
  );
}
