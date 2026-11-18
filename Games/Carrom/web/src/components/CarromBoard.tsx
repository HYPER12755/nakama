import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  CARROM_BOARD,
  PLAYER_LABEL,
  baselineOf,
  strikerPoint,
  viewRotation,
  type CarromDiscKind,
  type CarromFrameDisc,
  type CarromPlayer,
  type CarromShotInput,
  type CarromShotResult,
  type CarromState,
} from "@moongames/carrom-core";
import {
  aimFromGesture,
  raycastBoard,
  sampleFrame,
  type AimHit,
  type AimMode,
} from "../lib/aim";
import {
  LOGICAL_SIZE,
  PLAY_INSET,
  PLAY_SIZE,
  screenToBoard,
} from "../lib/view";
import { shotPlaybackSeconds } from "../lib/playback";
import { assetUrl } from "@moongames/game-sdk";
import type { Theme } from "../lib/theme";
import {
  tableVisuals,
  type BoardDesign,
  type Palette,
  type PieceSet,
  type StrikerDesign,
  type TableVisuals,
} from "../lib/designs";

const ACCENT = "#48c9b0";
const QUEEN_RED = "#b3202b";

interface DisplayState {
  discs: readonly (CarromFrameDisc | CarromState["discs"][number])[];
  striker: { x: number; y: number; pocketed: boolean };
  turn: CarromPlayer;
}

interface AimState {
  angle: number;
  power: number;
  /** Pointer position in board coordinates, used to draw the pull band. */
  pointer: { x: number; y: number };
  /** Where the finger went down, the far end of the pull. */
  anchor: { x: number; y: number } | null;
}

