import { useEffect, useRef, useState } from "react";
import { assetUrl } from "@moongames/game-sdk";
import {
  PLAYER_COLOR_HEX,
  START_INDEX,
  TRACK_LENGTH,
  type LudoColor,
  type LudoMove,
  type LudoToken,
  type LudoState,
} from "@moongames/ludo-core";
import { GRID_SIZE, HOME_COLUMN, TRACK, tokenPoint } from "../lib/boardGeometry";

const CELL = 40;
const SIZE = GRID_SIZE * CELL;
const BOARD_IMAGE = "boards/ludo-classic.jpg";

export interface LudoBoardProps {
  state: LudoState;
  legalTokens: number[];
  lastMove?: LudoMove | null;
  onTokenClick?: (token: number) => void;
  disabled?: boolean;
}

/** The shared SDK resolves bundle assets on web and through the host on file://. */
let boardImage: HTMLImageElement | null = null;
/** A once-scaled copy of the 1920px artwork; repainting the full-resolution
 * image on every token move is wasteful on a phone. */
let boardBitmap: HTMLCanvasElement | null = null;
let boardPending: Promise<void> | null = null;
const listeners = new Set<() => void>();

function loadBoardImage(): Promise<void> {
  if (boardImage !== null) return Promise.resolve();
  if (boardPending !== null) return boardPending;
  boardPending = assetUrl(BOARD_IMAGE)
    .then((url) => new Promise<void>((resolve) => {
      const image = new Image();
      image.onload = () => {
        const scaled = document.createElement("canvas");
        scaled.width = SIZE;
        scaled.height = SIZE;
        const ctx = scaled.getContext("2d");
        if (ctx) {
          ctx.drawImage(image, 0, 0, SIZE, SIZE);
          boardBitmap = scaled;
        }
        boardImage = image;
        for (const listener of listeners) listener();
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

function onBoardLoaded(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function centre(point: readonly [number, number]): [number, number] {
  return [point[0] * CELL + CELL / 2, point[1] * CELL + CELL / 2];
}

function drawToken(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: LudoColor,
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
  ctx.beginPath();
  ctx.ellipse(cx, cy + 3, 12, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(20, 18, 16, 0.32)";
  ctx.fill();
  const gradient = ctx.createRadialGradient(cx - 5, cy - 6, 2, cx, cy, 13);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.34, PLAYER_COLOR_HEX[color]);
  gradient.addColorStop(1, color === "yellow" ? "#a8800b" : "#8a2020");
  ctx.beginPath();
  ctx.arc(cx, cy, 12.5, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = "rgba(24, 20, 18, 0.62)";
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - 4, cy - 5, 3.4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  ctx.fill();
  ctx.restore();
}

export function LudoBoard({
  state,
  legalTokens,
  lastMove,
  onTokenClick,
  disabled = false,
}: LudoBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dpr, setDpr] = useState(1);
  const [imageTick, repaint] = useState(0);

  useEffect(() => onBoardLoaded(() => repaint((value) => value + 1)), []);
  useEffect(() => {
    void loadBoardImage();
    const update = () => setDpr(Math.min(window.devicePixelRatio || 1, 2));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

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

    // The provided board artwork is the table. Tokens and move hints are the
    // only things we draw on top of it, so the picture stays exactly as given.
    if (boardBitmap) ctx.drawImage(boardBitmap, 0, 0, SIZE, SIZE);
    else if (boardImage) ctx.drawImage(boardImage, 0, 0, SIZE, SIZE);

    if (lastMove && state.players[lastMove.player]) {
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
        const [cx, cy] = centre(tokenPoint(player.color, token.progress, token.id));
        const legal = !disabled
          && player.seat === state.current
          && legalTokens.includes(token.id);
        drawToken(ctx, cx, cy, player.color, legal);
      }
    }
  }, [state, legalTokens, lastMove, disabled, dpr, imageTick]);

  function handleClick(event: React.MouseEvent<HTMLCanvasElement>): void {
    if (disabled || legalTokens.length === 0 || !onTokenClick) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width || SIZE;
    const height = rect.height || SIZE;
    const x = ((event.clientX - rect.left) / width) * SIZE;
    const y = ((event.clientY - rect.top) / height) * SIZE;
    const player = state.players[state.current];
    if (!player) return;
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
        style={{ width: "100%", height: "auto", aspectRatio: "1 / 1" }}
      />
    </div>
  );
}
