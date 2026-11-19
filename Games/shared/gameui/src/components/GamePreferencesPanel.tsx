import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
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
import { Icon } from "./Icon";

/** A set of pieces a player can choose. */
export interface PieceChoice {
  id: string;
  label: string;
  /** The white piece, shown in the picker. */
  preview?: ReactNode;
  /** The black piece, shown in the picker beside the white one. */
  previewDark?: ReactNode;
}

/** A colouring of the board a player can choose. */
export interface ThemeChoice {
  id: string;
  label: string;
  /** The picture of the board, when the board has one. */
  texture?: string;
  /** The colour of the light squares, when the board has no picture. */
  light?: string;
  /** The colour of the dark squares, when the board has no picture. */
  dark?: string;
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
  /** The notation of the game can hide the names of the pieces. */
  blindMode?: boolean;
  /** A move of the game can be written with the keyboard. */
  keyboardMoves?: boolean;
  /** The board can mark the squares a piece may go to. */
  showLegalMoves?: boolean;
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
  /** Called to let the player hear what the table sounds like. */
  onPreviewSound?: () => void;
  /** The name shown above the choices. */
  title?: string;
}

/** The group of choices a picker is showing. */
type PickerGroup = "pieces" | "board" | "sounds" | null;

/**
 * The customizations of a game.
 *
 * The screen is three lines, the way lichess keeps it: the pieces, the
 * board, and the sound. Each line shows what is chosen now, with a picture
 * of it, and opens a picker when it is touched. The rest of the choices
 * are behind "More settings", so the screen stays small and the player
 * sees the choices that matter first.
 */
