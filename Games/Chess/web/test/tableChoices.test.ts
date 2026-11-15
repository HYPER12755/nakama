import { describe, expect, it } from "vitest";
import { AutoQueen, MoveEvent, ShowClockTenths } from "@moongames/game-ui";
import { formatClock } from "../src/components/ChessGameStats";
import { promotionPiece } from "../src/lib/promotion";

/**
 * The choices a chess player makes about the table: how a pawn is promoted,
 * how a piece is moved, and what the clock shows.
 */

describe("the clock", () => {
  it("shows the minutes and the seconds", () => {
    expect(formatClock(65_000, ShowClockTenths.Never)).toBe("1:05");
    expect(formatClock(9_000, ShowClockTenths.Never)).toBe("0:09");
    expect(formatClock(null, ShowClockTenths.Never)).toBe("—");
  });

  it("shows the tenths when the clock is nearly out", () => {
    expect(formatClock(9_400, ShowClockTenths.Below10Seconds)).toBe("0:09.4");
    expect(formatClock(65_000, ShowClockTenths.Below10Seconds)).toBe("1:05");
  });

  it("shows the tenths always when that is the choice", () => {
    expect(formatClock(65_000, ShowClockTenths.Always)).toBe("1:05.0");
    expect(formatClock(9_400, ShowClockTenths.Always)).toBe("0:09.4");
  });

  it("never counts below zero", () => {
    expect(formatClock(-5, ShowClockTenths.Never)).toBe("0:00");
  });
});

describe("the ways a piece can be moved", () => {
  it("has a way to click, a way to drag, and both", () => {
    expect(Object.keys(MoveEvent).length).toBeGreaterThanOrEqual(3);
    expect(MoveEvent.Click).not.toBe(MoveEvent.Drag);
    expect(MoveEvent.ClickOrDrag).not.toBe(MoveEvent.Drag);
  });

  it("has a way to promote a pawn", () => {
    expect(AutoQueen.Never).not.toBe(AutoQueen.Always);
    expect(AutoQueen.OnPromotion).not.toBe(AutoQueen.Never);
  });
});

describe("a pawn that reaches the last rank", () => {
  it("asks the player unless the choice says otherwise", () => {
    expect(promotionPiece(AutoQueen.Never, true)).toBeNull();
    expect(promotionPiece(AutoQueen.OnPromotion, true)).toBeNull();
  });

  it("is a queen at once when that is the choice", () => {
    expect(promotionPiece(AutoQueen.Always, true)).toBe("q");
  });

  it("is left alone when the move needs no promotion", () => {
    expect(promotionPiece(AutoQueen.Always, false)).toBeNull();
  });
});
