/**
 * The customizations a player can make to a game.
 *
 * Lichess lets a player choose the pieces, the board, the coordinates, the
 * speed of the pieces and the sounds of the table. Those choices are kept
 * on the device, so the table looks the way the player left it.
 *
 * The same choices are offered here by every title, so one panel serves all
 * of them. A title with no pieces of its own simply does not offer the piece
 * choice, and a title that is not played online does not need the sound
 * set.
 *
 * The values are kept in two places. Every game has its own room, so a
 * player can have a table that looks one way for chess and another way for
 * carrom. Underneath is a shared room, which holds the choice a player
 * makes once for every game. The game wins over the shared room.
 */

/**
 * Where the coordinates of a board are drawn.
 *
 * The names and the order come from lichess, so the choice means the same
 * thing there and here.
 */
export const Coordinates = {
  Hidden: 0,
  Inside: 1,
  Outside: 2,
  All: 3,
} as const;

export type Coordinates = (typeof Coordinates)[keyof typeof Coordinates];

/**
 * How quickly a piece travels across the board.
 *
 * A player can turn the travel off, which is the same as turning the
 * animation off.
 */
export const AnimationSpeed = {
  None: 0,
  Fast: 1,
  Normal: 2,
  Slow: 3,
} as const;

export type AnimationSpeed =
  (typeof AnimationSpeed)[keyof typeof AnimationSpeed];

/**
 * When a pawn that reaches the last rank becomes a queen.
 *
 * The names come from lichess.
 */
export const AutoQueen = {
  Never: 1,
  OnPromotion: 2,
  Always: 3,
} as const;

export type AutoQueen = (typeof AutoQueen)[keyof typeof AutoQueen];

/**
 * How a piece is moved across the board.
 *
 * The names come from lichess.
 */
export const MoveEvent = {
  Click: 0,
  Drag: 1,
  ClickOrDrag: 2,
} as const;

export type MoveEvent = (typeof MoveEvent)[keyof typeof MoveEvent];

/**
 * When the clock shows the tenths of a second.
 *
 * The names come from lichess.
 */
export const ShowClockTenths = {
  Never: 0,
  Below10Seconds: 1,
  Always: 2,
} as const;

export type ShowClockTenths =
  (typeof ShowClockTenths)[keyof typeof ShowClockTenths];

/**
 * When the corner of the board can be dragged to make the board bigger or
 * smaller.
 *
 * The names come from lichess.
 */
export const ShowResizeHandle = {
  Never: 0,
  OnlyAtStart: 1,
  Always: 2,
} as const;

export type ShowResizeHandle =
  (typeof ShowResizeHandle)[keyof typeof ShowResizeHandle];

/**
 * When a finished game is played back on the board.
 *
 * The names come from lichess.
 */
export const Replay = {
  Never: 0,
  OnlySlowGames: 1,
  Always: 2,
} as const;

export type Replay = (typeof Replay)[keyof typeof Replay];

/** The names a player sees for the speeds. */
export const ANIMATION_SPEED_LABELS: Record<AnimationSpeed, string> = {
  [AnimationSpeed.None]: "Off",
  [AnimationSpeed.Fast]: "Fast",
  [AnimationSpeed.Normal]: "Normal",
  [AnimationSpeed.Slow]: "Slow",
};

/** The names a player sees for the coordinates. */
export const COORDINATE_LABELS: Record<Coordinates, string> = {
  [Coordinates.Hidden]: "Hidden",
  [Coordinates.Inside]: "Inside the squares",
  [Coordinates.Outside]: "On the edge",
  [Coordinates.All]: "Both",
};

/** The names a player sees for the promotion of a pawn. */
export const AUTO_QUEEN_LABELS: Record<AutoQueen, string> = {
  [AutoQueen.Never]: "Always ask",
  [AutoQueen.OnPromotion]: "Ask, but a queen is one click away",
  [AutoQueen.Always]: "Always a queen",
};

/** The names a player sees for the way a piece is moved. */
export const MOVE_EVENT_LABELS: Record<MoveEvent, string> = {
  [MoveEvent.Click]: "Click",
  [MoveEvent.Drag]: "Drag",
  [MoveEvent.ClickOrDrag]: "Click or drag",
};

/** The names a player sees for the tenths of the clock. */
export const CLOCK_TENTHS_LABELS: Record<ShowClockTenths, string> = {
  [ShowClockTenths.Never]: "Never",
  [ShowClockTenths.Below10Seconds]: "Below ten seconds",
  [ShowClockTenths.Always]: "Always",
};

/** The names a player sees for the corner that resizes the board. */
export const RESIZE_HANDLE_LABELS: Record<ShowResizeHandle, string> = {
  [ShowResizeHandle.Never]: "Never",
  [ShowResizeHandle.OnlyAtStart]: "Before the game begins",
  [ShowResizeHandle.Always]: "Always",
};

