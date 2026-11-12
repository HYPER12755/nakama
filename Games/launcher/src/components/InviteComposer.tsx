import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { GameCatalogEntry } from "@moongames/game-sdk";
import { Icon, gameIconName } from "./Icon";

export interface InviteComposerTarget {
  userId: string;
  username: string;
}

export interface InviteComposerInput {
  gameId: string;
  timeControl?: string;
  message?: string;
}

const CHESS_TIME_CONTROLS = [
  { id: "5+0", label: "5 min" },
  { id: "10+0", label: "10 min" },
  { id: "15+10", label: "15 | 10" },
  { id: "30+0", label: "30 min" },
];

export interface InviteComposerProps {
  target: InviteComposerTarget;
  games: GameCatalogEntry[];
  busy: boolean;
  error: string | null;
  notice: string | null;
  onClose: () => void;
  onSend: (input: InviteComposerInput) => Promise<void>;
}

export function InviteComposer({
  target,
  games,
  busy,
  error,
  notice,
  onClose,
  onSend,
}: InviteComposerProps) {
  const available = useMemo(
    () => games.filter((game) => game.status === "available"),
    [games],
  );
  const [gameId, setGameId] = useState(available[0]?.id ?? "chess");
  const [timeControl, setTimeControl] = useState("5+0");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [busy, onClose]);

  const selected = available.find((game) => game.id === gameId) ?? available[0] ?? null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selected === null || busy) {
      return;
    }
    void onSend({
      gameId: selected.id,
      ...(selected.id === "chess" ? { timeControl } : {}),
      ...(message.trim().length > 0 ? { message: message.trim() } : {}),
    });
  };

  return (
    <div
      className="invite-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <form className="invite-composer" onSubmit={submit} role="dialog" aria-modal="true" aria-label="Send a game invite">
        <header className="invite-composer__header">
          <span className="invite-composer__mark" aria-hidden="true">
            <Icon name="gamepad" size={22} />
          </span>
          <div>
            <h2>Invite {target.username}</h2>
            <p>Choose a table. They will get a MoonGames alert and a room card in chat.</p>
          </div>
          <button
            className="account-icon-button"
            type="button"
            aria-label="Close invite composer"
            disabled={busy}
            onClick={onClose}
          >
            <Icon name="x" size={18} />
          </button>
        </header>

        {available.length === 0 ? (
          <p className="drawer-feedback drawer-feedback--error" role="alert">
            No games are ready to invite right now.
          </p>
        ) : (
          <>
            <fieldset className="invite-composer__games">
              <legend>Game</legend>
              <div className="invite-game-grid">
                {available.map((game) => (
                  <label
                    className={
                      game.id === selected?.id
                        ? "invite-game-option invite-game-option--active"
                        : "invite-game-option"
                    }
                    key={game.id}
                  >
                    <input
                      type="radio"
                      name="invite-game"
                      value={game.id}
                      checked={game.id === selected?.id}
                      onChange={() => setGameId(game.id)}
                    />
                    <span className="invite-game-option__icon" aria-hidden="true">
                      <Icon name={gameIconName(game.icon)} size={22} />
                    </span>
                    <span>
                      <strong>{game.name}</strong>
                      <small>{game.tagline}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {selected?.id === "chess" ? (
              <fieldset className="invite-composer__time">
                <legend>Time control</legend>
                <div className="invite-time-grid">
                  {CHESS_TIME_CONTROLS.map((control) => (
                    <label
                      className={
                        control.id === timeControl
                          ? "invite-time-option invite-time-option--active"
                          : "invite-time-option"
                      }
                      key={control.id}
                    >
                      <input
                        type="radio"
                        name="invite-time"
                        value={control.id}
                        checked={control.id === timeControl}
                        onChange={() => setTimeControl(control.id)}
                      />
                      <Icon name="clock" size={15} />
                      {control.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <label className="invite-composer__message">
              <span>Message <small>optional</small></span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={240}
                rows={3}
                placeholder="Add a short note for the table."
              />
              <small>{message.length}/240</small>
            </label>
          </>
        )}

        {error !== null ? (
          <p className="drawer-feedback drawer-feedback--error" role="alert">
            {error}
          </p>
        ) : null}
        {notice !== null ? (
          <p className="drawer-feedback drawer-feedback--success" role="status">
            {notice}
          </p>
        ) : null}

        <footer className="invite-composer__footer">
          <button
            className="button button--ghost"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button button--primary"
            type="submit"
            disabled={busy || selected === null}
          >
            <Icon name="send" size={16} />
            {busy ? "Creating room…" : "Send invite"}
          </button>
        </footer>
      </form>
    </div>
  );
}
