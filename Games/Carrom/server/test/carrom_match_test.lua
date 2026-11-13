-- Tests for the authoritative Carrom match handler using a fake Nakama
-- runtime. This exercises the seat assignment, the turn order, the shot
-- validation, the spectator gallery, and the chat rules.

local script_path = arg[0] or "Carrom/server/test/carrom_match_test.lua"
local script_dir = script_path:match("^(.*)[/\\]") or "."
local server_dir = script_dir .. "/.."

package.path = server_dir .. "/?.lua;" .. package.path

local fake_time = 1700000000000
local fake_nk

package.preload["nakama"] = function()
  return fake_nk
end

local failures = 0

local function test(name, fn)
  local ok, err = pcall(fn)
  if ok then
    print("ok - " .. name)
  else
    failures = failures + 1
    print("not ok - " .. name .. ": " .. tostring(err))
  end
end

local function assert_equal(actual, expected, message)
  if actual ~= expected then
    error(
      (message or "values differ")
        .. ": expected "
        .. tostring(expected)
        .. " but got "
        .. tostring(actual),
      2
    )
  end
end

fake_nk = {
  time = function()
    return fake_time
  end,
  json_encode = function(value)
    return value
  end,
  json_decode = function(value)
    if type(value) == "table" then
      return value
    end
    if value == "{}" then
      return {}
    end
    error("fake json_decode only accepts tables or '{}'")
  end,
  logger_warn = function() end,
  logger_info = function() end,
  logger_error = function() end,
  match_creates = {},
  match_list_result = {},
  match_get_result = nil,
  next_match_id = "carrom-match",
  rpcs = {},
  matchmaker_matched = nil,
}

function fake_nk.match_create(name, properties)
  fake_nk.match_creates[#fake_nk.match_creates + 1] = {
    name = name,
    properties = properties,
  }
  return fake_nk.next_match_id
end

