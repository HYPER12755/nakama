import { useEffect, useRef, useState, type MouseEvent } from "react";
import { UNO_MODE, colorsForSide, drawCardValue, type Card, type Color } from "@moongames/uno-core";
import { normalizeFlipSide, type BoardView, type RulesMode } from "../lib/view";

const COLOUR_HEX: Record<Color, string> = {
  red: "#ff5252", yellow: "#ffd740", green: "#69f0ae", blue: "#448aff",
  pink: "#ff5fa8", teal: "#26c6c0", orange: "#f59b35", purple: "#a06bff",
};

interface Flight {
  key: number;
  cardId: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
}

interface AttackPrompt {
  cardId: string;
  deflect: boolean;
  targetId: string | null;
}

interface PlayExtras {
  giveCardId?: string;
  tradeWithId?: string;
  showdownAmount?: number;
  towerId?: string;
  modColor?: Color;
}

interface SwapPrompt {
  cardId: string;
  targetId: string | null;
}

interface TradePrompt {
  cardId: string;
  firstId: string | null;
}

interface PendingTrade {
  cardId: string;
  targetId: string;
  tradeWithId: string;
}

const COLOUR_STACK_KINDS = new Set<Card["kind"]>([
  "wild4", "wildDraw6", "wildDraw10", "wildReverse4", "wildNoU", "wildStack3", "wildStackNumber",
]);

function isWild(card: Card): boolean {
  return card.kind.startsWith("wild");
}

function cardHint(card: Card): string | undefined {
  if (card.kind === "flip") return "Flips every card to the other side";
  if (card.kind === "draw1") return "The next player draws 1";
  if (card.kind === "draw5") return "The next player draws 5";
  if (card.kind === "skipEveryone") return "Skips every other player";
  if (card.kind === "wildDraw2") return "The next player takes 2 or challenges";
  if (card.kind === "wildDrawColor") return "The next player draws until the chosen colour";
  if (card.kind === "swap1") return "Swap one card with another player";
  if (card.kind === "refreshHand") return "Replace your whole hand";
  if (card.kind === "wildForceTrade") return "Force two players to swap hands";
  if (card.kind === "wildPassHands") return "Every player passes their hand";
  if (card.kind === "reverseDraw2") return "Reverse and make the next player draw 2";
  if (card.kind === "reverseSkip") return "Reverse and skip the next player";
  if (card.kind === "wildPowerReverse") return "Reverse, choose a colour and play again";
  if (card.kind === "wildNoU") return "Bounce a draw penalty back and reverse play";
  if (card.kind === "stack1") return "Make the next player draw 1 and lose a turn";
  if (card.kind === "stack2") return "Make the next player draw 2 and lose a turn";
  if (card.kind === "wildStack3") return "Choose a colour and make the next player draw 3";
  if (card.kind === "wildStackNumber") return "Choose a colour; a revealed number sets the draw";
  if (card.kind === "speedUp") return "Raise the speed by one";
  if (card.kind === "wildDoubleSpeed") return "Raise the speed by two and choose a colour";
  if (card.kind === "awWild") return "Play any card";
  if (card.kind === "awReverse") return "Reverse the direction";
  if (card.kind === "awSkip") return "Skip the next player";
  if (card.kind === "awSkipTwo") return "Skip the next two players";
  if (card.kind === "awDrawTwo") return "The next player draws 2";
  if (card.kind === "awDrawFour") return "The next player draws 4";
  if (card.kind === "awTargetDrawTwo") return "Choose a player to draw 2";
  if (card.kind === "awForcedSwap") return "Swap hands with a player";
  if (card.kind === "dare") return "Choose: draw 2 or do the dare";
  if (card.kind === "wildDare") return "Choose a colour and present a dare";
  if (card.kind === "showdownNumber") return "Trigger a head-to-head showdown";
  if (card.kind === "wildShowdown") return "Choose a target, penalty and colour";
  if (card.kind === "grab2Towers") return "Grab two Power Towers";
  if (card.kind === "wildGrabTower") return "Choose a Power Tower";
  if (card.kind === "modCard") return "Give a colour away and choose the next colour";
  if (card.power !== undefined) return `Claim the ${card.power} Power Tower`;
  return undefined;
}

interface ChallengeInfo {
  eyebrow: string;
  copy: string;
  takeLabel: string;
}

function challengeInfo(challenge: NonNullable<BoardView["pendingChallenge"]>): ChallengeInfo {
  if (challenge.kind === "dare" || challenge.kind === "wildDare") {
    const amount = challenge.amount ?? 2;
    return {
      eyebrow: challenge.kind === "wildDare" ? "Wild Dare" : "Dare",
      copy: `Take ${amount} cards, or accept the dare and try to complete it before your next turn.`,
      takeLabel: `Take ${amount}`,
    };
  }
  if (challenge.kind === "wildDraw2") {
    const amount = challenge.amount ?? 2;
    return {
      eyebrow: "Wild Draw Two",
      copy: `Take ${amount} cards, or accuse the player of holding a matching colour; if guilty they draw ${amount}, if innocent you draw ${amount * 2}.`,
      takeLabel: `Take ${amount}`,
    };
  }
  if (challenge.kind === "wildDrawColor") {
    const color = challenge.color ?? "chosen";
    return {
      eyebrow: "Wild Draw Color",
      copy: `Take until a card of the chosen colour (${color}) appears, or challenge. If guilty the player draws until that colour; if innocent you draw until it appears.`,
      takeLabel: `Take until ${color}`,
    };
  }
  const amount = challenge.amount ?? 4;
  if (amount === 4 && (challenge.kind === undefined || challenge.kind === "wild4")) {
    return {
      eyebrow: "Wild Draw Four",
      copy: "Take four cards, or accuse the player of holding a matching colour.",
      takeLabel: "Take 4",
    };
  }
  return {
    eyebrow: challenge.kind === "wild4" ? "Wild Draw Four" : "Wild Draw",
    copy: `Take ${amount} cards, or accuse the player of holding a matching colour. If guilty they draw ${amount}; if innocent you draw ${amount + 2}.`,
    takeLabel: `Take ${amount}`,
  };
}

