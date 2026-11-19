-- MoonGames Ludo RPCs, matchmaker hook, and private invite rooms.

local nk = require("nakama")
local protocol = require("ludo_protocol")
local progression = require("ludo_profile")
local social = require("moongames_social")

local PRIVATE_LOBBY_TIMEOUT_MS = social.INVITE_TTL_MS + 60000

local function response_error(code, message)
  return nk.json_encode({ ok = false, error = { code = code, message = message } })
end

local function decode_payload(payload)
  if payload == nil or payload == "" then
    return {}
  end
  local ok, value = pcall(nk.json_decode, payload)
  if not ok or type(value) ~= "table" then
    return nil, "invalid JSON payload"
  end
  return value
end

local function label_fields(label)
  if type(label) ~= "string" then
    return nil
  end
  local fields = {}
  for part in label:gmatch("[^|]+") do
    fields[#fields + 1] = part
  end
  if #fields < 4 or fields[1] ~= "ludo" then
    return nil
  end
  return fields
end

local function seats_from(params)
  return protocol.clamp_seats(params.seats or params.players or params.playerCount)
end

local function truthy(value)
  return value == true or value == "true" or value == "1" or value == 1
end

local function spectate_requested(params)
  local value = type(params.metadata) == "table" and params.metadata.spectate or nil
  if value == nil then
    value = params.spectate
  end
  return truthy(value)
end

local function attach_private_room(context, params)
  local match_id = params.matchId or params.match_id
  if type(match_id) ~= "string" or match_id == "" then
    error("missing match id")
  end
  local ok, match = pcall(nk.match_get, match_id)
  if not ok or type(match) ~= "table" then
    error("match not found")
  end
  local fields = label_fields(match.label)
  if not fields or fields[2] ~= "private" then
    error("match is not a private Ludo room")
  end
  local status = fields[4]
  if status == "finished" then
    error("match has finished")
  end
  local spectate = spectate_requested(params)
  if not spectate and status ~= "open" and status ~= "closed" then
    error("match is no longer accepting players")
  end
  return {
    matchId = match_id,
    gameTitle = "Ludo",
    mode = "private",
    metadata = { seats = tonumber(fields[3]) or 2, spectate = spectate },
  }
end

local function create_private_room(context, params, recipient)
  local seats = seats_from(params)
  local expected_users = { { user_id = context.user_id, username = context.username } }
  if recipient and recipient.user_id then
    expected_users[#expected_users + 1] = {
      user_id = recipient.user_id,
      username = recipient.username,
    }
  end
  local match_id = nk.match_create("ludo_match", {
    mode = "private",
    rated = false,
    creator = context.user_id,
    seats = seats,
    turnSeconds = protocol.clamp_turn_seconds(params.turnSeconds),
    seed = tonumber(params.seed),
    expected_users = expected_users,
    lobby_timeout_ms = PRIVATE_LOBBY_TIMEOUT_MS,
  })
  return {
    matchId = match_id,
    gameTitle = "Ludo",
    mode = "private",
    metadata = { seats = seats, spectate = false },
  }
end

social.register_game("ludo", {
  attach_room = function(context, params)
    return attach_private_room(context, params)
  end,
  create_room = function(context, params, recipient)
    return create_private_room(context, params, recipient)
  end,
})

local function quick_match(context, payload)
  if not context.user_id or context.user_id == "" then
    return response_error("unauthenticated", "A user session is required")
  end
  local params, decode_error = decode_payload(payload)
  if not params then
    return response_error("invalid_payload", decode_error)
  end
  local seats = seats_from(params)
  local label = protocol.quick_label(seats)
  local excluded = params.excludeMatchId or params.exclude_match_id
  local matches = nk.match_list(10, true, label, 0, 1, nil)
  local match_id = nil
  for _, candidate in ipairs(matches or {}) do
    if excluded == nil or candidate.match_id ~= excluded then
      match_id = candidate.match_id
      break
    end
  end
  if not match_id then
    match_id = nk.match_create("ludo_match", {
      mode = "quick",
      rated = true,
      seats = seats,
      turnSeconds = protocol.clamp_turn_seconds(params.turnSeconds),
      seed = tonumber(params.seed),
    })
  end
  return nk.json_encode({ ok = true, matchId = match_id, mode = "quick", seats = seats })
end
nk.register_rpc(quick_match, "ludo_quick_match")

local function create_private_match(context, payload)
  if not context.user_id or context.user_id == "" then
    return response_error("unauthenticated", "A user session is required")
  end
  local params, decode_error = decode_payload(payload)
  if not params then
    return response_error("invalid_payload", decode_error)
  end
  local seats = seats_from(params)
  local match_id = nk.match_create("ludo_match", {
    mode = "private",
    rated = false,
    creator = context.user_id,
    seats = seats,
    turnSeconds = protocol.clamp_turn_seconds(params.turnSeconds),
    seed = tonumber(params.seed),
    expected_users = { { user_id = context.user_id, username = context.username } },
    lobby_timeout_ms = PRIVATE_LOBBY_TIMEOUT_MS,
  })
  local room_code = social.create_room_code(match_id, "ludo", seats)
  return nk.json_encode({
    ok = true,
    matchId = match_id,
    roomCode = room_code,
    mode = "private",
    seats = seats,
  })
end
nk.register_rpc(create_private_match, "ludo_create_private_match")

local function matchmaker_matched(context, matched)
  if #matched < 2 then
    return nil
  end
  local expected_users = {}
  local seats = nil
  local clock = nil
  local seed = nil
  for _, entry in ipairs(matched) do
    if not entry.presence then
      return nil
    end
    local properties = entry.properties or {}
    if properties.game and properties.game ~= "ludo" then
      return nil
    end
    local entry_seats = protocol.clamp_seats(properties.seats)
    local entry_clock = protocol.clamp_turn_seconds(properties.turnSeconds)
    if seats == nil then
      seats = entry_seats
      clock = entry_clock
      seed = tonumber(properties.seed)
    elseif seats ~= entry_seats or clock ~= entry_clock then
      return nil
    end
    expected_users[#expected_users + 1] = {
      user_id = entry.presence.user_id,
      username = entry.presence.username,
    }
  end
  if #expected_users > seats then
    return nil
  end
  return nk.match_create("ludo_match", {
    mode = "quick",
    rated = true,
    seats = seats,
    turnSeconds = clock,
    seed = seed,
    expected_users = expected_users,
  })
end
social.register_matchmaker_game("ludo", matchmaker_matched)

local function get_profile(context)
  return nk.json_encode(progression.profile_payload(context))
end
nk.register_rpc(get_profile, "ludo_get_profile")

local function get_leaderboard(context, payload)
  local params, decode_error = decode_payload(payload)
  if not params then
    return response_error("invalid_payload", decode_error)
  end
  return nk.json_encode(progression.leaderboard_payload(context, params))
end
nk.register_rpc(get_leaderboard, "ludo_get_leaderboard")
