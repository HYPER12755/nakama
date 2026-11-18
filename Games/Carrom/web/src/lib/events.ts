/**
 * The events a carrom table talks about. Every event has a line of text and
 * a sound, so a player who is looking away still knows what happened.
 */
import type { CarromShotResult } from "@moongames/carrom-core";
import { PLAYER_LABEL } from "@moongames/carrom-core";

export type TableEventKind =
  | "pocket"
  | "queen"
  | "foul"
  | "win"
  | "turn"
  | "info";

export interface TableEvent {
  id: number;
  kind: TableEventKind;
  message: string;
  sound:
    | "strike"
    | "pocket"
    | "queen"
    | "foul"
    | "win"
    | "turn"
    | "start";
  at: number;
}

let nextId = 0;

/** The events a finished shot raises, in the order a player sees them. */
export function shotEvents(result: CarromShotResult, at: number): TableEvent[] {
  const events: TableEvent[] = [];
  const who = PLAYER_LABEL[result.outcome.player];
  // In doubles a partner's men are ours; pocketing them is not a foul.
  const shooterTeam =
    result.state.teams === true
      ? result.outcome.player === "white" || result.outcome.player === "black"
        ? "A"
        : "B"
      : null;
  const isOwn = (kind: string): boolean =>
    kind === result.outcome.player ||
    (shooterTeam !== null &&
      ((shooterTeam === "A" && (kind === "white" || kind === "black")) ||
        (shooterTeam === "B" && (kind === "yellow" || kind === "green"))));

  for (const pocket of result.pocketed) {
    if (pocket.kind === "queen") {
      events.push({
        id: nextId++,
        kind: "queen",
        message: `${who} pocketed the queen.`,
        sound: "queen",
        at,
      });
    } else if (isOwn(pocket.kind)) {
      events.push({
        id: nextId++,
        kind: "pocket",
        message: `${who} pocketed a ${pocket.kind} man.`,
        sound: "pocket",
        at,
      });
    } else {
      events.push({
        id: nextId++,
        kind: "foul",
        message: `${who} pocketed a ${pocket.kind} man — foul.`,
        sound: "foul",
        at,
      });
    }
  }

  if (result.outcome.foul && result.pocketed.every((p) => isOwn(p.kind))) {
    events.push({
      id: nextId++,
      kind: "foul",
      message: result.outcome.strikerPocketed
        ? `${who} scratched. One man returns.`
        : `${who} committed a foul. The turn passes.`,
      sound: "foul",
      at,
    });
  }

  if (result.outcome.winner !== null) {
    events.push({
      id: nextId++,
      kind: "win",
      message: `${PLAYER_LABEL[result.outcome.winner]} cleared the board.`,
      sound: "win",
      at,
    });
  } else if (!result.outcome.turnContinued) {
    events.push({
      id: nextId++,
      kind: "turn",
      message: `${PLAYER_LABEL[result.outcome.nextTurn]} to shoot.`,
      sound: "turn",
      at,
    });
  }

  return events;
}
