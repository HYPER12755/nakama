import type { CSSProperties } from "react";
import type { GameCatalogEntry } from "@moongames/game-sdk";
import {
  capabilityLabels,
  formatPlayers,
  gameWebUrl,
  statusLabel,
} from "../lib/catalog";
import { GameArt } from "./GameArt";
import { Icon } from "./Icon";

interface FeaturedGameProps {
  game: GameCatalogEntry;
  catalogUrl: string;
  nativeLaunch: boolean;
  onPlay: (game: GameCatalogEntry, url: string | null) => void;
}

export function FeaturedGame({
  game,
  catalogUrl,
  nativeLaunch,
  onPlay,
}: FeaturedGameProps) {
  const url = gameWebUrl(game, catalogUrl);
  const canLaunch = url !== null || nativeLaunch;
  const style = { "--accent": game.accent } as CSSProperties;
  return (
    <article className="featured-game" style={style}>
      <div className="featured-game__art">
        <GameArt game={game} catalogUrl={catalogUrl} variant="featured" />
        <span className="featured-game__label">Featured table</span>
      </div>
      <div className="featured-game__content">
        <div className="featured-game__meta">
          <span className="status-pill status-pill--available">
            {statusLabel(game)}
          </span>
          {game.version === undefined ? null : (
            <span className="version-pill">v{game.version}</span>
          )}
          <span className="featured-game__players">{formatPlayers(game)}</span>
        </div>
        <h2>{game.name}</h2>
        <p className="featured-game__tagline">{game.tagline}</p>
        <p className="featured-game__description">{game.description}</p>
        <div className="featured-game__capabilities">
          {game.capabilities.map((capability) => (
            <span className="capability-chip" key={capability}>
              <Icon name="sparkle" size={11} strokeWidth={1.7} />
              {capabilityLabels[capability] ?? capability}
            </span>
          ))}
        </div>
        <div className="featured-game__actions">
          {canLaunch ? (
            <button
              className="button button--primary"
              type="button"
              onClick={() => onPlay(game, url)}
            >
              Play {game.name}{" "}
              <Icon name="arrow-up-right" size={15} strokeWidth={2.2} />
            </button>
          ) : (
            <button className="button button--primary" type="button" disabled>
              Web build unavailable
            </button>
          )}
          <span className="featured-game__hint">
            Opens in this browser. Your account works across every game.
          </span>
        </div>
      </div>
    </article>
  );
}
