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
  baselineY,
  type CarromDiscKind,
  type CarromFrame,
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
} from "../lib/aim";
import type { Theme } from "../lib/theme";

const LOGICAL_SIZE = 1000;
const PLAY_INSET = 64;
const PLAY_SIZE = LOGICAL_SIZE - PLAY_INSET * 2;
const ACCENT = "#48c9b0";
const QUEEN_ACCENT = "#e25b55";

interface DisplayState {
  discs: readonly (CarromFrameDisc | CarromState["discs"][number])[];
  striker: { x: number; y: number; pocketed: boolean };
  turn: CarromPlayer;
}

interface AimState {
  angle: number;
  power: number;
}

export interface CarromBoardProps {
  state: CarromState;
  strikerX: number;
  animation: CarromShotResult | null;
  disabled: boolean;
  theme: Theme;
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

function drawBoard(
  ctx: CanvasRenderingContext2D,
  theme: Theme,
  lite: boolean,
  turn: CarromPlayer,
): void {
  ctx.clearRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

  // Outer wooden frame.
  const frame = ctx.createLinearGradient(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);
  if (theme === "light") {
    frame.addColorStop(0, "#8d5c35");
    frame.addColorStop(0.45, "#6c4227");
    frame.addColorStop(1, "#472718");
  } else {
    frame.addColorStop(0, "#6d4329");
    frame.addColorStop(0.45, "#47291a");
    frame.addColorStop(1, "#26140c");
  }
  roundedRect(ctx, 14, 14, 972, 972, 52);
  ctx.fillStyle = frame;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(225, 184, 112, 0.5)";
  ctx.stroke();

  // Inner bevel.
  roundedRect(ctx, 43, 43, 914, 914, 35);
  ctx.fillStyle = theme === "light" ? "#3c2418" : "#1d100a";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 222, 165, 0.18)";
  ctx.stroke();

  // Playing surface.
  const surface = ctx.createLinearGradient(PLAY_INSET, PLAY_INSET, 900, 900);
  if (theme === "light") {
    surface.addColorStop(0, "#efc887");
    surface.addColorStop(0.4, "#dfa95f");
    surface.addColorStop(0.75, "#cc8e46");
    surface.addColorStop(1, "#b97838");
  } else {
    surface.addColorStop(0, "#d9a461");
    surface.addColorStop(0.4, "#c88c4a");
    surface.addColorStop(0.75, "#ad7138");
    surface.addColorStop(1, "#8d572b");
  }
  roundedRect(ctx, PLAY_INSET, PLAY_INSET, PLAY_SIZE, PLAY_SIZE, 20);
  ctx.fillStyle = surface;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(78, 39, 17, 0.55)";
  ctx.stroke();

  ctx.save();
  roundedRect(ctx, PLAY_INSET, PLAY_INSET, PLAY_SIZE, PLAY_SIZE, 20);
  ctx.clip();

  // Deterministic wood grain.
  const grainLines = lite ? 10 : 24;
  ctx.lineWidth = 1;
  for (let index = 0; index < grainLines; index += 1) {
    const y = PLAY_INSET + ((index + 0.5) / grainLines) * PLAY_SIZE;
    ctx.beginPath();
    ctx.moveTo(PLAY_INSET - 10, y);
    ctx.bezierCurveTo(
      PLAY_INSET + PLAY_SIZE * 0.28,
      y + (index % 2 === 0 ? 7 : -6),
      PLAY_INSET + PLAY_SIZE * 0.7,
      y + (index % 3 === 0 ? -8 : 5),
      PLAY_INSET + PLAY_SIZE + 10,
      y,
    );
    ctx.strokeStyle =
      index % 4 === 0
        ? "rgba(255, 231, 190, 0.09)"
        : "rgba(83, 44, 20, 0.075)";
    ctx.stroke();
  }

  // Subtle vignette.
  const vignette = ctx.createRadialGradient(
    LOGICAL_SIZE / 2,
    LOGICAL_SIZE / 2,
    PLAY_SIZE * 0.24,
    LOGICAL_SIZE / 2,
    LOGICAL_SIZE / 2,
    PLAY_SIZE * 0.75,
  );
  vignette.addColorStop(0, "rgba(255, 246, 220, 0.04)");
  vignette.addColorStop(1, "rgba(54, 23, 8, 0.2)");
  ctx.fillStyle = vignette;
  ctx.fillRect(PLAY_INSET, PLAY_INSET, PLAY_SIZE, PLAY_SIZE);

  const centre = LOGICAL_SIZE / 2;
  const rosette = PLAY_SIZE * 0.116;

