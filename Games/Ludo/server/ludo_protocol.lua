-- MoonGames Ludo wire protocol.
-- Server opcodes are below 100, client opcodes are 101 and up. This module has
-- no Nakama dependency so it can be tested with plain Lua.

local protocol = {}

protocol.OP = {
  STATE = 1,
  ROLL = 2,
  MOVE = 3,
  GAME_OVER = 4,
  ERROR = 5,
  PLAYER_JOINED = 6,
  PLAYER_LEFT = 7,
  MATCH_STARTED = 8,
  CHAT = 9,
  SPECTATOR_JOINED = 10,
  SPECTATOR_LEFT = 11,
  PONG = 15,

  ROLL_REQUEST = 101,
  MOVE_REQUEST = 102,
  REQUEST_STATE = 103,
  CHAT_SEND = 104,
  PING = 105,
  RESIGN = 106,
}

protocol.ERROR = {
  NOT_YOUR_TURN = "not-your-turn",
  BAD_PHASE = "bad-phase",
  BAD_MOVE = "bad-move",
  MATCH_FULL = "match-full",
  MATCH_OVER = "match-over",
}

protocol.CHAT_MAX_LENGTH = 240
protocol.CHAT_MAX_BYTES = 960
protocol.CHAT_MAX_MESSAGES = 40
protocol.CHAT_RATE_LIMIT_MS = 700

protocol.MIN_SEATS = 2
protocol.MAX_SEATS = 4
protocol.COLOURS = { "red", "green", "yellow", "blue" }

local TABLE_COLOURS = {
  [2] = { "red", "green" },
  [3] = { "red", "green", "yellow" },
  [4] = { "red", "green", "yellow", "blue" },
}

function protocol.table_colours(seats)
  return TABLE_COLOURS[protocol.clamp_seats(seats)]
end

function protocol.clamp_seats(value)
  local seats = tonumber(value) or protocol.MIN_SEATS
  if seats < protocol.MIN_SEATS then
    return protocol.MIN_SEATS
  end
  if seats > protocol.MAX_SEATS then
    return protocol.MAX_SEATS
  end
  return math.floor(seats)
end

function protocol.is_colour(value)
  for _, colour in ipairs(protocol.COLOURS) do
    if colour == value then
      return true
    end
  end
  return false
end

-- The label drives quick-match discovery. Fields: game, mode, seats, status.
function protocol.label(mode, seats, status)
  return table.concat({
    "ludo",
    mode == "private" and "private" or "quick",
    tostring(protocol.clamp_seats(seats)),
    status or "open",
  }, "|")
end

function protocol.quick_label(seats)
  return protocol.label("quick", seats, "open")
end

protocol.TURN_SECONDS = { 0, 15, 30, 60 }

function protocol.clamp_turn_seconds(value)
  local seconds = tonumber(value) or 0
  for _, allowed in ipairs(protocol.TURN_SECONDS) do
    if allowed == seconds then
      return allowed
    end
  end
  return 0
end

function protocol.chat_length(text)
  if type(utf8) == "table" and type(utf8.len) == "function" then
    local ok, length = pcall(utf8.len, text)
    if ok and length then
      return length
    end
  end
  return #text
end

function protocol.normalize_chat(text)
  if type(text) ~= "string" then
    return nil
  end
  local trimmed = text:gsub("^%s+", ""):gsub("%s+$", "")
  if trimmed == "" then
    return nil
  end
  if #trimmed > protocol.CHAT_MAX_BYTES then
    trimmed = trimmed:sub(1, protocol.CHAT_MAX_BYTES)
  end
  while protocol.chat_length(trimmed) > protocol.CHAT_MAX_LENGTH do
    trimmed = trimmed:sub(1, #trimmed - 1)
  end
  if trimmed == "" then
    return nil
  end
  return trimmed
end

return protocol
