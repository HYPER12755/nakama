/**
 * The Ludo wire protocol. Server opcodes are below 100, client opcodes are
 * 101 and above. The authoritative Lua server keeps its own copy in
 * Ludo/server/ludo_protocol.lua, and the parity test asserts they match.
 */

export const LUDO_OP = {
  /** Server to client. */
  STATE: 1,
  ROLL: 2,
  MOVE: 3,
  GAME_OVER: 4,
  ERROR: 5,
  PLAYER_JOINED: 6,
  PLAYER_LEFT: 7,
  MATCH_STARTED: 8,
  CHAT: 9,
  SPECTATOR_JOINED: 10,
  SPECTATOR_LEFT: 11,
  PONG: 15,

  /** Client to server. */
  ROLL_REQUEST: 101,
  MOVE_REQUEST: 102,
  REQUEST_STATE: 103,
  CHAT_SEND: 104,
  PING: 105,
  RESIGN: 106,
} as const;

export type LudoOpCode = (typeof LUDO_OP)[keyof typeof LUDO_OP];

export const LUDO_ERROR = {
  NOT_YOUR_TURN: "not-your-turn",
  BAD_PHASE: "bad-phase",
  BAD_MOVE: "bad-move",
  MATCH_FULL: "match-full",
  MATCH_OVER: "match-over",
} as const;

export type LudoErrorCode = (typeof LUDO_ERROR)[keyof typeof LUDO_ERROR];
