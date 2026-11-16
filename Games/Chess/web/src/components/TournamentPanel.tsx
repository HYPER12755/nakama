import { useCallback, useEffect, useState } from "react";
import {
  pointsText,
  type Tournament,
  type TournamentPlayer,
} from "../lib/tournaments";
import { Icon } from "./Icon";

export interface TournamentPanelProps {
  /** The tournaments there are. */
  onList: () => Promise<Tournament[]>;
  /** Make a tournament. */
  onCreate: (input: {
    name: string;
    rounds: number;
    timeControl: { initialMs: number; incrementMs: number };
  }) => Promise<{ ok: boolean; tournament: Tournament | null; message: string | null }>;
  /** Take a seat in a tournament. */
  onJoin: (id: string) => Promise<{ ok: boolean; message: string | null }>;
  /** Leave a tournament. */
  onLeave: (id: string) => Promise<{ ok: boolean; message: string | null }>;
  /** Begin a tournament. */
  onStart: (id: string) => Promise<{ ok: boolean; message: string | null }>;
  /** Open the game of a round. */
  onPlay: (matchId: string) => void;
  /** The account of the player, so their own row is known. */
  userId: string | null;
  /** Called when the panel is closed. */
  onClose: () => void;
}

const TIME_CONTROLS = [
  { label: "3 + 2", initialMs: 180000, incrementMs: 2000 },
  { label: "5 + 0", initialMs: 300000, incrementMs: 0 },
  { label: "10 + 0", initialMs: 600000, incrementMs: 0 },
];

/**
 * The tournaments.
 *
 * This is lichess's tournament: a number of rounds in which everybody
 * plays one game in every round. The standings are kept by the server,
 * and the games are ordinary games of chess.
 */
