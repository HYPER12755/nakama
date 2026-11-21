local nk = require("nakama")
local protocol = require("uno_protocol")
local rules = require("uno_rules")
local progression = require("uno_profile")
local social = require("moongames_social")

local OP = protocol.OP

local TICK_RATE = 10
local MAX_SPECTATORS = 24
local DISCONNECT_GRACE_MS = 30000
local LOBBY_TIMEOUT_MS = 900000
local FINISHED_LINGER_MS = 300000

local function encode(value)
  return nk.json_encode(value)
end

local function send_error(dispatcher, presence, code, message)
  dispatcher.broadcast_message(
    OP.ERROR,
    encode({ code = code, message = message }),
    { presence }
  )
end

local function refresh_label(dispatcher, state)
  local status = "open"
  if state.result ~= nil then
    status = "finished"
  elseif state.started_at ~= nil then
    status = "closed"
  end
  dispatcher.match_label_update(protocol.label(state.mode, state.seats, status))
end

local function seat_for_user(state, user_id)
  for index, player in ipairs(state.player_order) do
    if player.user_id == user_id then
      return index, player
    end
  end
  return nil, nil
end

local function connected_count(state)
  local count = 0
  for _, player in ipairs(state.player_order) do
    if player.connected then
      count = count + 1
    end
  end
  return count
end

