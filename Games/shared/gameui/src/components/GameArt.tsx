import type { CSSProperties, ReactElement } from "react";
import type { GameCatalogEntry } from "@moongames/game-sdk";
import { GameMark } from "./gameArt/GameMark";

export interface GameArtProps {
  /** The catalog entry that describes the game. */
  game: GameCatalogEntry;
  /** The artwork behind the card. */
  coverUrl?: string | null;
  /** True for the larger art of a featured card. */
  variant?: "card" | "featured";
}

/**
 * The artwork behind a card. The picture comes from the catalog entry, so a
 * title that publishes cover art gets it and every other title still gets a
 * mark drawn from its own id.
 */
export function GameArt({
  game,
  coverUrl = null,
  variant = "card",
}: GameArtProps): ReactElement {
  const style = { "--accent": game.accent } as CSSProperties;
  return (
    <div
      className={`mg-art mg-art--${variant}${coverUrl === null ? "" : " mg-art--has-cover"}`}
      style={style}
      aria-hidden="true"
    >
      <div className="mg-art__grid" />
      <div className="mg-art__orb mg-art__orb--one" />
      <div className="mg-art__orb mg-art__orb--two" />
      {coverUrl === null ? null : (
        <img
          className="mg-art__cover"
          src={coverUrl}
          alt=""
          loading={variant === "featured" ? "eager" : "lazy"}
        />
      )}
      <span className="mg-art__glyph">
        <GameMark
          game={game}
          size={variant === "featured" ? 220 : 140}
          strokeWidth={1.35}
          className="icon"
        />
      </span>
      <span className="mg-art__edge">{game.id.toUpperCase()}</span>
      {coverUrl === null ? <span className="mg-art__ring" /> : null}
    </div>
  );
}
