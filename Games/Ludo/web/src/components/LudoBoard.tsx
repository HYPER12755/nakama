import { useEffect, useRef, useState } from "react";
import { assetUrl } from "@moongames/game-sdk";
import {
  START_INDEX,
  TRACK_LENGTH,
  type LudoColor,
  type LudoMove,
  type LudoState,
  type LudoToken,
} from "@moongames/ludo-core";
import { GRID_SIZE, HOME_COLUMN, TRACK, movePath, tokenPoint } from "../lib/boardGeometry";

const CELL = 40;
const SIZE = GRID_SIZE * CELL;
const BOARD_IMAGE = "boards/ludo-classic.jpg";

export interface LudoBoardProps {
  state: LudoState;
  legalTokens: number[];
  lastMove?: LudoMove | null;
  onTokenClick?: (token: number) => void;
  disabled?: boolean;
  tokenSet?: string;
  boardTheme?: string;
  showLegalMoves?: boolean;
  highlightLastMove?: boolean;
  /** Changes on every move so the token can walk the squares one by one. */
  moveKey?: number;
  onStep?: () => void;
  stepMs?: number;
}

/** The shared SDK resolves bundle assets on web and through the host on file://. */
let boardPending: Promise<void> | null = null;
const bitmaps = new Map<string, HTMLCanvasElement>();
const tokenImages = new Map<string, HTMLImageElement | null>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function boardBitmap(theme: string): HTMLCanvasElement | null {
  return bitmaps.get(theme) ?? null;
}

function loadBoardImage(theme: string): Promise<void> {
  if (bitmaps.has(theme)) return Promise.resolve();
  if (boardPending !== null) return boardPending;
  boardPending = assetUrl(BOARD_IMAGE)
    .then((url) => new Promise<void>((resolve) => {
      const image = new Image();
      image.onload = () => {
        const paint = (key: string, tint: string | null) => {
          const canvas = document.createElement("canvas");
          canvas.width = SIZE;
          canvas.height = SIZE;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(image, 0, 0, SIZE, SIZE);
          if (tint !== null) {
            ctx.fillStyle = tint;
            ctx.fillRect(0, 0, SIZE, SIZE);
          }
          bitmaps.set(key, canvas);
        };
        paint("classic", null);
        paint("midnight", "rgba(18, 20, 42, 0.32)");
        paint("warm", "rgba(96, 52, 12, 0.16)");
        boardPending = null;
        notify();
        resolve();
      };
      image.onerror = () => {
        boardPending = null;
        resolve();
      };
      image.src = url;
    }))
    .catch(() => {
      boardPending = null;
    });
  return boardPending;
}

function tokenImage(
  set: string,
  color: LudoColor,
  onLoad?: () => void,
): HTMLImageElement | null {
  const key = `${set}:${color}`;
  if (tokenImages.has(key)) return tokenImages.get(key) ?? null;
  if (typeof Image === "undefined") return null;
  const image = new Image();
  tokenImages.set(key, null);
  image.onload = () => {
    tokenImages.set(key, image);
    onLoad?.();
  };
  image.onerror = () => tokenImages.delete(key);
  void assetUrl(`tokens/${set}-${color}.svg`)
    .then((url) => { image.src = url; })
    .catch(() => tokenImages.delete(key));
  return null;
}

function centre(point: readonly [number, number]): [number, number] {
  return [point[0] * CELL + CELL / 2, point[1] * CELL + CELL / 2];
}

