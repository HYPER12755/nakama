import { useEffect, useState } from "react";
import { readLauncherHandoff } from "@moongames/game-sdk";
import type { GameHostConfig } from "@moongames/game-sdk";

/**
 * Keeps a game's launcher identity current. The web menu writes a verified
 * handoff before navigation; a native host supplies config through the bridge.
 * Storage events and launcher events cover reloads and fresh handoffs.
 */
export function useLauncherHandoff(gameId: string): GameHostConfig | null {
  const [config, setConfig] = useState<GameHostConfig | null>(() =>
    readLauncherHandoff(gameId),
  );

  useEffect(() => {
    const update = () => setConfig(readLauncherHandoff(gameId));
    update();
    window.addEventListener("storage", update);
    window.addEventListener("moongames:launcher-handoff", update);
    window.addEventListener("focus", update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("moongames:launcher-handoff", update);
      window.removeEventListener("focus", update);
    };
  }, [gameId]);

  return config;
}
