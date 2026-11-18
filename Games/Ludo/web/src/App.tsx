import { useEffect, useMemo, useState } from "react";
import type { GameBridge } from "@moongames/game-sdk";
import { configureAssets, readLauncherHandoff } from "@moongames/game-sdk";
import {
  FINISH_PROGRESS,
  PLAYER_COLOR_HEX,
  PLAYER_LABEL,
  TOKENS_PER_PLAYER,
  createGame,
  legalMoves,
  type LudoDifficulty,
  type LudoState,
} from "@moongames/ludo-core";
import { ModeSwitch } from "@moongames/game-ui";
import { LudoBoard } from "./components/LudoBoard";
import { useLocalLudo } from "./hooks/useLocalLudo";
import { useOnlineLudo } from "./hooks/useOnlineLudo";
import { readLocalProgress } from "./lib/localProgress";
import { isMuted, setMuted } from "./lib/sound";

type Mode = "local" | "ai" | "online";

const MODES = [
  { id: "local", label: "Local" },
  { id: "ai", label: "Vs AI" },
  { id: "online", label: "Online" },
];

const DIFFICULTIES: { id: LudoDifficulty; label: string; hint: string }[] = [
  { id: "easy", label: "Easy", hint: "Relaxed, lucky moves" },
  { id: "normal", label: "Normal", hint: "Takes captures and safe squares" },
  { id: "hard", label: "Hard", hint: "Watches for threats and builds walls" },
];

