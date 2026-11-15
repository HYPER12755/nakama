import { useCallback, useRef } from "react";
import { clampBoardSize, MIN_BOARD_SIZE } from "../lib/boardSize";

export interface BoardResizeHandleProps {
  /** The size of the board right now, in pixels. */
  size: number;
  /** The width the board may have at most, in pixels. */
  available: number;
  /** Called while the corner is dragged. */
  onResize: (size: number) => void;
  /** Called when the drag is over. */
  onResizeEnd: (size: number) => void;
}

/**
 * The corner of the board that is dragged to make the board bigger or
 * smaller.
 *
 * The handle sits at the lower right corner, so the board grows as the
 * corner is dragged away from it.
 */
export function BoardResizeHandle({
  size,
  available,
  onResize,
  onResizeEnd,
}: BoardResizeHandleProps) {
  const dragRef = useRef<{ x: number; size: number } | null>(null);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    dragRef.current = { x: event.clientX, size };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag === null) {
      return;
    }
    onResize(clampBoardSize(drag.size + (event.clientX - drag.x), available));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag === null) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onResizeEnd(clampBoardSize(drag.size + (event.clientX - drag.x), available));
  };

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 24 : -24;
      const next = clampBoardSize(size + step, available);
      onResize(next);
      onResizeEnd(next);
    },
    [available, onResize, onResizeEnd, size],
  );

  return (
    <button
      type="button"
      className="board-resize"
      aria-label={`Make the board bigger or smaller. It is now ${Math.round(size)} pixels wide.`}
      title="Drag to make the board bigger or smaller"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
      onKeyDown={handleKeyDown}
    >
      <span aria-hidden="true" />
    </button>
  );
}

export { MIN_BOARD_SIZE };
