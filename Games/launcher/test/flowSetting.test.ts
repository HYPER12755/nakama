import { describe, expect, it } from "vitest";
import {
  flowSettingEnabled,
  flowSettingOverride,
  globalFlowEnabled,
  setGlobalFlowEnabled,
} from "@moongames/game-ui";

/**
 * The organized steps have a choice in the menu that every game follows, and
 * a choice in each game that wins over the menu's.
 */
describe("the organized steps", () => {
  it("follows the menu when a game has not chosen", () => {
    const store = new Map<string, string>();
    const original = globalThis.window;
    const fake = {
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
    (globalThis as { window?: unknown }).window = fake;
    try {
      setGlobalFlowEnabled(true);
      expect(globalFlowEnabled()).toBe(true);
      expect(flowSettingOverride("some-game")).toBeNull();
      expect(flowSettingEnabled("some-game")).toBe(true);

      setGlobalFlowEnabled(false);
      expect(flowSettingEnabled("some-game")).toBe(false);
    } finally {
      (globalThis as { window?: unknown }).window = original;
    }
  });
});
