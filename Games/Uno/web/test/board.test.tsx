import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { UnoBoardStage } from "../src/components/UnoBoardStage";
import type { BoardView } from "../src/lib/view";

const view: BoardView = {
  players: [
    { seat: 0, userId: "me", username: "You", connected: true, count: 3, hand: [
      { id: "red-5-0", color: "red", kind: "number", value: 5 },
      { id: "blue-2-0", color: "blue", kind: "number", value: 2 },
    ] },
    { seat: 1, userId: "them", username: "Rival", connected: true, count: 4 },
  ],
  spectators: [],
  chat: [],
  topCard: { id: "yellow-1-0", color: "yellow", kind: "number", value: 1 },
  currentColor: "yellow",
  turn: 0,
  direction: 1,
  deckCount: 40,
  pendingChallenge: null,
  legalCards: ["red-5-0", "blue-2-0"],
  canDraw: true,
  result: null,
  myUserId: "me",
  started: true,
};

describe("Uno board stage", () => {
  it("renders the draw pile, discard and hand from individual SVGs", () => {
    const html = renderToStaticMarkup(
      <UnoBoardStage
        view={view}
        cardSet="neon"
        dealKey={1}
        activeColor="yellow"
        direction={1}
        highlight="lift"
        pileStyle="stack"
        onPlay={() => undefined}
        onDraw={() => undefined}
        onChallenge={() => undefined}
        onUno={() => undefined}
      />,
    );
    expect(html).toContain("cards-neon/card-back.svg");
    expect(html).toContain("cards-neon/yellow-1-0.svg");
    expect(html).toContain("cards-neon/red-5-0.svg");
    expect(html).toContain("uno-table-surface");
  });
});
