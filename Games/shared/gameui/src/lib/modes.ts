import type { GameCatalogEntry } from "@moongames/game-sdk";
import type { GameFlowOption } from "../components/GameFlowMenu";

/**
 * The ways a game can be played.
 *
 * The list comes from what the catalog says the game can do, so a title that
 * gains a new way to play shows it without the launcher being changed.
 */
export function gameModes(entry: GameCatalogEntry): GameFlowOption[] {
  const modes: GameFlowOption[] = [];
  if (entry.capabilities.includes("local")) {
    modes.push({
      id: "local",
      label: "On this device",
      description: "Play at this table. Everyone shares the screen.",
    });
  }
  if (entry.capabilities.includes("ai")) {
    modes.push({
      id: "ai",
      label: "Against the computer",
      description: "Play the computer at the level you choose.",
    });
  }
  if (entry.capabilities.includes("online")) {
    modes.push({
      id: "online",
      label: "Online table",
      description: "Play another person, at your own table.",
    });
  }
  return modes;
}

/**
 * The mode a game starts in when the address does not say.
 */
export function defaultGameMode(entry: GameCatalogEntry): string {
  const modes = gameModes(entry);
  return modes.length > 0 ? modes[0]!.id : "local";
}
