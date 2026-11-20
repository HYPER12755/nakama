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
import { TOKEN_SETS } from "../lib/preferences";

const CELL = 40;
const SIZE = GRID_SIZE * CELL;
const BOARD_IMAGE = "boards/ludo-classic.jpg";
const ORNAMENT_IMAGE = "boards/ludo-ornaments.svg";

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

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function loadBoardImage(theme: string): Promise<void> {
  if (bitmaps.has(theme)) return Promise.resolve();
  if (boardPending !== null) return boardPending;
  boardPending = Promise.all([assetUrl(BOARD_IMAGE), assetUrl(ORNAMENT_IMAGE)])
    .then(([boardUrl, ornamentUrl]) => Promise.all([loadImage(boardUrl), loadImage(ornamentUrl)]))
    .then(([image, ornament]) => {
      if (!image) return;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(image, 0, 0, SIZE, SIZE);
      if (ornament) ctx.drawImage(ornament, 0, 0, SIZE, SIZE);
      // The supplied art is the only board. Older saved themes simply reuse it.
      bitmaps.set("classic", canvas);
      bitmaps.set(theme, canvas);
      boardPending = null;
      notify();
    })
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
  const meta = TOKEN_SETS.find((entry) => entry.id === set);
  const colourIndex = (["red", "green", "yellow", "blue"] as LudoColor[]).indexOf(color);
  const path = meta?.kind === "copied"
    ? `tokens-copied/${set}/token-${colourIndex + 1}.png`
    : `tokens/${set}-${color}.svg`;
  void assetUrl(path)
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
  angle: number,
): void {
  ctx.save();
  if (legal) {
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(12, 14, 24, 0.9)";
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 18, angle, angle + Math.PI * 1.25);
    ctx.strokeStyle = "#fff8d0";
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 18, angle + Math.PI, angle + Math.PI * 2.25);
    ctx.strokeStyle = "#9b8cff";
    ctx.lineWidth = 3.2;
    ctx.stroke();
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
  tokenSet = "regalia",
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
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [hintAngle, setHintAngle] = useState(0);
  const anim = useRef<{
    key: number;
    path: ReturnType<typeof movePath>;
  } | null>(null);
  const stepSound = useRef(onStep);
  stepSound.current = onStep;
  const playersRef = useRef(state.players);
  playersRef.current = state.players;

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
    if (moveKey === undefined || !lastMove) return;
    if (anim.current?.key === moveKey) return;
    const color = playersRef.current[lastMove.player]?.color;
    if (!color) return;
    const path = movePath(color, lastMove.from ?? -1, lastMove.to, lastMove.token);
    if (path.length === 0) return;
    anim.current = { key: moveKey, path };
    setStepIndex(0);
    stepSound.current?.();
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      if (index >= path.length) {
        window.clearInterval(timer);
        anim.current = null;
        setStepIndex(null);
        return;
      }
      anim.current = { key: moveKey, path };
      setStepIndex(index);
      stepSound.current?.();
    }, stepMs);
    return () => {
      window.clearInterval(timer);
      if (anim.current?.key === moveKey) {
        anim.current = null;
        setStepIndex(null);
      }
    };
  }, [moveKey, lastMove?.player, lastMove?.token, lastMove?.from, lastMove?.to, stepMs]);

  useEffect(() => {
    if (disabled || legalTokens.length === 0) {
      setHintAngle(0);
      return;
    }
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      if (now - last > 40) {
        last = now;
        setHintAngle((now / 1000) % (Math.PI * 2));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [disabled, legalTokens.length]);

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
          && stepIndex !== null
          && lastMove
          && lastMove.token === token.id
          && lastMove.player === player.seat;
        if (moving && anim.current) {
          [cx, cy] = centre(anim.current.path[Math.min(stepIndex!, anim.current.path.length - 1)]!);
        }
        const legal = showLegalMoves && !disabled
          && player.seat === state.current
          && legalTokens.includes(token.id);
        paintToken(
          ctx, cx, cy, player.color,
          tokenImage(tokenSet, player.color, () => setTick((value) => value + 1)),
          legal,
          hintAngle,
        );
      }
    }
  }, [state, legalTokens, lastMove, disabled, dpr, tick, stepIndex, hintAngle, tokenSet, boardTheme, showLegalMoves, highlightLastMove]);

  function handlePointer(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (event.pointerType === "mouse" && event.button !== 0) return;
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
        onPointerUp={handlePointer}
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