local function state_payload(state, viewer_id)
  local game = state.game
  local payload = {
    mode = state.mode,
    seats = state.seats,
    rated = state.rated,
    started = state.started_at ~= nil,
    result = state.result,
    turn = game ~= nil and game.turn - 1 or 0,
    direction = game ~= nil and game.direction or 1,
    currentColor = game ~= nil and game.current_color or nil,
    topCard = game ~= nil and game.discard[#game.discard] or nil,
    pendingChallenge = game ~= nil and game.pending_challenge or nil,
    players = {},
    spectators = {},
    chat = state.chat,
    deckCount = game ~= nil and #game.draw_pile or 0,
  }

  for index, player in ipairs(state.player_order) do
    local entry = {
      seat = index - 1,
      userId = player.user_id,
      username = player.username,
      connected = player.connected,
      count = 0,
    }
    if game ~= nil then
      local hand = game.players[index] and game.players[index].hand or {}
      entry.count = #hand
      if viewer_id ~= nil and player.user_id == viewer_id then
        entry.hand = hand
      end
    end
    payload.players[#payload.players + 1] = entry
  end

  for _, spectator in ipairs(state.spectators) do
    payload.spectators[#payload.spectators + 1] = {
      userId = spectator.user_id,
      username = spectator.username,
    }
  end
  if game ~= nil and viewer_id ~= nil then
    local moves = rules.legal_moves(game, viewer_id)
    payload.legalCards = moves.cards
    payload.canDraw = moves.can_draw
  end
  return payload
end

local function broadcast_state(dispatcher, state)
  for _, player in ipairs(state.player_order) do
    if player.presence ~= nil then
      dispatcher.broadcast_message(
        OP.STATE,
        encode(state_payload(state, player.user_id)),
        { player.presence }
      )
    end
  end
  for _, spectator in ipairs(state.spectators) do
    if spectator.presence ~= nil then
      dispatcher.broadcast_message(
        OP.STATE,
        encode(state_payload(state, nil)),
        { spectator.presence }
      )
    end
  end
end

local function broadcast_all(dispatcher, state, op, payload)
  local presences = {}
  for _, player in ipairs(state.player_order) do
    if player.presence ~= nil then
      presences[#presences + 1] = player.presence
    end
  end
  for _, spectator in ipairs(state.spectators) do
    if spectator.presence ~= nil then
      presences[#presences + 1] = spectator.presence
    end
  end
  if #presences > 0 then
    dispatcher.broadcast_message(op, encode(payload), presences)
  end
end

local function maybe_start(dispatcher, state)
  if state.started_at ~= nil or #state.player_order < state.seats then
    return
  end
  state.started_at = nk.time()
  local players = {}
  for index, player in ipairs(state.player_order) do
    players[index] = { id = player.user_id, name = player.username }
  end
  state.game = rules.create_game(state.seed or nk.time(), players, state.started_at)
  state.turn_deadline = state.turn_seconds > 0 and nk.time() + state.turn_seconds * 1000 or nil
  broadcast_all(dispatcher, state, OP.MATCH_STARTED, { seats = state.seats })
  refresh_label(dispatcher, state)
end

local function remove_player(dispatcher, state, user_id)
  local index, player = seat_for_user(state, user_id)
  if index == nil then
    return
  end
  if state.started_at == nil then
    table.remove(state.player_order, index)
    if state.game ~= nil then
      table.remove(state.game.players, index)
    end
  else
    player.connected = false
    player.disconnected_at = nk.time()
  end
  broadcast_all(dispatcher, state, OP.PLAYER_LEFT, { userId = user_id })
  refresh_label(dispatcher, state)
end

local function finish_match(dispatcher, state, result)
  if state.result ~= nil then
    return
  end
  state.result = result
  state.result.at = nk.time()

  local converted = {
    mode = state.mode,
    rated = state.rated,
    seats = state.seats,
    winner = result.winner_user_id,
    replay = state.game ~= nil and state.game.replay or {},
    players = {},
    finalized = false,
  }
  for index, player in ipairs(state.player_order) do
    converted.players[index] = {
      user_id = player.user_id,
      username = player.username,
    }
  end
  pcall(progression.finalize_match, { match_id = state.match_id }, converted, result, nk.time())
  state.chat = {}
  broadcast_all(dispatcher, state, OP.GAME_OVER, result)
  refresh_label(dispatcher, state)
end

local function require_turn(state, user_id)
  if state.game == nil or state.result ~= nil then
    return false
  end
  local index = seat_for_user(state, user_id)
  if index == nil then
    return false
  end
  return state.game.turn == index
end

local function handle_chat(dispatcher, state, presence, payload)
  local now = nk.time()
  local user_id = presence.user_id
  if state.last_chat_at ~= nil and user_id ~= nil then
    local last = state.last_chat_at[user_id] or 0
    if now - last < protocol.CHAT_RATE_MS then
      return
    end
  end
  if state.last_chat_at == nil then
    state.last_chat_at = {}
  end
  state.last_chat_at[user_id] = now
  local message = {
    id = nk.uuid_v4(),
    userId = user_id,
    username = presence.username,
    text = protocol.normalize_chat(payload.text),
    at = now,
  }
  state.chat[#state.chat + 1] = message
  while #state.chat > protocol.CHAT_HISTORY_LIMIT do
    table.remove(state.chat, 1)
  end
  broadcast_all(dispatcher, state, OP.CHAT, message)
end

local function handle_action(dispatcher, state, user_id, action)
  if state.game == nil or state.result ~= nil then
    return
  end
  local pending = state.game.pending_challenge
  if pending ~= nil then
    if pending.target_id ~= user_id then
      return
    end
  elseif not require_turn(state, user_id) then
    return
  end

  local next_state, ok, error_code = rules.apply_action(state.game, action)
  if not ok then
    return error_code
  end
  state.game = next_state
  state.last_activity = nk.time()
  state.turn_deadline = state.game.pending_challenge == nil
    and state.turn_seconds > 0
      and nk.time() + state.turn_seconds * 1000
    or nil
  broadcast_all(dispatcher, state, OP.MOVE, {
    action = action,
    turn = state.game.turn - 1,
    currentColor = state.game.current_color,
  })
  broadcast_state(dispatcher, state)
  if state.game.finished then
    finish_match(dispatcher, state, {
      status = "finished",
      winner_user_id = state.game.winner,
      reason = "hand finished",
    })
  end
  return nil
end

local function handle_message(context, dispatcher, tick, state, message)
  local payload = {}
  if type(message.data) == "string" and message.data ~= "" then
    local ok, decoded = pcall(nk.json_decode, message.data)
    if ok and type(decoded) == "table" then
      payload = decoded
    end
  end
  local user_id = message.presence and message.presence.user_id or nil

  if message.op_code == OP.PING then
    dispatcher.broadcast_message(OP.PONG, encode({ clientTime = payload.clientTime }), { message.presence })
    return
  end
  if message.op_code == OP.REQUEST_STATE then
    if user_id ~= nil then
      dispatcher.broadcast_message(
        OP.STATE,
        encode(state_payload(state, user_id)),
        { message.presence }
      )
    end
    return
  end
  if message.op_code == OP.CHAT_SEND then
    handle_chat(dispatcher, state, message.presence, payload)
    return
  end
  if message.op_code == OP.RESIGN then
    local index = seat_for_user(state, user_id)
    if index ~= nil then
      local winner = nil
      for _, other in ipairs(state.player_order) do
        if other.user_id ~= user_id then
          winner = other.user_id
          break
        end
      end
      finish_match(dispatcher, state, {
        status = "finished",
        winner_user_id = winner,
        reason = "resignation",
      })
    end
    return
  end

  local action = nil
  if message.op_code == OP.PLAY_REQUEST then
    action = {
      type = "play",
      player_id = user_id,
      card_id = payload.cardId,
      chosen_color = payload.chosenColor,
    }
  elseif message.op_code == OP.DRAW_REQUEST then
    action = { type = "draw", player_id = user_id }
  elseif message.op_code == OP.CHALLENGE_REQUEST then
    action = { type = "challenge", player_id = user_id, accept = payload.accept == true }
  end

  if action ~= nil then
    local error_code = handle_action(dispatcher, state, user_id, action)
    if error_code ~= nil then
      send_error(dispatcher, message.presence, error_code, "That move is not allowed.")
    end
  end
end

local function check_disconnects(dispatcher, state)
  if state.started_at == nil or state.result ~= nil then
    return
  end
  if connected_count(state) == 0 then
    finish_match(dispatcher, state, { status = "abandoned", winner_user_id = nil })
    return
  end
  local now = nk.time()
  for _, player in ipairs(state.player_order) do
    if not player.connected and player.disconnected_at ~= nil
      and now - player.disconnected_at >= DISCONNECT_GRACE_MS then
      local winner = nil
      for _, other in ipairs(state.player_order) do
        if other.user_id ~= player.user_id and other.connected then
          winner = other.user_id
          break
        end
      end
      finish_match(dispatcher, state, {
        status = "finished",
        winner_user_id = winner,
        reason = "disconnect",
      })
      return
    end
  end
end

local MATCH = {}

function MATCH.match_init(context, params)
  params = params or {}
  local mode = params.mode == "private" and "private" or "quick"
  local seats = protocol.clamp_seats(params.seats or 2)
  local expected_by_user = {}
  for index, entry in ipairs(params.expected_users or {}) do
    local user_id = entry.user_id or (entry.presence and entry.presence.user_id)
    if user_id ~= nil then
      expected_by_user[user_id] = { seat = index, username = entry.username }
    end
  end
  local state = {
    match_id = context.match_id,
    mode = mode,
    seats = seats,
    rated = mode == "quick" or params.rated == true,
    creator = params.creator,
    expected_by_user = expected_by_user,
    expected_count = 0,
    player_order = {},
    spectators = {},
    pending_joins = {},
    chat = {},
    last_chat_at = {},
    game = nil,
    seed = tonumber(params.seed),
    turn_seconds = math.max(0, tonumber(params.turnSeconds) or 0),
    turn_deadline = nil,
    created_at = nk.time(),
    started_at = nil,
    last_activity = nk.time(),
    result = nil,
    finalized = false,
  }
  for _ in pairs(expected_by_user) do
    state.expected_count = state.expected_count + 1
  end
  return state, TICK_RATE, protocol.label(mode, seats, "open")
end

function MATCH.match_join_attempt(context, dispatcher, tick, state, presence, metadata)
  local join_metadata = metadata
  if type(join_metadata) == "string" and join_metadata ~= "" then
    local ok, decoded = pcall(nk.json_decode, join_metadata)
    join_metadata = ok and type(decoded) == "table" and decoded or {}
  end
  join_metadata = type(join_metadata) == "table" and join_metadata or {}
  local spectate = join_metadata.spectate == true
    or join_metadata.spectate == "1"
    or join_metadata.spectate == "true"
  local key = presence.user_id or presence.session_id
  state.pending_joins[key] = { spectate = spectate }

  if state.result ~= nil then
    return state, spectate, "match has finished"
  end
  if spectate then
    return state, true
  end
  if #state.player_order >= state.seats then
    return state, false, "table is full"
  end
  if state.expected_count > 0 and state.expected_by_user[presence.user_id] == nil then
    return state, false, "this table is reserved"
  end
  return state, true
end

function MATCH.match_join(context, dispatcher, tick, state, presences)
  for _, presence in ipairs(presences) do
    local key = presence.user_id or presence.session_id
    local pending = state.pending_joins[key]
    local spectate = pending ~= nil and pending.spectate or false
    state.pending_joins[key] = nil

    if spectate then
      if #state.spectators < MAX_SPECTATORS then
        state.spectators[#state.spectators + 1] = {
          user_id = presence.user_id,
          username = presence.username,
          presence = presence,
          session_id = presence.session_id,
        }
        broadcast_all(dispatcher, state, OP.SPECTATOR_JOINED, {
          userId = presence.user_id,
          username = presence.username,
        })
      else
        dispatcher.match_kick({ presence })
      end
    else
      local index, player = seat_for_user(state, presence.user_id)
      if index ~= nil then
        player.connected = true
        player.disconnected_at = nil
        player.presence = presence
        player.session_id = presence.session_id
      elseif #state.player_order < state.seats then
        player = {
          user_id = presence.user_id,
          username = presence.username,
          presence = presence,
          session_id = presence.session_id,
          connected = true,
          disconnected_at = nil,
        }
        state.player_order[#state.player_order + 1] = player
        broadcast_all(dispatcher, state, OP.PLAYER_JOINED, {
          userId = presence.user_id,
          username = presence.username,
        })
      else
        dispatcher.match_kick({ presence })
      end
    end
  end
  maybe_start(dispatcher, state)
  broadcast_state(dispatcher, state)
  return state
end

function MATCH.match_leave(context, dispatcher, tick, state, presences)
  for _, presence in ipairs(presences) do
    local key = presence.user_id or presence.session_id
    for index, spectator in ipairs(state.spectators) do
      local spectator_key = spectator.user_id or spectator.session_id
      if spectator_key == key then
        table.remove(state.spectators, index)
        broadcast_all(dispatcher, state, OP.SPECTATOR_LEFT, { userId = spectator.user_id })
      end
    end
    remove_player(dispatcher, state, presence.user_id)
  end
  return state
end

function MATCH.match_loop(context, dispatcher, tick, state, messages)
  for _, message in ipairs(messages) do
    handle_message(context, dispatcher, tick, state, message)
  end

  local now = nk.time()
  if state.result ~= nil and now - state.result.at >= FINISHED_LINGER_MS then
    return nil
  end
  if state.started_at == nil and now - state.created_at >= LOBBY_TIMEOUT_MS then
    return nil
  end

  check_disconnects(dispatcher, state)

  if state.result == nil and state.turn_deadline ~= nil and now >= state.turn_deadline then
    state.turn_deadline = nil
    local index = state.game ~= nil and state.game.turn or nil
    local player = index ~= nil and state.player_order[index] or nil
    if player ~= nil and player.connected then
      handle_action(dispatcher, state, player.user_id, { type = "draw", player_id = player.user_id })
    end
  end

  state.last_activity = now
  return state
end

function MATCH.match_terminate(context, dispatcher, tick, state, grace)
  return nil
end

function MATCH.match_signal(context, dispatcher, tick, state, data)
  return state
end

return MATCH
