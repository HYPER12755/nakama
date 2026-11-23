import { useCallback, useEffect, useRef, useState } from "react";
import { configureAssets, GameBridge, readLauncherHandoff } from "@moongames/game-sdk";
import {
  AccountPanel,
  FullscreenChatButton,
  MatchChat,
  ModeSwitch,
  ProfilePanel,
  clearMatchInviteFromLocation,
  parseLaunchInvite,
  parseMatchInvite,
  useGamePreferences,
  useLauncherHandoff,
  type MatchInvite,
} from "@moongames/game-ui";
import { Icon } from "./components/Icon";
import { UnoBoardStage } from "./components/UnoBoardStage";
import { UnoMatchActions } from "./components/UnoMatchActions";
import { UnoOnlinePanel } from "./components/UnoOnlinePanel";
import { UnoPreferences } from "./components/UnoPreferences";
import { useUnoGame } from "./hooks/useUnoGame";
import { JUMP_IN_MODE, rulesModeLabel, RULES_MODES } from "./lib/view";
import { UNO_MODE, type Color } from "@moongames/uno-core";

const MODES = [
  { id: "local", label: "Local", icon: <Icon name="users" size={15} /> },
  { id: "ai", label: "vs AI", icon: <Icon name="cpu" size={15} /> },
  { id: "online", label: "Online", icon: <Icon name="shield-check" size={15} /> },
];

const RULES = [
  "Match the top card by colour, number or symbol.",
  "Skip, Reverse and +2 change the turn; Wild changes the colour.",
  "Wild +4 may be played even with a matching colour; the next player takes 4 or challenges (challenger takes 6 if legal, player takes 4 if bluffing).",
  "The first player to empty their hand wins the round.",
];

const SEVEN_O_RULE = "Seven-O: playing a 7 swaps hands with a player you choose; playing a 0 rotates every hand.";

const PROGRESSIVE_RULE = "Progressive: +2 stacks on +2 and Wild +4 stacks on Wild +4; take the accumulated cards or stack a matching card.";

const JUMP_IN_RULE = "Jump-In: after a number card is played, anyone holding the exact same colour and number has a short window to jump in and take the turn.";

const ATTACK_RULE = "Attack: Hit cards make the target take the launcher, or deflect with a Hit or Wild Attack card. Wild Attack picks a target and a colour; Discard All drops every card of that colour.";

const NO_MERCY_RULE = "No Mercy: draw until you can play, stack +2/+4/+6/+10 with equal or higher cards, and drop out at 25 cards. Coloured +4, Skip Everyone, Discard All, Wild Reverse +4 and Wild Colour Roulette apply.";

const SWAP_PACK_RULE = "Swap Pack: Swap 1 trades one card with a player you choose; Refresh Hand draws a new hand; Wild Force Trade swaps two players; Wild Pass Hands rotates every hand.";

const REVERSE_PACK_RULE = "Reverse Pack: Reverse Draw 2 reverses and makes the next player draw 2; Reverse Skip reverses and skips the next player; Wild Power Reverse reverses and lets you play again; Wild NO U bounces a draw penalty back, reverses and chooses a colour.";

const STACK_PACK_RULE = "Stack Pack: Stack 1 and Stack 2 make the next player draw and add to any draw penalty; Wild Stack 3 adds 3 to any penalty; Wild Stack Number reveals a number card to set its penalty. Stack cards can chain onto other stack cards.";

const SPEED_PACK_RULE = "Speed Pack: every Speed Up card raises the pace; Wild Double Speed raises it by two. Each turn you must play that many matching cards in a row, and action effects only apply on the last card. If you cannot keep up, play what you can, draw the current speed and the pace resets to one.";

const ALL_WILD_RULE = "All Wild: every card is wild, so no colour or number matching is needed. Wild Reverse, Wild Skip, Wild Skip Two, Wild Draw Two and Wild Draw Four change the turn; Wild Targeted Draw Two makes a chosen player draw; Wild Forced Swap exchanges your hand with a chosen player.";

const DARE_RULE = "Dare: match colour, number or symbol. A Dare card gives the next player a choice: draw 2, or perform the dare and take the risk. Wild Dare lets you choose the continuing colour and gives the same choice.";