export interface CarromBoardProps {
  state: CarromState;
  /** Striker position along the current player's baseline. */
  strikerPosition: number;
  animation: CarromShotResult | null;
  disabled: boolean;
  theme: Theme;
  aimMode: AimMode;
  /**
   * The player the table is turned towards. Their baseline is at the bottom
   * of the screen, so their striker is always at hand level.
   */
  view: CarromPlayer;
  onShoot: (shot: CarromShotInput) => void;
  onAnimationComplete: () => void;
  /** The board, striker and piece designs chosen in the preferences. */
  visuals?: TableVisuals;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function toCanvasX(value: number): number {
  return PLAY_INSET + value * PLAY_SIZE;
}

function toCanvasY(value: number): number {
  return PLAY_INSET + value * PLAY_SIZE;
}

function scaleOf(value: number): number {
  return value * PLAY_SIZE;
}

/** Deterministic pseudo random source so the texture never flickers. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  lite: boolean,
  board: BoardDesign,
): void {
  const frame = ctx.createLinearGradient(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);
  frame.addColorStop(0, board.frame[0]);
  frame.addColorStop(0.35, board.frame[1]);
  frame.addColorStop(0.72, board.frame[2]);
  frame.addColorStop(1, board.frame[3]);
  roundedRect(ctx, 8, 8, LOGICAL_SIZE - 16, LOGICAL_SIZE - 16, 46);
  ctx.fillStyle = frame;
  ctx.fill();

  ctx.save();
  roundedRect(ctx, 8, 8, LOGICAL_SIZE - 16, LOGICAL_SIZE - 16, 46);
  ctx.clip();

  // Rosewood streaks along the frame.
  const streaks = lite ? 26 : 58;
  const rng = random(0x5eed);
  for (let index = 0; index < streaks; index += 1) {
    const alongTop = index % 2 === 0;
    const position = rng();
    const length = 120 + rng() * 620;
    const start = rng() * (LOGICAL_SIZE - length);
    const offset = alongTop ? 14 + rng() * 34 : 14 + rng() * 34;
    ctx.beginPath();
    if (alongTop) {
      ctx.moveTo(start, offset);
      ctx.bezierCurveTo(
        start + length * 0.3,
        offset + (rng() - 0.5) * 10,
        start + length * 0.7,
        offset + (rng() - 0.5) * 10,
        start + length,
        offset,
      );
    } else {
      ctx.moveTo(offset, start);
      ctx.bezierCurveTo(
        offset + (rng() - 0.5) * 10,
        start + length * 0.3,
        offset + (rng() - 0.5) * 10,
        start + length * 0.7,
        offset,
        start + length,
      );
    }
    ctx.strokeStyle =
      rng() > 0.5
        ? "rgba(255, 226, 186, 0.07)"
        : "rgba(24, 12, 6, 0.22)";
    ctx.lineWidth = 0.8 + rng() * 1.6;
    ctx.stroke();
  }

  // Bevel: light on the top left, dark on the bottom right.
  const bevel = ctx.createLinearGradient(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);
  bevel.addColorStop(0, "rgba(255, 232, 196, 0.18)");
  bevel.addColorStop(0.5, "rgba(255, 232, 196, 0)");
  bevel.addColorStop(1, "rgba(0, 0, 0, 0.3)");
  ctx.fillStyle = bevel;
  ctx.fillRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);
  ctx.restore();

  // Inner bead that separates the frame from the playing surface.
  roundedRect(ctx, PLAY_INSET - 9, PLAY_INSET - 9, PLAY_SIZE + 18, PLAY_SIZE + 18, 26);
  ctx.strokeStyle = "rgba(233, 199, 143, 0.35)";
  ctx.lineWidth = 3;
  ctx.stroke();
  roundedRect(ctx, PLAY_INSET - 14, PLAY_INSET - 14, PLAY_SIZE + 28, PLAY_SIZE + 28, 30);
  ctx.strokeStyle = "rgba(12, 7, 4, 0.45)";
  ctx.lineWidth = 6;
  ctx.stroke();

  // Corner screws.
  for (const [x, y] of [
    [26, 26],
    [LOGICAL_SIZE - 26, 26],
    [26, LOGICAL_SIZE - 26],
    [LOGICAL_SIZE - 26, LOGICAL_SIZE - 26],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(214, 176, 112, 0.6)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - 1.4, y - 1.6, 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 244, 214, 0.55)";
    ctx.fill();
  }
}

// Real wood photographs and piece art, loaded once and kept for the table.
const textures = new Map<string, HTMLImageElement | null>();
const artImages = new Map<string, HTMLImageElement | null>();
const artListeners = new Set<() => void>();

/** Ask every board on the page to repaint when a chosen image arrives. */
function onArtLoaded(listener: () => void): () => void {
  artListeners.add(listener);
  return () => {
    artListeners.delete(listener);
  };
}

function imageLoaded(): void {
  for (const listener of artListeners) {
    listener();
  }
}

function pieceArtImage(path: string): HTMLImageElement | null {
  if (artImages.has(path)) {
    return artImages.get(path) ?? null;
  }
  if (typeof Image === "undefined") {
    return null;
  }
  const image = new Image();
  artImages.set(path, null);
  image.onload = () => {
    artImages.set(path, image);
    imageLoaded();
  };
  image.onerror = () => artImages.delete(path);
  void assetUrl(path)
    .then((url) => {
      image.src = url;
    })
    .catch(() => artImages.delete(path));
  return null;
}

function boardTexture(path: string): HTMLImageElement | null {
  if (textures.has(path)) {
    return textures.get(path) ?? null;
  }
  if (typeof Image === "undefined") {
    return null;
  }
  const image = new Image();
  textures.set(path, null);
  image.onload = () => {
    textures.set(path, image);
    imageLoaded();
  };
  image.onerror = () => textures.delete(path);
  void assetUrl(path)
    .then((url) => {
      image.src = url;
    })
    .catch(() => textures.delete(path));
  return null;
}

function drawSurface(
  ctx: CanvasRenderingContext2D,
  lite: boolean,
  board: BoardDesign,
): void {
  const surface = ctx.createLinearGradient(
    PLAY_INSET,
    PLAY_INSET,
    PLAY_INSET + PLAY_SIZE,
    PLAY_INSET + PLAY_SIZE,
  );
  surface.addColorStop(0, board.surface[0]);
  surface.addColorStop(0.35, board.surface[1]);
  surface.addColorStop(0.72, board.surface[2]);
  surface.addColorStop(1, board.surface[3]);
  roundedRect(ctx, PLAY_INSET, PLAY_INSET, PLAY_SIZE, PLAY_SIZE, 18);
  ctx.fillStyle = surface;
  ctx.fill();

  if (board.texture !== undefined && !lite) {
    const image = boardTexture(board.texture);
    if (image !== null) {
      ctx.save();
      roundedRect(ctx, PLAY_INSET, PLAY_INSET, PLAY_SIZE, PLAY_SIZE, 18);
      ctx.clip();
      ctx.globalAlpha = 0.72;
      ctx.drawImage(
        image,
        PLAY_INSET,
        PLAY_INSET,
        PLAY_SIZE,
        PLAY_SIZE,
      );
      ctx.restore();
    }
  }

  ctx.save();
  roundedRect(ctx, PLAY_INSET, PLAY_INSET, PLAY_SIZE, PLAY_SIZE, 18);
  ctx.clip();

  // Mango wood grain.
  const streaks = lite ? 26 : 74;
  const rng = random(0xc0ffee);
  for (let index = 0; index < streaks; index += 1) {
    const horizontal = index % 3 !== 0;
    const position = rng();
    const length = 180 + rng() * 900;
    const start = PLAY_INSET - 60 + rng() * (PLAY_SIZE + 120 - length);
    const offset = horizontal
      ? PLAY_INSET + position * PLAY_SIZE
      : PLAY_INSET + position * PLAY_SIZE;
    const width = 0.7 + rng() * 2.4;
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(start, offset);
      ctx.bezierCurveTo(
        start + length * 0.28,
        offset + (rng() - 0.5) * 16,
        start + length * 0.66,
        offset + (rng() - 0.5) * 16,
        start + length,
        offset + (rng() - 0.5) * 6,
      );
    } else {
      ctx.moveTo(offset, start);
      ctx.bezierCurveTo(
        offset + (rng() - 0.5) * 16,
        start + length * 0.28,
        offset + (rng() - 0.5) * 16,
        start + length * 0.66,
        offset + (rng() - 0.5) * 6,
        start + length,
      );
    }
    const dark = rng() > 0.45;
    ctx.strokeStyle = dark
      ? board.grain
      : `rgba(255, 233, 195, ${0.05 + rng() * 0.08})`;
    ctx.globalAlpha = dark ? 0.05 + rng() * 0.09 : 1;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // A couple of knots.
  for (let index = 0; index < (lite ? 1 : 3); index += 1) {
    const x = PLAY_INSET + (0.18 + index * 0.31) * PLAY_SIZE;
    const y = PLAY_INSET + (0.62 - index * 0.24) * PLAY_SIZE;
    for (let ring = 0; ring < 4; ring += 1) {
      ctx.beginPath();
      ctx.ellipse(
        x,
        y,
        6 + ring * 7,
        3 + ring * 3.4,
        0.4,
        0,
        Math.PI * 2,
      );
      ctx.strokeStyle = `rgba(112, 66, 28, ${0.13 - ring * 0.025})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }

  // Satin varnish sheen.
  const sheen = ctx.createLinearGradient(
    PLAY_INSET,
    PLAY_INSET,
    PLAY_INSET + PLAY_SIZE * 0.85,
    PLAY_INSET + PLAY_SIZE,
  );
  sheen.addColorStop(0, "rgba(255, 250, 232, 0.16)");
  sheen.addColorStop(0.45, "rgba(255, 250, 232, 0.02)");
  sheen.addColorStop(1, "rgba(74, 40, 14, 0.1)");
  ctx.fillStyle = sheen;
  ctx.fillRect(PLAY_INSET, PLAY_INSET, PLAY_SIZE, PLAY_SIZE);

  // Boric powder speckle keeps the surface from looking plastic.
  const speckles = lite ? 90 : 320;
  for (let index = 0; index < speckles; index += 1) {
    const x = PLAY_INSET + rng() * PLAY_SIZE;
    const y = PLAY_INSET + rng() * PLAY_SIZE;
    ctx.beginPath();
    ctx.arc(x, y, rng() * 0.9 + 0.3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 248, 232, ${0.05 + rng() * 0.09})`;
    ctx.fill();
  }

  // Inner shadow along the frame edge.
  const inner = ctx.createLinearGradient(
    PLAY_INSET,
    PLAY_INSET,
    PLAY_INSET + 46,
    PLAY_INSET + 46,
  );
  inner.addColorStop(0, "rgba(66, 32, 10, 0.28)");
  inner.addColorStop(1, "rgba(66, 32, 10, 0)");
  ctx.fillStyle = inner;
  ctx.fillRect(PLAY_INSET, PLAY_INSET, PLAY_SIZE, PLAY_SIZE);
  ctx.restore();
}

function drawMarkings(
  ctx: CanvasRenderingContext2D,
  turn: CarromPlayer,
  visuals?: TableVisuals,
): void {
  void visuals;
  const centre = LOGICAL_SIZE / 2;

  // Large outer circle around the opening medallion.
  ctx.beginPath();
  ctx.arc(centre, centre, scaleOf(CARROM_BOARD.outerCircleRadius), 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(92, 34, 22, 0.28)";
  ctx.lineWidth = 2.4;
  ctx.stroke();

  // Pockets. They are cut into the corners of the frame, so the hole is
  // clipped by the playing surface and can never float outside the table.
  // The drawn size is the real 4.45 cm hole, and a piece only drops when its
  // centre passes the rim.
  const pocketRadius = scaleOf(CARROM_BOARD.pocketRadius);
  ctx.save();
  roundedRect(ctx, PLAY_INSET, PLAY_INSET, PLAY_SIZE, PLAY_SIZE, 18);
  ctx.clip();
  for (const pocket of CARROM_BOARD.pocketCenters) {
    const x = toCanvasX(pocket.x);
    const y = toCanvasY(pocket.y);

    // The shadow the well casts on the board.
    const shadow = ctx.createRadialGradient(
      x,
      y,
      pocketRadius * 0.45,
      x,
      y,
      pocketRadius * 1.7,
    );
    shadow.addColorStop(0, "rgba(40, 19, 6, 0.4)");
    shadow.addColorStop(1, "rgba(40, 19, 6, 0)");
    ctx.beginPath();
    ctx.arc(x, y, pocketRadius * 1.7, 0, Math.PI * 2);
    ctx.fillStyle = shadow;
    ctx.fill();

    // Brass rim around the hole.
    ctx.beginPath();
    ctx.arc(x, y, pocketRadius + 7, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(228, 184, 106, 0.85)";
    ctx.lineWidth = 5;
    ctx.stroke();

    // The hole itself.
    const hole = ctx.createRadialGradient(
      x - pocketRadius * 0.28,
      y - pocketRadius * 0.28,
      pocketRadius * 0.08,
      x,
      y,
      pocketRadius,
    );
    hole.addColorStop(0, "#0b0806");
    hole.addColorStop(0.6, "#040302");
    hole.addColorStop(1, "#24130a");
    ctx.beginPath();
    ctx.arc(x, y, pocketRadius, 0, Math.PI * 2);
    ctx.fillStyle = hole;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255, 228, 176, 0.3)";
    ctx.stroke();

    // Light catching the far wall of the well.
    ctx.beginPath();
    ctx.arc(
      x,
      y,
      pocketRadius * 0.8,
      Math.PI * 0.85,
      Math.PI * 1.78,
    );
    ctx.strokeStyle = "rgba(255, 216, 154, 0.16)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.restore();

  // Baseline strips: two parallel lines per side, 3.8 cm apart. Every side
  // of the table has one, so four players can each play from their own edge.
  for (const player of ["white", "yellow", "black", "green"] as const) {
    const baseline = baselineOf(player);
    const half = scaleOf(CARROM_BOARD.baselineHalfWidth);
    const start =
      baseline.slideAxis === "x"
        ? toCanvasX(CARROM_BOARD.baselineMin)
        : toCanvasY(CARROM_BOARD.baselineMin);
    const end =
      baseline.slideAxis === "x"
        ? toCanvasX(CARROM_BOARD.baselineMax)
        : toCanvasY(CARROM_BOARD.baselineMax);
    const centre =
      baseline.slideAxis === "x"
        ? toCanvasY(baseline.linePosition)
        : toCanvasX(baseline.linePosition);
    const active = player === turn;
    for (const offset of [-half, half]) {
      ctx.beginPath();
      if (baseline.slideAxis === "x") {
        ctx.moveTo(start, centre + offset);
        ctx.lineTo(end, centre + offset);
      } else {
        ctx.moveTo(centre + offset, start);
        ctx.lineTo(centre + offset, end);
      }
      ctx.strokeStyle = active
        ? "rgba(38, 18, 10, 0.85)"
        : "rgba(38, 18, 10, 0.68)";
      ctx.lineWidth = active ? 2.6 : 2.1;
      ctx.stroke();
    }
  }

  // Red base circles closing the strips.
  for (const circle of CARROM_BOARD.baseCircles) {
    const x = toCanvasX(circle.x);
    const y = toCanvasY(circle.y);
    const radius = scaleOf(CARROM_BOARD.baseCircleRadius);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(150, 40, 34, 0.2)";
    ctx.fill();
    ctx.strokeStyle = "rgba(126, 32, 26, 0.8)";
    ctx.lineWidth = 2.4;
    ctx.stroke();
  }

  // Diagonal foul lines running from each base circle to its pocket, with a
  // 5 cm clearance from the pocket edge and an arrow head.
  for (const circle of CARROM_BOARD.baseCircles) {
    const pocket = CARROM_BOARD.pocketCenters.reduce((best, candidate) =>
      Math.hypot(candidate.x - circle.x, candidate.y - circle.y) <
      Math.hypot(best.x - circle.x, best.y - circle.y)
        ? candidate
        : best,
    );
    const dx = pocket.x - circle.x;
    const dy = pocket.y - circle.y;
    const length = Math.hypot(dx, dy);
    const ux = dx / length;
    const uy = dy / length;
    const clearance = CARROM_BOARD.pocketRadius + 0.0676;
    const stop = Math.max(0, length - clearance);

    const fromX = toCanvasX(circle.x);
    const fromY = toCanvasY(circle.y);
    const toX = fromX + ux * scaleOf(stop);
    const toY = fromY + uy * scaleOf(stop);

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = "rgba(40, 20, 12, 0.5)";
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Arrow head pointing at the pocket.
    const head = 9;
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - ux * head - uy * head * 0.55,
      toY - uy * head + ux * head * 0.55,
    );
    ctx.lineTo(
      toX - ux * head + uy * head * 0.55,
      toY - uy * head - ux * head * 0.55,
    );
    ctx.closePath();
    ctx.fillStyle = "rgba(40, 20, 12, 0.55)";
    ctx.fill();

    // Decorative arch at the start of the arrow.
    ctx.beginPath();
    ctx.arc(
      fromX,
      fromY,
      scaleOf(0.043),
      Math.atan2(uy, ux) - Math.PI / 2,
      Math.atan2(uy, ux) + Math.PI / 2,
    );
    ctx.strokeStyle = "rgba(40, 20, 12, 0.32)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // Red centre circle the size of one piece.
  ctx.beginPath();
  ctx.arc(
    centre,
    centre,
    scaleOf(CARROM_BOARD.centerCircleRadius),
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = "rgba(150, 40, 34, 0.22)";
  ctx.fill();
  ctx.strokeStyle = "rgba(126, 32, 26, 0.85)";
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Cross hair on the exact centre spot.
  const tick = scaleOf(0.012);
  ctx.beginPath();
  ctx.moveTo(centre - tick, centre);
  ctx.lineTo(centre + tick, centre);
  ctx.moveTo(centre, centre - tick);
  ctx.lineTo(centre, centre + tick);
  ctx.strokeStyle = "rgba(126, 32, 26, 0.75)";
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

/**
 * The pieces are painted once and then copied onto the table.
 *
 * A piece is a turned disc with a soft light on it, a ring of grain and a
 * few pores in the paint. Painting all of that for every piece on every
 * frame of every shot is what made the table stutter, so each piece is
 * drawn once into a small picture and then stamped onto the board.
 */
const pieceSprites = new Map<string, HTMLCanvasElement>();

function pieceSprite(
  kind: CarromDiscKind | "striker",
  radius: number,
  lite: boolean,
  variant: number,
  dpr: number,
  visuals: TableVisuals,
): HTMLCanvasElement {
  const key = [
    kind, radius, lite ? 1 : 0, variant, dpr,
    visuals.board.id, visuals.striker.id, visuals.pieces.id,
    visuals.paths.pucks ?? "", visuals.paths.strikers ?? "",
    visuals.paths.shine ?? "",
  ].join(":");
  const existing = pieceSprites.get(key);
  if (existing !== undefined) {
    return existing;
  }
  // The shadow reaches a little past the rim, so the picture is bigger than
  // the piece itself. It is painted at the pixel ratio of the screen, so the
  // piece stays sharp.
  const size = Math.ceil(radius * 2.6 * dpr);
  const sprite = document.createElement("canvas");
  sprite.width = size;
  sprite.height = size;
  const ctx = sprite.getContext("2d");
  if (ctx === null) {
    return sprite;
  }
  ctx.translate(size / 2, size / 2);
  ctx.scale(dpr, dpr);
  paintPiece(ctx, kind, radius, lite, variant, visuals);
  pieceSprites.set(key, sprite);
  return sprite;
}

/** A stable grain for a piece, taken from its id and not from where it sits. */
export function pieceGrain(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 4;
}

function drawPiece(
  ctx: CanvasRenderingContext2D,
  kind: CarromDiscKind | "striker",
  id: string,
  x: number,
  y: number,
  radius: number,
  pocketed: boolean,
  animating: boolean,
  lite: boolean,
  dpr: number,
  visuals: TableVisuals,
): void {
  if (pocketed && !animating) {
    return;
  }
  const scale = pocketed ? 0.42 : 1;
  const alpha = pocketed ? 0.4 : 1;
  // The grain is fixed to a piece, so the same piece always looks the same
  // while it travels across the board.
  const sprite = pieceSprite(kind, radius, lite, pieceGrain(id), dpr, visuals);
  const size = sprite.width;
  if (size === 0) {
    return;
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  // A piece that is going into a pocket is drawn smaller.
  const drawn = (pocketed ? size * scale : size) / dpr;
  ctx.drawImage(sprite, x - drawn / 2, y - drawn / 2, drawn, drawn);
  ctx.restore();
}

function paintPiece(
  ctx: CanvasRenderingContext2D,
  kind: CarromDiscKind | "striker",
  radius: number,
  lite: boolean,
  variant: number,
  visuals: TableVisuals,
): void {
  const fallback = visuals.pieces.pieces;
  const index =
    kind === "white" ? 0
    : kind === "black" ? 1
    : kind === "green" ? 2
    : kind === "yellow" ? 3
    : 4;
  const palette: Palette =
    kind === "striker"
      ? visuals.striker.palette
      : (fallback[index] ?? fallback[0]!);

  ctx.save();

  // Contact shadow on the wood.
  ctx.beginPath();
  ctx.ellipse(
    radius * 0.16,
    radius * 0.4,
    radius * 0.98,
    radius * 0.52,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = "rgba(48, 24, 8, 0.34)";
  ctx.fill();

  // Painted face with a soft top light.
  const face = ctx.createRadialGradient(
    -radius * 0.32,
    -radius * 0.38,
    radius * 0.06,
    0,
    0,
    radius,  );
  face.addColorStop(0, palette.top);
  face.addColorStop(0.52, palette.mid);
  face.addColorStop(1, palette.low);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = face;
  ctx.fill();

  // Real striker artwork from the game, clipped to the face when available.
  if (kind === "striker" && visuals.striker.image !== undefined) {
    const image = pieceArtImage(visuals.striker.image);
    if (image !== null) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(image, -radius, -radius, radius * 2, radius * 2);
      ctx.restore();
    }
  }

  // Real puck artwork from the game, clipped to the face of every man.
  if (kind !== "striker" && visuals.paths.pucks !== undefined) {
    const image = pieceArtImage(visuals.paths.pucks);
    if (image !== null) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(image, -radius, -radius, radius * 2, radius * 2);
      ctx.restore();
    }
  }

  // The grain of the wood under the paint. The pieces are turned on a lathe,
  // so the grain runs in rings around the middle.
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.clip();
  if (!lite) {
    // Every piece gets its own grain, and the same piece always gets the
    // same grain, so the table never flickers.
    const grain = random(0x9e3779b9 ^ (variant * 0x85ebca6b));
    const rings = kind === "striker" ? 7 : 5;
    for (let index = 0; index < rings; index += 1) {
      const ringRadius = radius * (0.16 + (index / rings) * 0.82);
      ctx.beginPath();
      ctx.ellipse(
        (grain() - 0.5) * radius * 0.14,
        (grain() - 0.5) * radius * 0.14,
        ringRadius,
        ringRadius * (0.94 + grain() * 0.12),
        grain() * 0.6 - 0.3,
        0,
        Math.PI * 2,
      );
      ctx.strokeStyle =
        grain() > 0.5
          ? "rgba(255, 244, 214, 0.07)"
          : "rgba(40, 22, 8, 0.09)";
      ctx.lineWidth = Math.max(0.5, radius * (0.03 + grain() * 0.035));
      ctx.stroke();
    }
    // A few pores in the paint.
    const pores = kind === "striker" ? 26 : 18;
    for (let index = 0; index < pores; index += 1) {
      const angle = grain() * Math.PI * 2;
      const distance = Math.sqrt(grain()) * radius * 0.94;
      ctx.beginPath();
      ctx.arc(
        Math.cos(angle) * distance,
        Math.sin(angle) * distance,
        radius * (0.012 + grain() * 0.022),
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = "rgba(30, 16, 6, 0.12)";
      ctx.fill();
    }
  }

  // A hand-picked face pattern: each striker reads as a different piece even
  // when two of them are close together.
  if (kind === "striker") {
    ctx.strokeStyle = palette.ring;
    ctx.fillStyle = palette.ring;
    ctx.lineWidth = Math.max(0.6, radius * 0.06);
    const pattern = visuals.striker.pattern;
    if (pattern === "ring") {
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.62, 0, Math.PI * 2);
      ctx.stroke();
    } else if (pattern === "cross") {
      ctx.beginPath();
      ctx.moveTo(-radius * 0.5, 0);
      ctx.lineTo(radius * 0.5, 0);
      ctx.moveTo(0, -radius * 0.5);
      ctx.lineTo(0, radius * 0.5);
      ctx.stroke();
    } else if (pattern === "star") {
      for (let index = 0; index < 4; index += 1) {
        const angle = (index * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * radius * 0.6, Math.sin(angle) * radius * 0.6);
        ctx.stroke();
      }
    } else if (pattern === "dots") {
      for (let index = 0; index < 6; index += 1) {
        const angle = (index * Math.PI) / 3;
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * radius * 0.55, Math.sin(angle) * radius * 0.55, radius * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (pattern === "spiral") {
      for (let index = 0; index < 18; index += 1) {
        const angle = index * 0.7;
        const distance = radius * 0.08 * index;
        if (distance > radius * 0.75) break;
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * distance, Math.sin(angle) * distance, radius * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();

  // The rounded edge of the piece: light from the top left, shade at the
  // bottom right, so the piece reads as a solid disc on the table.
  const bevel = ctx.createLinearGradient(
    -radius * 0.8,
    -radius * 0.8,
    radius * 0.8,
    radius * 0.8,
  );
  bevel.addColorStop(0, "rgba(255, 250, 236, 0.4)");
  bevel.addColorStop(0.42, "rgba(255, 250, 236, 0.06)");
  bevel.addColorStop(0.62, "rgba(24, 12, 4, 0.06)");
  bevel.addColorStop(1, "rgba(24, 12, 4, 0.34)");
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = bevel;
  ctx.fill();

  // A shine overlay from the real game, drawn over the striker face.
  if (kind === "striker" && visuals.paths.shine !== undefined) {
    const shine = pieceArtImage(visuals.paths.shine);
    if (shine !== null) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(shine, -radius, -radius, radius * 2, radius * 2);
      ctx.restore();
    }
  }

  // Bevelled rim.
  ctx.lineWidth = Math.max(1, radius * 0.1);
  ctx.strokeStyle = palette.rim;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.9, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(0.7, radius * 0.05);
  ctx.strokeStyle = palette.ring;
  ctx.stroke();

  // Engraved concentric rings.
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.62, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(0.6, radius * 0.045);
  ctx.strokeStyle = palette.ring;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = palette.ring;
  ctx.fill();

  if (kind === "queen") {
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.46, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(246, 214, 152, 0.85)";
    ctx.lineWidth = Math.max(0.9, radius * 0.06);
    ctx.stroke();
  }

  if (kind === "striker") {
    // The striker is a turned wooden disc with a metal band around it.
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.84, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(196, 160, 96, 0.85)";
    ctx.lineWidth = Math.max(1.2, radius * 0.09);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.84, Math.PI * 0.15, Math.PI * 0.95);
    ctx.strokeStyle = "rgba(255, 232, 176, 0.75)";
    ctx.lineWidth = Math.max(0.8, radius * 0.045);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.78, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(72, 201, 176, 0.9)";
    ctx.lineWidth = Math.max(1.1, radius * 0.075);
    ctx.stroke();
  } else if (!lite) {
    // Worn highlight on the upper rim.
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.78, Math.PI * 1.08, Math.PI * 1.72);
    ctx.strokeStyle = "rgba(255, 250, 234, 0.34)";
    ctx.lineWidth = Math.max(0.6, radius * 0.05);
    ctx.stroke();
  }

  ctx.restore();
}

function drawAim(
  ctx: CanvasRenderingContext2D,
  display: DisplayState,
  aim: AimState,
  hit: AimHit,
  lite: boolean,
  visuals: TableVisuals,
): void {
  const originX = toCanvasX(display.striker.x);
  const originY = toCanvasY(display.striker.y);
  const strikerRadius = scaleOf(CARROM_BOARD.strikerRadius);
  const hitX = toCanvasX(hit.point.x);
  const hitY = toCanvasY(hit.point.y);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  /**
   * One straight line, and only one.
   *
   * The line starts at the middle of the striker and runs along the launch
   * direction to the first thing the striker meets, with the arrow at that
   * far end. A pull defines that direction the other way round: the shot
   * leaves in the exact opposite of the pull, so the arrow is on the far
   * side of where the finger is.
   */
  const startX = originX;
  const startY = originY;
  const endX = hitX;
  const endY = hitY;

  // A real trail texture from the game, laid along the aim line.
  if (visuals.paths.trails !== undefined) {
    const trail = pieceArtImage(visuals.paths.trails);
    if (trail !== null) {
      const length = Math.hypot(endX - startX, endY - startY);
      const angle = Math.atan2(endY - startY, endX - startX);
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.translate(startX, startY);
      ctx.rotate(angle);
      ctx.drawImage(trail, 0, -9, length, 18);
      ctx.restore();
    }
  }

  // The soft wash under the line.
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.strokeStyle = "rgba(72, 201, 176, 0.16)";
  ctx.lineWidth = 13;
  ctx.stroke();

  // The line itself.
  ctx.setLineDash([10, 11]);
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.strokeStyle = "rgba(108, 238, 212, 0.95)";
  ctx.lineWidth = 2.8;
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrow head at the end the shot travels to.
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const head = 15;
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - ux * head - uy * head * 0.5, endY - uy * head + ux * head * 0.5);
  ctx.lineTo(endX - ux * head + uy * head * 0.5, endY - uy * head - ux * head * 0.5);
  ctx.closePath();
  ctx.fillStyle = "rgba(108, 238, 212, 0.92)";
  ctx.fill();

  // First contact ghost, where the striker meets the first piece.
  ctx.beginPath();
  ctx.arc(hitX, hitY, strikerRadius, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(72, 201, 176, 0.1)";
  ctx.fill();
  ctx.strokeStyle = "rgba(108, 238, 212, 0.78)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Power ring around the striker.
  const ringRadius = strikerRadius * 2.1;
  ctx.beginPath();
  ctx.arc(originX, originY, ringRadius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(12, 22, 22, 0.4)";
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(
    originX,
    originY,
    ringRadius,
    -Math.PI / 2,
    -Math.PI / 2 + Math.PI * 2 * aim.power,
  );
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 7;
  ctx.stroke();

  if (!lite) {
    ctx.beginPath();
    ctx.arc(originX, originY, ringRadius + 10, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(72, 201, 176, 0.18)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * The table itself: the frame, the wood, and the markings. It is always
 * painted the same way, whether it goes straight onto the canvas or into the
 * cached layer.
 */
function paintTable(
  ctx: CanvasRenderingContext2D,
  turn: CarromPlayer,
  lite: boolean,
  visuals: TableVisuals,
): void {
  drawFrame(ctx, lite, visuals.board);

  // A real frame texture from the game, laid over the wooden frame.
  if (visuals.paths.frames !== undefined) {
    const frameArt = pieceArtImage(visuals.paths.frames);
    if (frameArt !== null) {
      ctx.save();
      roundedRect(ctx, 8, 8, LOGICAL_SIZE - 16, LOGICAL_SIZE - 16, 46);
      ctx.clip();
      ctx.globalAlpha = 0.75;
      ctx.drawImage(frameArt, 8, 8, LOGICAL_SIZE - 16, LOGICAL_SIZE - 16);
      ctx.restore();
    }
  }

  drawSurface(ctx, lite, visuals.board);
  drawMarkings(ctx, turn, visuals);

  // A badge chosen from the game's badge art, shown in a corner of the table.
  if (visuals.paths.buff !== undefined) {
    const badge = pieceArtImage(visuals.paths.buff);
    if (badge !== null) {
      const size = scaleOf(0.06);
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.drawImage(badge, PLAY_INSET + 8, PLAY_INSET + 8, size, size);
      ctx.restore();
    }
  }

  // Pocket effects from the game, at each of the four wells.
  if (visuals.paths.pockets !== undefined) {
    const effect = pieceArtImage(visuals.paths.pockets);
    if (effect !== null) {
      const radius = scaleOf(CARROM_BOARD.pocketRadius) * 1.5;
      ctx.save();
      roundedRect(ctx, PLAY_INSET, PLAY_INSET, PLAY_SIZE, PLAY_SIZE, 18);
      ctx.clip();
      for (const pocket of CARROM_BOARD.pocketCenters) {
        const x = toCanvasX(pocket.x);
        const y = toCanvasY(pocket.y);
        ctx.drawImage(effect, x - radius, y - radius, radius * 2, radius * 2);
      }
      ctx.restore();
    }
  }
}

/**
 * The frame, the wood, and the markings never change during a shot, so they
 * are painted once into an offscreen canvas and then copied onto the table.
 * Painting them again for every animation frame is what made the table lag.
 */
function renderBoardLayer(
  layer: HTMLCanvasElement,
  turn: CarromPlayer,
  lite: boolean,
  dpr: number,
  visuals: TableVisuals,
): void {
  const ctx = layer.getContext("2d");
  if (ctx === null) {
    return;
  }
  // The layer is painted in the same logical units as the table, so it has
  // to carry the same pixel ratio as the canvas it is copied onto.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, layer.width, layer.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintTable(ctx, turn, lite, visuals);
}

export function CarromBoard({
  state,
  strikerPosition,
  animation,
  disabled,
  theme,
  aimMode,
  view,
  onShoot,
  onAnimationComplete,
  visuals = tableVisuals("tournament", "brass", "standard"),
}: CarromBoardProps) {
  const visualsRef = useRef(visuals);
  visualsRef.current = visuals;
  // All three chosen designs, so the board repaints the moment one changes.
  const visualKey = [
    visuals.board.id,
    visuals.striker.id,
    visuals.pieces.id,
    ...Object.values(visuals.paths),
  ].join(":");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef<number | null>(null);
  const dragAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const completedRef = useRef<CarromShotResult | null>(null);
  const [aim, setAim] = useState<AimState | null>(null);
  const [dpr, setDpr] = useState(1);
  // The table turns so the player sits at the bottom of the screen. The
  // rotation is kept in a ref so the aim follows the finger while it turns.
  const rotationRef = useRef(0);
  const rotationFromRef = useRef(0);
  const rotationToRef = useRef(0);
  const rotationFrameRef = useRef(0);
  const sceneRef = useRef<{
    display: DisplayState;
    aimState: AimState | null;
    animating: boolean;
  } | null>(null);
  /** The painted table, copied onto the canvas for every frame. */
  const boardLayerRef = useRef<HTMLCanvasElement | null>(null);
  const boardLayerKeyRef = useRef<string>("");
  // The shot callback is read through a ref so that a new callback never
  // restarts a shot that is already running.
  const onCompleteRef = useRef(onAnimationComplete);
  onCompleteRef.current = onAnimationComplete;
  const lite =
    typeof document !== "undefined" &&
    document.documentElement.dataset.moonperf === "lite";

  useEffect(() => {
    const update = () => {
      const limit = lite ? 1.4 : 2;
      setDpr(Math.min(window.devicePixelRatio || 1, limit));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [lite]);

  useEffect(() => {
    if (animation !== null) {
      setAim(null);
      draggingRef.current = null;
    }
  }, [animation]);

  // A new turn means a new striker, so an aim that is still being dragged is
  // dropped rather than carried over.
  useEffect(() => {
    setAim(null);
    draggingRef.current = null;
    dragAnchorRef.current = null;
  }, [state.turn]);

  useEffect(() => {
    if (disabled) {
      setAim(null);
      draggingRef.current = null;
    }
  }, [disabled]);

  const drawScene = useCallback(
    (
      display: DisplayState,
      aimState: AimState | null,
      animating: boolean,
    ) => {
      const canvas = canvasRef.current;
      if (canvas === null) {
        return;
      }
      sceneRef.current = { display, aimState, animating };
      const pixelSize = Math.round(LOGICAL_SIZE * dpr);
      if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
        canvas.width = pixelSize;
        canvas.height = pixelSize;
      }
      const ctx = canvas.getContext("2d");
      if (ctx === null) {
        return;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

      // The table is turned so the player sits at the bottom of the screen.
      const centre = LOGICAL_SIZE / 2;
      ctx.save();
      ctx.translate(centre, centre);
      ctx.rotate(rotationRef.current);
      ctx.translate(-centre, -centre);

      // The wood is copied from the cached layer, so a shot does not repaint
      // the grain of the table sixty times a second.
      const layer = boardLayerRef.current;
      if (layer !== null && layer.width === pixelSize) {
        ctx.drawImage(layer, 0, 0, LOGICAL_SIZE, LOGICAL_SIZE);
      } else {
        paintTable(ctx, display.turn, lite, visualsRef.current);
      }

      const radius = scaleOf(CARROM_BOARD.discRadius);
      for (const disc of display.discs) {
        if (disc.kind === "queen") {
          continue;
        }
        drawPiece(
          ctx,
          disc.kind,
          disc.id,
          toCanvasX(disc.x),
          toCanvasY(disc.y),
          radius,
          disc.pocketed,
          animating,
          lite,
          dpr,
          visualsRef.current,
        );
      }
      const queen = display.discs.find((disc) => disc.kind === "queen");
      if (queen !== undefined) {
        drawPiece(
          ctx,
          "queen",
          queen.id,
          toCanvasX(queen.x),
          toCanvasY(queen.y),
          radius,
          queen.pocketed,
          animating,
          lite,
          dpr,
          visualsRef.current,
        );
      }

      drawPiece(
        ctx,
        "striker",
        "striker",
        toCanvasX(display.striker.x),
        toCanvasY(display.striker.y),
        scaleOf(CARROM_BOARD.strikerRadius),
        display.striker.pocketed,
        animating,
        lite,
        dpr,
        visualsRef.current,
      );

      if (aimState !== null && !animating && !disabled) {
        const origin = { x: display.striker.x, y: display.striker.y };
        const hit = raycastBoard(origin, aimState.angle, display.discs);
        drawAim(ctx, display, aimState, hit, lite, visualsRef.current);
      }
      ctx.restore();
    },
    [dpr, lite, disabled, aimMode, visualKey],
  );

  // A chosen image arrives after the first paint. Redraw the cached table and
  // the pieces as soon as it does, so the player sees their pick at once.
  useEffect(
    () =>
      onArtLoaded(() => {
        boardLayerKeyRef.current = "";
        const scene = sceneRef.current;
        if (scene !== null) {
          drawScene(scene.display, scene.aimState, scene.animating);
        }
      }),
    [drawScene],
  );

  /**
   * Turn the table towards a player. The turn is animated so the table
   * swings round instead of jumping, and the aim keeps working while it
   * moves.
   */
  const turnTableTo = useCallback(
    (player: CarromPlayer) => {
      const target = viewRotation(player);
      const current = rotationRef.current;
      let delta = target - current;
      while (delta > Math.PI) {
        delta -= Math.PI * 2;
      }
      while (delta < -Math.PI) {
        delta += Math.PI * 2;
      }
      if (Math.abs(delta) < 0.002) {
        return;
      }
      rotationFromRef.current = current;
      rotationToRef.current = current + delta;
      cancelAnimationFrame(rotationFrameRef.current);
      const started = performance.now();
      const duration = 360;
      const tick = (now: number) => {
        const progress = Math.min(1, (now - started) / duration);
        const eased =
          progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        rotationRef.current =
          rotationFromRef.current +
          (rotationToRef.current - rotationFromRef.current) * eased;
        const scene = sceneRef.current;
        if (scene !== null) {
          drawScene(scene.display, scene.aimState, scene.animating);
        }
        if (progress < 1) {
          rotationFrameRef.current = requestAnimationFrame(tick);
        } else {
          rotationRef.current = rotationToRef.current;
        }
      };
      rotationFrameRef.current = requestAnimationFrame(tick);
    },
    [drawScene],
  );

  useEffect(() => {
    turnTableTo(view);
  }, [turnTableTo, view]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rotationFrameRef.current);
    };
  }, []);

  /**
   * The table is painted once and kept, until the turn changes or the
   * device pixel ratio does.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const pixelSize = Math.round(LOGICAL_SIZE * dpr);
    const key = `${lite}:${dpr}:${state.turn}:${visualKey}`;
    if (boardLayerKeyRef.current === key && boardLayerRef.current !== null) {
      return;
    }
    let layer = boardLayerRef.current;
    if (layer === null) {
      layer = document.createElement("canvas");
      boardLayerRef.current = layer;
    }
    layer.width = pixelSize;
    layer.height = pixelSize;
    const ctx = layer.getContext("2d");
    if (ctx === null) {
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderBoardLayer(layer, state.turn, lite, dpr, visualsRef.current);
    boardLayerKeyRef.current = key;
    // The table on the screen is now one layer behind.
    const scene = sceneRef.current;
    if (scene !== null) {
      drawScene(scene.display, scene.aimState, scene.animating);
    }
  }, [dpr, lite, state.turn, visualKey, drawScene]);

  /**
   * A canvas that changes size is cleared by the browser, and the table would
   * go black until the next shot. The board is painted again whenever the
   * canvas is resized, which happens when the layout changes, for example
   * when a scrollbar appears because the sidebar grew.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      const scene = sceneRef.current;
      if (scene !== null) {
        drawScene(scene.display, scene.aimState, scene.animating);
      }
    });
    observer.observe(canvas);
    const repaint = () => {
      const scene = sceneRef.current;
      if (scene !== null) {
        drawScene(scene.display, scene.aimState, scene.animating);
      }
    };
    window.addEventListener("resize", repaint);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", repaint);
    };
  }, [drawScene]);

  useEffect(() => {
    if (animation !== null) {
      return;
    }
    const point = strikerPoint(state.turn, strikerPosition);
    drawScene(
      {
        discs: state.discs,
        striker: {
          x: point.x,
          y: point.y,
          pocketed: false,
        },
        turn: state.turn,
      },
      aim,
      false,
    );
  }, [animation, state, strikerPosition, aim, drawScene]);

  useEffect(() => {
    if (animation === null) {
      completedRef.current = null;
      return;
    }
    // The callback is read through a ref. If it changed identity the shot
    // would start again from the first frame and never finish.
    let frameId = 0;
    let cancelled = false;
    const started = performance.now();
    // The shot is played slower than it happens, so the striker can be seen.
    const total = shotPlaybackSeconds(animation.duration);
    const tick = (now: number) => {
      if (cancelled) {
        return;
      }
      const elapsed = Math.min(
        ((now - started) / 1000) * (animation.duration / total),
        animation.duration,
      );
      const frame = sampleFrame(animation.frames, elapsed);
      if (frame !== null) {
        drawScene(
          {
            discs: frame.discs,
            striker: frame.striker,
            turn: animation.outcome.player,
          },
          null,
          true,
        );
      }
      if (elapsed >= animation.duration) {
        if (completedRef.current !== animation) {
          completedRef.current = animation;
          onCompleteRef.current();
        }
        return;
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [animation, drawScene]);

  /**
   * The pointer is read in board coordinates and never clamped: the aim has
   * to keep following the finger when it leaves the table. The table may be
   * turned, so the pointer is turned back before it is used.
   */
  const pointFromEvent = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    const screenX =
      ((event.clientX - rect.left) / rect.width) * LOGICAL_SIZE;
    const screenY =
      ((event.clientY - rect.top) / rect.height) * LOGICAL_SIZE;
    // The table may be turned, so the pointer is turned back before it is
    // used.
    return screenToBoard(screenX, screenY, rotationRef.current);
  };

  const aimAt = (point: { x: number; y: number }): AimState => {
    const origin = strikerPoint(state.turn, strikerPosition);
    const anchor = dragAnchorRef.current ?? origin;
    const base = aimFromGesture(anchor, point, origin, aimMode);
    return {
      angle: base.angle,
      power: base.power,
      pointer: point,
      anchor: dragAnchorRef.current,
    };
  };

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (disabled || animation !== null) {
      return;
    }
    const point = pointFromEvent(event);
    if (point === null) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = event.pointerId;
    // The gesture is anchored where the finger went down, so pulling back and
    // then re-aiming both feel right.
    dragAnchorRef.current = point;
    setAim(aimAt(point));
  };

  const handlePointerMove = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (draggingRef.current !== event.pointerId) {
      return;
    }
    const point = pointFromEvent(event);
    if (point === null) {
      return;
    }
    setAim(aimAt(point));
  };

  const finishPointer = (
    event: ReactPointerEvent<HTMLCanvasElement>,
    shoot: boolean,
  ) => {
    if (draggingRef.current !== event.pointerId) {
      return;
    }
    draggingRef.current = null;
    if (shoot) {
      const point = pointFromEvent(event);
      if (point !== null) {
        const nextAim = aimAt(point);
        if (nextAim.power > 0.1) {
          onShoot({
            position: strikerPosition,
            angle: nextAim.angle,
            power: nextAim.power,
          });
        }
      }
    }
    dragAnchorRef.current = null;
    setAim(null);
  };

  return (
    <canvas
      ref={canvasRef}
      className="carrom-canvas"
      role="img"
      aria-label="Carrom board. Drag to pull the striker back and release to shoot."
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => finishPointer(event, true)}
      onPointerCancel={(event) => finishPointer(event, false)}
    />
  );
}
