import type { ReactElement, ReactNode } from "react";

export interface MotifProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export type GameMotif = (props: MotifProps) => ReactElement;

function Svg({
  size = 24,
  strokeWidth = 1.8,
  className,
  children,
}: MotifProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function ChessMotif(props: MotifProps): ReactElement {
  return (
    <Svg {...props}>
      <path
        d="M7 20.2h10M8.1 20.2v-3.4c0-1.8.9-3.4 2.4-4.4l1.9-1.2-3-2.7 1.2-4.1c.22-.75 1.2-.9 1.63-.25l2.25 3.35 1.14 2.1c.75 1.45 1.15 3.05 1.15 4.7V20.2"
        fill="currentColor"
        fillOpacity="0.12"
      />
      <path d="M9.4 8.4 12 7.1" />
      <circle cx="12.7" cy="9.7" r=".45" fill="currentColor" stroke="none" />
    </Svg>
  );
}

function CardsMotif(props: MotifProps): ReactElement {
  return (
    <Svg {...props}>
      <rect
        x="6.2"
        y="3.8"
        width="11.6"
        height="16.4"
        rx="2.2"
        transform="rotate(-8 12 12)"
        fill="currentColor"
        fillOpacity="0.1"
      />
      <rect
        x="6.2"
        y="3.8"
        width="11.6"
        height="16.4"
        rx="2.2"
        transform="rotate(8 12 12)"
      />
      <path
        d="M12 8.1 14 12l-2 3.9-2-3.9Z"
        fill="currentColor"
        fillOpacity="0.2"
      />
    </Svg>
  );
}

function LudoMotif(props: MotifProps): ReactElement {
  return (
    <Svg {...props}>
      <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="3.2" />
      <path d="M12 3.4v17.2M3.4 12h17.2" />
      <circle cx="7.7" cy="7.7" r="1.5" fill="currentColor" fillOpacity="0.32" />
      <circle cx="16.3" cy="7.7" r="1.5" fill="currentColor" fillOpacity="0.16" />
      <circle cx="7.7" cy="16.3" r="1.5" fill="currentColor" fillOpacity="0.16" />
      <circle cx="16.3" cy="16.3" r="1.5" fill="currentColor" fillOpacity="0.32" />
    </Svg>
  );
}

function CarromMotif(props: MotifProps): ReactElement {
  return (
    <Svg {...props}>
      <rect
        x="3.4"
        y="3.4"
        width="17.2"
        height="17.2"
        rx="2.6"
        fill="currentColor"
        fillOpacity="0.06"
      />
      <circle cx="6.4" cy="6.4" r="1.7" />
      <circle cx="17.6" cy="6.4" r="1.7" />
      <circle cx="6.4" cy="17.6" r="1.7" />
      <circle cx="17.6" cy="17.6" r="1.7" />
      <circle cx="12" cy="12" r="2.3" />
      <circle cx="12" cy="7.4" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="8.2" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="15.8" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="12" cy="16.6" r="1.15" fill="currentColor" stroke="none" />
      <path d="M6.6 18.6h10.8" />
      <path d="M9.6 18.6 12 21.6l2.4-3" />
    </Svg>
  );
}

/**
 * Motifs are optional artwork hints. A catalog entry may name a key that is
 * not in this registry: the launcher then falls back to a generated mark, so a
 * new game never needs a launcher change.
 */
export const gameMotifs: Record<string, GameMotif> = {
  cards: CardsMotif,
  carrom: CarromMotif,
  chess: ChessMotif,
  ludo: LudoMotif,
};

export function gameMotif(icon: string): GameMotif | null {
  return gameMotifs[icon] ?? null;
}