const SHOWDOWN_RULE = "Showdown: cards marked with the Showdown icon trigger an authoritative head-to-head; the loser draws the icon's value. Wild Showdown lets you choose the opponent, a 1-3 card penalty and the continuing colour.";

const POWER_GRAB_RULE = "Power Grab: power icons claim U, N, O and ! towers that block Draw One, Draw Two, Wild Draw Four and Skip. Grab Two Towers and Wild Grab Tower steal towers; collecting all four gives Instant UNO.";

const MOD_RULE = "Mod: the four MOD cards are Wild. Choose a colour from your hand and give one card of that colour to each opponent in turn order until they run out, then choose the colour that continues play.";
const FLIP_RULE = "Flip: match the active colour on the current side. Draw One, Skip and Reverse sit on the light side; Draw Five, Skip Everyone and Wild Draw Color sit on the dark side. Play a Flip card to turn the whole game over and switch between red/yellow/green/blue and pink/teal/orange/purple. Wild Draw Two may be challenged: take 2, or challenge a guilty player who draws 2 and an innocent target who draws 4.";

const COLOURS: Color[] = ["red", "yellow", "green", "blue"];
const COLOUR_HEX: Record<Color, string> = {
  red: "#e8402a", yellow: "#f2c600", green: "#1fa45b", blue: "#2464d6",
  pink: "#ef4f9b", teal: "#16a8a2", orange: "#ee8a24", purple: "#8d5bd6",
};

