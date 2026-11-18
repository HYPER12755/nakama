-- MoonGames Ludo authoritative Nakama match handler.
-- The server owns the dice, the turn, every move and the result.

local nk = require("nakama")
local rules = require("ludo_rules")
local protocol = require("ludo_protocol")
local progression = require("ludo_profile")

local OP = protocol.OP

local TICK_RATE = 10
local MAX_SPECTATORS = 24
local DISCONNECT_GRACE_MS = 30000
local LOBBY_TIMEOUT_MS = 900000
local FINISHED_LINGER_MS = 300000

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
  broadcast(dispatcher, OP.ERROR, { message = message }, { presence })
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

local function colour_index(colour)
  for index, candidate in ipairs(protocol.COLOURS) do
    if candidate == colour then
      return index
    end
  end
  return 99
end

local function label_status(state)
  if state.result then
    return "finished"
  end
  if state.started_at then
    return "closed"
  end
  return "open"
end

local function refresh_label(state, dispatcher)
  dispatcher.match_label_update(protocol.label(state.mode, state.seats, label_status(state)))
end

local function seat_payload(state)
  local seats = {}
  for _, user_id in ipairs(state.player_order) do
    local player = state.players[user_id]
    if player then
      seats[#seats + 1] = {
        user_id = player.user_id,
        username = player.username,
        colour = player.colour,
        connected = player.connected == true,
      }
    end
  end
  table.sort(seats, function(left, right)
    return colour_index(left.colour) < colour_index(right.colour)
  end)
  return seats
end

local function spectator_payload(state)
  local result = {}
  for _, user_id in ipairs(state.spectator_order) do
    local spectator = state.spectators[user_id]
    if spectator then
      result[#result + 1] = {
        user_id = spectator.user_id,
        username = spectator.username,
      }
    end
  end
  return result
end

local function state_payload(state, now)
  return {
    game = state.game,
    seats = seat_payload(state),
    spectators = spectator_payload(state),
    chat = state.chat,
    moves = state.moves or {},
    turnDeadline = state.turn_deadline,
    lastRoll = state.last_roll,
    result = state.result,
    mode = state.mode,
    seatsCount = state.seats,
    startedAt = state.started_at,
    serverTime = now,
  }
end

local function broadcast_state(dispatcher, state, presences)
  broadcast(dispatcher, OP.STATE, state_payload(state, nk.time()), presences)
end

