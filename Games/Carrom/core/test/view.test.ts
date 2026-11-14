import { describe, expect, it } from "vitest";
import {
  sideForViewer,
  sideOf,
  viewRotation,
  type CarromPlayer,
} from "../src";

const PLAYERS: CarromPlayer[] = ["white", "black", "green", "yellow"];

describe("the turned table", () => {
  it("knows the edge every player sits at", () => {
    expect(sideOf("white")).toBe("bottom");
    expect(sideOf("yellow")).toBe("left");
    expect(sideOf("black")).toBe("top");
    expect(sideOf("green")).toBe("right");
  });

  it("turns the table so a player sits at the bottom", () => {
    expect(viewRotation("white")).toBe(0);
    expect(Math.abs(viewRotation("black") - Math.PI)).toBeLessThan(0.000001);
    expect(Math.abs(viewRotation("yellow") + Math.PI / 2)).toBeLessThan(0.000001);
    expect(Math.abs(viewRotation("green") - Math.PI / 2)).toBeLessThan(0.000001);
  });

  it("keeps the viewer at the bottom of their own table", () => {
    for (const viewer of PLAYERS) {
      expect(sideForViewer(viewer, viewer)).toBe("bottom");
    }
  });

  it("shows the other players on the other edges", () => {
    // A player at the top of the table sees the player on the left of the
    // table on their own right.
    expect(sideForViewer("yellow", "black")).toBe("right");
    expect(sideForViewer("green", "black")).toBe("left");
    expect(sideForViewer("black", "white")).toBe("top");
    expect(sideForViewer("yellow", "white")).toBe("left");
    // A player on the left of the table sees the bottom player on their
    // right.
    expect(sideForViewer("white", "yellow")).toBe("right");
    expect(sideForViewer("black", "yellow")).toBe("left");
    expect(sideForViewer("green", "yellow")).toBe("top");
  });

  it("never puts two players on the same edge", () => {
    for (const viewer of PLAYERS) {
      const edges = new Set(PLAYERS.map((player) => sideForViewer(player, viewer)));
      expect(edges.size).toBe(PLAYERS.length);
    }
  });
});
