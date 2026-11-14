import {
  CARROM_BOARD,
  nearestValidStrikerPosition,
  strikerFits,
  strikerPoint,
  strikerSkin,
} from "./board";
import type {
  CarromDisc,
  CarromFrame,
  CarromFrameDisc,
  CarromImpactEvent,
  CarromPhysicsEvent,
  CarromPhysicsResult,
  CarromPocketEvent,
  CarromPoint,
  CarromShotInput,
  CarromSimulationOptions,
  CarromState,
} from "./types";

export class CarromShotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CarromShotError";
  }
}

type BodyKind = CarromDisc["kind"] | "striker";

interface Body {
  id: string;
  kind: BodyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  inverseMass: number;
  active: boolean;
  pocketed: boolean;
}

const STEP_SECONDS = CARROM_BOARD.stepSeconds;
const SAMPLE_EVERY = Math.max(
  1,
  Math.round(CARROM_BOARD.sampleSeconds / STEP_SECONDS),
);

export function findPocketAt(x: number, y: number): CarromPoint | null {
  for (const pocket of CARROM_BOARD.pocketCenters) {
    if (
      Math.hypot(x - pocket.x, y - pocket.y) <= CARROM_BOARD.captureRadius
    ) {
      return { x: pocket.x, y: pocket.y };
    }
  }
  return null;
}

export function validateShot(
  state: CarromState,
  shot: CarromShotInput,
): string | null {
  if (state.status !== "aiming") {
    return "The match is finished.";
  }
  if (
    !Number.isFinite(shot.position) ||
    !Number.isFinite(shot.angle) ||
    !Number.isFinite(shot.power)
  ) {
    return "The shot contains an invalid value.";
  }
  if (
    shot.position < CARROM_BOARD.baselineMin - 0.000001 ||
    shot.position > CARROM_BOARD.baselineMax + 0.000001
  ) {
    return "Place the striker inside the baseline.";
  }
  if (shot.power < 0.01 || shot.power > 1) {
    return "Choose a shot strength between 1% and 100%.";
  }
  if (!strikerFits(state, shot.position)) {
    return "The striker is blocked. Move it along the baseline.";
  }
  return null;
}

function bodyFromDisc(disc: CarromDisc): Body {
  return {
    id: disc.id,
    kind: disc.kind,
    x: disc.x,
    y: disc.y,
    vx: 0,
    vy: 0,
    radius: CARROM_BOARD.discRadius,
    inverseMass: 1 / CARROM_BOARD.discMass,
    active: !disc.pocketed,
    pocketed: disc.pocketed,
  };
}

function frameDisc(body: Body): CarromFrameDisc {
  return {
    id: body.id,
    kind: body.kind as CarromDisc["kind"],
    x: body.x,
    y: body.y,
    pocketed: body.pocketed,
  };
}

function captureFrame(
  time: number,
  discs: Body[],
  striker: Body,
): CarromFrame {
  return {
    time,
    discs: discs.map(frameDisc),
    striker: {
      x: striker.x,
      y: striker.y,
      pocketed: striker.pocketed,
    },
  };
}

function maxSpeed(bodies: Body[]): number {
  let maximum = 0;
  for (const body of bodies) {
    if (!body.active) {
      continue;
    }
    maximum = Math.max(maximum, Math.hypot(body.vx, body.vy));
  }
  return maximum;
}

function resolveWall(body: Body): void {
  const minimum = body.radius;
  const maximum = 1 - body.radius;
  if (body.x < minimum) {
    body.x = minimum;
    body.vx = Math.abs(body.vx) * CARROM_BOARD.wallRestitution;
  } else if (body.x > maximum) {
    body.x = maximum;
    body.vx = -Math.abs(body.vx) * CARROM_BOARD.wallRestitution;
  }
  if (body.y < minimum) {
    body.y = minimum;
    body.vy = Math.abs(body.vy) * CARROM_BOARD.wallRestitution;
  } else if (body.y > maximum) {
    body.y = maximum;
    body.vy = -Math.abs(body.vy) * CARROM_BOARD.wallRestitution;
  }
}

function collide(
  left: Body,
  right: Body,
  time: number,
  events: CarromPhysicsEvent[],
): void {
  if (!left.active || !right.active) {
    return;
  }
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  const distanceSquared = dx * dx + dy * dy;
  const minimum = left.radius + right.radius;
  if (distanceSquared >= minimum * minimum) {
    return;
  }

  const distance = Math.sqrt(distanceSquared);
  let nx: number;
  let ny: number;
  if (distance < 0.0000001) {
    nx = 1;
    ny = 0;
  } else {
    nx = dx / distance;
    ny = dy / distance;
  }

  const overlap = minimum - Math.max(distance, 0);
  const inverseTotal = left.inverseMass + right.inverseMass;
  if (inverseTotal > 0) {
    const leftShare = left.inverseMass / inverseTotal;
    const rightShare = right.inverseMass / inverseTotal;
    left.x -= nx * overlap * leftShare;
    left.y -= ny * overlap * leftShare;
    right.x += nx * overlap * rightShare;
    right.y += ny * overlap * rightShare;
  }

  const relativeX = right.vx - left.vx;
  const relativeY = right.vy - left.vy;
  const normalVelocity = relativeX * nx + relativeY * ny;
  if (normalVelocity >= 0) {
    return;
  }

  const restitution =
    left.kind === "striker" || right.kind === "striker"
      ? CARROM_BOARD.strikerRestitution
      : CARROM_BOARD.discRestitution;
  const impulse = (-(1 + restitution) * normalVelocity) / inverseTotal;
  left.vx -= impulse * nx * left.inverseMass;
  left.vy -= impulse * ny * left.inverseMass;
  right.vx += impulse * nx * right.inverseMass;
  right.vy += impulse * ny * right.inverseMass;

  if (Math.abs(normalVelocity) > 0.16 && events.length < 48) {
    const impact: CarromImpactEvent = {
      type: "impact",
      time,
      strength: Math.min(1, Math.abs(normalVelocity) / 2.4),
    };
    events.push(impact);
  }
}