local function remove_player(state, user_id)
  local player = state.players[user_id]
  if player and state.taken_colours then
    state.taken_colours[player.colour] = nil
  end
  state.players[user_id] = nil
  local order = {}
  for _, entry in ipairs(state.player_order) do
    if entry ~= user_id then
      order[#order + 1] = entry
    end
  end
  state.player_order = order
end

local function remove_spectator(state, user_id)
  state.spectators[user_id] = nil
  local order = {}
  for _, entry in ipairs(state.spectator_order) do
    if entry ~= user_id then
      order[#order + 1] = entry
    end
  end
  state.spectator_order = order
end

local function user_for_colour(state, colour)
  for _, user_id in ipairs(state.player_order) do
    local player = state.players[user_id]
    if player and player.colour == colour then
      return player.user_id
    end
  end
  return nil
end

local function current_colour(state)
  if not state.game then
    return nil
  end
  return state.game.players[state.game.current + 1] and state.game.players[state.game.current + 1].color
end

local function user_for_seat(state, seat)
  local colour = current_colour(state)
  if not colour then
    return nil
  end
  return user_for_colour(state, colour)
end

local function maybe_start(dispatcher, state, now)
  if state.started_at or #state.player_order < state.seats then
    return false
  end
  state.started_at = now
  state.game = rules.create_game({
    playerCount = state.seats,
    seed = state.seed,
    ai = false,
  })
  state.colours = {}
  for _, colour in ipairs(protocol.table_colours(state.seats)) do
    state.colours[#state.colours + 1] = colour
  end
  state.turn_deadline = state.turn_seconds > 0 and (now + state.turn_seconds * 1000) or nil
  broadcast(dispatcher, OP.MATCH_STARTED, { seatsCount = state.seats })
  refresh_label(state, dispatcher)
  return true
end

local function match_init(context, params)
  params = params or {}
  local mode = params.mode == "private" and "private" or "quick"
  local seats = protocol.clamp_seats(params.seats)
  local expected_by_user = {}
  local expected_count = 0
  local reserved_colours = {}
  local colours = protocol.table_colours(seats)

  if type(params.expected_users) == "table" then
    for index, entry in ipairs(params.expected_users) do
      local user_id = entry.user_id
      local username = entry.username
      if not user_id and entry.presence then
        user_id = entry.presence.user_id
        username = username or entry.presence.username
      end
      if user_id and colours[index] then
        expected_by_user[user_id] = { username = username or "Player", colour = colours[index] }
        reserved_colours[colours[index]] = user_id
        expected_count = expected_count + 1
      end
    end
  end

  local now = nk.time()
  local state = {
    mode = mode,
    seats = seats,
    rated = params.rated == true,
    turn_seconds = protocol.clamp_turn_seconds(params.turnSeconds or params.turn_seconds),
    seed = params.seed,
    expected_by_user = expected_by_user,
    expected_count = expected_count,
    reserved_colours = reserved_colours,
    taken_colours = {},
    players = {},
    player_order = {},
    spectators = {},
    spectator_order = {},
    pending_joins = {},
    game = nil,
    colours = {},
    moves = {},
    replay_steps = {},
    move_summary = {},
    pending_roll = nil,
    last_roll = nil,
    turn_deadline = nil,
    chat = {},
    created_at = now,
    started_at = nil,
    lobby_timeout_ms = params.lobby_timeout_ms,
    last_activity = now,
    result = nil,
  }
  return state, TICK_RATE, protocol.label(mode, seats, "open")
end

local function match_join_attempt(context, dispatcher, tick, state, presence, metadata)
  local key = join_key(presence)
  if spectate_requested(metadata) then
    if state.players[presence.user_id] or state.spectators[presence.user_id] then
      state.pending_joins[key] = nil
      return state, true
    end
    if #state.spectator_order >= MAX_SPECTATORS then
      return state, false, "The spectator gallery is full"
    end
    state.pending_joins[key] = { spectate = true }
    return state, true
  end
  state.pending_joins[key] = nil
  if state.result then
    return state, false, "The match is already over"
  end
  if #state.player_order >= state.seats then
    return state, false, "This table is full"
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
      player.username = presence.username or player.username
    elseif spectator then
      spectator.username = presence.username or spectator.username
    elseif pending.spectate then
      spectator = {
        user_id = presence.user_id,
        username = presence.username or "Spectator",
        joined_at = now,
      }
      state.spectators[presence.user_id] = spectator
      state.spectator_order[#state.spectator_order + 1] = presence.user_id
      joined_spectators[#joined_spectators + 1] = spectator
    elseif #state.player_order < state.seats then
      local colours = protocol.table_colours(state.seats)
      local expected = state.expected_by_user[presence.user_id]
      local colour = nil
      if expected and not state.taken_colours[expected.colour] then
        colour = expected.colour
      end
      if not colour then
        for _, candidate in ipairs(colours) do
          local reserved = state.reserved_colours[candidate]
          if not state.taken_colours[candidate]
            and (reserved == nil or reserved == presence.user_id) then
            colour = candidate
            break
          end
        end
      end
      if colour then
        player = {
          user_id = presence.user_id,
          username = presence.username or (expected and expected.username) or "Player",
          colour = colour,
          connected = true,
          joined_at = now,
          disconnected_at = nil,
          last_chat_at = nil,
        }
        state.taken_colours[colour] = true
        state.players[presence.user_id] = player
        state.player_order[#state.player_order + 1] = presence.user_id
        joined[#joined + 1] = player
      else
        send_error(dispatcher, presence, "This table is full")
        dispatcher.match_kick({ presence })
      end
    end
  end

  state.last_activity = now
  maybe_start(dispatcher, state, now)
  broadcast_state(dispatcher, state)
  for _, player in ipairs(joined) do
    broadcast(dispatcher, OP.PLAYER_JOINED, {
      userId = player.user_id,
      username = player.username,
      colour = player.colour,
    })
  end
  for _, spectator in ipairs(joined_spectators) do
    broadcast(dispatcher, OP.SPECTATOR_JOINED, {
      userId = spectator.user_id,
      username = spectator.username,
    })
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
      end
      broadcast(dispatcher, OP.PLAYER_LEFT, {
        userId = player.user_id,
        username = player.username,
        colour = player.colour,
      })
    elseif spectator then
      remove_spectator(state, spectator.user_id)
      broadcast(dispatcher, OP.SPECTATOR_LEFT, {
        userId = spectator.user_id,
        username = spectator.username,
      })
    end
  end
  return state
end

local function finish_match(context, dispatcher, state, result, now)
  if state.result then
    return
  end
  state.result = result
  state.turn_deadline = nil
  progression.finalize_match(context, state, result, now)
  broadcast(dispatcher, OP.GAME_OVER, result)
  refresh_label(state, dispatcher)
  broadcast_state(dispatcher, state)
end

local function require_turn(dispatcher, state, message)
  local player = state.players[message.sender.user_id]
  if not player then
    send_error(dispatcher, message.sender, "You are not seated at this table")
    return nil
  end
  if not state.started_at then
    send_error(dispatcher, message.sender, "The table has not started yet")
    return nil
  end
  if not state.game or state.game.phase == "over" then
    send_error(dispatcher, message.sender, "This match is finished")
    return nil
  end
  local colour = current_colour(state)
  if player.colour ~= colour then
    send_error(dispatcher, message.sender, "It is not your turn")
    return nil
  end
  return player
end

local function record_step(state, token)
  if not state.pending_roll then
    return
  end
  state.replay_steps[#state.replay_steps + 1] = {
    roll = state.pending_roll.value,
    seed = state.pending_roll.seed,
    token = token,
  }
  state.pending_roll = nil
end

local function handle_roll(dispatcher, state, message, now)
  local player = require_turn(dispatcher, state, message)
  if not player then
    return
  end
  if state.game.phase ~= "roll" then
    send_error(dispatcher, message.sender, "Roll first, then choose a token")
    return
  end

  local before = state.game.current
  local value = rules.roll_dice(state.game)
  local last_event = state.game.events[#state.game.events]
  state.pending_roll = { value = value, seed = last_event and last_event.seed or state.game.seed }
  state.last_roll = {
    user_id = message.sender.user_id,
    colour = player.colour,
    seat = before,
    value = value,
  }
  state.turn_deadline = state.turn_seconds > 0 and (now + state.turn_seconds * 1000) or nil
  state.last_activity = now

  broadcast(dispatcher, OP.ROLL, state.last_roll)

  -- If the roll cannot move anything the core has already stored the pass
  -- event; mirror it into the replay and keep the clients in step.
  if state.game.phase == "move" and #rules.legal_moves(state.game) == 0 then
    record_step(state, -1)
    rules.pass_turn(state.game)
    state.turn_deadline = state.turn_seconds > 0 and (now + state.turn_seconds * 1000) or nil
    local nxt = user_for_seat(state, state.game.current)
    state.last_roll.nextUserId = nxt
    broadcast(dispatcher, OP.ROLL, state.last_roll)
  end

  broadcast_state(dispatcher, state)
end

local function handle_move(context, dispatcher, state, message, payload, now)
  local player = require_turn(dispatcher, state, message)
  if not player then
    return
  end
  if state.game.phase ~= "move" then
    send_error(dispatcher, message.sender, "Roll the dice first")
    return
  end
  local token = tonumber(payload.token)
  if not token or token ~= math.floor(token) or token < 0 or token > 3 then
    send_error(dispatcher, message.sender, "Choose one of your four tokens")
    return
  end

  local legal = false
  for _, move in ipairs(rules.legal_moves(state.game)) do
    if move.token == token then
      legal = true
      break
    end
  end
  if not legal then
    send_error(dispatcher, message.sender, "That token cannot move")
    return
  end

  local result = rules.apply_move(state.game, token)
  record_step(state, token)
  state.moves[#state.moves + 1] = {
    user_id = message.sender.user_id,
    colour = player.colour,
    token = token,
    from = result.move.from,
    to = result.move.to,
    captures = #result.move.captures,
    finished = result.move.finishes and 1 or 0,
  }
  state.move_summary[#state.move_summary + 1] = string.format(
    "%s moved a token to %d%s",
    player.colour,
    result.move.to,
    #result.move.captures > 0 and " and captured" or ""
  )
  state.last_activity = now
  state.turn_deadline = state.turn_seconds > 0 and (now + state.turn_seconds * 1000) or nil

  broadcast(dispatcher, OP.MOVE, {
    userId = message.sender.user_id,
    colour = player.colour,
    token = token,
    from = result.move.from,
    to = result.move.to,
    captures = result.move.captures,
    extra = result.extra,
    finished = result.move.finishes,
  })

  if result.won then
    finish_match(context, dispatcher, state, {
      status = "finished",
      winnerColour = player.colour,
      winnerUserId = message.sender.user_id,
      reason = "all tokens home",
      endedAt = now,
    }, now)
    return
  end

  state.last_roll.nextUserId = user_for_seat(state, state.game.current)
  broadcast_state(dispatcher, state)
end

local function handle_chat(dispatcher, state, message, payload, now)
  local sender = state.players[message.sender.user_id]
    or state.spectators[message.sender.user_id]
  if not sender then
    send_error(dispatcher, message.sender, "You are not in this match")
    return
  end
  if sender.last_chat_at and now - sender.last_chat_at < protocol.CHAT_RATE_LIMIT_MS then
    send_error(dispatcher, message.sender, "You are sending messages too quickly")
    return
  end
  local text = protocol.normalize_chat(payload.text)
  if not text then
    send_error(dispatcher, message.sender, "That message is empty")
    return
  end
  sender.last_chat_at = now
  local entry = {
    id = tostring(now) .. ":" .. tostring(#state.chat + 1),
    user_id = message.sender.user_id,
    username = message.sender.username or sender.username or "Player",
    text = text,
    at = now,
  }
  state.chat[#state.chat + 1] = entry
  while #state.chat > protocol.CHAT_MAX_MESSAGES do
    table.remove(state.chat, 1)
  end
  broadcast(dispatcher, OP.CHAT, entry)
end

local function handle_message(context, dispatcher, state, message, now)
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
  elseif message.op_code == OP.REQUEST_STATE then
    broadcast_state(dispatcher, state, { message.sender })
  elseif message.op_code == OP.CHAT_SEND then
    handle_chat(dispatcher, state, message, payload, now)
  elseif message.op_code == OP.ROLL_REQUEST then
    handle_roll(dispatcher, state, message, now)
  elseif message.op_code == OP.MOVE_REQUEST then
    handle_move(context, dispatcher, state, message, payload, now)
  elseif message.op_code == OP.RESIGN then
    local player = require_turn(dispatcher, state, message)
    if player then
      local winner = nil
      for _, other in ipairs(protocol.table_colours(state.seats)) do
        if other ~= player.colour then
          winner = other
          break
        end
      end
      finish_match(context, dispatcher, state, {
        status = "resign",
        winnerColour = winner,
        winnerUserId = winner and user_for_colour(state, winner) or nil,
        loserUserId = message.sender.user_id,
        reason = "resign",
        endedAt = now,
      }, now)
    end
  end
end

local function check_disconnects(context, dispatcher, state, now)
  if state.result then
    return
  end
  local connected, expired = {}, {}
  for _, user_id in ipairs(state.player_order) do
    local player = state.players[user_id]
    if player then
      if player.connected then
        connected[#connected + 1] = player
      elseif player.disconnected_at and now - player.disconnected_at >= DISCONNECT_GRACE_MS then
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
      broadcast(dispatcher, OP.PLAYER_LEFT, {
        userId = player.user_id,
        username = player.username,
        colour = player.colour,
      })
    end
    refresh_label(state, dispatcher)
    broadcast_state(dispatcher, state)
    return
  end
  if #connected == 0 then
    finish_match(context, dispatcher, state, {
      status = "abandoned",
      reason = "everyone disconnected",
      endedAt = now,
    }, now)
    return
  end
  finish_match(context, dispatcher, state, {
    status = "disconnect",
    winnerColour = connected[1].colour,
    winnerUserId = connected[1].user_id,
    loserUserId = expired[1].user_id,
    reason = "disconnect",
    endedAt = now,
  }, now)
end

local function timed_pass(dispatcher, state, now)
  local player = user_for_seat(state, state.game.current)
  if state.game.phase == "roll" then
    local value = rules.roll_dice(state.game)
    local last_event = state.game.events[#state.game.events]
    state.pending_roll = { value = value, seed = last_event and last_event.seed or state.game.seed }
  end
  if state.game.phase == "move" then
    record_step(state, -1)
    rules.pass_turn(state.game)
  end
  state.turn_deadline = state.turn_seconds > 0 and (now + state.turn_seconds * 1000) or nil
  broadcast(dispatcher, OP.MOVE, {
    timedOut = true,
    colour = current_colour(state),
    userId = player,
    message = "The turn passed on time.",
  })
  broadcast_state(dispatcher, state)
end

local function match_loop(context, dispatcher, tick, state, messages)
  local now = nk.time()
  for _, message in ipairs(messages) do
    handle_message(context, dispatcher, state, message, now)
  end
  if state.result then
    if now - state.result.endedAt >= FINISHED_LINGER_MS then
      return nil
    end
    return state
  end
  if not state.started_at then
    if now - state.created_at >= (state.lobby_timeout_ms or LOBBY_TIMEOUT_MS) then
      return nil
    end
    return state
  end

  check_disconnects(context, dispatcher, state, now)

  if state.game and state.game.phase ~= "over"
    and state.turn_deadline and now >= state.turn_deadline then
    timed_pass(dispatcher, state, now)
  end

  state.last_activity = now
  return state
end

local function match_terminate(context, dispatcher, tick, state, grace_seconds)
  print(string.format("Ludo match %s terminated after %s ticks", context.match_id, tostring(tick)))
  return state
end

local function match_signal(context, dispatcher, tick, state, data)
  return state, nk.json_encode(state_payload(state, nk.time()))
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
