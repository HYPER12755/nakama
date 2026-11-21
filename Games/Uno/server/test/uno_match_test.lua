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
local OP = require("uno_protocol").OP

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
end)

test("starts a hand when both seats are taken", function()
  local state = new_match()
  local dispatcher_obj = dispatcher()
  state = seat_players(dispatcher_obj, state)
  assert_equal(#state.player_order, 2, "two seats")
  assert_equal(state.game ~= nil, true, "game started")
  assert_equal(#state.game.players[1].hand, 7, "seven cards")
  assert_equal(dispatcher_obj.label(), "uno|quick|2|closed", "label closed")
end)

test("accepts a legal play and broadcasts state", function()
  local state = new_match()
  local dispatcher_obj = dispatcher()
  state = seat_players(dispatcher_obj, state)
  local rules = require("uno_rules")
  local legal = rules.legal_moves(state.game, "u1").cards
  assert_equal(#legal > 0, true, "a legal card exists")
  MATCH.match_loop({}, dispatcher_obj, 3, state, {
    {
      op_code = OP.PLAY_REQUEST,
      presence = presence("u1", "Alice"),
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
  assert_equal(#state.game.players[1].hand, 7, "board unchanged")
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

if failures > 0 then
  io.stderr:write(failures .. " Uno match test(s) failed\n")
  os.exit(1)
end
print("all Uno match tests passed")
