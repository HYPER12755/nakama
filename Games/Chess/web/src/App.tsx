import { useEffect, useRef, useState } from "react";
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
  GameFlowMenu,
  GameFlowScreen,
  GameFlowSetting,
  GameToolbar,
  Icon,
  MatchChat,
  ModeSwitch,
  OpponentLeftDialog,
  PlayerCard,
  ProfilePanel,
  copyText,
  flowSettingEnabled,
  flowSettingOverride,
  parseLaunchInvite,
  parseMatchInvite,
  clearMatchInviteFromLocation,
} from "@moongames/game-ui";
import { AiPanel } from "./components/AiPanel";
import { ChessBoard } from "./components/ChessBoard";
import { ChessGameOverDialog } from "./components/ChessGameOverDialog";
import { ChessCaptured } from "./components/ChessCaptured";
import { ChessGameStats } from "./components/ChessGameStats";
import { GameStatus } from "./components/GameStatus";
import { MoveList } from "./components/MoveList";
import { OnlineGameToolbar } from "./components/OnlineGameToolbar";
import { OnlinePanel } from "./components/OnlinePanel";
import { PromotionPicker } from "./components/PromotionPicker";
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
} from "./lib/audio";
import type { OnlineHistoryEntry } from "./lib/onlineProtocol";
import {
  useChessGame,
  type AiGameSettings,
} from "./hooks/useChessGame";
import { useOnlineChess } from "./hooks/useOnlineChess";

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
  const [mode, setMode] = useState<GameMode>(() => {
    // The menu can open a game in the way the player chose, so the game
    // starts the way it was asked to.
    if (invite !== null) {
      return "online";
    }
    const asked =
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("mode");
    return asked === "ai" || asked === "online" ? asked : "local";
  });
  // The organized steps. When they are on, the plain switch opens the
  // organized menu instead of changing the mode straight away.
  const [flowOn, setFlowOn] = useState(() => flowSettingEnabled(GAME_ID));
  const [flowMode, setFlowMode] = useState<string | null>(null);
  const [flowScreen, setFlowScreen] = useState<string | null>(null);
  const [flowMenuOpen, setFlowMenuOpen] = useState(false);

  // The menu can turn the organized steps on for every game, so a game that
  // follows the menu picks the choice up when it is looked at again.
  useEffect(() => {
    const refresh = () => {
      if (flowSettingOverride(GAME_ID) !== null) {
        return;
      }
      setFlowOn(flowSettingEnabled(GAME_ID));
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const [hostConfig, setHostConfig] = useState<GameHostConfig | null>(
    launcherHandoff,
  );
  const [hostInitReceived, setHostInitReceived] = useState(
    launcherHandoff !== null,
  );
  const [hostInitTimedOut, setHostInitTimedOut] = useState(false);
  const localGame = useChessGame({ active: mode === "local" });
  const aiGame = useChessGame({ ai: true, active: mode === "ai" });
  const online = useOnlineChess(hostConfig);
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
  const boardPanelRef = useRef<HTMLElement>(null);
  const inviteConnectRef = useRef(false);
  const inviteHandledRef = useRef(false);
  const hostLaunchHandledRef = useRef(false);

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
  const isLive =
    matchStarted &&
    !finished &&
    (activeState.status === "active" || activeState.status === "check");

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

  /**
   * The panels of the table, each one a screen of the organized menu.
   *
   * The same panels are in the side of the table when the organized steps
   * are off, so nothing is lost either way.
   */
  const flowSections = [
    {
      id: "status",
      title: "Status",
      description: "Where the game stands right now.",
      body: <GameStatus state={activeState} result={activeResult} />,
    },
    {
      id: "numbers",
      title: "Numbers",
      description: "The pieces taken, the material, and the clocks.",
      body: (
        <ChessGameStats
          state={activeState}
          clockMs={onlineMode ? online.displayClock : null}
          names={{
            white:
              topColor === "w"
                ? topOnline.name ?? "White"
                : bottomOnline.name ?? "White",
            black:
              topColor === "b"
                ? topOnline.name ?? "Black"
                : bottomOnline.name ?? "Black",
          }}
        />
      ),
    },
    {
      id: "taken",
      title: "Taken pieces",
      description: "The pieces that are off the board.",
      body: <ChessCaptured state={activeState} />,
    },
    {
      id: "moves",
      title: "Moves",
      description: "Every move of the game.",
      body: <MoveList history={activeState.history} />,
    },
    {
      id: "settings",
      title: "Settings",
      description: "How the game is shown.",
      body: <GameFlowSetting gameId={GAME_ID} onChange={setFlowOn} />,
    },
  ];

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
            onChange={(next) => {
              // With the organized steps on, the plain switch opens the
              // organized menu and the mode is chosen there.
              if (flowOn) {
                setFlowMode(next);
                return;
              }
              handleModeChange(next as GameMode);
            }}
          />
          {flowOn ? (
            <button
              className="icon-button"
              type="button"
              onClick={() => setFlowMenuOpen(true)}
              aria-label="Open the menu"
              title="Menu"
            >
              <Icon name="menu" size={19} />
            </button>
          ) : null}
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

          <div className="board-wrap">
            <ChessBoard
              board={activeState.board}
              selected={activeSelected}
              legalTargets={activeLegalTargets}
              lastMove={activeState.lastMove ?? null}
              checkSquare={activeCheckSquare}
              flipped={bottomColor === "b"}
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
          </div>

          <PlayerCard
            name={bottomOnline.name ?? (bottomColor === "w" ? "White" : "Black")}
            accent={bottomColor === "w" ? "#f3ead4" : "#22252a"}
            active={bottomActive}
            finished={finished}
            {...bottomOnline}
          />
        </section>

        {/*
          The organized steps are a layer over the game, not a change to it.
          When they are on, the panels are opened one at a time from the
          menu, and the table keeps everything it has.
        */}
        {flowOn && flowScreen !== null ? (
          <aside className="sidebar sidebar--flow">
            <GameFlowScreen
              title={flowSections.find((entry) => entry.id === flowScreen)?.title ?? "Panel"}
              subtitle={flowSections.find((entry) => entry.id === flowScreen)?.description}
              onBack={() => setFlowScreen(null)}
            >
              {flowSections.find((entry) => entry.id === flowScreen)?.body}
            </GameFlowScreen>
          </aside>
        ) : (
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
                      names={{
                        white: topColor === "w" ? topOnline.name ?? "White" : bottomOnline.name ?? "White",
                        black: topColor === "b" ? topOnline.name ?? "Black" : bottomOnline.name ?? "Black",
                      }}
                    />
                    <MoveList history={activeState.history} />
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
                      onLeave={handleLeaveMatch}
                    />
                    {/* The organized steps are turned on from here, so they can
                        be reached before they are on. */}
                    <GameFlowSetting gameId={GAME_ID} onChange={setFlowOn} />
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
            </>
          ) : aiMode ? (
            <>
              <AiPanel
                settings={aiGame.aiSettings}
                thinking={aiGame.aiThinking}
                onStart={handleStartAiGame}
              />
              <GameStatus state={activeState} />
              <ChessGameStats state={activeState} />
              <ChessCaptured state={activeState} />
              <MoveList history={activeState.history} />
              {/* The organized steps are turned on from here, so they can be
                  reached before they are on. */}
              <GameFlowSetting gameId={GAME_ID} onChange={setFlowOn} />
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
                ]}
              />
            </>
          ) : (
            <>
              <GameStatus state={activeState} />
              <ChessGameStats state={activeState} />
              <ChessCaptured state={activeState} />
              <MoveList history={activeState.history} />
              {/* The organized steps are turned on from here, so they can be
                  reached before they are on. */}
              <GameFlowSetting gameId={GAME_ID} onChange={setFlowOn} />
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
                ]}
              />
            </>
          )}
        </aside>
        )}
      </main>

      {/*
        The organized menu. It is a layer over the game: the switch opens it
        when the organized steps are on, and the panels are opened one at a
        time from it.
      */}
      {flowOn && flowMode !== null ? (
        <GameFlowMenu
          gameName="Chess"
          step={{
            title: "How do you want to play?",
            subtitle: "The table opens the way you choose.",
            options: [
              {
                id: "local",
                label: "On this device",
                description: "Play at this table. Everyone shares the screen.",
              },
              {
                id: "ai",
                label: "Against the computer",
                description: "Play the computer at the level you choose.",
              },
              {
                id: "online",
                label: "Online table",
                description: "Play another person, at your own table.",
              },
            ],
          }}
          onChoose={(next) => {
            setFlowMode(null);
            handleModeChange(next as GameMode);
          }}
          onClose={() => setFlowMode(null)}
        />
      ) : null}

      {flowOn && flowMode === null && flowMenuOpen ? (
        <GameFlowMenu
          gameName="Chess"
          step={{
            title: "What do you want to open?",
            subtitle: "Everything the table has, one screen at a time.",
            options: flowSections.map((entry) => ({
              id: entry.id,
              label: entry.title,
              description: entry.description,
            })),
          }}
          onChoose={(id) => {
            setFlowMenuOpen(false);
            setFlowScreen(id);
          }}
          onClose={() => setFlowMenuOpen(false)}
        />
      ) : null}

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
        />
      ) : null}

      {toast !== null && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