export function isSevenCard(card: Card): boolean {
  return card.kind === "number" && card.value === 7;
}

function stackKindLabel(kind: string): string {
  if (kind === "wild4") return "Wild Four";
  if (kind === "draw4") return "Draw Four";
  if (kind === "wildDraw6") return "Wild Six";
  if (kind === "wildDraw10") return "Wild Ten";
  if (kind === "wildReverse4") return "Wild Reverse Four";
  if (kind === "stack1") return "Stack One";
  if (kind === "stack2") return "Stack Two";
  if (kind === "wildStack3") return "Wild Stack Three";
  if (kind === "wildStackNumber") return "Wild Stack Number";
  return "Draw Two";
}

export function targetCandidates(view: BoardView): BoardView["players"] {
  return view.players.filter((player) => player.userId !== view.myUserId && player.out !== true);
}

export function tradeCandidates(view: BoardView): BoardView["players"] {
  return view.players.filter((player) => player.out !== true);
}

export function giveCandidates(view: BoardView, playedCardId: string): Card[] {
  const mine = view.players.find((player) => player.userId === view.myUserId);
  return (mine?.hand ?? []).filter((card) => card.id !== playedCardId);
}

export interface UnoBoardStageProps {
  view: BoardView;
  cardSet: "classic" | "neon";
  dealKey: number;
  activeColor: Color | null;
  direction: 1 | -1;
  highlight: "lift" | "outline" | "glow";
  pileStyle: "stack" | "fan" | "tower";
  rulesMode?: RulesMode;
  onPlay: (cardId: string, chosenColor?: Color, targetId?: string, extras?: PlayExtras) => void;
  onChooseColour?: (color: Color) => void;
  onChooseColor?: (color: Color) => void;
  onDraw: () => void;
  onChallenge: (accept: boolean) => void;
  onUno: () => void;
}

