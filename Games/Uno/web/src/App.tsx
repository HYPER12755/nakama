import { useCallback, useEffect, useRef, useState } from "react";
import { configureAssets, GameBridge, readLauncherHandoff } from "@moongames/game-sdk";
import {
  AccountPanel,
  FullscreenChatButton,
  MatchChat,
  ModeSwitch,
  ProfilePanel,
  useGamePreferences,
} from "@moongames/game-ui";
import { Icon } from "./components/Icon";
import { UnoBoardStage } from "./components/UnoBoardStage";
import { UnoMatchActions } from "./components/UnoMatchActions";
import { UnoOnlinePanel } from "./components/UnoOnlinePanel";
import { UnoPreferences } from "./components/UnoPreferences";
import { useUnoGame } from "./hooks/useUnoGame";
import type { Color } from "@moongames/uno-core";

const MODES = [
  { id: "local", label: "Local", icon: <Icon name="users" size={15} /> },
  { id: "ai", label: "vs AI", icon: <Icon name="cpu" size={15} /> },
  { id: "online", label: "Online", icon: <Icon name="shield-check" size={15} /> },
];

const RULES = [
  "Match the top card by colour, number or symbol.",
  "Skip, Reverse and +2 change the turn; Wild changes the colour.",
  "Wild +4 may only be played with no matching colour in hand.",
  "The first player to empty their hand wins the round.",
];

const COLOURS: Color[] = ["red", "yellow", "green", "blue"];
const COLOUR_HEX: Record<Color, string> = {
  red: "#e8402a", yellow: "#f2c600", green: "#1fa45b", blue: "#2464d6",
};

