-- MoonGames Carrom RPCs, matchmaker hook, and invite room integration.

local nk = require("nakama")
local protocol = require("carrom_protocol")
local progression = require("carrom_profile")
local social = require("moongames_social")

local PRIVATE_LOBBY_TIMEOUT_MS = social.INVITE_TTL_MS + 60000

local function response_error(code, message)
  return nk.json_encode({
    ok = false,
    error = {
      code = code,
      message = message,
    },
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

local function label_fields(label)
  if type(label) ~= "string" then
    return nil
  end
  local fields = {}
  for part in label:gmatch("[^|]+") do
    fields[#fields + 1] = part
  end
  if #fields < 4 or fields[1] ~= "carrom" then
    return nil
  end
  return fields
end

local function seats_from(params)
  local value = params.seats or params.players or params.playerCount
  return protocol.clamp_seats(value)
end

-- The table settings a client asks for: the game type and the shot clock.
local function truthy(value)
  return value == true or value == "true" or value == "1" or value == 1
end

local function settings_from(params)
  return {
    variant = protocol.clamp_variant(params.variant),
    turnSeconds = protocol.clamp_turn_seconds(params.turnSeconds),
    teams = truthy(params.teams) and protocol.clamp_seats(params.seats) == 4,
  }
end

local function spectate_requested(params)
  local metadata = params.metadata
  local value = type(metadata) == "table" and metadata.spectate or nil
  if value == nil then
    value = params.spectate
  end
  return value == true or value == "true" or value == "1" or value == 1
end

-- Invite a player into an existing private carrom room.
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
    error("match is not a private carrom room")
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
    gameTitle = "Carrom",
    mode = "private",
    metadata = {
      seats = tonumber(fields[3]) or 2,
      spectate = spectate,
    },
  }
end

-- Create a private carrom room for the inviter and the invited player.
local function create_private_room(context, params, recipient)
  local seats = seats_from(params)
  local settings = settings_from(params)
  local expected_users = {
    {
      user_id = context.user_id,
      username = context.username,
    },
  }
  if recipient and recipient.user_id then
    expected_users[#expected_users + 1] = {
      user_id = recipient.user_id,
      username = recipient.username,
    }
  end

  local match_id = nk.match_create("carrom_match", {
    mode = "private",
    rated = false,
    creator = context.user_id,
    seats = seats,
    variant = settings.variant,
    turnSeconds = settings.turnSeconds,
    teams = settings.teams,
    expected_users = expected_users,
    lobby_timeout_ms = PRIVATE_LOBBY_TIMEOUT_MS,
  })

  return {
    matchId = match_id,
    gameTitle = "Carrom",
    mode = "private",
    metadata = {
      seats = seats,
      spectate = false,
    },
  }
end

social.register_game("carrom", {
  attach_room = function(context, params)
    return attach_private_room(context, params)
  end,
  create_room = function(context, params, recipient)
    return create_private_room(context, params, recipient)
  end,
})

local function create_private_match(context, payload)
  if not context.user_id or context.user_id == "" then
    return response_error("unauthenticated", "A user session is required")
  end

  local params, decode_error = decode_payload(payload)
  if not params then
    return response_error("invalid_payload", decode_error)
  end

  local seats = seats_from(params)
  local settings = settings_from(params)
  local match_id = nk.match_create("carrom_match", {
    mode = "private",
    rated = false,
    creator = context.user_id,
    seats = seats,
    variant = settings.variant,
    turnSeconds = settings.turnSeconds,
    teams = settings.teams,
    expected_users = {
      {
        user_id = context.user_id,
        username = context.username,
      },
    },
    lobby_timeout_ms = PRIVATE_LOBBY_TIMEOUT_MS,
  })

  -- The room code is what the player reads out to their friend. The match id
  -- behind it still joins the table.
  local room_code = social.create_room_code(match_id, "carrom", seats)

  return nk.json_encode({
    ok = true,
    matchId = match_id,
    roomCode = room_code,
    mode = "private",
    seats = seats,
  })
end
nk.register_rpc(create_private_match, "carrom_create_private_match")

-- The atomic matchmaker pairs players who asked for the same table size.
local function matchmaker_matched(context, matched)
  if #matched < 2 then
    return nil
  end
  local expected_users = {}
  local seats = nil
  local variant = nil
  local clock = nil
  local teams = false
  for _, entry in ipairs(matched) do
    if not entry.presence then
      return nil
    end
    local properties = entry.properties or {}
    if properties.game and properties.game ~= "carrom" then
      return nil
    end
    local entry_seats = protocol.clamp_seats(properties.seats)
    local entry_variant = protocol.clamp_variant(properties.variant)
    local entry_clock = protocol.clamp_turn_seconds(properties.turnSeconds)
    local entry_teams = truthy(properties.teams) and entry_seats == 4
    if seats == nil then
      seats = entry_seats
      variant = entry_variant
      clock = entry_clock
      teams = entry_teams
    elseif seats ~= entry_seats or variant ~= entry_variant or clock ~= entry_clock or teams ~= entry_teams then
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
  return nk.match_create("carrom_match", {
    mode = "quick",
    rated = true,
    seats = seats,
    variant = variant,
    turnSeconds = clock,
    teams = teams,
    expected_users = expected_users,
  })
end
-- The shared module owns the single Nakama matchmaker callback and routes a
-- ticket to the game that asked for it.
social.register_matchmaker_game("carrom", matchmaker_matched)

local function get_profile(context)
  return nk.json_encode(progression.profile_payload(context))
end
nk.register_rpc(get_profile, "carrom_get_profile")

local function get_leaderboard(context, payload)
  local params, decode_error = decode_payload(payload)
  if not params then
    return response_error("invalid_payload", decode_error)
  end
  return nk.json_encode(progression.leaderboard_payload(context, params))
end
nk.register_rpc(get_leaderboard, "carrom_get_leaderboard")
