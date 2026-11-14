import { useState } from "react";
import {
  PLAYER_LABEL,
  TABLE_SIZES as CORE_TABLE_SIZES,
  type CarromPlayer,
} from "@moongames/carrom-core";
import { FriendInviteDialog, buildMatchInviteUrl } from "@moongames/game-ui";
import { copyText } from "@moongames/game-ui";
import type {
  CarromSeat,
  CarromTableSettings,
  OnlineCarromController,
} from "../hooks/useOnlineCarrom";
import { Icon } from "./Icon";

const TABLE_SIZES = CORE_TABLE_SIZES;

export interface OnlinePanelProps {
  online: OnlineCarromController;
  seats: number;
  onSeatsChange: (seats: number) => void;
  /** The table settings the room is created with. */
  settings?: CarromTableSettings;
}

function SeatRow({
  seat,
  isYou,
}: {
  seat: CarromSeat;
  isYou: boolean;
}) {
  return (
    <li className={`online-seat${seat.connected ? "" : " online-seat--away"}`}>
      <span className={`online-seat__disc online-seat__disc--${seat.colour}`} />
      <span className="online-seat__name">
        {seat.username}
        {isYou ? <small>you</small> : null}
      </span>
      <span className="online-seat__colour">
        {PLAYER_LABEL[seat.colour as CarromPlayer]}
      </span>
    </li>
  );
}

export function OnlinePanel({
  online,
  seats,
  onSeatsChange,
  settings,
}: OnlinePanelProps) {
  const [roomId, setRoomId] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);

  const connected = online.connection === "connected";
  const inMatch = online.matchId !== null;

  const openInvite = () => {
    online.clearInviteFeedback();
    setInviteOpen(true);
    void online.loadFriends();
  };

  return (
    <div className="online-panel">
      <section className="panel online-lobby">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Online table</p>
            <h2>{inMatch ? "Room" : "Find a table"}</h2>
          </div>
          <span className={`online-status online-status--${online.connection}`}>
            {online.connection === "connected"
              ? "Connected"
              : online.connection === "connecting"
                ? "Connecting…"
                : online.connection === "error"
                  ? "Offline"
                  : "Not connected"}
          </span>
        </div>

        {online.error !== null ? (
          <p className="online-feedback online-feedback--error" role="alert">
            {online.error}
          </p>
        ) : null}
        {online.notice !== null ? (
          <p className="online-feedback" role="status">
            {online.notice}
          </p>
        ) : null}

        {!connected ? (
          <div className="online-connect">
            <p className="online-feedback">
              {online.connection === "connecting"
                ? "Connecting to MoonGames…"
                : "MoonGames could not be reached."}
            </p>
            <button
              type="button"
              className="button button--primary"
              onClick={() => void online.connect()}
              disabled={online.connection === "connecting"}
            >
              <Icon name="users" size={16} />
              {online.connection === "connecting" ? "Connecting…" : "Try again"}
            </button>
          </div>
        ) : !inMatch ? (
          <>
            <div className="online-size">
              <span className="online-size__label">Players</span>
              <div className="online-size__options" role="radiogroup">
                {TABLE_SIZES.map((size) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={seats === size}
                    className={`online-size__option${seats === size ? " online-size__option--active" : ""}`}
                    key={size}
                    onClick={() => onSeatsChange(size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
            <div className="online-actions">
              <button
                type="button"
                className="button button--primary"
                disabled={online.searching}
                onClick={() => void online.quickMatch(seats, settings)}
              >
                {online.searching ? "Searching…" : "Quick match"}
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => void online.createPrivateRoom(seats, settings)}
              >
                Private room
              </button>
            </div>
            <label className="online-join">
              <span>Room code</span>
              <input
                type="text"
                value={roomId}
                placeholder="Paste a room code"
                onChange={(event) => setRoomId(event.target.value)}
              />
              <button
                type="button"
                className="button button--ghost"
                disabled={roomId.trim().length === 0}
                onClick={() => void online.joinMatch(roomId.trim())}
              >
                Join
              </button>
            </label>
          </>
        ) : (
          <>
            <ul className="online-seats">
              {online.seats.map((seat) => (
                <SeatRow
                  key={seat.user_id}
                  seat={seat}
                  isYou={seat.user_id === online.myUserId}
                />
              ))}
              {online.seats.length < seats ? (
                <li className="online-seat online-seat--empty">
                  <span className="online-seat__disc online-seat__disc--empty" />
                  <span className="online-seat__name">Waiting for a player…</span>
                </li>
              ) : null}
            </ul>
            {online.spectators.length > 0 ? (
              <p className="online-spectators">
                {online.spectators.length} watching the table
              </p>
            ) : null}
            <div className="online-actions">
              <button
                type="button"
                className="button button--ghost"
                onClick={openInvite}
              >
                <Icon name="users" size={16} />
                Invite a friend
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => void online.leaveMatch()}
              >
                Leave the table
              </button>
            </div>
          </>
        )}
      </section>

      {inviteOpen && online.matchId !== null ? (
        <FriendInviteDialog
          open
          matchId={online.matchId}
          spectate={false}
          accountName={online.account?.username ?? null}
          friends={online.friends}
          loading={online.friendsLoading}
          loadError={online.friendsError}
          sendingId={online.inviteSendingId}
          inviteError={online.inviteError}
          inviteNotice={online.inviteNotice}
          onClose={() => {
            setInviteOpen(false);
            online.clearInviteFeedback();
          }}
          onRetry={() => void online.loadFriends()}
          onInvite={async (friend) =>
            online.inviteFriend({
              userId: friend.userId,
              username: friend.username,
              state: friend.state,
            })
          }
          onCopyInvite={() => {
            void copyText(buildMatchInviteUrl(online.matchId ?? "")).then(
              (copied) => {
                online.setNotice(
                  copied ? "Invite link copied." : "The link could not be copied.",
                );
              },
            );
          }}
        />
      ) : null}
    </div>
  );
}
