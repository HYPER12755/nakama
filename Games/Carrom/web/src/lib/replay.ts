import {
  createInitialState,
  simulateShot,
  type CarromState,
  type GameVariant,
} from "@moongames/carrom-core";

export interface ReplayShot {
  by?: string;
  colour?: string;
  position: number;
  angle: number;
  power: number;
  striker?: string;
  pocketed_count?: number;
}

export interface ReplayData {
  variant: GameVariant;
  teams: boolean;
  seats: string[];
  shots: ReplayShot[];
}

/**
 * The part of a history record that lets us rebuild a board. Nakama sends
 * empty Lua tables as objects, so every list is normalised here.
 */
export function readReplay(metadata: unknown): ReplayData | null {
  if (typeof metadata !== "object" || metadata === null) {
    return null;
  }
  const replay = (metadata as { replay?: unknown }).replay;
  if (typeof replay !== "object" || replay === null) {
    return null;
  }
  const value = replay as Partial<ReplayData>;
  const shots = Array.isArray(value.shots) ? value.shots : [];
  if (shots.length === 0) {
    return null;
  }
  const seats = Array.isArray(value.seats) ? value.seats : [];
  return {
    variant: value.variant ?? "classic",
    teams: value.teams === true,
    seats: seats.filter((seat): seat is string => typeof seat === "string"),
    shots: shots.filter(
      (shot): shot is ReplayShot =>
        typeof shot === "object" &&
        shot !== null &&
        Number.isFinite(shot.position) &&
        Number.isFinite(shot.angle) &&
        Number.isFinite(shot.power),
    ),
  };
}

/** The board at one step of a replay, by replaying the same shots on device. */
export function boardAt(replay: ReplayData, step: number): CarromState | null {
  const seated = replay.seats.filter((seat) =>
    ["white", "black", "green", "yellow"].includes(seat),
  ) as CarromState["players"];
  if (seated.length < 2) {
    return null;
  }
  let state = createInitialState(seated, {
    variant: replay.variant,
    teams: replay.teams,
  });
  for (let index = 0; index <= Math.min(step, replay.shots.length - 1); index += 1) {
    const shot = replay.shots[index]!;
    try {
      state = simulateShot(state, {
        position: shot.position,
        angle: shot.angle,
        power: shot.power,
      }).state;
    } catch {
      return state;
    }
  }
  return state;
}
