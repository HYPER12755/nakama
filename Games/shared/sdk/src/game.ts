export interface GameStartContext {
  seed: string;
  players: Array<{ id: string; username: string }>;
  config: Record<string, unknown>;
}

export interface GameResult {
  winnerIds: string[];
  draw: boolean;
  reason: string;
}

export type GameActionResult<State> =
  | { ok: true; state: State }
  | { ok: false; error: string };

/**
 * The shared contract every MoonGames title implements.
 *
 * The same definition can run in local mode in the browser and inside the
 * authoritative server match runner. Hidden-information games must use
 * getView() to redact state per player.
 */
export interface GameDefinition<State, Action, View = unknown> {
  readonly id: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;

  createInitialState(context: GameStartContext): State;
  applyAction(
    state: State,
    action: Action,
    playerId: string,
  ): GameActionResult<State>;
  getView(state: State, playerId: string): View;
  isTerminal(state: State): GameResult | null;
  tick?(state: State, now: number): State;
}
