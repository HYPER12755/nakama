import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { GameBridge } from "@moongames/game-sdk";
import {
  CARROM_BOARD,
  PLAYER_LABEL,
  chooseAiShotAsync,
  baselineOf,
  createInitialState,
  nearestValidStrikerPosition,
  simulateShot,
  validateShot,
  type CarromPlayer,
  type CarromShotInput,
  type CarromShotResult,
  type CarromState,
} from "@moongames/carrom-core";
import { CarromBoard } from "./components/CarromBoard";
import { GameOverDialog } from "./components/GameOverDialog";
import { Icon } from "./components/Icon";
import { OnlinePanel } from "./components/OnlinePanel";
import { RulesDialog } from "./components/RulesDialog";
import { ScoreCard } from "./components/ScoreCard";
import { useOnlineCarrom } from "./hooks/useOnlineCarrom";
import { type AimMode } from "./lib/aim";
import {
  playFoul,
  playPocket,
  playStrike,
  playWin,
} from "./lib/audio";
import {
  persistTheme,
  resolveGameTheme,
  storedTheme,
  type Theme,
} from "./lib/theme";

type Mode = "local" | "ai" | "online";

const SOUND_KEY = "moongames.carrom.sound";
const AIM_KEY = "moongames.carrom.aim";

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

function persistSound(enabled: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
  } catch {
    // Storage can be unavailable in private or embedded contexts.
  }
}