function fake_nk.match_list(count, include_open, label)
  local result = {}
  for _, match in ipairs(fake_nk.match_list_result) do
    if match.label == label then
      result[#result + 1] = match
    end
  end
  return result
end

function fake_nk.match_get(match_id)
  if fake_nk.match_get_result then
    return fake_nk.match_get_result
  end
  error("match not found")
end

function fake_nk.register_rpc(fn, name)
  fake_nk.rpcs[name] = fn
end

function fake_nk.register_matchmaker_matched(fn)
  fake_nk.matchmaker_matched = fn
end

local match = assert(dofile(server_dir .. "/carrom_match.lua"))
local protocol = require("carrom_protocol")
local rules = require("carrom_rules")

local function presence(user_id, username, session_id)
  return {
    user_id = user_id,
    username = username,
    session_id = session_id or ("session-" .. user_id),
  }
end

local function new_dispatcher()
  local messages = {}
  local kicked = {}
  local dispatcher = {}
  dispatcher.messages = messages
  dispatcher.kicked = kicked
  dispatcher.broadcast_message = function(op_code, payload, presences, sender)
    messages[#messages + 1] = {
      op_code = op_code,
      payload = payload,
      presences = presences,
      sender = sender,
    }
  end
  dispatcher.match_kick = function(request)
    kicked[#kicked + 1] = request
  end
  return dispatcher
end

local function last_message(dispatcher, op_code)
  for index = #dispatcher.messages, 1, -1 do
    if dispatcher.messages[index].op_code == op_code then
      return dispatcher.messages[index]
    end
  end
  return nil
end

local function count_messages(dispatcher, op_code)
  local total = 0
  for _, message in ipairs(dispatcher.messages) do
    if message.op_code == op_code then
      total = total + 1
    end
  end
  return total
end

test("initialises a table with a label", function()
  local state, tick, label = match.match_init({ match_id = "m1" }, {
    mode = "quick",
    seats = 4,
  })
  assert_equal(state.seats, 4, "seats")
  assert_equal(tick, 10, "tick rate")
  assert_equal(label, "carrom|quick|4|open", "label")
end)

test("starts the table when every seat is taken", function()
  local dispatcher = new_dispatcher()
  local state = match.match_init({ match_id = "m1" }, {
    mode = "quick",
    seats = 2,
  })

  local first = presence("u1", "Ivory")
  local second = presence("u2", "Onyx")
  state = match.match_join({ match_id = "m1" }, dispatcher, 0, state, { first })
  assert_equal(state.game, nil, "the game waits for the table to fill")

  state = match.match_join({ match_id = "m1" }, dispatcher, 0, state, { second })
  assert_equal(state.game ~= nil, true, "the game started")
  assert_equal(#state.game.discs, 19, "two player piece count")
  assert_equal(state.game.turn, "white", "the first player shoots first")
  assert_equal(state.player_order[1], "u1", "first seat")
  assert_equal(state.player_order[2], "u2", "second seat")
  assert_equal(state.players["u1"].colour, "white", "first colour")
  assert_equal(state.players["u2"].colour, "black", "second colour")
end)

test("opens a four player table with four seats", function()
  local dispatcher = new_dispatcher()
  local state = match.match_init({ match_id = "m1" }, {
    mode = "quick",
    seats = 4,
  })
  for index = 1, 4 do
    state = match.match_join(
      { match_id = "m1" },
      dispatcher,
      0,
      state,
      { presence("u" .. index, "Player " .. index) }
    )
  end
  assert_equal(#state.game.discs, 37, "four player piece count")
  assert_equal(state.players["u1"].colour, "white", "seat one")
  assert_equal(state.players["u2"].colour, "yellow", "seat two")
  assert_equal(state.players["u3"].colour, "black", "seat three")
  assert_equal(state.players["u4"].colour, "green", "seat four")
end)

test("keeps the first colour for the player who created the room", function()
  local dispatcher = new_dispatcher()
  local state = match.match_init({ match_id = "m1" }, {
    mode = "private",
    seats = 2,
    expected_users = {
      { user_id = "u2", username = "Creator" },
    },
  })
  -- The opponent arrives first and must not take the reserved colour.
  state = match.match_join(
    { match_id = "m1" },
    dispatcher,
    0,
    state,
    { presence("u1", "Opponent") }
  )
  state = match.match_join(
    { match_id = "m1" },
    dispatcher,
    0,
    state,
    { presence("u2", "Creator") }
  )
  assert_equal(state.players["u2"].colour, "white", "the creator keeps white")
  assert_equal(state.players["u1"].colour, "black", "the opponent takes black")
end)

test("rejects a player who joins a full table", function()
  local dispatcher = new_dispatcher()
  local state = match.match_init({ match_id = "m1" }, {
    mode = "quick",
    seats = 2,
  })
  state = match.match_join(
    { match_id = "m1" },
    dispatcher,
    0,
    state,
    { presence("u1", "Ivory") }
  )
  state = match.match_join(
    { match_id = "m1" },
    dispatcher,
    0,
    state,
    { presence("u2", "Onyx") }
  )

  local _, allowed, message = match.match_join_attempt(
    { match_id = "m1" },
    dispatcher,
    0,
    state,
    presence("u3", "Extra"),
    {}
  )
  assert_equal(allowed, false, "the third player is rejected")
  assert_equal(message, "This table is full", "the reason")
end)

test("accepts a valid shot and passes the turn", function()
  local dispatcher = new_dispatcher()
  local state = match.match_init({ match_id = "m1" }, {
    mode = "quick",
    seats = 2,
  })
  state = match.match_join(
    { match_id = "m1" },
    dispatcher,
    0,
    state,
    { presence("u1", "Ivory") }
  )
  state = match.match_join(
    { match_id = "m1" },
    dispatcher,
    0,
    state,
    { presence("u2", "Onyx") }
  )

  local before = count_messages(dispatcher, protocol.OP.STATE)
  state = match.match_loop(
    { match_id = "m1" },
    dispatcher,
    1,
    state,
    {
      {
        op_code = protocol.OP.SHOT_REQUEST,
        sender = presence("u1", "Ivory"),
        data = { position = 0.5, angle = -math.pi / 2, power = 0.8 },
      },
    }
  )

  assert_equal(count_messages(dispatcher, protocol.OP.STATE) > before, true, "the state was sent")
  assert_equal(state.game.shotNumber, 1, "the shot was counted")
  assert_equal(state.game.turn, "black", "the turn passed")
end)

test("rejects a shot from the wrong player", function()
  local dispatcher = new_dispatcher()
  local state = match.match_init({ match_id = "m1" }, {
    mode = "quick",
    seats = 2,
  })
  state = match.match_join(
    { match_id = "m1" },
    dispatcher,
    0,
    state,
    { presence("u1", "Ivory") }
  )
  state = match.match_join(
    { match_id = "m1" },
    dispatcher,
    0,
    state,
    { presence("u2", "Onyx") }
  )

  state = match.match_loop(
    { match_id = "m1" },
    dispatcher,
    1,
    state,
    {
      {
        op_code = protocol.OP.SHOT_REQUEST,
        sender = presence("u2", "Onyx"),
        data = { position = 0.5, angle = -math.pi / 2, power = 0.8 },
      },
    }
  )

  local error_message = last_message(dispatcher, protocol.OP.ERROR)
  assert_equal(error_message ~= nil, true, "an error was sent")
  assert_equal(error_message.payload.message, "It is not your turn", "the reason")
  assert_equal(state.game.shotNumber, 0, "the shot was not counted")
end)

test("rejects a shot with an invalid striker position", function()
  local dispatcher = new_dispatcher()
  local state = match.match_init({ match_id = "m1" }, {
    mode = "quick",
    seats = 2,
  })
  state = match.match_join(
    { match_id = "m1" },
    dispatcher,
    0,
    state,
    { presence("u1", "Ivory") }
  )
  state = match.match_join(
    { match_id = "m1" },
    dispatcher,
    0,
    state,
    { presence("u2", "Onyx") }
  )

  state = match.match_loop(
    { match_id = "m1" },
    dispatcher,
    1,
    state,
    {
      {
        op_code = protocol.OP.SHOT_REQUEST,
        sender = presence("u1", "Ivory"),
        data = { position = 0.05, angle = -math.pi / 2, power = 0.8 },
      },
    }
  )

  local error_message = last_message(dispatcher, protocol.OP.ERROR)
  assert_equal(error_message.payload.message, "Place the striker inside the baseline", "the reason")
  assert_equal(state.game.shotNumber, 0, "the shot was not counted")
end)

test("seats a spectator and keeps them out of the game", function()
  local dispatcher = new_dispatcher()
  local state = match.match_init({ match_id = "m1" }, {
    mode = "quick",
    seats = 2,
  })
  state = match.match_join(
    { match_id = "m1" },
    dispatcher,
    0,
    state,
    { presence("u1", "Ivory") }
  )

  local watcher = presence("u9", "Watcher")
  local _, allowed = match.match_join_attempt(
    { match_id = "m1" },
    dispatcher,
    0,
    state,
    watcher,
    { spectate = true }
  )
  assert_equal(allowed, true, "the spectator is allowed")

  state = match.match_join({ match_id = "m1" }, dispatcher, 0, state, { watcher })
  assert_equal(state.spectators["u9"] ~= nil, true, "the spectator is tracked")
  assert_equal(state.players["u9"], nil, "the spectator has no seat")
end)

test("keeps the chat in the match and rate limits it", function()
  local dispatcher = new_dispatcher()
  local state = match.match_init({ match_id = "m1" }, {
    mode = "quick",
    seats = 2,
  })
  state = match.match_join(
    { match_id = "m1" },
    dispatcher,
    0,
    state,
    { presence("u1", "Ivory") }
  )

  state = match.match_loop(
    { match_id = "m1" },
    dispatcher,
    1,
    state,
    {
      {
        op_code = protocol.OP.CHAT_SEND,
        sender = presence("u1", "Ivory"),
        data = { text = "good luck" },
      },
    }
  )
  assert_equal(#state.chat, 1, "the message was stored")
  assert_equal(state.chat[1].text, "good luck", "the message text")

  state = match.match_loop(
    { match_id = "m1" },
    dispatcher,
    2,
    state,
    {
      {
        op_code = protocol.OP.CHAT_SEND,
        sender = presence("u1", "Ivory"),
        data = { text = "again" },
      },
    }
  )
  assert_equal(#state.chat, 1, "the second message was rejected")
  local error_message = last_message(dispatcher, protocol.OP.ERROR)
  assert_equal(error_message.payload.message, "You are sending messages too quickly", "the reason")
end)

test("shares the same rules module as the client core", function()
  local state = rules.create_initial_state({ "white", "black" })
  assert_equal(state.turn, "white", "the first player shoots first")
  assert_equal(#state.discs, 19, "the piece count")
end)

if failures > 0 then
  print(failures .. " carrom match test(s) failed")
  os.exit(1)
end

print("carrom match ok")
