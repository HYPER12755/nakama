import { useState } from "react";
import { FullscreenChatButton } from "@moongames/game-ui";
import type { Card, Color } from "@moongames/uno-core";
import type { BoardView } from "../lib/view";

const COLORS: Color[] = ["red", "yellow", "green", "blue"];

export interface UnoBoardProps {
  view: BoardView;
  onPlay: (cardId: string, chosenColor?: Color) => void;
  onDraw: () => void;
  onChallenge: (accept: boolean) => void;
  onRematch: () => void;
}

function isWild(card: Card | null): boolean {
  return card !== null && (card.id.startsWith("wild-") || card.id === "wild");
}

export function UnoBoard({ view, onPlay, onDraw, onChallenge, onRematch }: UnoBoardProps) {
  const [pendingCard, setPendingCard] = useState<string | null>(null);
  const me = view.players.find((player) => player.userId === view.myUserId);
  const hand = me?.hand ?? [];
  const isMyTurn =
    view.started &&
    view.pendingChallenge === null &&
    view.players[view.turn]?.userId === view.myUserId;
  const challengeTarget =
    view.pendingChallenge !== null && view.pendingChallenge.targetId === view.myUserId;

  const play = (card: Card) => {
    if (!isMyTurn) return;
    if (card.id.startsWith("wild") || card.id === "wild") {
      setPendingCard(card.id);
      return;
    }
    onPlay(card.id);
  };

  const chooseColor = (color: Color) => {
    if (pendingCard === null) return;
    onPlay(pendingCard, color);
    setPendingCard(null);
  };

  return (
    <div className="uno-table">
      <div className="uno-topbar">
        <span className="uno-brand">UNO</span>
        <span className="uno-status">
          {view.result !== null
            ? view.result.winnerUserId === view.myUserId
              ? "You win"
              : "Hand over"
            : challengeTarget
              ? "Challenge or take the penalty"
              : isMyTurn
                ? "Your turn"
                : `${view.players[view.turn]?.username ?? "Waiting"} to play`}
        </span>
        {view.currentColor !== null && (
          <span className={`uno-color-dot uno-color-dot--${view.currentColor}`} />
        )}
        <FullscreenChatButton />
      </div>

      {view.result !== null && (
        <div className="uno-result">
          <strong>
            {view.result.winnerUserId === view.myUserId ? "You won the hand" : "Hand finished"}
          </strong>
          <button type="button" className="button button--primary" onClick={onRematch}>
            Play again
          </button>
        </div>
      )}

      {challengeTarget && (
        <div className="uno-challenge">
          <p>Challenging a Wild +4?</p>
          <button type="button" className="button button--ghost" onClick={() => onChallenge(false)}>
            Take 4
          </button>
          <button type="button" className="button button--primary" onClick={() => onChallenge(true)}>
            Challenge
          </button>
        </div>
      )}

      <div className="uno-opponents">
        {view.players
          .filter((player) => player.userId !== view.myUserId)
          .map((player) => (
            <div className="uno-opponent" key={player.userId}>
              <img src="cards/card-back.svg" alt="" className="uno-mini-back" />
              <span>{player.username}</span>
              <strong>{player.count}</strong>
            </div>
          ))}
        {view.spectators.map((spectator) => (
          <div className="uno-opponent uno-opponent--spectator" key={spectator.userId}>
            <span>{spectator.username} · watching</span>
          </div>
        ))}
      </div>

      <div className="uno-piles">
        <button
          type="button"
          className="uno-pile"
          onClick={onDraw}
          disabled={!isMyTurn}
          aria-label="Draw a card"
        >
          <img src="cards/card-back.svg" alt="Draw pile" />
          <span>{view.deckCount}</span>
        </button>
        <div className="uno-pile uno-pile--discard">
          {view.topCard !== null ? (
            <img src={`cards/${view.topCard.id}.svg`} alt={`${view.topCard.color ?? "wild"} ${view.topCard.kind}`} />
          ) : (
            <img src="cards/card-back.svg" alt="Discard pile" />
          )}
        </div>
      </div>

      <div className="uno-hand">
        {hand.map((card) => (
          <button
            type="button"
            key={card.id}
            className={`uno-card${isMyTurn ? " uno-card--playable" : ""}`}
            onClick={() => play(card)}
            disabled={!isMyTurn}
            aria-label={`Play ${card.id}`}
          >
            <img src={`cards/${card.id}.svg`} alt={card.id} />
          </button>
        ))}
      </div>

      {pendingCard !== null && (
        <div className="uno-color-picker">
          <p>Choose a colour</p>
          <div>
            {COLORS.map((color) => (
              <button
                type="button"
                key={color}
                className={`uno-color-choice uno-color-dot--${color}`}
                onClick={() => chooseColor(color)}
                aria-label={color}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function wildCardSelected(card: Card | null): boolean {
  return isWild(card);
}
