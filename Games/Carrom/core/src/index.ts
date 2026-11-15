export {
  AIM_MAX_DISTANCE,
  CARROM_BASELINES,
  CARROM_BOARD,
  CARROM_CLOCKS,
  CARROM_SEATS,
  CARROM_STRIKERS,
  CARROM_VARIANTS,
  DEFAULT_TURN_SECONDS,
  PLAYER_COLOR,
  PLAYER_LABEL,
  TABLE_PLAYERS,
  TABLE_SIZES,
  baselineOf,
  clampStrikerPosition,
  createInitialState,
  findOpenSpot,
  medallionRadii,
  nearestValidStrikerPosition,
  nextPlayerInTurnOrder,
  playersInTurnOrder,
  sideForViewer,
  sideOf,
  strikerFits,
  strikerPoint,
  strikerSkin,
  tablePlayers,
  variantRules,
  viewRotation,
} from "./board";
export { CARROM_OP, type CarromOpCode } from "./protocol";
export type { CarromBaseline, CarromSide, CarromStrikerSkin } from "./board";
export {
  CARROM_CHALLENGES,
  challengeById,
  challengeProgress,
} from "./challenges";
export type {
  CarromChallenge,
  CarromChallengeProgress,
} from "./challenges";
export type { CarromStateOptions } from "./board";
export {
  CarromShotError,
  findPocketAt,
  simulatePhysics,
  validateShot,
} from "./physics";
export {
  maximumPoints,
  passTurn,
  piecesLeft,
  pointsFor,
  resolveShot,
  resolveShotRules,
  rulesOf,
  scoresFromBoard,
} from "./rules";
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
  CarromRuleSet,
  CarromShotInput,
  CarromShotResult,
  CarromSimulationOptions,
  CarromState,
  CarromStriker,
  GameVariant,
  QueenStatus,
  ShotOutcome,
} from "./types";
