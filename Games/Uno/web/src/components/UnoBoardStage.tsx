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

const COLOUR_STACK_KINDS = new Set<Card["kind"]>([
  "wild4", "wildDraw6", "wildDraw10", "wildReverse4",
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
  return undefined;
}

interface ChallengeInfo {
  eyebrow: string;
  copy: string;
  takeLabel: string;
}

function challengeInfo(challenge: NonNullable<BoardView["pendingChallenge"]>): ChallengeInfo {
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
  return {
    eyebrow: "Wild Draw Four",
    copy: "Take four cards, or accuse the player of holding a matching colour.",
    takeLabel: "Take 4",
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
  return "Draw Two";
}

export function targetCandidates(view: BoardView): BoardView["players"] {
  return view.players.filter((player) => player.userId !== view.myUserId && player.out !== true);
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
  onPlay: (cardId: string, chosenColor?: Color, targetId?: string) => void;
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
  const [attackPrompt, setAttackPrompt] = useState<AttackPrompt | null>(null);
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

  const art = (cardId: string): string =>
    cardSet === "neon" ? `cards-neon/${cardId}.svg` : `cards/${cardId}.svg`;

  const me = view.players.find((player) => player.userId === view.myUserId);
  const hand = me?.hand ?? [];
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
  const info = view.pendingChallenge === null ? null : challengeInfo(view.pendingChallenge);
  const legal = new Set(view.legalCards);
  const stackCards = !stackTarget || pendingStack === null
    ? []
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
                <img key={view.topCard.id} className="uno-discard-top" src={art(view.topCard.id)} alt={`Top card ${view.topCard.id}`} />
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
                    <img src={art(card.id)} alt={card.id} />
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

      {challengeTarget && pendingStack === null && info !== null && (
        <div className="uno-overlay">
          <div className="uno-overlay-card">
            <p className="eyebrow">{info.eyebrow}</p>
            <h2>Challenge the play?</h2>
            <p className="uno-overlay-copy">{info.copy}</p>
            <div className="uno-overlay-actions">
              <button type="button" className="button button--ghost" onClick={() => resolveChallenge(false)}>{info.takeLabel}</button>
              <button type="button" className="button button--primary" onClick={() => resolveChallenge(true)}>Challenge</button>
            </div>
          </div>
        </div>
      )}

      {stackTarget && pendingCard === null && (
        <div className="uno-overlay uno-overlay--stack">
          <div className="uno-overlay-card uno-stack-card" role="dialog" aria-label="Pending draw stack">
            <p className="eyebrow">{stackKindLabel(pendingStack?.kind ?? "draw2")} chain</p>
            <h2>Incoming stack</h2>
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
              Take the accumulated cards, play a card of at least this value to pass the stack on
              {challengeTarget ? ", or challenge the Wild Four play" : ""}.
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
                    <img src={art(card.id)} alt={card.id} />
                    <span>{noMercy ? `Stack +${drawCardValue(card.kind)}` : `Stack ${stackKindLabel(card.kind)}`}</span>
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

      {hitTarget && pendingCard === null && attackPrompt === null && (
        <div className="uno-overlay uno-overlay--hit" role="dialog" aria-label="Incoming hit">
          <div className="uno-hit-card">
            <p className="eyebrow">UNO Attack</p>
            <h2>Incoming hit</h2>
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
                    <img src={art(card.id)} alt={card.id} />
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

      {pendingRoulette !== null && pendingCard === null && rouletteChooser ? (
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
                      onChooseColour?.(color);
                      onChooseColor?.(color);
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

      {pendingRoulette !== null && pendingCard === null && !rouletteChooser ? (
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
          <div className="uno-colour-card" role="dialog" aria-label="Choose a colour">
            <div className="uno-colour-card__art" aria-hidden="true">
              <span className="uno-colour-card__wild">{attackPrompt !== null ? "ATTACK" : "WILD"}</span>
              <span className="uno-colour-card__spark uno-colour-card__spark--one" />
              <span className="uno-colour-card__spark uno-colour-card__spark--two" />
              <span className="uno-colour-card__spark uno-colour-card__spark--three" />
            </div>
            <div className="uno-colour-card__body">
              <p className="eyebrow">{attackPrompt !== null ? "Wild Attack" : "Wild card"}</p>
              <h2>Choose a colour</h2>
              <p className="uno-overlay-copy">The next card must match the colour you pick.</p>
              <div className="uno-colour-choices">
                {sideColors.map((color, index) => (
                  <button
                    type="button"
                    key={color}
                    className={`uno-colour uno-colour--${color}`}
                    style={{ animationDelay: `${index * 55}ms` }}
                    onClick={() => {
                      fly(pendingCard, handRef.current?.querySelector("img")?.getBoundingClientRect() ?? null, discardRef.current?.getBoundingClientRect() ?? null);
                      if (attackPrompt !== null && attackPrompt.targetId !== null) {
                        onPlay(pendingCard, color, attackPrompt.targetId);
                      } else {
                        onPlay(pendingCard, color);
                      }
                      setPendingCard(null);
                      setAttackPrompt(null);
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
      )}

      {(pendingTarget !== null || (attackPrompt !== null && attackPrompt.targetId === null && pendingCard === null)) && (
        <div className="uno-overlay uno-overlay--target">
          <div className="uno-target-card" role="dialog" aria-label="Choose a target player">
            <p className="eyebrow">{attackPrompt !== null ? "UNO Attack" : noMercy ? "No Mercy" : "Seven-O"}</p>
            <h2>Choose a target</h2>
            <p className="uno-overlay-copy">
              {attackPrompt !== null
                ? attackPrompt.deflect
                  ? "Redirect the hit to the player you pick."
                  : "Send the hit to the player you pick."
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
                    onPlay(pendingTarget, undefined, player.userId);
                    setPendingTarget(null);
                  }}
                >
                  <strong>{player.username}</strong>
                  <span>{player.count} cards</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                setPendingTarget(null);
                setAttackPrompt(null);
              }}
            >
              Cancel
            </button>
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
