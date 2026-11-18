-- Tests for the authoritative Ludo match handler with a fake Nakama runtime.

local script_path = arg[0] or "Ludo/server/test/ludo_match_test.lua"
local script_dir = script_path:match("^(.*)[/\\]") or "."
local server_dir = script_dir .. "/.."

package.path = server_dir .. "/?.lua;"
  .. script_dir .. "/../../../shared/server/?.lua;"
  .. script_dir .. "/?.lua;" .. package.path

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
    error((message or "values differ") .. ": expected " .. tostring(expected)
      .. " but got " .. tostring(actual), 2)
  end
end

fake_nk = {
  time = function() return fake_time end,
  json_encode = function(value)
    if type(value) == "string" then return value end
    -- A compact stable encoder is enough for the fake dispatcher.
    local function encode(v)
      if type(v) == "nil" then return "null" end
      if type(v) == "boolean" then return tostring(v) end
      if type(v) == "number" then return tostring(v) end
      if type(v) == "string" then return string.format("%q", v) end
      if type(v) == "table" then
        local parts = {}
        for _, item in ipairs(v) do parts[#parts + 1] = encode(item) end
        if #parts > 0 then return "[" .. table.concat(parts, ",") .. "]" end
        for key, item in pairs(v) do
          parts[#parts + 1] = string.format("%q:%s", tostring(key), encode(item))
        end
        return "{" .. table.concat(parts, ",") .. "}"
      end
      return "null"
    end
    return encode(value)
  end,
  json_decode = function(value)
    if type(value) == "table" then return value end
    if value == "{}" then return {} end
    error("fake json_decode only accepts tables or '{}'")
  end,
  logger_warn = function() end,
  logger_info = function() end,
  logger_error = function() end,
  storage_read = function() return {} end,
  storage_write = function() return {} end,
  storage_list = function() return {} end,
  leaderboard_create = function() return {} end,
  leaderboard_record_write = function() return {} end,
}

local match = assert(dofile(server_dir .. "/ludo_match.lua"))
local OP = require("ludo_protocol").OP
local rules = require("ludo_rules")

local function presence(user_id, username)
  return { user_id = user_id, username = username or user_id, session_id = "session-" .. user_id }
end

local function dispatcher()
  local d = { messages = {} }
  d.broadcast_message = function(op_code, payload)
    d.messages[#d.messages + 1] = { op_code = op_code, payload = payload }
  end
  d.match_kick = function() end
  d.match_label_update = function(label) d.label = label end
  return d
end

local function last(d, op_code)
  for i = #d.messages, 1, -1 do
    if d.messages[i].op_code == op_code then return d.messages[i] end
  end
  return nil
end

local function message(sender, op_code, payload)
  return { sender = sender, op_code = op_code, data = payload or {} }
end

local function seated_two()
  local state, tick, label = match.match_init({ match_id = "m1" }, {
    mode = "quick", seats = 2, seed = 2024,
  })
  assert_equal(tick, 10, "tick rate")
  assert_equal(label, "ludo|quick|2|open", "label")
  local d = dispatcher()
  match.match_join_attempt({}, d, 1, state, presence("a"), {})
  match.match_join_attempt({}, d, 1, state, presence("b"), {})
  match.match_join({}, d, 1, state, { presence("a"), presence("b") })
  return state, d
end

test("assigns red and green to the first two seats", function()
  local state = seated_two()
  assert_equal(state.players["a"].colour, "red", "first colour")
  assert_equal(state.players["b"].colour, "green", "second colour")
  assert_equal(state.game.playerCount, 2, "game seats")
  assert_equal(state.game.seed, 2024, "dice seed")
end)

test("keeps spectators out of the player order", function()
  local state, d = seated_two()
  match.match_join_attempt({}, d, 2, state, presence("watcher"), { spectate = true })
  match.match_join({}, d, 2, state, { presence("watcher") })
  assert_equal(#state.player_order, 2, "player seats")
  assert_equal(#state.spectator_order, 1, "gallery")
  assert_equal(last(d, OP.SPECTATOR_JOINED) ~= nil, true, "gallery notice")
end)

test("rejects a roll from a player whose turn it is not", function()
  local state, d = seated_two()
  match.match_loop({}, d, 2, state, { message(presence("b"), OP.ROLL_REQUEST) })
  assert_equal(last(d, OP.ERROR) ~= nil, true, "error sent")
  assert_equal(state.game.phase, "roll", "no roll happened")
end)

test("rolls and moves through the authoritative rules", function()
  local state, d = seated_two()
  match.match_loop({}, d, 2, state, { message(presence("a"), OP.ROLL_REQUEST) })
  local roll = last(d, OP.ROLL)
  assert_equal(roll == nil, false, "roll broadcast")
  local value = state.game.dice
  local moves = rules.legal_moves(state.game)
  if #moves == 0 then
    assert_equal(state.game.current, 1, "no-move passed the turn")
    return
  end
  match.match_loop({}, d, 3, state, {
    message(presence("a"), OP.MOVE_REQUEST, { token = moves[1].token }),
  })
  assert_equal(last(d, OP.MOVE) ~= nil, true, "move broadcast")
  assert_equal(#state.replay_steps, 1, "replay step recorded")
  assert_equal(state.replay_steps[1].roll, value, "recorded roll")
end)

test("chat keeps player and spectator messages in one feed", function()
  local state, d = seated_two()
  match.match_join_attempt({}, d, 2, state, presence("watcher"), { spectate = true })
  match.match_join({}, d, 2, state, { presence("watcher") })
  match.match_loop({}, d, 3, state, {
    message(presence("a"), OP.CHAT_SEND, { text = "hello" }),
    message(presence("watcher"), OP.CHAT_SEND, { text = "watching" }),
  })
  assert_equal(#state.chat, 2, "two messages")
  assert_equal(state.chat[1].text, "hello", "first message")
  assert_equal(last(d, OP.CHAT) ~= nil, true, "chat broadcast")
end)

test("a resignation ends the match once", function()
  local state, d = seated_two()
  match.match_loop({}, d, 2, state, { message(presence("a"), OP.RESIGN) })
  assert_equal(state.result.status, "resign", "result")
  assert_equal(state.result.winnerColour, "green", "winner")
  local count = #d.messages
  match.match_loop({}, d, 3, state, { message(presence("a"), OP.RESIGN) })
  assert_equal(#d.messages, count, "no second result")
end)

if failures > 0 then
  io.stderr:write(failures .. " Ludo match test(s) failed\n")
  os.exit(1)
end
print("all Ludo match tests passed")