  // Centre rosette.
  ctx.strokeStyle = "rgba(105, 34, 31, 0.54)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(centre, centre, rosette, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(centre, centre, rosette * 0.74, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(105, 34, 31, 0.1)";
  ctx.strokeStyle = "rgba(105, 34, 31, 0.38)";
  ctx.lineWidth = 1.2;
  for (let index = 0; index < 8; index += 1) {
    const angle = (index * Math.PI) / 4;
    ctx.save();
    ctx.translate(centre, centre);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, -rosette * 0.48, rosette * 0.105, rosette * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(centre, centre, rosette * 0.17, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(105, 34, 31, 0.72)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 226, 173, 0.28)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Pockets.
  const pocketRadius = CARROM_BOARD.pocketRadius * PLAY_SIZE;
  for (const pocket of CARROM_BOARD.pocketCenters) {
    const x = toCanvasX(pocket.x);
    const y = toCanvasY(pocket.y);

    ctx.beginPath();
    ctx.arc(x, y, pocketRadius + 7, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(226, 181, 103, 0.55)";
    ctx.lineWidth = 3;
    ctx.stroke();

    const hole = ctx.createRadialGradient(
      x - pocketRadius * 0.28,
      y - pocketRadius * 0.28,
      pocketRadius * 0.05,
      x,
      y,
      pocketRadius,
    );
    hole.addColorStop(0, "#0a0806");
    hole.addColorStop(0.62, "#050403");
    hole.addColorStop(1, "#1c0f08");
    ctx.beginPath();
    ctx.arc(x, y, pocketRadius, 0, Math.PI * 2);
    ctx.fillStyle = hole;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "rgba(255, 218, 155, 0.18)";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, pocketRadius + 1.5, Math.PI * 1.08, Math.PI * 1.78);
    ctx.strokeStyle = "rgba(255, 230, 178, 0.16)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Base lines and end circles.
  const lineStart = toCanvasX(CARROM_BOARD.baselineMinX);
  const lineEnd = toCanvasX(CARROM_BOARD.baselineMaxX);
  for (const player of ["white", "black"] as const) {
    const y = toCanvasY(baselineY(player));
    const active = player === turn;
    if (active) {
      ctx.beginPath();
      ctx.moveTo(lineStart, y);
      ctx.lineTo(lineEnd, y);
      ctx.strokeStyle = "rgba(72, 201, 176, 0.24)";
      ctx.lineWidth = 12;
      ctx.stroke();
    }
    for (const offset of [-0.012, 0.012]) {
      ctx.beginPath();
      ctx.moveTo(lineStart, y + offset * PLAY_SIZE);
      ctx.lineTo(lineEnd, y + offset * PLAY_SIZE);
      ctx.strokeStyle = active
        ? "rgba(72, 201, 176, 0.7)"
        : "rgba(102, 36, 30, 0.64)";
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }
    const endRadius = PLAY_SIZE * 0.012;
    for (const x of [lineStart, lineEnd]) {
      ctx.beginPath();
      ctx.arc(x, y, endRadius, 0, Math.PI * 2);
      ctx.strokeStyle = active
        ? "rgba(72, 201, 176, 0.72)"
        : "rgba(102, 36, 30, 0.62)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Small brass screws in the frame.
  for (const [x, y] of [
    [31, 31],
    [969, 31],
    [31, 969],
    [969, 969],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(230, 191, 121, 0.55)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - 1, y - 1, 1.4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 241, 200, 0.55)";
    ctx.fill();
  }

  // Frame lettering.
  if (!lite) {
    ctx.fillStyle = "rgba(244, 216, 166, 0.52)";
    ctx.font = "600 13px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("MOONGAMES  ·  CARROM", LOGICAL_SIZE / 2, 976);
  }

  ctx.restore();
}

function discPalette(kind: CarromDiscKind): {
  outer: string;
  middle: string;
  inner: string;
  rim: string;
  detail: string;
} {
  switch (kind) {
    case "white":
      return {
        outer: "#fffdf4",
        middle: "#e8d8ba",
        inner: "#b59b74",
        rim: "#7d674b",
        detail: "rgba(88, 67, 40, 0.48)",
      };
    case "black":
      return {
        outer: "#5e5d56",
        middle: "#282927",
        inner: "#101110",
        rim: "#080908",
        detail: "rgba(224, 211, 184, 0.42)",
      };
    case "queen":
      return {
        outer: "#f07368",
        middle: "#b62a30",
        inner: "#73151c",
        rim: "#551017",
        detail: "rgba(255, 214, 161, 0.58)",
      };
  }
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
  const scale = pocketed ? 0.48 : 1;
  const alpha = pocketed ? 0.45 : 1;
  const palette =
    kind === "striker"
      ? {
          outer: "#fffaf0",
          middle: "#e4dac7",
          inner: "#bcae92",
          rim: "#7d745f",
          detail: "rgba(75, 67, 48, 0.46)",
        }
      : discPalette(kind);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;

  // Contact shadow. The lite path avoids a second blurred ellipse.
  ctx.beginPath();
  ctx.ellipse(
    radius * 0.12,
    radius * 0.34,
    radius * 0.95,
    radius * 0.58,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = "rgba(43, 21, 7, 0.32)";
  ctx.fill();

  const gradient = ctx.createRadialGradient(
    -radius * 0.35,
    -radius * 0.4,
    radius * 0.08,
    0,
    0,
    radius,
  );
  gradient.addColorStop(0, palette.outer);
  gradient.addColorStop(0.58, palette.middle);
  gradient.addColorStop(1, palette.inner);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.lineWidth = Math.max(1, radius * 0.085);
  ctx.strokeStyle = palette.rim;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.69, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(0.8, radius * 0.055);
  ctx.strokeStyle = palette.detail;
  ctx.stroke();

  if (kind === "striker") {
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.82, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1.2, radius * 0.075);
    ctx.strokeStyle = "rgba(72, 201, 176, 0.88)";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(72, 201, 176, 0.2)";
    ctx.fill();
    ctx.strokeStyle = "rgba(72, 201, 176, 0.8)";
    ctx.lineWidth = Math.max(0.8, radius * 0.05);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = palette.detail;
    ctx.fill();
    if (!lite) {
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.74, Math.PI * 1.08, Math.PI * 1.68);
      ctx.strokeStyle = "rgba(255, 249, 226, 0.38)";
      ctx.lineWidth = Math.max(0.8, radius * 0.06);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawAim(
  ctx: CanvasRenderingContext2D,
  display: DisplayState,
  aim: AimState,
  hit: AimHit,
  lite: boolean,
): void {
  const originX = toCanvasX(display.striker.x);
  const originY = toCanvasY(display.striker.y);
  const strikerRadius = CARROM_BOARD.strikerRadius * PLAY_SIZE;
  const hitX = toCanvasX(hit.point.x);
  const hitY = toCanvasY(hit.point.y);

  ctx.save();
  ctx.lineCap = "round";

  // Soft direction wash.
  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(hitX, hitY);
  ctx.strokeStyle = "rgba(72, 201, 176, 0.16)";
  ctx.lineWidth = 13;
  ctx.stroke();

  // Dashed guide.
  ctx.setLineDash([10, 11]);
  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(hitX, hitY);
  ctx.strokeStyle = "rgba(100, 236, 208, 0.92)";
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.setLineDash([]);

  // Contact ghost.
  ctx.beginPath();
  ctx.arc(hitX, hitY, strikerRadius, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(72, 201, 176, 0.09)";
  ctx.fill();
  ctx.strokeStyle = "rgba(100, 236, 208, 0.72)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Power ring around the striker.
  const ringRadius = strikerRadius * 2.2;
  ctx.beginPath();
  ctx.arc(originX, originY, ringRadius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(8, 17, 18, 0.42)";
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
  strikerX,
  animation,
  disabled,
  theme,
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
      drawBoard(ctx, theme, lite, display.turn);

      const radius = CARROM_BOARD.discRadius * PLAY_SIZE;
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
        CARROM_BOARD.strikerRadius * PLAY_SIZE,
        display.striker.pocketed,
        animating,
        lite,
      );

      if (aimState !== null && !animating && !disabled) {
        const origin = {
          x: display.striker.x,
          y: display.striker.y,
        };
        const hit = raycastBoard(origin, aimState.angle, display.discs);
        drawAim(ctx, display, aimState, hit, lite);
      }
    },
    [dpr, theme, lite, disabled],
  );

  useEffect(() => {
    if (animation !== null) {
      return;
    }
    drawScene(
      {
        discs: state.discs,
        striker: {
          x: strikerX,
          y: baselineY(state.turn),
          pocketed: false,
        },
        turn: state.turn,
      },
      aim,
      false,
    );
  }, [animation, state, strikerX, aim, drawScene]);

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
    const origin = {
      x: strikerX,
      y: baselineY(state.turn),
    };
    setAim(aimFromPoint(origin.x, origin.y, point));
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
    setAim(
      aimFromPoint(
        strikerX,
        baselineY(state.turn),
        point,
      ),
    );
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
        const nextAim = aimFromPoint(
          strikerX,
          baselineY(state.turn),
          point,
        );
        if (nextAim.power > 0.1) {
          onShoot({
            strikerX,
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
      aria-label="Carrom board. Drag across the board to aim and release to shoot."
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => finishPointer(event, true)}
      onPointerCancel={(event) => finishPointer(event, false)}
    />
  );
}