/**
 * Deterministic fixed-step carrom physics. The simulation is intentionally
 * independent of rendering and can be reused by an authoritative server.
 */
export function simulatePhysics(
  state: CarromState,
  shot: CarromShotInput,
  options: CarromSimulationOptions = {},
): CarromPhysicsResult {
  const invalid = validateShot(state, shot);
  if (invalid !== null) {
    throw new CarromShotError(invalid);
  }

  const discs = state.discs.map(bodyFromDisc);
  const start = strikerPoint(state.turn, shot.position);
  const striker: Body = {
    id: "striker",
    kind: "striker",
    x: start.x,
    y: start.y,
    vx: 0,
    vy: 0,
    radius: CARROM_BOARD.strikerRadius,
    inverseMass: 1 / CARROM_BOARD.strikerMass,
    active: true,
    pocketed: false,
  };

  // The striker the player brought to the table decides how hard the shot
  // leaves the baseline.
  const power = strikerSkin(state.strikers?.[state.turn]).power;
  const speed =
    (CARROM_BOARD.minShotSpeed +
      (CARROM_BOARD.maxShotSpeed - CARROM_BOARD.minShotSpeed) * shot.power) *
    power;
  striker.vx = Math.cos(shot.angle) * speed;
  striker.vy = Math.sin(shot.angle) * speed;

  const bodies = [...discs, striker];
  const events: CarromPhysicsEvent[] = [];
  const pocketed: CarromPocketEvent[] = [];
  const frames: CarromFrame[] = [];
  const captureFrames = options.frames !== false;
  if (captureFrames) {
    frames.push(captureFrame(0, discs, striker));
  }

  let strikerPocketed = false;
  let time = 0;
  const maximumSeconds =
    options.maxSeconds ?? CARROM_BOARD.maxSimulationSeconds;
  const maximumSteps = Math.ceil(maximumSeconds / STEP_SECONDS);
  const damping = Math.exp(-CARROM_BOARD.friction * STEP_SECONDS);

  const pocketBody = (body: Body, pocket: CarromPoint): void => {
    body.active = false;
    body.pocketed = true;
    body.vx = 0;
    body.vy = 0;
    body.x = pocket.x;
    body.y = pocket.y;
    const event: CarromPocketEvent = {
      type: "pocket",
      time,
      id: body.id,
      kind: body.kind,
      pocket,
    };
    events.push(event);
    pocketed.push(event);
    if (body.kind === "striker") {
      strikerPocketed = true;
    }
  };

  for (let step = 0; step < maximumSteps; step += 1) {
    time += STEP_SECONDS;

    for (const body of bodies) {
      if (!body.active) {
        continue;
      }
      body.vx *= damping;
      body.vy *= damping;
      body.x += body.vx * STEP_SECONDS;
      body.y += body.vy * STEP_SECONDS;
    }

    for (const body of bodies) {
      if (!body.active) {
        continue;
      }
      const pocket = findPocketAt(body.x, body.y);
      if (pocket !== null) {
        pocketBody(body, pocket);
      }
    }

    for (const body of bodies) {
      if (body.active) {
        resolveWall(body);
      }
    }

    for (let iteration = 0; iteration < 3; iteration += 1) {
      for (let left = 0; left < bodies.length; left += 1) {
        const first = bodies[left]!;
        if (!first.active) {
          continue;
        }
        for (let right = left + 1; right < bodies.length; right += 1) {
          const second = bodies[right]!;
          if (second.active) {
            collide(first, second, time, events);
          }
        }
      }
    }

    // A collision can push a body into a pocket after the first sweep.
    for (const body of bodies) {
      if (!body.active) {
        continue;
      }
      const pocket = findPocketAt(body.x, body.y);
      if (pocket !== null) {
        pocketBody(body, pocket);
      }
    }

    if (captureFrames && step % SAMPLE_EVERY === 0) {
      frames.push(captureFrame(time, discs, striker));
    }

    if (maxSpeed(bodies) < CARROM_BOARD.stopSpeed) {
      break;
    }
  }

  if (captureFrames) {
    const last = frames[frames.length - 1];
    if (last === undefined || last.time < time - 0.000001) {
      frames.push(captureFrame(time, discs, striker));
    }
  }

  return {
    discs: discs.map((body) => ({
      id: body.id,
      kind: body.kind as CarromDisc["kind"],
      x: body.x,
      y: body.y,
      pocketed: body.pocketed,
    })),
    strikerPocketed,
    striker: {
      x: striker.x,
      y: striker.y,
      pocketed: striker.pocketed,
    },
    pocketed,
    events,
    frames,
    duration: time,
  };
}
