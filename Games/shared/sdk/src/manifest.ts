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

export interface GameHostConfig {
  protocol: number;
  gameId: string;
  locale: string;
  theme: GameTheme;
  session?: GameSession;
  nakama?: NakamaConnection;
  /** Query parameters from a native launch/deep link. */
  launch?: GameLaunchContext;
}
