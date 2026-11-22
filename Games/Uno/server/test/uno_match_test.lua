local script_path = arg[0] or "Uno/server/test/uno_match_test.lua"
local script_dir = script_path:match("^(.*)[/\\]") or "."
local server_dir = script_dir .. "/.."

package.path = server_dir .. "/?.lua;" .. script_dir .. "/?.lua;" .. script_dir .. "/../../../shared/server/?.lua;" .. package.path

local now = 1700000000000
local stored = {}
local leaderboards = {}

local function copy(value)
  if type(value) ~= "table" then
    return value
  end
  local result = {}
  for key, item in pairs(value) do
    result[key] = copy(item)
  end
  return result
end

local function json_encode(value)
  local parts = {}
  local function encode(item)
    if type(item) == "table" then
      if #item > 0 then
        local inner = {}
        for _, child in ipairs(item) do
          inner[#inner + 1] = encode(child)
        end
        return "[" .. table.concat(inner, ",") .. "]"
      end
      local object = {}
      for key, child in pairs(item) do
        object[#object + 1] = string.format("%q:%s", tostring(key), encode(child))
      end
      return "{" .. table.concat(object, ",") .. "}"
    end
    if type(item) == "string" then
      return string.format("%q", item)
    end
    if item == nil then
      return "null"
    end
    return tostring(item)
  end
  for _, part in ipairs(parts) do
    _ = part
  end
  return encode(value)
end

local fake_nk = {
  time = function()
    return now
  end,
  uuid_v4 = function()
    return "uuid-1"
  end,
  json_encode = json_encode,
  json_decode = function(value)
    local json = require("json")
    return json.decode(value)
  end,
  storage_read = function(objects)
    local result = {}
    for index, object in ipairs(objects) do
      local key = object.collection .. ":" .. object.key
      if stored[key] ~= nil then
        result[index] = { key = object.key, value = stored[key] }
      end
    end
    return result
  end,
  storage_write = function(writes)
    for _, write in ipairs(writes) do
      stored[write.collection .. ":" .. write.key] = write.value
    end
    return {}
  end,
  storage_list = function()
    return {}
  end,
  leaderboard_create = function(id)
    if leaderboards[id] == nil then
      leaderboards[id] = { records = {} }
    end
  end,
  leaderboard_record_write = function(id, owner_id, username, score, subscore, metadata)
    leaderboards[id].records[owner_id] = {
      owner_id = owner_id,
      username = username,
      score = score,
      subscore = subscore,
      metadata = metadata,
      rank = 1,
    }
  end,
  leaderboard_records_list = function(id, owner_ids, limit)
    local records = {}
    for _, record in pairs(leaderboards[id].records) do
      records[#records + 1] = record
    end
    if type(owner_ids) == "table" then
      return {}, records, nil, nil, #records
    end
    local top = {}
    for index = 1, math.min(limit or 10, #records) do
      top[index] = records[index]
    end
    return top, {}, nil, nil, #records
  end,
  account_get_id = function()
    return { email = "player@example.com", devices = { { id = "device" } } }
  end,
  logger_warn = function() end,
}

package.preload["nakama"] = function()
  return fake_nk
end

package.preload["moongames_social"] = function()
  return {
    INVITE_TTL_MS = 86400000,
    record_play = function() end,
  }
end

local MATCH = dofile(server_dir .. "/uno_match.lua")
local protocol = require("uno_protocol")
local OP = protocol.OP

local failures = 0

local function test(name, fn)
  local ok, err = pcall(fn)
  if ok then
    print("ok - " .. name)
  else
    failures = failures + 1
    io.stderr:write("not ok - " .. name .. ": " .. tostring(err) .. "\n")
  end
end

local function assert_equal(actual, expected, message)
  if actual ~= expected then
    error((message or "values differ") .. ": expected " .. tostring(expected) .. " got " .. tostring(actual))
  end
end

local function dispatcher()
  local messages = {}
  local joins = 0
  local kicks = 0
  local label = "uno|quick|2|open"
  return {
    broadcast_message = function(op, data, presences)
      messages[#messages + 1] = { op = op, data = data, presences = presences }
    end,
    match_label_update = function(value)
      label = value
    end,
    match_join = function()
      joins = joins + 1
    end,
    match_kick = function()
      kicks = kicks + 1
    end,
    messages = messages,
    joins = function()
      return joins
    end,
    kicks = function()
      return kicks
    end,
    label = function()
      return label
    end,
  }
end

local function presence(id, name)
  return { user_id = id, username = name, session_id = id .. "-session" }
end

local function new_match()
  stored = {}
  leaderboards = {}
  local state, tick, label = MATCH.match_init({ match_id = "m1" }, { seats = 2, seed = 123456789 })
  return state, tick, label
end

local function seat_players(dispatcher_obj, state)
  local alice = presence("u1", "Alice")
  local bob = presence("u2", "Bob")
  local _, allowed = MATCH.match_join_attempt({}, dispatcher_obj, 1, state, alice, {})
  assert_equal(allowed, true, "alice may join")
  state = MATCH.match_join({}, dispatcher_obj, 1, state, { alice })
  local _, allowed_bob = MATCH.match_join_attempt({}, dispatcher_obj, 2, state, bob, {})
  assert_equal(allowed_bob, true, "bob may join")
  state = MATCH.match_join({}, dispatcher_obj, 2, state, { bob })
  return state, alice, bob
end

test("initialises a quick table", function()
  local state, tick, label = new_match()
  assert_equal(tick, 10, "tick rate")
  assert_equal(label, "uno|quick|2|open", "label")
  assert_equal(state.game, nil, "no game before players join")
  assert_equal(state.lobby_timeout_ms, 900000, "default lobby timeout")
end)

test("uses a custom lobby timeout", function()
  local state = MATCH.match_init({ match_id = "m1" }, { seats = 2, lobby_timeout_ms = 5000 })
  assert_equal(state.lobby_timeout_ms, 5000, "custom lobby timeout stored")
  local saved = now
  now = now + 6000
  local next_state = MATCH.match_loop({}, dispatcher(), 1, state, {})
  now = saved
  assert_equal(next_state, nil, "lobby timed out before the default")
end)

test("does not leak rejected join attempts into pending_joins", function()
  local state = new_match()
  local dispatcher_obj = dispatcher()
  state = seat_players(dispatcher_obj, state)
  local extra = presence("u3", "Third")
  local _, allowed = MATCH.match_join_attempt({}, dispatcher_obj, 4, state, extra, {})
  assert_equal(allowed, false, "full table refused")
  assert_equal(state.pending_joins[extra.user_id], nil, "no pending join stored")
end)

test("starts a hand when both seats are taken", function()
  local state = new_match()
  local dispatcher_obj = dispatcher()
  state = seat_players(dispatcher_obj, state)
  assert_equal(#state.player_order, 2, "two seats")
  assert_equal(state.game ~= nil, true, "game started")
  assert_equal(#state.game.players[1].hand, 9, "starting Draw Two cards")
  assert_equal(dispatcher_obj.label(), "uno|quick|2|closed", "label closed")
end)

test("accepts a legal play and broadcasts state", function()
  local state = new_match()
  local dispatcher_obj = dispatcher()
  state = seat_players(dispatcher_obj, state)
  local rules = require("uno_rules")
  local starter_id = state.game.players[state.game.turn].id
  local legal = rules.legal_moves(state.game, starter_id).cards
  assert_equal(#legal > 0, true, "a legal card exists")
  MATCH.match_loop({}, dispatcher_obj, 3, state, {
    {
      op_code = OP.PLAY_REQUEST,
      presence = presence(starter_id, starter_id == "u1" and "Alice" or "Bob"),
      data = json_encode({ cardId = legal[1] }),
    },
  })
  local found = false
  for _, message in ipairs(dispatcher_obj.messages) do
    if message.op == OP.MOVE then
      found = true
    end
  end
  assert_equal(found, true, "move broadcast")
end)

test("keeps spectators read-only", function()
  local state = new_match()
  local dispatcher_obj = dispatcher()
  state = seat_players(dispatcher_obj, state)
  local watcher = presence("u3", "Watcher")
  local _, allowed = MATCH.match_join_attempt({}, dispatcher_obj, 4, state, watcher, { spectate = true })
  assert_equal(allowed, true, "spectator admitted")
  state = MATCH.match_join({}, dispatcher_obj, 4, state, { watcher })
  assert_equal(#state.spectators, 1, "one spectator")
  assert_equal(#state.game.players[1].hand, 9, "board unchanged")
end)

test("resignation ends the match", function()
  local state = new_match()
  local dispatcher_obj = dispatcher()
  state = seat_players(dispatcher_obj, state)
  MATCH.match_loop({}, dispatcher_obj, 5, state, {
    {
      op_code = OP.RESIGN,
      presence = presence("u1", "Alice"),
      data = "{}",
    },
  })
  assert_equal(state.result ~= nil, true, "result set")
  assert_equal(state.result.winner_user_id, "u2", "other player wins")
end)

test("broadcasts a public result and a final state on game over", function()
  local state = new_match()
  local dispatcher_obj = dispatcher()
  state = seat_players(dispatcher_obj, state)
  MATCH.match_loop({}, dispatcher_obj, 5, state, {
    {
      op_code = OP.RESIGN,
      presence = presence("u1", "Alice"),
      data = "{}",
    },
  })
  local json = require("json")
  local over_index = nil
  for index, message in ipairs(dispatcher_obj.messages) do
    if message.op == OP.GAME_OVER then
      over_index = index
      local result = json.decode(message.data)
      assert_equal(result.status, "finished", "result status")
      assert_equal(result.winnerUserId, "u2", "camel winner")
      assert_equal(result.winner_user_id, "u2", "legacy winner")
      assert_equal(result.reason, "resignation", "result reason")
      assert_equal(type(result.replay), "table", "result replay")
    end
  end
  assert_equal(over_index ~= nil, true, "game over broadcast")
  local final_state = nil
  for index = over_index + 1, #dispatcher_obj.messages do
    if dispatcher_obj.messages[index].op == OP.STATE then
      final_state = dispatcher_obj.messages[index]
    end
  end
  assert_equal(final_state ~= nil, true, "final state broadcast")
  local payload = json.decode(final_state.data)
  assert_equal(payload.result.winnerUserId, "u2", "payload result winner")
  assert_equal(state.finalized, true, "match finalized")
end)

test("a disconnected seat can rejoin a full table", function()
  local state = new_match()
  local dispatcher_obj = dispatcher()
  state = seat_players(dispatcher_obj, state)
  state.player_order[2].connected = false
  state.player_order[2].disconnected_at = now
  local bob = presence("u2", "Bob")
  local _, allowed = MATCH.match_join_attempt({}, dispatcher_obj, 4, state, bob, {})
  assert_equal(allowed, true, "disconnected player may rejoin")
  state = MATCH.match_join({}, dispatcher_obj, 4, state, { bob })
  assert_equal(#state.player_order, 2, "seat count unchanged")
  assert_equal(state.player_order[2].connected, true, "seat restored")
end)

test("match_signal returns the viewer-free state payload", function()
  local state = new_match()
  local dispatcher_obj = dispatcher()
  state = seat_players(dispatcher_obj, state)
  state.game.pending_challenge = { owner_id = "u1", target_id = "u2", legal = true }
  local returned, encoded = MATCH.match_signal({}, dispatcher_obj, 1, state, "")
  assert_equal(returned == state, true, "state returned")
  local payload = require("json").decode(encoded)
  assert_equal(payload.pendingChallenge.ownerId, "u1", "owner id")
  assert_equal(payload.pendingChallenge.targetId, "u2", "target id")
  assert_equal(payload.pendingChallenge.legal, true, "legal flag")
  assert_equal(payload.legalCards, nil, "no viewer legal cards")
end)

test("turn timeout draws for a disconnected player and reschedules", function()
  local state = MATCH.match_init({ match_id = "m1" }, {
    seats = 2,
    seed = 123456789,
    turnSeconds = 1,
  })
  local dispatcher_obj = dispatcher()
  state = seat_players(dispatcher_obj, state)
  local index = state.game.turn
  state.player_order[index].connected = false
  state.player_order[index].disconnected_at = now
  local before = #dispatcher_obj.messages
  local saved = now
  now = now + 2000
  MATCH.match_loop({}, dispatcher_obj, 6, state, {})
  now = saved
  local moves = 0
  for message_index = before + 1, #dispatcher_obj.messages do
    if dispatcher_obj.messages[message_index].op == OP.MOVE then
      moves = moves + 1
    end
  end
  assert_equal(moves > 0, true, "timeout produced a move")
  assert_equal(state.turn_deadline ~= nil, true, "next deadline scheduled")
end)

test("turn timeout auto-accepts for a disconnected challenge target", function()
  local state = MATCH.match_init({ match_id = "m1" }, {
    seats = 2,
    seed = 123456789,
    turnSeconds = 1,
  })
  local dispatcher_obj = dispatcher()
  state = seat_players(dispatcher_obj, state)
  state.game.pending_challenge = { owner_id = "u1", target_id = "u2", legal = true }
  state.player_order[2].connected = false
  state.player_order[2].disconnected_at = now
  local saved = now
  now = now + 2000
  MATCH.match_loop({}, dispatcher_obj, 7, state, {})
  now = saved
  assert_equal(state.game.pending_challenge, nil, "challenge auto-accepted")
end)

test("uses the runtime sender for actions, errors, pings and chat", function()
  local state = new_match()
  local dispatcher_obj = dispatcher()
  state = seat_players(dispatcher_obj, state)
  local rules = require("uno_rules")
  local starter_id = state.game.players[state.game.turn].id
  local legal = rules.legal_moves(state.game, starter_id).cards
  local out_of_turn_id = starter_id == "u1" and "u2" or "u1"

  MATCH.match_loop({}, dispatcher_obj, 8, state, {
    {
      op_code = OP.PLAY_REQUEST,
      sender = presence(out_of_turn_id, out_of_turn_id == "u1" and "Alice" or "Bob"),
      data = json_encode({ cardId = legal[1] }),
    },
  })
  local error_seen = false
  for _, message in ipairs(dispatcher_obj.messages) do
    if message.op == OP.ERROR then
      local payload = require("json").decode(message.data)
      error_seen = payload.code == protocol.ERROR.NOT_YOUR_TURN
    end
  end
  assert_equal(error_seen, true, "out-of-turn sender gets an error")

  MATCH.match_loop({}, dispatcher_obj, 9, state, {
    {
      op_code = OP.PING,
      sender = presence("u1", "Alice"),
      data = json_encode({ clientTime = 12345 }),
    },
  })
  local pong_seen = false
  for _, message in ipairs(dispatcher_obj.messages) do
    if message.op == OP.PONG then
      local payload = require("json").decode(message.data)
      pong_seen = payload.clientTime == 12345
    end
  end
  assert_equal(pong_seen, true, "sender gets a pong")

  MATCH.match_loop({}, dispatcher_obj, 10, state, {
    {
      op_code = OP.CHAT_SEND,
      sender = presence("u1", "Alice"),
      data = json_encode({ text = "  hello   table  " }),
    },
  })
  local chat_seen = false
  for _, message in ipairs(dispatcher_obj.messages) do
    if message.op == OP.CHAT then
      local payload = require("json").decode(message.data)
      chat_seen = payload.text == "hello table"
        and payload.userId == "u1"
        and payload.username == "Alice"
    end
  end
  assert_equal(chat_seen, true, "sender chat normalized and attributed")
end)

test("propagates sevenO from match params into the game and state payload", function()
  local state = MATCH.match_init({ match_id = "m1" }, {
    seats = 2,
    seed = 123456789,
    rulesMode = "sevenO",
  })
  local dispatcher_obj = dispatcher()
  state = seat_players(dispatcher_obj, state)
  assert_equal(state.rules_mode, "sevenO", "stored rules mode")
  assert_equal(state.game.mode, "sevenO", "game rules mode")
  local started = nil
  for _, message in ipairs(dispatcher_obj.messages) do
    if message.op == OP.MATCH_STARTED then
      started = require("json").decode(message.data)
    end
  end
  assert_equal(started.rulesMode, "sevenO", "match started payload")
  local payload = select(2, MATCH.match_signal({}, dispatcher_obj, 1, state, ""))
  assert_equal(require("json").decode(payload).rulesMode, "sevenO", "state payload")
end)

test("defaults older lobbies to classic and reads the mode alias", function()
  local state = MATCH.match_init({ match_id = "m1" }, { seats = 2, mode = "quick" })
  assert_equal(state.rules_mode, "classic", "default rules mode")
  local dispatcher_obj = dispatcher()
  state = seat_players(dispatcher_obj, state)
  assert_equal(state.game.mode, "classic", "default game mode")
  local aliased = MATCH.match_init({ match_id = "m2" }, { seats = 2, mode = "sevenO" })
  assert_equal(aliased.rules_mode, "sevenO", "mode alias")
end)

test("forwards a seven target id from play requests", function()
  local state = MATCH.match_init({ match_id = "m1" }, {
    seats = 2,
    seed = 123456789,
    rulesMode = "sevenO",
  })
  local dispatcher_obj = dispatcher()
  state = seat_players(dispatcher_obj, state)
  local index = state.game.turn
  local other_index = index == 1 and 2 or 1
  state.game.players[index].hand = {
    { id = "red-7-0", color = "red", kind = "number", value = 7 },
  }
  state.game.current_color = "red"
  local other_size = #state.game.players[other_index].hand
  MATCH.match_loop({}, dispatcher_obj, 3, state, {
    {
      op_code = OP.PLAY_REQUEST,
      presence = presence(state.player_order[index].user_id, "Actor"),
      data = json_encode({ cardId = "red-7-0", targetId = state.player_order[other_index].user_id }),
    },
  })
  local moved = false
  for _, message in ipairs(dispatcher_obj.messages) do
    if message.op == OP.MOVE then
      moved = true
    end
  end
  assert_equal(moved, true, "move broadcast")
  assert_equal(#state.game.players[index].hand, other_size, "actor received target hand")
end)

test("a seven timeout picks a valid target instead of stalling", function()
  local state = MATCH.match_init({ match_id = "m1" }, {
    seats = 2,
    seed = 123456789,
    turnSeconds = 1,
    rulesMode = "sevenO",
  })
  local dispatcher_obj = dispatcher()
  state = seat_players(dispatcher_obj, state)
  local index = state.game.turn
  local other_index = index == 1 and 2 or 1
  state.game.players[index].hand = {
    { id = "red-7-0", color = "red", kind = "number", value = 7 },
  }
  state.game.current_color = "red"
  state.game.drawn_card_id = "red-7-0"
  local other_size = #state.game.players[other_index].hand
  local saved = now
  now = now + 2000
  MATCH.match_loop({}, dispatcher_obj, 6, state, {})
  now = saved
  local moves = 0
  for _, message in ipairs(dispatcher_obj.messages) do
    if message.op == OP.MOVE then
      moves = moves + 1
    end
  end
  assert_equal(moves > 0, true, "timeout played the seven")
  assert_equal(#state.game.players[index].hand, other_size, "hands swapped on timeout")
end)

test("propagates progressive from match params into the game and state payload", function()
  local state = MATCH.match_init({ match_id = "m1" }, {
    seats = 2,
    seed = 123456789,
    rulesMode = "progressive",
  })
  local dispatcher_obj = dispatcher()
  state = seat_players(dispatcher_obj, state)
  assert_equal(state.rules_mode, "progressive", "stored rules mode")
  assert_equal(state.game.mode, "progressive", "game rules mode")
  local started = nil
  for _, message in ipairs(dispatcher_obj.messages) do
    if message.op == OP.MATCH_STARTED then
      started = require("json").decode(message.data)
    end
  end
  assert_equal(started.rulesMode, "progressive", "match started payload")
  local payload = select(2, MATCH.match_signal({}, dispatcher_obj, 1, state, ""))
  local decoded = require("json").decode(payload)
  assert_equal(decoded.rulesMode, "progressive", "state payload mode")
  assert_equal(decoded.pendingStack, nil, "no pending stack at start")
end)

test("exposes the pending stack with camelCase fields in the state payload", function()
  local state = MATCH.match_init({ match_id = "m1" }, {
    seats = 2,
    seed = 123456789,
    rulesMode = "progressive",
  })
  local dispatcher_obj = dispatcher()
  state = seat_players(dispatcher_obj, state)
  state.game.pending_stack = {
    kind = "wild4",
    amount = 8,
    owner_id = "u1",
    target_id = "u2",
    legal = true,
    color = "green",
    pending_winner_id = "u1",
  }
  local payload = select(2, MATCH.match_signal({}, dispatcher_obj, 1, state, ""))
  local stack = require("json").decode(payload).pendingStack
  assert_equal(stack.kind, "wild4", "stack kind")
  assert_equal(stack.amount, 8, "stack amount")
  assert_equal(stack.ownerId, "u1", "owner id")
  assert_equal(stack.targetId, "u2", "target id")
  assert_equal(stack.legal, true, "legal flag")
  assert_equal(stack.color, "green", "chosen colour")
  assert_equal(stack.pendingWinnerId, "u1", "pending winner")
end)

test("propagates jumpIn from match params into the game and state payload", function()
  local state = MATCH.match_init({ match_id = "m1" }, {
    seats = 2,
    seed = 123456789,
    rulesMode = "jumpIn",
  })
  local dispatcher_obj = dispatcher()
  state = seat_players(dispatcher_obj, state)
  assert_equal(state.rules_mode, "jumpIn", "stored rules mode")
  assert_equal(state.game.mode, "jumpIn", "game rules mode")
  local started = nil
  for _, message in ipairs(dispatcher_obj.messages) do
    if message.op == OP.MATCH_STARTED then
      started = require("json").decode(message.data)
    end
  end
  assert_equal(started.rulesMode, "jumpIn", "match started payload")
  local payload = require("json").decode(select(2, MATCH.match_signal({}, dispatcher_obj, 1, state, "")))
  assert_equal(payload.rulesMode, "jumpIn", "state payload mode")
  assert_equal(payload.jumpWindow, nil, "no window at start")
end)

test("forwards jump requests and blocks the window owner", function()
  local state = MATCH.match_init({ match_id = "m1" }, {
    seats = 2,
    seed = 123456789,
    rulesMode = "jumpIn",
  })
  local dispatcher_obj = dispatcher()
  state = seat_players(dispatcher_obj, state)
  state.game.turn = 1
  state.game.current_color = "yellow"
  state.game.players[1].hand = {
    { id = "yellow-7-0", color = "yellow", kind = "number", value = 7 },
    { id = "blue-6-0", color = "blue", kind = "number", value = 6 },
  }
  state.game.players[2].hand = {
    { id = "yellow-7-1", color = "yellow", kind = "number", value = 7 },
    { id = "blue-3-0", color = "blue", kind = "number", value = 3 },
  }

  MATCH.match_loop({}, dispatcher_obj, 1, state, {
    {
      op_code = OP.PLAY_REQUEST,
      presence = presence("u1", "Alice"),
      data = json_encode({ cardId = "yellow-7-0" }),
    },
  })
  assert_equal(state.game.jump_window.owner_id, "u1", "window opened by play")
  assert_equal(state.game.jump_window.card_id, "yellow-7-0", "window card")

  MATCH.match_loop({}, dispatcher_obj, 2, state, {
    {
      op_code = OP.PLAY_REQUEST,
      presence = presence("u1", "Alice"),
      data = json_encode({ cardId = "blue-6-0", jump = true }),
    },
  })
  local owner_error = false
  for _, message in ipairs(dispatcher_obj.messages) do
    if message.op == OP.ERROR then
      owner_error = require("json").decode(message.data).code == protocol.ERROR.JUMP_WINDOW_OPEN
    end
  end
  assert_equal(owner_error, true, "owner refused while window is open")

  local before = #dispatcher_obj.messages
  MATCH.match_loop({}, dispatcher_obj, 3, state, {
    {
      op_code = OP.PLAY_REQUEST,
      presence = presence("u2", "Bob"),
      data = json_encode({ cardId = "yellow-7-1", jump = true }),
    },
  })
  local jumped = false
  for index = before + 1, #dispatcher_obj.messages do
    if dispatcher_obj.messages[index].op == OP.MOVE then
      jumped = require("json").decode(dispatcher_obj.messages[index].data).action.jump == true
    end
  end
  assert_equal(jumped, true, "jump forwarded in move broadcast")
  assert_equal(state.game.jump_window.owner_id, "u2", "new window owner")
  assert_equal(state.game.turn, 1, "turn advanced past jumper")
end)

test("match loop clears an expired jump window", function()
  local state = MATCH.match_init({ match_id = "m1" }, {
    seats = 2,
    seed = 123456789,
    rulesMode = "jumpIn",
  })
  local dispatcher_obj = dispatcher()
  state = seat_players(dispatcher_obj, state)
  state.game.jump_window = {
    card_id = "yellow-7-0",
    owner_id = "u1",
    expires_at = now - 1,
  }
  state.turn_deadline = state.game.jump_window.expires_at
  MATCH.match_loop({}, dispatcher_obj, 4, state, {})
  assert_equal(state.game.jump_window, nil, "expired window cleared")
  local latest = nil
  for _, message in ipairs(dispatcher_obj.messages) do
    if message.op == OP.STATE then
      latest = require("json").decode(message.data)
    end
  end
  assert_equal(latest.jumpWindow, nil, "cleared window published")
end)

if failures > 0 then
  io.stderr:write(failures .. " Uno match test(s) failed\n")
  os.exit(1)
end
print("all Uno match tests passed")
