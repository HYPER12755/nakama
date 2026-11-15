import { useCallback, useEffect, useState } from "react";
import {
  hasOwnPreference,
  onPreferenceChange,
  readPreferences,
  writePreference,
  writeSharedPreference,
  clearPreference,
  PREFERENCE_KEYS,
  type GamePreferences,
  type PreferenceKey,
} from "../lib/preferences";

export interface UseGamePreferencesResult {
  /** Every choice of this game, as they are right now. */
  preferences: GamePreferences;
  /** Keep a choice for this game only. */
  setPreference: <K extends PreferenceKey>(
    key: K,
    value: GamePreferences[K],
  ) => void;
  /** Keep a choice for every game that has not made one of its own. */
  setSharedPreference: <K extends PreferenceKey>(
    key: K,
    value: GamePreferences[K],
  ) => void;
  /** Forget this game's own choice, so it follows the shared one again. */
  resetPreference: (key: PreferenceKey) => void;
  /** The choices this game has made for itself. */
  ownPreferences: PreferenceKey[];
}

/**
 * The customizations of a game, kept on the device.
 *
 * Every panel that shows these choices uses this hook, so they all show the
 * same thing and a change in one of them is seen by the others at once.
 */
export function useGamePreferences(
  gameId: string,
): UseGamePreferencesResult {
  const [preferences, setState] = useState<GamePreferences>(() =>
    readPreferences(gameId),
  );
  const [own, setOwn] = useState<PreferenceKey[]>(() => ownKeys(gameId));

  const refresh = useCallback(() => {
    setState(readPreferences(gameId));
    setOwn(ownKeys(gameId));
  }, [gameId]);

  useEffect(() => {
    // The page may have been given a choice before it was opened.
    refresh();
    return onPreferenceChange((changedGame, key) => {
      if (changedGame === gameId || changedGame === "*") {
        refresh();
      }
      void key;
    });
  }, [gameId, refresh]);

  const setPreference = useCallback(
    <K extends PreferenceKey>(key: K, value: GamePreferences[K]) => {
      writePreference(gameId, key, value);
      refresh();
    },
    [gameId, refresh],
  );

  const setSharedPreference = useCallback(
    <K extends PreferenceKey>(key: K, value: GamePreferences[K]) => {
      writeSharedPreference(key, value);
      refresh();
    },
    [refresh],
  );

  const resetPreference = useCallback(
    (key: PreferenceKey) => {
      clearPreference(gameId, key);
      refresh();
    },
    [gameId, refresh],
  );

  return {
    preferences,
    setPreference,
    setSharedPreference,
    resetPreference,
    ownPreferences: own,
  };
}

function ownKeys(gameId: string): PreferenceKey[] {
  return PREFERENCE_KEYS.filter((key) => hasOwnPreference(gameId, key));
}
