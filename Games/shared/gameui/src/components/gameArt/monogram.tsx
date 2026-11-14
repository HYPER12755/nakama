import type { ReactElement } from "react";

export interface MonogramProps {
  id: string;
  name: string;
  accent: string;
  size?: number;
  className?: string;
}

/** Stable hash so the same game always gets the same generated mark. */
export function monogramSeed(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

export function monogramInitials(name: string, id: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
  if (words.length >= 2) {
    return `${words[0]![0]!}${words[1]![0]!}`.toUpperCase();
  }
  const cleaned = id.replace(/[^a-z0-9]/gi, "");
  return (cleaned.slice(0, 2) || name.slice(0, 2)).toUpperCase();
}

/**
 * Generated fallback artwork for a game without a registered motif. The
 * pattern is derived from the game id, so the launcher never has to be
 * changed to publish a new title.
 */
export function Monogram({
  id,
  name,
  accent,
  size = 24,
  className,
}: MonogramProps): ReactElement {
  const seed = monogramSeed(id);
  const initials = monogramInitials(name, id);
  const viewBox = 48;
  const scale = viewBox / 24;

  const cells: { x: number; y: number; r: number }[] = [];
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const bit = (seed >>> (row * 3 + column)) & 1;
      if (bit === 0) {
        continue;
      }
      cells.push({
        x: 6 + column * 18,
        y: 6 + row * 9,
        r: 3.4 + ((seed >>> (row + column)) & 3) * 0.5,
      });
    }
  }

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${viewBox} ${viewBox}`}
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="1"
        y="1"
        width={viewBox - 2}
        height={viewBox - 2}
        rx={9}
        fill={accent}
        fillOpacity="0.16"
        stroke={accent}
        strokeOpacity="0.55"
        strokeWidth={1.4}
      />
      <g fill={accent} fillOpacity="0.42">
        {cells.map((cell, index) => (
          <circle key={index} cx={cell.x} cy={cell.y} r={cell.r} />
        ))}
      </g>
      <text
        x={viewBox / 2}
        y={viewBox / 2 + 5}
        textAnchor="middle"
        fontSize={13 * scale * 0.62}
        fontWeight="800"
        letterSpacing="0.5"
        fill={accent}
      >
        {initials}
      </text>
    </svg>
  );
}
