import type { ReactElement } from "react";
import type { GameCatalogEntry } from "@moongames/game-sdk";
import { gameMotif } from "./motifs";
import { Monogram } from "./monogram";

export interface GameMarkProps {
  game: GameCatalogEntry;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

/**
 * Artwork for one catalog entry. A registered motif is used when the catalog
 * names one, otherwise a generated mark is derived from the game id. The
 * launcher therefore renders any game the catalog publishes.
 */
export function GameMark({
  game,
  size = 24,
  strokeWidth = 1.8,
  className,
}: GameMarkProps): ReactElement {
  const Motif = gameMotif(game.icon);
  if (Motif !== null) {
    return (
      <Motif size={size} strokeWidth={strokeWidth} className={className} />
    );
  }
  return (
    <Monogram
      id={game.id}
      name={game.name}
      accent={game.accent}
      size={size}
      className={className}
    />
  );
}