export function GamePreferencesPanel({
  gameId,
  pieceSets = [],
  themes = [],
  soundSets = [],
  features = {},
  onPreviewSound,
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
  const [picker, setPicker] = useState<PickerGroup>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    setScope(readPreferenceScope(gameId));
  }, [gameId]);

  const choose = useCallback(
    <K extends PreferenceKey>(key: K, value: GamePreferences[K]) => {
      if (scope === "shared") {
        setSharedPreference(key, value);
        return;
      }
      setPreference(key, value);
    },
    [scope, setPreference, setSharedPreference],
  );

  const restore = (key: PreferenceKey) => {
    resetPreference(key);
    if (scope === "shared") {
      clearSharedPreference(key);
    }
  };

  const chosenPieces = pieceSets.find(
    (choice) => choice.id === preferences.pieceSet,
  );
  const chosenTheme = themes.find(
    (choice) => choice.id === preferences.boardTheme,
  );
  const chosenSounds = soundSets.find(
    (choice) => choice.id === preferences.soundSet,
  );

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
          <span>Every game</span>
        </label>
      </header>

      <div className="pref-rows">
        {pieceSets.length > 0 && (
          <button
            type="button"
            className="pref-row"
            onClick={() => setPicker("pieces")}
          >
            <span className="pref-row__preview pref-row__preview--pieces">
              {chosenPieces?.preview ?? null}
              {chosenPieces?.previewDark ?? null}
            </span>
            <span className="pref-row__label">Pieces</span>
            <span className="pref-row__value">
              {chosenPieces?.label ?? preferences.pieceSet}
            </span>
            <Icon name="chevron-right" size={16} />
          </button>
        )}

        {themes.length > 0 && (
          <button
            type="button"
            className="pref-row"
            onClick={() => setPicker("board")}
          >
            <span
              className="pref-row__preview pref-row__preview--board"
              style={boardPreviewStyle(chosenTheme)}
            />
            <span className="pref-row__label">Board</span>
            <span className="pref-row__value">
              {chosenTheme?.label ?? preferences.boardTheme}
            </span>
            <Icon name="chevron-right" size={16} />
          </button>
        )}

        <div className="pref-row pref-row--sound">
          <button
            type="button"
            className="pref-row__preview pref-row__preview--sound"
            onClick={onPreviewSound}
            disabled={onPreviewSound === undefined}
            aria-label="Hear the table"
            title="Hear the table"
          >
            <Icon name="volume" size={16} />
          </button>
          <span className="pref-row__label">Sound</span>
          <button
            type="button"
            className="pref-row__value pref-row__value--button"
            onClick={() => setPicker("sounds")}
          >
            {chosenSounds?.label ?? preferences.soundSet}
          </button>
          <input
            className="pref-row__volume"
            type="range"
            min={0}
            max={100}
            aria-label="The volume of the table"
            value={Math.round(preferences.soundVolume * 100)}
            onChange={(event) =>
              choose("soundVolume", Number(event.target.value) / 100)
            }
          />
        </div>

        <label className="pref-row pref-row--toggle">
          <span className="pref-row__label">Music</span>
          <input
            type="checkbox"
            checked={preferences.musicEnabled}
            onChange={(event) => choose("musicEnabled", event.target.checked)}
            aria-label="Play the table music"
          />
        </label>

        {features.showLegalMoves === true && (
          <label className="pref-row pref-row--toggle">
            <span className="pref-row__label">Legal move helper</span>
            <input
              type="checkbox"
              checked={preferences.showLegalMoves}
              onChange={(event) =>
                choose("showLegalMoves", event.target.checked)
              }
              aria-label="Show legal move helper"
            />
          </label>
        )}
      </div>

      <button
        type="button"
        className="pref-more"
        onClick={() => setMore((current) => !current)}
        aria-expanded={more}
      >
        {more ? "Fewer settings" : "More settings"}
      </button>

      {more && (
        <div className="pref-more__body">
          <PreferenceGroup
            title="Coordinates"
            onRestore={() => restore("coordinates")}
          >
            <div
              className="pref-choices"
              role="radiogroup"
              aria-label="Coordinates"
            >
              {(
                [
                  [Coordinates.Hidden, COORDINATE_LABELS[Coordinates.Hidden]],
                  [Coordinates.Inside, COORDINATE_LABELS[Coordinates.Inside]],
                  [
                    Coordinates.Outside,
                    COORDINATE_LABELS[Coordinates.Outside],
                  ],
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
                  [
                    AnimationSpeed.None,
                    ANIMATION_SPEED_LABELS[AnimationSpeed.None],
                  ],
                  [
                    AnimationSpeed.Fast,
                    ANIMATION_SPEED_LABELS[AnimationSpeed.Fast],
                  ],
                  [
                    AnimationSpeed.Normal,
                    ANIMATION_SPEED_LABELS[AnimationSpeed.Normal],
                  ],
                  [
                    AnimationSpeed.Slow,
                    ANIMATION_SPEED_LABELS[AnimationSpeed.Slow],
                  ],
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

          {features.moveEvent === true && (
            <PreferenceGroup
              title="Moving a piece"
              onRestore={() => restore("moveEvent")}
            >
              <div
                className="pref-choices"
                role="radiogroup"
                aria-label="Moving a piece"
              >
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
              <div
                className="pref-choices"
                role="radiogroup"
                aria-label="Promotion"
              >
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
              <div
                className="pref-choices"
                role="radiogroup"
                aria-label="The clock"
              >
                {(
                  [
                    [
                      ShowClockTenths.Never,
                      CLOCK_TENTHS_LABELS[ShowClockTenths.Never],
                    ],
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
                    [
                      Replay.OnlySlowGames,
                      REPLAY_LABELS[Replay.OnlySlowGames],
                    ],
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
                A slow game is one that took more than two minutes, or one
                with three minutes or more on the clock.
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
                checked={preferences.soundEnabled}
                onChange={(event) =>
                  choose("soundEnabled", event.target.checked)
                }
              />
              <span>The table makes a sound</span>
            </label>
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
            {features.blindMode === true && (
              <label className="pref-toggle">
                <input
                  type="checkbox"
                  checked={preferences.blindMode}
                  onChange={(event) =>
                    choose("blindMode", event.target.checked)
                  }
                />
                <span>Hide the names of the pieces in the moves</span>
              </label>
            )}
            {features.keyboardMoves === true && (
              <label className="pref-toggle">
                <input
                  type="checkbox"
                  checked={preferences.keyboardMoves}
                  onChange={(event) =>
                    choose("keyboardMoves", event.target.checked)
                  }
                />
                <span>Write a move with the keyboard</span>
              </label>
            )}
          </PreferenceGroup>
        </div>
      )}

      {picker === "pieces" && (
        <PreferencePicker
          title="Pieces"
          onClose={() => setPicker(null)}
        >
          <div className="pref-picker__grid pref-picker__grid--pieces">
            {pieceSets.map((choice) => (
              <button
                key={choice.id}
                type="button"
                className={`pref-picker__piece${
                  preferences.pieceSet === choice.id ? " is-chosen" : ""
                }`}
                onClick={() => {
                  choose("pieceSet", choice.id);
                  setPicker(null);
                }}
              >
                <span className="pref-picker__pieceArt">
                  {choice.preview ?? null}
                  {choice.previewDark ?? null}
                </span>
                <small>{choice.label}</small>
              </button>
            ))}
          </div>
        </PreferencePicker>
      )}

      {picker === "board" && (
        <PreferencePicker title="Board" onClose={() => setPicker(null)}>
          <div className="pref-picker__grid pref-picker__grid--boards">
            {themes.map((choice) => (
              <button
                key={choice.id}
                type="button"
                className={`pref-picker__board${
                  preferences.boardTheme === choice.id ? " is-chosen" : ""
                }`}
                onClick={() => {
                  choose("boardTheme", choice.id);
                  setPicker(null);
                }}
              >
                <span
                  className="pref-picker__boardArt"
                  style={boardPreviewStyle(choice)}
                />
                <small>{choice.label}</small>
              </button>
            ))}
          </div>
        </PreferencePicker>
      )}

      {picker === "sounds" && (
        <PreferencePicker title="Sound" onClose={() => setPicker(null)}>
          <div className="pref-picker__grid pref-picker__grid--sounds">
            {soundSets.map((choice) => (
              <button
                key={choice.id}
                type="button"
                className={`pref-picker__sound${
                  preferences.soundSet === choice.id ? " is-chosen" : ""
                }`}
                onClick={() => {
                  choose("soundSet", choice.id);
                  setPicker(null);
                }}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </PreferencePicker>
      )}
    </section>
  );
}

/**
 * The picture of a board, for the row and for the picker.
 *
 * A board that has a picture is shown as that picture, so the player sees
 * the board itself and not a colour that stands in for it.
 */
function boardPreviewStyle(theme: ThemeChoice | undefined): CSSProperties | undefined {
  if (theme === undefined) {
    return undefined;
  }
  if (theme.texture !== undefined) {
    return { backgroundImage: `url("${theme.texture}")` };
  }
  if (theme.light === undefined || theme.dark === undefined) {
    return undefined;
  }
  return {
    background: `linear-gradient(135deg, ${theme.light} 50%, ${theme.dark} 50%)`,
  };
}

/**
 * The sheet of choices that opens over the screen.
 */
function PreferencePicker({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="pref-picker" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        className="pref-picker__backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="pref-picker__sheet">
        <header className="pref-picker__head">
          <h4>{title}</h4>
          <button
            type="button"
            className="pref-picker__close"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="pref-picker__body">{children}</div>
      </div>
    </div>
  );
}

function PreferenceGroup({
  title,
  onRestore,
  children,
}: {
  title: string;
  onRestore: () => void;
  children: ReactNode;
}) {
  return (
    <div className="pref-group">
      <div className="pref-group__head">
        <h4>{title}</h4>
        <button
          type="button"
          className="pref-group__restore"
          onClick={onRestore}
        >
          Default
        </button>
      </div>
      {children}
    </div>
  );
}
