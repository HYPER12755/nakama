import {
  CARROM_BOARD,
  PLAYER_LABEL,
  baselineY,
  findOpenSpot,
  nearestValidStrikerX,
  oppositePlayer,
} from "./board";
import type {
  CarromDisc,
  CarromDiscKind,
  CarromPhysicsResult,
  CarromPlayer,
  CarromShotInput,
  CarromShotResult,
  CarromState,
  ShotOutcome,
} from "./types";

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
  };
}

function finishMessage(winner: CarromPlayer): string {
  return `${PLAYER_LABEL[winner]} clears the board and wins.`;
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
  const opponent = oppositePlayer(player);
  const ownPocketed = physics.pocketed.filter(
    (event) => event.kind === player,
  ).length;
  const opponentPocketed = physics.pocketed.filter(
    (event) => event.kind === opponent,
  ).length;
  const queenPocketedNow = physics.pocketed.some(
    (event) => event.kind === "queen",
  );
  const strikerPocketed = physics.strikerPocketed;
  const foul = strikerPocketed || opponentPocketed > 0;

  const next: CarromState = {
    ...state,
    discs: physics.discs.map((disc) => ({ ...disc })),
    queen: { ...state.queen },
    scores: { ...state.scores },
    status: "aiming",
    winner: null,
    shotNumber: state.shotNumber + 1,
  };

  let queenCoveredThisShot = false;
  let queenReturned = false;
  let returnedDisc: CarromPlayer | null = null;
  let queenBlockedFinish = false;

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

  // A striker pocket is a foul: return one of the shooter's pocketed men.
  if (strikerPocketed) {
    const penalty = lastPocketedDisc(next, physics, player);
    if (penalty !== undefined) {
      returnDiscToBoard(next, penalty);
      returnedDisc = player;
    }
  }

  scoreState(next);

  const tryFinish = (candidate: CarromPlayer): boolean => {
    if (next.scores[candidate] < 9) {
      return false;
    }
    if (next.queen.status === "covered") {
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

  // The shooter's action resolves first. If the opponent also reached nine,
  // their last piece is protected by the same queen rule below.
  const finished = tryFinish(player) || tryFinish(opponent);

  const queenPendingNow =
    next.queen.status === "pending" && !foul && !queenReturned;
  const turnContinued =
    !finished &&
    !foul &&
    !queenBlockedFinish &&
    (ownPocketed > 0 || (queenPocketedNow && queenPendingNow));

  next.turn = turnContinued ? player : opponent;
  const requestedStrikerX = turnContinued ? shot.strikerX : 0.5;
  next.striker = {
    x: nearestValidStrikerX(next, requestedStrikerX),
    y: baselineY(next.turn),
    pocketed: false,
  };

  const parts: string[] = [];
  if (next.winner !== null) {
    parts.push(finishMessage(next.winner));
  } else {
    if (queenBlockedFinish) {
      parts.push("The queen must be covered before the final piece.");
    }
    if (strikerPocketed) {
      parts.push("Striker pocketed — foul.");
    }
    if (opponentPocketed > 0) {
      parts.push(
        `Pocketed ${opponentPocketed} ${PLAYER_LABEL[opponent]} ${
          opponentPocketed === 1 ? "piece" : "pieces"
        } — foul.`,
      );
    }
    if (queenCoveredThisShot) {
      parts.push("Queen covered.");
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
    if (turnContinued) {
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
