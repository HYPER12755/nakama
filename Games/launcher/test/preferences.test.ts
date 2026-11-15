import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AnimationSpeed,
  Coordinates,
  DEFAULT_PREFERENCES,
  animationDuration,
  clearPreference,
  clearSharedPreference,
  hasOwnPreference,
  readPreference,
  readPreferenceScope,
  readPreferences,
  writePreference,
  writePreferenceScope,
  writeSharedPreference,
} from "@moongames/game-ui";

/**
 * The choices a player makes are kept on the device, so the table looks the
 * way the player left it. Every game has a room of its own, and a shared
 * room underneath that holds the choice made once for every game.
 */

let store: Map<string, string>;
let originalWindow: unknown;

beforeEach(() => {
  store = new Map<string, string>();
  originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  };
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("the customizations of a game", () => {
  it("keeps a choice for one game without touching the others", () => {
    writePreference("chess", "pieceSet", "cburnett");

    expect(readPreference("chess", "pieceSet")).toBe("cburnett");
    expect(readPreference("carrom", "pieceSet")).toBe(
      DEFAULT_PREFERENCES.pieceSet,
    );
    expect(hasOwnPreference("chess", "pieceSet")).toBe(true);
    expect(hasOwnPreference("carrom", "pieceSet")).toBe(false);
  });

  it("keeps a shared choice under every game that has none of its own", () => {
    writeSharedPreference("boardTheme", "ocean");

    expect(readPreference("chess", "boardTheme")).toBe("ocean");
    expect(readPreference("carrom", "boardTheme")).toBe("ocean");

    // A game that makes a choice of its own wins over the shared one.
    writePreference("chess", "boardTheme", "maple");
    expect(readPreference("chess", "boardTheme")).toBe("maple");
    expect(readPreference("carrom", "boardTheme")).toBe("ocean");
  });

  it("forgets a choice so the game follows the shared one again", () => {
    writeSharedPreference("soundSet", "robot");
    writePreference("chess", "soundSet", "piano");

    clearPreference("chess", "soundSet");
    expect(readPreference("chess", "soundSet")).toBe("robot");

    clearSharedPreference("soundSet");
    expect(readPreference("chess", "soundSet")).toBe(
      DEFAULT_PREFERENCES.soundSet,
    );
  });

  it("reads every choice of a game at once", () => {
    writePreference("chess", "coordinates", Coordinates.Inside);
    writePreference("chess", "animationSpeed", AnimationSpeed.Slow);
    writeSharedPreference("soundEnabled", false);

    const preferences = readPreferences("chess");
    expect(preferences.coordinates).toBe(Coordinates.Inside);
    expect(preferences.animationSpeed).toBe(AnimationSpeed.Slow);
    expect(preferences.soundEnabled).toBe(false);
    expect(preferences.pieceSet).toBe(DEFAULT_PREFERENCES.pieceSet);
  });

  it("keeps a broken choice from spoiling the game", () => {
    store.set("moongames.prefs.chess.soundVolume", "not a number");
    expect(readPreference("chess", "soundVolume")).toBe(
      DEFAULT_PREFERENCES.soundVolume,
    );

    store.set("moongames.prefs.chess.coordinates", "99");
    expect(readPreference("chess", "coordinates")).toBe(
      DEFAULT_PREFERENCES.coordinates,
    );
  });

  it("keeps the volume between nothing and everything", () => {
    writePreference("chess", "soundVolume", 5);
    expect(readPreference("chess", "soundVolume")).toBe(1);
    writePreference("chess", "soundVolume", -2);
    expect(readPreference("chess", "soundVolume")).toBe(0);
  });

  it("keeps the scope of a game, so it can follow the shared room", () => {
    expect(readPreferenceScope("chess")).toBe("game");
    writePreferenceScope("chess", "shared");
    expect(readPreferenceScope("chess")).toBe("shared");
    expect(readPreferenceScope("carrom")).toBe("game");
  });
});

describe("the movement of a piece", () => {
  it("has a time for every speed, and none when the travel is off", () => {
    expect(animationDuration(AnimationSpeed.None)).toBe(0);
    expect(animationDuration(AnimationSpeed.Fast)).toBeLessThan(
      animationDuration(AnimationSpeed.Normal),
    );
    expect(animationDuration(AnimationSpeed.Slow)).toBeGreaterThan(
      animationDuration(AnimationSpeed.Normal),
    );
  });
});