function paintToken(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: LudoColor,
  image: HTMLImageElement | null,
  legal: boolean,
): void {
  ctx.save();
  if (legal) {
    ctx.beginPath();
    ctx.arc(cx, cy, 19, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 246, 200, 0.92)";
    ctx.shadowColor = "#ffd257";
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  if (image) {
    ctx.drawImage(image, cx - 15, cy - 15, 30, 30);
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, 13, 0, Math.PI * 2);
    ctx.fillStyle = "#d9dde6";
    ctx.strokeStyle = "#666c7a";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function LudoBoard({
  state,
  legalTokens,
  lastMove,
  onTokenClick,
  disabled = false,
  tokenSet = "marble",
  boardTheme = "classic",
  showLegalMoves = true,
  highlightLastMove = true,
  moveKey,
  onStep,
  stepMs = 135,
}: LudoBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dpr, setDpr] = useState(1);
  const [tick, setTick] = useState(0);
  const [frame, setFrame] = useState(0);
  const anim = useRef<{
    key: number;
    path: ReturnType<typeof movePath>;
    start: number;
    lastStep: number;
  } | null>(null);

  useEffect(() => onBoardLoadedListener(() => setTick((value) => value + 1)), []);
  useEffect(() => {
    void loadBoardImage(boardTheme);
    const update = () => setDpr(Math.min(window.devicePixelRatio || 1, 2));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [boardTheme]);

  useEffect(() => {
    for (const player of state.players) {
      tokenImage(tokenSet, player.color, () => setTick((value) => value + 1));
    }
  }, [state.players, tokenSet]);

  useEffect(() => {
    if (moveKey === undefined || !lastMove || lastMove.token === undefined) return;
    if (anim.current?.key === moveKey) return;
    const color = state.players[lastMove.player]?.color;
    if (!color) return;
    const path = movePath(color, lastMove.from ?? -1, lastMove.to, lastMove.token);
    if (path.length === 0) return;
    anim.current = { key: moveKey, path, start: performance.now(), lastStep: -1 };
    let raf = 0;
    const loop = (now: number) => {
      const current = anim.current;
      if (!current || current.key !== moveKey) return;
      const elapsed = now - current.start;
      const index = Math.min(path.length - 1, Math.floor(elapsed / stepMs));
      if (index !== current.lastStep) {
        current.lastStep = index;
        onStep?.();
      }
      setFrame(now);
      if (elapsed < path.length * stepMs) raf = requestAnimationFrame(loop);
      else {
        anim.current = null;
        setFrame(0);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [moveKey, lastMove, state.players, onStep, stepMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pixelSize = Math.round(SIZE * dpr);
    if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
      canvas.width = pixelSize;
      canvas.height = pixelSize;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);

    const bitmap = boardBitmap(boardTheme) ?? boardBitmap("classic");
    if (bitmap) ctx.drawImage(bitmap, 0, 0, SIZE, SIZE);

    if (highlightLastMove && lastMove && state.players[lastMove.player]) {
      const color = state.players[lastMove.player]!.color;
      const point = lastMove.to <= 50
        ? TRACK[(START_INDEX[color] + lastMove.to) % TRACK_LENGTH]!
        : HOME_COLUMN[color][Math.min(5, lastMove.to - 51)]!;
      const [mx, my] = centre(point);
      ctx.beginPath();
      ctx.arc(mx, my, 17, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const player of state.players) {
      for (const token of player.tokens) {
        let [cx, cy] = centre(tokenPoint(player.color, token.progress, token.id));
        const moving = anim.current
          && lastMove
          && lastMove.token === token.id
          && lastMove.player === player.seat;
        if (moving && anim.current && lastMove?.token !== undefined) {
          const current = anim.current;
          const elapsed = frame - current.start;
          const index = Math.min(current.path.length - 1, Math.max(0, Math.floor(elapsed / stepMs)));
          const target = centre(current.path[index]!);
          const previous = index === 0
            ? centre(tokenPoint(player.color, lastMove.from ?? -1, token.id))
            : centre(current.path[index - 1]!);
          const t = Math.max(0, Math.min(1, (elapsed - index * stepMs) / stepMs));
          const lift = Math.sin(t * Math.PI) * 7;
          cx = previous[0] + (target[0] - previous[0]) * t;
          cy = previous[1] + (target[1] - previous[1]) * t - lift;
        }
        const legal = showLegalMoves && !disabled
          && player.seat === state.current
          && legalTokens.includes(token.id);
        paintToken(
          ctx, cx, cy, player.color,
          tokenImage(tokenSet, player.color, () => setTick((value) => value + 1)),
          legal,
        );
      }
    }
  }, [state, legalTokens, lastMove, disabled, dpr, tick, frame, tokenSet, boardTheme, showLegalMoves, highlightLastMove, stepMs]);

  function handleClick(event: React.MouseEvent<HTMLCanvasElement>): void {
    if (disabled || !onTokenClick) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width || SIZE;
    const height = rect.height || SIZE;
    const x = ((event.clientX - rect.left) / width) * SIZE;
    const y = ((event.clientY - rect.top) / height) * SIZE;
    const player = state.players[state.current];
    if (!player) return;

    if (legalTokens.length === 0) {
      // Tapping any of your own tokens on a dead roll passes the turn.
      for (const token of player.tokens) {
        const [cx, cy] = centre(tokenPoint(player.color, token.progress, token.id));
        if ((x - cx) ** 2 + (y - cy) ** 2 < 26 * 26) {
          onTokenClick(-1);
          return;
        }
      }
      return;
    }

    let best: LudoToken | null = null;
    let bestDistance = 26 * 26;
    for (const token of player.tokens) {
      if (!legalTokens.includes(token.id)) continue;
      const [cx, cy] = centre(tokenPoint(player.color, token.progress, token.id));
      const distance = (x - cx) ** 2 + (y - cy) ** 2;
      if (distance < bestDistance) {
        best = token;
        bestDistance = distance;
      }
    }
    if (best) onTokenClick(best.id);
  }

  return (
    <div className="carrom-board-wrap">
      <canvas
        ref={canvasRef}
        className="ludo-canvas"
        role="img"
        aria-label="Ludo board with four colours, shared track and home columns"
        onClick={handleClick}
        onPointerDown={(event) => event.preventDefault()}
        onContextMenu={(event) => event.preventDefault()}
        onDragStart={(event) => event.preventDefault()}
        draggable={false}
        style={{ width: "100%", height: "auto", aspectRatio: "1 / 1" }}
      />
    </div>
  );
}

function onBoardLoadedListener(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
