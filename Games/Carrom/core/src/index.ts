export {
  CARROM_BOARD,
  PLAYER_LABEL,
  baselineY,
  clampStrikerX,
  createInitialState,
  findOpenSpot,
  nearestValidStrikerX,
  oppositePlayer,
  strikerFits,
} from "./board";
export { CarromShotError, findPocketAt, simulatePhysics, validateShot } from "./physics";
export { resolveShot, resolveShotRules } from "./rules";
export { simulateShot } from "./shot";
export { chooseAiShot, chooseAiShotAsync } from "./ai";
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