export function UnoBoardStage({
  view, cardSet, dealKey, activeColor, direction, highlight, pileStyle,
  rulesMode = "classic", onPlay, onChooseColour, onChooseColor, onDraw, onChallenge, onUno,
}: UnoBoardStageProps) {
  const [pendingCard, setPendingCard] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const [showdownAmount, setShowdownAmount] = useState(1);
  const [towerPrompt, setTowerPrompt] = useState<string | null>(null);
  const [showdownTarget, setShowdownTarget] = useState<string | null>(null);
  const [grabTowerId, setGrabTowerId] = useState<string | null>(null);
  const [modGiveColor, setModGiveColor] = useState<Color | null>(null);
  const [attackPrompt, setAttackPrompt] = useState<AttackPrompt | null>(null);
  const [swapPrompt, setSwapPrompt] = useState<SwapPrompt | null>(null);
  const [tradePrompt, setTradePrompt] = useState<TradePrompt | null>(null);
  const [pendingTrade, setPendingTrade] = useState<PendingTrade | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [dealt, setDealt] = useState(false);
  const [jumpNow, setJumpNow] = useState(() => Date.now());
  const surfaceRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<HTMLButtonElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const flightKey = useRef(0);
  const previousCounts = useRef<Record<string, number> | null>(null);
  const lastManualFlight = useRef(0);

  const art = (cardId: string): string => {
    const assetId = cardId.startsWith("aw") ? `${cardId.replace(/-\d+$/, "")}-0`
      : cardId.startsWith("wildshowdown-") ? "wildshowdown-0"
        : cardId.startsWith("wildgrabtower-") ? "wildgrabtower-0"
        : cardId.startsWith("modcard-") ? "modcard-0"
          : cardId.includes("-showdown-") ? `${cardId.slice(0, cardId.indexOf("-showdown-"))}-showdown-0`
          : cardId.startsWith("minimalist-") ? cardId.replace(/-\d+$/, "-0")
            : cardId;
    return cardSet === "neon" ? `cards-neon/${assetId}.svg` : `cards/${assetId}.svg`;
  };

  const cardArt = (card: Card): string => {
    if (card.power !== undefined && card.color !== null) {
      return art(`${card.color}-power-${card.power}-0`);
    }
    if (card.kind === "draw1" && card.color !== null && !card.id.startsWith("light-")
      && !card.id.startsWith("dark-")) return art(`${card.color}-draw1-0`);
    if (card.kind === "grab2Towers" && card.color !== null) return art(`${card.color}-grab2towers-0`);
    return art(card.id);
  };

  const me = view.players.find((player) => player.userId === view.myUserId);
  const hand = me?.hand ?? [];
  const pendingCardKind = pendingCard === null ? null : hand.find((card) => card.id === pendingCard)?.kind ?? null;
  const pendingTargetKind = pendingTarget === null ? null : hand.find((card) => card.id === pendingTarget)?.kind ?? null;
  const localPromptActive = pendingCard !== null || pendingTarget !== null || attackPrompt !== null
    || swapPrompt !== null || tradePrompt !== null || towerPrompt !== null;
  const pendingStack = view.pendingStack ?? null;
  const pendingHit = view.pendingHit ?? null;
  const pendingRoulette = view.pendingRoulette ?? null;
  const effectiveMode = view.rulesMode ?? view.mode ?? rulesMode;
  const noMercy = effectiveMode === UNO_MODE.NO_MERCY;
  const flipSide = normalizeFlipSide(view.flipSide);
  const sideColors = colorsForSide(flipSide);
  const jumpWindow = view.jumpWindow ?? null;
  const jumpOpen = jumpWindow !== null;
  const jumping = jumpWindow !== null && jumpWindow.ownerId !== view.myUserId;
  const jumpSeconds = jumpWindow === null
    ? 0
    : Math.max(0, Math.ceil((jumpWindow.expiresAt - jumpNow) / 1000));
  const stackTarget = pendingStack !== null && pendingStack.targetId === view.myUserId;
  const hitTarget = pendingHit !== null && pendingHit.targetId === view.myUserId;
  const hitCards = hitTarget
    ? hand.filter((card) => card.kind === "hit1" || card.kind === "hit2" || card.kind === "wildAttack")
    : [];
  const isMyTurn =
    view.started && view.pendingChallenge === null && pendingStack === null &&
    view.players[view.turn]?.userId === view.myUserId;
  const challengeTarget =
    view.pendingChallenge !== null && view.pendingChallenge.targetId === view.myUserId;
  const reversePack = effectiveMode === UNO_MODE.REVERSE_PACK;
  const stackPack = effectiveMode === UNO_MODE.STACK_PACK;
  const noUCards = reversePack
    ? hand.filter((card) => card.kind === "wildNoU")
    : [];
  const info = view.pendingChallenge === null ? null : challengeInfo(view.pendingChallenge);
  const legal = new Set(view.legalCards);
  const legalNoUCards = noUCards.filter((card) => legal.has(card.id));
  const stackCards = !stackTarget || pendingStack === null
    ? []
    : reversePack
      ? legalNoUCards
      : stackPack
        ? hand.filter((card) => legal.has(card.id))
      : hand.filter((card) => noMercy
        ? drawCardValue(card.kind) > 0 && drawCardValue(card.kind) >= (pendingStack.value ?? 0)
        : pendingStack.kind === "wild4" ? card.kind === "wild4" : card.kind === "draw2");

  const opponents = view.players.filter((player) => player.userId !== view.myUserId);
  const targets = targetCandidates(view);
  const sevenTargetMode = effectiveMode === "sevenO" || noMercy;
  const rouletteChooser = pendingRoulette !== null && pendingRoulette.chooserId === view.myUserId;
  const rouletteChooserName = view.players.find(
    (player) => player.userId === pendingRoulette?.chooserId,
  )?.username ?? "The next player";
  const seatZone = (seat: number): "top" | "left" | "right" => {
    const count = view.players.length;
    const mySeat = me?.seat ?? 0;
    const offset = (seat - mySeat + count) % count;
    if (count === 2) return "top";
    if (offset === 1) return "left";
    if (offset === 2) return "top";
    return "right";
  };

  const fly = (cardId: string, from: DOMRect | null, to: DOMRect | null) => {
    const surface = surfaceRef.current?.getBoundingClientRect();
    if (from === null || to === null || surface === undefined) return;
    const key = flightKey.current + 1;
    flightKey.current = key;
    setFlights((current) => [...current, {
      key,
      cardId,
      x: from.left - surface.left,
      y: from.top - surface.top,
      dx: to.left - from.left,
      dy: to.top - from.top,
    }]);
    window.setTimeout(() => {
      setFlights((current) => current.filter((flight) => flight.key !== key));
    }, 620);
  };

  useEffect(() => {
    setDealt(false);
    setPendingCard(null);
    setPendingTarget(null);
    setAttackPrompt(null);
    setSwapPrompt(null);
    setTradePrompt(null);
    setPendingTrade(null);
    setTowerPrompt(null);
    setShowdownTarget(null);
    setShowdownAmount(1);
    setGrabTowerId(null);
    setModGiveColor(null);
    const timer = window.setTimeout(() => setDealt(true), 1300);
    return () => window.clearTimeout(timer);
  }, [dealKey]);

  useEffect(() => {
    if (!jumpOpen) {
      return;
    }
    setJumpNow(Date.now());
    const timer = window.setInterval(() => setJumpNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [jumpOpen, jumpWindow?.cardId, jumpWindow?.expiresAt, jumpWindow?.ownerId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelLocalPrompt();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const counts: Record<string, number> = {};
    for (const player of view.players) counts[player.userId] = player.count;
    const previous = previousCounts.current;
    previousCounts.current = counts;
    if (previous === null || Date.now() - lastManualFlight.current < 260) return;
    const source = discardRef.current?.getBoundingClientRect() ?? null;
    for (const player of view.players) {
      const before = previous[player.userId];
      if (before === undefined || player.count <= before) continue;
      const target = player.userId === view.myUserId
        ? handRef.current?.getBoundingClientRect() ?? null
        : surfaceRef.current?.querySelector(`[data-seat-user="${player.userId}"]`)?.getBoundingClientRect() ?? null;
      fly("card-back", source, target);
    }
  }, [view.players, view.myUserId]);

  const play = (card: Card, event: MouseEvent<HTMLButtonElement>) => {
    if (!isMyTurn && !jumping) return;
    if (card.kind === "modCard") {
      setModGiveColor(null);
      setPendingCard(card.id);
      return;
    }
    if (card.kind === "grab2Towers" || card.kind === "wildGrabTower") {
      setGrabTowerId(null);
      setTowerPrompt(card.id);
      return;
    }
    if (card.kind === "awTargetDrawTwo" || card.kind === "awForcedSwap" || card.kind === "wildShowdown") {
      setShowdownTarget(null);
      setPendingTarget(card.id);
      setShowdownAmount(1);
      return;
    }
    if (card.kind === "swap1") {
      setSwapPrompt({ cardId: card.id, targetId: null });
      return;
    }
    if (card.kind === "wildForceTrade") {
      setTradePrompt({ cardId: card.id, firstId: null });
      return;
    }
    if (card.kind === "wildAttack") {
      setAttackPrompt({ cardId: card.id, deflect: false, targetId: null });
      return;
    }
    if (card.kind === "wildRoulette") {
      fly(card.id, event.currentTarget.getBoundingClientRect(), discardRef.current?.getBoundingClientRect() ?? null);
      lastManualFlight.current = Date.now();
      onPlay(card.id);
      return;
    }
    if (isWild(card)) {
      setPendingCard(card.id);
      return;
    }
    if (sevenTargetMode && isSevenCard(card)) {
      setPendingTarget(card.id);
      return;
    }
    fly(card.id, event.currentTarget.getBoundingClientRect(), discardRef.current?.getBoundingClientRect() ?? null);
    lastManualFlight.current = Date.now();
    onPlay(card.id);
  };

  const draw = () => {
    if (!isMyTurn) return;
    fly("card-back", drawRef.current?.getBoundingClientRect() ?? null, handRef.current?.getBoundingClientRect() ?? null);
    lastManualFlight.current = Date.now();
    onDraw();
  };

  const resolveChallenge = (accept: boolean) => {
    fly("card-back", discardRef.current?.getBoundingClientRect() ?? null, handRef.current?.getBoundingClientRect() ?? null);
    lastManualFlight.current = Date.now();
    onChallenge(accept);
  };

  const takeStack = () => {
    fly("card-back", discardRef.current?.getBoundingClientRect() ?? null, handRef.current?.getBoundingClientRect() ?? null);
    lastManualFlight.current = Date.now();
    onDraw();
  };

  const takeHit = () => {
    fly("card-back", discardRef.current?.getBoundingClientRect() ?? null, handRef.current?.getBoundingClientRect() ?? null);
    lastManualFlight.current = Date.now();
    onDraw();
  };

  const cancelLocalPrompt = () => {
    setPendingCard(null);
    setPendingTarget(null);
    setAttackPrompt(null);
    setSwapPrompt(null);
    setTradePrompt(null);
    setPendingTrade(null);
    setTowerPrompt(null);
    setShowdownTarget(null);
    setShowdownAmount(1);
    setGrabTowerId(null);
    setModGiveColor(null);
  };

  const deflectHit = (card: Card, event: MouseEvent<HTMLButtonElement>) => {
    if (card.kind === "wildAttack") {
      setAttackPrompt({ cardId: card.id, deflect: true, targetId: null });
      return;
    }
    fly(card.id, event.currentTarget.getBoundingClientRect(), discardRef.current?.getBoundingClientRect() ?? null);
    lastManualFlight.current = Date.now();
    onPlay(card.id);
  };

  const stackDraw = (card: Card) => {
    if (COLOUR_STACK_KINDS.has(card.kind)) {
      setPendingCard(card.id);
      return;
    }
    fly(
      card.id,
      handRef.current?.querySelector("img")?.getBoundingClientRect() ?? null,
      discardRef.current?.getBoundingClientRect() ?? null,
    );
    lastManualFlight.current = Date.now();
    onPlay(card.id);
  };

  return (
    <div
      className={`uno-table-surface uno-highlight--${highlight} uno-pile--${pileStyle}${flipSide === "dark" ? " uno-table-surface--dark-side" : ""}${dealt ? " uno--dealt" : ""}`}
      ref={surfaceRef}
      style={{ ["--uno-active" as string]: activeColor === null ? "transparent" : COLOUR_HEX[activeColor] }}
    >
      <div className={`uno-side-badge uno-side-badge--${flipSide}`} aria-label={`${flipSide === "dark" ? "Dark" : "Light"} side`}>
        <span className="uno-side-badge__dot" aria-hidden="true" />
        {flipSide === "dark" ? "Dark side" : "Light side"}
      </div>
      <div className="uno-direction" key={direction} aria-hidden="true">{direction === 1 ? "↻" : "↺"}</div>

      {jumpOpen ? (
        <div className="uno-jump-banner" role="status" aria-live="polite">
          <span className="uno-jump-banner__label">Jump window</span>
          <span className="uno-jump-banner__count">{jumpSeconds}s</span>
          <span className="uno-jump-banner__hint">Exact match only — same colour and number.</span>
        </div>
      ) : null}

      <div className="uno-board-grid">
        <div className="uno-zone uno-zone--top">
          {opponents.filter((player) => seatZone(player.seat) === "top").map((player) => (
            <OpponentHand
              key={`${player.userId}-${player.count}-${dealKey}`}
              player={player}
              zone="top"
              active={player.seat === view.turn}
              art={art}
            />
          ))}
        </div>

        <div className="uno-zone uno-zone--left">
          {opponents.filter((player) => seatZone(player.seat) === "left").map((player) => (
            <OpponentHand
              key={`${player.userId}-${player.count}-${dealKey}`}
              player={player}
              zone="left"
              active={player.seat === view.turn}
              art={art}
            />
          ))}
        </div>

        <div className="uno-zone uno-zone--centre">
          <div className="uno-centre">
            <button
              ref={drawRef}
              type="button"
              className="uno-deck uno-deck--draw"
              onClick={draw}
              disabled={!isMyTurn || !view.canDraw}
              aria-label="Draw a card"
              title="Draw a card"
            >
              <img src={art("card-back")} alt="" />
              <span className="uno-deck-count">{view.deckCount}</span>
              <span className="uno-deck-label">DRAW</span>
            </button>

            <div className="uno-deck uno-deck--discard" ref={discardRef}>
              <img className="uno-discard-ghost uno-discard-ghost--one" src={art("card-back")} alt="" />
              <img className="uno-discard-ghost uno-discard-ghost--two" src={art("card-back")} alt="" />
              {view.topCard !== null ? (
                <img key={view.topCard.id} className="uno-discard-top" src={cardArt(view.topCard)} alt={`Top card ${view.topCard.id}`} />
              ) : (
                <img className="uno-discard-top" src={art("card-back")} alt="" />
              )}
              <span className="uno-deck-label">DISCARD</span>
            </div>

            <button
              type="button"
              className="uno-call"
              onClick={onUno}
              disabled={hand.length !== 1}
              aria-label="Call UNO"
              title={hand.length === 1 ? "Call UNO!" : "Call UNO when you have one card"}
            >
              <span>UNO</span>
            </button>
          </div>
        </div>

        <div className="uno-zone uno-zone--right">
          {opponents.filter((player) => seatZone(player.seat) === "right").map((player) => (
            <OpponentHand
              key={`${player.userId}-${player.count}-${dealKey}`}
              player={player}
              zone="right"
              active={player.seat === view.turn}
              art={art}
            />
          ))}
        </div>

        <div className="uno-zone uno-zone--hand">
          <div className="uno-my-pile" aria-hidden="true">
            {Array.from({ length: 3 }, (_, index) => (
              <img
                key={index}
                src={art("card-back")}
                alt=""
                style={{
                  transform: pileStyle === "fan"
                    ? `translateX(${(index - 1) * 7}px) rotate(${(index - 1) * 10}deg)`
                    : pileStyle === "tower"
                      ? `translateY(${-index * 5}px) scale(${1 - index * 0.06})`
                      : `translateY(${-index * 2}px)`,
                }}
              />
            ))}
            <span>{hand.length}</span>
          </div>
          <div className={`uno-turn-pill${isMyTurn ? " uno-turn-pill--live" : ""}`}>
            {view.pendingChallenge !== null ? "CHALLENGE" : isMyTurn ? "YOUR TURN" : "WAITING…"}
          </div>
          {effectiveMode === UNO_MODE.SPEED_PACK ? (
            <div className="uno-turn-pill" title="Cards required this turn">
              SPEED {view.speedLevel ?? 1}
              {" · "}
              {Math.min(view.speedPlayed ?? 0, view.speedTarget ?? 1)}/{(view.speedTarget ?? 1)}
            </div>
          ) : null}
          <div className="uno-hand-scroll">
            <div className="uno-hand-row" ref={handRef} key={dealKey}>
              {hand.map((card, index) => {
                const playable = legal.has(card.id) && (isMyTurn || jumping);
                return (
                  <button
                    type="button"
                    key={card.id}
                    className={`uno-hand-card${playable ? " uno-hand-card--usable" : ""}`}
                    onClick={(event) => play(card, event)}
                    disabled={!playable}
                    aria-label={`Play ${card.id}`}
                    title={playable ? (jumping && !isMyTurn ? "Jump in with this card" : cardHint(card) ?? "Play this card") : card.id}
                    style={{ ["--uno-deal-delay" as string]: `${index * 4 * 80}ms` }}
                  >
                    <img src={cardArt(card)} alt={card.id} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {flights.map((flight) => (
        <img
          key={flight.key}
          className="uno-flight"
          src={art(flight.cardId)}
          alt=""
          style={{
            left: flight.x,
            top: flight.y,
            ["--uno-dx" as string]: `${flight.dx}px`,
            ["--uno-dy" as string]: `${flight.dy}px`,
          }}
        />
      ))}

      {challengeTarget && pendingStack === null && !localPromptActive && info !== null && (
        <div className="uno-overlay">
          <div className="uno-overlay-card" role="dialog" aria-modal="true" aria-label="Challenge the play" aria-labelledby="uno-dialog-title">
            <p className="eyebrow">{info.eyebrow}</p>
            <h2 id="uno-dialog-title">Challenge the play?</h2>
            <p className="uno-overlay-copy">{info.copy}</p>
            <div className="uno-overlay-actions">
              <button type="button" className="button button--ghost" onClick={() => resolveChallenge(false)}>{info.takeLabel}</button>
              <button type="button" className="button button--primary" onClick={() => resolveChallenge(true)}>
                {view.pendingChallenge?.kind === "dare" || view.pendingChallenge?.kind === "wildDare"
                  ? "Do the dare"
                  : "Challenge"}
              </button>
              {legalNoUCards.length > 0 ? (
                <button type="button" className="button" onClick={() => setPendingCard(legalNoUCards[0].id)}>NO U!</button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {stackTarget && !localPromptActive && (
        <div className="uno-overlay uno-overlay--stack">
          <div className="uno-overlay-card uno-stack-card" role="dialog" aria-modal="true" aria-label="Pending draw stack" aria-labelledby="uno-dialog-title">
            <p className="eyebrow">{stackKindLabel(pendingStack?.kind ?? "draw2")} chain</p>
            <h2 id="uno-dialog-title">Incoming stack</h2>
            <div className="uno-stack-count">
              <strong>{pendingStack?.count ?? 0}</strong>
              <span>cards</span>
            </div>
            {pendingStack?.value !== undefined ? (
              <p className="uno-stack-minimum" data-required-value={pendingStack.value}>
                Minimum to stack: <strong>{pendingStack.value}</strong>
              </p>
            ) : null}
            <p className="uno-overlay-copy">
              Take the accumulated cards, or play a legal response to pass the stack on
              {challengeTarget ? ", or challenge the play" : ""}.
            </p>
            {stackCards.length > 0 ? (
              <div className="uno-stack-options">
                {stackCards.map((card) => (
                  <button
                    type="button"
                    key={card.id}
                    className="uno-stack-option"
                    aria-label={`Stack ${card.id}`}
                    onClick={() => stackDraw(card)}
                  >
                    <img src={cardArt(card)} alt={card.id} />
                    <span>
                      {reversePack
                        ? "NO U!"
                        : stackPack
                          ? `Stack ${stackKindLabel(card.kind)}`
                          : noMercy
                          ? `Stack +${drawCardValue(card.kind)}`
                          : `Stack ${stackKindLabel(card.kind)}`}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="uno-overlay-actions">
              <button
                type="button"
                className="button button--ghost"
                aria-label={`Take ${pendingStack?.count ?? 0}`}
                onClick={takeStack}
              >
                Take {pendingStack?.count ?? 0}
              </button>
              {challengeTarget ? (
                <button type="button" className="button" onClick={() => resolveChallenge(true)}>
                  Challenge
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {hitTarget && !localPromptActive && (
        <div className="uno-overlay uno-overlay--hit">
          <div className="uno-hit-card" role="dialog" aria-modal="true" aria-label="Incoming hit" aria-labelledby="uno-dialog-title">
            <p className="eyebrow">UNO Attack</p>
            <h2 id="uno-dialog-title">Incoming hit</h2>
            <div className="uno-hit-count">
              <strong>{pendingHit?.amount ?? 0}</strong>
              <span>cards</span>
            </div>
            <p className="uno-overlay-copy">Take the launcher, or deflect it back with a Hit or Wild Attack card.</p>
            {hitCards.length > 0 ? (
              <div className="uno-hit-deflects">
                {hitCards.map((card) => (
                  <button
                    type="button"
                    key={card.id}
                    className="uno-hit-deflect"
                    aria-label={`Deflect with ${card.id}`}
                    onClick={(event) => deflectHit(card, event)}
                  >
                    <img src={cardArt(card)} alt={card.id} />
                    <span>{card.kind === "wildAttack" ? "Redirect" : "Deflect"}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="uno-overlay-actions">
              <button type="button" className="button button--ghost" onClick={takeHit}>Take hit</button>
            </div>
          </div>
        </div>
      )}

      {pendingRoulette !== null && !localPromptActive && rouletteChooser ? (
        <div className="uno-overlay uno-overlay--colour uno-overlay--roulette">
          <div className="uno-colour-card" role="dialog" aria-label="Choose a colour" data-roulette="true">
            <div className="uno-colour-card__art" aria-hidden="true">
              <span className="uno-colour-card__wild">ROULETTE</span>
              <span className="uno-colour-card__spark uno-colour-card__spark--one" />
              <span className="uno-colour-card__spark uno-colour-card__spark--two" />
              <span className="uno-colour-card__spark uno-colour-card__spark--three" />
            </div>
            <div className="uno-colour-card__body">
              <p className="eyebrow">Wild Colour Roulette</p>
              <h2>Choose a colour</h2>
              <p className="uno-overlay-copy">Keep drawing until a card of the colour you pick appears.</p>
              <div className="uno-colour-choices">
                {sideColors.map((color, index) => (
                  <button
                    type="button"
                    key={color}
                    className={`uno-colour uno-colour--${color}`}
                    style={{ animationDelay: `${index * 55}ms` }}
                    onClick={() => {
                      (onChooseColour ?? onChooseColor)?.(color);
                    }}
                    aria-label={`Choose ${color}`}
                  >
                    <span className="uno-colour__ring" aria-hidden="true" />
                    <span className="uno-colour__label">{color}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {pendingRoulette !== null && !localPromptActive && !rouletteChooser ? (
        <div className="uno-overlay uno-overlay--roulette-wait" role="status" aria-label="Wild Colour Roulette">
          <div className="uno-overlay-card">
            <p className="eyebrow">Wild Colour Roulette</p>
            <h2>Waiting for a colour</h2>
            <p className="uno-overlay-copy">{rouletteChooserName} is picking the colour for the draw.</p>
          </div>
        </div>
      ) : null}

      {pendingCard !== null && (
        <div className="uno-overlay uno-overlay--colour">
          <div className="uno-colour-card" role="dialog" aria-modal="true" aria-label="Choose a colour" aria-labelledby="uno-dialog-title">
            <div className="uno-colour-card__art" aria-hidden="true">
              <span className="uno-colour-card__wild">
                {attackPrompt !== null ? "ATTACK" : pendingCardKind === "modCard" ? "MOD"
                  : pendingCardKind === "wildShowdown" ? "SHOWDOWN"
                    : pendingCardKind === "wildGrabTower" ? "TOWER" : "WILD"}
              </span>
              <span className="uno-colour-card__spark uno-colour-card__spark--one" />
              <span className="uno-colour-card__spark uno-colour-card__spark--two" />
              <span className="uno-colour-card__spark uno-colour-card__spark--three" />
            </div>
            <div className="uno-colour-card__body">
              {pendingCardKind === "modCard" && modGiveColor === null ? (
                <>
                  <p className="eyebrow">UNO Mod</p>
                  <h2 id="uno-dialog-title">Give a colour away</h2>
                  <p className="uno-overlay-copy">Give one card of this colour to each opponent in turn order.</p>
                </>
              ) : (
                <>
                  <p className="eyebrow">
                    {attackPrompt !== null ? "Wild Attack"
                      : pendingCardKind === "modCard" ? "UNO Mod"
                        : pendingCardKind === "wildShowdown" ? "Wild Showdown"
                          : pendingCardKind === "wildGrabTower" ? "Wild Grab Tower" : "Wild card"}
                  </p>
                  <h2 id="uno-dialog-title">
                    {pendingCardKind === "modCard" ? "Choose the next colour" : "Choose a colour"}
                  </h2>
                  <p className="uno-overlay-copy">
                    {pendingCardKind === "wildShowdown"
                      ? `Set the continuing colour for the ${showdownAmount}-card showdown.`
                      : pendingCardKind === "wildGrabTower"
                        ? "Set the continuing colour after claiming the tower."
                        : "The next card must match the colour you pick."}
                  </p>
                </>
              )}
              <div className="uno-colour-choices">
                {(() => {
                  const giveChoices = sideColors.filter((color) => hand.some((card) => card.color === color));
                  const choices = pendingCardKind === "modCard" && modGiveColor === null
                    ? giveChoices.length > 0 ? giveChoices : sideColors
                    : sideColors;
                  return choices.map((color, index) => (
                  <button
                    type="button"
                    key={color}
                    className={`uno-colour uno-colour--${color}`}
                    style={{ animationDelay: `${index * 55}ms` }}
                    onClick={() => {
                      if (pendingCardKind === "modCard" && modGiveColor === null) {
                        setModGiveColor(color);
                        return;
                      }
                      fly(pendingCard, handRef.current?.querySelector("img")?.getBoundingClientRect() ?? null, discardRef.current?.getBoundingClientRect() ?? null);
                      if (attackPrompt !== null && attackPrompt.targetId !== null) {
                        onPlay(pendingCard, color, attackPrompt.targetId);
                      } else if (pendingTrade !== null) {
                        onPlay(pendingTrade.cardId, color, pendingTrade.targetId, {
                          tradeWithId: pendingTrade.tradeWithId,
                        });
                      } else if (showdownTarget !== null) {
                        onPlay(pendingCard, color, showdownTarget, { showdownAmount });
                      } else if (grabTowerId !== null) {
                        onPlay(pendingCard, color, undefined, { towerId: grabTowerId });
                      } else if (modGiveColor !== null) {
                        onPlay(pendingCard, color, undefined, { modColor: modGiveColor });
                      } else {
                        onPlay(pendingCard, color);
                      }
                      setPendingCard(null);
                      setAttackPrompt(null);
                      setPendingTrade(null);
                      setShowdownTarget(null);
                      setGrabTowerId(null);
                      setModGiveColor(null);
                    }}
                    aria-label={`Choose ${color}`}
                  >
                    <span className="uno-colour__ring" aria-hidden="true" />
                    <span className="uno-colour__label">{color}</span>
                  </button>
                  ));
                })()}
              </div>
              <button type="button" className="uno-dialog-cancel" onClick={cancelLocalPrompt}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {(pendingTarget !== null || (attackPrompt !== null && attackPrompt.targetId === null && pendingCard === null)) && (
        <div className="uno-overlay uno-overlay--target">
          <div className="uno-target-card" role="dialog" aria-modal="true" aria-label="Choose a target player" aria-labelledby="uno-dialog-title">
            <p className="eyebrow">
              {attackPrompt !== null ? "UNO Attack"
                : pendingTargetKind === "wildShowdown" ? "Wild Showdown"
                  : pendingTargetKind === "awForcedSwap" || pendingTargetKind === "awTargetDrawTwo" ? "All Wild"
                    : noMercy ? "No Mercy" : "Seven-O"}
            </p>
            <h2 id="uno-dialog-title">Choose a target</h2>
            {pendingTargetKind === "wildShowdown" ? (
              <div className="uno-stack-options" aria-label="Showdown penalty">
                {[1, 2, 3].map((amount) => (
                  <button
                    type="button"
                    key={amount}
                    className={`button${showdownAmount === amount ? " button--primary" : " button--ghost"}`}
                    onClick={() => setShowdownAmount(amount)}
                  >
                    {amount} card{amount === 1 ? "" : "s"}
                  </button>
                ))}
              </div>
            ) : null}
            <p className="uno-overlay-copy">
              {attackPrompt !== null
                ? attackPrompt.deflect
                  ? "Redirect the hit to the player you pick."
                  : "Send the hit to the player you pick."
                : pendingTargetKind === "wildShowdown"
                  ? `Face off against the player you pick for ${showdownAmount} card${showdownAmount === 1 ? "" : "s"}.`
                  : pendingTargetKind === "awForcedSwap"
                    ? "Exchange your remaining hand with the player you pick."
                    : pendingTargetKind === "awTargetDrawTwo"
                      ? "The player you pick draws two cards."
                      : "Your 7 swaps hands with the player you pick."}
            </p>
            <div className="uno-target-choices">
              {targets.map((player) => (
                <button
                  type="button"
                  key={player.userId}
                  className="uno-target-choice"
                  onClick={() => {
                    const destination = surfaceRef.current?.querySelector(`[data-seat-user="${player.userId}"]`)?.getBoundingClientRect() ?? null;
                    const source = handRef.current?.querySelector("img")?.getBoundingClientRect() ?? null;
                    if (attackPrompt !== null) {
                      fly(attackPrompt.cardId, source, destination);
                      setAttackPrompt({ ...attackPrompt, targetId: player.userId });
                      setPendingCard(attackPrompt.cardId);
                      return;
                    }
                    if (pendingTarget === null) {
                      return;
                    }
                    fly(pendingTarget, source, destination);
                    const wildShowdown = hand.find((card) => card.id === pendingTarget)?.kind === "wildShowdown";
                    if (wildShowdown) {
                      setShowdownTarget(player.userId);
                      setPendingCard(pendingTarget);
                    } else {
                      onPlay(pendingTarget, undefined, player.userId, undefined);
                    }
                    setPendingTarget(null);
                  }}
                >
                  <strong>{player.username}</strong>
                  <span>{player.count} cards</span>
                </button>
              ))}
            </div>
            <button type="button" className="button button--ghost" onClick={cancelLocalPrompt}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {towerPrompt !== null && (
        <div className="uno-overlay uno-overlay--target">
          <div className="uno-target-card" role="dialog" aria-modal="true" aria-label="Choose a Power Tower" aria-labelledby="uno-dialog-title">
            <p className="eyebrow">
              {hand.find((card) => card.id === towerPrompt)?.kind === "wildGrabTower"
                ? "Wild Grab Tower" : "Grab Two Towers"}
            </p>
            <h2 id="uno-dialog-title">
              {hand.find((card) => card.id === towerPrompt)?.kind === "wildGrabTower"
                ? "Choose one tower" : "Choose two towers"}
            </h2>
            <p className="uno-overlay-copy">
              {hand.find((card) => card.id === towerPrompt)?.kind === "wildGrabTower"
                ? "Pick one tower to claim. You will choose the continuing colour next."
                : "Pick a tower to claim first; a second available tower is claimed automatically."}
            </p>
            <div className="uno-target-choices">
              {["U", "N", "O", "!"].map((tower) => (
                <button
                  type="button"
                  key={tower}
                  className="uno-target-choice"
                  onClick={() => {
                    const wildTower = hand.find((card) => card.id === towerPrompt)?.kind === "wildGrabTower";
                    if (wildTower) {
                      setGrabTowerId(tower);
                      setPendingCard(towerPrompt);
                    } else {
                      onPlay(towerPrompt, undefined, undefined, { towerId: tower });
                    }
                    setTowerPrompt(null);
                  }}
                >
                  <strong>{tower}</strong>
                  <span>{view.powerTowers?.[tower] == null || view.powerTowers[tower] === ""
                    ? "Unclaimed"
                    : view.players.find((player) => player.userId === view.powerTowers?.[tower])?.username ?? "Taken"}</span>
                </button>
              ))}
            </div>
            <button type="button" className="button button--ghost" onClick={cancelLocalPrompt}>Cancel</button>
          </div>
        </div>
      )}

      {swapPrompt !== null && (
        <div className="uno-overlay uno-overlay--target">
          <div className="uno-target-card" role="dialog" aria-label={swapPrompt.targetId === null ? "Choose a swap target" : "Choose a card to give"}>
            <p className="eyebrow">Swap Pack</p>
            <h2>{swapPrompt.targetId === null ? "Choose a player" : "Give a card"}</h2>
            <p className="uno-overlay-copy">
              {swapPrompt.targetId === null
                ? "Take a random card from the player you pick, then give one of yours back."
                : "Pick the card you give to the player you chose."}
            </p>
            {swapPrompt.targetId === null ? (
              <div className="uno-target-choices">
                {targetCandidates(view).filter((player) => player.count > 0).map((player) => (
                  <button
                    type="button"
                    key={player.userId}
                    className="uno-target-choice"
                    onClick={() => setSwapPrompt({ ...swapPrompt, targetId: player.userId })}
                  >
                    <strong>{player.username}</strong>
                    <span>{player.count} cards</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="uno-hit-deflects">
                {giveCandidates(view, swapPrompt.cardId).map((card) => (
                  <button
                    type="button"
                    key={card.id}
                    className="uno-hit-deflect"
                    onClick={() => {
                      const targetId = swapPrompt.targetId;
                      if (targetId === null) return;
                      const source = handRef.current?.querySelector("img")?.getBoundingClientRect() ?? null;
                      const destination = surfaceRef.current?.querySelector(`[data-seat-user="${targetId}"]`)?.getBoundingClientRect() ?? null;
                      fly(card.id, source, destination);
                      onPlay(swapPrompt.cardId, undefined, targetId, { giveCardId: card.id });
                      setSwapPrompt(null);
                    }}
                  >
                    <img src={cardArt(card)} alt={card.id} />
                    <span>Give</span>
                  </button>
                ))}
              </div>
            )}
            <button type="button" className="button button--ghost" onClick={() => setSwapPrompt(null)}>Cancel</button>
          </div>
        </div>
      )}

      {tradePrompt !== null && (
        <div className="uno-overlay uno-overlay--target">
          <div className="uno-target-card" role="dialog" aria-label="Choose trade players">
            <p className="eyebrow">Wild Force Trade</p>
            <h2>{tradePrompt.firstId === null ? "First player" : "Second player"}</h2>
            <p className="uno-overlay-copy">Choose two players to swap entire hands. You may include yourself.</p>
            <div className="uno-target-choices">
              {tradeCandidates(view)
                .filter((player) => tradePrompt.firstId === null || player.userId !== tradePrompt.firstId)
                .map((player) => (
                  <button
                    type="button"
                    key={player.userId}
                    className="uno-target-choice"
                    onClick={() => {
                      if (tradePrompt.firstId === null) {
                        setTradePrompt({ ...tradePrompt, firstId: player.userId });
                        return;
                      }
                      setPendingTrade({
                        cardId: tradePrompt.cardId,
                        targetId: tradePrompt.firstId,
                        tradeWithId: player.userId,
                      });
                      setPendingCard(tradePrompt.cardId);
                      setTradePrompt(null);
                    }}
                  >
                    <strong>{player.username}</strong>
                    <span>{player.userId === view.myUserId ? "You" : `${player.count} cards`}</span>
                  </button>
                ))}
            </div>
            <button type="button" className="button button--ghost" onClick={() => setTradePrompt(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

interface OpponentHandProps {
  player: BoardView["players"][number];
  zone: "top" | "left" | "right";
  active: boolean;
  art: (cardId: string) => string;
}

function OpponentHand({ player, zone, active, art }: OpponentHandProps) {
  const cards = Array.from({ length: player.count }, (_, index) => {
    const fraction = player.count > 1 ? index / (player.count - 1) : 0;
    return (
      <img
        key={index}
        className="uno-opponent-card"
        src={art("card-back")}
        alt=""
        style={{
          left: `calc((100% - var(--uno-card-w)) * ${fraction})`,
          zIndex: index + 1,
          animationDelay: `${(index * 4 + player.seat) * 80}ms`,
        }}
      />
    );
  });
  return (
    <div
      className={`uno-opponent-hand uno-opponent-hand--${zone}${active ? " uno-opponent-hand--active" : ""}${player.out === true ? " uno-opponent-hand--out" : ""}`}
      data-seat-user={player.userId}
    >
      <div className="uno-opponent-label">
        <strong>{player.username}</strong>
        <span>{player.out === true ? "OUT" : `${player.count} cards`}</span>
      </div>
      <div className="uno-opponent-cards" aria-hidden="true">
        {player.out === true ? (
          <img className="uno-opponent-card uno-opponent-card--out" src={art("card-back")} alt="" />
        ) : cards}
      </div>
    </div>
  );
}
