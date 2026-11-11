-- MoonGames Chess RPCs and matchmaker hook.

local nk = require("nakama")
local protocol = require("chess_protocol")
local progression = require("chess_profile")

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

local function response_error(code, message)
  return nk.json_encode({
    ok = false,
    error = {
      code = code,
      message = message,
    },
  })
end

local function time_control_from(params)
  local source = params.timeControl or params.time_control
  if source == nil then
    source = params
  end
  return protocol.parse_time_control(source)
end

local function quick_match(context, payload)
  if not context.user_id or context.user_id == "" then
    return response_error("unauthenticated", "A user session is required")
  end

  local params, decode_error = decode_payload(payload)
  if not params then
    return response_error("invalid_payload", decode_error)
  end

  local time_control, time_error = time_control_from(params)
  if not time_control then
    return response_error("invalid_time_control", time_error)
  end

  -- match_list is eventually consistent. The web client calls this only after
  -- the atomic matchmaker has had a few seconds to pair concurrent players, so
  -- the table is normally visible to anyone arriving later.
  local label = protocol.label("quick", time_control, "open")
  local matches = nk.match_list(10, true, label, 0, 1, nil)
  local match_id = matches and matches[1] and matches[1].match_id or nil

  if not match_id then
    match_id = nk.match_create("chess_match", {
      mode = "quick",
      rated = true,
      time_control = {
        initial_ms = time_control.initial_ms,
        increment_ms = time_control.increment_ms,
      },
    })
  end

  return nk.json_encode({
    ok = true,
    matchId = match_id,
    mode = "quick",
    timeControl = protocol.time_control_wire(time_control),
  })
end
nk.register_rpc(quick_match, "chess_quick_match")

local function create_private_match(context, payload)
  if not context.user_id or context.user_id == "" then
    return response_error("unauthenticated", "A user session is required")
  end

  local params, decode_error = decode_payload(payload)
  if not params then
    return response_error("invalid_payload", decode_error)
  end

  local time_control, time_error = time_control_from(params)
  if not time_control then
    return response_error("invalid_time_control", time_error)
  end

  local match_id = nk.match_create("chess_match", {
    mode = "private",
    creator = context.user_id,
    time_control = {
      initial_ms = time_control.initial_ms,
      increment_ms = time_control.increment_ms,
    },
  })

  return nk.json_encode({
    ok = true,
    matchId = match_id,
    mode = "private",
    timeControl = protocol.time_control_wire(time_control),
  })
end
nk.register_rpc(create_private_match, "chess_create_private_match")

local function time_control_from_properties(properties)
  properties = properties or {}
  local source = properties.timeControl or properties.time_control

  if not source and type(properties.timeControlKey) == "string" then
    local initial, increment =
      string.match(properties.timeControlKey, "^(%d+)_(%d+)$")
    if initial then
      return {
        initial_ms = tonumber(initial),
        increment_ms = tonumber(increment),
      }
    end
  end

  return protocol.parse_time_control(source)
end

local function matchmaker_matched(context, matched)
  if #matched ~= 2 then
    return nil
  end

  local first = matched[1]
  local second = matched[2]

  if not first.presence or not second.presence then
    return nil
  end

  local first_properties = first.properties or {}
  local second_properties = second.properties or {}

  if first_properties.game and first_properties.game ~= "chess" then
    return nil
  end
  if second_properties.game and second_properties.game ~= "chess" then
    return nil
  end

  local first_time_control = time_control_from_properties(first_properties)
  local second_time_control = time_control_from_properties(second_properties)

  if
    not first_time_control
    or not second_time_control
    or first_time_control.initial_ms ~= second_time_control.initial_ms
    or first_time_control.increment_ms ~= second_time_control.increment_ms
  then
    return nil
  end

  local time_control = first_time_control

  local expected_users = {
    {
      user_id = first.presence.user_id,
      username = first.presence.username,
      color = "w",
    },
    {
      user_id = second.presence.user_id,
      username = second.presence.username,
      color = "b",
    },
  }

  return nk.match_create("chess_match", {
    mode = "quick",
    rated = true,
    expected_users = expected_users,
    time_control = {
      initial_ms = time_control.initial_ms,
      increment_ms = time_control.increment_ms,
    },
  })
end
nk.register_matchmaker_matched(matchmaker_matched)

local function get_profile(context, payload)
  return nk.json_encode(progression.profile_payload(context))
end
nk.register_rpc(get_profile, "chess_get_profile")

local function get_leaderboard(context, payload)
  local params, decode_error = decode_payload(payload)
  if not params then
    return response_error("invalid_payload", decode_error)
  end
  return nk.json_encode(progression.leaderboard_payload(context, params))
end
nk.register_rpc(get_leaderboard, "chess_get_leaderboard")
