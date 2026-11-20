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
  type LudoColor,
  type LudoDifficulty,
  type LudoEvent,
  type LudoMove,
  type LudoRules,
  type LudoState,
} from "@moongames/ludo-core";
import {
  AccountPanel,
  DEFAULT_PREFERENCES,
  FullscreenChatButton,
  MatchChat,
  ModeSwitch,
  ProfilePanel,
  ReplayShell,
  gameMotif,
  useGamePreferences,
  useLauncherHandoff,
} from "@moongames/game-ui";
import { Icon } from "./components/Icon";
import { LudoBoard } from "./components/LudoBoard";
import { LudoMatchActions } from "./components/LudoMatchActions";
import { LudoOnlinePanel, LudoOnlineResult } from "./components/LudoOnlinePanel";
import { LudoRaceBar } from "./components/LudoRaceBar";
import { LudoPreferences } from "./components/LudoPreferences";
import { useLocalLudo } from "./hooks/useLocalLudo";
import { useOnlineLudo } from "./hooks/useOnlineLudo";
import { readLocalProgress } from "./lib/localProgress";
import {
  audibleVolume, BOARD_THEMES, DICE_SETS, GAME_MODES, MODE_RULES, SOUND_SETS,
  START_MODES, TABLE_SPEEDS, TOKEN_SETS, TURN_CLOCKS,
  type GameModeId, type StartModeId, type TableSpeedId,
} from "./lib/preferences";
import { configureSound, isMuted, playEvent, preloadEvent, setMuted } from "./lib/sound";
import type { LudoSound } from "./lib/soundCatalog";

type Mode = "local" | "ai" | "online";

const COLOR_OPTIONS: readonly LudoColor[] = ["red", "green", "yellow", "blue"];

const MODES = [
  { id: "local", label: "Local", icon: <Icon name="users" size={15} /> },
  { id: "ai", label: "vs AI", icon: <Icon name="sparkles" size={15} /> },
  { id: "online", label: "Online", icon: <Icon name="shield-check" size={15} /> },
];

/** Authoritative online events that need a sound. Piece hops already play per step. */
const ONLINE_EVENT_SOUNDS: Partial<Record<LudoEvent["type"], LudoSound>> = {
  roll: "roll",
  "six-foul": "foul",
  "no-move": "foul",
  capture: "capture",
  finish: "home",
  extra: "turn",
  win: "win",
};

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

function Die({
  value, rolling = false, setId = "classic",
}: { value: number | null; rolling?: boolean; setId?: string }) {
  const face = value ?? 1;
  const top = (face % 6) + 1;
  const right = ((face + 1) % 6) + 1;
  const selected = DICE_SETS.find((entry) => entry.id === setId);
  const faceStyle = selected?.texture
    ? {
        backgroundImage: `url("${selected.texture}")`,
        backgroundColor: selected.color,
      }
    : undefined;
  const faceClass = `dice-face${selected?.texture ? " dice-face--textured" : ""}`;
  return (
    <div className="dice-wrap" aria-label={value ? `Die shows ${value}` : "Die not rolled"}>
      <div className={`dice-cube ${rolling || value === null ? "" : "dice-cube--settled"}`}>
        <div className={`${faceClass} dice-face--front`} style={faceStyle}><PipFace value={face} /></div>
        <div className={`${faceClass} dice-face--top`} style={faceStyle}><PipFace value={top} /></div>
        <div className={`${faceClass} dice-face--right`} style={faceStyle}><PipFace value={right} /></div>
      </div>
    </div>
  );
}

