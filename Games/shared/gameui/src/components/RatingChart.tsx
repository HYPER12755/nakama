import type { GameHistoryEntry } from "../types";

export interface RatingChartProps {
  /** The finished games, newest first. */
  history: GameHistoryEntry[];
  /** The width of the chart in pixels. */
  width?: number;
  /** The height of the chart in pixels. */
  height?: number;
}

/**
 * The path of a rating over the games that were played.
 *
 * The games are drawn from the oldest to the newest, for a rating is
 * read from left to right.
 */
export function ratingPath(
  history: GameHistoryEntry[],
  width: number,
  height: number,
  padding = 6,
): { path: string; points: Array<{ x: number; y: number; rating: number }> } {
  const rated = history
    .filter((entry) => entry.rated && entry.ratingAfter !== undefined)
    .slice()
    .reverse();

  if (rated.length === 0) {
    return { path: "", points: [] };
  }

  const ratings = rated.map((entry) => entry.ratingAfter as number);
  let lowest = Math.min(...ratings);
  let highest = Math.max(...ratings);

  // A rating that never moved is drawn as a flat line in the middle.
  if (highest - lowest < 1) {
    lowest -= 10;
    highest += 10;
  }

  const span = highest - lowest;
  const usableWidth = Math.max(1, width - padding * 2);
  const usableHeight = Math.max(1, height - padding * 2);
  const step =
    rated.length > 1 ? usableWidth / (rated.length - 1) : 0;

  const points = rated.map((entry, index) => {
    const rating = entry.ratingAfter as number;
    const x = padding + step * index;
    const y = padding + usableHeight * (1 - (rating - lowest) / span);
    return { x, y, rating };
  });

  const path = points
    .map((point, index) =>
      index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`,
    )
    .join(" ");

  return { path, points };
}

/**
 * The rating of a player, drawn as a line.
 *
 * The chart is plain, so it can be read at any size, and it says what the
 * rating was at the end of every rated game.
 */
export function RatingChart({
  history,
  width = 260,
  height = 72,
}: RatingChartProps) {
  const { path, points } = ratingPath(history, width, height);

  if (points.length === 0) {
    return null;
  }

  return (
    <figure className="rating-chart" aria-label="Your rating over your games">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        preserveAspectRatio="none"
      >
        <path
          className="rating-chart__line"
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((point, index) => (
          <circle
            key={`${point.rating}-${index}`}
            className="rating-chart__dot"
            cx={point.x}
            cy={point.y}
            r="2.6"
          />
        ))}
      </svg>
      <figcaption className="rating-chart__caption">
        <span>
          {points[0].rating} → {points[points.length - 1].rating}
        </span>
        <span>{points.length} rated games</span>
      </figcaption>
    </figure>
  );
}
