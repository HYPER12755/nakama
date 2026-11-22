local protocol = {}

protocol.OP = {
  STATE = 1,
  CHAT = 2,
  MOVE = 3,
  GAME_OVER = 4,
  ERROR = 5,
  PLAYER_JOINED = 6,
  PLAYER_LEFT = 7,
  MATCH_STARTED = 8,
  PONG = 9,
  SPECTATOR_JOINED = 10,
  SPECTATOR_LEFT = 11,
  PLAY_REQUEST = 101,
  DRAW_REQUEST = 102,
  CHALLENGE_REQUEST = 103,
  CHAT_SEND = 104,
  REQUEST_STATE = 105,
  RESIGN = 106,
  PING = 107,
  COLOR_CHOOSE = 108,
}

protocol.ERROR = {
  NOT_YOUR_TURN = "not_your_turn",
  ILLEGAL_CARD = "illegal_card",
  BAD_CHALLENGE = "bad_challenge",
  GAME_OVER = "game_over",
  UNKNOWN_CARD = "unknown_card",
  MISSING_COLOR = "missing_color",
  MISSING_TARGET = "missing_target",
  JUMP_WINDOW_OPEN = "jump_window_open",
  BAD_JUMP = "bad_jump",
}

protocol.RULES_MODES = { "classic", "sevenO", "progressive", "jumpIn", "attack", "noMercy", "flip", "swapPack", "reversePack", "stackPack", "speedPack", "allWild", "dare", "showdown" }

protocol.JUMP_WINDOW_MS = 1800

function protocol.is_rules_mode(value)
  for _, mode in ipairs(protocol.RULES_MODES) do
    if value == mode then
      return true
    end
  end
  return false
end

function protocol.normalize_rules_mode(value)
  if protocol.is_rules_mode(value) then
    return value
  end
  return "classic"
end

protocol.LIGHT_COLORS = { "red", "yellow", "green", "blue" }
protocol.DARK_COLORS = { "pink", "teal", "orange", "purple" }
protocol.ALL_COLORS = { "red", "yellow", "green", "blue", "pink", "teal", "orange", "purple" }
protocol.COLORS = protocol.LIGHT_COLORS
protocol.MIN_SEATS = 2
protocol.MAX_SEATS = 4
protocol.MAX_CHAT_LENGTH = 240
protocol.CHAT_MAX_BYTES = 960
protocol.CHAT_HISTORY_LIMIT = 40
protocol.CHAT_RATE_MS = 700

function protocol.clamp_seats(value)
  local seats = tonumber(value) or 2
  if seats < protocol.MIN_SEATS then
    return protocol.MIN_SEATS
  end
  if seats > protocol.MAX_SEATS then
    return protocol.MAX_SEATS
  end
  return math.floor(seats)
end

function protocol.is_color(value)
  for _, color in ipairs(protocol.ALL_COLORS) do
    if color == value then
      return true
    end
  end
  return false
end

function protocol.label(mode, seats, status)
  return string.format(
    "uno|%s|%d|%s",
    mode == "private" and "private" or "quick",
    protocol.clamp_seats(seats),
    status == "finished" and "finished" or (status == "closed" and "closed" or "open")
  )
end

function protocol.quick_label(seats)
  return protocol.label("quick", seats, "open")
end

function protocol.label_fields(label)
  if type(label) ~= "string" then
    return nil
  end
  local fields = {}
  for part in label:gmatch("[^|]+") do
    fields[#fields + 1] = part
  end
  if #fields < 4 or fields[1] ~= "uno" then
    return nil
  end
  return fields
end

function protocol.chat_length(value)
  local length = 0
  for _ in tostring(value or ""):gmatch(".") do
    length = length + 1
  end
  return length
end

function protocol.normalize_chat(value)
  if type(value) ~= "string" then
    return nil
  end
  local text = value:gsub("^%s+", ""):gsub("%s+$", ""):gsub("%s+", " ")
  if text == "" then
    return nil
  end
  if #text > protocol.CHAT_MAX_BYTES then
    text = text:sub(1, protocol.CHAT_MAX_BYTES)
  end
  while protocol.chat_length(text) > protocol.MAX_CHAT_LENGTH do
    text = text:sub(1, #text - 1)
  end
  if text == "" then
    return nil
  end
  return text
end

return protocol
