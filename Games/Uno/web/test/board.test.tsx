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
  flipSide: "light",
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

  it("shows a pending stack overlay with take and stack actions for the target", () => {
    const stackView: BoardView = {
      ...view,
      mode: "progressive",
      pendingStack: { ownerId: "them", targetId: "me", kind: "draw2", count: 4 },
      players: [
        {
          ...view.players[0],
          hand: [
            ...(view.players[0].hand ?? []),
            { id: "green-draw2-0", color: "green", kind: "draw2" },
          ],
        },
        view.players[1],
      ],
      legalCards: ["red-5-0", "blue-2-0", "green-draw2-0"],
    };
    const html = renderToStaticMarkup(
      <UnoBoardStage
        view={stackView}
        cardSet="classic"
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
    expect(html).toContain('aria-label="Pending draw stack"');
    expect(html).toContain("Draw Two chain");
    expect(html).toContain("Take 4");
    expect(html).toContain("Stack Draw Two");
  });

  it("offers a legal Wild NO U against a Reverse Pack stack", () => {
    const reverseView: BoardView = {
      ...view,
      rulesMode: "reversePack",
      pendingStack: { ownerId: "them", targetId: "me", kind: "draw2", count: 2 },
      players: [
        {
          ...view.players[0],
          hand: [
            ...(view.players[0].hand ?? []),
            { id: "wildnou-0", color: null, kind: "wildNoU" },
          ],
        },
        view.players[1],
      ],
      legalCards: ["wildnou-0"],
    };
    const html = renderToStaticMarkup(
      <UnoBoardStage
        view={reverseView}
        cardSet="classic"
        dealKey={1}
        activeColor="yellow"
        direction={-1}
        highlight="lift"
        pileStyle="stack"
        onPlay={() => undefined}
        onDraw={() => undefined}
        onChallenge={() => undefined}
        onUno={() => undefined}
      />,
    );
    expect(html).toContain('aria-label="Pending draw stack"');
    expect(html).toContain("cards/wildnou-0.svg");
    expect(html).toContain("NO U!");
  });

  it("offers a legal Wild NO U against a Reverse Pack challenge", () => {
    const reverseView: BoardView = {
      ...view,
      rulesMode: "reversePack",
      pendingChallenge: {
        ownerId: "them",
        targetId: "me",
        legal: true,
        kind: "wild4",
        amount: 4,
        color: "red",
      },
      players: [
        {
          ...view.players[0],
          hand: [
            ...(view.players[0].hand ?? []),
            { id: "wildnou-1", color: null, kind: "wildNoU" },
          ],
        },
        view.players[1],
      ],
      legalCards: ["wildnou-1"],
    };
    const html = renderToStaticMarkup(
      <UnoBoardStage
        view={reverseView}
        cardSet="classic"
        dealKey={1}
        activeColor="red"
        direction={-1}
        highlight="lift"
        pileStyle="stack"
        onPlay={() => undefined}
        onDraw={() => undefined}
        onChallenge={() => undefined}
        onUno={() => undefined}
      />,
    );
    expect(html).toContain("Challenge the play?");
    expect(html).toContain("NO U!");
  });

  it("does not show a pending stack overlay to a non-target", () => {
    const stackView: BoardView = {
      ...view,
      pendingStack: { ownerId: "me", targetId: "them", kind: "wild4", count: 8 },
    };
    const html = renderToStaticMarkup(
      <UnoBoardStage
        view={stackView}
        cardSet="classic"
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
    expect(html).not.toContain('aria-label="Pending draw stack"');
  });
});
