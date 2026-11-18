import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameBridge } from "@moongames/game-sdk";
import { configureAssets, readLauncherHandoff } from "@moongames/game-sdk";
import {
  FINISH_PROGRESS,
  PLAYER_COLOR_HEX,
  PLAYER_LABEL,
  TOKENS_PER_PLAYER,
  DEFAULT_RULES,
  createGame,
  legalMoves,
  type LudoDifficulty,
  type LudoRules,
  type LudoState,
} from "@moongames/ludo-core";
import {
  GameToolbar,
  MatchChat,
  ModeSwitch,
  ProfilePanel,
  ReplayShell,
  gameMotif,
  useGamePreferences,
} from "@moongames/game-ui";
import { Icon } from "./components/Icon";
import { LudoBoard } from "./components/LudoBoard";
import { LudoPreferences } from "./components/LudoPreferences";
import { useLocalLudo } from "./hooks/useLocalLudo";
import { useOnlineLudo } from "./hooks/useOnlineLudo";
import { readLocalProgress } from "./lib/localProgress";
import {
  audibleVolume, BOARD_THEMES, GAME_MODES, MODE_RULES, SOUND_SETS,
  TOKEN_SETS, TURN_CLOCKS, type GameModeId,
} from "./lib/preferences";
import { configureSound, isMuted, playEvent, preloadEvent, setMuted } from "./lib/sound";

type Mode = "local" | "ai" | "online";

const MODES = [
  { id: "local", label: "Local", icon: <Icon name="users" size={15} /> },
  { id: "ai", label: "vs AI", icon: <Icon name="sparkles" size={15} /> },
  { id: "online", label: "Online", icon: <Icon name="shield-check" size={15} /> },
];

const DIFFICULTIES: { id: LudoDifficulty; label: string }[] = [
  { id: "easy", label: "Easy" },
  { id: "normal", label: "Normal" },
  { id: "hard", label: "Hard" },
];

const DIE_DOTS: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

function PipFace({ value }: { value: number }) {
  return (
    <>
      {(DIE_DOTS[value] ?? DIE_DOTS[1]).map((cell) => <span key={cell} />)}
    </>
  );
}

const RULES = [
  "A six lets a token leave its yard. Three sixes in a row forfeit the turn.",
  "Two of your tokens on one square make a wall opponents cannot enter.",
  "A capture sends the rival token home and earns another roll.",
  "A token must land exactly on the centre to finish. First player home wins.",
];

function Die({ value, rolling = false }: { value: number | null; rolling?: boolean }) {
  const face = value ?? 1;
  const top = (face % 6) + 1;
  const right = ((face + 1) % 6) + 1;
  return (
    <div className="dice-wrap" aria-label={value ? `Die shows ${value}` : "Die not rolled"}>
      <div className={`dice-cube ${rolling || value === null ? "" : "dice-cube--settled"}`}>
        <div className="dice-face dice-face--front"><PipFace value={face} /></div>
        <div className="dice-face dice-face--top"><PipFace value={top} /></div>
        <div className="dice-face dice-face--right"><PipFace value={right} /></div>
      </div>
    </div>
  );
}

