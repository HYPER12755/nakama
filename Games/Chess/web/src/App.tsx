import { useEffect, useMemo, useRef, useState } from "react";
import {
  GAME_PROTOCOL_VERSION,
  readLauncherHandoff,
  type GameBridge,
  type GameHostConfig,
  type GameTheme,
} from "@moongames/game-sdk";
import {
  ChessEngine,
  type ChessState,
  type Color,
} from "@moongames/chess-core";
import {
  AccountPanel,
  GamePreferencesPanel,
  GameToolbar,
  Icon,
  MatchChat,
  ModeSwitch,
  OpponentLeftDialog,
  PlayerCard,
  ProfilePanel,
  Replay,
  ShowResizeHandle,
  animationDuration,
  copyText,
  parseLaunchInvite,
  parseMatchInvite,
  clearMatchInviteFromLocation,
  useGamePreferences,
} from "@moongames/game-ui";
import { AiPanel } from "./components/AiPanel";
import { BoardResizeHandle } from "./components/BoardResizeHandle";
import { ChessBoard } from "./components/ChessBoard";
import { CoordinateTrainer } from "./components/CoordinateTrainer";
import { EngineEvalBar } from "./components/EngineEvalBar";
import { EnginePv } from "./components/EnginePv";
import { EnginePvBoard } from "./components/EnginePvBoard";
import { ChessGameOverDialog } from "./components/ChessGameOverDialog";
import { ChessCaptured } from "./components/ChessCaptured";
import { ChessGameStats } from "./components/ChessGameStats";
import { GameReplayBar } from "./components/GameReplayBar";
import { GameReportDialog } from "./components/GameReportDialog";
import { GameStatus } from "./components/GameStatus";
import { MoveList } from "./components/MoveList";
import { OnlineGameToolbar } from "./components/OnlineGameToolbar";
import { OpeningExplorer } from "./components/OpeningExplorer";
import { PuzzlePanel } from "./components/PuzzlePanel";
import { OnlinePanel } from "./components/OnlinePanel";
import { PositionDesk } from "./components/PositionDesk";
import { PromotionPicker } from "./components/PromotionPicker";
import { PieceImage, PiecePreview } from "./components/Piece";
import { ReplayDialog } from "./components/ReplayDialog";
import {
  playCapture,
  playCheck,
  playCheckmate,
  playDraw,
  playGameStart,
  playLose,
  playLowTime,
  playMove,
  playRefused,
  playSelect,
  playWin,
  preloadSound,
  configureSound,
} from "./lib/audio";
import type { OnlineHistoryEntry } from "./lib/onlineProtocol";
import type { Square } from "@moongames/chess-core";
import {
  BOARD_THEMES,
  boardTheme as boardThemeOf,
} from "./lib/boardThemes";
import {
  PIECE_SET_IDS,
  MOONGAMES_PIECES,
  pieceImageUrl,
  pieceSetLabel,
} from "./lib/pieceSets";
import { SOUND_SETS } from "./lib/soundSets";
import { readBoardSize, writeBoardSize } from "./lib/boardSize";
import { replayFrames, type ReplayFrame } from "./lib/replay";
import {
  useChessGame,
  type AiGameSettings,
} from "./hooks/useChessGame";
import { useOnlineChess } from "./hooks/useOnlineChess";
import { useEngineAccess } from "./hooks/useEngineAccess";
import { useEngineAnalysis } from "./hooks/useEngineAnalysis";
import { positionAfter, type PvPosition } from "./lib/engine/pvBoard";
import type { EngineMode } from "./lib/engine/externalEngine";
import { engineVisible } from "./lib/engine/externalEngine";

type GameMode = "local" | "ai" | "online";

type Theme = "dark" | "light";

/**
 * Read once at module scope. sessionStorage survives a tab reload, so a
 * verified game launched from the web menu keeps the launcher account without
 * putting a token in the URL or history.
 */
const launcherHandoff = readLauncherHandoff(__MOONGAMES_GAME_ID__);

/** The identifiers of this title come from the build. */
const GAME_ID = __MOONGAMES_GAME_ID__;

/** The position every game starts from. */
const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * The sets of pieces the player may choose.
 *
 * Each set is shown with its white king and its black king, so the pieces
 * of the game itself are shown as the game draws them.
 */
const PIECE_SETS = PIECE_SET_IDS.map((id) => ({
  id,
  label: pieceSetLabel(id),
  preview:
    id === MOONGAMES_PIECES ? (
      <PiecePreview type="k" color="w" />
    ) : (
      <PieceImage src={pieceImageUrl(id, "w", "k") ?? ""} />
    ),
  previewDark:
    id === MOONGAMES_PIECES ? (
      <PiecePreview type="k" color="b" />
    ) : (
      <PieceImage src={pieceImageUrl(id, "b", "k") ?? ""} />
    ),
}));

/** The choices that only a game of chess has. */
const CHESS_FEATURES = {
  autoQueen: true,
  moveEvent: true,
  clockTenths: true,
  resizeHandle: true,
  replay: true,
  blindMode: true,
  keyboardMoves: true,
};

export interface AppProps {
  bridge: GameBridge;
}

function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}

function resolveGameTheme(theme: GameTheme): Theme {
  if (theme.mode === "light") {
    return "light";
  }
  if (theme.mode === "system") {
    return typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  return "dark";
}

function FullscreenIcon({ active }: { active: boolean }) {
  return (
    <svg
      className="board-hud__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {active ? (
        <path d="M5 16h3v3h2v-5H5v2Zm3-8H5v2h5V5H8v3Zm6 11h2v-3h3v-2h-5v5Zm2-11V5h-2v5h5V8h-3Z" />
      ) : (
        <path d="M7 14H5v5h5v-2H7v-3Zm-2-4h2V7h3V5H5v5Zm12 7h-3v2h5v-5h-2v3ZM14 5v2h3v3h2V5h-5Z" />
      )}
    </svg>
  );
}

