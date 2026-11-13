import {
  CARROM_BOARD,
  baselineY,
  type CarromFrame,
  type CarromFrameDisc,
  type CarromPoint,
  type CarromPlayer,
} from "@moongames/carrom-core";

export function powerFromDistance(distance: number): number {
  return Math.min(1, Math.max(0.08, distance / 0.38));
}

export function aimFromPoint(
  strikerX: number,
  strikerY: number,
  point: CarromPoint,
): { angle: number; power: number } {
  const dx = point.x - strikerX;
  const dy = point.y - strikerY;
  return {
    angle: Math.atan2(dy, dx),
    power: powerFromDistance(Math.hypot(dx, dy)),
  };
}

export function strikerPoint(
  player: CarromPlayer,
  strikerX: number,
): CarromPoint {
  return { x: strikerX, y: baselineY(player) };
}

export interface AimHit {
  point: CarromPoint;
  distance: number;
  kind: "disc" | "wall";
}

/**
 * Trace the striker centre until it reaches the first disc or the frame.
 * The board uses this for the ghost contact marker and aim guide.
 */
export function raycastBoard(
  origin: CarromPoint,
  angle: number,
  discs: readonly Pick<CarromFrameDisc, "x" | "y" | "pocketed">[],
): AimHit {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const radius = CARROM_BOARD.strikerRadius;
  let bestDistance = Number.POSITIVE_INFINITY;
  let kind: "disc" | "wall" = "wall";

  for (const disc of discs) {
    if (disc.pocketed) {
      continue;
    }
    const ox = disc.x - origin.x;
    const oy = disc.y - origin.y;
    const projection = ox * dx + oy * dy;
    if (projection < 0) {
      continue;
    }
    const perpendicularSquared = ox * ox + oy * oy - projection * projection;
    const combined = CARROM_BOARD.discRadius + radius;
    if (perpendicularSquared > combined * combined) {
      continue;
    }
    const offset = Math.sqrt(Math.max(0, combined * combined - perpendicularSquared));
    const distance = projection - offset;
    if (distance > 0.0001 && distance < bestDistance) {
      bestDistance = distance;
      kind = "disc";
    }
  }

  const wallDistance = (direction: number, start: number, limit: number) => {
    if (Math.abs(direction) < 0.000001) {
      return Number.POSITIVE_INFINITY;
    }
    const value = (limit - start) / direction;
    return value > 0.0001 ? value : Number.POSITIVE_INFINITY;
  };
  const walls = [
    wallDistance(dx, origin.x, radius),
    wallDistance(dx, origin.x, 1 - radius),
    wallDistance(dy, origin.y, radius),
    wallDistance(dy, origin.y, 1 - radius),
  ];
  for (const distance of walls) {
    if (distance < bestDistance) {
      bestDistance = distance;
      kind = "wall";
    }
  }

  if (!Number.isFinite(bestDistance)) {
    bestDistance = 0.5;
  }
  return {
    point: {
      x: origin.x + dx * bestDistance,
      y: origin.y + dy * bestDistance,
    },
    distance: bestDistance,
    kind,
  };
}

export function sampleFrame(
  frames: readonly CarromFrame[],
  time: number,
): CarromFrame | null {
  if (frames.length === 0) {
    return null;
  }
  const first = frames[0]!;
  if (time <= first.time) {
    return first;
  }
  const last = frames[frames.length - 1]!;
  if (time >= last.time) {
    return last;
  }

  let low = 0;
  let high = frames.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (frames[middle]!.time <= time) {
      low = middle;
    } else {
      high = middle;
    }
  }
  const before = frames[low]!;
  const after = frames[high]!;
  const span = after.time - before.time;
  const amount = span <= 0 ? 1 : (time - before.time) / span;
  const discs = before.discs.map((disc, index) => {
    const next = after.discs[index] ?? disc;
    return {
      ...disc,
      x: disc.x + (next.x - disc.x) * amount,
      y: disc.y + (next.y - disc.y) * amount,
      pocketed: disc.pocketed || next.pocketed,
    };
  });
  return {
    time,
    discs,
    striker: {
      x:
        before.striker.x +
        (after.striker.x - before.striker.x) * amount,
      y:
        before.striker.y +
        (after.striker.y - before.striker.y) * amount,
      pocketed: before.striker.pocketed || after.striker.pocketed,
    },
  };
}
