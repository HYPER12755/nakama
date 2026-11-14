import { describe, expect, it } from "vitest";
import {
  sideForViewer,
  viewRotation,
  type CarromPlayer,
} from "@moongames/carrom-core";
import {
  PLAY_INSET,
  PLAY_SIZE,
  boardToScreen,
  screenToBoard,
} from "../src/lib/view";

/**
 * The table is turned so the player it belongs to sits at the bottom of the
 * screen. These tests make sure the pointer and the board still agree when
 * the table is turned.
 */
describe("the turned table", () => {
  it("keeps the pointer on the same spot of the board", () => {
    const rotations = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    for (const rotation of rotations) {
      for (const point of [
        { x: 0.5, y: 0.5 },
        { x: 0.2, y: 0.8 },
        { x: 0.9, y: 0.1 },
      ]) {
        const screen = boardToScreen(point.x, point.y, rotation);
        const back = screenToBoard(screen.x, screen.y, rotation);
        expect(back.x).toBeCloseTo(point.x, 6);
        expect(back.y).toBeCloseTo(point.y, 6);
      }
    }
  });

  it("puts the bottom of the board at the bottom of the screen", () => {
    const centre = PLAY_INSET + PLAY_SIZE / 2;
    const bottom = boardToScreen(0.5, 1, 0);
    expect(bottom.y).toBeGreaterThan(centre);
    const left = boardToScreen(0, 0.5, 0);
    expect(left.x).toBeLessThan(centre);
  });

  it("turns the board so the player sits at the bottom", () => {
    const players: CarromPlayer[] = ["white", "black", "green", "yellow"];
    for (const player of players) {
      const rotation = viewRotation(player);
      // The player's own side of the table is at the bottom of the screen.
      const own = sideForViewer(player, player);
      expect(own).toBe("bottom");
      // The point on the board that belongs to that side ends up low on the
      // screen.
      const board =
        player === "white"
          ? { x: 0.5, y: 0.75 }
          : player === "black"
            ? { x: 0.5, y: 0.25 }
            : player === "yellow"
              ? { x: 0.25, y: 0.5 }
              : { x: 0.75, y: 0.5 };
      const screen = boardToScreen(board.x, board.y, rotation);
      const centre = PLAY_INSET + PLAY_SIZE / 2;
      expect(screen.y).toBeGreaterThan(centre);
    }
  });

  it("keeps the aim honest when the table is turned", () => {
    // A player at the top of the table aims at the centre of the table.
    const rotation = viewRotation("black");
    const centre = screenToBoard(
      PLAY_INSET + PLAY_SIZE / 2,
      PLAY_INSET + PLAY_SIZE / 2,
      rotation,
    );
    expect(centre.x).toBeCloseTo(0.5, 6);
    expect(centre.y).toBeCloseTo(0.5, 6);
  });
});
