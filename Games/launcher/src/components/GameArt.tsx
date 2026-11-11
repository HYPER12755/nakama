import type { CSSProperties } from "react";
import type { GameCatalogEntry } from "@moongames/game-sdk";
import { gameCoverUrl } from "../lib/catalog";

interface GameArtProps {
  game: GameCatalogEntry;
  catalogUrl: string;
  variant?: "card" | "featured";
}

export function GameArt({
  game,
  catalogUrl,
  variant = "card",
}: GameArtProps) {
  const cover = gameCoverUrl(game, catalogUrl);
  const style = { "--accent": game.accent } as CSSProperties;
  return (
    <div
      className={`game-art game-art--${variant}${cover === null ? "" : " game-art--has-cover"}`}
      style={style}
      aria-hidden="true"
    >
      <div className="game-art__grid" />
      <div className="game-art__orb game-art__orb--one" />
      <div className="game-art__orb game-art__orb--two" />
      {cover === null ? null : (
        <img
          className="game-art__cover"
          src={cover}
          alt=""
          loading={variant === "featured" ? "eager" : "lazy"}
        />
      )}
      <span className="game-art__glyph">{game.icon}</span>
      <span className="game-art__edge">{game.id.toUpperCase()}</span>
      {cover === null ? (
        <span className="game-art__ring" />
      ) : null}
    </div>
  );
}
