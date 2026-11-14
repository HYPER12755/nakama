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
  type CarromDiscKind,
  type CarromFrameDisc,
  type CarromPlayer,
  type CarromShotInput,
  type CarromShotResult,
  type CarromState,
} from "@moongames/carrom-core";
import {
  aimFromPoint,
  raycastBoard,
  sampleFrame,
  type AimHit,
  type AimMode,
} from "../lib/aim";
import type { Theme } from "../lib/theme";

const LOGICAL_SIZE = 1000;
const PLAY_INSET = 62;
const PLAY_SIZE = LOGICAL_SIZE - PLAY_INSET * 2;
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
}

export interface CarromBoardProps {
  state: CarromState;
  /** Striker position along the current player's baseline. */
  strikerPosition: number;
  animation: CarromShotResult | null;
  disabled: boolean;
  theme: Theme;
  aimMode: AimMode;
  onShoot: (shot: CarromShotInput) => void;
  onAnimationComplete: () => void;
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

function drawFrame(ctx: CanvasRenderingContext2D, lite: boolean): void {
  const frame = ctx.createLinearGradient(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);
  frame.addColorStop(0, "#6b4429");
  frame.addColorStop(0.35, "#4a2d1b");
  frame.addColorStop(0.72, "#331d12");
  frame.addColorStop(1, "#1d110a");
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

function drawSurface(ctx: CanvasRenderingContext2D, lite: boolean): void {
  const surface = ctx.createLinearGradient(
    PLAY_INSET,
    PLAY_INSET,
    PLAY_INSET + PLAY_SIZE,
    PLAY_INSET + PLAY_SIZE,
  );
  surface.addColorStop(0, "#e8c286");
  surface.addColorStop(0.35, "#dcae6d");
  surface.addColorStop(0.72, "#cb9553");
  surface.addColorStop(1, "#b87f42");
  roundedRect(ctx, PLAY_INSET, PLAY_INSET, PLAY_SIZE, PLAY_SIZE, 18);
  ctx.fillStyle = surface;
  ctx.fill();

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
      ? `rgba(122, 74, 32, ${0.05 + rng() * 0.09})`
      : `rgba(255, 233, 195, ${0.05 + rng() * 0.08})`;
    ctx.lineWidth = width;
    ctx.stroke();
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

function drawMarkings(ctx: CanvasRenderingContext2D, turn: CarromPlayer): void {
  const centre = LOGICAL_SIZE / 2;

  // Large outer circle around the opening medallion.
  ctx.beginPath();
  ctx.arc(centre, centre, scaleOf(CARROM_BOARD.outerCircleRadius), 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(92, 34, 22, 0.28)";
  ctx.lineWidth = 2.4;
  ctx.stroke();

  // Pockets. The hole is cut into the corner of the frame, so it is drawn a
  // little wider than the capture radius, with a deep well and a brass rim
  // that stay readable on a phone.
  const pocketRadius = scaleOf(CARROM_BOARD.pocketRadius) * 1.25;
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
      pocketRadius * 2,
    );
    shadow.addColorStop(0, "rgba(40, 19, 6, 0.46)");
    shadow.addColorStop(1, "rgba(40, 19, 6, 0)");
    ctx.beginPath();
    ctx.arc(x, y, pocketRadius * 2, 0, Math.PI * 2);
    ctx.fillStyle = shadow;
    ctx.fill();

    // Brass rim around the hole.
    ctx.beginPath();
    ctx.arc(x, y, pocketRadius + 8, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(228, 184, 106, 0.8)";
    ctx.lineWidth = 4;
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
    ctx.strokeStyle = "rgba(255, 228, 176, 0.26)";
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

function drawPiece(
  ctx: CanvasRenderingContext2D,
  kind: CarromDiscKind | "striker",
  x: number,
  y: number,
  radius: number,
  pocketed: boolean,
  animating: boolean,
  lite: boolean,
): void {
  if (pocketed && !animating) {
    return;
  }
  const scale = pocketed ? 0.42 : 1;
  const alpha = pocketed ? 0.4 : 1;

  const palette =
    kind === "striker"
      ? {
          top: "#fffaf0",
          mid: "#eadfc9",
          low: "#b8ab90",
          rim: "#6f6551",
          ring: "rgba(96, 86, 66, 0.45)",
        }
      : kind === "white"
        ? {
            top: "#fffdf4",
            mid: "#efe3c9",
            low: "#c3ab84",
            rim: "#8a7452",
            ring: "rgba(120, 96, 60, 0.4)",
          }
        : kind === "black"
          ? {
              top: "#4b4d50",
              mid: "#22252a",
              low: "#0d0f11",
              rim: "#050607",
              ring: "rgba(226, 214, 186, 0.34)",
            }
          : kind === "green"
            ? {
                top: "#7fd6ab",
                mid: "#2f7d55",
                low: "#14442c",
                rim: "#0b2a1c",
                ring: "rgba(214, 246, 226, 0.4)",
              }
            : kind === "yellow"
              ? {
                  top: "#f6d68c",
                  mid: "#c9932c",
                  low: "#8a5f12",
                  rim: "#5d3d08",
                  ring: "rgba(255, 244, 214, 0.45)",
                }
              : {
                  top: "#e4605a",
                  mid: QUEEN_RED,
                  low: "#74131c",
                  rim: "#4a0c12",
                  ring: "rgba(246, 206, 148, 0.6)",
                };

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;

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
    radius,
  );
  face.addColorStop(0, palette.top);
  face.addColorStop(0.52, palette.mid);
  face.addColorStop(1, palette.low);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = face;
  ctx.fill();

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
  mode: AimMode,
  hit: AimHit,
  lite: boolean,
): void {
  const originX = toCanvasX(display.striker.x);
  const originY = toCanvasY(display.striker.y);
  const strikerRadius = scaleOf(CARROM_BOARD.strikerRadius);
  const hitX = toCanvasX(hit.point.x);
  const hitY = toCanvasY(hit.point.y);

  ctx.save();
  ctx.lineCap = "round";

  // Pull band: where the finger pulled the striker back from.
  if (mode === "pull") {
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(toCanvasX(aim.pointer.x), toCanvasY(aim.pointer.y));
    ctx.strokeStyle = "rgba(255, 236, 196, 0.28)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Direction wash.
  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(hitX, hitY);
  ctx.strokeStyle = "rgba(72, 201, 176, 0.16)";
  ctx.lineWidth = 13;
  ctx.stroke();

  // Dashed guide along the launch direction.
  ctx.setLineDash([10, 11]);
  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(hitX, hitY);
  ctx.strokeStyle = "rgba(108, 238, 212, 0.95)";
  ctx.lineWidth = 2.8;
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrow head at the end of the guide.
  const dx = hitX - originX;
  const dy = hitY - originY;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const head = 15;
  ctx.beginPath();
  ctx.moveTo(hitX, hitY);
  ctx.lineTo(hitX - ux * head - uy * head * 0.5, hitY - uy * head + ux * head * 0.5);
  ctx.lineTo(hitX - ux * head + uy * head * 0.5, hitY - uy * head - ux * head * 0.5);
  ctx.closePath();
  ctx.fillStyle = "rgba(108, 238, 212, 0.92)";
  ctx.fill();

  // First contact ghost.
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

export function CarromBoard({
  state,
  strikerPosition,
  animation,
  disabled,
  theme,
  aimMode,
  onShoot,
  onAnimationComplete,
}: CarromBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef<number | null>(null);
  const completedRef = useRef<CarromShotResult | null>(null);
  const [aim, setAim] = useState<AimState | null>(null);
  const [dpr, setDpr] = useState(1);
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

      drawFrame(ctx, lite);
      drawSurface(ctx, lite);
      drawMarkings(ctx, display.turn);

      const radius = scaleOf(CARROM_BOARD.discRadius);
      for (const disc of display.discs) {
        if (disc.kind === "queen") {
          continue;
        }
        drawPiece(
          ctx,
          disc.kind,
          toCanvasX(disc.x),
          toCanvasY(disc.y),
          radius,
          disc.pocketed,
          animating,
          lite,
        );
      }
      const queen = display.discs.find((disc) => disc.kind === "queen");
      if (queen !== undefined) {
        drawPiece(
          ctx,
          "queen",
          toCanvasX(queen.x),
          toCanvasY(queen.y),
          radius,
          queen.pocketed,
          animating,
          lite,
        );
      }

      drawPiece(
        ctx,
        "striker",
        toCanvasX(display.striker.x),
        toCanvasY(display.striker.y),
        scaleOf(CARROM_BOARD.strikerRadius),
        display.striker.pocketed,
        animating,
        lite,
      );

      if (aimState !== null && !animating && !disabled) {
        const origin = { x: display.striker.x, y: display.striker.y };
        const hit = raycastBoard(origin, aimState.angle, display.discs);
        drawAim(ctx, display, aimState, aimMode, hit, lite);
      }
    },
    [dpr, lite, disabled, aimMode],
  );

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
    let frameId = 0;
    let cancelled = false;
    const started = performance.now();
    const tick = (now: number) => {
      if (cancelled) {
        return;
      }
      const elapsed = Math.min((now - started) / 1000, animation.duration);
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
          onAnimationComplete();
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
  }, [animation, drawScene, onAnimationComplete]);

  const pointFromEvent = (
    event: ReactPointerEvent<HTMLCanvasElement>,
    clamp: boolean,
  ): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    let x = ((event.clientX - rect.left) / rect.width) * LOGICAL_SIZE;
    let y = ((event.clientY - rect.top) / rect.height) * LOGICAL_SIZE;
    x = (x - PLAY_INSET) / PLAY_SIZE;
    y = (y - PLAY_INSET) / PLAY_SIZE;
    if (clamp) {
      x = Math.min(1, Math.max(0, x));
      y = Math.min(1, Math.max(0, y));
    } else if (x < 0 || x > 1 || y < 0 || y > 1) {
      return null;
    }
    return { x, y };
  };

  const aimAt = (point: { x: number; y: number }): AimState => {
    const origin = strikerPoint(state.turn, strikerPosition);
    const base = aimFromPoint(
      origin.x,
      origin.y,
      point,
      aimMode,
    );
    return { angle: base.angle, power: base.power, pointer: point };
  };

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (disabled || animation !== null) {
      return;
    }
    const point = pointFromEvent(event, false);
    if (point === null) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = event.pointerId;
    setAim(aimAt(point));
  };

  const handlePointerMove = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (draggingRef.current !== event.pointerId) {
      return;
    }
    const point = pointFromEvent(event, true);
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
      const point = pointFromEvent(event, true);
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
