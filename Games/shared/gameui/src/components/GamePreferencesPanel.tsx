import { useEffect, useState } from "react";
import {
  AnimationSpeed,
  ANIMATION_SPEED_LABELS,
  AUTO_QUEEN_LABELS,
  AutoQueen,
  CLOCK_TENTHS_LABELS,
  Coordinates,
  COORDINATE_LABELS,
  MOVE_EVENT_LABELS,
  MoveEvent,
  REPLAY_LABELS,
  Replay,
  RESIZE_HANDLE_LABELS,
  ShowClockTenths,
  ShowResizeHandle,
  clearSharedPreference,
  readPreferenceScope,
  writePreferenceScope,
  type GamePreferences,
  type PreferenceKey,
  type PreferenceScope,
} from "../lib/preferences";
import { useGamePreferences } from "../hooks/useGamePreferences";

/** A set of pieces a player can choose. */
export interface PieceChoice {
  id: string;
  label: string;
  /** The picture shown in the picker. */
  preview?: string;
}

/** A colouring of the board a player can choose. */
export interface ThemeChoice {
  id: string;
  label: string;
  /** The colour of the light squares. */
  light: string;
  /** The colour of the dark squares. */
  dark: string;
}

/** A set of sounds a player can choose. */
export interface SoundChoice {
  id: string;
  label: string;
}

/**
 * The choices that only some games have.
 *
 * A game with pawns that reach the last rank offers the promotion choice,
 * a game whose pieces are moved offers the way of moving them, and a game
 * with a clock offers the tenths of a second.
 */
export interface PreferenceFeatures {
  /** The game has pawns that promote. */
  autoQueen?: boolean;
  /** The game has pieces that are moved across a board. */
  moveEvent?: boolean;
  /** The game has a clock. */
  clockTenths?: boolean;
  /** The board of the game can be made bigger or smaller. */
  resizeHandle?: boolean;
  /** A finished game of the game can be played back. */
  replay?: boolean;
}

export interface GamePreferencesPanelProps {
  /** The game these choices belong to. */
  gameId: string;
  /** The sets of pieces, when the game has pieces. */
  pieceSets?: PieceChoice[];
  /** The colourings of the board. */
  themes?: ThemeChoice[];
  /** The sets of sounds, when the game has sounds. */
  soundSets?: SoundChoice[];
  /** The choices that only this game has. */
  features?: PreferenceFeatures;
  /** The name shown above the choices. */
  title?: string;
}

/**
 * The customizations of a game, in one panel.
 *
 * Every title offers the same panel, so a player learns it once. The choices
 * a game does not have, such as the pieces for a game without pieces, are
 * not shown.
 */
