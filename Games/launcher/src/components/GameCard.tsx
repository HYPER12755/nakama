import type { CSSProperties } from "react";
import type { GameCatalogEntry } from "@moongames/game-sdk";
import {
  formatPlayers,
  gameWebUrl,
  statusLabel,
} from "../lib/catalog";
import {
  isLaunchBusy,
  launchButtonShortLabel,
  type LaunchPhase,
} from "../lib/launchPhase";
import { GameArt } from "./GameArt";
import { Icon } from "./Icon";

interface GameCardProps {
  game: GameCatalogEntry;
  catalogUrl: string;
  nativeLaunch: boolean;
  official: boolean;
  phase: LaunchPhase;
  onPlay: (game: GameCatalogEntry, url: string | null) => void;
}

export function GameCard({
  game,
  catalogUrl,
  nativeLaunch,
  official,
  phase,
  onPlay,
}: GameCardProps) {
  const url = gameWebUrl(game, catalogUrl);
  const canLaunch =
    game.status === "available" && (url !== null || nativeLaunch);
  const status = statusLabel(game);
  const busy = isLaunchBusy(phase);
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
          {official ? (
            <span className="official-chip">
              <Icon name="shield-check" size={11} strokeWidth={1.9} />
              Verified
            </span>
          ) : null}
          {game.tags.slice(0, 3).map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
        <div className="game-card__footer">
          <span className="game-card__players">
            <Icon
              name="users"
              size={13}
              className="game-card__players-icon"
            />
            {formatPlayers(game)}
          </span>
          {canLaunch ? (
            <button
              className="button button--play"
              type="button"
              disabled={busy}
              onClick={() => onPlay(game, url)}
            >
              {busy ? (
                launchButtonShortLabel(phase)
              ) : (
                <>
                  {launchButtonShortLabel(phase)}{" "}
                  <Icon name="arrow-up-right" size={13} strokeWidth={2.2} />
                </>
              )}
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