export default function App({ bridge }: AppProps) {
  const [idleState] = useState<ChessState>(() => new ChessEngine().getState());
  const [invite, setInvite] = useState(() =>
    parseMatchInvite(window.location.search),
  );
  const [mode, setMode] = useState<GameMode>(invite === null ? "local" : "online");
  const [hostConfig, setHostConfig] = useState<GameHostConfig | null>(
    launcherHandoff,
  );
  const [hostInitReceived, setHostInitReceived] = useState(
    launcherHandoff !== null,
  );
  const [hostInitTimedOut, setHostInitTimedOut] = useState(false);

  // The customizations of the table: the pieces, the board, the sound, and
  // the way a piece is moved. They are read before the game, because the
  // game needs to know how a piece is moved.
  const { preferences } = useGamePreferences(GAME_ID);

  const localGame = useChessGame({
    active: mode === "local",
    autoQueen: preferences.autoQueen,
  });
  const aiGame = useChessGame({
    ai: true,
    active: mode === "ai",
    autoQueen: preferences.autoQueen,
  });
  const online = useOnlineChess(hostConfig, {
    autoQueen: preferences.autoQueen,
  });
  const [theme, setTheme] = useState<Theme>(() =>
    launcherHandoff === null ? "dark" : resolveGameTheme(launcherHandoff.theme),
  );
  const [flipped, setFlipped] = useState(false);
  const [boardFullscreen, setBoardFullscreen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [replayEntry, setReplayEntry] = useState<OnlineHistoryEntry | null>(
    null,
  );
  const [deskOpen, setDeskOpen] = useState(false);
  const [trainerOpen, setTrainerOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [puzzleOpen, setPuzzleOpen] = useState(false);
  const boardPanelRef = useRef<HTMLElement>(null);
  const inviteConnectRef = useRef(false);
  const inviteHandledRef = useRef(false);
  const hostLaunchHandledRef = useRef(false);
  /** When the first move was played, so a slow game can be known. */
  const gameStartedAtRef = useRef<number | null>(null);
  /** True once the finished game has been played back, so it is not again. */
  const replayStartedRef = useRef(false);

  useEffect(() => {
    configureSound({
      set: preferences.soundSet,
      volume: preferences.soundVolume,
      enabled: preferences.soundEnabled,
    });
  }, [
    preferences.soundSet,
    preferences.soundVolume,
    preferences.soundEnabled,
  ]);

  const boardTheme = boardThemeOf(preferences.boardTheme);
  const pieceAnimationMs = animationDuration(preferences.animationSpeed);

  // The size of the board, which the player can drag the corner of.
  const [boardSize, setBoardSize] = useState<number | null>(() =>
    readBoardSize(GAME_ID),
  );
  const [boardWidth, setBoardWidth] = useState(0);

  useEffect(() => {
    const panel = boardPanelRef.current;
    if (panel === null) {
      return;
    }
    const measure = () => setBoardWidth(panel.clientWidth);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const onlineMode = mode === "online";
  const aiMode = mode === "ai";
  const localController = aiMode ? aiGame : localGame;
  const activeState =
    onlineMode && online.serverState !== null
      ? online.serverState.state
      : onlineMode
        ? idleState
        : localController.state;
  const activeResult = onlineMode
    ? (online.serverState?.result ?? null)
    : null;
  const activeError = onlineMode ? online.error : localController.error;
  const activeSelected = onlineMode ? online.selected : localController.selected;
  const activeLegalTargets = onlineMode
    ? online.legalTargets
    : localController.legalTargets;
  const activeCheckSquare = onlineMode
    ? online.checkSquare
    : localController.checkSquare;
  const activePromotion = onlineMode
    ? online.pendingPromotion
    : localController.pendingPromotion;

  const finished =
    activeState.status === "checkmate" ||
    activeState.status === "stalemate" ||
    activeState.status === "draw" ||
    activeResult !== null;

  const matchStarted =
    !onlineMode || (online.serverState?.match.started ?? false);

  /**
   * A slow game is one that took more than two minutes, or one that had
   * three minutes or more on the clock.
   */
  const slowGame =
    (online.serverState?.match.timeControl.initialMs ?? 0) >= 180_000 ||
    (gameStartedAtRef.current !== null &&
      Date.now() - gameStartedAtRef.current > 120_000);

  // The corner of the board is only there when the player wants it.
  const resizeAllowed =
    preferences.resizeHandle === ShowResizeHandle.Always ||
    (preferences.resizeHandle === ShowResizeHandle.OnlyAtStart && !matchStarted);

  // A finished game is played back on the board, if the player asked for it.
  const [replay, setReplay] = useState<{
    frames: ReplayFrame[];
    ply: number;
    playing: boolean;
  } | null>(null);

  useEffect(() => {
    if (activeState.history.length > 0 && gameStartedAtRef.current === null) {
      gameStartedAtRef.current = Date.now();
    }
  }, [activeState.history.length]);

  useEffect(() => {
    if (!finished) {
      setReplay(null);
      replayStartedRef.current = false;
      return;
    }
    if (replayStartedRef.current) {
      return;
    }
    if (preferences.replay === Replay.Never) {
      return;
    }
    if (preferences.replay === Replay.OnlySlowGames && !slowGame) {
      return;
    }
    const steps = activeState.history.map((move) => move.san);
    const frames = replayFrames(steps);
    if (frames.length < 2) {
      return;
    }
    replayStartedRef.current = true;
    setReplay({ frames, ply: 0, playing: true });
  }, [finished, preferences.replay, slowGame]);

  useEffect(() => {
    if (replay === null || !replay.playing) {
      return;
    }
    if (replay.ply >= replay.frames.length - 1) {
      setReplay((current) =>
        current === null ? null : { ...current, playing: false },
      );
      return;
    }
    const timer = window.setTimeout(
      () =>
        setReplay((current) =>
          current === null
            ? null
            : { ...current, ply: current.ply + 1 },
        ),
      700,
    );
    return () => window.clearTimeout(timer);
  }, [replay]);

  /** The board shows the replay while a finished game is played back. */
  const shownState =
    replay === null
      ? activeState
      : (replay.frames[replay.ply]?.state ?? activeState);

  // The move that is ready for the turn after this one.
  const premove = onlineMode ? online.premove : localController.premove;

  // The engine on the server, and what it says about the position.
  const [analysisOn, setAnalysisOn] = useState(false);
  const [analysisDepth, setAnalysisDepth] = useState(12);
  const [analysisStartFen, setAnalysisStartFen] = useState(START_FEN);
  const analysisUciMoves = useMemo(
    () => activeState.history.map((move) => move.uci),
    [activeState.history],
  );

  /**
   * The kind of game the engine is being asked about.
   *
   * The engine is for the games against yourself. In a game against the
   * computer it is of no use, and in a game against a person it would be
   * cheating, so it is only for the accounts the server has named.
   */
  const engineMode: EngineMode = onlineMode
    ? "online"
    : aiMode
      ? "ai"
      : "local";
  const engineToken = onlineMode ? (online.session?.token ?? null) : null;
  const engineAccess = useEngineAccess(engineMode, engineToken);
  const engineAllowed = engineVisible(engineMode, engineAccess.allowed);

  // The report of the game looks at the positions from the start, so it
  // needs to know where the game began and which side the report is about.
  const reportStartFen = localGame.startFen;
  const reportColor: "w" | "b" = onlineMode
    ? (online.myColor ?? "w")
    : aiMode
      ? (aiGame.aiSettings?.humanColor ?? "w")
      : "w";

  const analysis = useEngineAnalysis({
    initialFen: analysisStartFen,
    moves: analysisUciMoves,
    turn: activeState.turn,
    enabled: analysisOn && engineAllowed,
    depth: analysisDepth,
    multiPv: 3,
    mode: engineMode,
    token: engineToken ?? undefined,
  });

  /**
   * The move the engine likes, as the two squares it goes between.
   *
   * It is drawn on the board as an arrow, the way lichess draws it.
   */
  const engineArrow = useMemo(() => {
    if (!analysisOn) {
      return null;
    }
    const move = analysis.pvs[0]?.uci[0];
    if (move === undefined || move.length < 4) {
      return null;
    }
    return {
      from: move.slice(0, 2) as Square,
      to: move.slice(2, 4) as Square,
    };
  }, [analysis.pvs, analysisOn]);
  // The little board that shows where the line of the engine goes.
  const [pvPreview, setPvPreview] = useState<PvPosition | null>(null);

  const isLive =
    matchStarted &&
    !finished &&
    (activeState.status === "active" || activeState.status === "check");

  // What the player has written with the keyboard.
  const [typedMove, setTypedMove] = useState("");

  useEffect(() => {
    if (!preferences.keyboardMoves) {
      setTypedMove("");
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target !== null &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!isLive) {
        return;
      }

      if (event.key === "Enter") {
        // The square that has the focus must not be played as well.
        event.preventDefault();
        const written = typedMove.trim();
        if (written.length === 0) {
          return;
        }
        const played = onlineMode
          ? online.moveBySan(written)
          : localController.moveBySan(written);
        if (!played) {
          setToast(`"${written}" is not a move that can be played.`);
        }
        setTypedMove("");
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        setTypedMove((current) => current.slice(0, -1));
        return;
      }

      if (event.key === "Escape") {
        setTypedMove("");
        return;
      }

      if (/^[a-hKQRBNkqrbn1-8x=]$/.test(event.key)) {
        event.preventDefault();
        setTypedMove((current) => (current + event.key).slice(-8));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    isLive,
    localController,
    online,
    onlineMode,
    preferences.keyboardMoves,
    typedMove,
  ]);

  const baseBottom: Color = onlineMode
    ? (online.myColor ?? "w")
    : aiMode
      ? (aiGame.aiSettings?.humanColor ?? "w")
      : "w";
  const bottomColor = flipped ? opposite(baseBottom) : baseBottom;
  const topColor = opposite(bottomColor);
  const topActive = isLive && activeState.turn === topColor;
  const bottomActive = isLive && activeState.turn === bottomColor;

  /**
   * The table speaks for itself.
   *
   * Every event of the game is heard and said: a piece that is put down, a
   * piece that is taken, check, the end of the game, and the other player
   * leaving. Without this a player only sees the board change and has to
   * work out what happened.
   */
  const lastEventRef = useRef<string>("");
  useEffect(() => {
    const history = activeState.history;
    if (history.length === 0) {
      lastEventRef.current = "";
      return;
    }
    const last = history[history.length - 1]!;
    const key = `${history.length}:${last.san}`;
    if (key === lastEventRef.current) {
      return;
    }
    const isFirst = history.length === 1;
    lastEventRef.current = key;
    if (isFirst) {
      return;
    }
    if (last.captured !== undefined) {
      playCapture();
    } else if (last.flags.includes("k") || last.flags.includes("q")) {
      playSelect();
    } else if (last.promotion !== undefined) {
      playSelect();
    } else {
      playMove();
    }
    if (activeState.status === "check") {
      playCheck();
      setToast("Check.");
    }
    if (activeState.status === "checkmate") {
      const won =
        activeState.winner !== null && activeState.winner === online.myColor;
      playCheckmate();
      setToast(won ? "Checkmate. You win." : "Checkmate.");
      setResultOpen(true);
    } else if (activeState.status === "stalemate") {
      playDraw();
      setToast("Stalemate. The game is a draw.");
      setResultOpen(true);
    } else if (activeState.status === "draw") {
      playDraw();
      setToast("The game is a draw.");
      setResultOpen(true);
    }
  }, [activeState, online.myColor]);

  // The sounds of the table are fetched while the game is loaded, so the
  // first move is not late.
  useEffect(() => {
    preloadSound("move");
    preloadSound("capture");
    preloadSound("check");
    preloadSound("checkmate");
    preloadSound("win");
    preloadSound("lose");
    preloadSound("draw");
    preloadSound("error");
    preloadSound("notify");
    preloadSound("start");
    preloadSound("select");
  }, []);

  /**
   * The table announces that the game is on. This happens when the players
   * are both at the table, which is before the first move and not with it.
   */
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || !matchStarted) {
      return;
    }
    startedRef.current = true;
    playGameStart();
    setToast(
      onlineMode
        ? "Both players are at the table. The game has started."
        : "White moves first.",
    );
  }, [matchStarted, onlineMode]);

  // A move the server refused is heard, so the player knows why the board
  // did not change.
  const lastErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeError === null) {
      lastErrorRef.current = null;
      return;
    }
    if (activeError === lastErrorRef.current) {
      return;
    }
    lastErrorRef.current = activeError;
    playRefused();
  }, [activeError]);

  /**
   * The table says whose turn it is and when the clock is nearly out. A
   * player who is waiting should never have to look at the board to know
   * that it is their move.
   */
  const turnAnnouncedRef = useRef<string>("");
  useEffect(() => {
    if (!onlineMode || !matchStarted || finished) {
      turnAnnouncedRef.current = "";
      return;
    }
    const key = `${activeState.turn}:${activeState.history.length}`;
    if (key === turnAnnouncedRef.current) {
      return;
    }
    turnAnnouncedRef.current = key;
    if (activeState.turn === online.myColor) {
      setToast("Your move.");
    }
  }, [activeState.history.length, activeState.turn, finished, matchStarted, online.myColor, onlineMode]);

  // The clock running out is heard, so a player is never surprised by the
  // end of the game.
  const lowTimeRef = useRef<string>("");
  useEffect(() => {
    if (!onlineMode || online.displayClock === null) {
      lowTimeRef.current = "";
      return;
    }
    const remaining = online.displayClock[online.myColor === "w" ? "whiteMs" : "blackMs"];
    const who = online.myColor === "w" ? "white" : "black";
    const low = remaining !== null && remaining <= 20000;
    const key = `${who}:${low ? "low" : "ok"}`;
    if (key === lowTimeRef.current) {
      return;
    }
    lowTimeRef.current = key;
    if (low) {
      playLowTime();
      setToast("Your clock is nearly out.");
    }
  }, [online.displayClock, online.myColor, onlineMode]);

  // The end of the game is heard as the player heard it: a win sounds like a
  // win, and a loss sounds like a loss.
  const endSoundRef = useRef<string>("");
  useEffect(() => {
    if (!finished) {
      endSoundRef.current = "";
      return;
    }
    const key = `${activeState.status}:${activeState.winner ?? "-"}`;
    if (key === endSoundRef.current) {
      return;
    }
    endSoundRef.current = key;
    const winner = activeState.winner;
    if (winner === null) {
      playDraw();
      return;
    }
    if (onlineMode) {
      if (winner === online.myColor) {
        playWin();
      } else {
        playLose();
      }
      return;
    }
    if (winner === baseBottom) {
      playWin();
    } else {
      playLose();
    }
  }, [activeState.status, activeState.winner, baseBottom, finished, online.myColor, onlineMode]);
  useEffect(() => {
    const unsubscribe = bridge.onMessage((message) => {
      switch (message.type) {
        case "init":
          setHostConfig(message.config);
          setHostInitReceived(true);
          setTheme(resolveGameTheme(message.config.theme));
          break;
        case "theme":
          setTheme(resolveGameTheme(message.theme));
          break;
        case "session":
          setHostConfig((current) => ({
            protocol: current?.protocol ?? GAME_PROTOCOL_VERSION,
            gameId: current?.gameId ?? GAME_ID,
            locale: current?.locale ?? "en",
            theme: current?.theme ?? { mode: "dark" },
            nakama: current?.nakama,
            ...current,
            session: message.session,
          }));
          break;
        case "pause":
        case "resume":
          // Web clocks are server-authoritative and keep running while the
          // host app is backgrounded. Local games have no elapsed-time rules.
          break;
        case "destroy":
          break;
      }
    });
    return unsubscribe;
  }, [bridge]);

  useEffect(() => {
    if (!bridge.isHosted || hostInitReceived) {
      setHostInitTimedOut(true);
      return;
    }
    const timer = window.setTimeout(() => setHostInitTimedOut(true), 750);
    return () => window.clearTimeout(timer);
  }, [bridge, hostInitReceived]);

  useEffect(() => {
    bridge.ready(__MOONGAMES_GAME_ID__, __MOONGAMES_GAME_VERSION__);
  }, [bridge]);

  useEffect(() => {
    const launch = hostConfig?.launch;
    if (launch === undefined || hostLaunchHandledRef.current) {
      return;
    }
    hostLaunchHandledRef.current = true;
    const launchInvite = parseLaunchInvite(launch);
    if (launchInvite === null) {
      return;
    }
    setInvite(launchInvite);
    setMode("online");
  }, [hostConfig?.launch]);

  useEffect(() => {
    const hostReady =
      !bridge.isHosted || hostInitReceived || hostInitTimedOut;
    if (
      invite === null ||
      inviteHandledRef.current ||
      mode !== "online" ||
      !hostReady
    ) {
      return;
    }

    if (online.connection === "offline") {
      if (inviteConnectRef.current) {
        return;
      }
      inviteConnectRef.current = true;
      void online.connect().catch(() => {
        // Connection failures are surfaced through controller.error.
      });
      return;
    }

    if (online.connection !== "connected") {
      return;
    }

    if (online.matchId === invite.matchId && online.serverState !== null) {
      inviteHandledRef.current = true;
      clearMatchInviteFromLocation();
      setToast(invite.spectate ? "Watching invited match" : "Joined invited match");
      return;
    }

    inviteHandledRef.current = true;
    void online
      .joinMatch(invite.matchId, { spectator: invite.spectate })
      .then(() => {
        clearMatchInviteFromLocation();
        setToast(
          invite.spectate ? "Watching invited match" : "Joined invited match",
        );
      })
      .catch((cause) => {
        setToast(
          cause instanceof Error
            ? cause.message
            : "Could not open the invite link.",
        );
      });
  }, [
    bridge,
    hostInitReceived,
    hostInitTimedOut,
    invite,
    mode,
    online,
  ]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.body.classList.toggle(
      "board-fullscreen-active",
      boardFullscreen,
    );
    return () => document.body.classList.remove("board-fullscreen-active");
  }, [boardFullscreen]);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (document.fullscreenElement === null) {
        setBoardFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!boardFullscreen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      setBoardFullscreen(false);
      if (
        document.fullscreenElement !== null &&
        typeof document.exitFullscreen === "function"
      ) {
        void document.exitFullscreen().catch(() => {
          // The browser may already be leaving fullscreen.
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [boardFullscreen]);

  const toggleBoardFullscreen = () => {
    if (boardFullscreen) {
      setBoardFullscreen(false);
      if (
        document.fullscreenElement !== null &&
        typeof document.exitFullscreen === "function"
      ) {
        void document.exitFullscreen().catch(() => {
          // The CSS fullscreen layer is already closing.
        });
      }
      return;
    }

    setBoardFullscreen(true);
    // Fullscreen the app root, not the board panel. The board panel is still
    // the visible layer, but match chat and other fixed overlays live outside
    // that panel and must enter the browser's fullscreen top layer with it.
    const element = document.documentElement;
    if (
      element !== null &&
      document.fullscreenElement === null &&
      typeof element.requestFullscreen === "function"
    ) {
      void element
        .requestFullscreen({ navigationUI: "hide" })
        .catch(() => {
          // Embedded WebViews often block the Fullscreen API. The fixed
          // board layer below still gives the same in-app behavior.
        });
    }
  };

  useEffect(() => {
    if (toast === null) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const announcedInviteRef = useRef<string | null>(null);
  useEffect(() => {
    const invite = online.incomingInvite;
    if (invite === null) {
      announcedInviteRef.current = null;
      return;
    }
    if (announcedInviteRef.current === invite.inviteId) {
      return;
    }
    announcedInviteRef.current = invite.inviteId;
    setToast(
      `${invite.sender.username} invited you to ${invite.gameTitle}. Open Online to accept.`,
    );
  }, [online.incomingInvite]);

  const handleModeChange = (nextMode: GameMode) => {
    const onlineActive =
      mode === "online" &&
      (online.matchmaking ||
        online.matchId !== null ||
        online.serverState !== null);
    const activeOnlineMatch =
      mode === "online" &&
      online.serverState !== null &&
      online.serverState.result === null;
    const liveOnlineMatch =
      activeOnlineMatch && online.serverState?.match.started === true;

    if (onlineActive && nextMode !== "online") {
      if (online.matchmaking) {
        if (!window.confirm("Cancel matchmaking and switch away?")) {
          return;
        }
      } else if (activeOnlineMatch) {
        const message = online.spectating
          ? "Stop watching this match?"
          : liveOnlineMatch
            ? "Switch away from online play? Leaving the match will count as a disconnect."
            : "Leave the waiting online match?";
        if (!window.confirm(message)) {
          return;
        }
      }

      void online.leaveMatch();
    }

    setMode(nextMode);
    setFlipped(false);
    if (nextMode === "online" && online.connection === "offline") {
      void online.connect().catch(() => {
        // The hook reports connection failures through its error state.
      });
    }
  };

  const handleNewGame = () => {
    if (
      localController.state.history.length > 0 &&
      !window.confirm("Start a new game?")
    ) {
      return;
    }
    localController.newGame();
  };

  const handleStartAiGame = (settings: AiGameSettings) => {
    if (
      aiGame.state.history.length > 0 &&
      !window.confirm("Start a new game against the computer?")
    ) {
      return;
    }
    aiGame.startAiGame(settings);
    setFlipped(false);
  };

  const handleCopyPgn = async () => {
    const pgn = onlineMode ? online.pgn() : localController.pgn();
    if (pgn.length === 0) {
      setToast("No moves to copy yet");
      return;
    }

    try {
      const copied = await copyText(pgn);
      setToast(
        copied ? "PGN copied to clipboard" : "Could not copy PGN on this device",
      );
    } catch {
      setToast("Could not copy PGN on this device");
    }
  };

  const handleLeaveMatch = () => {
    if (online.spectating) {
      void online.leaveMatch().then(() => setToast("Stopped watching"));
      return;
    }

    const liveMatch =
      online.serverState?.match.started === true &&
      online.serverState.result === null;
    if (
      liveMatch &&
      !window.confirm(
        "Leave this game? The server will treat it as a disconnect and may forfeit the match.",
      )
    ) {
      return;
    }
    void online.leaveMatch().then(() => setToast("Left the online match"));
  };

  const handleResign = () => {
    if (!window.confirm("Resign this online game?")) {
      return;
    }
    online.resign();
  };

  const handleOfferDraw = () => {
    online.offerDraw();
    setToast("Draw offer sent");
  };

  const onlinePlayerCard = (color: Color) => {
    if (!onlineMode) {
      return {};
    }

    const player = online.players.find((candidate) => candidate.color === color);
    const active = isLive && activeState.turn === color;
    // The player at this screen is "You", the other player is named by their
    // account. No name is written into the code.
    const isYou = online.myColor === color;

    if (online.serverState === null) {
      return {
        name: isYou ? "You" : color === "w" ? "White" : "Black",
        subtitle: "Not in a match",
        clockMs: null,
      };
    }

    let subtitle: string;
    if (online.serverState.result !== null) {
      subtitle = "Game over";
    } else if (!online.serverState.match.started) {
      subtitle = player === undefined ? "Waiting for opponent" : "Waiting";
    } else if (player?.connected === false) {
      subtitle = "Disconnected";
    } else {
      subtitle = active ? "To move" : "Waiting";
    }

    return {
      name:
        isYou
          ? "You"
          : (player?.username ??
            (online.serverState.match.started
              ? "Open seat"
              : "Waiting for opponent")),
      subtitle,
      clockMs:
        online.serverState.match.started && online.displayClock !== null
          ? online.displayClock[color === "w" ? "whiteMs" : "blackMs"]
          : null,
      connected: player?.connected,
    };
  };

  const localPlayerCard = (color: Color) => {
    if (!aiMode || aiGame.aiSettings === null) {
      return {};
    }

    const isHuman = color === aiGame.aiSettings.humanColor;
    const isThinking = !isHuman && aiGame.aiThinking;
    return {
      name: isHuman ? "You" : "Computer",
      subtitle: isThinking ? "Thinking…" : undefined,
    };
  };

  const topOnline = onlineMode ? onlinePlayerCard(topColor) : localPlayerCard(topColor);
  const bottomOnline = onlineMode
    ? onlinePlayerCard(bottomColor)
    : localPlayerCard(bottomColor);

  const inProgress =
    online.connection === "connected" &&
    online.serverState !== null &&
    online.serverState.match.started &&
    online.serverState.result === null;

  const showProfilePanel =
    onlineMode &&
    online.connection === "connected" &&
    (online.serverState === null ||
      !online.serverState.match.started ||
      online.serverState.result !== null);
  const showAccountPanel =
    onlineMode &&
    online.matchId === null &&
    (online.connection !== "offline" || online.authBusy);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Icon name="moon" size={26} strokeWidth={1.7} />
          </div>
          <div>
            <p className="brand-kicker">MoonGames</p>
            <h1>Chess</h1>
          </div>
        </div>
        <div className="header-actions">
          <ModeSwitch
            modes={[
              { id: "local", label: "Local" },
              { id: "ai", label: "vs AI" },
              { id: "online", label: "Online" },
            ]}
            mode={mode}
            onChange={(next) => handleModeChange(next as GameMode)}
          />
          <button
            className="icon-button"
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle light and dark theme"
            title="Toggle theme"
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} size={19} />
          </button>
        </div>
      </header>

      <main className="game-layout">
        <section
          className={`board-panel${boardFullscreen ? " board-panel--fullscreen" : ""}`}
          aria-label="Chess game"
          ref={boardPanelRef}
        >
          <PlayerCard
            name={topOnline.name ?? (topColor === "w" ? "White" : "Black")}
            accent={topColor === "w" ? "#f3ead4" : "#22252a"}
            active={topActive}
            finished={finished}
            {...topOnline}
          />

          <div className="board-hud">
            <span className="board-hud__label">
              {onlineMode ? "Online table" : aiMode ? "Practice table" : "Local table"}
            </span>
            {typedMove.length > 0 && (
              <span className="board-hud__typing" aria-live="polite">
                {typedMove}
              </span>
            )}
            <button
              type="button"
              className={`board-hud__engine${analysisOn ? " is-on" : ""}`}
              onClick={() => setAnalysisOn((current) => !current)}
              aria-pressed={analysisOn}
              title="Ask the engine what it thinks of the position"
              hidden={!engineAllowed}
            >
              Engine
            </button>
            {premove !== null && (
              <span className="board-hud__premove" aria-live="polite">
                Your move is ready
              </span>
            )}
            <button
              type="button"
              className="board-hud__fullscreen"
              onClick={toggleBoardFullscreen}
              aria-pressed={boardFullscreen}
              aria-label={
                boardFullscreen ? "Exit fullscreen board" : "Open fullscreen board"
              }
              title={
                boardFullscreen ? "Exit fullscreen board" : "Fullscreen board"
              }
            >
              <FullscreenIcon active={boardFullscreen} />
              <span className="board-hud__fullscreen-label">
                {boardFullscreen ? "Exit" : "Fullscreen"}
              </span>
            </button>
          </div>

          <div className="board-with-eval">
            <div
              className="board-wrap"
              style={
                boardSize === null ? undefined : { width: `${boardSize}px` }
              }
            >
            <ChessBoard
              board={shownState.board}
              selected={activeSelected}
              legalTargets={activeLegalTargets}
              lastMove={shownState.lastMove ?? null}
              checkSquare={activeCheckSquare}
              flipped={bottomColor === "b"}
              coordinates={preferences.coordinates}
              theme={boardTheme}
              pieceSet={preferences.pieceSet}
              animationMs={pieceAnimationMs}
              showLegalMoves={preferences.showLegalMoves}
              highlightLastMove={preferences.highlightLastMove}
              moveEvent={preferences.moveEvent}
              premove={premove}
              arrow={engineArrow}
              onMove={
                onlineMode ? online.movePiece : localController.movePiece
              }
              onSquareClick={
                onlineMode
                  ? online.selectSquare
                  : localController.selectSquare
              }
            />
            {activePromotion !== null && (
              <PromotionPicker
                color={activePromotion.color}
                onSelect={
                  onlineMode
                    ? online.choosePromotion
                    : localController.choosePromotion
                }
                onCancel={
                  onlineMode
                    ? online.cancelPromotion
                    : localController.cancelPromotion
                }
              />
            )}
            {replay !== null && (
              <GameReplayBar
                ply={replay.ply}
                lastPly={replay.frames.length - 1}
                playing={replay.playing}
                san={replay.frames[replay.ply]?.san ?? null}
                onTogglePlay={() =>
                  setReplay((current) =>
                    current === null
                      ? null
                      : {
                          ...current,
                          playing: !current.playing,
                          ply:
                            current.ply >= current.frames.length - 1
                              ? 0
                              : current.ply,
                        },
                  )
                }
                onStop={() => setReplay(null)}
              />
            )}
            {resizeAllowed && (
              <BoardResizeHandle
                size={boardSize ?? boardWidth}
                available={boardWidth}
                onResize={(size) => setBoardSize(size)}
                onResizeEnd={(size) => {
                  setBoardSize(size);
                  writeBoardSize(GAME_ID, size);
                }}
              />
            )}
            </div>

            {analysisOn && (
              <EngineEvalBar
                cp={analysis.evaluation?.cp}
                mate={analysis.evaluation?.mate}
                color={bottomColor}
                empty={analysis.evaluation === null}
              />
            )}
          </div>

          {analysisOn && (
            <div className="engine-panel">
              {analysis.error !== null ? (
                <p className="engine-panel__error">{analysis.error}</p>
              ) : analysis.pvs.length > 0 ? (
                <>
                  {analysis.pvs.map((pv, line) => (
                    <EnginePv
                      key={line}
                      san={pv.san}
                      cp={pv.score.cp}
                      mate={pv.score.mate}
                      depth={analysis.evaluation?.depth ?? 0}
                      nodes={analysis.evaluation?.nodes ?? 0}
                      millis={analysis.evaluation?.millis ?? 0}
                      onShow={(move) => {
                        const moves = pv.uci.slice(0, move + 1);
                        setPvPreview(positionAfter(analysisStartFen, moves));
                      }}
                      onPlay={(move) => {
                        // The first move of the first line can be played on
                        // the board, for the line begins at the position
                        // that is on it now.
                        if (line !== 0 || move !== 0) {
                          return;
                        }
                        const san = pv.san[0];
                        if (san === undefined) {
                          return;
                        }
                        const played = onlineMode
                          ? online.moveBySan(san)
                          : localController.moveBySan(san);
                        if (!played) {
                          setToast("That move cannot be played here.");
                        }
                      }}
                    />
                  ))}
                  <div className="engine-panel__tools">
                    <button
                      type="button"
                      className="mini-button"
                      onClick={() =>
                        setAnalysisDepth((current) =>
                          Math.min(40, current + 4),
                        )
                      }
                      title="Ask the engine to look deeper"
                    >
                      Deeper
                    </button>
                    <span className="engine-panel__depth">
                      depth {analysisDepth}
                    </span>
                  </div>
                  {pvPreview !== null && (
                    <EnginePvBoard
                      board={pvPreview.board}
                      lastMove={pvPreview.lastMove}
                      color={activeState.turn}
                      theme={boardTheme}
                      pieceSet={preferences.pieceSet}
                    />
                  )}
                </>
              ) : (
                <p className="engine-panel__waiting">
                  {analysis.thinking ? "The engine is thinking…" : "The engine has not said yet."}
                </p>
              )}
            </div>
          )}

          <PlayerCard
            name={bottomOnline.name ?? (bottomColor === "w" ? "White" : "Black")}
            accent={bottomColor === "w" ? "#f3ead4" : "#22252a"}
            active={bottomActive}
            finished={finished}
            {...bottomOnline}
          />
        </section>

        <aside className="sidebar">
          {onlineMode ? (
            <>
              {showAccountPanel && (
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
              )}
              <OnlinePanel controller={online} onNotify={setToast} />
              {online.serverState !== null &&
                online.serverState.match.started && (
                  <>
                    <GameStatus state={activeState} result={activeResult} />
                    <ChessGameStats
                      state={activeState}
                      clockMs={online.displayClock}
                      clockTenths={preferences.clockTenths}
                      names={{
                        white: topColor === "w" ? topOnline.name ?? "White" : bottomOnline.name ?? "White",
                        black: topColor === "b" ? topOnline.name ?? "Black" : bottomOnline.name ?? "Black",
                      }}
                    />
                    <MoveList history={activeState.history} blind={preferences.blindMode} />
                    <ChessCaptured state={activeState} />
                    {online.drawOffer !== null &&
                    online.drawOffer.by !== online.myColor ? (
                      <section className="panel draw-offer-panel">
                        <div className="panel-heading">
                          <h2>Draw offered</h2>
                          <span className="live-badge">Waiting</span>
                        </div>
                        <p className="draw-offer-panel__copy">
                          The other player offers a draw. Accept it, or play on.
                        </p>
                        <div className="toolbar-grid">
                          <button
                            type="button"
                            className="action-button action-button--primary"
                            onClick={() => void online.acceptDraw()}
                          >
                            Accept draw
                          </button>
                          <button
                            type="button"
                            className="action-button"
                            onClick={() => void online.declineDraw()}
                          >
                            Keep playing
                          </button>
                        </div>
                      </section>
                    ) : null}
                    <OnlineGameToolbar
                      inProgress={inProgress}
                      spectating={online.spectating}
                      canResign={inProgress && online.myColor !== null}
                      canOfferDraw={
                        inProgress &&
                        online.myColor !== null &&
                        online.drawOffer === null
                      }
                      hasMoves={activeState.history.length > 0}
                      onResign={handleResign}
                      onOfferDraw={handleOfferDraw}
                      onFlip={() => setFlipped((current) => !current)}
                      onCopyPgn={() => void handleCopyPgn()}
                      onOpenings={() => setExplorerOpen(true)}
                      onLeave={handleLeaveMatch}
                    />
                  </>
                )}
              {showProfilePanel && (
                <ProfilePanel
                  connected={online.connection === "connected"}
                  userId={online.session?.userId ?? null}
                  profile={online.profile}
                  history={online.history}
                  leaderboard={online.leaderboard}
                  myLeaderboard={online.myLeaderboard}
                  loading={online.profileLoading}
                  error={online.profileError}
                  onRefresh={() => void online.refreshProfile()}
                  onReplay={(entry) =>
                    setReplayEntry(entry as unknown as OnlineHistoryEntry)
                  }
                  historyMeta={(entry) =>
                    `${entry.mode === "private" ? "Private" : "Quick"} · ${entry.endedAt > 0 ? new Date(entry.endedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Unknown date"}`
                  }
                />
              )}
              <GamePreferencesPanel
                gameId={GAME_ID}
                pieceSets={PIECE_SETS}
                themes={BOARD_THEMES}
                soundSets={SOUND_SETS}
                features={CHESS_FEATURES}
                onPreviewSound={() => playMove()}
              />
            </>
          ) : aiMode ? (
            <>
              <AiPanel
                settings={aiGame.aiSettings}
                thinking={aiGame.aiThinking}
                onStart={handleStartAiGame}
              />
              <GameStatus state={activeState} />
              <ChessGameStats
                state={activeState}
                clockTenths={preferences.clockTenths}
              />
              <ChessCaptured state={activeState} />
              <MoveList history={activeState.history} blind={preferences.blindMode} />
              <GameToolbar
                actions={[
                  { id: "new", label: "New game", onClick: handleNewGame },
                  {
                    id: "undo",
                    label: "Undo",
                    onClick: aiGame.undo,
                    disabled: !aiGame.canUndo,
                  },
                  {
                    id: "flip",
                    label: "Flip board",
                    onClick: () => setFlipped((current) => !current),
                  },
                  {
                    id: "pgn",
                    label: "Copy PGN",
                    onClick: () => void handleCopyPgn(),
                    disabled: !aiGame.canUndo,
                  },
                  {
                    id: "desk",
                    label: "Open a game",
                    onClick: () => setDeskOpen(true),
                  },
                ]}
              />
              <GamePreferencesPanel
                gameId={GAME_ID}
                pieceSets={PIECE_SETS}
                themes={BOARD_THEMES}
                soundSets={SOUND_SETS}
                features={CHESS_FEATURES}
                onPreviewSound={() => playMove()}
              />
              <GameToolbar
                actions={[
                  {
                    id: "trainer",
                    label: "Train the coordinates",
                    onClick: () => setTrainerOpen(true),
                  },
                  {
                    id: "openings",
                    label: "Explore the openings",
                    onClick: () => setExplorerOpen(true),
                  },
                  {
                    id: "puzzles",
                    label: "Solve the puzzles",
                    onClick: () => setPuzzleOpen(true),
                  },
                ]}
              />
            </>
          ) : (
            <>
              <GameStatus state={activeState} />
              <ChessGameStats
                state={activeState}
                clockTenths={preferences.clockTenths}
              />
              <ChessCaptured state={activeState} />
              <MoveList history={activeState.history} blind={preferences.blindMode} />
              <GameToolbar
                actions={[
                  { id: "new", label: "New game", onClick: handleNewGame },
                  {
                    id: "undo",
                    label: "Undo",
                    onClick: localGame.undo,
                    disabled: !localGame.canUndo,
                  },
                  {
                    id: "flip",
                    label: "Flip board",
                    onClick: () => setFlipped((current) => !current),
                  },
                  {
                    id: "pgn",
                    label: "Copy PGN",
                    onClick: () => void handleCopyPgn(),
                    disabled: !localGame.canUndo,
                  },
                  {
                    id: "desk",
                    label: "Open a game",
                    onClick: () => setDeskOpen(true),
                  },
                ]}
              />
              <GamePreferencesPanel
                gameId={GAME_ID}
                pieceSets={PIECE_SETS}
                themes={BOARD_THEMES}
                soundSets={SOUND_SETS}
                features={CHESS_FEATURES}
                onPreviewSound={() => playMove()}
              />
              <GameToolbar
                actions={[
                  {
                    id: "trainer",
                    label: "Train the coordinates",
                    onClick: () => setTrainerOpen(true),
                  },
                  {
                    id: "openings",
                    label: "Explore the openings",
                    onClick: () => setExplorerOpen(true),
                  },
                  {
                    id: "puzzles",
                    label: "Solve the puzzles",
                    onClick: () => setPuzzleOpen(true),
                  },
                ]}
              />
            </>
          )}
        </aside>
      </main>

      {onlineMode &&
        online.serverState !== null &&
        online.serverState.result === null && (
          <MatchChat
            matchId={online.matchId}
            messages={online.chatMessages}
            selfUserId={online.session?.userId ?? null}
            onSend={online.sendChat}
          />
        )}

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

      {activeError !== null && (
        <div className="error-banner" role="alert">
          {activeError}
        </div>
      )}
      {replayEntry !== null && (
        <ReplayDialog
          entry={replayEntry}
          onClose={() => setReplayEntry(null)}
        />
      )}

      {trainerOpen && (
        <CoordinateTrainer
          theme={boardTheme}
          pieceSet={preferences.pieceSet}
          onClose={() => setTrainerOpen(false)}
        />
      )}

      {puzzleOpen && (
        <PuzzlePanel
          onNext={() => online.puzzleNext()}
          onSave={(input) => online.puzzleSave(input)}
          onAnswer={(id, move) => online.puzzleAnswer(id, move)}
          mode={engineMode}
          token={engineToken ?? undefined}
          theme={boardTheme}
          pieceSet={preferences.pieceSet}
          coordinates={preferences.coordinates}
          onClose={() => setPuzzleOpen(false)}
        />
      )}

      {deskOpen && (
        <PositionDesk
          pieceSet={preferences.pieceSet}
          theme={boardTheme}
          coordinates={preferences.coordinates}
          onImport={(input) => online.importGame(input)}
          onPlayFrom={(fen) => {
            localGame.startFromFen(fen);
            setAnalysisStartFen(fen);
            setMode("local");
            setDeskOpen(false);
          }}
          onClose={() => setDeskOpen(false)}
        />
      )}

      {explorerOpen && (
        <OpeningExplorer
          onExplore={(path) => online.explorer(path)}
          pieceSet={preferences.pieceSet}
          theme={boardTheme}
          coordinates={preferences.coordinates}
          onClose={() => setExplorerOpen(false)}
        />
      )}

      {resultOpen && finished ? (
        <ChessGameOverDialog
          result={{
            status: activeResult?.status ?? activeState.status,
            winnerColor: activeResult?.winnerColor ?? activeState.winner,
            reason: activeResult?.reason ?? activeState.status,
          }}
          winnerName={
            onlineMode && activeState.winner !== null
              ? (online.players.find(
                  (candidate) => candidate.color === activeState.winner,
                )?.username ?? null)
              : null
          }
          won={
            onlineMode
              ? activeState.winner !== null && activeState.winner === online.myColor
              : activeState.winner !== null
          }
          draw={activeState.status === "draw" || activeState.status === "stalemate"}
          onRematch={
            onlineMode
              ? () => {
                  setResultOpen(false);
                  void online.leaveMatch().then(() =>
                    online.createPrivateMatch().catch(() => undefined),
                  );
                }
              : undefined
          }
          onClose={() => setResultOpen(false)}
          onReport={
            engineAllowed
              ? () => {
                  setResultOpen(false);
                  setReportOpen(true);
                }
              : undefined
          }
        />
      ) : null}

      {reportOpen && (
        <GameReportDialog
          uciMoves={activeState.history.map((move) => move.uci)}
          sanMoves={activeState.history.map((move) => move.san)}
          initialFen={reportStartFen}
          color={reportColor}
          mode={engineMode}
          token={engineToken ?? undefined}
          onClose={() => setReportOpen(false)}
        />
      )}

      {toast !== null && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
