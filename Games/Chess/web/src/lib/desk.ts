/**
 * The desk: a place to open a game or a position.
 *
 * A player can bring a game from somewhere else and walk through it, or
 * bring a position and look at it, or play from it.
 */

import { ChessEngine } from "@moongames/chess-core";
import { replayFrames, type ReplayFrame } from "./replay";

/** What the player brought to the desk. */
export type DeskInput =
  | { kind: "fen"; fen: string }
  | { kind: "pgn"; pgn: string }
  | { kind: "none" };

/** A position that was opened at the desk. */
export interface DeskPosition {
  /** The board at every step of the game, or one board for a position. */
  frames: ReplayFrame[];
  /** The moves of the game, in the way a player writes them. */
  steps: string[];
  /** The position, in the way it is written down. */
  fen: string;
  /** What went wrong, when something did. */
  error: string | null;
}

/**
 * Tell what the player brought: a position, a game, or nothing that can be
 * read.
 *
 * A position is six fields with a board in the first. A game has its tags,
 * or it is written in moves.
 */
export function readDeskInput(text: string): DeskInput {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { kind: "none" };
  }

  const fields = trimmed.split(/\s+/);
  if (fields.length === 6 && fields[0].includes("/")) {
    return { kind: "fen", fen: trimmed };
  }

  if (trimmed.startsWith("[") || /^\d+\s*\.(\.\.)?/.test(trimmed)) {
    return { kind: "pgn", pgn: trimmed };
  }

  return { kind: "none" };
}

/** True when the position can be put on a board. */
export function isValidFen(fen: string): boolean {
  const engine = new ChessEngine();
  try {
    engine.load(fen);
    return true;
  } catch {
    return false;
  }
}

/** The names a game carries in its tags. */
export interface DeskTags {
  /** How the game ended. */
  result: string;
  /** The name of the white player. */
  white: string;
  /** The name of the black player. */
  black: string;
}

/**
 * Read the tags of a game: how it ended, and who played it.
 *
 * A game without tags has no names and no result, and that is allowed.
 */
export function readDeskTags(text: string): DeskTags {
  const tags: DeskTags = { result: "*", white: "", black: "" };

  const tag = (name: string): string | null => {
    const match = new RegExp(
      `\\[${name}\\s+"([^"]*)"\\]`,
      "i",
    ).exec(text);
    return match === null ? null : match[1];
  };

  const result = tag("Result");
  if (result !== null && result.trim().length > 0) {
    tags.result = result.trim();
  }

  const white = tag("White");
  if (white !== null) {
    tags.white = white.trim();
  }

  const black = tag("Black");
  if (black !== null) {
    tags.black = black.trim();
  }

  return tags;
}

/**
 * Put a game on the desk, so it can be walked through.
 */
export function openGame(pgn: string): DeskPosition {
  const engine = new ChessEngine();
  try {
    engine.loadPgn(pgn);
  } catch (cause) {
    return {
      frames: [],
      steps: [],
      fen: "",
      error:
        cause instanceof Error
          ? `That game could not be read: ${cause.message}`
          : "That game could not be read.",
    };
  }

  const steps = engine.history.map((move) => move.san);
  const frames = replayFrames(steps);
  return {
    frames,
    steps,
    fen: frames[frames.length - 1]?.state.fen ?? "",
    error: null,
  };
}

/**
 * Put a position on the desk, so it can be looked at and played from.
 */
export function openPosition(fen: string): DeskPosition {
  const engine = new ChessEngine();
  try {
    engine.load(fen);
  } catch (cause) {
    return {
      frames: [],
      steps: [],
      fen: "",
      error:
        cause instanceof Error
          ? `That position could not be read: ${cause.message}`
          : "That position could not be read.",
    };
  }

  const state = engine.getState();
  return {
    frames: [{ ply: 0, state, san: null }],
    steps: [],
    fen: state.fen,
    error: null,
  };
}

/** The game at the desk, written as it can be carried away. */
export function deskPgn(steps: string[], result = "*"): string {
  if (steps.length === 0) {
    return "";
  }
  const moves: string[] = [];
  for (let index = 0; index < steps.length; index += 1) {
    if (index % 2 === 0) {
      moves.push(`${index / 2 + 1}.`);
    }
    moves.push(steps[index]);
  }
  return `${moves.join(" ")} ${result}`;
}
