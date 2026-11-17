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
  const [watchId, setWatchId] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);

  const connected = online.connection === "connected";
  const inMatch = online.matchId !== null;
  // The server says how many players the table is for, so a player who
  // joined with a code is told the truth about the table.
  const tableSeats = online.roomSeats ?? seats;

  const openInvite = () => {
    online.clearInviteFeedback();
    setInviteOpen(true);
    void online.loadFriends();
  };

  /**
   * The room code is how the other player gets to this table, so it has to
   * be copyable. A failed copy is said out loud rather than swallowed.
   */
  const copyRoomCode = async () => {
    const code = online.roomCode;
    if (code === null) {
      return;
    }
    const copied = await copyText(code);
    online.setNotice(
      copied ? "Room code copied." : "The room code could not be copied.",
    );
  };

  /**
   * Joining a room with a code that is wrong has to say so. A silent
   * failure leaves the player staring at a lobby that never opens.
   */
  const joinRoom = async () => {
    const code = roomId.trim();
    if (code.length === 0) {
      return;
    }
    try {
      await online.joinByRoomCode(code);
      setRoomId("");
    } catch (cause) {
      online.setNotice(
        cause instanceof Error
          ? `That room could not be joined: ${cause.message}`
          : "That room could not be joined.",
      );
    }
  };

  /** The server already seats spectators; this is the way in from the lobby. */
  const watchTable = async () => {
    const id = watchId.trim();
    if (id.length === 0) {
      return;
    }
    try {
      await online.joinMatch(id, { spectator: true });
      setWatchId("");
    } catch (cause) {
      online.setNotice(
        cause instanceof Error
          ? `That table could not be watched: ${cause.message}`
          : "That table could not be watched.",
      );
    }
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
              ? online.latencyMs === null
                ? "Connected"
                : `Connected · ${online.latencyMs} ms`
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
                Join
              </button>
            </label>
            <label className="online-join">
              <span>Watch a table by id</span>
              <input
                type="text"
                value={watchId}
                placeholder="Paste a table id"
                onChange={(event) => setWatchId(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void watchTable();
                  }
                }}
              />
              <button
                type="button"
                className="button button--ghost"
                disabled={watchId.trim().length === 0}
                onClick={() => void watchTable()}
              >
                Watch
              </button>
            </label>
          </>
        ) : (
          <>
            {online.roomCode !== null ? (
              <div className="online-code">
                <span className="online-code__label">Room code</span>
                <div className="online-code__row">
                  <code>{online.roomCode}</code>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => void copyRoomCode()}
                  >
                    Copy
                  </button>
                </div>
                <p className="online-code__hint">
                  Send this code to the other player so they can join this
                  table. It is a {tableSeats} player table.
                </p>
              </div>
            ) : null}
            <ul className="online-seats">
              {online.seats.map((seat) => (
                <SeatRow
                  key={seat.user_id}
                  seat={seat}
                  isYou={seat.user_id === online.myUserId}
                />
              ))}
              {online.seats.length < tableSeats ? (
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
              {!online.spectating ? (
                <>
                  {online.drawOffer != null &&
                  online.drawOffer.by !== online.myUserId ? (
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={online.acceptDraw}
                    >
                      Accept draw
                    </button>
                  ) : online.drawOffer != null ? (
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={online.declineDraw}
                    >
                      Cancel draw
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={online.offerDraw}
                      disabled={online.result !== null}
                    >
                      Offer draw
                    </button>
                  )}
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={online.resign}
                    disabled={online.result !== null}
                  >
                    Resign
                  </button>
                </>
              ) : null}
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
