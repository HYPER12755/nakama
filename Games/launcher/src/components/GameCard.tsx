import type { CSSProperties } from "react";
import type { GameCatalogEntry } from "@moongames/game-sdk";
import {
  formatPlayers,
  gameWebUrl,
  statusLabel,
} from "../lib/catalog";
import { GameArt } from "./GameArt";

interface GameCardProps {
  game: GameCatalogEntry;
  catalogUrl: string;
  nativeLaunch: boolean;
  onPlay: (game: GameCatalogEntry, url: string | null) => void;
}

export function GameCard({
  game,
  catalogUrl,
  nativeLaunch,
  onPlay,
}: GameCardProps) {
  const url = gameWebUrl(game, catalogUrl);
  const canLaunch =
    game.status === "available" && (url !== null || nativeLaunch);
  const status = statusLabel(game);
  const style = { "--accent": game.accent } as CSSProperties;
  return (
    <article className="game-card" style={style}>
      <GameArt game={game} catalogUrl={catalogUrl} />
      <div className="game-card__body">
        <div className="game-card__topline">
          <h3>{game.name}</h3>
          <span
            className={`status-pill status-pill--${game.status}`}
          >
            {status}
          </span>
        </div>
        <p className="game-card__tagline">{game.tagline}</p>
        <div className="game-card__tags" aria-label="Game tags">
          {game.tags.slice(0, 3).map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
        <div className="game-card__footer">
          <span className="game-card__players">
            <span className="game-card__players-icon">◎</span>
            {formatPlayers(game)}
          </span>
          {canLaunch ? (
            <button
              className="button button--play"
              type="button"
              onClick={() => onPlay(game, url)}
            >
              Play <span aria-hidden="true">↗</span>
            </button>
          ) : (
            <span className="game-card__soon">
              {game.status === "available" ? "Web build soon" : "In the works"}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