export default function App({ bridge }: { bridge: GameBridge }) {
  useEffect(() => {
    configureAssets(bridge);
    readLauncherHandoff(__MOONGAMES_GAME_ID__);
  }, [bridge]);

  const [mode, setMode] = useState<Mode>("ai");
  const [seats, setSeats] = useState(4);
  const [difficulty, setDifficulty] = useState<LudoDifficulty>("normal");
  const [humanSeats, setHumanSeats] = useState(1);
  const [seatHuman, setSeatHuman] = useState<boolean[]>([true, false, false, false]);
  const [seatDifficulty, setSeatDifficulty] = useState<LudoDifficulty[]>(["normal", "normal", "normal", "normal"]);
  const [startSeat, setStartSeat] = useState(0);
  const [startMode, setStartMode] = useState<StartModeId>("normal");
  const [autoForced, setAutoForced] = useState(true);
  const [haptics, setHaptics] = useState(true);
  const [seatColors, setSeatColors] = useState<LudoColor[]>(["red", "green", "yellow", "blue"]);
  const [seatNames, setSeatNames] = useState<string[]>(["", "", "", ""]);
  const [tokensPerPlayer, setTokensPerPlayer] = useState(4);
  const [tableSpeed, setTableSpeed] = useState<TableSpeedId>("normal");
  const [rules, setRules] = useState<Partial<LudoRules>>(MODE_RULES.classic);
  const [variant, setVariant] = useState<GameModeId>("classic");
  const [turnSeconds, setTurnSeconds] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [onlineRemaining, setOnlineRemaining] = useState(0);
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
  const { preferences, setPreference, resetPreference } = useGamePreferences(__MOONGAMES_GAME_ID__);
  const appRef = useRef<HTMLDivElement>(null);
  const onlineSoundSeenRef = useRef<Set<string> | null>(null);

  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const autoplay = query.has("autoplay");
  const slowWatch = query.has("slow");

  useEffect(() => {
    const room = query.get("room");
    if (!room) return;
    setRoomInput(room);
    setMode("online");
  }, [query]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    // The shared defaults name Chess/Carrom art. Point a new Ludo player at
    // this title's own sets so the picker and the board agree on first load.
    if (!TOKEN_SETS.some((set) => set.id === preferences.pieceSet)) setPreference("pieceSet", "regalia");
    if (!DICE_SETS.some((set) => set.id === preferences.diceSet)) setPreference("diceSet", "classic");
    if (!BOARD_THEMES.some((theme) => theme.id === preferences.boardTheme)) setPreference("boardTheme", "classic");
    if (!SOUND_SETS.some((set) => set.id === preferences.soundSet)) setPreference("soundSet", "ludo");
  }, [preferences.pieceSet, preferences.diceSet, preferences.boardTheme, preferences.soundSet, setPreference]);

  useEffect(() => {
    configureSound({
      set: preferences.soundSet,
      volume: audibleVolume(preferences, 1),
      enabled: soundOn,
    });
  }, [preferences.soundSet, preferences.soundEnabled, preferences.soundVolume, soundOn]);

  useEffect(() => {
    for (const event of ["roll", "move", "capture", "home", "foul", "turn", "start", "win"] as const) {
      preloadEvent(event);
    }
  }, [preferences.soundSet]);

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
    aiDelay: slowWatch ? 1200 : autoplay ? 220 : TABLE_SPEEDS.find((entry) => entry.id === tableSpeed)!.aiDelay,
    animationMs: slowWatch ? 180 : autoplay ? 60 : TABLE_SPEEDS.find((entry) => entry.id === tableSpeed)!.stepMs,
    colors: seatColors,
    names: seatNames,
    tokensPerPlayer,
    seatHuman,
    seatDifficulty,
    startSeat,
    startMode,
  });
  const launcherConfig = useLauncherHandoff(__MOONGAMES_GAME_ID__);
  const online = useOnlineLudo(mode === "online", launcherConfig);

  useEffect(() => {
    if (controller.realGame.winner !== null) setProgress(readLocalProgress());
  }, [controller.realGame.winner]);

  const emptyGame = useMemo(() => {
    const fresh = createGame({
      playerCount: seats, colors: seatColors, names: seatNames, tokensPerPlayer,
    });
    fresh.current = Math.min(startSeat, seats - 1);
    return fresh;
  }, [seats, seatColors, seatNames, tokensPerPlayer, startSeat]);
  const game: LudoState = mode === "online" ? (online.state?.game ?? emptyGame) : controller.game;

  // The local controller plays sounds when it applies a move. Online play has
  // no controller, so every client plays the authoritative events it receives.
  // Seen keys stop a rejoining clock update from repeating an old roll.
  useEffect(() => {
    if (mode !== "online" || online.state === null) {
      onlineSoundSeenRef.current = null;
      return;
    }
    const events: LudoEvent[] = online.state.game?.events ?? [];
    const keyOf = (event: LudoEvent) =>
      `${event.action}|${event.type}|${event.player}|${event.token ?? ""}|${event.value ?? ""}`;
    const seen = onlineSoundSeenRef.current;
    if (seen === null) {
      onlineSoundSeenRef.current = new Set(events.map(keyOf));
      return;
    }
    const fresh = events.filter((event) => !seen.has(keyOf(event)));
    for (const event of fresh) seen.add(keyOf(event));
    if (!soundOn) return;
    for (const event of fresh) {
      const sound = ONLINE_EVENT_SOUNDS[event.type];
      if (sound !== undefined) playEvent(sound);
    }
  }, [mode, online.state, soundOn]);

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
  const rollBySeat = useMemo(() => {
    const values: Record<number, number | null> = {};
    for (const event of game.events) {
      if (event.type === "roll") values[event.player] = event.value ?? null;
    }
    return values;
  }, [game.events]);
  const lastMoveEvent = useMemo(
    () => [...game.events].reverse().find((event) =>
      event.type === "move" || event.type === "leave-home" || event.type === "finish"),
    [game.events],
  );
  const onlineMove = useMemo<LudoMove | null>(() => {
    if (!lastMoveEvent || lastMoveEvent.token === undefined) return null;
    return {
      player: lastMoveEvent.player,
      token: lastMoveEvent.token,
      from: lastMoveEvent.from ?? -1,
      to: lastMoveEvent.to ?? 0,
      leavesHome: lastMoveEvent.type === "leave-home" || (lastMoveEvent.from ?? -1) < 0,
      finishes: lastMoveEvent.type === "finish" || (lastMoveEvent.to ?? 0) >= 56,
      captures: (lastMoveEvent.captured ?? []).map((entry) => ({
        player: entry.player,
        token: entry.token,
      })),
      safe: false,
    };
  }, [lastMoveEvent]);
  const latestEvent = game.events[game.events.length - 1];

  useEffect(() => {
    const deadline = online.state?.turnDeadline;
    if (mode !== "online" || deadline === null || deadline === undefined) {
      setOnlineRemaining(0);
      return;
    }
    const update = () => setOnlineRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 500);
    return () => window.clearInterval(timer);
  }, [mode, online.state?.turnDeadline]);

  useEffect(() => {
    if (!lastRoll) return;
    setDiceRolling(true);
    const timer = window.setTimeout(() => setDiceRolling(false), 650);
    return () => window.clearTimeout(timer);
  }, [lastRoll?.action]);

  useEffect(() => {
    if (!latestEvent) return;
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
    if (haptics && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(latestEvent.type === "capture" || latestEvent.type === "win" ? [40, 35, 70] : 28);
    }
    const timer = window.setTimeout(() => setToast(null), 1900);
    return () => window.clearTimeout(timer);
  }, [latestEvent?.action, mode, haptics]);
  const onlineMode = mode === "online";
  const inMatch = onlineMode && online.state !== null;
  const myTurn = onlineMode
    ? online.myColour !== null && current?.color === online.myColour
    : false;
  const awaiting = onlineMode
    ? inMatch && myTurn && game.phase === "roll" && !online.spectating
    : game.phase === "roll" && !current?.ai && !controller.isReplaying;
  const canMove = onlineMode
    ? inMatch && myTurn && game.phase === "move" && legalTokens.length > 0 && !online.spectating
    : game.phase === "move" && legalTokens.length > 0 && !current?.ai && !controller.isReplaying;

  useEffect(() => {
    if (onlineMode || !autoForced || !canMove || controller.isReplaying || legalTokens.length !== 1) return;
    const timer = window.setTimeout(() => controller.move(legalTokens[0]!), 420);
    return () => window.clearTimeout(timer);
  }, [canMove, autoForced, onlineMode, controller.isReplaying, game.action, game.current, legalTokens]);

  useEffect(() => {
    if (
      onlineMode || !autoForced || controller.isReplaying ||
      game.phase !== "move" || legalTokens.length > 0 || current?.ai
    ) return;
    const timer = window.setTimeout(() => controller.move(-1), 420);
    return () => window.clearTimeout(timer);
  }, [autoForced, onlineMode, controller.isReplaying, game.phase, game.current, legalTokens.length, current?.ai]);

  function changeMode(next: string) {
    const selected = next as Mode;
    setMode(selected);
    if (selected !== "online") {
      const roles = Array.from({ length: seats }, (_, seat) => selected === "local" || seat === 0);
      setSeatHuman(roles);
      setHumanSeats(roles.filter(Boolean).length);
      controller.newGame({ humanSeats: roles.filter(Boolean).length, seatHuman: roles });
    }
  }

  function newGame() {
    controller.newGame();
    setProgress(readLocalProgress());
    playEvent("start");
  }

  function playerName(seat: number): string {
    return seatNames[seat]?.trim() || PLAYER_LABEL[seat] || `PLAYER ${seat + 1}`;
  }

  function applySeatColor(seat: number, color: LudoColor) {
    const next = [...seatColors];
    const other = next.indexOf(color);
    if (other >= 0 && other !== seat) next[other] = next[seat]!;
    next[seat] = color;
    if (new Set(next).size !== 4) return;
    setSeatColors(next);
    controller.newGame({ colors: next });
  }

  function applyTokenCount(count: number) {
    setTokensPerPlayer(count);
    controller.newGame({ tokensPerPlayer: count });
  }

  async function rematch(count = seats, clock = turnSeconds) {
    await online.leave();
    await online.createPrivate(count, clock);
  }

  function doRoll() {
    if (onlineMode && !awaiting) return;
    setDiceRolling(true);
    if (onlineMode) online.roll();
    else controller.roll();
  }

  function rollForSeat(seat: number, ai: boolean) {
    const usable = awaiting && current?.seat === seat && game.phase === "roll";
    if (usable) {
      doRoll();
    } else if (ai) {
      setToast(`${playerName(seat)} rolls automatically.`);
    } else {
      setToast(`Wait for ${playerName(current?.seat ?? 0)} to finish.`);
    }
  }

  function doMove(token: number) {
    if (onlineMode) {
      if (canMove) online.move(token);
      return;
    }
    controller.move(token);
  }

  function applySeats(nextSeats: number) {
    const roles = Array.from({ length: nextSeats }, (_, seat) =>
      mode === "local" || autoplay ? false : seatHuman[seat] ?? seat === 0);
    const nextHumans = roles.filter(Boolean).length;
    const nextStart = Math.min(startSeat, nextSeats - 1);
    setSeats(nextSeats);
    setSeatHuman(roles);
    setHumanSeats(nextHumans);
    setStartSeat(nextStart);
    controller.newGame({
      seats: nextSeats,
      humanSeats: nextHumans,
      seatHuman: roles,
      startSeat: nextStart,
      rules,
    });
  }

  function applyHumanSeats(nextHumans: number) {
    const roles = Array.from({ length: seats }, (_, seat) => seat < nextHumans);
    setHumanSeats(nextHumans);
    setSeatHuman(roles);
    controller.newGame({ humanSeats: nextHumans, seatHuman: roles, seats, rules });
  }

  function applySeatRole(seat: number, human: boolean) {
    const next = [...seatHuman];
    next[seat] = human;
    setSeatHuman(next);
    setHumanSeats(next.filter(Boolean).length);
    controller.newGame({ seatHuman: next, humanSeats: next.filter(Boolean).length });
  }

  function applySeatDifficulty(seat: number, level: LudoDifficulty) {
    const next = [...seatDifficulty];
    next[seat] = level;
    setSeatDifficulty(next);
  }

  function applyStartSeat(seat: number) {
    setStartSeat(seat);
    controller.newGame({ startSeat: seat });
  }

  function applyStartMode(next: StartModeId) {
    const nextRules = {
      ...rules,
      turnOrder: next === "reverse" ? "reverse" as const : "normal" as const,
    };
    setStartMode(next);
    setRules(nextRules);
    if (next !== "random") setStartSeat(0);
    controller.newGame({ rules: nextRules, startMode: next, startSeat: next === "random" ? undefined : 0 });
  }

  function applyDefaults() {
    const roles = [true, false, false, false];
    const levels: LudoDifficulty[] = ["normal", "normal", "normal", "normal"];
    const colors: LudoColor[] = ["red", "green", "yellow", "blue"];
    const names = ["", "", "", ""];
    const defaultRules = { ...MODE_RULES.classic };

    setSeats(4);
    setHumanSeats(1);
    setSeatHuman(roles);
    setSeatDifficulty(levels);
    setDifficulty("normal");
    setStartSeat(0);
    setStartMode("normal");
    setSeatColors(colors);
    setSeatNames(names);
    setTokensPerPlayer(4);
    setTableSpeed("normal");
    setRules(defaultRules);
    setVariant("classic");
    setTurnSeconds(0);
    setRemaining(0);
    setAutoForced(true);
    setHaptics(true);
    setSoundOn(true);
    setMuted(false);
    setTheme("dark");

    for (const key of Object.keys(preferences) as Parameters<typeof resetPreference>[0][]) {
      resetPreference(key);
    }
    setPreference("pieceSet", "regalia");
    setPreference("diceSet", "classic");
    setPreference("boardTheme", "classic");
    setPreference("soundSet", "ludo");
    setPreference("soundEnabled", DEFAULT_PREFERENCES.soundEnabled);
    setPreference("soundVolume", DEFAULT_PREFERENCES.soundVolume);
    setPreference("showLegalMoves", DEFAULT_PREFERENCES.showLegalMoves);

    controller.newGame({
      seats: 4,
      humanSeats: mode === "local" ? 4 : 1,
      seatHuman: mode === "local" ? [true, true, true, true] : roles,
      seatDifficulty: levels,
      difficulty: "normal",
      rules: defaultRules,
      colors,
      names,
      tokensPerPlayer: 4,
      startSeat: 0,
      startMode: "normal",
    });
    playEvent("start");
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
          <button type="button" className="icon-button" onClick={toggleSound} aria-pressed={soundOn} aria-label={soundOn ? "Mute sound" : "Enable sound"} title={soundOn ? "Mute sound" : "Enable sound"}>
            <Icon name={soundOn ? "volume" : "volume-off"} size={18} />
          </button>
          <button type="button" className="icon-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle light and dark theme" title="Toggle theme">
            <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
          </button>
          <button type="button" className="icon-button" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
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
            <>
              <button type="button" className="fullscreen-exit" onClick={toggleFullscreen} title="Exit fullscreen" aria-label="Exit fullscreen">
                <Icon name="minimize" size={18} />
              </button>
              {onlineMode ? <FullscreenChatButton /> : null}
            </>
          ) : null}
          <LudoRaceBar
            players={game.players}
            names={game.players.map((player) => playerName(player.seat))}
            activeSeat={game.current}
            tokensPerPlayer={game.tokensPerPlayer ?? TOKENS_PER_PLAYER}
          />

          <div className="turn-strip">
            <span className="race-disc" style={{ background: current ? PLAYER_COLOR_HEX[current.color] : undefined }} />
            <div className="turn-strip__copy">
              <span className="eyebrow">Current turn</span>
              <strong>
                {autoplay && !onlineMode ? "Computer table"
                  : onlineMode && current
                    ? online.state?.seats.find((seat) => seat.colour === current.color)?.username ?? playerName(current.seat)
                    : current ? playerName(current.seat) : "—"}
              </strong>
            </div>
            {((turnSeconds > 0 && !onlineMode && game.phase !== "over") || (onlineMode && online.state?.turnDeadline != null)) ? (
              <span className={`turn-clock${(onlineMode ? onlineRemaining : remaining) <= 5 ? " turn-clock--urgent" : ""}`} title="Turn clock">
                <Icon name="clock" size={14} strokeWidth={2} />{onlineMode ? onlineRemaining : remaining}s
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
              <img className="ludo-board-base" src="boards/ludo-classic.jpg" alt="" aria-hidden="true" />
              <LudoBoard
                state={game}
                legalTokens={legalTokens}
                lastMove={onlineMode ? onlineMove : controller.lastMove}
                onTokenClick={doMove}
                disabled={controller.isReplaying || game.phase === "over" || (onlineMode ? online.spectating || !canMove : !!current?.ai)}
                tokenSet={TOKEN_SETS.some((set) => set.id === preferences.pieceSet) ? preferences.pieceSet : "marble"}
                boardTheme={BOARD_THEMES.some((theme) => theme.id === preferences.boardTheme) ? preferences.boardTheme : "classic"}
                showLegalMoves={preferences.showLegalMoves}
                highlightLastMove={preferences.highlightLastMove}
                moveKey={lastMoveEvent?.action}
                onStep={soundOn ? () => playEvent("move") : undefined}
                stepMs={slowWatch ? 180 : autoplay ? 60 : TABLE_SPEEDS.find((entry) => entry.id === tableSpeed)!.stepMs}
              />
              <div className="side-dice" aria-label="Player dice">
                {game.players.slice(0, game.playerCount).map((player) => {
                  const usable = awaiting && current?.seat === player.seat && game.phase === "roll";
                  return (
                    <button
                      key={player.seat}
                      type="button"
                      className={`side-die side-die--${player.color}${usable ? " is-usable" : ""}${player.ai ? " is-auto" : ""}`}
                      aria-disabled={!usable}
                      onClick={() => rollForSeat(player.seat, player.ai)}
                      title={usable
                        ? `${playerName(player.seat)} — tap to roll`
                        : player.ai
                          ? `${playerName(player.seat)} is computer-controlled`
                          : `It is ${playerName(current?.seat ?? 0)}'s turn`}
                    >
                      <Die
                        value={rollBySeat[player.seat] ?? null}
                        rolling={diceRolling && lastRoll?.player === player.seat}
                        setId={DICE_SETS.some((set) => set.id === preferences.diceSet) ? preferences.diceSet : "classic"}
                      />
                      <span className="side-die__tag">{usable ? "ROLL" : player.ai ? "AUTO" : "WAIT"}</span>
                    </button>
                  );
                })}
              </div>
              {!onlineMode && game.winner !== null && !controller.isReplaying ? (
                <div className="winner-overlay" role="dialog" aria-label="Race complete">
                  <div className="winner-card">
                    <span className="winner-card__icon"><Icon name="trophy" size={28} /></span>
                    <p className="eyebrow">Race complete</p>
                    <h2>{playerName(game.winner)} wins</h2>
                    <p>{game.players[game.winner]?.color} brought every token home.</p>
                    <div className="winner-card__actions">
                      <button type="button" className="button" onClick={newGame}>Play again</button>
                      <button type="button" className="button button--ghost" onClick={controller.startReplay}>Watch replay</button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <LudoMatchActions
            mode={mode}
            spectating={online.spectating}
            phase={game.phase}
            awaiting={awaiting}
            canMove={canMove}
            canUndo={controller.canUndo}
            hasReplay={controller.replayCount > 0}
            replaying={controller.isReplaying}
            roomCode={online.roomCode}
            onRoll={doRoll}
            onUndo={controller.undo}
            onPass={() => doMove(-1)}
            onNewGame={newGame}
            onReplay={controller.startReplay}
            onLeave={() => void online.leave()}
            onResign={online.resign}
          />


        </section>

        <aside className="sidebar">
          {onlineMode && !inMatch ? (
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
          ) : null}

          {onlineMode ? (
            <LudoOnlinePanel
              online={online}
              seats={seats}
              roomInput={roomInput}
              onRoomInput={setRoomInput}
              onRematch={(count, clock) => void rematch(count, clock)}
              onNotify={setToast}
            />
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
                    {playerName(player.seat)}
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
                  <button
                    type="button"
                    className="race-die"
                    title={`${playerName(player.seat)} die — tap to roll on their turn`}
                    onClick={() => rollForSeat(player.seat, player.ai)}
                  >
                    {rollBySeat[player.seat] ?? "–"}
                  </button>
                  <b className="race-count">{player.finished}/{game.tokensPerPlayer ?? TOKENS_PER_PLAYER}</b>
                </div>
              ))}
            </div>
          </section>

          <section className="panel table-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Table</p><h2>Game controls</h2></div>
              <button type="button" className="button button--ghost defaults-button" onClick={applyDefaults} title="Restore default match and look settings">
                <Icon name="refresh" size={14} /> Defaults
              </button>
            </div>
            <p className="ludo-note">Game mode</p>
            <div className="pref-choices" role="radiogroup" aria-label="Rule preset">
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
            <p className="ludo-note">Table speed</p>
            <div className="pref-choices" role="radiogroup" aria-label="Table speed">
              {TABLE_SPEEDS.map((speed) => (
                <button
                  key={speed.id}
                  type="button"
                  role="radio"
                  aria-checked={tableSpeed === speed.id}
                  className={`pref-choice${tableSpeed === speed.id ? " is-chosen" : ""}`}
                  onClick={() => setTableSpeed(speed.id)}
                >
                  {speed.label}
                </button>
              ))}
            </div>

            <p className="ludo-note">Tokens to finish</p>
            <div className="pref-choices" role="radiogroup" aria-label="Tokens to finish">
              {[1, 2, 3, 4].map((count) => (
                <button
                  key={count}
                  type="button"
                  role="radio"
                  aria-checked={tokensPerPlayer === count}
                  className={`pref-choice${tokensPerPlayer === count ? " is-chosen" : ""}`}
                  onClick={() => applyTokenCount(count)}
                >
                  {count}
                </button>
              ))}
            </div>

            <p className="ludo-note">Start mode</p>
            <div className="pref-choices" role="radiogroup" aria-label="Start mode">
              {START_MODES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={startMode === option.id}
                  className={`pref-choice${startMode === option.id ? " is-chosen" : ""}`}
                  title={option.hint}
                  onClick={() => applyStartMode(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <p className="ludo-note">First turn</p>
            <div className="pref-choices" role="radiogroup" aria-label="First turn">
              {Array.from({ length: seats }, (_, seat) => seat + 1).map((seat) => (
                <button
                  key={seat}
                  type="button"
                  role="radio"
                  aria-checked={startSeat === seat - 1}
                  disabled={startMode === "random"}
                  className={`pref-choice${startSeat === seat - 1 ? " is-chosen" : ""}`}
                  onClick={() => applyStartSeat(seat - 1)}
                >
                  {`P${seat}`}
                </button>
              ))}
            </div>

            <p className="ludo-note">Seats · colour and name</p>
            <div className="seat-setup">
              {Array.from({ length: seats }, (_, seat) => (
                <div className="seat-setup__row" key={seat}>
                  <span className="race-disc" style={{ background: PLAYER_COLOR_HEX[seatColors[seat]!] }} />
                  <input
                    className="seat-setup__name"
                    aria-label={`Player ${seat + 1} name`}
                    placeholder={PLAYER_LABEL[seat]}
                    maxLength={14}
                    value={seatNames[seat] ?? ""}
                    onChange={(event) => {
                      const next = [...seatNames];
                      next[seat] = event.target.value;
                      setSeatNames(next);
                    }}
                  />
                  <select
                    className="seat-setup__colour"
                    aria-label={`Player ${seat + 1} colour`}
                    value={seatColors[seat]}
                    onChange={(event) => applySeatColor(seat, event.target.value as LudoColor)}
                  >
                    {COLOR_OPTIONS.map((color) => (
                      <option key={color} value={color}>{color}</option>
                    ))}
                  </select>
                  <select
                    className="seat-setup__role"
                    aria-label={`Player ${seat + 1} role`}
                    value={seatHuman[seat] ? "human" : "computer"}
                    disabled={mode === "local" || autoplay}
                    onChange={(event) => applySeatRole(seat, event.target.value === "human")}
                  >
                    <option value="human">Human</option>
                    <option value="computer">Computer</option>
                  </select>
                  <select
                    className="seat-setup__level"
                    aria-label={`Player ${seat + 1} AI level`}
                    value={seatDifficulty[seat] ?? "normal"}
                    disabled={seatHuman[seat] || mode === "local" || autoplay}
                    onChange={(event) => applySeatDifficulty(seat, event.target.value as LudoDifficulty)}
                  >
                    <option value="easy">Easy</option>
                    <option value="normal">Normal</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              ))}
            </div>

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
                ["sixToStart", "Six to leave home"],
                ["rushMode", "Move again after every move"],
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
            <label className="rule-switch">
              <span>Auto-play the only legal token</span>
              <input
                type="checkbox"
                checked={autoForced}
                onChange={(event) => setAutoForced(event.target.checked)}
              />
            </label>
            <label className="rule-switch">
              <span>Vibrate on captures and wins</span>
              <input
                type="checkbox"
                checked={haptics}
                onChange={(event) => setHaptics(event.target.checked)}
              />
            </label>
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
                <h2>{playerName(game.winner)} wins</h2>
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

      {onlineMode && online.state?.result ? (
        <LudoOnlineResult
          winnerColour={online.state.result.winnerColour}
          winnerName={online.state.seats.find((seat) => seat.colour === online.state!.result!.winnerColour)?.username}
          winnerUserId={online.state.result.winnerUserId}
          myUserId={online.myUserId}
          reason={online.state.result.reason}
          onRematch={() => void rematch()}
          onView={() => {}}
          onLeave={() => void online.leave()}
        />
      ) : null}

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