/** The names a player sees for the replay of a finished game. */
export const REPLAY_LABELS: Record<Replay, string> = {
  [Replay.Never]: "Never",
  [Replay.OnlySlowGames]: "Only slow games",
  [Replay.Always]: "Always",
};

/**
 * How long a piece takes to travel, in milliseconds. A speed of zero means
 * the piece is put down straight away.
 */
export function animationDuration(speed: AnimationSpeed): number {
  switch (speed) {
    case AnimationSpeed.None:
      return 0;
    case AnimationSpeed.Fast:
      return 90;
    case AnimationSpeed.Slow:
      return 320;
    default:
      return 190;
  }
}

/** Every choice a player can make, with the value used when none is made. */
export interface GamePreferences {
  /** The set of pieces on the board. A title with no pieces ignores this. */
  pieceSet: string;
  /** The design of the striker, for games that have one. */
  strikerDesign: string;
  /** The colours of the board. */
  boardTheme: string;
  /** Where the coordinates are drawn. */
  coordinates: Coordinates;
  /** How fast the pieces travel. */
  animationSpeed: AnimationSpeed;
  /** Whether the table makes a sound at all. */
  soundEnabled: boolean;
  /** How loud the table is, from nothing to everything. */
  soundVolume: number;
  /** The set of sounds the table uses. */
  soundSet: string;
  /** Whether the squares a piece may go to are marked. */
  showLegalMoves: boolean;
  /** Whether the squares of the last move are marked. */
  highlightLastMove: boolean;
  /** When a pawn that reaches the last rank becomes a queen. */
  autoQueen: AutoQueen;
  /** How a piece is moved across the board. */
  moveEvent: MoveEvent;
  /** When the clock shows the tenths of a second. */
  clockTenths: ShowClockTenths;
  /** When the corner of the board can be dragged to resize it. */
  resizeHandle: ShowResizeHandle;
  /** When a finished game is played back on the board. */
  replay: Replay;
  /** Whether the notation hides the names of the pieces. */
  blindMode: boolean;
  /** Whether a move may be written with the keyboard. */
  keyboardMoves: boolean;
  /** Whether the table plays its background music. */
  musicEnabled: boolean;
}

export const DEFAULT_PREFERENCES: GamePreferences = {
  pieceSet: "moongames",
  strikerDesign: "brass",
  boardTheme: "moongames",
  coordinates: Coordinates.Outside,
  animationSpeed: AnimationSpeed.Normal,
  soundEnabled: true,
  soundVolume: 0.8,
  soundSet: "standard",
  showLegalMoves: true,
  highlightLastMove: true,
  autoQueen: AutoQueen.Never,
  moveEvent: MoveEvent.ClickOrDrag,
  clockTenths: ShowClockTenths.Below10Seconds,
  resizeHandle: ShowResizeHandle.Always,
  replay: Replay.Never,
  blindMode: false,
  keyboardMoves: false,
  musicEnabled: false,
};

export type PreferenceKey = keyof GamePreferences;

/** Every choice, in the order they are shown. */
export const PREFERENCE_KEYS = Object.keys(
  DEFAULT_PREFERENCES,
) as PreferenceKey[];

const PREFIX = "moongames.prefs";

/** The room a game keeps its own choices in. */
function gameKey(gameId: string, key: PreferenceKey): string {
  return `${PREFIX}.${gameId}.${key}`;
}

/** The room every game falls back to. */
function sharedKey(key: PreferenceKey): string {
  return `${PREFIX}.default.${key}`;
}

function readRaw(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    // Storage can be unavailable, and a game must still play without it.
    return null;
  }
}

function writeRaw(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // The choice is lost, but the game goes on.
  }
}

function removeRaw(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Nothing to do.
  }
}

function storage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Read one choice of a game. The game's own choice wins over the shared
 * one, and the built-in value wins over nothing.
 */
export function readPreference<K extends PreferenceKey>(
  gameId: string,
  key: K,
): GamePreferences[K] {
  const store = storage();
  if (store === null) {
    return DEFAULT_PREFERENCES[key];
  }

  const own = readRaw(store, gameKey(gameId, key));
  if (own !== null) {
    const parsed = parseValue(key, own);
    if (parsed !== undefined) {
      return parsed as GamePreferences[K];
    }
  }

  const shared = readRaw(store, sharedKey(key));
  if (shared !== null) {
    const parsed = parseValue(key, shared);
    if (parsed !== undefined) {
      return parsed as GamePreferences[K];
    }
  }

  return DEFAULT_PREFERENCES[key];
}

/** Read every choice of a game at once. */
export function readPreferences(gameId: string): GamePreferences {
  const preferences: GamePreferences = { ...DEFAULT_PREFERENCES };
  for (const key of PREFERENCE_KEYS) {
    Object.assign(preferences, { [key]: readPreference(gameId, key) });
  }
  return preferences;
}

