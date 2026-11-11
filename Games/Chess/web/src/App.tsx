import { useEffect, useRef, useState } from "react";
import {
  GAME_PROTOCOL_VERSION,
  type GameBridge,
  type GameHostConfig,
  type GameTheme,
} from "@moongames/game-sdk";
import {
  ChessEngine,
  type ChessState,
  type Color,
} from "@moongames/chess-core";
import { AiPanel } from "./components/AiPanel";
import { ChessBoard } from "./components/ChessBoard";
import { GameStatus } from "./components/GameStatus";
import { GameToolbar } from "./components/GameToolbar";
import { ModeSwitch, type GameMode } from "./components/ModeSwitch";
import { MoveList } from "./components/MoveList";
import { OnlineGameToolbar } from "./components/OnlineGameToolbar";
import { OnlinePanel } from "./components/OnlinePanel";
import { PlayerCard } from "./components/PlayerCard";
import { ProfilePanel } from "./components/ProfilePanel";
import { PromotionPicker } from "./components/PromotionPicker";
import {
  useChessGame,
  type AiGameSettings,
} from "./hooks/useChessGame";
import { useOnlineChess } from "./hooks/useOnlineChess";
import { copyText } from "./lib/clipboard";
import {
  clearMatchInviteFromLocation,
  parseLaunchInvite,
  parseMatchInvite,
} from "./lib/invite";

type Theme = "dark" | "light";

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

export default function App({ bridge }: AppProps) {
  const [idleState] = useState<ChessState>(() => new ChessEngine().getState());
  const [invite, setInvite] = useState(() =>
    parseMatchInvite(window.location.search),
  );
  const [mode, setMode] = useState<GameMode>(invite === null ? "local" : "online");
  const [hostConfig, setHostConfig] = useState<GameHostConfig | null>(null);
  const [hostInitReceived, setHostInitReceived] = useState(false);
  const [hostInitTimedOut, setHostInitTimedOut] = useState(false);
  const localGame = useChessGame({ active: mode === "local" });
  const aiGame = useChessGame({ ai: true, active: mode === "ai" });
  const online = useOnlineChess(hostConfig);
  const [theme, setTheme] = useState<Theme>("dark");
  const [flipped, setFlipped] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
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
            gameId: current?.gameId ?? "chess",
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
    if (toast === null) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

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

    if (online.serverState === null) {
      return {
        name: color === "w" ? "White" : "Black",
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
        player?.username ??
        (online.serverState.match.started ? "Open seat" : "Waiting for opponent"),
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

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            ☾
          </div>
          <div>
            <p className="brand-kicker">MoonGames</p>
            <h1>Chess</h1>
          </div>
        </div>
        <div className="header-actions">
          <ModeSwitch
            mode={mode}
            onlineStatus={online.connection}
            onChange={handleModeChange}
          />
          <button
            className="icon-button"
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle light and dark theme"
            title="Toggle theme"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      <main className="game-layout">
        <section className="board-panel" aria-label="Chess game">
          <PlayerCard
            color={topColor}
            active={topActive}
            finished={finished}
            {...topOnline}
          />

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
            color={bottomColor}
            active={bottomActive}
            finished={finished}
            {...bottomOnline}
          />
        </section>

        <aside className="sidebar">
          {onlineMode ? (
            <>
              <OnlinePanel controller={online} onNotify={setToast} />
              {online.serverState !== null &&
                online.serverState.match.started && (
                  <>
                    <GameStatus state={activeState} result={activeResult} />
                    <MoveList history={activeState.history} />
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
                  </>
                )}
              {showProfilePanel && <ProfilePanel controller={online} />}
            </>
          ) : aiMode ? (
            <>
              <AiPanel
                settings={aiGame.aiSettings}
                thinking={aiGame.aiThinking}
                onStart={handleStartAiGame}
              />
              <GameStatus state={activeState} />
              <MoveList history={activeState.history} />
              <GameToolbar
                canUndo={aiGame.canUndo}
                onNewGame={handleNewGame}
                onUndo={aiGame.undo}
                onFlip={() => setFlipped((current) => !current)}
                onCopyPgn={() => void handleCopyPgn()}
              />
            </>
          ) : (
            <>
              <GameStatus state={activeState} />
              <MoveList history={activeState.history} />
              <GameToolbar
                canUndo={localGame.canUndo}
                onNewGame={handleNewGame}
                onUndo={localGame.undo}
                onFlip={() => setFlipped((current) => !current)}
                onCopyPgn={() => void handleCopyPgn()}
              />
            </>
          )}
        </aside>
      </main>

      {activeError !== null && (
        <div className="error-banner" role="alert">
          {activeError}
        </div>
      )}

      {toast !== null && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
