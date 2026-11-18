import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GameOverDialog } from "../src/components/GameOverDialog";
import { RulesDialog } from "../src/components/RulesDialog";
import { pieceGrain } from "../src/components/CarromBoard";
import { boardPlayers } from "../src/lib/tableSetup";
import { isAiPlayer } from "../src/App";

describe("the board a mode change builds", () => {
  it("does not keep the seats of the old mode", () => {
    expect(boardPlayers("local", 4)).toHaveLength(4);
    expect(boardPlayers("ai", 4)).toHaveLength(4);
    expect(boardPlayers("online", 4)).toHaveLength(4);
    expect(boardPlayers("local", 4, true)).toHaveLength(2);
  });

  it("lets any seat be played by the computer", () => {
    expect(isAiPlayer("ai", "white", ["white"])).toBe(true);
    expect(isAiPlayer("ai", "green", ["green", "yellow"])).toBe(true);
    expect(isAiPlayer("ai", "black", ["green"])).toBe(false);
    expect(isAiPlayer("local", "black", ["black"])).toBe(false);
  });
});

describe("the grain of a piece", () => {
  it("stays with the piece as it moves", () => {
    const grain = pieceGrain("white-3");
    expect(pieceGrain("white-3")).toBe(grain);
    expect(grain).toBeGreaterThanOrEqual(0);
    expect(grain).toBeLessThan(4);
  });

  it("is not taken from the square the piece is on", () => {
    expect(pieceGrain("white-3")).not.toBe(pieceGrain("white-4"));
  });
});

describe("the copy at the end of a table", () => {
  const base = {
    winner: "white" as const,
    onNewGame: () => undefined,
    onClose: () => undefined,
  };

  it("describes the queen in a classic finish", () => {
    const html = renderToStaticMarkup(
      <GameOverDialog {...base} variant="classic" seats={2} />,
    );
    expect(html).toContain("queen is covered");
  });

  it("does not demand a covered queen in freestyle", () => {
    const html = renderToStaticMarkup(
      <GameOverDialog {...base} variant="freestyle" seats={2} />,
    );
    expect(html).toContain("ordinary piece");
    expect(html).not.toContain("queen is covered");
  });

  it("says a practice table keeps no score", () => {
    const html = renderToStaticMarkup(
      <GameOverDialog {...base} variant="practice" seats={2} />,
    );
    expect(html).toContain("Practice tables keep no score");
  });

  it("speaks of the table on a four player finish", () => {
    const html = renderToStaticMarkup(
      <GameOverDialog {...base} variant="classic" seats={4} />,
    );
    expect(html).toContain("cleared their pieces first at this table");
  });

  it("names the winning side in doubles", () => {
    const html = renderToStaticMarkup(
      <GameOverDialog
        {...base}
        variant="classic"
        seats={4}
        winnerTeam="A"
        winnerTeamLabel="TEAM 1"
      />,
    );
    expect(html).toContain("Doubles");
    expect(html).toContain("TEAM 1 wins");
    expect(html).toContain("cleared both partners&#x27; pieces");
  });
});

describe("the rules guide", () => {
  it("names every colour at a four player table", () => {
    const html = renderToStaticMarkup(
      <RulesDialog
        open
        onClose={() => undefined}
        variant="classic"
        colours={["white", "yellow", "black", "green"]}
      />,
    );
    expect(html).toContain("PLAYER pockets player");
    expect(html).toContain("PLAYER pockets player");
  });

  it("explains the queen by the game type", () => {
    const classic = renderToStaticMarkup(
      <RulesDialog open onClose={() => undefined} variant="classic" />,
    );
    const freestyle = renderToStaticMarkup(
      <RulesDialog open onClose={() => undefined} variant="freestyle" />,
    );
    expect(classic).toContain("Cover the queen");
    expect(freestyle).toContain("ordinary piece");
    expect(freestyle).not.toContain("Cover the queen");
  });
});
