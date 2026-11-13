export type CarromPlayer = "white" | "black" | "green" | "yellow";
export type CarromDiscKind = CarromPlayer | "queen";
export type CarromPocketKind = CarromDiscKind | "striker";
export type QueenStatus = "board" | "pending" | "covered";

export interface CarromPoint {
  x: number;
  y: number;
}

export interface CarromDisc {
  id: string;
  kind: CarromDiscKind;
  x: number;
  y: number;
  pocketed: boolean;
}

export interface CarromStriker {
  x: number;
  y: number;
  pocketed: boolean;
}

export interface CarromQueen {
  status: QueenStatus;
  owner?: CarromPlayer;
}

export interface CarromShotInput {
  /**
   * Position of the striker along the current player's baseline. The axis is
   * the one the player's baseline runs along: `x` for the top and bottom
   * players, `y` for the left and right players.
   */
  position: number;
  /** Direction in radians, with 0 pointing right and positive values down. */
  angle: number;
  /** Normalized shot strength in the range 0..1. */
  power: number;
}

export interface CarromState {
  discs: CarromDisc[];
  striker: CarromStriker;
  turn: CarromPlayer;
  /** Seated players, in seating order around the table. */
  players: CarromPlayer[];
  queen: CarromQueen;
  scores: Record<CarromPlayer, number>;
  status: "aiming" | "finished";
  winner: CarromPlayer | null;
  shotNumber: number;
  lastOutcome?: ShotOutcome;
}

export interface ShotOutcome {
  player: CarromPlayer;
  nextTurn: CarromPlayer;
  ownPocketed: number;
  opponentPocketed: number;
  queenPocketed: boolean;
  queenCovered: boolean;
  queenReturned: boolean;
  strikerPocketed: boolean;
  foul: boolean;
  turnContinued: boolean;
  returnedDisc: CarromPlayer | null;
  winner: CarromPlayer | null;
  message: string;
}

export interface CarromFrameDisc {
  id: string;
  kind: CarromDiscKind;
  x: number;
  y: number;
  pocketed: boolean;
}

export interface CarromFrameStriker {
  x: number;
  y: number;
  pocketed: boolean;
}

export interface CarromFrame {
  time: number;
  discs: CarromFrameDisc[];
  striker: CarromFrameStriker;
}

export interface CarromPocketEvent {
  type: "pocket";
  time: number;
  id: string;
  kind: CarromPocketKind;
  pocket: CarromPoint;
}

export interface CarromImpactEvent {
  type: "impact";
  time: number;
  strength: number;
}

export type CarromPhysicsEvent = CarromPocketEvent | CarromImpactEvent;

export interface CarromPhysicsResult {
  discs: CarromDisc[];
  strikerPocketed: boolean;
  striker: CarromFrameStriker;
  pocketed: CarromPocketEvent[];
  events: CarromPhysicsEvent[];
  frames: CarromFrame[];
  duration: number;
}

export interface CarromShotResult extends CarromPhysicsResult {
  state: CarromState;
  outcome: ShotOutcome;
}

export interface CarromSimulationOptions {
  /** Skip frame capture for AI searches or server-side resolution. */
  frames?: boolean;
  maxSeconds?: number;
}