export function TournamentPanel({
  onList,
  onCreate,
  onJoin,
  onLeave,
  onStart,
  onPlay,
  userId,
  onClose,
}: TournamentPanelProps) {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selected, setSelected] = useState<Tournament | null>(null);
  const [name, setName] = useState("");
  const [rounds, setRounds] = useState(3);
  const [timeControl, setTimeControl] = useState(TIME_CONTROLS[0]);
  const [making, setMaking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const list = await onList();
    setTournaments(list);
    setSelected((current) => {
      if (current === null) {
        return current;
      }
      return list.find((entry) => entry.id === current.id) ?? current;
    });
  }, [onList]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = async () => {
    setBusy(true);
    const result = await onCreate({
      name: name.trim().length > 0 ? name.trim() : "A tournament",
      rounds,
      timeControl: {
        initialMs: timeControl.initialMs,
        incrementMs: timeControl.incrementMs,
      },
    });
    setBusy(false);
    if (!result.ok) {
      setNotice(result.message ?? "The tournament could not be made.");
      return;
    }
    setName("");
    setMaking(false);
    await refresh();
    if (result.tournament !== null) {
      setSelected(result.tournament);
    }
  };

  const join = async (id: string) => {
    const result = await onJoin(id);
    if (!result.ok) {
      setNotice(result.message ?? "The tournament could not be joined.");
      return;
    }
    setNotice("You are in the tournament.");
    await refresh();
  };

  const leave = async (id: string) => {
    const result = await onLeave(id);
    if (!result.ok) {
      setNotice(result.message ?? "The tournament could not be left.");
      return;
    }
    setNotice("You have left the tournament.");
    await refresh();
  };

  const start = async (id: string) => {
    const result = await onStart(id);
    if (!result.ok) {
      setNotice(result.message ?? "The tournament could not be begun.");
      return;
    }
    setNotice("The tournament has begun.");
    await refresh();
  };

  const mine = (player: TournamentPlayer) =>
    userId !== null && player.userId === userId;

  return (
    <section className="panel tournament-panel">
      <div className="panel-heading">
        <h2>Tournaments</h2>
        <div className="tournament-heading__actions">
          <button
            type="button"
            className="mini-button"
            onClick={() => setMaking((current) => !current)}
          >
            {making ? "Cancel" : "Make one"}
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close the tournaments"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>

      {making && (
        <div className="tournament-make">
          <label className="desk-label" htmlFor="tournament-name">
            The name of the tournament
          </label>
          <input
            id="tournament-name"
            className="tournament-input"
            value={name}
            maxLength={40}
            placeholder="The Cup"
            onChange={(event) => setName(event.target.value)}
          />
          <div className="tournament-make__row">
            <label className="desk-label" htmlFor="tournament-rounds">
              Rounds
            </label>
            <select
              id="tournament-rounds"
              className="tournament-input"
              value={rounds}
              onChange={(event) => setRounds(Number(event.target.value))}
            >
              {[2, 3, 4, 5, 6, 7].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
            <label className="desk-label" htmlFor="tournament-time">
              The clock
            </label>
            <select
              id="tournament-time"
              className="tournament-input"
              value={timeControl.label}
              onChange={(event) => {
                const chosen = TIME_CONTROLS.find(
                  (entry) => entry.label === event.target.value,
                );
                if (chosen !== undefined) {
                  setTimeControl(chosen);
                }
              }}
            >
              {TIME_CONTROLS.map((entry) => (
                <option key={entry.label} value={entry.label}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="action-button action-button--primary"
            onClick={() => void create()}
            disabled={busy}
          >
            Make the tournament
          </button>
        </div>
      )}

      {notice !== null && <p className="puzzle-notice">{notice}</p>}

      {selected !== null ? (
        <div className="tournament-view">
          <button
            type="button"
            className="mini-button"
            onClick={() => setSelected(null)}
          >
            All the tournaments
          </button>
          <h3 className="tournament-view__name">{selected.name}</h3>
          <p className="tournament-view__meta">
            {selected.rounds} rounds · {selected.players.length} players ·{" "}
            {selected.status === "open"
              ? "waiting for the host"
              : selected.status === "running"
                ? `round ${selected.round} of ${selected.rounds}`
                : "finished"}
          </p>

          <ol className="tournament-standing">
            {selected.players.map((player) => (
              <li
                key={player.userId}
                className={mine(player) ? "tournament-standing__mine" : ""}
              >
                <span className="tournament-standing__place">
                  {player.position}
                </span>
                <span className="tournament-standing__name">
                  {player.username}
                </span>
                <span className="tournament-standing__rating">
                  {player.rating}
                </span>
                <span className="tournament-standing__points">
                  {pointsText(player.points)}
                </span>
                {player.matchId !== null && mine(player) && (
                  <button
                    type="button"
                    className="mini-button"
                    onClick={() => onPlay(player.matchId as string)}
                  >
                    Play
                  </button>
                )}
              </li>
            ))}
          </ol>

          {selected.roundsDone.length > 0 && (
            <div className="tournament-rounds">
              {selected.roundsDone.map((round) => (
                <div key={round.number}>
                  <p className="explorer-games__title">
                    Round {round.number}
                  </p>
                  <ul>
                    {round.games.map((game, index) => (
                      <li key={`${round.number}-${index}`}>
                        <span className="explorer-game__names">
                          {nameOf(selected, game.white)} –{" "}
                          {nameOf(selected, game.black)}
                        </span>
                        <span className="explorer-game__result">
                          {game.result === null
                            ? "not played yet"
                            : game.result === "draw"
                              ? "draw"
                              : nameOf(selected, game.result) + " won"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <div className="tournament-actions">
            {selected.status === "open" &&
              (userId !== null && selected.host === userId ? (
                <>
                  <button
                    type="button"
                    className="action-button action-button--primary"
                    onClick={() => void start(selected.id)}
                    disabled={selected.players.length < 2}
                  >
                    Begin it
                  </button>
                  <button
                    type="button"
                    className="action-button"
                    onClick={() => void leave(selected.id)}
                  >
                    Leave it
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="action-button action-button--primary"
                  onClick={() => void join(selected.id)}
                >
                  Take a seat
                </button>
              ))}
            {selected.status === "running" && (
              <button
                type="button"
                className="action-button"
                onClick={() => void refresh()}
              >
                Look again
              </button>
            )}
          </div>
        </div>
      ) : (
        <ul className="tournament-list">
          {tournaments.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className="tournament-list__button"
                onClick={() => setSelected(entry)}
              >
                <span className="tournament-list__name">{entry.name}</span>
                <span className="tournament-list__meta">
                  {entry.players.length} players · {entry.rounds} rounds ·{" "}
                  {entry.status === "open"
                    ? "open"
                    : entry.status === "running"
                      ? `round ${entry.round}`
                      : "finished"}
                </span>
              </button>
            </li>
          ))}
          {tournaments.length === 0 && (
            <li className="explorer-empty">
              There is no tournament here yet. Make one.
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/** The name of a player of the tournament. */
function nameOf(tournament: Tournament, userId: string): string {
  for (const player of tournament.players) {
    if (player.userId === userId) {
      return player.username;
    }
  }
  return "Player";
}
