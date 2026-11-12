import type { GameLaunchContext } from "./launch";

export type GameCapability =
  | "local"
  | "online"
  | "private-match"
  | "ai"
  | "spectators"
  | "invite-links"
  | "replay";

export type GameOrientation = "portrait" | "landscape" | "any";
export type GameAvailability = "available" | "coming-soon" | "hidden";
export type ThemeMode = "light" | "dark" | "system";
/**
 * How the game's player identity is chosen. `shared` uses the launcher's
 * authenticated Nakama account; `per-game` leaves account ownership to the
 * game itself.
 */
export type GameAccountMode = "shared" | "per-game";

export interface GameManifest {
  id: string;
  name: string;
  version: string;
  sdkVersion: string;
  entry: string;
  minPlayers: number;
  maxPlayers: number;
  capabilities: GameCapability[];
  orientation: GameOrientation;
  description?: string;

  /** Optional catalog/menu presentation fields. */
  tagline?: string;
  status?: GameAvailability;
  tags?: string[];
  accent?: string;
  icon?: string;
  featured?: boolean;
  sortOrder?: number;
  webPath?: string;
  cover?: string;
  screenshots?: string[];
}

export interface GameTheme {
  mode: ThemeMode;
  accent?: string;
  background?: string;
  surface?: string;
  text?: string;
}

export interface GameSession {
  token: string;
  refreshToken?: string;
  userId: string;
  username: string;
  expiresAt: number;
}

export interface NakamaConnection {
  host: string;
  port: string;
  serverKey: string;
  useSSL: boolean;
}

export interface GameReleaseIdentity {
  version: string;
  sha256: string;
  keyId: string;
}

export interface GameHostConfig {
  protocol: number;
  gameId: string;
  locale: string;
  theme: GameTheme;
  session?: GameSession;
  nakama?: NakamaConnection;
  /**
   * Present when the host selected the identity model explicitly. `shared`
   * means `session` is managed by the launcher and must not be replaced by the
   * game. `per-game` means the game owns its account flow.
   */
  accountMode?: GameAccountMode;
  /** True only when the host verified a signed official release descriptor. */
  official?: boolean;
  /** Verified signed release identity for official bundles. */
  release?: GameReleaseIdentity;
  /** Query parameters from a native launch/deep link. */
  launch?: GameLaunchContext;
}
