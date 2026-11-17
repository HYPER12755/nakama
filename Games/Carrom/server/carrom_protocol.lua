-- MoonGames Carrom wire protocol.
--
-- Server opcodes are below 100, client opcodes are 101 and up. The module has
-- no Nakama dependencies so it can be tested with plain Lua.

local protocol = {}

protocol.OP = {
  -- Server -> client
  STATE = 1,
  SHOT = 2,
  GAME_OVER = 3,
  ERROR = 4,
  PLAYER_JOINED = 5,
  PLAYER_LEFT = 6,
  MATCH_STARTED = 7,
  CHAT = 8,
  SPECTATOR_JOINED = 9,
  SPECTATOR_LEFT = 10,
  PONG = 15,

  -- Client -> server
  SHOT_REQUEST = 101,
  REQUEST_STATE = 102,
  CHAT_SEND = 103,
  PING = 104,
}

protocol.CHAT_MAX_LENGTH = 240
protocol.CHAT_MAX_BYTES = 960
protocol.CHAT_MAX_MESSAGES = 40
protocol.CHAT_RATE_LIMIT_MS = 700

protocol.MIN_SEATS = 2
protocol.MAX_SEATS = 4

-- The label used to find an open quick table of the same size. It follows the
-- same shape as the Chess label: game, mode, table size, status, and the
-- game type, so a table is only offered to a player who wants the same rules.
function protocol.label(mode, seats, status, variant)
  return table.concat({
    "carrom",
    mode,
    tostring(seats),
    status or "open",
    protocol.clamp_variant(variant),
  }, "|")
end

function protocol.quick_label(seats, variant)
  return protocol.label("quick", seats, "open", variant)
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

-- The pieces that belong to a player, as opposed to the queen or the striker.
protocol.COLOURS = { "white", "black", "green", "yellow" }

function protocol.is_colour(value)
  for _, colour in ipairs(protocol.COLOURS) do
    if colour == value then
      return true
    end
  end
  return false
end

-- The game types a table can be played with.
protocol.VARIANTS = { "classic", "freestyle", "practice" }

function protocol.clamp_variant(value)
  if type(value) ~= "string" then
    return "classic"
  end
  for _, variant in ipairs(protocol.VARIANTS) do
    if variant == value then
      return variant
    end
  end
  return "classic"
end

-- The shot clocks a table can use. Zero means the table has no clock.
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

-- The strikers a player can bring to the table.
protocol.STRIKERS = { "classic", "heavy", "light", "swift" }

function protocol.clamp_striker(value)
  if type(value) ~= "string" then
    return nil
  end
  for _, striker in ipairs(protocol.STRIKERS) do
    if striker == value then
      return striker
    end
  end
  return nil
end

-- Nakama's Lua runtime does not expose the utf8 library, so the length check
-- falls back to the byte length when utf8 is unavailable.
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