function queenText(state: CarromState | null): string {
  if (state === null) {
    return "Waiting";
  }
  if (state.queen.status === "covered" && state.queen.owner !== undefined) {
    return `${PLAYER_LABEL[state.queen.owner]} covered`;
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
): string {
  if (state === null) {
    return "Waiting for the table";
  }
  if (state.status === "finished" && state.winner !== null) {
    return `${PLAYER_LABEL[state.winner]} wins`;
  }
  if (animation !== null) {
    return "Shot in motion";
  }
  if (aiThinking) {
    return "Onyx is lining up";
  }
  if (state.queen.status === "pending") {
    return "Cover the queen";
  }
  return `${PLAYER_LABEL[state.turn]} to shoot`;
}

function statusDetail(
  state: CarromState | null,
  animation: CarromShotResult | null,
  aiThinking: boolean,
): string {
  if (state === null) {
    return "Connect to MoonGames and open a table to play online.";
  }
  if (animation !== null) {
    return "The table is settling. The next turn starts automatically.";
  }
  if (aiThinking) {
    return "Onyx is reading the angles and choosing a pocket line.";
  }
  if (state.lastOutcome !== undefined) {
    return state.lastOutcome.message;
  }
  return "Drag from the striker toward a pocket. A longer drag gives the shot more power.";
}

function isAiPlayer(mode: Mode, player: CarromPlayer): boolean {
  return mode === "ai" && player === "black";
}

export interface AppProps {
  bridge: GameBridge;
}

export default function App({ bridge }: AppProps) {
  const [mode, setMode] = useState<Mode>("local");
  const [game, setGame] = useState<CarromState>(() => createInitialState());
  const [strikerPosition, setStrikerPosition] = useState(0.5);
  const [animation, setAnimation] = useState<CarromShotResult | null>(null);
  const [theme, setTheme] = useState<Theme>(storedTheme);
  const [soundOn, setSoundOn] = useState(storedSound);
  const [aimMode, setAimMode] = useState<AimMode>(storedAimMode);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [onlineSeats, setOnlineSeats] = useState(2);

  const appRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<CarromShotResult | null>(null);
  const soundTimers = useRef<number[]>([]);
  const modeRef = useRef<Mode>(mode);

  const inviteMatchId = useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return new URLSearchParams(window.location.search).get("match");
  }, []);
  const inviteSpectate = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return new URLSearchParams(window.location.search).get("spectate") === "1";
  }, []);
  const online = useOnlineCarrom({
    autoJoinMatchId: inviteMatchId,
    autoSpectate: inviteSpectate,
  });
  const onlineMode = mode === "online";
  const activeGame: CarromState | null = onlineMode ? online.game : game;
  const activeAnimation: CarromShotResult | null = onlineMode
    ? online.animation
    : animation;

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
    try {
      window.localStorage.setItem(AIM_KEY, aimMode);
    } catch {
      // Storage can be unavailable in private or embedded contexts.
    }
  }, [aimMode]);

  useEffect(() => {
    return bridge.onMessage((message) => {
      if (message.type === "init") {
        setTheme(resolveGameTheme(message.config.theme));
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
    const update = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    update();
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  useEffect(() => {
    if (toast === null) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 5200);
    return () => window.clearTimeout(timer);
  }, [toast]);

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
      playStrike();
      for (const event of result.pocketed) {
        const timer = window.setTimeout(
          () => playPocket(event.kind === "queen"),
          Math.max(0, event.time * 1000),
        );
        soundTimers.current.push(timer);
      }
      if (result.outcome.foul) {
        const timer = window.setTimeout(
          playFoul,
          Math.max(80, result.duration * 1000),
        );
        soundTimers.current.push(timer);
      }
      if (result.outcome.winner !== null) {
        const timer = window.setTimeout(
          playWin,
          Math.max(120, result.duration * 1000 + 140),
        );
        soundTimers.current.push(timer);
      }
    },
    [clearSoundTimers, soundOn],
  );

  const handleShoot = useCallback(
    (shot: CarromShotInput) => {
      if (onlineMode) {
        // The server owns the table. The client only asks for the shot.
        online.sendShot(shot);
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
      animationRef.current = result;
      setAnimation(result);
      setStrikerPosition(shot.position);
      setAiThinking(false);
      scheduleSounds(result);
    },
    [game, online, onlineMode, paused, scheduleSounds],
  );

  const handleAnimationComplete = useCallback(() => {
    if (onlineMode) {
      online.clearAnimation();
      return;
    }
    const result = animationRef.current;
    if (result === null) {
      return;
    }
    animationRef.current = null;
    setAnimation(null);
    setGame(result.state);
    setStrikerPosition(
      nearestValidStrikerPosition(
        result.state,
        result.state.striker[baselineOf(result.state.turn).slideAxis],
      ),
    );
    setToast(result.outcome.message);
    if (result.outcome.winner !== null) {
      setResultOpen(true);
      bridge.haptic("success");
    } else if (result.outcome.foul) {
      bridge.haptic("error");
    } else if (result.outcome.ownPocketed > 0) {
      bridge.haptic("success");
    } else {
      bridge.haptic("light");
    }
  }, [bridge, online, onlineMode]);

  const resetBoard = useCallback(
    (message: string) => {
      clearSoundTimers();
      animationRef.current = null;
      setAnimation(null);
      setGame(createInitialState());
      setStrikerPosition(0.5);
      setAiThinking(false);
      setResultOpen(false);
      setToast(message);
    },
    [clearSoundTimers],
  );

  const handleNewGame = useCallback(() => {
    resetBoard("Fresh board. Ivory to shoot.");
  }, [resetBoard]);

  const handleModeChange = useCallback(
    (next: Mode) => {
      if (next === mode) {
        return;
      }
      setMode(next);
      resetBoard(
        next === "ai"
          ? "You are Ivory. The Moon AI plays Onyx."
          : "Pass-and-play board ready.",
      );
    },
    [mode, resetBoard],
  );

  const handleStrikerChange = useCallback(
    (value: number) => {
      setStrikerPosition(nearestValidStrikerPosition(activeGame ?? game, value));
    },
    [activeGame, game],
  );

  const nudgeStriker = useCallback(
    (direction: -1 | 1) => {
      setStrikerPosition(
        nearestValidStrikerPosition(
          activeGame ?? game,
          strikerPosition + direction * 0.025,
        ),
      );
    },
    [activeGame, game, strikerPosition],
  );

  useEffect(() => {
    if (
      mode !== "ai" ||
      game.turn !== "black" ||
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
        const aiShot = await chooseAiShotAsync(game);
        if (cancelled || modeRef.current !== "ai" || animationRef.current !== null) {
          return;
        }
        setAiThinking(false);
        handleShoot(aiShot);
      })();
    }, 260);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mode, game, animation, paused, handleShoot]);

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
      !isAiPlayer(mode, game.turn);

  const active = activeGame !== null && activeGame.status === "aiming"
    ? activeGame.turn
    : false;
  const title = statusTitle(activeGame, activeAnimation, aiThinking);
  const detail = statusDetail(activeGame, activeAnimation, aiThinking);
  const queen = queenText(activeGame);
  const queenPending = activeGame?.queen.status === "pending";
  const modeLabel =
    mode === "ai"
      ? "Moon AI"
      : mode === "online"
        ? online.spectating
          ? "Watching"
          : "Online table"
        : "Pass & play";
  const version = __MOONGAMES_GAME_VERSION__;

  const scoreSummary = useMemo(() => {
    if (onlineMode) {
      return activeGame === null
        ? "No table yet"
        : (activeGame.players ?? [])
            .map(
              (player) =>
                `${PLAYER_LABEL[player]} ${activeGame.scores[player] ?? 0}`,
            )
            .join(" · ");
    }
    return game.players
      .map((player) => `${PLAYER_LABEL[player]} ${game.scores[player]}`)
      .join(" · ");
  }, [activeGame, game.players, game.scores, onlineMode]);

  return (
    <div className="app" ref={appRef}>
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
          <div className="mode-switch" role="tablist" aria-label="Game mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "local"}
              className={`mode-switch__button${mode === "local" ? " mode-switch__button--active" : ""}`}
              onClick={() => handleModeChange("local")}
            >
              <Icon name="users" size={15} />
              Local
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "ai"}
              className={`mode-switch__button${mode === "ai" ? " mode-switch__button--active" : ""}`}
              onClick={() => handleModeChange("ai")}
            >
              <Icon name="cpu" size={15} />
              vs AI
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "online"}
              className={`mode-switch__button${mode === "online" ? " mode-switch__button--active" : ""}`}
              onClick={() => handleModeChange("online")}
            >
              <Icon name="users" size={15} />
              Online
            </button>
          </div>

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
          <button
            type="button"
            className="button button--ghost header-new"
            onClick={handleNewGame}
          >
            <Icon name="refresh" size={16} />
            New board
          </button>
        </div>
      </header>

      <main className="game-layout">
        <section className="board-panel">
          <div className="turn-strip">
            <span className={`turn-disc turn-disc--${activeGame?.turn ?? "white"}`} />
            <div className="turn-strip__copy">
              <span className="eyebrow">Current shot</span>
              <strong>{title}</strong>
            </div>
            <span className="turn-strip__meta">{modeLabel}</span>
          </div>

          <div className="board-stage">
            <CarromBoard
              state={activeGame ?? game}
              strikerPosition={strikerPosition}
              animation={activeAnimation}
              disabled={!canShoot}
              theme={theme}
              aimMode={aimMode}
              onShoot={handleShoot}
              onAnimationComplete={handleAnimationComplete}
            />
          </div>

          <div className="board-controls">
            <div className="striker-control">
              <span className="striker-control__label">Striker</span>
              <button
                type="button"
                className="stepper"
                onClick={() => nudgeStriker(-1)}
                disabled={!canShoot}
                aria-label="Move striker left"
              >
                <Icon name="chevron-left" size={16} strokeWidth={2.2} />
              </button>
              <input
                type="range"
                min={CARROM_BOARD.baselineMin}
                max={CARROM_BOARD.baselineMax}
                step={0.005}
                value={strikerPosition}
                disabled={!canShoot}
                aria-label="Striker position along the baseline"
                onChange={(event) =>
                  handleStrikerChange(Number(event.target.value))
                }
              />
              <button
                type="button"
                className="stepper"
                onClick={() => nudgeStriker(1)}
                disabled={!canShoot}
                aria-label="Move striker right"
              >
                <Icon name="chevron-right" size={16} strokeWidth={2.2} />
              </button>
            </div>
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
          <section className="panel table-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Scoreboard</p>
                <h2>Table</h2>
              </div>
              <span className="panel-heading__meta">{scoreSummary}</span>
            </div>
            <div className="score-list">
              {onlineMode
                ? online.seats.map((seat, seatIndex) => (
                    <ScoreCard
                      key={seat.user_id}
                      player={seat.colour}
                      score={activeGame?.scores[seat.colour] ?? 0}
                      active={active === seat.colour}
                      queen={activeGame?.queen ?? { status: "board" }}
                      ai={false}
                      seat={seatIndex + 1}
                    />
                  ))
                : game.players.map((player, seat) => (
                    <ScoreCard
                      key={player}
                      player={player}
                      score={game.scores[player]}
                      active={active === player}
                      queen={game.queen}
                      ai={isAiPlayer(mode, player)}
                      seat={seat + 1}
                    />
                  ))}
            </div>
            <div className={`queen-row${queenPending ? " queen-row--pending" : ""}`}>
              <span className="queen-dot" />
              <span>Queen</span>
              <strong>{queen}</strong>
            </div>
          </section>

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
              <p className="eyebrow">Table read</p>
              <h2>{title}</h2>
              <p>{detail}</p>
            </div>
          </section>

          {onlineMode ? (
            <OnlinePanel
              online={online}
              seats={onlineSeats}
              onSeatsChange={setOnlineSeats}
            />
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
                The queen must be covered before the last piece can finish the
                board.
              </li>
            </ul>
          </section>

          <p className="sidebar-note">
            {mode === "ai" ? "Solo table" : "Two players, one device"} ·{" "}
            {isFullscreen ? "Fullscreen" : "Windowed"}
          </p>
        </aside>
      </main>

      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
      {resultOpen && game.status === "finished" && game.winner !== null ? (
        <GameOverDialog
          winner={game.winner}
          onNewGame={handleNewGame}
          onClose={() => setResultOpen(false)}
        />
      ) : null}
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
