import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { Card, Color } from "@moongames/uno-core";
import type { BoardView, RulesMode } from "../lib/view";

const COLORS: Color[] = ["red", "yellow", "green", "blue"];
const COLOUR_HEX: Record<Color, string> = {
  red: "#ff5252", yellow: "#ffd740", green: "#69f0ae", blue: "#448aff",
};

interface Flight {
  key: number;
  cardId: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
}

function isWild(card: Card): boolean {
  return card.id === "wild" || card.id.startsWith("wild");
}

export function isSevenCard(card: Card): boolean {
  return card.kind === "number" && card.value === 7;
}

export function targetCandidates(view: BoardView): BoardView["players"] {
  return view.players.filter((player) => player.userId !== view.myUserId);
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
  onDraw: () => void;
  onChallenge: (accept: boolean) => void;
  onUno: () => void;
}

export function UnoBoardStage({
  view, cardSet, dealKey, activeColor, direction, highlight, pileStyle,
  rulesMode = "classic", onPlay, onDraw, onChallenge, onUno,
}: UnoBoardStageProps) {
  const [pendingCard, setPendingCard] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [dealt, setDealt] = useState(false);
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
  const isMyTurn =
    view.started && view.pendingChallenge === null && view.players[view.turn]?.userId === view.myUserId;
  const challengeTarget =
    view.pendingChallenge !== null && view.pendingChallenge.targetId === view.myUserId;
  const legal = new Set(view.legalCards);

  const opponents = targetCandidates(view);
  const isSevenO = (view.mode ?? rulesMode) === "sevenO";
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
    const timer = window.setTimeout(() => setDealt(true), 1300);
    return () => window.clearTimeout(timer);
  }, [dealKey]);

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
    if (!isMyTurn) return;
    if (isWild(card)) {
      setPendingCard(card.id);
      return;
    }
    if (isSevenO && isSevenCard(card)) {
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

  return (
    <div
      className={`uno-table-surface uno-highlight--${highlight} uno-pile--${pileStyle}${dealt ? " uno--dealt" : ""}`}
      ref={surfaceRef}
      style={{ ["--uno-active" as string]: activeColor === null ? "transparent" : COLOUR_HEX[activeColor] }}
    >
      <div className="uno-direction" key={direction} aria-hidden="true">{direction === 1 ? "↻" : "↺"}</div>

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
                const playable = legal.has(card.id) && isMyTurn;
                return (
                  <button
                    type="button"
                    key={card.id}
                    className={`uno-hand-card${playable ? " uno-hand-card--usable" : ""}`}
                    onClick={(event) => play(card, event)}
                    disabled={!playable}
                    aria-label={`Play ${card.id}`}
                    title={playable ? "Play this card" : card.id}
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

      {challengeTarget && (
        <div className="uno-overlay">
          <div className="uno-overlay-card">
            <p className="eyebrow">Wild Draw Four</p>
            <h2>Challenge the play?</h2>
            <p className="uno-overlay-copy">Take four cards, or accuse the player of holding a matching colour.</p>
            <div className="uno-overlay-actions">
              <button type="button" className="button button--ghost" onClick={() => resolveChallenge(false)}>Take 4</button>
              <button type="button" className="button button--primary" onClick={() => resolveChallenge(true)}>Challenge</button>
            </div>
          </div>
        </div>
      )}

      {pendingCard !== null && (
        <div className="uno-overlay uno-overlay--colour">
          <div className="uno-colour-card" role="dialog" aria-label="Choose a colour">
            <div className="uno-colour-card__art" aria-hidden="true">
              <span className="uno-colour-card__wild">WILD</span>
              <span className="uno-colour-card__spark uno-colour-card__spark--one" />
              <span className="uno-colour-card__spark uno-colour-card__spark--two" />
              <span className="uno-colour-card__spark uno-colour-card__spark--three" />
            </div>
            <div className="uno-colour-card__body">
              <p className="eyebrow">Wild card</p>
              <h2>Choose a colour</h2>
              <p className="uno-overlay-copy">The next card must match the colour you pick.</p>
              <div className="uno-colour-choices">
                {COLORS.map((color, index) => (
                  <button
                    type="button"
                    key={color}
                    className={`uno-colour uno-colour--${color}`}
                    style={{ animationDelay: `${index * 55}ms` }}
                    onClick={() => {
                      fly(pendingCard, handRef.current?.querySelector("img")?.getBoundingClientRect() ?? null, discardRef.current?.getBoundingClientRect() ?? null);
                      onPlay(pendingCard, color);
                      setPendingCard(null);
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

      {pendingTarget !== null && (
        <div className="uno-overlay uno-overlay--target">
          <div className="uno-target-card" role="dialog" aria-label="Choose a target player">
            <p className="eyebrow">Seven-O</p>
            <h2>Choose a target</h2>
            <p className="uno-overlay-copy">Your 7 swaps hands with the player you pick.</p>
            <div className="uno-target-choices">
              {opponents.map((player) => (
                <button
                  type="button"
                  key={player.userId}
                  className="uno-target-choice"
                  onClick={() => {
                    fly(
                      pendingTarget,
                      handRef.current?.querySelector("img")?.getBoundingClientRect() ?? null,
                      surfaceRef.current?.querySelector(`[data-seat-user="${player.userId}"]`)?.getBoundingClientRect() ?? null,
                    );
                    onPlay(pendingTarget, undefined, player.userId);
                    setPendingTarget(null);
                  }}
                >
                  <strong>{player.username}</strong>
                  <span>{player.count} cards</span>
                </button>
              ))}
            </div>
            <button type="button" className="button button--ghost" onClick={() => setPendingTarget(null)}>
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
      className={`uno-opponent-hand uno-opponent-hand--${zone}${active ? " uno-opponent-hand--active" : ""}`}
      data-seat-user={player.userId}
    >
      <div className="uno-opponent-label">
        <strong>{player.username}</strong>
        <span>{player.count} cards</span>
      </div>
      <div className="uno-opponent-cards" aria-hidden="true">
        {cards}

      </div>
    </div>
  );
}
