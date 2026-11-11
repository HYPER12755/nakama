-- MoonGames Chess authoritative Nakama match handler.
--
-- The server owns the board, clocks, result, and player seats. Clients only send
-- move/resign/draw requests; every request is validated by chess_rules.lua.

local nk = require("nakama")
local rules = require("chess_rules")
local protocol = require("chess_protocol")
local progression = require("chess_profile")

local OP = protocol.OP

local TICK_RATE = 10
local MAX_PLAYERS = 2
local MAX_SPECTATORS = 24
local DISCONNECT_GRACE_MS = 30000
local LOBBY_TIMEOUT_MS = 900000
local FINISHED_LINGER_MS = 300000
local DRAW_OFFER_TTL_MS = 60000
local CLOCK_BROADCAST_INTERVAL_MS = 1000

local function encode(value)
  if type(value) == "string" then
    return value
  end
  return nk.json_encode(value)
end

local function broadcast(dispatcher, op_code, payload, presences, sender)
  dispatcher.broadcast_message(op_code, encode(payload), presences, sender)
end

local function send_error(dispatcher, presence, message)
  broadcast(dispatcher, OP.ERROR, {
    message = message,
  }, { presence })
end

local function player_by_color(state, color)
  for _, user_id in ipairs(state.player_order) do
    local player = state.players[user_id]
    if player and player.color == color then
      return player
    end
  end
  return nil
end

local function color_taken(state, color)
  return player_by_color(state, color) ~= nil
end

local function join_key(presence)
  return presence.session_id or presence.user_id
end

local function join_metadata(metadata)
  if type(metadata) == "table" then
    return metadata
  end
  if type(metadata) == "string" and metadata ~= "" then
    local ok, parsed = pcall(nk.json_decode, metadata)
    if ok and type(parsed) == "table" then
      return parsed
    end
  end
  return {}
end

local function spectate_requested(metadata)
  local values = join_metadata(metadata)
  local value = values.spectate
  if value == nil then
    value = values.spectator
  end
  return value == true or value == "true" or value == "1" or value == 1
end