export function GamePreferencesPanel({
  gameId,
  pieceSets = [],
  themes = [],
  soundSets = [],
  features = {},
  title = "Look and sound",
}: GamePreferencesPanelProps) {
  const {
    preferences,
    setPreference,
    setSharedPreference,
    resetPreference,
  } = useGamePreferences(gameId);
  const [scope, setScope] = useState<PreferenceScope>(() =>
    readPreferenceScope(gameId),
  );

  useEffect(() => {
    setScope(readPreferenceScope(gameId));
  }, [gameId]);

  const choose = <K extends PreferenceKey>(
    key: K,
    value: GamePreferences[K],
  ) => {
    if (scope === "shared") {
      setSharedPreference(key, value);
      return;
    }
    setPreference(key, value);
  };

  const restore = (key: PreferenceKey) => {
    resetPreference(key);
    if (scope === "shared") {
      clearSharedPreference(key);
    }
  };

  return (
    <section className="panel pref-panel" aria-label={title}>
      <header className="pref-panel__head">
        <h3>{title}</h3>
        <label className="pref-panel__scope">
          <input
            type="checkbox"
            checked={scope === "shared"}
            onChange={(event) => {
              const next: PreferenceScope = event.target.checked
                ? "shared"
                : "game";
              setScope(next);
              writePreferenceScope(gameId, next);
            }}
          />
          <span>Use in every game</span>
        </label>
      </header>

      {pieceSets.length > 0 && (
        <PreferenceGroup
          title="Pieces"
          onRestore={() => restore("pieceSet")}
        >
          <div className="pref-pieces" role="radiogroup" aria-label="Pieces">
            {pieceSets.map((piece) => (
              <button
                key={piece.id}
                type="button"
                role="radio"
                aria-checked={preferences.pieceSet === piece.id}
                className={`pref-piece${
                  preferences.pieceSet === piece.id ? " is-chosen" : ""
                }`}
                title={piece.label}
                onClick={() => choose("pieceSet", piece.id)}
              >
                {piece.preview !== undefined ? (
                  <img src={piece.preview} alt="" loading="lazy" />
                ) : (
                  <span>{piece.label.slice(0, 2)}</span>
                )}
                <small>{piece.label}</small>
              </button>
            ))}
          </div>
        </PreferenceGroup>
      )}

      {themes.length > 0 && (
        <PreferenceGroup
          title="Board"
          onRestore={() => restore("boardTheme")}
        >
          <div className="pref-themes" role="radiogroup" aria-label="Board">
            {themes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                role="radio"
                aria-checked={preferences.boardTheme === theme.id}
                className={`pref-theme${
                  preferences.boardTheme === theme.id ? " is-chosen" : ""
                }`}
                title={theme.label}
                onClick={() => choose("boardTheme", theme.id)}
              >
                <span
                  className="pref-theme__swatch"
                  style={{
                    background: `linear-gradient(135deg, ${theme.light} 50%, ${theme.dark} 50%)`,
                  }}
                />
                <small>{theme.label}</small>
              </button>
            ))}
          </div>
        </PreferenceGroup>
      )}

      <PreferenceGroup
        title="Coordinates"
        onRestore={() => restore("coordinates")}
      >
        <div className="pref-choices" role="radiogroup" aria-label="Coordinates">
          {(
            [
              [Coordinates.Hidden, COORDINATE_LABELS[Coordinates.Hidden]],
              [Coordinates.Inside, COORDINATE_LABELS[Coordinates.Inside]],
              [Coordinates.Outside, COORDINATE_LABELS[Coordinates.Outside]],
              [Coordinates.All, COORDINATE_LABELS[Coordinates.All]],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={preferences.coordinates === value}
              className={`pref-choice${
                preferences.coordinates === value ? " is-chosen" : ""
              }`}
              onClick={() => choose("coordinates", value)}
            >
              {label}
            </button>
          ))}
        </div>
      </PreferenceGroup>

      <PreferenceGroup
        title="Movement"
        onRestore={() => restore("animationSpeed")}
      >
        <div className="pref-choices" role="radiogroup" aria-label="Movement">
          {(
            [
              [AnimationSpeed.None, ANIMATION_SPEED_LABELS[AnimationSpeed.None]],
              [AnimationSpeed.Fast, ANIMATION_SPEED_LABELS[AnimationSpeed.Fast]],
              [
                AnimationSpeed.Normal,
                ANIMATION_SPEED_LABELS[AnimationSpeed.Normal],
              ],
              [AnimationSpeed.Slow, ANIMATION_SPEED_LABELS[AnimationSpeed.Slow]],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={preferences.animationSpeed === value}
              className={`pref-choice${
                preferences.animationSpeed === value ? " is-chosen" : ""
              }`}
              onClick={() => choose("animationSpeed", value)}
            >
              {label}
            </button>
          ))}
        </div>
      </PreferenceGroup>

      <PreferenceGroup title="Sound" onRestore={() => restore("soundEnabled")}>
        <label className="pref-toggle">
          <input
            type="checkbox"
            checked={preferences.soundEnabled}
            onChange={(event) =>
              choose("soundEnabled", event.target.checked)
            }
          />
          <span>The table makes a sound</span>
        </label>

        <label className="pref-volume">
          <span>Volume</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(preferences.soundVolume * 100)}
            disabled={!preferences.soundEnabled}
            onChange={(event) =>
              choose("soundVolume", Number(event.target.value) / 100)
            }
          />
        </label>

        {soundSets.length > 0 && (
          <div className="pref-choices" role="radiogroup" aria-label="Sounds">
            {soundSets.map((set) => (
              <button
                key={set.id}
                type="button"
                role="radio"
                aria-checked={preferences.soundSet === set.id}
                className={`pref-choice${
                  preferences.soundSet === set.id ? " is-chosen" : ""
                }`}
                onClick={() => choose("soundSet", set.id)}
              >
                {set.label}
              </button>
            ))}
          </div>
        )}
      </PreferenceGroup>

      {features.moveEvent === true && (
        <PreferenceGroup
          title="Moving a piece"
          onRestore={() => restore("moveEvent")}
        >
          <div className="pref-choices" role="radiogroup" aria-label="Moving a piece">
            {(
              [
                [MoveEvent.Click, MOVE_EVENT_LABELS[MoveEvent.Click]],
                [MoveEvent.Drag, MOVE_EVENT_LABELS[MoveEvent.Drag]],
                [
                  MoveEvent.ClickOrDrag,
                  MOVE_EVENT_LABELS[MoveEvent.ClickOrDrag],
                ],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={preferences.moveEvent === value}
                className={`pref-choice${
                  preferences.moveEvent === value ? " is-chosen" : ""
                }`}
                onClick={() => choose("moveEvent", value)}
              >
                {label}
              </button>
            ))}
          </div>
        </PreferenceGroup>
      )}

      {features.autoQueen === true && (
        <PreferenceGroup
          title="A pawn that reaches the end"
          onRestore={() => restore("autoQueen")}
        >
          <div className="pref-choices" role="radiogroup" aria-label="Promotion">
            {(
              [
                [AutoQueen.Never, AUTO_QUEEN_LABELS[AutoQueen.Never]],
                [
                  AutoQueen.OnPromotion,
                  AUTO_QUEEN_LABELS[AutoQueen.OnPromotion],
                ],
                [AutoQueen.Always, AUTO_QUEEN_LABELS[AutoQueen.Always]],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={preferences.autoQueen === value}
                className={`pref-choice${
                  preferences.autoQueen === value ? " is-chosen" : ""
                }`}
                onClick={() => choose("autoQueen", value)}
              >
                {label}
              </button>
            ))}
          </div>
        </PreferenceGroup>
      )}

      {features.clockTenths === true && (
        <PreferenceGroup
          title="The clock"
          onRestore={() => restore("clockTenths")}
        >
          <div className="pref-choices" role="radiogroup" aria-label="The clock">
            {(
              [
                [ShowClockTenths.Never, CLOCK_TENTHS_LABELS[ShowClockTenths.Never]],
                [
                  ShowClockTenths.Below10Seconds,
                  CLOCK_TENTHS_LABELS[ShowClockTenths.Below10Seconds],
                ],
                [
                  ShowClockTenths.Always,
                  CLOCK_TENTHS_LABELS[ShowClockTenths.Always],
                ],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={preferences.clockTenths === value}
                className={`pref-choice${
                  preferences.clockTenths === value ? " is-chosen" : ""
                }`}
                onClick={() => choose("clockTenths", value)}
              >
                {label}
              </button>
            ))}
          </div>
        </PreferenceGroup>
      )}

      {features.resizeHandle === true && (
        <PreferenceGroup
          title="The size of the board"
          onRestore={() => restore("resizeHandle")}
        >
          <div
            className="pref-choices"
            role="radiogroup"
            aria-label="The size of the board"
          >
            {(
              [
                [
                  ShowResizeHandle.Never,
                  RESIZE_HANDLE_LABELS[ShowResizeHandle.Never],
                ],
                [
                  ShowResizeHandle.OnlyAtStart,
                  RESIZE_HANDLE_LABELS[ShowResizeHandle.OnlyAtStart],
                ],
                [
                  ShowResizeHandle.Always,
                  RESIZE_HANDLE_LABELS[ShowResizeHandle.Always],
                ],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={preferences.resizeHandle === value}
                className={`pref-choice${
                  preferences.resizeHandle === value ? " is-chosen" : ""
                }`}
                onClick={() => choose("resizeHandle", value)}
              >
                {label}
              </button>
            ))}
          </div>
        </PreferenceGroup>
      )}

      {features.replay === true && (
        <PreferenceGroup
          title="A game that is over"
          onRestore={() => restore("replay")}
        >
          <div
            className="pref-choices"
            role="radiogroup"
            aria-label="A game that is over"
          >
            {(
              [
                [Replay.Never, REPLAY_LABELS[Replay.Never]],
                [Replay.OnlySlowGames, REPLAY_LABELS[Replay.OnlySlowGames]],
                [Replay.Always, REPLAY_LABELS[Replay.Always]],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={preferences.replay === value}
                className={`pref-choice${
                  preferences.replay === value ? " is-chosen" : ""
                }`}
                onClick={() => choose("replay", value)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="pref-note">
            A slow game is one that took more than two minutes, or one with
            three minutes or more on the clock.
          </p>
        </PreferenceGroup>
      )}

      <PreferenceGroup
        title="On the board"
        onRestore={() => restore("showLegalMoves")}
      >
        <label className="pref-toggle">
          <input
            type="checkbox"
            checked={preferences.showLegalMoves}
            onChange={(event) =>
              choose("showLegalMoves", event.target.checked)
            }
          />
          <span>Mark the squares a piece may go to</span>
        </label>
        <label className="pref-toggle">
          <input
            type="checkbox"
            checked={preferences.highlightLastMove}
            onChange={(event) =>
              choose("highlightLastMove", event.target.checked)
            }
          />
          <span>Mark the last move</span>
        </label>
      </PreferenceGroup>
    </section>
  );
}

function PreferenceGroup({
  title,
  onRestore,
  children,
}: {
  title: string;
  onRestore: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="pref-group">
      <div className="pref-group__head">
        <h4>{title}</h4>
        <button type="button" className="pref-group__restore" onClick={onRestore}>
          Default
        </button>
      </div>
      {children}
    </div>
  );
}