/** Keep a choice in the game's own room. */
export function writePreference<K extends PreferenceKey>(
  gameId: string,
  key: K,
  value: GamePreferences[K],
): void {
  const store = storage();
  if (store === null) {
    return;
  }
  writeRaw(store, gameKey(gameId, key), JSON.stringify(value));
  notify(gameId, key);
}

/**
 * Keep a choice in the shared room, so it applies to every game that has
 * not made a choice of its own.
 */
export function writeSharedPreference<K extends PreferenceKey>(
  key: K,
  value: GamePreferences[K],
): void {
  const store = storage();
  if (store === null) {
    return;
  }
  writeRaw(store, sharedKey(key), JSON.stringify(value));
  notify("*", key);
}

/** Forget a game's own choice, so it follows the shared room again. */
export function clearPreference(gameId: string, key: PreferenceKey): void {
  const store = storage();
  if (store === null) {
    return;
  }
  removeRaw(store, gameKey(gameId, key));
  notify(gameId, key);
}

/** Forget a choice in the shared room, so every game goes back to it. */
export function clearSharedPreference(key: PreferenceKey): void {
  const store = storage();
  if (store === null) {
    return;
  }
  removeRaw(store, sharedKey(key));
  notify("*", key);
}

/**
 * Whether the choices of a game are kept for that game alone or for every
 * game. The choice is kept per game, so a player can have one game that
 * follows the shared room and another that does not.
 */
export type PreferenceScope = "game" | "shared";

export function readPreferenceScope(gameId: string): PreferenceScope {
  const store = storage();
  if (store === null) {
    return "game";
  }
  return readRaw(store, `${PREFIX}.${gameId}.scope`) === "shared"
    ? "shared"
    : "game";
}

export function writePreferenceScope(
  gameId: string,
  scope: PreferenceScope,
): void {
  const store = storage();
  if (store === null) {
    return;
  }
  writeRaw(store, `${PREFIX}.${gameId}.scope`, scope);
}

/**
 * True when a game has made a choice of its own for this key, so it does
 * not follow the shared room.
 */
export function hasOwnPreference(
  gameId: string,
  key: PreferenceKey,
): boolean {
  const store = storage();
  if (store === null) {
    return false;
  }
  return readRaw(store, gameKey(gameId, key)) !== null;
}

function parseValue(key: PreferenceKey, raw: string): unknown {
  try {
    const parsed: unknown = JSON.parse(raw);
    switch (key) {
      case "soundVolume": {
        if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
          return undefined;
        }
        return Math.min(1, Math.max(0, parsed));
      }
      case "coordinates":
        return isOneOf(Coordinates, parsed) ? parsed : undefined;
      case "animationSpeed":
        return isOneOf(AnimationSpeed, parsed) ? parsed : undefined;
      case "autoQueen":
        return isOneOf(AutoQueen, parsed) ? parsed : undefined;
      case "moveEvent":
        return isOneOf(MoveEvent, parsed) ? parsed : undefined;
      case "clockTenths":
        return isOneOf(ShowClockTenths, parsed) ? parsed : undefined;
      case "resizeHandle":
        return isOneOf(ShowResizeHandle, parsed) ? parsed : undefined;
      case "replay":
        return isOneOf(Replay, parsed) ? parsed : undefined;
      case "soundEnabled":
      case "showLegalMoves":
      case "highlightLastMove":
        return typeof parsed === "boolean" ? parsed : undefined;
      default:
        return typeof parsed === "string" ? parsed : undefined;
    }
  } catch {
    return undefined;
  }
}

function isOneOf(
  table: Record<string, number>,
  value: unknown,
): boolean {
  return (
    typeof value === "number" &&
    Object.values(table).includes(value as number)
  );
}

/**
 * The listeners that want to know when a choice changes, so every panel on
 * the page shows the same thing.
 */
type PreferenceListener = (gameId: string, key: PreferenceKey) => void;

const listeners = new Set<PreferenceListener>();

/** Listen for changes to the choices. */
export function onPreferenceChange(
  listener: PreferenceListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(gameId: string, key: PreferenceKey): void {
  for (const listener of listeners) {
    listener(gameId, key);
  }
}

// A change made in another tab reaches this one through the storage event.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === null || !event.key.startsWith(`${PREFIX}.`)) {
      return;
    }
    const rest = event.key.slice(PREFIX.length + 1);
    const dot = rest.lastIndexOf(".");
    if (dot < 0) {
      return;
    }
    const gameId = rest.slice(0, dot);
    const key = rest.slice(dot + 1) as PreferenceKey;
    if (gameId === "default") {
      notify("*", key);
      return;
    }
    notify(gameId, key);
  });
}
