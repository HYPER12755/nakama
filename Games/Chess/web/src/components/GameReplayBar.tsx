export interface GameReplayBarProps {
  /** The move the board is showing, counting from one. */
  ply: number;
  /** How many moves the game had. */
  lastPly: number;
  /** Whether the replay is going on by itself. */
  playing: boolean;
  /** The move that is shown, written the way a player writes it. */
  san: string | null;
  /** Called to start or to hold the replay. */
  onTogglePlay: () => void;
  /** Called to leave the replay and show the finished board. */
  onStop: () => void;
}

/**
 * The bar that sits over the board while a finished game is played back.
 *
 * It shows which move the board is at, and it lets the player hold the
 * replay or leave it.
 */
export function GameReplayBar({
  ply,
  lastPly,
  playing,
  san,
  onTogglePlay,
  onStop,
}: GameReplayBarProps) {
  return (
    <div className="replay-bar" role="status" aria-live="polite">
      <span className="replay-bar__label">Replay</span>
      <span className="replay-bar__move">
        {san === null ? "Start" : san}
      </span>
      <span className="replay-bar__count">
        {Math.max(0, ply)} / {Math.max(0, lastPly)}
      </span>
      <button
        type="button"
        className="replay-bar__button"
        onClick={onTogglePlay}
      >
        {playing ? "Hold" : "Play"}
      </button>
      <button
        type="button"
        className="replay-bar__button replay-bar__button--stop"
        onClick={onStop}
      >
        Close
      </button>
    </div>
  );
}
