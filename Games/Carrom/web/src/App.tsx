import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { GameBridge } from "@moongames/game-sdk";
import {
  GAME_PROTOCOL_VERSION,
  readLauncherHandoff,
  type GameHostConfig,
} from "@moongames/game-sdk";
import {
  CARROM_BOARD,
  CARROM_STRIKERS,
  PLAYER_LABEL,
  TABLE_SIZES,
  baselineOf,
  challengeById,
  challengeProgress,
  chooseAiShotAsync,
  createInitialState,
  nearestValidStrikerPosition,
  passTurn,

  rulesOf,
  scoresFromBoard,
  sideOf,
  simulateShot,
  tablePlayers,
  validateShot,
  variantRules,
  teamOf,
  CARROM_TEAM_LABEL,
  type CarromAiDifficulty,
  type CarromChallenge,
  type CarromPlayer,
  type CarromShotInput,
  type CarromShotResult,
  type CarromSide,
  type CarromState,
  type GameVariant,
} from "@moongames/carrom-core";
import { CarromBoard } from "./components/CarromBoard";
import { CarromPreferences } from "./components/CarromPreferences";
import { EventToasts } from "./components/EventToasts";
import { ChallengePanel } from "./components/ChallengePanel";
import { GameOverDialog } from "./components/GameOverDialog";
import { LocalHistory } from "./components/LocalHistory";
import { ReplayDialog } from "./components/ReplayDialog";
import { Icon } from "./components/Icon";
import { OnlinePanel } from "./components/OnlinePanel";
import { PocketBox } from "./components/PocketBox";
import { PointsBar } from "./components/PointsBar";
import { RulesDialog } from "./components/RulesDialog";
import { ScoreCard } from "./components/ScoreCard";
import { StrikerDock } from "./components/StrikerDock";
import { TableSettings } from "./components/TableSettings";
import { useOnlineCarrom } from "./hooks/useOnlineCarrom";
import { type AimMode } from "./lib/aim";
import {
  clearLocalProgress,
  readLocalProgress,
  recordLocalGame,
  type LocalProgress,
} from "./lib/localProgress";
import { readReplay, type ReplayData } from "./lib/replay";
import { boardPlayers } from "./lib/tableSetup";
import {
  AccountPanel,
  GamePreferencesPanel,
  MatchChat,
  ModeSwitch,
  OpponentLeftDialog,
  ProfilePanel,
  parseMatchInvite,
  useGamePreferences,
  type GameHistoryEntry,
} from "@moongames/game-ui";
import {
  configureSound,
  playEvent,
  playSound,
  playMusic,
  stopMusic,
} from "./lib/audio";
import { MUSIC_FILES } from "./lib/soundCatalog";
import { setPlaybackSpeed } from "./lib/playback";
import {
  CARROM_FEATURES,
  SOUND_SETS,
  audibleVolume,
  playbackSpeed,
} from "./lib/preferences";
import { tableVisuals } from "./lib/designs";
import { positionFor } from "./lib/striker";
import { useArtChoices } from "./hooks/useArtChoices";
import { shotEvents, type TableEvent } from "./lib/events";
import {
  persistTheme,
  resolveGameTheme,
  storedTheme,
  type Theme,
} from "./lib/theme";
import { gameStorageKey } from "./lib/storage";
import { playbackTime } from "./lib/playback";

const GAME_ID = __MOONGAMES_GAME_ID__;

type Mode = "local" | "ai" | "online";

/** The tables a game can be played at, in seating order. */
const LOCAL_TABLE_SIZES = TABLE_SIZES;

/** How long a message stays on the table. */
const TOAST_MS = 5200;

/** How long the computer thinks before it shoots. */
const AI_THINK_MS = 900;

/** How far one press of a stepper moves the striker along the baseline. */
const STRIKER_STEP = 0.025;

const DEFAULT_POSITIONS: Record<CarromPlayer, number> = {
  white: 0.5,
  black: 0.5,
  green: 0.5,
  yellow: 0.5,
};

const SOUND_KEY = gameStorageKey("sound");
const AIM_KEY = gameStorageKey("aim");
const VARIANT_KEY = gameStorageKey("variant");

function storedSound(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

function storedAimMode(): AimMode {
  try {
    return window.localStorage.getItem(AIM_KEY) === "direct" ? "direct" : "pull";
  } catch {
    return "pull";
  }
}

function storedVariant(): GameVariant {
  try {
    const value = window.localStorage.getItem(VARIANT_KEY);
    if (value === "freestyle" || value === "practice" || value === "classic") {
      return value;
    }
  } catch {
    // Storage can be unavailable in private or embedded contexts.
  }
  return "classic";
}

function persistSound(enabled: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
  } catch {
    // Storage can be unavailable in private or embedded contexts.
  }
}

function queenText(state: CarromState | null, rules: ReturnType<typeof rulesOf>): string {
  if (state === null) {
    return "Waiting";
  }
  if (state.queen.status === "covered" && state.queen.owner !== undefined) {
    return rules.coverQueen
      ? `${PLAYER_LABEL[state.queen.owner]} covered`
      : `${PLAYER_LABEL[state.queen.owner]} took it`;
  }
  if (state.queen.status === "pending" && state.queen.owner !== undefined) {
    return `${PLAYER_LABEL[state.queen.owner]} to cover`;
  }
  return "On the table";
}

function statusTitle(
  state: CarromState | null,
  animation: CarromShotResult | null,
  aiThinking: boolean,
  nameOf: (player: CarromPlayer) => string,
  myTurn: boolean,
): string {
  if (state === null) {
    return "Waiting for the table";
  }
  if (state.status === "finished" && state.winner !== null) {
    return `${nameOf(state.winner)} wins`;
  }
  if (animation !== null) {
    return "Shot in motion";
  }
  if (aiThinking) {
    return `${nameOf(state.turn)} is lining up`;
  }
  if (state.queen.status === "pending") {
    return "Cover the queen";
  }
  if (myTurn) {
    return "Your turn";
  }
  return `${nameOf(state.turn)} to shoot`;
}

function statusDetail(
  state: CarromState | null,
  animation: CarromShotResult | null,
  aiThinking: boolean,
  nameOf: (player: CarromPlayer) => string,
): string {
  if (state === null) {
    return "Open a table to play online. The board is ready while you wait.";
  }
  if (animation !== null) {
    return "The table is settling. The next turn starts automatically.";
  }
  if (aiThinking) {
    return `${nameOf(state.turn)} is reading the angles and choosing a pocket line.`;
  }
  if (state.lastOutcome !== undefined) {
    return state.lastOutcome.message;
  }
  return "Drag from the striker toward a pocket. A longer drag gives the shot more power.";
}