function Die({ value }: { value: number | null }) {
  const dots: Record<number, number[]> = {
    1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
  };
  return (
    <div className="ludo-die" aria-label={value ? `Die shows ${value}` : "Die not rolled"}>
      {(dots[value ?? 0] ?? []).map((cell) => <span key={cell} />)}
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
  const [dark, setDark] = useState(false);
  const [soundOn, setSoundOn] = useState(!isMuted());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [roomInput, setRoomInput] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [version] = useState(__MOONGAMES_GAME_VERSION__);
  const [progress, setProgress] = useState(() => readLocalProgress());

  const humanSeats = mode === "local" ? seats : 1;
  const controller = useLocalLudo({ seats, humanSeats, difficulty, sound: soundOn, enabled: mode !== "online" });
  const online = useOnlineLudo(mode === "online");

  const emptyGame = useMemo(() => createGame({ playerCount: seats }), [seats]);
  const game: LudoState = mode === "online" ? (online.state?.game ?? emptyGame) : controller.game;
  const legalTokens = useMemo(() => {
    if (mode === "online") {
      return game.phase === "move" ? legalMoves(game).map((move) => move.token) : [];
    }
    return controller.legalTokens;
  }, [mode, game, controller.legalTokens]);

  const current = game.players[game.current];
  const lastRoll = useMemo(
    () => [...game.events].reverse().find((event) => event.type === "roll"),
    [game.events],
  );
  const isOnline = mode === "online";
  const inOnlineMatch = isOnline && online.state !== null;
  const awaiting = isOnline
    ? inOnlineMatch && game.phase === "roll" && !online.spectating
    : game.phase === "roll" && !current?.ai && !controller.isReplaying;
  const canMove = isOnline
    ? inOnlineMatch && game.phase === "move" && legalTokens.length > 0 && !online.spectating
    : game.phase === "move" && legalTokens.length > 0 && !current?.ai && !controller.isReplaying;

  function changeMode(next: string) {
    const selected = next as Mode;
    setMode(selected);
    if (selected !== "online") {
      controller.newGame({ humanSeats: selected === "local" ? seats : 1 });
    }
  }

  function startNewGame(nextSeats = seats) {
    setSeats(nextSeats);
    controller.newGame({ seats: nextSeats, humanSeats: mode === "local" ? nextSeats : 1 });
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setMuted(!next);
  }

  function handleRoll() {
    if (isOnline) online.roll();
    else controller.roll();
  }

  function handleMove(token: number) {
    if (isOnline) online.move(token);
    else controller.move(token);
  }

  return (
    <div className={`ludo-app ${dark ? "ludo-app--dark" : ""}`}>
      <header className="ludo-header">
        <div className="ludo-brand">
          <span className="ludo-brand__mark">◆</span>
          <div>
            <p className="ludo-brand__kicker">MoonGames</p>
            <h1>Ludo</h1>
          </div>
          <span className="ludo-version">v{version}</span>
        </div>
        <div className="ludo-header__actions">
          <ModeSwitch modes={MODES} mode={mode} onChange={changeMode} />
          <button type="button" className="ludo-icon-button" onClick={toggleSound} aria-label={soundOn ? "Mute" : "Unmute"}>
            {soundOn ? "♪" : "×"}
          </button>
          <button type="button" className="ludo-icon-button" onClick={() => setDark(!dark)} aria-label="Toggle theme">
            {dark ? "☀" : "☾"}
          </button>
          <button type="button" className="ludo-button ludo-button--ghost" onClick={() => setSettingsOpen(!settingsOpen)}>
            Settings
          </button>
          {!isOnline && (
            <button type="button" className="ludo-button" onClick={() => { startNewGame(); setProgress(readLocalProgress()); }}>
              New game
            </button>
          )}
        </div>
      </header>

      <main className="ludo-layout">
        <section className="ludo-stage">
          {controller.isReplaying && !isOnline && (
            <div className="ludo-replay-bar">
              <span>Replay</span>
              <input
                type="range" min={0} max={Math.max(0, controller.replayCount - 1)}
                value={controller.replayIndex}
                onChange={(event) => controller.setReplayIndex(Number(event.target.value))}
                aria-label="Replay position"
              />
              <span>{controller.replayIndex + 1} / {controller.replayCount}</span>
              <button type="button" className="ludo-button ludo-button--ghost" onClick={controller.stopReplay}>Close</button>
            </div>
          )}
          <div className="ludo-board-shell">
            <LudoBoard
              state={game}
              legalTokens={legalTokens}
              lastMove={!isOnline ? controller.lastMove : null}
              onTokenClick={handleMove}
              dark={dark}
            />
          </div>
          <p className="ludo-hint">
            {online.notice && isOnline ? online.notice
              : isOnline && !inOnlineMatch ? "Open a quick table or a private room to start."
              : controller.isReplaying ? "Watching a replay — close it to return to the live table."
              : canMove ? "Tap a glowing token to move it."
              : awaiting ? "Roll the dice to start your turn."
              : current?.ai ? `${PLAYER_LABEL[current.seat] ?? "COMPUTER"} is thinking…`
              : "Waiting for the next player."}
          </p>
        </section>

        <aside className="ludo-sidebar">
          <section className="ludo-panel ludo-turn">
            <div className="ludo-turn__head">
              <div>
                <p className="ludo-eyebrow">Current turn</p>
                <h2 style={{ color: current ? PLAYER_COLOR_HEX[current.color] : undefined }}>
                  {current ? PLAYER_LABEL[current.seat] : "—"}
                </h2>
              </div>
              <Die value={lastRoll?.value ?? null} />
            </div>
            <button type="button" className="ludo-button ludo-button--primary ludo-roll" onClick={handleRoll} disabled={!awaiting}>
              {awaiting ? "Roll dice" : game.phase === "move" ? "Choose a token" : "Waiting…"}
            </button>
            {game.phase === "move" && legalTokens.length === 0 && (
              <p className="ludo-note">No legal move — the turn passes automatically.</p>
            )}
          </section>

          {isOnline && (
            <section className="ludo-panel">
              <p className="ludo-eyebrow">Online table</p>
              <p className="ludo-note">
                {online.connection === "connected"
                  ? `Connected as ${online.accountName ?? "Guest"}.`
                  : `Connection: ${online.connection}.`}
              </p>
              {online.error && <p className="ludo-note ludo-error">{online.error}</p>}
              {!inOnlineMatch ? (
                <>
                  <div className="ludo-row">
                    {[2, 3, 4].map((count) => (
                      <button key={count} type="button" onClick={() => void online.quickMatch(count)}>
                        Quick {count}
                      </button>
                    ))}
                  </div>
                  <div className="ludo-row">
                    <button type="button" onClick={() => void online.createPrivate(seats)}>Private room</button>
                  </div>
                  <div className="ludo-row">
                    <input
                      className="ludo-input"
                      value={roomInput}
                      onChange={(event) => setRoomInput(event.target.value)}
                      placeholder="Room code"
                      aria-label="Room code"
                    />
                    <button type="button" onClick={() => void online.joinByCode(roomInput)}>Join</button>
                    <button type="button" onClick={() => void online.joinByCode(roomInput, true)}>Watch</button>
                  </div>
                  {online.searching && <p className="ludo-note">Looking for players…</p>}
                </>
              ) : (
                <>
                  {online.roomCode && <p className="ludo-note">Room code: <strong>{online.roomCode}</strong></p>}
                  {online.spectating && <p className="ludo-note">You are watching this table.</p>}
                  <div className="ludo-row">
                    <button type="button" onClick={() => void online.leave()}>Leave table</button>
                    <button type="button" onClick={online.resign}>Resign</button>
                  </div>
                  <div className="ludo-row">
                    <input
                      className="ludo-input"
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && chatInput.trim()) {
                          online.chat(chatInput.trim());
                          setChatInput("");
                        }
                      }}
                      placeholder="Say something"
                      aria-label="Table chat"
                    />
                    <button type="button" onClick={() => { if (chatInput.trim()) { online.chat(chatInput.trim()); setChatInput(""); } }}>
                      Send
                    </button>
                  </div>
                  <div className="ludo-chat">
                    {online.state?.chat.slice(-6).map((entry) => (
                      <p key={entry.id}><strong>{entry.username}</strong> {entry.text}</p>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          <section className="ludo-panel">
            <div className="ludo-panel__title">
              <p className="ludo-eyebrow">Race</p>
              <span>{game.playerCount} players</span>
            </div>
            <div className="ludo-players">
              {game.players.map((player) => (
                <div key={player.seat} className={`ludo-player ${player.seat === game.current ? "ludo-player--active" : ""}`}>
                  <span className="ludo-player__dot" style={{ background: PLAYER_COLOR_HEX[player.color] }} />
                  <div className="ludo-player__copy">
                    <strong>{PLAYER_LABEL[player.seat]}</strong>
                    <small>{isOnline ? player.color.toUpperCase() : player.ai ? "COMPUTER" : "PLAYER"}</small>
                  </div>
                  <div className="ludo-player__pieces">
                    {player.tokens.map((token) => (
                      <span
                        key={token.id}
                        className={token.progress >= FINISH_PROGRESS ? "is-home" : token.progress < 0 ? "is-yard" : ""}
                        style={{ borderColor: PLAYER_COLOR_HEX[player.color] }}
                        title={`Token ${token.id + 1}: ${token.location}`}
                      />
                    ))}
                  </div>
                  <b>{player.finished}/{TOKENS_PER_PLAYER}</b>
                </div>
              ))}
            </div>
            {isOnline && online.state && online.state.spectators.length > 0 && (
              <p className="ludo-note">Watching: {online.state.spectators.map((entry) => entry.username).join(", ")}</p>
            )}
          </section>

          {mode === "ai" && (
            <section className="ludo-panel">
              <p className="ludo-eyebrow">Computer level</p>
              <div className="ludo-difficulty">
                {DIFFICULTIES.map((level) => (
                  <button
                    key={level.id}
                    type="button"
                    className={difficulty === level.id ? "is-active" : ""}
                    onClick={() => { setDifficulty(level.id); controller.newGame({ difficulty: level.id }); }}
                  >
                    <strong>{level.label}</strong>
                    <small>{level.hint}</small>
                  </button>
                ))}
              </div>
            </section>
          )}

          {!isOnline && game.winner !== null && !controller.isReplaying && (
            <section className="ludo-panel ludo-winner">
              <p className="ludo-eyebrow">Race complete</p>
              <h2>{PLAYER_LABEL[game.winner]} wins</h2>
              <p>{game.players[game.winner]?.color} reached home first.</p>
              <div className="ludo-row">
                <button type="button" className="ludo-button" onClick={controller.startReplay}>Watch replay</button>
                <button type="button" className="ludo-button ludo-button--ghost" onClick={() => startNewGame()}>Play again</button>
              </div>
            </section>
          )}

          {!isOnline && (
            <section className="ludo-panel">
              <p className="ludo-eyebrow">Local record</p>
              <div className="ludo-stats">
                <div><strong>{progress.games}</strong><small>Games</small></div>
                <div><strong>{progress.wins}</strong><small>Wins</small></div>
                <div><strong>{progress.history.length}</strong><small>Saved</small></div>
              </div>
            </section>
          )}
        </aside>
      </main>

      {settingsOpen && (
        <div className="ludo-overlay" role="dialog" aria-label="Game settings">
          <div className="ludo-dialog">
            <h2>Table settings</h2>
            <p>Choose how many colours race. In local mode every seat is played on this device; in computer mode you take the first seat.</p>
            <div className="ludo-row">
              {[2, 3, 4].map((count) => (
                <button key={count} type="button" className={seats === count ? "is-active" : ""} onClick={() => startNewGame(count)}>
                  {count} players
                </button>
              ))}
            </div>
            <button type="button" className="ludo-button" onClick={() => setSettingsOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
