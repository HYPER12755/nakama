// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ArtPicker } from "../src/components/ArtPicker";
import { useArtChoices } from "../src/hooks/useArtChoices";
import { tableVisuals } from "../src/lib/designs";
import { COSMETIC_GROUPS } from "../src/lib/cosmetics";

const theme = "dark" as const;

function Harness() {
  const { choices, choose } = useArtChoices();
  const visuals = tableVisuals("tournament", "brass", "standard", choices);
  return (
    <div>
      <ArtPicker
        choices={choices}
        onChoose={choose}
        onReset={() => undefined}
        theme={theme}
        visuals={visuals}
      />
      <span data-testid="board-path">{visuals.paths.boards ?? "none"}</span>
      <span data-testid="striker-path">{visuals.paths.strikers ?? "none"}</span>
      <span data-testid="puck-path">{visuals.paths.pucks ?? "none"}</span>
    </div>
  );
}

describe("choosing cosmetics", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Harness />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("a chosen board reaches the visuals immediately", () => {
    const group = COSMETIC_GROUPS.find((g) => g.id === "boards")!;
    const button = [...container.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-expanded") === "false" && b.textContent?.includes("Boards"),
    )!;
    act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    const tiles = [...container.querySelectorAll("button.art-tile")];
    expect(tiles.length).toBeGreaterThan(group.options.length - 1);

    const ripped = group.options.find((o) => !o.id.startsWith("builtin:"))!;
    const tile = tiles.find((t) => t.getAttribute("title") === ripped.label)!;
    expect(tile).toBeDefined();

    act(() => tile.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    const path = container.querySelector('[data-testid="board-path"]')!.textContent;
    expect(path).toBe(ripped.id);
  });

  it("a chosen striker reaches the visuals immediately", () => {
    const group = COSMETIC_GROUPS.find((g) => g.id === "strikers")!;
    const button = [...container.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-expanded") === "false" && b.textContent?.includes("Strikers"),
    )!;
    act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    const ripped = group.options.find((o) => !o.id.startsWith("builtin:"))!;
    const tile = [...container.querySelectorAll("button.art-tile")].find(
      (t) => t.getAttribute("title") === ripped.label,
    )!;
    act(() => tile.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(container.querySelector('[data-testid="striker-path"]')!.textContent).toBe(
      ripped.id,
    );
  });
});