export default function App({ bridge }: { bridge: GameBridge }) {
  const game = useUnoGame();
  const [mode, setMode] = useState<"local" | "ai" | "online">("ai");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [soundOn, setSoundOn] = useState(true);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [roomInput, setRoomInput] = useState("");
  const appRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const { preferences, setPreference } = useGamePreferences(__MOONGAMES_GAME_ID__);

  const cardSet = preferences.pieceSet === "neon" ? "neon" as const : "classic" as const;
  const highlight = (["lift", "outline", "glow"].includes(preferences.boardTheme)
    ? preferences.boardTheme
    : "lift") as "lift" | "outline" | "glow";
  const pileStyle = (["stack", "fan", "tower"].includes(preferences.soundSet)
    ? preferences.soundSet
    : "stack") as "stack" | "fan" | "tower";

  const version = __MOONGAMES_GAME_VERSION__;
  const onlineMode = mode === "online";
  const inMatch = game.view.started;
  const modeLabel = mode === "local" ? "Pass and play" : mode === "ai" ? "Computer table" : "Online table";
  const activePlayer = game.view.players[game.view.turn];

  useEffect(() => {
    configureAssets(bridge);
    readLauncherHandoff(__MOONGAMES_GAME_ID__);
  }, [bridge]);

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      game.newGame();
    }
  }, [game]);

  useEffect(() => {
    if (!["classic", "neon"].includes(preferences.pieceSet)) {
      setPreference("pieceSet", "classic");
    }
    if (!["lift", "outline", "glow"].includes(preferences.boardTheme)) {
      setPreference("boardTheme", "lift");
    }
    if (!["stack", "fan", "tower"].includes(preferences.soundSet)) {
      setPreference("soundSet", "stack");
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const update = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  useEffect(() => {
    if (game.error !== null) {
      setToast(game.error);
    }
  }, [game.error]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void appRef.current?.requestFullscreen();
    }
  }, []);

  const changeMode = useCallback((next: string) => {
    const selected = next as "local" | "ai" | "online";
    setMode(selected);
    game.setMode(selected === "online" ? "online" : "local");
  }, [game]);

  const newGame = useCallback(() => {
    game.newGame();
    setToast(null);
  }, [game]);

  const play = useCallback((cardId: string, chosenColor?: Color) => {
    game.play(cardId, chosenColor);
  }, [game]);

  return (
    <div className={`app${isFullscreen ? " app--board-only" : ""}`} ref={appRef}>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark"><Icon name="uno" size={27} strokeWidth={1.55} /></span>
          <div>
            <p className="brand-kicker">MoonGames</p>
            <h1>Uno</h1>
          </div>
          <span className="brand-version">v{version}</span>
        </div>
        <div className="header-actions">
          <ModeSwitch modes={MODES} mode={mode} onChange={changeMode} ariaLabel="Game mode" />
          <button type="button" className="icon-button" onClick={() => setRulesOpen(true)} aria-label="Open rules" title="Rules">
            <Icon name="book" size={18} />
          </button>
          <button type="button" className="icon-button" onClick={() => setSoundOn((value) => !value)} aria-pressed={soundOn} aria-label={soundOn ? "Mute sound" : "Enable sound"} title={soundOn ? "Mute sound" : "Enable sound"}>
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
              <button type="button" className="fullscreen-exit" onClick={toggleFullscreen} aria-label="Exit fullscreen" title="Exit fullscreen">
                <Icon name="minimize" size={18} />
              </button>
              <FullscreenChatButton />
            </>
          ) : null}

          <div className="turn-strip">
            <div className="turn-strip__copy">
              <span className="eyebrow">Current turn</span>
              <strong>{activePlayer?.username ?? "Waiting"}</strong>
            </div>
            {onlineMode ? (
              <span className={`turn-connection turn-connection--${game.connection}`}>{game.connection}</span>
            ) : null}
            <span className="turn-strip__meta">{modeLabel}</span>
          </div>

          <div className="board-frame">
            <div className="board-stage">
              <UnoBoardStage
                view={game.view}
                cardSet={cardSet}
                dealKey={game.dealKey}
                activeColor={game.view.currentColor}
                direction={game.view.direction}
                highlight={highlight}
                pileStyle={pileStyle}
                onPlay={play}
                onDraw={game.draw}
                onChallenge={game.challenge}
                onUno={() => setToast("UNO! One card left.")}
              />
              {inMatch && game.view.result !== null ? (
                <div className="winner-overlay" role="dialog" aria-label="Hand complete">
                  <div className="winner-card">
                    <span className="winner-card__icon"><Icon name="trophy" size={28} /></span>
                    <p className="eyebrow">Hand complete</p>
                    <h2>
                      {game.view.result.winnerUserId === game.myUserId
                        ? "You win"
                        : `${activePlayer?.username ?? "Opponent"} wins`}
                    </h2>
                    <div className="winner-card__actions">
                      <button type="button" className="button" onClick={() => void game.rematch()}>Play again</button>
                      <button type="button" className="button button--ghost" onClick={() => void game.leave()}>Leave table</button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="board-actions-wrap">
            <UnoMatchActions
              mode={mode}
              spectating={game.spectating}
              isMyTurn={game.view.players[game.view.turn]?.userId === game.myUserId}
              canDraw
              started={inMatch}
              onDraw={game.draw}
              onNewGame={newGame}
              onLeave={() => void game.leave()}
              onResign={game.resign}
            />
          </div>
        </section>

        <aside className="sidebar">
          {onlineMode && !inMatch ? (
            <AccountPanel
              account={game.account as never}
              authBusy={game.authBusy}
              authError={game.authError}
              authNotice={game.authNotice}
              signIn={game.signIn}
              signUp={game.signUp}
              signOut={game.signOut}
              clearAuthFeedback={game.clearAuthFeedback}
            />
          ) : null}

          {onlineMode ? (
            <UnoOnlinePanel
              controller={game}
              seats={game.seats}
              roomInput={roomInput}
              onRoomInput={setRoomInput}
              onRematch={() => void game.rematch()}
              onNotify={setToast}
            />
          ) : null}

          {onlineMode ? (
            <ProfilePanel
              connected={game.connection === "connected"}
              userId={game.myUserId}
              profile={game.profile as never}
              history={game.history as never}
              leaderboard={game.leaderboard as never}
              leaderboardTotal={game.leaderboardTotal}
              myLeaderboard={game.myLeaderboard as never}
              loading={game.profileLoading}
              error={game.profileError}
              onRefresh={() => void game.refreshProfile()}
              emptyProfileText="Your rating fills in after your first Uno hand."
              emptyHistoryText="Your finished Uno hands will appear here."
              emptyLeaderboardText="Play a quick match to enter the rating leaderboard."
              statLabels={{ cards_played: "Cards played", best_streak: "Best streak" }}
            />
          ) : null}

          <section className="panel table-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Scoreboard</p><h2>Table</h2></div>
              <span className="panel-heading__meta">{game.view.players.length} players</span>
            </div>
            <div className="race-list">
              {game.view.players.map((player) => (
                <div key={player.userId} className={`race-row${player.seat === game.view.turn ? " race-row--active" : ""}`}>
                  <span className="race-disc" style={{ background: COLOUR_HEX[COLOURS[player.seat] ?? "red"] }} />
                  <div className="race-name">
                    {player.username}
                    <span className="race-sub">{onlineMode ? "ONLINE" : player.seat === 0 ? "YOU" : "COMPUTER"}</span>
                  </div>
                  <b className="race-count">{player.count}</b>
                </div>
              ))}
            </div>
          </section>

          <section className="panel table-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Table</p><h2>Game controls</h2></div>
            </div>
            <p className="ludo-note">Players</p>
            <div className="pref-choices" role="radiogroup" aria-label="Players">
              {[2, 3, 4].map((count) => (
                <button
                  type="button"
                  key={count}
                  role="radio"
                  aria-checked={game.seats === count}
                  className={`pref-choice${game.seats === count ? " is-chosen" : ""}`}
                  onClick={() => game.setSeats(count)}
                >
                  {count} players
                </button>
              ))}
            </div>
          </section>

          <UnoPreferences gameId={__MOONGAMES_GAME_ID__} />

          <section className="panel tips-panel">
            <div className="panel-heading"><div><p className="eyebrow">Uno</p><h2>How to play</h2></div></div>
            <ul className="tip-list">{RULES.map((rule) => <li key={rule}><span className="tip-mark" />{rule}</li>)}</ul>
          </section>
          <p className="sidebar-note">Every card is drawn as its own SVG and shared across web and native hosts.</p>
        </aside>
      </main>

      {toast !== null && <div className="toast" role="status">{toast}</div>}

      {onlineMode ? (
        <div className="chat-dock">
          <MatchChat
            matchId={game.matchId}
            messages={game.view.chat}
            selfUserId={game.myUserId}
            onSend={game.chat}
          />
        </div>
      ) : null}

      {rulesOpen ? (
        <div className="dialog-backdrop" role="presentation" onClick={() => setRulesOpen(false)}>
          <div className="dialog" role="dialog" aria-label="Rules" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading"><div><p className="eyebrow">Uno</p><h2>How to play</h2></div></div>
            <ul className="tip-list">{RULES.map((rule) => <li key={rule}><span className="tip-mark" />{rule}</li>)}</ul>
            <button type="button" className="button button--primary" onClick={() => setRulesOpen(false)}>Close</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
