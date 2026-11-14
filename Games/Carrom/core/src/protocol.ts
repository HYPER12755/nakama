/**
 * The Carrom wire protocol.
 *
 * The client and the authoritative server agree on these opcodes, so the
 * numbers live in the core next to the rules they belong to. The Lua server
 * keeps its own copy in Carrom/server/carrom_protocol.lua.
 */

export const CARROM_OP = {
  /** Server to client. */
  STATE: 1,
  SHOT: 2,
  GAME_OVER: 3,
  ERROR: 4,
  PLAYER_JOINED: 5,
  PLAYER_LEFT: 6,
  MATCH_STARTED: 7,
  CHAT: 8,
  SPECTATOR_JOINED: 9,
  SPECTATOR_LEFT: 10,
  PONG: 15,

  /** Client to server. */
  SHOT_REQUEST: 101,
  REQUEST_STATE: 102,
  CHAT_SEND: 103,
  PING: 104,
} as const;

export type CarromOpCode = (typeof CARROM_OP)[keyof typeof CARROM_OP];
