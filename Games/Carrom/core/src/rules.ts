import {
  CARROM_BOARD,
  PLAYER_LABEL,
  findOpenSpot,
  nextPlayerInTurnOrder,
  nearestValidStrikerPosition,
  playersInTurnOrder,
  strikerPoint,
  variantRules,
} from "./board";
import type {
  CarromDisc,
  CarromDiscKind,
  CarromPhysicsResult,
  CarromPlayer,
  CarromRuleSet,
  CarromShotInput,
  CarromShotResult,
  CarromState,
  ShotOutcome,
} from "./types";

const ALL_PLAYERS: CarromPlayer[] = ["white", "black", "green", "yellow"];

function countPocketed(discs: CarromDisc[], kind: CarromDiscKind): number {
  return discs.reduce(
    (total, disc) =>
      disc.kind === kind && disc.pocketed ? total + 1 : total,
    0,
  );
}

function returnDiscToBoard(
  state: CarromState,
  disc: CarromDisc,
  preferred = { x: 0.5, y: 0.5 },
): void {
  const spot = findOpenSpot(
    state.discs,
    preferred,
    CARROM_BOARD.discRadius,
    disc.id,
  );
  disc.pocketed = false;
  disc.x = spot.x;
  disc.y = spot.y;
}

function returnQueenToCentre(state: CarromState): void {
  const queen = state.discs.find((disc) => disc.kind === "queen");
  if (queen !== undefined) {
    returnDiscToBoard(state, queen);
  }
  state.queen = { status: "board" };
}

function lastPocketedDisc(
  state: CarromState,
  physics: CarromPhysicsResult,
  kind: CarromDiscKind,
): CarromDisc | undefined {
  for (let index = physics.pocketed.length - 1; index >= 0; index -= 1) {
    const event = physics.pocketed[index]!;
    if (event.kind === kind) {
      const disc = state.discs.find((candidate) => candidate.id === event.id);
      if (disc !== undefined && disc.pocketed) {
        return disc;
      }
    }
  }
  const fallback = [...state.discs]
    .reverse()
    .find((disc) => disc.kind === kind && disc.pocketed);
  return fallback;
}

function scoreState(state: CarromState): void {
  state.scores = {
    white: countPocketed(state.discs, "white"),
    black: countPocketed(state.discs, "black"),
    green: countPocketed(state.discs, "green"),
    yellow: countPocketed(state.discs, "yellow"),
  };
}

/**
 * Apply carrom rules to a completed physics simulation. This is deliberately
 * separate from the physics step so the same rules can be tested with
 * fabricated pocket outcomes and later ported to the authoritative server.
 */
