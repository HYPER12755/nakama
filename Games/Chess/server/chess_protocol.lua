-- MoonGames Chess wire protocol constants and time-control parsing.
--
-- This module has no Nakama dependencies so it can be tested with plain Lua.
-- Client opcodes are in the 100+ range; server opcodes are below 100.

local protocol = {}

protocol.OP = {
  -- Server -> client
  STATE = 1,
  CLOCK = 2,
  MOVE = 3,
  GAME_OVER = 4,
  DRAW_OFFER = 5,
  DRAW_DECLINED = 6,
  ERROR = 7,
  PLAYER_JOINED = 8,
  PLAYER_LEFT = 9,
  MATCH_STARTED = 10,
  PONG = 11,
  SPECTATOR_JOINED = 12,
  SPECTATOR_LEFT = 13,

  -- Client -> server
  MOVE_REQUEST = 101,
  RESIGN = 102,
  DRAW_OFFER_REQUEST = 103,
  DRAW_ACCEPT = 104,
  DRAW_DECLINE = 105,
  REQUEST_STATE = 106,
  PING = 107,
}

protocol.DEFAULT_TIME_CONTROL = {
  initial_ms = 300000,
  increment_ms = 0,
}

protocol.MIN_INITIAL_MS = 30000
protocol.MAX_INITIAL_MS = 1800000
protocol.MAX_INCREMENT_MS = 60000

local function copy_default()
  return {
    initial_ms = protocol.DEFAULT_TIME_CONTROL.initial_ms,
    increment_ms = protocol.DEFAULT_TIME_CONTROL.increment_ms,
  }
end

local function read_number(value, keys)
  for _, key in ipairs(keys) do
    if value[key] ~= nil then
      return tonumber(value[key])
    end
  end
  return nil
end

function protocol.parse_time_control(value)
  local result = copy_default()

  if value == nil then
    return result
  end

  if type(value) == "string" then
    local minutes, increment = string.match(value, "^(%d+)%+(%d+)$")
    if not minutes then
      return nil, "time control must look like '5+0'"
    end
    result.initial_ms = tonumber(minutes) * 60000
    result.increment_ms = tonumber(increment) * 1000
  elseif type(value) == "table" then
    local initial = read_number(value, {
      "initialMs",
      "initial_ms",
      "initial",
    })
    local increment = read_number(value, {
      "incrementMs",
      "increment_ms",
      "increment",
    })

    if value.initialMs ~= nil or value.initial_ms ~= nil or value.initial ~= nil then
      if initial == nil then
        return nil, "initial time must be a number"
      end
      result.initial_ms = initial
    end

    if
      value.incrementMs ~= nil
      or value.increment_ms ~= nil
      or value.increment ~= nil
    then
      if increment == nil then
        return nil, "increment must be a number"
      end
      result.increment_ms = increment
    end
  else
    return nil, "time control must be a table or string"
  end

  if
    result.initial_ms < protocol.MIN_INITIAL_MS
    or result.initial_ms > protocol.MAX_INITIAL_MS
  then
    return nil,
      string.format(
        "initial time must be between %d and %d ms",
        protocol.MIN_INITIAL_MS,
        protocol.MAX_INITIAL_MS
      )
  end

  if result.increment_ms < 0 or result.increment_ms > protocol.MAX_INCREMENT_MS then
    return nil,
      string.format(
        "increment must be between 0 and %d ms",
        protocol.MAX_INCREMENT_MS
      )
  end

  return result
end

function protocol.time_control_wire(value)
  return {
    initialMs = value.initial_ms,
    incrementMs = value.increment_ms,
  }
end

function protocol.label(mode, time_control, status)
  return table.concat({
    "chess",
    mode,
    tostring(time_control.initial_ms),
    tostring(time_control.increment_ms),
    status,
  }, "|")
end

function protocol.opposite_color(color)
  return color == "w" and "b" or "w"
end

function protocol.color_for_seat(index)
  return index == 1 and "w" or "b"
end

return protocol
