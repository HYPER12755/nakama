import type { GameMode } from "./types";

export const UNO_MODE = {
  CLASSIC: "classic",
  SEVEN_O: "sevenO",
  PROGRESSIVE: "progressive",
  JUMP_IN: "jumpIn",
  ATTACK: "attack",
  NO_MERCY: "noMercy",
  FLIP: "flip",
  SWAP_PACK: "swapPack",
  REVERSE_PACK: "reversePack",
  STACK_PACK: "stackPack",
} as const;

export const UNO_MODES: readonly GameMode[] = [
  UNO_MODE.CLASSIC,
  UNO_MODE.SEVEN_O,
  UNO_MODE.PROGRESSIVE,
  UNO_MODE.JUMP_IN,
  UNO_MODE.ATTACK,
  UNO_MODE.NO_MERCY,
  UNO_MODE.FLIP,
  UNO_MODE.SWAP_PACK,
  UNO_MODE.REVERSE_PACK,
  UNO_MODE.STACK_PACK,
];

export const JUMP_WINDOW_MS = 1800;

export function isGameMode(value: unknown): value is GameMode {
  return UNO_MODES.some((mode) => mode === value);
}

export function normalizeMode(value: unknown): GameMode {
  return isGameMode(value) ? value : UNO_MODE.CLASSIC;
}

export const UNO_OP = {
  STATE: 1,
  CHAT: 2,
  MOVE: 3,
  GAME_OVER: 4,
  ERROR: 5,
  PLAYER_JOINED: 6,
  PLAYER_LEFT: 7,
  MATCH_STARTED: 8,
  PONG: 9,
  SPECTATOR_JOINED: 10,
  SPECTATOR_LEFT: 11,
  PLAY_REQUEST: 101,
  DRAW_REQUEST: 102,
  CHALLENGE_REQUEST: 103,
  CHAT_SEND: 104,
  REQUEST_STATE: 105,
  RESIGN: 106,
  PING: 107,
} as const;

export const UNO_CLIENT_OP = {
  COLOR_CHOOSE: 108,
} as const;

export const UNO_COLOR_CHOOSE_OP = UNO_CLIENT_OP.COLOR_CHOOSE;

export const UNO_ERROR = {
  NOT_YOUR_TURN: "not_your_turn",
  ILLEGAL_CARD: "illegal_card",
  BAD_CHALLENGE: "bad_challenge",
  GAME_OVER: "game_over",
  UNKNOWN_CARD: "unknown_card",
  MISSING_COLOR: "missing_color",
  MISSING_TARGET: "missing_target",
  JUMP_WINDOW_OPEN: "jump_window_open",
  BAD_JUMP: "bad_jump",
} as const;
