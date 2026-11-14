import type { CSSProperties, ReactElement } from "react";
import type { GameCatalogEntry } from "@moongames/game-sdk";
import { Icon } from "./Icon";

/**
 * The names of the capabilities a title can offer. The list is generic, so a
 * new title only needs its catalog entry to say what it can do.
 */
export const capabilityLabels: Record<string, string> = {
  local: "Local play",
  online: "Online",
  "private-match": "Private rooms",
  ai: "AI opponent",
  spectators: "Spectators",
  "invite-links": "Invite links",
  replay: "Replay",
};

/**
 * The one card every title uses.
 *
 * A game never brings its own launcher screen. It publishes catalog data and
 * this card turns that data into the card a player sees, so every title in
 * the library looks the same and a new title needs no launcher work.
 */
export interface GameCardProps {
  /** The catalog entry that describes the game. */
  game: GameCatalogEntry;
  /** The artwork behind the card. */
  art: ReactElement;
  /** True when the release is a verified official build. */
  official?: boolean;
  /** True when the game can be opened right now. */
  canLaunch?: boolean;
  /** True while the game is opening, so the button says what is happening. */
  busy?: boolean;
  /** The label on the play button. */
  actionLabel?: string;
  /** The line under the title. */
  tagline?: string;
  /** The longer description of the game. */
  description?: string;
  /** The labels of the capabilities the game offers. */
  capabilityLabels?: Record<string, string>;
  /** The label for a capability the game offers. */
  onPlay?: () => void;
}

function statusLabel(game: GameCatalogEntry): string {
  switch (game.status) {
    case "available":
      return "Ready to play";
    case "coming-soon":
      return "Coming soon";
    case "hidden":
      return "Hidden";
  }
}

function playerLabel(game: GameCatalogEntry): string {
  if (game.minPlayers === game.maxPlayers) {
    return `${game.minPlayers} player${game.minPlayers === 1 ? "" : "s"}`;
  }
  return `${game.minPlayers}–${game.maxPlayers} players`;
}

/**
 * The card for one catalog entry. The same card is used everywhere: in the
 * library grid, in a featured slot, and in any list a host shows.
 */
export function GameCard({
  game,
  art,
  official = false,
  canLaunch = game.status === "available",
  busy = false,
  actionLabel = "Play",
  tagline,
  description,
  capabilityLabels,
  onPlay,
}: GameCardProps): ReactElement {
  const style = { "--accent": game.accent } as CSSProperties;
  const summary = tagline ?? game.tagline;
  const details = description ?? game.description;
  return (
    <article className="mg-card" style={style}>
      <div className="mg-card__art">{art}</div>
      <div className="mg-card__body">
        <div className="mg-card__meta">
          <span className={`mg-status mg-status--${game.status}`}>
            {statusLabel(game)}
          </span>
          {game.version === undefined ? null : (
            <span className="mg-version">v{game.version}</span>
          )}
          {official ? (
            <span className="mg-verified">
              <Icon name="shield-check" size={12} strokeWidth={1.9} />
              Verified
            </span>
          ) : null}
          <span className="mg-card__players">{playerLabel(game)}</span>
        </div>
        <h3 className="mg-card__title">{game.name}</h3>
        <p className="mg-card__tagline">{summary}</p>
        {details === summary ? null : (
          <p className="mg-card__description">{details}</p>
        )}
        {game.capabilities.length > 0 ? (
          <div className="mg-card__capabilities">
            {game.capabilities.map((capability) => (
              <span className="mg-capability" key={capability}>
                <Icon name="sparkle" size={11} strokeWidth={1.7} />
                {capabilityLabels?.[capability] ?? capability}
              </span>
            ))}
          </div>
        ) : null}
        {game.tags.length > 0 ? (
          <div className="mg-card__tags">
            {game.tags.map((tag) => (
              <span className="mg-tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        <div className="mg-card__actions">
          {canLaunch ? (
            <button
              className="mg-button mg-button--play"
              type="button"
              disabled={busy}
              onClick={() => onPlay?.()}
            >
              {actionLabel}
              <Icon name="arrow-up-right" size={13} strokeWidth={2.2} />
            </button>
          ) : (
            <span className="mg-card__soon">
              {game.status === "available" ? "Web build soon" : "In the works"}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