export function isAiPlayer(
  mode: Mode,
  player: CarromPlayer,
  computer: readonly CarromPlayer[],
): boolean {
  return mode === "ai" && computer.includes(player);
}

export interface AppProps {
  bridge: GameBridge;
}

export default function App({ bridge }: AppProps) {
  // A game opened with a room in the address opens that room, so it starts
  // at the online table and not at a local board.
  const invite = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : parseMatchInvite(window.location.search),
    [],
  );
  const inviteMatchId = invite?.matchId ?? null;
  const inviteSpectate = invite?.spectate === true;
  const [mode, setMode] = useState<Mode>(
    inviteMatchId === null ? "local" : "online",
  );
  const [localTable, setLocalTable] = useState(2);
  // Two sides of two share the pieces and the queen in a doubles table.
  const [teams, setTeams] = useState(false);
  // Any seat of a local table can be played by the computer, not only black.
  const [computerPlayers, setComputerPlayers] = useState<CarromPlayer[]>([
    "black",
  ]);
  const [localRecord, setLocalRecord] = useState<LocalProgress>(() =>
    readLocalProgress(),
  );
  const recordedLocalGame = useRef<string | null>(null);
  const localShotsRef = useRef<import("./lib/replay").ReplayShot[]>([]);
  const [variant, setVariant] = useState<GameVariant>(storedVariant);
  const [turnSeconds, setTurnSeconds] = useState(0);
  const [striker, setStriker] = useState<string>(CARROM_STRIKERS[0]!.id);
  const [game, setGame] = useState<CarromState>(() =>
    createInitialState(tablePlayers(2), {
      variant: storedVariant(),
      strikers: {
        white: CARROM_STRIKERS[0]!.id,
        black: CARROM_STRIKERS[0]!.id,
      },
    }),
  );
  const [positions, setPositions] = useState<Record<CarromPlayer, number>>({
    ...DEFAULT_POSITIONS,
  });
  const [animation, setAnimation] = useState<CarromShotResult | null>(null);
  const [theme, setTheme] = useState<Theme>(storedTheme);
  const [soundOn, setSoundOn] = useState(storedSound);
  const [aimMode, setAimMode] = useState<AimMode>(storedAimMode);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [events, setEvents] = useState<TableEvent[]>([]);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiDifficulty, setAiDifficulty] =
    useState<CarromAiDifficulty>("normal");
  const [paused, setPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [onlineSeats, setOnlineSeats] = useState(2);
  const [clockDeadline, setClockDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [replay, setReplay] = useState<{
    title: string;
    data: ReplayData;
  } | null>(null);
  const { preferences } = useGamePreferences(GAME_ID);
  const { choices: artChoices } = useArtChoices();

  const appRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<CarromShotResult | null>(null);
  const soundTimers = useRef<number[]>([]);
  const modeRef = useRef<Mode>(mode);

  /**
   * The account and server the launcher handed over. A game opened from the
   * MoonGames menu plays with the shared account; a game opened on its own
   * is a guest on the same server.
   */
  const [handoff] = useState<GameHostConfig | null>(() =>
    readLauncherHandoff(__MOONGAMES_GAME_ID__),
  );
  const [hostConfig, setHostConfig] = useState<GameHostConfig | null>(handoff);
  const [hostInitReceived, setHostInitReceived] = useState(handoff !== null);
  const [hostInitTimedOut, setHostInitTimedOut] = useState(false);
  // The launcher hands over its account a moment after the game loads. The
  // table waits for that handover, so it never plays as a guest first.
  const hostReady =
    !bridge.isHosted || hostInitReceived || hostInitTimedOut;
  const online = useOnlineCarrom({
    autoJoinMatchId: inviteMatchId,
    autoSpectate: inviteSpectate,
    hostConfig,
    ready: hostReady,
  });
  /**
   * The online controller is a new object on every render. The callbacks
   * below read it through a ref so they keep the same identity, because a
   * callback that changes on every render restarts the shot animation and
   * the shot never finishes.
   */
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const onlineMode = mode === "online";
  const activeGame: CarromState | null = onlineMode ? online.game : game;
  const activeAnimation: CarromShotResult | null = onlineMode
    ? online.animation
    : animation;
  // Every seat keeps its own striker spot, so a table played on one device
  // gives each player their own place to flick from.
  const activeTurn: CarromPlayer = onlineMode
    ? (activeGame?.turn ?? "white")
    : game.turn;
  const seatedPlayers = onlineMode
    ? (Array.isArray(activeGame?.players) ? activeGame.players : [])
    : game.players;
  const tableRules = rulesOf(activeGame ?? game);

  /**
   * The table is turned for a player who is sitting at their own screen, so
   * their baseline is at the bottom of the screen and their striker is at
   * hand level. A table played on one device is shared, so it is never
   * turned.
   */
  const viewPlayer: CarromPlayer = onlineMode
    ? (online.myColour ?? activeTurn)
    : "white";
  /**
   * The striker control. Online it keeps one comfortable place, under the
   * player's own hand. On a table played on one device it moves to the side
   * of the player whose turn it is.
   */
  const dockPlayer: CarromPlayer = onlineMode
    ? (online.myColour ?? activeTurn)
    : activeTurn;
  const dockSide: CarromSide = onlineMode
    ? "bottom"
    : sideOf(dockPlayer);

  // The striker sits where the server left it, unless it is the local
  // player's own turn and they have moved it.
  const strikerPosition = useMemo(() => {
    if (!onlineMode) {
      return positionFor(positions, dockPlayer);
    }
    if (online.myColour === dockPlayer) {
      const local = positions[dockPlayer];
      if (local !== undefined) {
        return local;
      }
    }
    const striker = activeGame?.striker;
    if (striker === undefined) {
      return 0.5;
    }
    const baseline = baselineOf(dockPlayer);
    return baseline.slideAxis === "x" ? striker.x : striker.y;
  }, [
    activeGame?.striker,
    dockPlayer,
    online.myColour,
    onlineMode,
    positions,
  ]);

  /**
   * The name a player is known by. Online that is the account name, the
   * computer opponent is called Computer, and a table played on one device
   * numbers its seats.
   */
  const accountName =
    online.account !== null && online.account.kind !== "guest"
      ? online.account.username
      : null;
  const nameOf = useCallback(
    (player: CarromPlayer): string => {
      if (onlineMode) {
        const seat = online.seats.find((entry) => entry.colour === player);
        return seat?.username ?? PLAYER_LABEL[player];
      }
      if (isAiPlayer(mode, player, computerPlayers)) {
        return "Computer";
      }
      if (mode === "ai") {
        // The player has the table to themselves against the computer.
        return accountName ?? "You";
      }
      const index = game.players.indexOf(player);
      return `Player ${index + 1}`;
    },
    [accountName, computerPlayers, game.players, mode, online.seats, onlineMode],
  );

  /**
   * The score of every colour at the table. It is counted from the pieces
   * that are on the board, so the number a player sees always matches the
   * table, whether the game is played here or on the server.
   */
  const tableScores = useMemo(
    () => scoresFromBoard(activeGame ?? game),
    [activeGame, game],
  );

  /**
   * The name of every player at the table, so the score bar names the
   * people at it and not the colour of their pieces.
   */
  const playerNames = useMemo(() => {
    const names: Partial<Record<CarromPlayer, string>> = {};
    for (const player of seatedPlayers) {
      names[player] = nameOf(player);
    }
    return names as Record<CarromPlayer, string>;
  }, [nameOf, seatedPlayers]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    persistTheme(theme);
  }, [theme]);

  useEffect(() => {
    persistSound(soundOn);
  }, [soundOn]);

  useEffect(() => {
    configureSound({
      set: preferences.soundSet,
      volume: soundOn ? audibleVolume(preferences, 1) : 0,
      enabled: soundOn,
    });
  }, [preferences.soundSet, preferences.soundEnabled, preferences.soundVolume, soundOn]);

  useEffect(() => {
    setPlaybackSpeed(playbackSpeed(preferences.animationSpeed));
  }, [preferences.animationSpeed]);

  // The real game's music loops in the background when the player wants it.
  useEffect(() => {
    const track = MUSIC_FILES[preferences.soundSet]?.[0];
    if (preferences.musicEnabled && track !== undefined) {
      playMusic(track);
    } else {
      stopMusic();
    }
    return () => stopMusic();
  }, [preferences.musicEnabled, preferences.soundSet]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AIM_KEY, aimMode);
    } catch {
      // Storage can be unavailable in private or embedded contexts.
    }
  }, [aimMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(VARIANT_KEY, variant);
    } catch {
      // Storage can be unavailable in private or embedded contexts.
    }
  }, [variant]);

  useEffect(() => {
    return bridge.onMessage((message) => {
      if (message.type === "init") {
        // The launcher hands over the shared account and the server, so the
        // table plays as the same player the menu used.
        setHostConfig(message.config);
        setHostInitReceived(true);
        setTheme(resolveGameTheme(message.config.theme));
      } else if (message.type === "session") {
        setHostConfig((current) => ({
          protocol: current?.protocol ?? GAME_PROTOCOL_VERSION,
          gameId: current?.gameId ?? __MOONGAMES_GAME_ID__,
          locale: current?.locale ?? "en",
          theme: current?.theme ?? { mode: "dark" },
          nakama: current?.nakama,
          ...current,
          session: message.session,
        }));
      } else if (message.type === "theme") {
        setTheme(resolveGameTheme(message.theme));
      } else if (message.type === "pause") {
        setPaused(true);
      } else if (message.type === "resume") {
        setPaused(false);
      }
    });
  }, [bridge]);

  useEffect(() => {
    bridge.ready(__MOONGAMES_GAME_ID__, __MOONGAMES_GAME_VERSION__);
  }, [bridge]);

  useEffect(() => {
    // A host that never hands over its account must not keep the table
    // waiting. The game then plays as a guest on the same server.
    if (!bridge.isHosted || hostInitReceived) {
      setHostInitTimedOut(true);
      return;
    }
    const timer = window.setTimeout(() => setHostInitTimedOut(true), 750);
    return () => window.clearTimeout(timer);
  }, [bridge, hostInitReceived]);

  useEffect(() => {
    const update = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    update();
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  useEffect(() => {
    if (toast === null) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (events.length === 0) {
      return;
    }
    const timer = window.setTimeout(
      () => setEvents((current) => current.slice(1)),
      TOAST_MS,
    );
    return () => window.clearTimeout(timer);
  }, [events]);

  const pushEvents = useCallback((incoming: TableEvent[]) => {
    if (incoming.length === 0) {
      return;
    }
    setEvents((current) => [...current, ...incoming].slice(-4));
  }, []);

  // The server tells the table what happened, for example when a shot clock
  // runs out. Those messages belong on the table, not only in the sidebar.
  useEffect(() => {
    if (online.notice !== null) {
      setToast(online.notice);
    }
  }, [online.notice]);

  const clearSoundTimers = useCallback(() => {
    for (const timer of soundTimers.current) {
      window.clearTimeout(timer);
    }
    soundTimers.current = [];
  }, []);

  useEffect(() => {
    return () => {
      clearSoundTimers();
    };
  }, [clearSoundTimers]);

  const scheduleSounds = useCallback(
    (result: CarromShotResult) => {
      clearSoundTimers();
      if (!soundOn) {
        return;
      }
      playEvent("strike");
      // Every collision gets its own recording: a man against the frame is
      // not the same sound as a striker against a man.
      for (const impact of result.events) {
        if (impact.type !== "impact" || impact.strength < 0.12) {
          continue;
        }
        const [left, right] = impact.kinds;
        const event = impact.wall
          ? "hitEdge"
          : left === "striker" || right === "striker"
            ? "hitPuck"
            : "puckHit";
        const timer = window.setTimeout(
          () => playEvent(event),
          playbackTime(impact.time, result.duration) * 1000,
        );
        soundTimers.current.push(timer);
      }
      for (const event of result.pocketed) {
        const timer = window.setTimeout(
          () => playSound(event.kind === "queen" ? "queen" : "pocket"),
          // The sound is heard when the piece reaches the pocket, which is
          // when the shot is played back to that moment.
          playbackTime(event.time, result.duration) * 1000,
        );
        soundTimers.current.push(timer);
      }
      if (result.outcome.queenCovered) {
        playEvent("queenCover");
      }
      if (result.outcome.queenReturned) {
        playEvent("queenFail");
      }
      if (result.outcome.returnedDisc !== null) {
        playEvent("puckBack");
      }
      if (result.outcome.foul) {
        const timer = window.setTimeout(
          () => playSound("foul"),
          Math.max(80, playbackTime(result.duration, result.duration) * 1000),
        );
        soundTimers.current.push(timer);
      }
      if (result.outcome.winner !== null) {
        const timer = window.setTimeout(
          () => playSound("win"),
          Math.max(
            120,
            playbackTime(result.duration, result.duration) * 1000 + 140,
          ),
        );
        soundTimers.current.push(timer);
      }
    },
    [clearSoundTimers, soundOn],
  );

  /**
   * The table speaks for every shot, whether it was played here or on the
   * server: the strike, the pockets, the foul, and the win.
   */
  useEffect(() => {
    if (activeAnimation !== null) {
      scheduleSounds(activeAnimation);
    }
  }, [activeAnimation, scheduleSounds]);

  const handleShoot = useCallback(
    (shot: CarromShotInput) => {
      if (onlineMode) {
        // The server owns the table. The client only asks for the shot.
        onlineRef.current.sendShot(shot, striker);
        return;
      }
      if (animationRef.current !== null || paused) {
        return;
      }
      if (game.status !== "aiming") {
        return;
      }
      const error = validateShot(game, shot);
      if (error !== null) {
        setToast(error);
        return;
      }
      const result = simulateShot(game, shot);
      localShotsRef.current.push({
        by: game.turn,
        colour: game.turn,
        position: shot.position,
        angle: shot.angle,
        power: shot.power,
        striker: game.strikers[game.turn],
        pocketed_count: result.outcome.ownPocketed,
      });
      animationRef.current = result;
      setAnimation(result);
      setPositions((current) => ({
        ...current,
        [game.turn]: shot.position,
      }));
      setAiThinking(false);
    },
    [game, onlineMode, paused, striker],
  );

  const handleAnimationComplete = useCallback(() => {
    const result = onlineMode ? onlineRef.current.animation : animationRef.current;
    if (onlineMode) {
      onlineRef.current.clearAnimation();
    } else {
      if (result === null) {
        return;
      }
      animationRef.current = null;
      setAnimation(null);
      setGame(result.state);
      setToast(result.outcome.message);
      if (result.outcome.winner !== null) {
        setResultOpen(true);
      }
    }
    // The table speaks in every mode: a shot is heard, a pocket is heard,
    // the events are shown, and the phone answers with a buzz.
    if (result === null) {
      return;
    }
    pushEvents(shotEvents(result, Date.now()));
    if (result.outcome.winner !== null) {
      bridge.haptic("success");
    } else if (result.outcome.foul) {
      bridge.haptic("error");
    } else if (result.outcome.ownPocketed > 0) {
      bridge.haptic("success");
    } else {
      bridge.haptic("light");
    }
  }, [bridge, onlineMode, pushEvents]);

  const resetBoard = useCallback(
    (
      message: string,
      options: { solo?: boolean; tableSize?: number; mode?: Mode } = {},
    ) => {
      clearSoundTimers();
      animationRef.current = null;
      recordedLocalGame.current = null;
      localShotsRef.current = [];
      setAnimation(null);
      const solo = options.solo === true;
      // The size and the mode are passed in, because React has not applied
      // the new picker values yet when the board is built here.
      const size = options.tableSize ?? localTable;
      const boardMode = options.mode ?? mode;
      const players = boardPlayers(boardMode, size, solo);
      setGame(
        createInitialState(players, {
          // A challenge table is a freestyle solo table: the queen does not
          // need covering, so the challenge is only about the shots.
          variant: solo ? "freestyle" : variant,
          turnSeconds,
          solo,
          teams: teams && size === 4,
          strikers: {
            white: striker,
            black: solo
              ? CARROM_STRIKERS[0]!.id
              : boardMode === "ai"
                ? CARROM_STRIKERS[0]!.id
                : striker,
            green: striker,
            yellow: striker,
          },
        }),
      );
      setPositions({ ...DEFAULT_POSITIONS });
      setAiThinking(false);
      setResultOpen(false);
      setToast(message);
    },
    [clearSoundTimers, localTable, mode, striker, teams, turnSeconds, variant],
  );

  const handleNewGame = useCallback(() => {
    // A challenge survives a new board: it starts again from the opening.
    resetBoard(
      challengeId !== null
        ? "Challenge restarted."
        : `Fresh board. ${PLAYER_LABEL.white} to shoot.`,
      { solo: challengeId !== null },
    );
  }, [challengeId, resetBoard]);

  const startChallenge = useCallback(
    (challenge: CarromChallenge) => {
      setChallengeId(challenge.id);
      setMode("local");
      resetBoard(`${challenge.label}. ${challenge.hint}`, { solo: true });
    },
    [resetBoard],
  );

  const quitChallenge = useCallback(() => {
    setChallengeId(null);
    resetBoard("Challenge finished. A normal board is ready.");
  }, [resetBoard]);

  const handleModeChange = useCallback(
    (next: Mode) => {
      if (next === mode) {
        return;
      }
      setMode(next);
      // A challenge belongs to the local table, so leaving that table ends it.
      setChallengeId(null);
      // Leaving the online mode leaves the table behind.
      if (mode === "online" && next !== "online") {
        void online.leaveMatch();
      }
      resetBoard(
        next === "ai"
          ? `You are ${PLAYER_LABEL.white}. Computer takes ${PLAYER_LABEL.black}.`
          : next === "online"
            ? "Open a table to play online."
            : "Pass-and-play board ready.",
        { mode: next },
      );
    },
    [mode, online, resetBoard],
  );

  const lastPlaceSound = useRef(0);
  const handleStrikerChange = useCallback(
    (value: number, player: CarromPlayer) => {
      setPositions((current) => ({
        ...current,
        [player]: nearestValidStrikerPosition(activeGame ?? game, value),
      }));
      // One placement click per short burst, not one per pixel of slider.
      if (Date.now() - lastPlaceSound.current > 180) {
        lastPlaceSound.current = Date.now();
        playEvent("place");
      }
    },
    [activeGame, game],
  );

  // A new player always takes the table with the striker in the middle of
  // their own baseline. Without this the slider keeps the last position of
  // whoever played before, so the striker jumps to a corner on a turn change.
  const currentTurn = activeGame?.turn ?? game.turn;
  const lastTurnRef = useRef(currentTurn);
  useEffect(() => {
    if (lastTurnRef.current !== currentTurn) {
      lastTurnRef.current = currentTurn;
      setPositions({ ...DEFAULT_POSITIONS });
    }
  }, [currentTurn]);

  const nudgeStriker = useCallback(
    (direction: -1 | 1, player: CarromPlayer) => {
      setPositions((current) => ({
        ...current,
        [player]: nearestValidStrikerPosition(
          activeGame ?? game,
          (current[player] ?? 0.5) + direction * STRIKER_STEP,
        ),
      }));
    },
    [activeGame, game],
  );

  // The table settings that change the rules start a fresh board.
  const applyVariant = useCallback(
    (next: GameVariant) => {
      setVariant(next);
      resetBoard(`${variantRules(next).label} rules. Fresh board.`);
    },
    [resetBoard],
  );

  const applyTurnSeconds = useCallback(
    (next: number) => {
      setTurnSeconds(next);
      resetBoard(
        next === 0
          ? "Shot clock off. Fresh board."
          : `${next} second shot clock. Fresh board.`,
      );
    },
    [resetBoard],
  );

  const applyStriker = useCallback(
    (next: string) => {
      setStriker(next);
      if (onlineMode) {
        setToast("Your striker changes on your next shot.");
        return;
      }
      resetBoard("Fresh board with your striker.");
    },
    [onlineMode, resetBoard],
  );

  const applyComputerPlayers = useCallback(
    (next: CarromPlayer[]) => {
      const seats = tablePlayers(localTable);
      const allowed = next.filter((seat) => seats.includes(seat));
      // One seat has to stay with a person, or nobody can start the game.
      if (allowed.length >= seats.length) {
        setToast("Leave at least one seat to a player.");
        return;
      }
      setComputerPlayers(allowed);
      resetBoard("Computer seats changed. Fresh board.", { mode: "ai" });
    },
    [localTable, resetBoard],
  );

  useEffect(() => {
    if (
      mode !== "ai" ||
      !isAiPlayer(mode, game.turn, computerPlayers) ||
      game.status !== "aiming" ||
      animation !== null ||
      paused
    ) {
      setAiThinking(false);
      return;
    }
    setAiThinking(true);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        if (cancelled || modeRef.current !== "ai" || animationRef.current !== null) {
          return;
        }
        const aiShot = await chooseAiShotAsync(game, {
          difficulty: aiDifficulty,
        });
        if (cancelled || modeRef.current !== "ai" || animationRef.current !== null) {
          return;
        }
        setAiThinking(false);
        handleShoot(aiShot);
      })();
    }, AI_THINK_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [computerPlayers, mode, game, animation, paused, handleShoot]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement !== null) {
        await document.exitFullscreen();
      } else {
        await appRef.current?.requestFullscreen();
      }
    } catch {
      setToast("Fullscreen is not available in this browser.");
    }
  }, []);

  const onlineMyTurn =
    onlineMode &&
    online.myColour !== null &&
    activeGame !== null &&
    online.myColour === activeGame.turn;

  // The challenge table: a solo table with a target.
  const challenge = challengeId !== null ? challengeById(challengeId) : null;
  const challengeState = useMemo(() => {
    if (challenge === null) {
      return null;
    }
    return challengeProgress(challenge, game.scores.white, game.shotNumber);
  }, [challenge, game.scores.white, game.shotNumber]);
  const challengeFinished = challengeState?.finished ?? false;
  const challengeWon = challengeState?.won ?? false;

  useEffect(() => {
    if (!challengeFinished) {
      return;
    }
    setToast(
      challengeWon
        ? `Challenge complete. ${challengeState?.pocketed ?? 0} pieces in ${challengeState?.shots ?? 0} shots.`
        : "The challenge is over. Try the next one.",
    );
  }, [challengeFinished, challengeState, challengeWon]);

  const canShoot = onlineMode
    ? activeGame !== null &&
      activeGame.status === "aiming" &&
      activeAnimation === null &&
      !paused &&
      onlineMyTurn
    : game.status === "aiming" &&
      animation === null &&
      !paused &&
      !aiThinking &&
      !challengeFinished &&
      !isAiPlayer(mode, game.turn, computerPlayers);

  // The shot clock. Online tables take the deadline from the server, local
  // tables run it here.
  const activeDeadline = onlineMode
    ? (activeGame?.turnDeadline ?? null)
    : clockDeadline;
  const clockSeconds = activeDeadline === null
    ? null
    : Math.max(0, Math.ceil((activeDeadline - now) / 1000));

  // The real game ticks the clock in the last seconds of a shot.
  const lastClockTick = useRef<number | null>(null);
  useEffect(() => {
    if (clockSeconds !== null && clockSeconds > 0 && clockSeconds <= 5) {
      if (lastClockTick.current !== clockSeconds) {
        lastClockTick.current = clockSeconds;
        playEvent("clock");
      }
    } else {
      lastClockTick.current = null;
    }
  }, [clockSeconds]);

  // The server finishes an online table, so the result dialog follows the
  // server and not the local board. The result is watched by its key, so the
  // dialog is not opened again by every later state.
  const onlineResult = online.state?.result ?? null;
  const resultKey =
    onlineResult === null
      ? null
      : `${onlineResult.winnerColour ?? "none"}:${onlineResult.endedAt ?? 0}`;
  const seenResultRef = useRef<string | null>(null);
  useEffect(() => {
    if (resultKey === null) {
      seenResultRef.current = null;
      return;
    }
    if (seenResultRef.current === resultKey) {
      return;
    }
    seenResultRef.current = resultKey;
    setResultOpen(true);
  }, [resultKey]);

  // A table played on this device keeps its own record. The key makes sure a
  // finished game is written once, however many times the board is repainted.
  useEffect(() => {
    if (onlineMode || challengeId !== null) {
      recordedLocalGame.current = null;
      return;
    }
    if (game.status !== "finished" || game.winner === null) {
      return;
    }
    const key = `${game.shotNumber}:${game.winner}`;
    if (recordedLocalGame.current === key) {
      return;
    }
    recordedLocalGame.current = key;
    setLocalRecord(
      recordLocalGame({
        seats: game.players,
        variant,
        winner: game.winner,
        winnerTeam: game.winnerTeam,
        shots: game.shotNumber,
        replay: {
          variant,
          teams: game.teams,
          seats: game.players,
          shots: localShotsRef.current,
        },
      }),
    );
  }, [challengeId, game.players, game.shotNumber, game.status, game.winner, onlineMode, variant]);

  /**
   * The table tells the player when it is their turn. A player should never
   * have to watch the board to find out.
   */
  const turnNoticeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!onlineMode || activeGame === null) {
      turnNoticeRef.current = null;
      return;
    }
    const key = `${activeGame.shotNumber}:${activeGame.turn}`;
    if (turnNoticeRef.current === key) {
      return;
    }
    turnNoticeRef.current = key;
    if (online.myColour !== null && online.myColour === activeGame.turn) {
      setToast("Your turn.");
    }
  }, [activeGame, online.myColour, onlineMode]);

  useEffect(() => {
    // The clock only ticks while a table has a clock, so the page does not
    // redraw for nothing.
    if (activeDeadline === null) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [activeDeadline === null]);

  useEffect(() => {
    if (onlineMode) {
      return;
    }
    if (turnSeconds <= 0) {
      setClockDeadline(null);
      return;
    }
    setClockDeadline(Date.now() + turnSeconds * 1000);
  }, [game.shotNumber, game.turn, onlineMode, turnSeconds]);

  useEffect(() => {
    if (onlineMode || turnSeconds <= 0) {
      return;
    }
    if (game.status !== "aiming" || animation !== null || paused) {
      return;
    }
    if (isAiPlayer(mode, game.turn, computerPlayers)) {
      return;
    }
    if (clockSeconds === null || clockSeconds > 0) {
      return;
    }
    // The clock ran out. The turn is handed on without a shot.
    setGame((current) => passTurn(current));
    setToast("Time is up. The turn passes.");
  }, [
    animation,
    clockSeconds,
    computerPlayers,
    game,
    mode,
    onlineMode,
    paused,
    turnSeconds,
  ]);

  const active = activeGame !== null && activeGame.status === "aiming"
    ? activeGame.turn
    : false;
  const myTurn = onlineMode
    ? onlineMyTurn
    : !isAiPlayer(mode, activeTurn, computerPlayers);
  const winner: CarromPlayer | null = onlineMode
    ? (onlineResult?.winnerColour ?? null)
    : game.winner;
  const winningTeam =
    (onlineMode ? onlineResult?.winnerTeam : game.winnerTeam) ??
    (teams && winner ? teamOf(winner) : null);
  const title = statusTitle(
    activeGame,
    activeAnimation,
    aiThinking,
    nameOf,
    myTurn,
  );
  const detail = statusDetail(activeGame, activeAnimation, aiThinking, nameOf);
  const queen = queenText(activeGame, tableRules);
  const queenPending = activeGame?.queen.status === "pending";
  const modeLabel =
    mode === "ai"
      ? "Computer"
      : mode === "online"
        ? online.spectating
          ? "Watching"
          : "Online table"
        : "Pass & play";
  const version = __MOONGAMES_GAME_VERSION__;

  // Nakama sends an empty list as an empty object, so the shot log is only
  // read as a list when it really is one.
  const shots = Array.isArray(online.state?.shots) ? online.state.shots : [];
  const recentShots = shots.slice(-8).reverse();
  const pocketed = useMemo(() => {
    const counts = { white: 0, black: 0, green: 0, yellow: 0 };
    for (const disc of activeGame?.discs ?? []) {
      if (disc.kind !== "queen" && disc.pocketed) {
        counts[disc.kind] += 1;
      }
    }
    return counts;
  }, [activeGame]);

  const strikerLabel = (player: CarromPlayer): string | undefined => {
    const id = onlineMode
      ? activeGame?.strikers?.[player]
      : player === "white" || player === activeTurn
        ? striker
        : undefined;
    if (id === undefined) {
      return undefined;
    }
    return CARROM_STRIKERS.find((entry) => entry.id === id)?.label ?? id;
  };

  return (
    <div
      className={`app${isFullscreen ? " app--board-only" : ""}`}
      ref={appRef}
    >
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="carrom" size={27} strokeWidth={1.55} />
          </span>
          <div>
            <p className="brand-kicker">MoonGames</p>
            <h1>Carrom</h1>
          </div>
          <span className="brand-version">v{version}</span>
        </div>

        <div className="header-actions">
          <ModeSwitch
            modes={[
              { id: "local", label: "Local", icon: <Icon name="users" size={15} /> },
              { id: "ai", label: "vs AI", icon: <Icon name="cpu" size={15} /> },
              { id: "online", label: "Online", icon: <Icon name="sparkles" size={15} /> },
            ]}
            mode={mode}
            onChange={(next) =>
              handleModeChange(next as "local" | "ai" | "online")
            }
          />

          <button
            type="button"
            className="icon-button"
            onClick={() => setRulesOpen(true)}
            aria-label="Open rules"
            title="Rules"
          >
            <Icon name="book" size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setSoundOn((current) => !current)}
            aria-label={soundOn ? "Mute sound" : "Enable sound"}
            aria-pressed={soundOn}
            title={soundOn ? "Mute sound" : "Enable sound"}
          >
            <Icon name={soundOn ? "volume" : "volume-off"} size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle light and dark theme"
            title="Toggle theme"
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => void toggleFullscreen()}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            <Icon name={isFullscreen ? "minimize" : "maximize"} size={18} />
          </button>
          {onlineMode ? null : (
            <button
              type="button"
              className="button button--ghost header-new"
              onClick={handleNewGame}
            >
              <Icon name="refresh" size={16} />
              New board
            </button>
          )}
        </div>
      </header>

      <main className="game-layout">
        <section className="board-panel">
          {isFullscreen ? (
            <button
              type="button"
              className="fullscreen-exit"
              onClick={() => void toggleFullscreen()}
              aria-label="Exit fullscreen"
              title="Exit fullscreen"
            >
              <Icon name="minimize" size={18} strokeWidth={2} />
            </button>
          ) : null}
          <PointsBar
            players={seatedPlayers}
            scores={tableScores}
            queen={activeGame?.queen ?? game.queen}
            rules={tableRules}
            active={activeGame?.turn ?? game.turn}
            names={playerNames}
          />
          <div className="turn-strip">
            <span className={`turn-disc turn-disc--${activeGame?.turn ?? "white"}`} />
            <div className="turn-strip__copy">
              <span className="eyebrow">Current shot</span>
              <strong>{title}</strong>
            </div>
            {clockSeconds !== null ? (
              <span
                className={`turn-clock${
                  clockSeconds <= 5 ? " turn-clock--urgent" : ""
                }`}
                title="The shot clock"
              >
                <Icon name="clock" size={14} strokeWidth={2} />
                {clockSeconds}s
              </span>
            ) : null}
            {online.connection !== "connected" ? (
              <span
                className={`turn-connection turn-connection--${online.connection}`}
                title="The MoonGames connection"
              >
                {online.connection === "connecting" ? "Connecting…" : "Offline"}
              </span>
            ) : null}
            <span className="turn-strip__meta">{modeLabel}</span>
          </div>

          <div className={`board-frame board-frame--${dockSide}`}>
            <div className="board-stage">
              <CarromBoard
                state={activeGame ?? game}
                strikerPosition={strikerPosition}
                animation={activeAnimation}
                disabled={!canShoot}
                theme={theme}
                aimMode={aimMode}
                view={viewPlayer}
                onShoot={handleShoot}
                onAnimationComplete={handleAnimationComplete}
                visuals={tableVisuals(
                  preferences.boardTheme,
                  preferences.strikerDesign,
                  preferences.pieceSet,
                  {
                    boards: artChoices.boards,
                    strikers: artChoices.strikers,
                    pucks: artChoices.pucks,
                  },
                )}
              />
            </div>
            <StrikerDock
              player={dockPlayer}
              side={dockSide}
              position={strikerPosition}
              disabled={!canShoot}
              onChange={(value) => handleStrikerChange(value, dockPlayer)}
              onNudge={(direction) => nudgeStriker(direction, dockPlayer)}
            />
          </div>

          <div className="board-controls">
            <div className="aim-mode">
              <span className="aim-mode__label">Aim</span>
              <div
                className="aim-mode__switch"
                role="radiogroup"
                aria-label="Aim style"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={aimMode === "pull"}
                  className={`aim-mode__button${aimMode === "pull" ? " aim-mode__button--active" : ""}`}
                  onClick={() => setAimMode("pull")}
                >
                  Pull back
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={aimMode === "direct"}
                  className={`aim-mode__button${aimMode === "direct" ? " aim-mode__button--active" : ""}`}
                  onClick={() => setAimMode("direct")}
                >
                  Direct
                </button>
              </div>
            </div>
            <p className="aim-hint">
              <Icon name="target" size={16} />
              {aimMode === "pull"
                ? "Pull back from your target to load the striker, then release to launch."
                : "Drag from the striker toward your target and release to shoot."}{" "}
              Pull farther for more power.
            </p>
          </div>
        </section>

        <aside className="sidebar">
          {mode === "local" ? (
            <ChallengePanel
              active={challenge}
              progress={challengeState}
              onStart={startChallenge}
              onQuit={quitChallenge}
            />
          ) : null}

          {onlineMode ? (
            <OnlinePanel
              online={online}
              seats={onlineSeats}
              onSeatsChange={setOnlineSeats}
              settings={{ variant, turnSeconds, teams: teams && onlineSeats === 4 }}
            />
          ) : null}

          <section className="panel table-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Scoreboard</p>
                <h2>Table</h2>
              </div>
              <span className="panel-heading__meta">
                {tableRules.label} · {seatedPlayers.length} players
              </span>
            </div>
            <div className="score-list">
              {onlineMode
                ? online.seats.map((seat, seatIndex) => (
                    <ScoreCard
                      key={seat.user_id}
                      player={seat.colour}
                      name={seat.username}
                      left={Math.max(0, CARROM_BOARD.piecesPerPlayer - (tableScores[seat.colour] ?? 0))}
                      active={active === seat.colour}
                      queen={activeGame?.queen ?? { status: "board" }}
                      ai={false}
                      seat={seatIndex + 1}
                      striker={strikerLabel(seat.colour)}
                    />
                  ))
                : game.players.map((player, seat) => (
                    <ScoreCard
                      key={player}
                      player={player}
                      name={nameOf(player)}
                      left={Math.max(0, CARROM_BOARD.piecesPerPlayer - (tableScores[player] ?? 0))}
                      active={active === player}
                      queen={game.queen}
                      ai={isAiPlayer(mode, player, computerPlayers)}
                      seat={seat + 1}
                      striker={strikerLabel(player)}
                    />
                  ))}
            </div>
            <div className={`queen-row${queenPending ? " queen-row--pending" : ""}`}>
              <span className="queen-dot" />
              <span>Queen</span>
              <strong>{queen}</strong>
            </div>
            <PocketBox
              pocketed={pocketed}
              players={activeGame?.players ?? game.players}
              queenOwner={activeGame?.queen.owner ?? null}
              queenPocketed={activeGame?.queen.status !== "board"}
            />
          </section>

          <TableSettings
            tableSizes={LOCAL_TABLE_SIZES}
            tableSize={onlineMode ? onlineSeats : localTable}
            onTableSizeChange={(size) => {
              if (onlineMode) {
                setOnlineSeats(size);
                return;
              }
              setLocalTable(size);
              const seats = tablePlayers(size);
              setComputerPlayers((current) =>
                current.filter((seat) => seats.includes(seat)),
              );
              resetBoard(`${size} player table ready. ${PLAYER_LABEL.white} to shoot.`, {
                tableSize: size,
              });
            }}
            tableSizeLocked={onlineMode && online.matchId !== null}
            variant={
              onlineMode && activeGame !== null
                ? ((activeGame.rules?.id ?? "classic") as GameVariant)
                : variant
            }
            onVariantChange={applyVariant}
            striker={striker}
            onStrikerChange={applyStriker}
            turnSeconds={
              onlineMode && activeGame !== null
                ? (activeGame.turnSeconds ?? 0)
                : turnSeconds
            }
            onTurnSecondsChange={applyTurnSeconds}
            locked={onlineMode && online.matchId !== null}
            computerSeats={
              !onlineMode && challengeId === null
                ? tablePlayers(localTable)
                : undefined
            }
            computerPlayers={computerPlayers}
            onComputerPlayersChange={applyComputerPlayers}
            teams={teams}
            onTeamsChange={(next) => {
              setTeams(next);
              resetBoard(
                next
                  ? "Doubles: partners share their pieces and the queen."
                  : "Everyone for themselves. Fresh board.",
              );
            }}
          />

          <CarromPreferences gameId={GAME_ID} theme={theme} />

          {!onlineMode && challengeId === null ? (
            <LocalHistory
              progress={localRecord}
              seats={tablePlayers(localTable)}
              onClear={() => {
                clearLocalProgress();
                setLocalRecord(readLocalProgress());
                setToast("The local table record was cleared.");
              }}
              onReplay={(record) => {
                if (record.replay !== undefined) {
                  setReplay({ title: "Replay of a local table", data: record.replay });
                }
              }}
            />
          ) : null}

          <section className="panel status-panel" aria-live="polite">
            <div className="status-panel__icon">
              <Icon
                name={
                  activeGame?.status === "finished"
                    ? "trophy"
                    : queenPending
                      ? "sparkles"
                      : "target"
                }
                size={20}
              />
            </div>
            <div>
              <p className="eyebrow">
                {activeGame?.status === "finished"
                  ? "Result"
                  : activeGame?.lastOutcome !== undefined
                    ? "Last shot"
                    : "Table read"}
              </p>
              {activeGame?.status === "finished" ? <h2>{title}</h2> : null}
              <p>{detail}</p>
            </div>
          </section>

          {onlineMode ? (
            <>
              {recentShots.length > 0 ? (
                <section className="panel shot-list">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">Table log</p>
                      <h2>Shots</h2>
                    </div>
                    <span className="panel-heading__meta">{shots.length}</span>
                  </div>
                  <ol className="shot-list__items">
                    {recentShots.map((shot, index) => (
                      <li key={`${shots.length - index}`}>
                        <span
                          className={`shot-list__disc shot-list__disc--${shot.colour}`}
                        />
                        <span className="shot-list__text">
                          {PLAYER_LABEL[shot.colour]} shot
                          {shot.pocketed_count > 0
                            ? ` and pocketed ${shot.pocketed_count}`
                            : " and missed"}
                        </span>
                        <span className="shot-list__power">
                          {Math.round(shot.power * 100)}%
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
              <AccountPanel
                account={online.account}
                authBusy={online.authBusy}
                authError={online.authError}
                authNotice={online.authNotice}
                signIn={online.signIn}
                signUp={online.signUp}
                signOut={online.signOut}
                clearAuthFeedback={online.clearAuthFeedback}
              />
              <ProfilePanel
                connected={online.connection === "connected"}
                userId={online.myUserId}
                profile={online.profile}
                history={online.history}
                leaderboard={online.leaderboard}
                myLeaderboard={online.myLeaderboard}
                loading={online.profileLoading}
                error={online.profileError}
                onRefresh={() => void online.refreshProfile()}
                emptyProfileText="Your rating and your pocket box fill in after your first game."
                emptyHistoryText="Your finished carrom games will appear here."
                emptyLeaderboardText="Play a quick match to enter the rating leaderboard."
                statLabels={{
                  pieces_pocketed: "Pieces pocketed",
                  queens_covered: "Queens covered",
                  best_streak: "Best streak",
                }}
                historyMeta={(entry) =>
                  `${entry.mode === "private" ? "Private" : "Quick"} · ${
                    entry.endedAt > 0
                      ? new Date(entry.endedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : "Unknown date"
                  }`
                }
                onReplay={(entry) => {
                  const data = readReplay(entry.metadata);
                  if (data !== null) {
                    setReplay({
                      title: `Replay vs ${entry.opponent.username}`,
                      data,
                    });
                  } else {
                    setToast("This game has no replay to show.");
                  }
                }}
              />
            </>
          ) : null}

          {mode === "ai" ? (
            <section className="panel ai-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Computer</p>
                  <h2>Opponent</h2>
                </div>
              </div>
              <div className="ai-panel__options" role="radiogroup">
                {(
                  [
                    { id: "easy", label: "Easy" },
                    { id: "normal", label: "Normal" },
                    { id: "hard", label: "Hard" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={aiDifficulty === option.id}
                    className={`ai-panel__option${
                      aiDifficulty === option.id ? " ai-panel__option--active" : ""
                    }`}
                    onClick={() => setAiDifficulty(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="ai-panel__note">
                The AI plays like a person: it reads the table, picks a pocket
                line, and misses the hard ones.
              </p>
            </section>
          ) : null}

          <section className="panel tips-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Shot notes</p>
                <h2>Small edges</h2>
              </div>
            </div>
            <ul className="tip-list">
              <li>
                <span className="tip-mark" />
                Aim through the piece, not at it, to send it toward a pocket.
              </li>
              <li>
                <span className="tip-mark" />
                A soft drag is easier to control near crowded pockets.
              </li>
              <li>
                <span className="tip-mark" />
                {tableRules.coverQueen
                  ? "The queen must be covered before the last piece can finish the board."
                  : "The queen is an ordinary piece here. Pocket it like any other."}
              </li>
              {tableRules.fouls ? (
                <li>
                  <span className="tip-mark" />
                  A striker in a pocket gives one of your pieces back.
                </li>
              ) : (
                <li>
                  <span className="tip-mark" />
                  There are no fouls on this table. Nothing is given back.
                </li>
              )}
            </ul>
          </section>

          <p className="sidebar-note">
            {mode === "ai"
              ? "You against Computer"
              : mode === "online"
                ? online.spectating
                  ? "Watching a table"
                  : "Shared table"
                : `${localTable} players, one device`}{" "}
            · {isFullscreen ? "Fullscreen" : "Windowed"}
          </p>
        </aside>
      </main>

      {onlineMode ? (
        <div className="chat-dock">
          <MatchChat
            matchId={online.matchId}
            messages={online.chat}
            selfUserId={online.myUserId}
            onSend={(text) => online.sendChat(text)}
          />
        </div>
      ) : null}

      {replay !== null ? (
        <ReplayDialog
          title={replay.title}
          data={replay.data}
          theme={theme}
          onClose={() => setReplay(null)}
        />
      ) : null}

      <RulesDialog
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        variant={(activeGame?.rules?.id as GameVariant | undefined) ?? variant}
        colours={(activeGame?.players ?? seatedPlayers).length > 0
          ? (activeGame?.players ?? seatedPlayers)
          : tablePlayers(onlineMode ? onlineSeats : localTable)}
      />
      {online.opponentLeft !== null ? (
        <OpponentLeftDialog
          name={online.opponentLeft}
          onLeave={() => {
            online.dismissOpponentLeft();
            void online.leaveMatch();
          }}
          onStay={online.dismissOpponentLeft}
        />
      ) : null}
      {resultOpen && winner !== null ? (
        <GameOverDialog
          winner={winner}
          winnerName={nameOf(winner)}
          variant={(activeGame?.rules?.id as GameVariant | undefined) ?? variant}
          seats={(activeGame?.players ?? seatedPlayers).length}
          winnerTeam={winningTeam}
          winnerTeamLabel={
            winningTeam ? CARROM_TEAM_LABEL[winningTeam] : undefined
          }
          onNewGame={handleNewGame}
          onRematch={
            onlineMode
              ? () => {
                  setResultOpen(false);
                  void online.leaveMatch().then(() =>
                    online.createPrivateRoom(onlineSeats, {
                      variant,
                      turnSeconds,
                      teams: teams && onlineSeats === 4,
                    }),
                  );
                }
              : undefined
          }
          onClose={() => setResultOpen(false)}
        />
      ) : null}
      <EventToasts
        events={events}
        onDismiss={(id) =>
          setEvents((current) => current.filter((event) => event.id !== id))
        }
      />
      {toast !== null ? (
        <div className="toast" role="status">
          <Icon name="sparkles" size={16} />
          <span>{toast}</span>
          <button
            type="button"
            className="toast__close"
            onClick={() => setToast(null)}
            aria-label="Dismiss message"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