export default function App({ bridge }: { bridge: GameBridge }) {
  const [mode, setMode] = useState<"local" | "ai" | "online">("ai");
  const [invite, setInvite] = useState<MatchInvite | null>(() =>
    typeof window === "undefined" ? null : parseMatchInvite(window.location.search),
  );
  const onlineMode = mode === "online";
  const launcherConfig = useLauncherHandoff(__MOONGAMES_GAME_ID__);
  const game = useUnoGame(onlineMode);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [soundOn, setSoundOn] = useState(true);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [roomInput, setRoomInput] = useState("");
  const appRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const hostLaunchHandledRef = useRef(false);
  const inviteHandledRef = useRef(false);
  const inviteConnectRef = useRef(false);
  const { preferences, setPreference } = useGamePreferences(__MOONGAMES_GAME_ID__);

  const cardSet = preferences.pieceSet === "neon" ? "neon" as const : "classic" as const;
  const highlight = (["lift", "outline", "glow"].includes(preferences.boardTheme)
    ? preferences.boardTheme
    : "lift") as "lift" | "outline" | "glow";
  const pileStyle = (["stack", "fan", "tower"].includes(preferences.soundSet)
    ? preferences.soundSet
    : "stack") as "stack" | "fan" | "tower";

  const version = __MOONGAMES_GAME_VERSION__;
  const inMatch = game.view.started;
  const modeLabel = mode === "local" ? "Pass and play" : mode === "ai" ? "Computer table" : "Online table";
  const rulesLocked = onlineMode && inMatch;
  const rulesText = game.rulesMode === "sevenO"
    ? [...RULES, SEVEN_O_RULE]
    : (game.rulesMode as string) === "progressive"
      ? [...RULES, PROGRESSIVE_RULE]
      : game.rulesMode === JUMP_IN_MODE
        ? [...RULES, JUMP_IN_RULE]
        : game.rulesMode === UNO_MODE.ATTACK
          ? [...RULES, ATTACK_RULE]
          : game.rulesMode === UNO_MODE.NO_MERCY
            ? [...RULES, NO_MERCY_RULE]
            : game.rulesMode === UNO_MODE.FLIP
              ? [...RULES, FLIP_RULE]
              : (game.rulesMode as string) === "swapPack"
                ? [...RULES, SWAP_PACK_RULE]
                : (game.rulesMode as string) === "reversePack"
                  ? [...RULES, REVERSE_PACK_RULE]
                : (game.rulesMode as string) === "stackPack"
                  ? [...RULES, STACK_PACK_RULE]
                : (game.rulesMode as string) === "speedPack"
                  ? [...RULES, SPEED_PACK_RULE]
                : (game.rulesMode as string) === "allWild"
                  ? [...RULES, ALL_WILD_RULE]
                  : (game.rulesMode as string) === "dare"
                    ? [...RULES, DARE_RULE]
                    : (game.rulesMode as string) === "showdown"
                      ? [...RULES, SHOWDOWN_RULE]
                      : (game.rulesMode as string) === "powerGrab"
                        ? [...RULES, POWER_GRAB_RULE]
                        : (game.rulesMode as string) === "mod"
                          ? [...RULES, MOD_RULE]
                          : RULES;
  const activePlayer = game.view.players[game.view.turn];
  const winner = game.view.result?.winnerUserId == null
    ? null
    : game.view.players.find((player) => player.userId === game.view.result?.winnerUserId) ?? null;

  useEffect(() => {
    configureAssets(bridge);
    readLauncherHandoff(__MOONGAMES_GAME_ID__);
  }, [bridge]);

  useEffect(() => {
    const launch = launcherConfig?.launch;
    if (launch === undefined || hostLaunchHandledRef.current) {
      return;
    }
    hostLaunchHandledRef.current = true;
    const launchInvite = parseLaunchInvite(launch);
    if (launchInvite !== null) {
      setInvite(launchInvite);
      setMode("online");
    }
  }, [launcherConfig?.launch]);

  useEffect(() => {
    if (invite === null || inviteHandledRef.current || mode !== "online") {
      return;
    }
    const { connection, connect, joinMatch } = game;
    if (connection !== "connected") {
      if (connection === "offline" && !inviteConnectRef.current) {
        inviteConnectRef.current = true;
        void connect();
      }
      return;
    }
    inviteHandledRef.current = true;
    clearMatchInviteFromLocation();
    void joinMatch(invite.matchId, undefined, invite.spectate).then(() => {
      setToast(invite.spectate ? "Watching invited match" : "Joined invited match");
    }).catch((cause: unknown) => {
      setToast(cause instanceof Error ? cause.message : "Could not join that match.");
    });
  }, [game, invite, mode]);

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

  const play = useCallback((cardId: string, chosenColor?: Color, targetId?: string) => {
    game.play(cardId, chosenColor, targetId);
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
            {game.rulesMode === UNO_MODE.FLIP ? (
              <span className={`turn-side turn-side--${game.view.flipSide}`}>
                {game.view.flipSide === "dark" ? "Dark side" : "Light side"}
              </span>
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
                rulesMode={game.rulesMode}
                onPlay={play}
                onChooseColour={game.chooseColour}
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
                        : `${winner?.username ?? "Opponent"} wins`}
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
                <div key={player.userId} className={`race-row${player.seat === game.view.turn ? " race-row--active" : ""}${player.out === true ? " race-row--out" : ""}`}>
                  <span className="race-disc" style={{ background: COLOUR_HEX[COLOURS[player.seat] ?? "red"] }} />
                  <div className="race-name">
                    {player.username}
                    <span className="race-sub">{onlineMode ? "ONLINE" : player.seat === 0 ? "YOU" : "COMPUTER"}</span>
                  </div>
                  <b className="race-count">{player.out === true ? "OUT" : player.count}</b>
                </div>
              ))}
            </div>
          </section>

          <section className="panel table-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Table</p><h2>Game controls</h2></div>
            </div>
            <p className="ludo-note">Rules mode</p>
            <div className="pref-choices" role="radiogroup" aria-label="Rules mode">
              {RULES_MODES.map((modeOption) => (
                <button
                  type="button"
                  key={modeOption}
                  role="radio"
                  aria-checked={game.rulesMode === modeOption}
                  className={`pref-choice${game.rulesMode === modeOption ? " is-chosen" : ""}`}
                  disabled={rulesLocked}
                  title={rulesLocked ? "Leave the online table before changing rules" : rulesModeLabel(modeOption)}
                  onClick={() => game.setRulesMode(modeOption)}
                >
                  {rulesModeLabel(modeOption)}
                </button>
              ))}
            </div>
            {rulesLocked ? <p className="ludo-note">Leave the table to change the rules mode.</p> : null}
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
            <ul className="tip-list">{rulesText.map((rule) => <li key={rule}><span className="tip-mark" />{rule}</li>)}</ul>
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
            <ul className="tip-list">{rulesText.map((rule) => <li key={rule}><span className="tip-mark" />{rule}</li>)}</ul>
            <button type="button" className="button button--primary" onClick={() => setRulesOpen(false)}>Close</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
