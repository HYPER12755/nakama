export interface EngineArrowProps {
  /** The square the piece stands on. */
  from: string;
  /** The square the piece goes to. */
  to: string;
  /** Whether the board is turned about. */
  flipped?: boolean;
  /** The colour of the arrow. */
  color?: string;
}

/**
 * The arrow that shows the move the engine likes.
 *
 * This is the arrow lichess draws on the analysis board: it points from the
 * square the piece stands on to the square the engine wants it to go to.
 */
export function EngineArrow({
  from,
  to,
  flipped = false,
  color = "rgba(120, 200, 120, 0.85)",
}: EngineArrowProps) {
  const square = (name: string) => {
    const file = name.charCodeAt(0) - 97;
    const rank = Number(name[1]) - 1;
    // The board is drawn with the first rank at the bottom, and it is
    // turned about when the black pieces are at the bottom.
    const x = flipped ? 7 - file : file;
    const y = flipped ? rank : 7 - rank;
    return { x: (x + 0.5) * 12.5, y: (y + 0.5) * 12.5 };
  };

  const start = square(from);
  const end = square(to);

  // The arrow stops short of the square it points at, so the piece it
  // points at can still be seen.
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  const stop = 3.1;
  const tipX = end.x - (dx / length) * stop;
  const tipY = end.y - (dy / length) * stop;
  const head = 2.1;
  const angle = Math.atan2(dy, dx);

  return (
    <svg
      className="engine-arrow"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <line
        x1={start.x}
        y1={start.y}
        x2={tipX}
        y2={tipY}
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.85"
      />
      <polygon
        points={[
          `${end.x},${end.y}`,
          `${tipX - head * Math.sin(angle)},${tipY + head * Math.cos(angle)}`,
          `${tipX + head * Math.sin(angle)},${tipY - head * Math.cos(angle)}`,
        ].join(" ")}
        fill={color}
        opacity="0.9"
      />
    </svg>
  );
}
