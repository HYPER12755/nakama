-- MoonGames Carrom authoritative Nakama match handler.
--
-- The server owns the table, the seats, the turn, and the result. Clients only
-- send shot and chat requests; every shot is simulated and validated here.

local nk = require("nakama")
local physics = require("carrom_physics")
local rules = require("carrom_rules")
local protocol = require("carrom_protocol")

local OP = protocol.OP

local TICK_RATE = 10
local MAX_SPECTATORS = 24
local DISCONNECT_GRACE_MS = 30000
local LOBBY_TIMEOUT_MS = 900000
local FINISHED_LINGER_MS = 300000
local CHAT_MAX_MESSAGES = protocol.CHAT_MAX_MESSAGES
local CHAT_RATE_LIMIT_MS = protocol.CHAT_RATE_LIMIT_MS

-- The colours used by a table of each size, in seating order.
local TABLE_COLOURS = {
  [2] = { "white", "black" },
  [3] = { "white", "black", "green" },
  [4] = { "white", "yellow", "black", "green" },
}

local function table_colours(seats)
  return TABLE_COLOURS[seats] or TABLE_COLOURS[2]
end

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
  for index, candidate in ipairs(table_colours(4)) do
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

-- The label is how the quick table lookup finds an open table, so it has to
-- follow the table state.
local function refresh_label(state, dispatcher)
  dispatcher.match_label_update(
    protocol.label(state.mode, state.seats, label_status(state))
  )
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
  -- The seats are listed in seating order around the table, not in the order
  -- the players happened to join.
  table.sort(seats, function(left, right)
    return colour_index(left.colour) < colour_index(right.colour)
  end)
  return seats
end

local function spectator_payload(state)
  local spectators = {}
  for _, user_id in ipairs(state.spectator_order) do
    local spectator = state.spectators[user_id]
    if spectator then
      spectators[#spectators + 1] = {
        user_id = spectator.user_id,
        username = spectator.username,
      }
    end
  end
  return spectators
end

local function state_payload(context, state, now)
  return {
    game = state.game,
    seats = seat_payload(state),
    spectators = spectator_payload(state),
    chat = state.chat,
    result = state.result,
    mode = state.mode,
    seatsCount = state.seats,
    startedAt = state.started_at,
    shotSerial = state.shot_serial or 0,
    lastShot = state.last_shot,
    serverTime = now,
  }
end

local function broadcast_state(context, dispatcher, state, presences)
  broadcast(
    dispatcher,
    OP.STATE,
    state_payload(context, state, nk.time()),
    presences
  )
end

local function remove_player(state, user_id)
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

local function seat_for(state, user_id)
  local player = state.players[user_id]
  if not player then
    return nil
  end
  return player.colour
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

