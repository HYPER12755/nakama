import { useState } from "react";
import { PLAYER_LABEL, type CarromPlayer } from "@moongames/carrom-core";
import type {
  CarromChatMessage,
  CarromSeat,
  OnlineCarromController,
} from "../hooks/useOnlineCarrom";
import { EmojiPicker } from "./EmojiPicker";
import { Icon } from "./Icon";

const TABLE_SIZES = [2, 3, 4];

export interface OnlinePanelProps {
  online: OnlineCarromController;
  seats: number;
  onSeatsChange: (seats: number) => void;
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

function ChatEntry({ message }: { message: CarromChatMessage }) {
  return (
    <li className="online-chat__message">
      <span className="online-chat__author">{message.username}</span>
      <span className="online-chat__text">{message.text}</span>
    </li>
  );
}

export function OnlinePanel({
  online,
  seats,
  onSeatsChange,
}: OnlinePanelProps) {
  const [roomId, setRoomId] = useState("");
  const [message, setMessage] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);

  const connected = online.connection === "connected";
  const inMatch = online.matchId !== null;

  const send = () => {
    const text = message.trim();
    if (text.length === 0) {
      return;
    }
    online.sendChat(text);
    setMessage("");
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
          <button
            type="button"
            className="button button--primary"
            onClick={() => void online.connect()}
          >
            <Icon name="users" size={16} />
            Connect to MoonGames
          </button>
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
                onClick={() => void online.quickMatch(seats)}
              >
                {online.searching ? "Searching…" : "Quick match"}
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => void online.createPrivateRoom(seats)}
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
            <button
              type="button"
              className="button button--ghost"
              onClick={() => void online.leaveMatch()}
            >
              Leave the table
            </button>
          </>
        )}
      </section>

      {inMatch ? (
        <section className="panel online-chat">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Table chat</p>
              <h2>Say hello</h2>
            </div>
          </div>
          <ul className="online-chat__list">
            {online.chat.length === 0 ? (
              <li className="online-chat__empty">No messages yet.</li>
            ) : (
              online.chat.map((entry) => (
                <ChatEntry key={entry.id} message={entry} />
              ))
            )}
          </ul>
          <div className="online-chat__compose">
            <input
              type="text"
              value={message}
              maxLength={240}
              placeholder="Message the table"
              aria-label="Message the table"
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  send();
                }
              }}
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Add an emoji"
              onClick={() => setEmojiOpen((open) => !open)}
            >
              <Icon name="sparkles" size={17} />
            </button>
            <button
              type="button"
              className="button button--primary online-chat__send"
              disabled={message.trim().length === 0}
              onClick={send}
            >
              <Icon name="send" size={15} />
            </button>
            {emojiOpen ? (
              <EmojiPicker
                onPick={(emoji) => setMessage((current) => `${current}${emoji}`)}
                onClose={() => setEmojiOpen(false)}
              />
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