export function resolveShotRules(
  state: CarromState,
  physics: CarromPhysicsResult,
  shot: CarromShotInput,
): { state: CarromState; outcome: ShotOutcome } {
  const player = state.turn;
  const seated = state.players.length > 0 ? state.players : [player];
  const rules = state.rules ?? variantRules("classic");
  const ownPocketed = physics.pocketed.filter(
    (event) => event.kind === player,
  ).length;
  const opponentPocketed = physics.pocketed.filter(
    (event) =>
      event.kind !== "queen" &&
      event.kind !== "striker" &&
      event.kind !== player,
  ).length;
  const queenPocketedNow = physics.pocketed.some(
    (event) => event.kind === "queen",
  );
  const strikerPocketed = physics.strikerPocketed;
  // A table without fouls never punishes a shot, it only costs the turn.
  const foul = rules.fouls && (strikerPocketed || opponentPocketed > 0);

  const next: CarromState = {
    ...state,
    discs: physics.discs.map((disc) => ({ ...disc })),
    players: [...seated],
    rules,
    queen: { ...state.queen },
    scores: { ...state.scores },
    status: "aiming",
    winner: null,
    shotNumber: state.shotNumber + 1,
    // The clock belongs to whoever holds the table, so the deadline is
    // cleared here and set again by the table that owns the turn.
    turnDeadline: null,
  };

  let queenCoveredThisShot = false;
  let queenReturned = false;
  let returnedDisc: CarromPlayer | null = null;
  let queenBlockedFinish = false;

  if (rules.coverQueen) {
    // A queen pocketed on a previous shot is waiting to be covered.
    if (state.queen.status === "pending") {
      if (ownPocketed > 0 && !foul) {
        next.queen = { status: "covered", owner: player };
        queenCoveredThisShot = true;
      } else {
        returnQueenToCentre(next);
        queenReturned = true;
      }
    } else if (state.queen.status === "board" && queenPocketedNow) {
      if (foul) {
        returnQueenToCentre(next);
        queenReturned = true;
      } else if (ownPocketed > 0) {
        next.queen = { status: "covered", owner: player };
        queenCoveredThisShot = true;
      } else {
        next.queen = { status: "pending", owner: player };
      }
    }
  } else if (state.queen.status === "board" && queenPocketedNow && !foul) {
    // Without the covering rule the queen is an ordinary piece: it belongs to
    // whoever pocketed it and it is worth its points straight away.
    next.queen = { status: "covered", owner: player };
    queenCoveredThisShot = true;
  }

  // A striker pocket is a foul: return one of the shooter's pocketed men.
  if (strikerPocketed && rules.fouls) {
    const penalty = lastPocketedDisc(next, physics, player);
    if (penalty !== undefined) {
      returnDiscToBoard(next, penalty);
      returnedDisc = player;
    }
  }

  scoreState(next);

  const tryFinish = (candidate: CarromPlayer): boolean => {
    if (next.scores[candidate] < CARROM_BOARD.piecesPerPlayer) {
      return false;
    }
    if (!rules.coverQueen || next.queen.status === "covered") {
      next.status = "finished";
      next.winner = candidate;
      return true;
    }

    const blocker = lastPocketedDisc(next, physics, candidate);
    if (blocker !== undefined) {
      returnDiscToBoard(next, blocker);
      returnedDisc = candidate;
    }
    queenBlockedFinish = true;
    scoreState(next);
    return false;
  };

  // The shooter's action resolves first. Every seated player is then checked
  // so a colour that was cleared by the same shot cannot slip through.
  const order = playersInTurnOrder(seated);
  let finished = false;
  for (const candidate of [player, ...order.filter((entry) => entry !== player)]) {
    if (tryFinish(candidate)) {
      finished = true;
      break;
    }
  }

  const queenPendingNow =
    next.queen.status === "pending" && !foul && !queenReturned;
  const turnContinued =
    !finished &&
    !foul &&
    !queenBlockedFinish &&
    (ownPocketed > 0 || (queenPocketedNow && queenPendingNow));

  // A solo table belongs to one player, so the turn never leaves them.
  const keepsTurn = turnContinued || state.solo === true;
  next.turn = keepsTurn
    ? player
    : nextPlayerInTurnOrder(seated, player);
  const requestedPosition = turnContinued ? shot.position : 0.5;
  const position = nearestValidStrikerPosition(next, requestedPosition);
  const point = strikerPoint(next.turn, position);
  next.striker = { x: point.x, y: point.y, pocketed: false };

  const parts: string[] = [];
  if (next.winner !== null) {
    parts.push(`${PLAYER_LABEL[next.winner]} clears the board and wins.`);
  } else {
    if (queenBlockedFinish) {
      parts.push("The queen must be covered before the final piece.");
    }
    if (strikerPocketed) {
      parts.push("Striker pocketed — foul.");
    }
    if (opponentPocketed > 0) {
      parts.push(
        `Pocketed ${opponentPocketed} opponent ${
          opponentPocketed === 1 ? "piece" : "pieces"
        } — foul.`,
      );
    }
    if (queenCoveredThisShot) {
      parts.push(
        rules.coverQueen ? "Queen covered." : "Queen taken.",
      );
    } else if (next.queen.status === "pending") {
      parts.push("Queen pocketed — cover it with one of your pieces.");
    }
    if (queenReturned) {
      parts.push("Queen returned to the centre.");
    }
    if (returnedDisc !== null) {
      parts.push(`${PLAYER_LABEL[returnedDisc]} piece returned.`);
    }
    if (ownPocketed > 0 && !strikerPocketed) {
      parts.push(
        `Pocketed ${ownPocketed} ${PLAYER_LABEL[player]} ${
          ownPocketed === 1 ? "piece" : "pieces"
        }.`,
      );
    }
    if (keepsTurn) {
      parts.push("Shoot again.");
    } else {
      parts.push("Turn passes.");
    }
    if (
      ownPocketed === 0 &&
      opponentPocketed === 0 &&
      !queenPocketedNow &&
      !strikerPocketed
    ) {
      parts.unshift("No pocket.");
    }
  }

  const outcome: ShotOutcome = {
    player,
    nextTurn: next.turn,
    ownPocketed,
    opponentPocketed,
    queenPocketed: queenPocketedNow,
    queenCovered: queenCoveredThisShot,
    queenReturned,
    strikerPocketed,
    foul,
    turnContinued,
    returnedDisc,
    winner: next.winner,
    message: parts.join(" "),
  };
  next.lastOutcome = outcome;

  return { state: next, outcome };
}

export function resolveShot(
  state: CarromState,
  physics: CarromPhysicsResult,
  shot: CarromShotInput,
): CarromShotResult {
  const resolved = resolveShotRules(state, physics, shot);
  return {
    ...physics,
    state: resolved.state,
    outcome: resolved.outcome,
  };
}

/** The rules of a table, with a safe fallback for an older state. */
export function rulesOf(state: CarromState): CarromRuleSet {
  return state.rules ?? variantRules("classic");
}

/**
 * Hand the turn to the next player without a shot. The shot clock uses this
 * when a player runs out of time.
 */
export function passTurn(state: CarromState): CarromState {
  const seated = state.players.length > 0 ? state.players : [state.turn];
  const next = nextPlayerInTurnOrder(seated, state.turn);
  const withNext = { ...state, turn: next };
  const position = nearestValidStrikerPosition(withNext, 0.5);
  const point = strikerPoint(next, position);
  return {
    ...state,
    turn: next,
    striker: { x: point.x, y: point.y, pocketed: false },
    turnDeadline: null,
  };
}

/**
 * The pieces of a colour still on the board. A player wins by clearing them
 * all, so this is the number that matters at the table.
 */
export function piecesLeft(
  state: CarromState,
  player: CarromPlayer,
): number {
  return Math.max(
    0,
    CARROM_BOARD.piecesPerPlayer - (state.scores[player] ?? 0),
  );
}

/**
 * The points of a colour, counted the way the carrom apps count them: a man
 * is worth one point and the queen is worth three.
 */
export function pointsFor(state: CarromState, player: CarromPlayer): number {
  const rules = rulesOf(state);
  const men = state.scores[player] ?? 0;
  const queen =
    state.queen.status === "covered" && state.queen.owner === player
      ? rules.queenPoints
      : 0;
  return men * rules.manPoints + queen;
}

/** The points a player can reach: every man plus the queen. */
export function maximumPoints(rules: CarromRuleSet): number {
  return CARROM_BOARD.piecesPerPlayer * rules.manPoints + rules.queenPoints;
}

export { ALL_PLAYERS };