local function maybe_start(context, dispatcher, state, now)
  if state.started_at then
    return false
  end
  if #state.player_order < state.seats then
    return false
  end
  state.started_at = now
  state.game = rules.create_initial_state(table_colours(state.seats))
  broadcast(dispatcher, OP.MATCH_STARTED, {
    seatsCount = state.seats,
  })
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
  local colours = table_colours(seats)

  if type(params.expected_users) == "table" then
    for index, entry in ipairs(params.expected_users) do
      local user_id = entry.user_id
      local username = entry.username
      if not user_id and entry.presence then
        user_id = entry.presence.user_id
        username = username or entry.presence.username
      end
      if user_id then
        expected_by_user[user_id] = {
          username = username or "Player",
          colour = colours[index],
        }
        reserved_colours[colours[index]] = user_id
        expected_count = expected_count + 1
      end
    end
  end

  local now = nk.time()
  local state = {
    mode = mode,
    seats = seats,
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
    chat = {},
    created_at = now,
    started_at = nil,
    last_activity = now,
    result = nil,
  }

  return state, TICK_RATE, protocol.label(mode, seats, "open")
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
      -- The creator of a room keeps the first colour. Anyone else takes the
      -- next free colour in the order they arrived.
      local colours = table_colours(state.seats)
      local expected = state.expected_by_user[presence.user_id]
      local colour = nil
      if expected ~= nil and state.taken_colours[expected.colour] ~= true then
        colour = expected.colour
      end
      if colour == nil then
        for _, candidate in ipairs(colours) do
          -- A colour reserved for a player who has not arrived yet is kept
          -- for them, so the room creator always keeps the first colour.
          local reserved = state.reserved_colours[candidate]
          if
            state.taken_colours[candidate] ~= true
            and (reserved == nil or reserved == presence.user_id)
          then
            colour = candidate
            break
          end
        end
      end
      if colour ~= nil then
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
        broadcast(dispatcher, OP.ERROR, {
          message = "This table is full",
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

local function handle_shot(context, dispatcher, state, message, payload, now)
  local player = state.players[message.sender.user_id]
  if not player then
    send_error(dispatcher, message.sender, "You are not seated at this table")
    return
  end
  if not state.started_at then
    send_error(dispatcher, message.sender, "The table has not started yet")
    return
  end
  if state.game.status ~= "aiming" then
    send_error(dispatcher, message.sender, "This match is finished")
    return
  end
  if player.colour ~= state.game.turn then
    send_error(dispatcher, message.sender, "It is not your turn")
    return
  end

  local position = tonumber(payload.position)
  local angle = tonumber(payload.angle)
  local power = tonumber(payload.power)
  if not position or not angle or not power then
    send_error(dispatcher, message.sender, "Invalid shot")
    return
  end
  if
    position < physics.BASELINE_MIN - 0.000001
    or position > physics.BASELINE_MAX + 0.000001
  then
    send_error(dispatcher, message.sender, "Place the striker inside the baseline")
    return
  end
  if power < 0.01 or power > 1 then
    send_error(dispatcher, message.sender, "Choose a shot strength between 1% and 100%")
    return
  end
  if not rules.striker_fits(state.game, position) then
    send_error(dispatcher, message.sender, "The striker is blocked. Move it along the baseline")
    return
  end

  local shot = { position = position, angle = angle, power = power }
  local result = physics.simulate(state.game, shot)
  local next_game, outcome = rules.resolve(state.game, result, shot)
  state.game = next_game
  state.last_activity = now
  -- The shot is shared so every client can replay the same deterministic
  -- animation that the server just resolved.
  state.last_shot = {
    user_id = message.sender.user_id,
    position = position,
    angle = angle,
    power = power,
  }
  state.shot_serial = (state.shot_serial or 0) + 1

  if next_game.status == "finished" then
    state.result = {
      status = "finished",
      winnerColour = next_game.winner,
      winnerUserId = next_game.winner and user_for_colour(state, next_game.winner) or nil,
      reason = "board cleared",
      endedAt = now,
    }
    broadcast(dispatcher, OP.GAME_OVER, state.result)
    refresh_label(state, dispatcher)
  end

  broadcast_state(context, dispatcher, state)
end

local function handle_chat(dispatcher, state, message, payload, now)
  local sender = state.players[message.sender.user_id]
    or state.spectators[message.sender.user_id]
  if not sender then
    send_error(dispatcher, message.sender, "You are not in this match")
    return
  end
  if sender.last_chat_at and now - sender.last_chat_at < CHAT_RATE_LIMIT_MS then
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
  while #state.chat > CHAT_MAX_MESSAGES do
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
    return
  end

  if message.op_code == OP.REQUEST_STATE then
    broadcast_state(context, dispatcher, state, { message.sender })
    return
  end

  if message.op_code == OP.CHAT_SEND then
    handle_chat(dispatcher, state, message, payload, now)
    return
  end

  if message.op_code == OP.SHOT_REQUEST then
    handle_shot(context, dispatcher, state, message, payload, now)
    return
  end
end

local function check_disconnects(context, dispatcher, state, now)
  for _, user_id in ipairs(state.player_order) do
    local player = state.players[user_id]
    if player and player.connected == false and player.disconnected_at then
      if now - player.disconnected_at >= DISCONNECT_GRACE_MS then
        remove_player(state, user_id)
        broadcast(dispatcher, OP.PLAYER_LEFT, {
          userId = player.user_id,
          username = player.username,
          colour = player.colour,
        })
      end
    end
  end
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

  return state
end

local function match_terminate(context, dispatcher, tick, state, grace_seconds)
  print(
    string.format(
      "Carrom match %s terminated after %s ticks",
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