export default function App({ bridge }: { bridge: GameBridge }) {
  useEffect(() => {
    configureAssets(bridge);
    readLauncherHandoff(__MOONGAMES_GAME_ID__);
    for (const event of ["roll", "move", "capture", "home", "foul", "turn", "start", "win"] as const) {
      preloadEvent(event);
    }
  }, [bridge]);

  const [mode, setMode] = useState<Mode>("ai");
  const [seats, setSeats] = useState(4);
  const [difficulty, setDifficulty] = useState<LudoDifficulty>("normal");
  const [humanSeats, setHumanSeats] = useState(1);
  const [rules, setRules] = useState<Partial<LudoRules>>(MODE_RULES.classic);
  const [variant, setVariant] = useState<GameModeId>("classic");
  const [turnSeconds, setTurnSeconds] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [diceRolling, setDiceRolling] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [soundOn, setSoundOn] = useState(!isMuted());
  const [rulesOpen, setRulesOpen] = useState(false);
  const [roomInput, setRoomInput] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [version] = useState(__MOONGAMES_GAME_VERSION__);
  const [progress, setProgress] = useState(() => readLocalProgress());
  const [toast, setToast] = useState<string | null>(null);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const { preferences, setPreference } = useGamePreferences(__MOONGAMES_GAME_ID__);
  const appRef = useRef<HTMLDivElement>(null);

  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const autoplay = query.has("autoplay");
  const slowWatch = query.has("slow");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    // The shared defaults name Chess/Carrom art. Point a new Ludo player at
    // this title's own sets so the picker and the board agree on first load.
    if (!TOKEN_SETS.some((set) => set.id === preferences.pieceSet)) setPreference("pieceSet", "marble");
    if (!BOARD_THEMES.some((theme) => theme.id === preferences.boardTheme)) setPreference("boardTheme", "classic");
    if (!SOUND_SETS.some((set) => set.id === preferences.soundSet)) setPreference("soundSet", "ludo");
  }, [preferences.pieceSet, preferences.boardTheme, preferences.soundSet, setPreference]);

  useEffect(() => {
    configureSound({
      set: preferences.soundSet,
      volume: audibleVolume(preferences, 1),
      enabled: soundOn,
    });
  }, [preferences.soundSet, preferences.soundEnabled, preferences.soundVolume, soundOn]);

  useEffect(() => {
    const update = () => setIsFullscreen(document.fullscreenElement === appRef.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void appRef.current?.requestFullscreen();
  }, []);

  const seatCount = mode === "local" ? seats : autoplay ? 0 : humanSeats;
  const controller = useLocalLudo({
    seats,
    humanSeats: seatCount,
    rules,
    difficulty,
    sound: soundOn && !autoplay,
    enabled: mode !== "online",
    aiDelay: slowWatch ? 700 : autoplay ? 30 : undefined,
    animationMs: autoplay && !slowWatch ? 25 : 135,
  });
  const online = useOnlineLudo(mode === "online");

  useEffect(() => {
    if (controller.realGame.winner !== null) setProgress(readLocalProgress());
  }, [controller.realGame.winner]);

  const emptyGame = useMemo(() => createGame({ playerCount: seats }), [seats]);
  const game: LudoState = mode === "online" ? (online.state?.game ?? emptyGame) : controller.game;
  const legalTokens = useMemo(() => {
    if (mode === "online") {
      return game.phase === "move" ? legalMoves(game).map((move) => move.token) : [];
    }
    return controller.legalTokens;
  }, [mode, game, controller.legalTokens]);

  const current = game.players[game.current];

  useEffect(() => {
    if (!diceRolling) return;
    const timer = window.setTimeout(() => setDiceRolling(false), 650);
    return () => window.clearTimeout(timer);
  }, [diceRolling]);

  useEffect(() => {
    if (turnSeconds > 0) setRemaining(turnSeconds);
  }, [game.current, game.phase, game.action, turnSeconds]);

  useEffect(() => {
    if (!turnSeconds || mode === "online" || controller.isReplaying || game.phase === "over") return;
    const timer = window.setInterval(() => setRemaining((value) => value - 1), 1000);
    return () => window.clearInterval(timer);
  }, [turnSeconds, mode === "online", controller.isReplaying, game.phase, game.current, game.action]);

  useEffect(() => {
    if (remaining > 0 || !turnSeconds || mode === "online" || controller.isReplaying) return;
    if (game.phase === "over") return;
    if (game.phase === "move") controller.move(-1);
    else controller.roll();
    setRemaining(turnSeconds);
  }, [remaining, turnSeconds, mode === "online", game.phase, game.current]);

  useEffect(() => {
    if (!controller.isReplaying || !replayPlaying) return;
    const timer = window.setInterval(() => {
      if (controller.replayIndex >= controller.replayCount - 1) setReplayPlaying(false);
      else controller.setReplayIndex(controller.replayIndex + 1);
    }, 550);
    return () => window.clearInterval(timer);
  }, [controller.isReplaying, replayPlaying, controller.replayIndex, controller.replayCount]);

  const lastRoll = useMemo(
    () => [...game.events].reverse().find((event) => event.type === "roll"),
    [game.events],
  );
  const lastMoveEvent = useMemo(
    () => [...game.events].reverse().find((event) =>
      event.type === "move" || event.type === "leave-home" || event.type === "finish"),
    [game.events],
  );
  const latestEvent = game.events[game.events.length - 1];

  useEffect(() => {
    if (mode === "online" || !latestEvent) return;
    const messages: Record<string, string> = {
      capture: "Capture! A rival token went home.",
      extra: "Extra roll earned.",
      "six-foul": "Three sixes — turn forfeited.",
      finish: "A token reached home.",
      "leave-home": "A token entered the track.",
      "no-move": "No legal move — turn passes.",
    };
    const message = messages[latestEvent.type];
    if (!message) return;
    setToast(message);
    const timer = window.setTimeout(() => setToast(null), 1900);
    return () => window.clearTimeout(timer);
  }, [latestEvent?.action, mode]);
  const onlineMode = mode === "online";
  const inMatch = onlineMode && online.state !== null;
  const awaiting = onlineMode
    ? inMatch && game.phase === "roll" && !online.spectating
    : game.phase === "roll" && !current?.ai && !controller.isReplaying;
  const canMove = onlineMode
    ? inMatch && game.phase === "move" && legalTokens.length > 0 && !online.spectating
    : game.phase === "move" && legalTokens.length > 0 && !current?.ai && !controller.isReplaying;

  function changeMode(next: string) {
    const selected = next as Mode;
    setMode(selected);
    if (selected !== "online") {
      controller.newGame({ humanSeats: selected === "local" ? seats : 1 });
    }
  }

  function newGame() {
    controller.newGame({ seats, humanSeats: mode === "local" ? seats : 1 });
    setProgress(readLocalProgress());
    playEvent("start");
  }

  function doRoll() {
    setDiceRolling(true);
    if (onlineMode) online.roll();
    else controller.roll();
  }

  function doMove(token: number) {
    if (onlineMode) online.move(token);
    else controller.move(token);
  }

  function applySeats(nextSeats: number) {
    setSeats(nextSeats);
    const nextHumans = Math.min(humanSeats, nextSeats);
    setHumanSeats(nextHumans);
    controller.newGame({
      seats: nextSeats,
      humanSeats: mode === "local" ? nextSeats : autoplay ? 0 : nextHumans,
      rules,
    });
  }

  function applyHumanSeats(nextHumans: number) {
    setHumanSeats(nextHumans);
    controller.newGame({ humanSeats: nextHumans, seats, rules });
  }

  function applyRule(key: keyof LudoRules, value: boolean) {
    const next = { ...rules, [key]: value };
    setRules(next);
    setVariant("custom");
    controller.newGame({ rules: next, seats, humanSeats: seatCount });
  }

  function applyVariant(next: GameModeId) {
    setVariant(next);
    const preset = next === "custom" ? rules : MODE_RULES[next];
    setRules(preset);
    controller.newGame({ rules: preset, seats, humanSeats: seatCount });
  }

  function applyClock(seconds: number) {
    setTurnSeconds(seconds);
    setRemaining(seconds);
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setMuted(!next);
  }

  const replaySteps = useMemo(
    () => controller.realGame.events
      .filter((event) => event.type === "move" || event.type === "leave-home" || event.type === "finish" || event.type === "capture")
      .map((event) => `PLAYER ${event.player + 1} · ${event.type.replace("-", " ")}`),
    [controller.realGame.events],
  );

  const Motif = gameMotif("ludo");
  const modeLabel = mode === "local" ? "Pass and play" : mode === "ai" ? "Computer table" : "Online table";

  return (
    <div className={`app${isFullscreen ? " app--board-only" : ""}`} ref={appRef}>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            {Motif ? <Motif size={27} strokeWidth={1.55} /> : null}
          </span>
          <div>
            <p className="brand-kicker">MoonGames</p>
            <h1>Ludo</h1>
          </div>
          <span className="brand-version">v{version}</span>
        </div>
        <div className="header-actions">
          <ModeSwitch modes={MODES} mode={mode} onChange={changeMode} ariaLabel="Game mode" />
          <button type="button" className="icon-button" onClick={() => setRulesOpen(true)} title="Rules" aria-label="Open rules">
            <Icon name="book" size={18} />
          </button>
          <button type="button" className="icon-button" onClick={toggleSound} aria-pressed={soundOn} title={soundOn ? "Mute" : "Unmute"}>
            <Icon name={soundOn ? "volume" : "volume-off"} size={18} />
          </button>
          <button type="button" className="icon-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Theme">
            <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
          </button>
          <button type="button" className="icon-button" onClick={toggleFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
            <Icon name={isFullscreen ? "minimize" : "maximize"} size={18} />
          </button>
          {onlineMode ? null : (
            <button type="button" className="button button--ghost header-new" onClick={newGame}>
              <Icon name="refresh" size={16} /> New game
            </button>
          )}
        </div>
      </header>

      <main className="game-layout">
        <section className="board-panel">
          {isFullscreen ? (
            <button type="button" className="fullscreen-exit" onClick={toggleFullscreen} title="Exit fullscreen" aria-label="Exit fullscreen">
              <Icon name="minimize" size={18} />
            </button>
          ) : null}
          <div className="turn-strip">
            <span className="race-disc" style={{ background: current ? PLAYER_COLOR_HEX[current.color] : undefined }} />
            <div className="turn-strip__copy">
              <span className="eyebrow">Current turn</span>
              <strong>{autoplay && !onlineMode ? "Computer table" : current ? PLAYER_LABEL[current.seat] : "—"}</strong>
            </div>
            <Die value={lastRoll?.value ?? null} rolling={diceRolling} />
            {turnSeconds > 0 && !onlineMode && game.phase !== "over" ? (
              <span className={`turn-clock${remaining <= 5 ? " turn-clock--urgent" : ""}`} title="Turn clock">
                <Icon name="clock" size={14} strokeWidth={2} />{remaining}s
              </span>
            ) : null}
            {onlineMode ? (
              <span className={`turn-connection turn-connection--${online.connection}`}>
                {online.connection}
              </span>
            ) : null}
            <span className="turn-strip__meta">{modeLabel}</span>
          </div>

          <div className="board-frame">
            <div className="board-stage">
              <LudoBoard
                state={game}
                legalTokens={legalTokens}
                lastMove={!onlineMode ? controller.lastMove : null}
                onTokenClick={doMove}
                disabled={onlineMode || !!current?.ai || controller.isReplaying || game.phase === "over"}
                tokenSet={TOKEN_SETS.some((set) => set.id === preferences.pieceSet) ? preferences.pieceSet : "marble"}
                boardTheme={BOARD_THEMES.some((theme) => theme.id === preferences.boardTheme) ? preferences.boardTheme : "classic"}
                showLegalMoves={preferences.showLegalMoves}
                highlightLastMove={preferences.highlightLastMove}
                moveKey={!onlineMode ? lastMoveEvent?.action : undefined}
                onStep={!onlineMode && soundOn ? () => playEvent("move") : undefined}
                stepMs={autoplay && !slowWatch ? 25 : 135}
              />
            </div>
          </div>

          <GameToolbar
            title="Table actions"
            actions={[
              {
                id: "roll",
                label: awaiting ? "Roll dice" : game.phase === "move" ? "Choose a token" : "Waiting…",
                icon: <Icon name="sparkles" size={15} />,
                onClick: doRoll,
                disabled: !awaiting,
              },
              {
                id: "new",
                label: "New game",
                icon: <Icon name="refresh" size={15} />,
                onClick: newGame,
                disabled: onlineMode,
              },
              {
                id: "undo",
                label: "Undo",
                icon: <Icon name="skip-back" size={15} />,
                onClick: controller.undo,
                disabled: onlineMode || !controller.canUndo,
                title: "Take back the last action",
              },
              {
                id: "pass",
                label: "Pass turn",
                icon: <Icon name="check" size={15} />,
                onClick: () => doMove(-1),
                disabled: onlineMode || game.phase !== "move" || legalTokens.length > 0 || !!current?.ai,
                title: "Use this when the roll cannot move a token",
              },
              {
                id: "replay",
                label: "Replay",
                icon: <Icon name="skip-back" size={15} />,
                onClick: controller.startReplay,
                disabled: onlineMode || controller.replayCount === 0,
              },
            ]}
          />
          <p className="roll-hint">
            {controller.isReplaying && !onlineMode ? "Watching the recorded race."
              : canMove ? "Tap a glowing token to move it."
              : awaiting ? "Roll the dice to start your turn."
              : current?.ai ? `${PLAYER_LABEL[current.seat] ?? "COMPUTER"} is thinking…`
              : "Waiting for the next player."}
          </p>

        </section>

        <aside className="sidebar">
          {onlineMode ? (
            <section className="panel online-panel">
              <div className="panel-heading">
                <div><p className="eyebrow">Online table</p><h2>{inMatch ? "At the table" : "Find a game"}</h2></div>
                <span className="panel-heading__meta">{online.accountName ?? "Guest"}</span>
              </div>
              {online.error ? <p className="profile-error">{online.error}</p> : null}
              {!inMatch ? (
                <>
                  <div className="toolbar-grid">
                    {[2, 3, 4].map((count) => (
                      <button key={count} type="button" className="action-button" onClick={() => void online.quickMatch(count)}>
                        Quick {count}
                      </button>
                    ))}
                    <button type="button" className="action-button action-button--accent" onClick={() => void online.createPrivate(seats)}>
                      Private
                    </button>
                  </div>
                  <div className="invite-actions">
                    <input className="room-input" value={roomInput} onChange={(event) => setRoomInput(event.target.value)} placeholder="Room code" aria-label="Room code" />
                    <button type="button" className="mini-button" onClick={() => void online.joinByCode(roomInput)}>Join</button>
                    <button type="button" className="mini-button" onClick={() => void online.joinByCode(roomInput, true)}>Watch</button>
                  </div>
                  {online.searching ? <p className="ludo-note">Looking for players…</p> : null}
                </>
              ) : (
                <>
                  {online.roomCode ? <p className="room-code">Room code <strong>{online.roomCode}</strong></p> : null}
                  {online.spectating ? <p className="ludo-note">You are watching this table.</p> : null}
                  <div className="toolbar-grid">
                    <button type="button" className="action-button" onClick={() => void online.leave()}>Leave</button>
                    <button type="button" className="action-button action-button--danger" onClick={online.resign}>Resign</button>
                  </div>
                </>
              )}
            </section>
          ) : null}

          {onlineMode ? (
            <ProfilePanel
              connected={online.connection === "connected"}
              userId={online.myUserId}
              profile={online.profile}
              history={online.history}
              leaderboard={online.leaderboard}
              myLeaderboard={online.leaderboard.find((entry) => entry.userId === online.myUserId) ?? null}
              loading={online.profileLoading}
              error={online.profileError}
              onRefresh={() => void online.refreshProfile()}
              emptyProfileText="Your rating fills in after your first Ludo race."
              emptyHistoryText="Your finished Ludo games will appear here."
              emptyLeaderboardText="Play a quick match to enter the rating leaderboard."
              statLabels={{
                tokens_finished: "Tokens finished",
                captures: "Captures",
                best_streak: "Best streak",
              }}
            />
          ) : null}

          <section className="panel table-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Scoreboard</p><h2>Table</h2></div>
              <span className="panel-heading__meta">{game.playerCount} players</span>
            </div>
            <div className="race-list">
              {game.players.map((player) => (
                <div key={player.seat} className={`race-row ${player.seat === game.current ? "race-row--active" : ""}`}>
                  <span className="race-disc" style={{ background: PLAYER_COLOR_HEX[player.color] }} />
                  <div className="race-name">
                    {PLAYER_LABEL[player.seat]}
                    <span className="race-sub">{onlineMode ? player.color.toUpperCase() : player.ai ? "COMPUTER" : "PLAYER"}</span>
                  </div>
                  <div className="race-pieces">
                    {player.tokens.map((token) => (
                      <span
                        key={token.id}
                        className={token.progress >= FINISH_PROGRESS ? "is-home" : token.progress >= 0 ? "is-out" : ""}
                        style={{ borderColor: PLAYER_COLOR_HEX[player.color], color: PLAYER_COLOR_HEX[player.color] }}
                        title={`Token ${token.id + 1}: ${token.location}`}
                      />
                    ))}
                  </div>
                  <b className="race-count">{player.finished}/{TOKENS_PER_PLAYER}</b>
                </div>
              ))}
            </div>
          </section>

          <section className="panel table-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Table</p><h2>Game controls</h2></div>
              <span className="panel-heading__meta">changes start a new race</span>
            </div>
            <p className="ludo-note">Game mode</p>
            <div className="pref-choices" role="radiogroup" aria-label="Game mode">
              {GAME_MODES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={variant === option.id}
                  className={`pref-choice${variant === option.id ? " is-chosen" : ""}`}
                  title={option.hint}
                  onClick={() => applyVariant(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <p className="ludo-note">Players</p>
            <div className="pref-choices" role="radiogroup" aria-label="Players">
              {[2, 3, 4].map((count) => (
                <button
                  key={count}
                  type="button"
                  role="radio"
                  aria-checked={seats === count}
                  className={`pref-choice${seats === count ? " is-chosen" : ""}`}
                  onClick={() => applySeats(count)}
                >
                  {count} players
                </button>
              ))}
            </div>
            {mode === "ai" ? (
              <>
                <p className="ludo-note">
                  {humanSeats} human · {seats - humanSeats} computer
                </p>
                <div className="pref-choices" role="radiogroup" aria-label="Human players">
                  {Array.from({ length: seats }, (_, index) => index + 1).map((count) => (
                    <button
                      key={count}
                      type="button"
                      role="radio"
                      aria-checked={humanSeats === count}
                      className={`pref-choice${humanSeats === count ? " is-chosen" : ""}`}
                      onClick={() => applyHumanSeats(count)}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            <p className="ludo-note">Turn clock</p>
            <div className="pref-choices" role="radiogroup" aria-label="Turn clock">
              {TURN_CLOCKS.map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  role="radio"
                  aria-checked={turnSeconds === seconds}
                  className={`pref-choice${turnSeconds === seconds ? " is-chosen" : ""}`}
                  onClick={() => applyClock(seconds)}
                >
                  {seconds === 0 ? "Off" : `${seconds}s`}
                </button>
              ))}
            </div>

            <p className="ludo-note">Rules</p>
            <div className="rule-switches">
              {([
                ["safeSquares", "Safe star squares"],
                ["blocks", "Two-token walls"],
                ["sixExtra", "Extra roll on six"],
                ["captureExtra", "Extra roll on capture"],
                ["exactFinish", "Exact roll to finish"],
                ["threeSixesFoul", "Three sixes forfeit"],
              ] as const).map(([key, label]) => (
                <label key={key} className="rule-switch">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={rules[key] ?? DEFAULT_RULES[key]}
                    onChange={(event) => applyRule(key, event.target.checked)}
                  />
                </label>
              ))}
            </div>
          </section>

          {mode === "ai" ? (
            <section className="panel ai-panel">
              <div className="panel-heading"><div><p className="eyebrow">Computer</p><h2>Level</h2></div></div>
              <div className="ai-panel__options" role="radiogroup" aria-label="Computer level">
                {DIFFICULTIES.map((level) => (
                  <button
                    key={level.id}
                    type="button"
                    role="radio"
                    aria-checked={difficulty === level.id}
                    className={`mini-button ${difficulty === level.id ? "mini-button--active" : ""}`}
                    onClick={() => {
                      setDifficulty(level.id);
                      controller.newGame({ difficulty: level.id });
                    }}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {!onlineMode && game.winner !== null && !controller.isReplaying ? (
            <section className="panel status-panel" aria-live="polite">
              <span className="status-panel__icon"><Icon name="trophy" size={22} /></span>
              <div>
                <p className="eyebrow">Race complete</p>
                <h2>{PLAYER_LABEL[game.winner]} wins</h2>
                <p>{game.players[game.winner]?.color} reached home first.</p>
              </div>
            </section>
          ) : null}

          <LudoPreferences gameId={__MOONGAMES_GAME_ID__} />

          {!onlineMode ? (
            <section className="panel">
              <div className="panel-heading"><div><p className="eyebrow">Local record</p><h2>History</h2></div></div>
              <div className="ludo-record">
                <div><strong>{progress.games}</strong><small>Games</small></div>
                <div><strong>{progress.wins}</strong><small>Wins</small></div>
                <div><strong>{progress.history.length}</strong><small>Saved</small></div>
              </div>
            </section>
          ) : null}

          <section className="panel tips-panel">
            <div className="panel-heading"><div><p className="eyebrow">Rules</p><h2>Table notes</h2></div></div>
            <ul className="tip-list">
              {RULES.map((rule) => <li key={rule}><span className="tip-mark" />{rule}</li>)}
            </ul>
          </section>
          <p className="sidebar-note">Every table uses the same seeded dice and rules as the server.</p>
        </aside>
      </main>

      {toast ? <div className="toast" role="status">{toast}</div> : null}

      {onlineMode ? (
        <div className="chat-dock">
          <MatchChat
            matchId={online.matchId}
            messages={online.state?.chat ?? []}
            selfUserId={online.myUserId}
            onSend={online.chat}
          />
        </div>
      ) : null}

      {controller.isReplaying && !onlineMode ? (
        <ReplayShell
          title="Race replay"
          kicker="MoonGames Ludo"
          steps={replaySteps}
          step={controller.replayIndex}
          playing={replayPlaying}
          board={(
            <LudoBoard
              state={game}
              legalTokens={[]}
              disabled
              tokenSet={preferences.pieceSet}
              boardTheme={preferences.boardTheme}
            />
          )}
          onStep={(index) => controller.setReplayIndex(index)}
          onTogglePlay={() => setReplayPlaying((value) => !value)}
          onClose={() => { controller.stopReplay(); setReplayPlaying(false); }}
          positionLabel={`${controller.replayIndex + 1} / ${controller.replayCount}`}
        />
      ) : null}

      {rulesOpen ? (
        <div className="dialog-backdrop" role="presentation" onClick={() => setRulesOpen(false)}>
          <div className="dialog" role="dialog" aria-label="Rules" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading"><div><p className="eyebrow">Ludo</p><h2>How to play</h2></div></div>
            <ul className="tip-list">{RULES.map((rule) => <li key={rule}><span className="tip-mark" />{rule}</li>)}</ul>
            <button type="button" className="button button--primary" onClick={() => setRulesOpen(false)}>Close</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
