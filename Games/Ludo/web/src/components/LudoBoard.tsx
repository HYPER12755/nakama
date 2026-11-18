import { useEffect, useRef } from "react";
import {
  PLAYER_COLOR_HEX,
  SAFE_SQUARES,
  START_INDEX,
  type LudoColor,
  type LudoMove,
  type LudoState,
  type LudoToken,
} from "@moongames/ludo-core";
import {
  GRID_SIZE,
  HOME_COLUMN,
  TRACK,
  tokenPoint,
  yardSpot,
} from "../lib/boardGeometry";

const CELL = 40;
const SIZE = GRID_SIZE * CELL;

export interface LudoBoardProps {
  state: LudoState;
  legalTokens: number[];
  lastMove?: LudoMove | null;
  onTokenClick: (token: number) => void;
  dark?: boolean;
}

const SHADE: Record<LudoColor, { light: string; dark: string }> = {
  red: { light: "#ff9a9a", dark: "#a83232" },
  green: { light: "#8ce0b4", dark: "#207a50" },
  yellow: { light: "#ffe489", dark: "#a37808" },
  blue: { light: "#9dc7ff", dark: "#2a5d9f" },
};

function center(point: readonly [number, number]): [number, number] {
  return [point[0] * CELL + CELL / 2, point[1] * CELL + CELL / 2];
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, width: number, height: number, radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawSquare(
  ctx: CanvasRenderingContext2D,
  point: readonly [number, number],
  fill: string,
  stroke: string,
): void {
  const x = point[0] * CELL;
  const y = point[1] * CELL;
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
  ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? 10 : 4.2;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawYard(
  ctx: CanvasRenderingContext2D,
  color: LudoColor,
  playerIndex: number,
  count: number,
): void {
  const origin = playerIndex === 0 ? [0, 0] : playerIndex === 1 ? [9, 0] : playerIndex === 2 ? [9, 9] : [0, 9];
  const [x, y] = [origin[0] * CELL, origin[1] * CELL];
  const base = PLAYER_COLOR_HEX[color];
  ctx.save();
  ctx.fillStyle = base;
  ctx.strokeStyle = SHADE[color].dark;
  ctx.lineWidth = 3;
  roundedRect(ctx, x + 6, y + 6, CELL * 6 - 12, CELL * 6 - 12, 18);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.88)";
  roundedRect(ctx, x + CELL + 6, y + CELL + 6, CELL * 4 - 12, CELL * 4 - 12, 12);
  ctx.fill();

  for (let token = 0; token < 4; token += 1) {
    const [cx, cy] = center(yardSpot(color, token));
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.fillStyle = token < count ? "#f4f1e8" : base;
    ctx.fill();
    ctx.strokeStyle = SHADE[color].dark;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - 4, cy - 4, 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fill();
  }
  ctx.restore();
}

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  color: string,
): void {
  ctx.beginPath();
  ctx.moveTo(...points[0]!);
  ctx.lineTo(...points[1]!);
  ctx.lineTo(...points[2]!);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "rgba(30,24,20,0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
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
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.shadowColor = "#ffe27a";
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.beginPath();
  ctx.arc(cx, cy + 2, 13, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fill();
  const gradient = ctx.createRadialGradient(cx - 5, cy - 6, 2, cx, cy, 14);
  gradient.addColorStop(0, SHADE[color].light);
  gradient.addColorStop(0.55, PLAYER_COLOR_HEX[color]);
  gradient.addColorStop(1, SHADE[color].dark);
  ctx.beginPath();
  ctx.arc(cx, cy, 13, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = "rgba(20,18,16,0.6)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - 4, cy - 5, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fill();
  ctx.restore();
}

export function LudoBoard({ state, legalTokens, lastMove, onTokenClick, dark = false }: LudoBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = SIZE * ratio;
    canvas.height = SIZE * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);

    ctx.fillStyle = dark ? "#161a24" : "#f7f2e7";
    ctx.fillRect(0, 0, SIZE, SIZE);

    // The four private yards, drawn first so the track sits on top of them.
    state.players.forEach((player, index) => {
      drawYard(ctx, player.color, index, player.tokens.filter((token) => token.location === "home").length);
    });

    // The 52 shared squares. Safe squares carry a star.
    TRACK.forEach((point, index) => {
      const isSafe = SAFE_SQUARES.includes(index);
      const isStart = Object.values(START_INDEX).includes(index);
      drawSquare(
        ctx,
        point,
        isSafe ? "#fff6d8" : dark ? "#2a3040" : "#ffffff",
        isStart ? "#7a6a4a" : dark ? "#4a5368" : "#b8ac96",
      );
      if (isSafe) {
        const [cx, cy] = center(point);
        drawStar(ctx, cx, cy, isStart ? "#d6a52a" : "#8a7f6a");
      }
    });

    // Each home lane is tinted by its owner and ends at the centre triangle.
    (Object.keys(HOME_COLUMN) as LudoColor[]).forEach((color) => {
      HOME_COLUMN[color].slice(0, 5).forEach((point) => {
        drawSquare(ctx, point, SHADE[color].light, SHADE[color].dark);
      });
    });

    drawTriangle(ctx, [[6 * CELL, 6 * CELL], [7 * CELL, 6 * CELL], [7 * CELL, 7 * CELL]], PLAYER_COLOR_HEX.red);
    drawTriangle(ctx, [[8 * CELL, 6 * CELL], [8 * CELL, 7 * CELL], [7 * CELL, 7 * CELL]], PLAYER_COLOR_HEX.green);
    drawTriangle(ctx, [[8 * CELL, 8 * CELL], [7 * CELL, 8 * CELL], [7 * CELL, 7 * CELL]], PLAYER_COLOR_HEX.yellow);
    drawTriangle(ctx, [[6 * CELL, 8 * CELL], [6 * CELL, 7 * CELL], [7 * CELL, 7 * CELL]], PLAYER_COLOR_HEX.blue);
    const middle = center([7, 7]);
    ctx.beginPath();
    ctx.arc(middle[0], middle[1], 11, 0, Math.PI * 2);
    ctx.fillStyle = dark ? "#f4eddc" : "#fffdf5";
    ctx.fill();
    ctx.strokeStyle = "#6b6254";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Mark the square of the last move.
    if (lastMove && state.players[lastMove.player]) {
      const color = state.players[lastMove.player]!.color;
      const point = lastMove.to <= 50
        ? TRACK[(START_INDEX[color] + lastMove.to) % TRACK.length]!
        : HOME_COLUMN[color][Math.min(5, lastMove.to - 51)]!;
      const [mx, my] = center(point);
      ctx.beginPath();
      ctx.arc(mx, my, 17, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const player of state.players) {
      for (const token of player.tokens) {
        const [cx, cy] = center(tokenPoint(player.color, token.progress, token.id));
        const legal = player.seat === state.current && legalTokens.includes(token.id);
        drawToken(ctx, cx, cy, player.color, legal);
      }
    }
  }, [state, legalTokens, lastMove, dark]);

  function handleClick(event: React.MouseEvent<HTMLCanvasElement>): void {
    if (legalTokens.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    // jsdom reports a zero-sized rectangle; the logical canvas is our fallback.
    const width = rect.width || SIZE;
    const height = rect.height || SIZE;
    const x = ((event.clientX - rect.left) / width) * SIZE;
    const y = ((event.clientY - rect.top) / height) * SIZE;
    const player = state.players[state.current];
    if (!player) return;
    let best: LudoToken | null = null;
    let bestDistance = 26 * 26;
    for (const token of player.tokens) {
      const [cx, cy] = center(tokenPoint(player.color, token.progress, token.id));
      const distance = (x - cx) ** 2 + (y - cy) ** 2;
      if (distance < bestDistance && legalTokens.includes(token.id)) {
        best = token;
        bestDistance = distance;
      }
    }
    if (best) onTokenClick(best.id);
  }

  return (
    <canvas
      ref={canvasRef}
      className="ludo-board"
      onClick={handleClick}
      role="img"
      aria-label="Ludo board with four colours, shared track and home columns"
      style={{ width: "100%", height: "auto", aspectRatio: "1 / 1" }}
    />
  );
}
