/**
 * The launch pipeline is shared by every catalog entry: verify the signed
 * release, make sure a shared account exists, hand the session over, and open
 * the game. The phase names live here so the button label, the busy state, and
 * the tests all agree.
 */
export type LaunchPhase =
  | "idle"
  | "verifying"
  | "account"
  | "preparing"
  | "opening"
  | "error";

export interface LaunchState {
  gameId: string;
  phase: LaunchPhase;
}

export function launchPhaseFor(
  state: LaunchState | null,
  gameId: string,
): LaunchPhase {
  if (state === null || state.gameId !== gameId) {
    return "idle";
  }
  return state.phase;
}

/**
 * Only the in-flight phases block the button. The "account" phase waits for
 * the player, so the button stays clickable and reopens the account drawer.
 */
export function isLaunchBusy(phase: LaunchPhase): boolean {
  return phase === "verifying" || phase === "preparing" || phase === "opening";
}

export function launchButtonLabel(
  phase: LaunchPhase,
  gameName: string,
): string {
  switch (phase) {
    case "verifying":
      return "Verifying release…";
    case "account":
      return "Connect your account";
    case "preparing":
      return "Preparing shared account…";
    case "opening":
      return "Opening…";
    case "error":
      return "Try again";
    case "idle":
      return `Play ${gameName}`;
  }
}

/** Compact label used by the library cards. */
export function launchButtonShortLabel(phase: LaunchPhase): string {
  switch (phase) {
    case "verifying":
      return "Verifying…";
    case "account":
      return "Sign in";
    case "preparing":
      return "Preparing…";
    case "opening":
      return "Opening…";
    case "error":
      return "Retry";
    case "idle":
      return "Play";
  }
}
