export {
  CARROM_BASELINES,
  CARROM_BOARD,
  CARROM_SEATS,
  PLAYER_COLOR,
  PLAYER_LABEL,
  baselineOf,
  clampStrikerPosition,
  createInitialState,
  findOpenSpot,
  medallionRadii,
  nearestValidStrikerPosition,
  nextPlayerInTurnOrder,
  playersInTurnOrder,
  strikerFits,
  strikerPoint,
} from "./board";
export type { CarromBaseline } from "./board";
export {
  CarromShotError,
  findPocketAt,
  simulatePhysics,
  validateShot,
} from "./physics";
export { resolveShot, resolveShotRules } from "./rules";
export { simulateShot } from "./shot";
export { chooseAiShot, chooseAiShotAsync, pickWithRealism } from "./ai";
export type { CarromAiDifficulty, CarromAiOptions } from "./ai";
export type {
  CarromDisc,
  CarromDiscKind,
  CarromFrame,
  CarromFrameDisc,
  CarromFrameStriker,
  CarromImpactEvent,
  CarromPhysicsEvent,
  CarromPhysicsResult,
  CarromPlayer,
  CarromPocketEvent,
  CarromPocketKind,
  CarromPoint,
  CarromQueen,
  CarromShotInput,
  CarromShotResult,
  CarromSimulationOptions,
  CarromState,
  CarromStriker,
  QueenStatus,
  ShotOutcome,
} from "./types";
