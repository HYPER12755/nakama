local nk = require("nakama")
local protocol = require("uno_protocol")
local progression = require("uno_profile")
local social = require("moongames_social")

local PRIVATE_LOBBY_TIMEOUT_MS = social.INVITE_TTL_MS + 60000

local function response_error(code, message)
  return nk.json_encode({
    ok = false,
    error = { code = code, message = message },
  })
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

local function seats_from(params)
  return protocol.clamp_seats(params.seats or params.players or params.playerCount)
end

local function spectate_requested(params)
  local value = type(params.metadata) == "table" and params.metadata.spectate or nil
  if value == nil then
    value = params.spectate
  end
  return value == true or value == "true" or value == "1" or value == 1
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
  local fields = protocol.label_fields(match.label)
  if fields == nil or fields[2] ~= "private" then
    error("match is not a private Uno room")
  end
  if fields[4] == "finished" then
    error("match has finished")
  end
  if not spectate_requested(params) and fields[4] ~= "open" then
    error("match is no longer accepting players")
  end
  return {
    matchId = match_id,
    gameTitle = "Uno",
    mode = "private",
    metadata = {
      seats = tonumber(fields[3]) or 2,
      spectate = spectate_requested(params),
    },
  }
end

local function create_private_room(context, params, recipient)
  local seats = seats_from(params)
  local expected_users = {
    { user_id = context.user_id, username = context.username },
  }
  if recipient ~= nil and recipient.user_id ~= nil then
    expected_users[#expected_users + 1] = {
      user_id = recipient.user_id,
      username = recipient.username,
    }
  end
  local match_id = nk.match_create("uno_match", {
    mode = "private",
    rated = false,
    creator = context.user_id,
    seats = seats,
    seed = tonumber(params.seed),
    turnSeconds = math.max(0, tonumber(params.turnSeconds) or 0),
    expected_users = expected_users,
    lobby_timeout_ms = PRIVATE_LOBBY_TIMEOUT_MS,
  })
  return {
    matchId = match_id,
    gameTitle = "Uno",
    mode = "private",
    metadata = { seats = seats, spectate = false },
  }
end

social.register_game("uno", {
  attach_room = function(context, params)
    return attach_private_room(context, params)
  end,
  create_room = function(context, params, recipient)
    return create_private_room(context, params, recipient)
  end,
})

local function create_private_match(context, payload)
  if context.user_id == nil or context.user_id == "" then
    return response_error("unauthenticated", "A user session is required")
  end
  local params, decode_error = decode_payload(payload)
  if params == nil then
    return response_error("invalid_payload", decode_error)
  end
  local seats = seats_from(params)
  local match_id = nk.match_create("uno_match", {
    mode = "private",
    rated = false,
    creator = context.user_id,
    seats = seats,
    seed = tonumber(params.seed),
    turnSeconds = math.max(0, tonumber(params.turnSeconds) or 0),
    lobby_timeout_ms = PRIVATE_LOBBY_TIMEOUT_MS,
  })
  local room_code = social.create_room_code(match_id, "uno", seats)
  return nk.json_encode({
    ok = true,
    matchId = match_id,
    roomCode = room_code,
    mode = "private",
    seats = seats,
  })
end
nk.register_rpc(create_private_match, "uno_create_private_match")

local function matchmaker_matched(context, matched)
  if #matched < 2 then
    return nil
  end
  local seats = nil
  local seed = nil
  local turn_seconds = 0
  local expected_users = {}
  for _, entry in ipairs(matched) do
    if entry.presence == nil then
      return nil
    end
    local properties = entry.properties or {}
    if properties.game ~= nil and properties.game ~= "uno" then
      return nil
    end
    local entry_seats = protocol.clamp_seats(properties.seats)
    local entry_clock = math.max(0, tonumber(properties.turnSeconds) or 0)
    if seats == nil then
      seats = entry_seats
      seed = tonumber(properties.seed)
      turn_seconds = entry_clock
    elseif seats ~= entry_seats or turn_seconds ~= entry_clock then
      return nil
    end
    expected_users[#expected_users + 1] = {
      user_id = entry.presence.user_id,
      username = entry.presence.username,
    }
  end
  if #expected_users ~= seats then
    return nil
  end
  return nk.match_create("uno_match", {
    mode = "quick",
    rated = true,
    seats = seats,
    seed = seed,
    turnSeconds = turn_seconds,
    expected_users = expected_users,
  })
end
social.register_matchmaker_game("uno", matchmaker_matched)

local function get_profile(context)
  return nk.json_encode(progression.profile_payload(context, context.username))
end
nk.register_rpc(get_profile, "uno_get_profile")

local function get_leaderboard(context, payload)
  local params, decode_error = decode_payload(payload)
  if params == nil then
    return response_error("invalid_payload", decode_error)
  end
  return nk.json_encode(progression.leaderboard_payload(context, params))
end
nk.register_rpc(get_leaderboard, "uno_get_leaderboard")
