// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createGame, legalMoves, rollDice } from "@moongames/ludo-core";
import { LudoBoard } from "../src/components/LudoBoard";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(state: ReturnType<typeof createGame>, legalTokens: number[], onTokenClick: (token: number) => void) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<LudoBoard state={state} legalTokens={legalTokens} onTokenClick={onTokenClick} />);
  });
  return host.querySelector("canvas")!;
}

describe("the Ludo board component", () => {
  it("renders a square canvas", () => {
    const canvas = mount(createGame({ seed: 1 }), [], () => {});
    expect(canvas.tagName).toBe("CANVAS");
    expect(canvas.getAttribute("aria-label")).toContain("Ludo board");
  });

  it("reports a legal token click", () => {
    const state = createGame({ seed: 1 });
    state.phase = "move";
    state.dice = 6;
    let clicked = -1;
    const canvas = mount(state, [0, 1, 2, 3], (token) => { clicked = token; });
    // Yard spot of red token 0 is cell 1.35,1.35 of a 15x15/600px board.
    const rect = canvas.getBoundingClientRect();
    act(() => {
      canvas.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        clientX: rect.left + ((1.35 + 0.5) / 15) * (rect.width || 600),
        clientY: rect.top + ((1.35 + 0.5) / 15) * (rect.height || 600),
      }));
    });
    expect(clicked).toBe(0);
  });

  it("ignores clicks on tokens that cannot move", () => {
    const state = createGame({ seed: 1 });
    state.phase = "move";
    state.dice = 3;
    let clicked = -1;
    const canvas = mount(state, [], (token) => { clicked = token; });
    act(() => {
      canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 10 }));
    });
    expect(clicked).toBe(-1);
  });

  it("paints a legal move after a six", () => {
    const state = createGame({ seed: 1 });
    rollDice(state);
    state.phase = "move";
    state.dice = 6;
    const legal = legalMoves(state).map((move) => move.token);
    const canvas = mount(state, legal, () => {});
    expect(canvas.width).toBeGreaterThan(0);
    expect(legal).toEqual([0, 1, 2, 3]);
  });
});