local function remove_spectator(state, user_id)
  state.spectators[user_id] = nil
  local order = {}
  for _, current in ipairs(state.spectator_order) do
    if current ~= user_id then
      order[#order + 1] = current
    end
  end
  state.spectator_order = order
end

local function assign_color(state, user_id)
  local expected = state.expected_by_user[user_id]
  if expected then
    if color_taken(state, expected.color) then
      return nil
    end
    return expected.color
  end

  if state.mode == "private" then
    if state.creator == user_id then
      if not color_taken(state, "w") then
        return "w"
      end
      return nil
    end

    if state.creator and not state.players[state.creator] then
      -- Keep white reserved for the creator while they are still expected.
      if not color_taken(state, "b") then
        return "b"
      end
      return nil
    end
  end

  if not color_taken(state, "w") then
    return "w"
  end
  if not color_taken(state, "b") then
    return "b"
  end
  return nil
end

local function remove_player(state, user_id)
  state.players[user_id] = nil
  local order = {}
  for _, current in ipairs(state.player_order) do
    if current ~= user_id then
      order[#order + 1] = current
    end
  end
  state.player_order = order
end

local function label_status(state)
  if state.result then
    return "finished"
  end
  if state.started_at then
    return "full"
  end
  if state.expected_count > 0 then
    return "reserved"
  end
  if #state.player_order >= MAX_PLAYERS then
    return "full"
  end
  return "open"
end

local function refresh_label(state, dispatcher)
  local status = label_status(state)
  state.open = status == "open"
  dispatcher.match_label_update(
    protocol.label(state.mode, state.time_control, status)
  )
end

local function clock_remaining_raw(state, color, now)
  local base = state.clock[color] or 0

  if
    state.clock.running_since
    and state.started_at
    and not state.result
    and state.game.turn == color
  then
    local elapsed = now - state.clock.running_since
    if elapsed < 0 then
      elapsed = 0
    end
    base = base - elapsed
  end

  if base < 0 then
    return 0
  end
  return base
end

local function clock_remaining(state, color, now)
  return math.floor(clock_remaining_raw(state, color, now))
end

local function clock_payload(state, now)
  return {
    whiteMs = clock_remaining(state, "w", now),
    blackMs = clock_remaining(state, "b", now),
    turn = state.game.turn,
    runningSince = state.clock.running_since,
    serverTime = now,
  }
end

local function players_payload(state, now)
  local players = {}

  for _, color in ipairs({ "w", "b" }) do
    local player = player_by_color(state, color)
    if player then
      players[#players + 1] = {
        userId = player.user_id,
        username = player.username,
        color = color,
        connected = player.connected,
        remainingMs = clock_remaining(state, color, now),
      }
    end
  end

  return players
end

local function spectators_payload(state)
  local spectators = {}
  for _, user_id in ipairs(state.spectator_order or {}) do
    local spectator = state.spectators[user_id]
    if spectator then
      spectators[#spectators + 1] = {
        userId = spectator.user_id,
        username = spectator.username,
      }
    end
  end
  return spectators
end

local function match_payload(context, state)
  return {
    id = context.match_id,
    mode = state.mode,
    rated = state.rated,
    started = state.started_at ~= nil,
    open = state.open,
    timeControl = protocol.time_control_wire(state.time_control),
  }
end

local function draw_offer_payload(state)
  if not state.draw_offer then
    return nil
  end

  return {
    by = state.draw_offer.by,
    userId = state.draw_offer.user_id,
    expiresAt = state.draw_offer.at + DRAW_OFFER_TTL_MS,
  }
end

local function state_payload(context, state, now)
  return {
    state = state.game:get_state(),
    match = match_payload(context, state),
    players = players_payload(state, now),
    spectators = spectators_payload(state),
    clock = clock_payload(state, now),
    result = state.result,
    drawOffer = draw_offer_payload(state),
    serverTime = now,
  }
end

local function broadcast_state(context, dispatcher, state, presences)
  local now = nk.time()
  broadcast(dispatcher, OP.STATE, state_payload(context, state, now), presences)
end

local function broadcast_clock(dispatcher, state, now)
  broadcast(dispatcher, OP.CLOCK, clock_payload(state, now))
end

local function make_result(state, status, winner_color, reason, now)
  local result = {
    status = status,
    winnerColor = winner_color,
    reason = reason,
    endedAt = now,
  }

  if winner_color then
    local winner = player_by_color(state, winner_color)
    if winner then
      result.winnerUserId = winner.user_id
    end
  end

  return result
end

local function set_result(context, dispatcher, state, result, now)
  if state.result then
    return
  end

  state.result = result
  state.result_at = now
  state.clock.running_since = nil
  state.open = false

  -- Persist progression before announcing the result. Clients refresh their
  -- profile as soon as GAME_OVER arrives, so the storage write must be visible.
  local ok, finalize_error =
    pcall(progression.finalize_match, context, state, result, now)
  if not ok then
    nk.logger_error(
      "Chess progression finalization failed for "
        .. tostring(context.match_id)
        .. ": "
        .. tostring(finalize_error)
    )
  end

  refresh_label(state, dispatcher)
  broadcast(dispatcher, OP.GAME_OVER, state_payload(context, state, now))
end

local function maybe_start(context, dispatcher, state, now)
  if state.started_at or #state.player_order < MAX_PLAYERS then
    return false
  end

  state.started_at = now
  state.clock.w = state.time_control.initial_ms
  state.clock.b = state.time_control.initial_ms
  state.clock.running_since = now
  state.last_clock_broadcast = now
  state.draw_offer = nil
  refresh_label(state, dispatcher)
  return true
end

local function handle_move(context, dispatcher, state, player, payload, now)
  if player.color ~= state.game.turn then
    send_error(dispatcher, player.presence, "It is not your turn")
    return
  end

  local mover_color = state.game.turn
  local elapsed = 0
  if state.clock.running_since then
    elapsed = math.max(0, now - state.clock.running_since)
  end

  local remaining = (state.clock[mover_color] or 0) - elapsed
  if remaining <= 0 then
    state.clock[mover_color] = 0
    local result = make_result(
      state,
      "timeout",
      protocol.opposite_color(mover_color),
      "timeout",
      now
    )
    set_result(context, dispatcher, state, result, now)
    return
  end

  local action, action_error = rules.parse_action(payload)
  if not action then
    send_error(dispatcher, player.presence, action_error)
    return
  end

  local move, move_error = state.game:move(action)
  if not move then
    send_error(dispatcher, player.presence, move_error)
    return
  end

  remaining = remaining + state.time_control.increment_ms
  state.clock[mover_color] = remaining
  state.clock.running_since = now
  state.draw_offer = nil
  state.last_clock_broadcast = now

  local status = state.game:status()
  local payload_out = state_payload(context, state, now)
  payload_out.move = state.game:wire_move(move)
  broadcast(dispatcher, OP.MOVE, payload_out)

  if status.status == "checkmate" then
    local result = make_result(
      state,
      "checkmate",
      status.winner,
      "checkmate",
      now
    )
    set_result(context, dispatcher, state, result, now)
  elseif status.status == "stalemate" then
    local result = make_result(state, "stalemate", nil, "stalemate", now)
    set_result(context, dispatcher, state, result, now)
  elseif status.status == "draw" then
    local result = make_result(
      state,
      "draw",
      nil,
      status.reason or "draw",
      now
    )
    set_result(context, dispatcher, state, result, now)
  end
end

local function handle_resign(context, dispatcher, state, player, now)
  if state.result then
    send_error(dispatcher, player.presence, "The match is already over")
    return
  end

  local result = make_result(
    state,
    "resign",
    protocol.opposite_color(player.color),
    "resign",
    now
  )
  set_result(context, dispatcher, state, result, now)
end

local function handle_draw_offer(context, dispatcher, state, player, now)
  if state.result then
    send_error(dispatcher, player.presence, "The match is already over")
    return
  end

  if state.draw_offer and now - state.draw_offer.at < DRAW_OFFER_TTL_MS then
    send_error(dispatcher, player.presence, "A draw offer is already pending")
    return
  end

  state.draw_offer = {
    by = player.color,
    user_id = player.user_id,
    at = now,
  }

  broadcast(dispatcher, OP.DRAW_OFFER, {
    by = player.color,
    userId = player.user_id,
    username = player.username,
    expiresAt = now + DRAW_OFFER_TTL_MS,
  })
end

local function handle_draw_accept(context, dispatcher, state, player, now)
  local offer = state.draw_offer
  if not offer or now - offer.at >= DRAW_OFFER_TTL_MS then
    state.draw_offer = nil
    send_error(dispatcher, player.presence, "There is no pending draw offer")
    return
  end

  if offer.by == player.color then
    send_error(dispatcher, player.presence, "You cannot accept your own draw offer")
    return
  end

  state.draw_offer = nil
  local result = make_result(state, "draw", nil, "agreement", now)
  set_result(context, dispatcher, state, result, now)
end

local function handle_draw_decline(context, dispatcher, state, player, now)
  local offer = state.draw_offer
  if not offer or now - offer.at >= DRAW_OFFER_TTL_MS then
    state.draw_offer = nil
    send_error(dispatcher, player.presence, "There is no pending draw offer")
    return
  end

  if offer.by == player.color then
    send_error(dispatcher, player.presence, "You cannot decline your own draw offer")
    return
  end

  state.draw_offer = nil
  broadcast(dispatcher, OP.DRAW_DECLINED, {
    by = offer.by,
    userId = offer.user_id,
  })
end

local function handle_message(context, dispatcher, state, message, now)
  local player = state.players[message.sender.user_id]

  local ok, payload = pcall(nk.json_decode, message.data or "{}")
  if not ok or type(payload) ~= "table" then
    send_error(dispatcher, message.sender, "Invalid message payload")
    return
  end

  if message.op_code == OP.PING then
    broadcast(dispatcher, OP.PONG, {
      clientTime = payload.clientTime,
      serverTime = now,
    }, { message.sender })
    return
  end

  if message.op_code == OP.REQUEST_STATE then
    broadcast_state(context, dispatcher, state, { message.sender })
    return
  end

  if not player then
    send_error(dispatcher, message.sender, "You are not a player in this match")
    return
  end

  if state.result then
    send_error(dispatcher, message.sender, "The match is already over")
    return
  end

  if not state.started_at then
    send_error(dispatcher, message.sender, "The match has not started")
    return
  end

  if message.op_code == OP.MOVE_REQUEST then
    handle_move(context, dispatcher, state, player, payload, now)
  elseif message.op_code == OP.RESIGN then
    handle_resign(context, dispatcher, state, player, now)
  elseif message.op_code == OP.DRAW_OFFER_REQUEST then
    handle_draw_offer(context, dispatcher, state, player, now)
  elseif message.op_code == OP.DRAW_ACCEPT then
    handle_draw_accept(context, dispatcher, state, player, now)
  elseif message.op_code == OP.DRAW_DECLINE then
    handle_draw_decline(context, dispatcher, state, player, now)
  else
    send_error(dispatcher, message.sender, "Unknown match action")
  end
end

local function check_timeout(context, dispatcher, state, now)
  if not state.started_at or state.result then
    return
  end

  local color = state.game.turn
  if clock_remaining_raw(state, color, now) <= 0 then
    local result = make_result(
      state,
      "timeout",
      protocol.opposite_color(color),
      "timeout",
      now
    )
    set_result(context, dispatcher, state, result, now)
  end
end

local function check_disconnects(context, dispatcher, state, now)
  if state.result then
    return
  end

  local connected_count = 0
  local expired = {}

  for _, user_id in ipairs(state.player_order) do
    local player = state.players[user_id]
    if player then
      if player.connected then
        connected_count = connected_count + 1
      elseif
        player.disconnected_at
        and now - player.disconnected_at >= DISCONNECT_GRACE_MS
      then
        expired[#expired + 1] = player
      end
    end
  end

  if #expired == 0 then
    return
  end

  if not state.started_at then
    for _, player in ipairs(expired) do
      remove_player(state, player.user_id)
    end
    refresh_label(state, dispatcher)
    broadcast_state(context, dispatcher, state)
    return
  end

  if connected_count == 0 then
    local result = make_result(
      state,
      "abandoned",
      nil,
      "both players disconnected",
      now
    )
    set_result(context, dispatcher, state, result, now)
    return
  end

  local loser = expired[1]
  local result = make_result(
    state,
    "disconnect",
    protocol.opposite_color(loser.color),
    "disconnect",
    now
  )
  set_result(context, dispatcher, state, result, now)
end

local function match_init(context, params)
  params = params or {}

  local mode = params.mode == "private" and "private" or "quick"
  local time_control, time_error = protocol.parse_time_control(
    params.time_control or params.timeControl
  )
  if not time_control then
    nk.logger_warn("Invalid chess time control: " .. tostring(time_error))
    time_control = protocol.parse_time_control(nil)
  end

  local expected_by_user = {}
  local expected_count = 0

  if type(params.expected_users) == "table" then
    for index, entry in ipairs(params.expected_users) do
      local user_id = entry.user_id
      local username = entry.username
      local color = entry.color or protocol.color_for_seat(index)

      if not user_id and entry.presence then
        user_id = entry.presence.user_id
        username = username or entry.presence.username
      end

      if user_id then
        expected_by_user[user_id] = {
          color = color,
          username = username or "Player",
        }
        expected_count = expected_count + 1
      end
    end
  end

  local now = nk.time()
  local state = {
    mode = mode,
    rated = params.rated == true,
    time_control = time_control,
    game = rules.new(),
    players = {},
    player_order = {},
    spectators = {},
    spectator_order = {},
    pending_joins = {},
    expected_by_user = expected_by_user,
    expected_count = expected_count,
    creator = params.creator,
    clock = {
      w = time_control.initial_ms,
      b = time_control.initial_ms,
      running_since = nil,
    },
    created_at = now,
    started_at = nil,
    result = nil,
    result_at = nil,
    draw_offer = nil,
    last_activity = now,
    last_clock_broadcast = 0,
    open = expected_count == 0,
  }

  local status = expected_count > 0 and "reserved" or "open"
  local label = protocol.label(mode, time_control, status)

  return state, TICK_RATE, label
end

local function match_join_attempt(context, dispatcher, tick, state, presence, metadata)
  local key = join_key(presence)
  local wants_spectator = spectate_requested(metadata)

  if wants_spectator then
    if state.players[presence.user_id] or state.spectators[presence.user_id] then
      state.pending_joins[key] = nil
      return state, true
    end

    if #state.spectator_order >= MAX_SPECTATORS then
      return state, false, "The spectator gallery is full"
    end

    -- Match join metadata is only available during the attempt callback. Keep
    -- the choice by session until match_join receives the presence.
    state.pending_joins[key] = { spectate = true }
    return state, true
  end

  state.pending_joins[key] = nil

  if state.result then
    return state, false, "The match is already over"
  end

  if state.players[presence.user_id] or state.spectators[presence.user_id] then
    return state, true
  end

  if #state.player_order >= MAX_PLAYERS then
    return state, false, "This match is full"
  end

  if
    state.expected_count > 0
    and not state.expected_by_user[presence.user_id]
  then
    return state, false, "This match is reserved for invited players"
  end

  if not assign_color(state, presence.user_id) then
    return state, false, "This match is full"
  end

  return state, true
end

local function match_join(context, dispatcher, tick, state, presences)
  local now = nk.time()
  local joined = {}
  local joined_spectators = {}

  for _, presence in ipairs(presences) do
    local key = join_key(presence)
    local pending = state.pending_joins[key] or {}
    state.pending_joins[key] = nil

    local player = state.players[presence.user_id]
    local spectator = state.spectators[presence.user_id]

    if player then
      player.connected = true
      player.disconnected_at = nil
      player.presence = presence
      player.username = presence.username or player.username
    elseif spectator then
      spectator.presence = presence
      spectator.username = presence.username or spectator.username
    elseif pending.spectate then
      spectator = {
        user_id = presence.user_id,
        username = presence.username or "Spectator",
        presence = presence,
        joined_at = now,
      }
      state.spectators[presence.user_id] = spectator
      state.spectator_order[#state.spectator_order + 1] = presence.user_id
      joined_spectators[#joined_spectators + 1] = spectator
    else
      local color = assign_color(state, presence.user_id)
      if color then
        local expected = state.expected_by_user[presence.user_id]
        player = {
          user_id = presence.user_id,
          username = presence.username or (expected and expected.username) or "Player",
          color = color,
          connected = true,
          presence = presence,
          joined_at = now,
          disconnected_at = nil,
        }
        state.players[presence.user_id] = player
        state.player_order[#state.player_order + 1] = presence.user_id
        joined[#joined + 1] = player
      else
        broadcast(dispatcher, OP.ERROR, {
          message = "This match is full",
        }, { presence })
        dispatcher.match_kick({ presence })
      end
    end
  end

  state.last_activity = now
  local started = maybe_start(context, dispatcher, state, now)
  broadcast_state(context, dispatcher, state)

  for _, player in ipairs(joined) do
    broadcast(dispatcher, OP.PLAYER_JOINED, {
      userId = player.user_id,
      username = player.username,
      color = player.color,
    })
  end

  for _, spectator_entry in ipairs(joined_spectators) do
    broadcast(dispatcher, OP.SPECTATOR_JOINED, {
      userId = spectator_entry.user_id,
      username = spectator_entry.username,
    })
  end

  if started then
    broadcast(dispatcher, OP.MATCH_STARTED, state_payload(context, state, now))
  end

  return state
end

local function match_leave(context, dispatcher, tick, state, presences)
  local now = nk.time()

  for _, presence in ipairs(presences) do
    local player = state.players[presence.user_id]
    local spectator = state.spectators[presence.user_id]

    if player then
      if not state.started_at then
        remove_player(state, player.user_id)
      else
        player.connected = false
        player.disconnected_at = now
        player.presence = nil
      end

      broadcast(dispatcher, OP.PLAYER_LEFT, {
        userId = player.user_id,
        username = player.username,
        color = player.color,
      })
    elseif spectator then
      remove_spectator(state, spectator.user_id)
      broadcast(dispatcher, OP.SPECTATOR_LEFT, {
        userId = spectator.user_id,
        username = spectator.username,
      })
    end
  end

  state.last_activity = now
  if not state.started_at then
    refresh_label(state, dispatcher)
  end
  broadcast_state(context, dispatcher, state)

  return state
end

local function match_loop(context, dispatcher, tick, state, messages)
  local now = nk.time()

  for _, message in ipairs(messages) do
    handle_message(context, dispatcher, state, message, now)
  end

  if state.result then
    if now - state.result_at >= FINISHED_LINGER_MS then
      return nil
    end
    return state
  end

  if not state.started_at then
    if now - state.created_at >= LOBBY_TIMEOUT_MS then
      return nil
    end
    return state
  end

  check_timeout(context, dispatcher, state, now)
  if state.result then
    if now - state.result_at >= FINISHED_LINGER_MS then
      return nil
    end
    return state
  end

  check_disconnects(context, dispatcher, state, now)
  if state.result then
    if now - state.result_at >= FINISHED_LINGER_MS then
      return nil
    end
    return state
  end

  if state.draw_offer and now - state.draw_offer.at >= DRAW_OFFER_TTL_MS then
    local offered_by = state.draw_offer.by
    state.draw_offer = nil
    broadcast(dispatcher, OP.DRAW_DECLINED, {
      by = offered_by,
      reason = "expired",
    })
  end

  if now - state.last_clock_broadcast >= CLOCK_BROADCAST_INTERVAL_MS then
    state.last_clock_broadcast = now
    broadcast_clock(dispatcher, state, now)
  end

  return state
end

local function match_terminate(context, dispatcher, tick, state, grace_seconds)
  print(
    string.format(
      "Chess match %s terminated after %s ticks",
      context.match_id,
      tostring(tick)
    )
  )
  return state
end

local function match_signal(context, dispatcher, tick, state, data)
  local now = nk.time()
  return state, nk.json_encode(state_payload(context, state, now))
end

return {
  match_init = match_init,
  match_join_attempt = match_join_attempt,
  match_join = match_join,
  match_leave = match_leave,
  match_loop = match_loop,
  match_terminate = match_terminate,
  match_signal = match_signal,
}
