-- Tests for the Nakama match handler and RPCs using a fake Nakama runtime.
--
-- This does not replace an integration test against a running Nakama server,
-- but it exercises the full match lifecycle and protocol logic quickly.

local script_path = arg[0] or "Chess/server/test/chess_match_test.lua"
local script_dir = script_path:match("^(.*)[/\\]") or "."
local server_dir = script_dir .. "/.."

package.path = server_dir .. "/?.lua;" .. package.path

local fake_time = 1700000000000
local fake_nk

local function set_time(value)
  fake_time = value
end

local function advance(ms)
  fake_time = fake_time + ms
end

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

local function storage_key(user_id, collection, key)
  return table.concat({ user_id, collection, key }, "|")
end

local function storage_record(user_id, collection, key)
  return fake_nk.storage_records[storage_key(user_id, collection, key)]
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
  match_list_result = {},
  match_creates = {},
  next_match_id = "created-match",
  rpcs = {},
  matchmaker_matched = nil,
  storage_records = {},
  leaderboards = {},
  set_time = set_time,
  storage_read = function(objects)
    local result = {}
    for _, object in ipairs(objects) do
      local record = storage_record(object.user_id, object.collection, object.key)
      if record then
        result[#result + 1] = {
          collection = object.collection,
          key = object.key,
          user_id = object.user_id,
          version = record.version,
          value = copy(record.value),
        }
      end
    end
    return result
  end,
  storage_write = function(writes)
    for _, write in ipairs(writes) do
      local key = storage_key(write.user_id, write.collection, write.key)
      local current = fake_nk.storage_records[key]
      if write.version and (not current or current.version ~= write.version) then
        error("storage version conflict")
      end
      fake_nk.storage_records[key] = {
        collection = write.collection,
        key = write.key,
        user_id = write.user_id,
        version = tostring((tonumber(current and current.version) or 0) + 1),
        value = copy(write.value),
      }
    end
    return {}
  end,
  storage_list = function(user_id, collection, limit)
    local result = {}
    for _, record in pairs(fake_nk.storage_records) do
      if record.user_id == user_id and record.collection == collection then
        result[#result + 1] = copy(record)
      end
    end
    table.sort(result, function(left, right)
      return left.key < right.key
    end)
    local limited = {}
    for index = 1, math.min(limit, #result) do
      limited[index] = result[index]
    end
    return limited
  end,
  leaderboard_create = function(id)
    if not fake_nk.leaderboards[id] then
      fake_nk.leaderboards[id] = { records = {} }
    end
  end,
  leaderboard_record_write = function(id, owner_id, username, score, subscore, metadata)
    local leaderboard = fake_nk.leaderboards[id]
    if not leaderboard then
      error("leaderboard does not exist")
    end
    leaderboard.records[owner_id] = {
      owner_id = owner_id,
      username = username,
      score = score,
      subscore = subscore,
      metadata = copy(metadata),
    }
    return leaderboard.records[owner_id]
  end,
  leaderboard_records_list = function(id, owner_ids, limit)
    local leaderboard = fake_nk.leaderboards[id]
    if not leaderboard then
      return {}, {}, nil, nil, 0
    end

    local records = {}
    for _, record in pairs(leaderboard.records) do
      records[#records + 1] = copy(record)
    end
    table.sort(records, function(left, right)
      if left.score ~= right.score then
        return left.score > right.score
      end
      return left.owner_id < right.owner_id
    end)
    for index, record in ipairs(records) do
      record.rank = index
    end

    if owner_ids then
      local owners = {}
      for _, owner_id in ipairs(owner_ids) do
        for _, record in ipairs(records) do
          if record.owner_id == owner_id then
            owners[#owners + 1] = record
          end
        end
      end
      return {}, owners, nil, nil, #records
    end

    local top = {}
    for index = 1, math.min(limit, #records) do
      top[index] = records[index]
    end
    return top, {}, nil, nil, #records
  end,
  match_list = function(limit, authoritative, label, min_size, max_size)
    return fake_nk.match_list_result
  end,
  match_create = function(module, params)
    fake_nk.match_creates[#fake_nk.match_creates + 1] = {
      module = module,
      params = params,
    }
    return fake_nk.next_match_id
  end,
  register_rpc = function(fn, id)
    fake_nk.rpcs[id] = fn
  end,
  register_matchmaker_matched = function(fn)
    fake_nk.matchmaker_matched = fn
  end,
}

package.preload["nakama"] = function()
  return fake_nk
end

local rules = require("chess_rules")
local protocol = require("chess_protocol")
local match = assert(dofile(server_dir .. "/chess_match.lua"))
dofile(server_dir .. "/chess_rpc.lua")

local OP = protocol.OP
local BASE_TIME = 1700000000000
local context = {
  match_id = "match-1",
  match_node = "local",
  env = {},
}

local tests_run = 0
local tests_passed = 0
local tests_failed = 0

local function test(name, callback)
  tests_run = tests_run + 1
  local ok, err = xpcall(callback, debug.traceback)
  if ok then
    tests_passed = tests_passed + 1
    print("[ok] " .. name)
  else
    tests_failed = tests_failed + 1
    print("[FAIL] " .. name)
    print(err)
  end
end

local function assert_equal(actual, expected, message)
  if actual ~= expected then
    error(
      (message or "assert_equal")
        .. ": expected "
        .. tostring(expected)
        .. ", got "
        .. tostring(actual),
      2
    )
  end
end

local function assert_truthy(value, message)
  if not value then
    error(message or "expected a truthy value", 2)
  end
end

local function assert_nil(value, message)
  if value ~= nil then
    error((message or "expected nil") .. ", got " .. tostring(value), 2)
  end
end

local function new_dispatcher()
  local dispatcher = {
    messages = {},
    label = nil,
    kicks = {},
  }

  dispatcher.broadcast_message = function(op_code, data, presences, sender)
    dispatcher.messages[#dispatcher.messages + 1] = {
      op = op_code,
      data = data,
      presences = presences,
      sender = sender,
    }
  end

  dispatcher.match_label_update = function(label)
    dispatcher.label = label
  end

  dispatcher.match_kick = function(presences)
    dispatcher.kicks[#dispatcher.kicks + 1] = presences
  end

  return dispatcher
end

local function new_match(params)
  set_time(BASE_TIME)
  for key in pairs(fake_nk.storage_records) do
    fake_nk.storage_records[key] = nil
  end
  for key in pairs(fake_nk.leaderboards) do
    fake_nk.leaderboards[key] = nil
  end
  local state, tick_rate, label = match.match_init(context, params or {
    mode = "quick",
  })
  assert_truthy(state)
  assert_equal(tick_rate, 10)
  local dispatcher = new_dispatcher()
  dispatcher.label = label
  return state, dispatcher, label
end

local function presence(user_id, username)
  return {
    user_id = user_id,
    username = username,
    session_id = "session-" .. user_id,
    node = "local",
  }
end

local function join(state, dispatcher, user_id, username)
  local player = presence(user_id, username)
  local allowed
  state, allowed = match.match_join_attempt(
    context,
    dispatcher,
    0,
    state,
    player,
    nil
  )
  assert_truthy(allowed, "join attempt should be allowed")
  state = match.match_join(context, dispatcher, 0, state, { player })
  return state
end

local function join_as_spectator(state, dispatcher, user_id, username)
  local spectator = presence(user_id, username)
  local allowed
  state, allowed = match.match_join_attempt(
    context,
    dispatcher,
    0,
    state,
    spectator,
    { spectate = "1" }
  )
  assert_truthy(allowed, "spectator join attempt should be allowed")
  state = match.match_join(context, dispatcher, 0, state, { spectator })
  return state
end

local function messages(dispatcher, op_code)
  local result = {}
  for _, message in ipairs(dispatcher.messages) do
    if message.op == op_code then
      result[#result + 1] = message
    end
  end
  return result
end

local function last_message(dispatcher, op_code)
  local matching = messages(dispatcher, op_code)
  return matching[#matching]
end

local function loop(state, dispatcher, messages_in, tick)
  return match.match_loop(
    context,
    dispatcher,
    tick or 1,
    state,
    messages_in or {}
  )
end

test("match starts with one player waiting", function()
  local state, dispatcher, label = new_match({ mode = "quick" })
  assert_equal(label, "chess|quick|300000|0|open")
  assert_equal(state.mode, "quick")
  assert_equal(state.started_at, nil)
  assert_equal(#state.player_order, 0)

  state = join(state, dispatcher, "u1", "Alice")
  assert_equal(#state.player_order, 1)
  assert_equal(state.players.u1.color, "w")
  assert_equal(state.started_at, nil)
  assert_equal(dispatcher.label, "chess|quick|300000|0|open")

  local state_message = last_message(dispatcher, OP.STATE)
  assert_truthy(state_message)
  assert_equal(#state_message.data.players, 1)
  assert_equal(state_message.data.players[1].username, "Alice")
end)

test("second player starts the match and seats are assigned", function()
  local state, dispatcher = new_match({ mode = "quick" })
  state = join(state, dispatcher, "u1", "Alice")
  state = join(state, dispatcher, "u2", "Bob")

  assert_truthy(state.started_at)
  assert_equal(state.players.u1.color, "w")
  assert_equal(state.players.u2.color, "b")
  assert_equal(dispatcher.label, "chess|quick|300000|0|full")

  local state_message = last_message(dispatcher, OP.STATE)
  assert_equal(#state_message.data.players, 2)
  assert_truthy(state_message.data.match.started)
  assert_truthy(state_message.data.clock.runningSince)

  local started_message = last_message(dispatcher, OP.MATCH_STARTED)
  assert_truthy(started_message)
  assert_equal(started_message.data.state.turn, "w")
end)

test("white can move and clocks update", function()
  local state, dispatcher = new_match()
  state = join(state, dispatcher, "u1", "Alice")
  state = join(state, dispatcher, "u2", "Bob")
  advance(1000)

  state = loop(state, dispatcher, {
    {
      sender = presence("u1", "Alice"),
      op_code = OP.MOVE_REQUEST,
      data = { from = "e2", to = "e4" },
    },
  })

  assert_equal(state.game.turn, "b")
  assert_equal(#state.game:history_san(), 1)
  assert_equal(state.game:history_san()[1], "e4")
  assert_equal(state.clock.w, 299000)
  assert_equal(state.clock.running_since, fake_time)

  local move_message = last_message(dispatcher, OP.MOVE)
  assert_truthy(move_message)
  assert_equal(move_message.data.move.san, "e4")
  assert_equal(move_message.data.state.turn, "b")
  assert_equal(move_message.data.clock.whiteMs, 299000)
end)

test("illegal move and wrong turn are rejected", function()
  local state, dispatcher = new_match()
  state = join(state, dispatcher, "u1", "Alice")
  state = join(state, dispatcher, "u2", "Bob")

  state = loop(state, dispatcher, {
    {
      sender = presence("u1", "Alice"),
      op_code = OP.MOVE_REQUEST,
      data = { from = "e2", to = "e5" },
    },
  })

  assert_equal(#state.game:history_san(), 0)
  assert_truthy(last_message(dispatcher, OP.ERROR))

  state = loop(state, dispatcher, {
    {
      sender = presence("u2", "Bob"),
      op_code = OP.MOVE_REQUEST,
      data = { from = "e7", to = "e5" },
    },
  })

  assert_equal(#state.game:history_san(), 0)
  assert_truthy(last_message(dispatcher, OP.ERROR))
end)

test("resign awards the game to the opponent", function()
  local state, dispatcher = new_match()
  state = join(state, dispatcher, "u1", "Alice")
  state = join(state, dispatcher, "u2", "Bob")

  state = loop(state, dispatcher, {
    {
      sender = presence("u1", "Alice"),
      op_code = OP.RESIGN,
      data = {},
    },
  })

  assert_truthy(state.result)
  assert_equal(state.result.status, "resign")
  assert_equal(state.result.winnerColor, "b")
  assert_equal(state.result.winnerUserId, "u2")
  assert_equal(state.clock.running_since, nil)

  local game_over = last_message(dispatcher, OP.GAME_OVER)
  assert_truthy(game_over)
  assert_equal(game_over.data.result.status, "resign")
end)

test("finished rated match persists profiles, history, and leaderboard", function()
  local state, dispatcher = new_match({
    mode = "quick",
    rated = true,
  })
  state = join(state, dispatcher, "u1", "Alice")
  state = join(state, dispatcher, "u2", "Bob")

  state = loop(state, dispatcher, {
    {
      sender = presence("u1", "Alice"),
      op_code = OP.RESIGN,
      data = {},
    },
  })

  assert_equal(state.result.status, "resign")

  local alice = storage_record("u1", "chess_profile", "profile")
  local bob = storage_record("u2", "chess_profile", "profile")
  assert_truthy(alice)
  assert_truthy(bob)
  assert_equal(alice.value.rating, 1184)
  assert_equal(alice.value.losses, 1)
  assert_equal(alice.value.ratedGames, 1)
  assert_equal(bob.value.rating, 1216)
  assert_equal(bob.value.wins, 1)

  local history = storage_record("u1", "chess_history", "match-1")
  assert_truthy(history)
  assert_equal(history.value.matchId, "match-1")
  assert_equal(history.value.outcome, "loss")
  assert_equal(history.value.opponent.username, "Bob")

  local leaderboard = fake_nk.leaderboards["chess_rating"]
  assert_truthy(leaderboard)
  assert_equal(leaderboard.records.u1.score, 1184)
  assert_equal(leaderboard.records.u2.score, 1216)

  local profile_response = fake_nk.rpcs["chess_get_profile"]({
    user_id = "u1",
    username = "Alice",
  }, "{}")
  assert_equal(profile_response.ok, true)
  assert_equal(profile_response.profile.rating, 1184)
  assert_equal(#profile_response.history, 1)

  local leaderboard_response = fake_nk.rpcs["chess_get_leaderboard"]({
    user_id = "u1",
  }, "{}")
  assert_equal(leaderboard_response.ok, true)
  assert_equal(#leaderboard_response.entries, 2)
  assert_equal(leaderboard_response.me.rating, 1184)
end)

test("draw offer can be accepted", function()
  local state, dispatcher = new_match()
  state = join(state, dispatcher, "u1", "Alice")
  state = join(state, dispatcher, "u2", "Bob")

  state = loop(state, dispatcher, {
    {
      sender = presence("u1", "Alice"),
      op_code = OP.DRAW_OFFER_REQUEST,
      data = {},
    },
  })

  assert_truthy(state.draw_offer)
  assert_equal(state.draw_offer.by, "w")
  assert_truthy(last_message(dispatcher, OP.DRAW_OFFER))

  state = loop(state, dispatcher, {
    {
      sender = presence("u2", "Bob"),
      op_code = OP.DRAW_ACCEPT,
      data = {},
    },
  })

  assert_truthy(state.result)
  assert_equal(state.result.status, "draw")
  assert_equal(state.result.reason, "agreement")
  assert_equal(state.result.winnerColor, nil)
end)

test("draw offer can be declined", function()
  local state, dispatcher = new_match()
  state = join(state, dispatcher, "u1", "Alice")
  state = join(state, dispatcher, "u2", "Bob")

  state = loop(state, dispatcher, {
    {
      sender = presence("u1", "Alice"),
      op_code = OP.DRAW_OFFER_REQUEST,
      data = {},
    },
  })
  state = loop(state, dispatcher, {
    {
      sender = presence("u2", "Bob"),
      op_code = OP.DRAW_DECLINE,
      data = {},
    },
  })

  assert_nil(state.draw_offer)
  assert_nil(state.result)
  assert_truthy(last_message(dispatcher, OP.DRAW_DECLINED))
end)

test("timeout ends the game", function()
  local state, dispatcher = new_match()
  state = join(state, dispatcher, "u1", "Alice")
  state = join(state, dispatcher, "u2", "Bob")

  advance(300001)
  state = loop(state, dispatcher, {})

  assert_truthy(state.result)
  assert_equal(state.result.status, "timeout")
  assert_equal(state.result.winnerColor, "b")
  assert_equal(state.result.reason, "timeout")
end)

test("disconnect grace awards the game", function()
  local state, dispatcher = new_match()
  state = join(state, dispatcher, "u1", "Alice")
  state = join(state, dispatcher, "u2", "Bob")

  state = match.match_leave(context, dispatcher, 1, state, {
    presence("u2", "Bob"),
  })
  assert_equal(state.players.u2.connected, false)
  assert_equal(state.result, nil)

  advance(30001)
  state = loop(state, dispatcher, {})

  assert_truthy(state.result)
  assert_equal(state.result.status, "disconnect")
  assert_equal(state.result.winnerColor, "w")
end)

test("reconnect within grace restores the player", function()
  local state, dispatcher = new_match()
  state = join(state, dispatcher, "u1", "Alice")
  state = join(state, dispatcher, "u2", "Bob")

  state = match.match_leave(context, dispatcher, 1, state, {
    presence("u2", "Bob"),
  })
  advance(10000)
  state = join(state, dispatcher, "u2", "Bob")

  assert_equal(state.players.u2.connected, true)
  assert_equal(state.players.u2.disconnected_at, nil)
  assert_equal(state.result, nil)
end)

test("spectators can watch a full match without taking a seat", function()
  local state, dispatcher = new_match()
  state = join(state, dispatcher, "u1", "Alice")
  state = join(state, dispatcher, "u2", "Bob")
  advance(1000)

  state = join_as_spectator(state, dispatcher, "u3", "Carol")
  assert_truthy(state.spectators.u3)
  assert_equal(#state.spectator_order, 1)
  assert_equal(#state.player_order, 2)
  assert_equal(state.started_at, BASE_TIME)

  local state_message = last_message(dispatcher, OP.STATE)
  assert_truthy(state_message)
  assert_equal(#state_message.data.spectators, 1)
  assert_equal(state_message.data.spectators[1].username, "Carol")
  assert_truthy(last_message(dispatcher, OP.SPECTATOR_JOINED))

  local before = #state.game:history_san()
  state = loop(state, dispatcher, {
    {
      sender = presence("u3", "Carol"),
      op_code = OP.MOVE_REQUEST,
      data = { from = "e2", to = "e4" },
    },
  })
  assert_equal(#state.game:history_san(), before)
  local rejected = last_message(dispatcher, OP.ERROR)
  assert_truthy(rejected)
  assert_equal(rejected.data.message, "You are not a player in this match")

  state = loop(state, dispatcher, {
    {
      sender = presence("u3", "Carol"),
      op_code = OP.REQUEST_STATE,
      data = {},
    },
  })
  local requested = last_message(dispatcher, OP.STATE)
  assert_truthy(requested)
  assert_equal(requested.presences[1].user_id, "u3")

  state = match.match_leave(context, dispatcher, 1, state, {
    presence("u3", "Carol"),
  })
  assert_nil(state.spectators.u3)
  assert_equal(#state.spectator_order, 0)
  assert_truthy(last_message(dispatcher, OP.SPECTATOR_LEFT))
end)

test("spectators can join a finished match during the result linger", function()
  local state, dispatcher = new_match()
  state = join(state, dispatcher, "u1", "Alice")
  state = join(state, dispatcher, "u2", "Bob")
  state = loop(state, dispatcher, {
    {
      sender = presence("u1", "Alice"),
      op_code = OP.RESIGN,
      data = {},
    },
  })
  assert_truthy(state.result)

  state = join_as_spectator(state, dispatcher, "u3", "Carol")
  assert_truthy(state.spectators.u3)
  local state_message = last_message(dispatcher, OP.STATE)
  assert_truthy(state_message.data.result)
end)

test("quick match RPC reuses an open match", function()
  fake_nk.match_list_result = {
    { match_id = "existing-match" },
  }
  fake_nk.match_creates = {}

  local response = fake_nk.rpcs["chess_quick_match"]({
    user_id = "u1",
  }, "{}")

  assert_equal(response.ok, true)
  assert_equal(response.matchId, "existing-match")
  assert_equal(#fake_nk.match_creates, 0)
end)

test("quick match RPC creates a match when none is open", function()
  fake_nk.match_list_result = {}
  fake_nk.match_creates = {}
  fake_nk.next_match_id = "new-quick-match"

  local response = fake_nk.rpcs["chess_quick_match"]({
    user_id = "u1",
  }, {
    timeControl = { initialMs = 600000, incrementMs = 2000 },
  })

  assert_equal(response.ok, true)
  assert_equal(response.matchId, "new-quick-match")
  assert_equal(#fake_nk.match_creates, 1)
  assert_equal(fake_nk.match_creates[1].module, "chess_match")
  assert_equal(fake_nk.match_creates[1].params.mode, "quick")
  assert_equal(fake_nk.match_creates[1].params.rated, true)
  assert_equal(fake_nk.match_creates[1].params.time_control.initial_ms, 600000)
end)

test("private match RPC records the creator", function()
  fake_nk.match_creates = {}
  fake_nk.next_match_id = "private-match"

  local response = fake_nk.rpcs["chess_create_private_match"]({
    user_id = "u1",
  }, {
    timeControl = { initialMs = 300000, incrementMs = 0 },
  })

  assert_equal(response.ok, true)
  assert_equal(response.matchId, "private-match")
  assert_equal(fake_nk.match_creates[1].params.mode, "private")
  assert_equal(fake_nk.match_creates[1].params.creator, "u1")
  assert_nil(fake_nk.match_creates[1].params.rated)
end)

test("invalid RPC time control is rejected", function()
  fake_nk.match_creates = {}
  local response = fake_nk.rpcs["chess_quick_match"]({
    user_id = "u1",
  }, {
    timeControl = { initialMs = 1000 },
  })

  assert_equal(response.ok, false)
  assert_equal(response.error.code, "invalid_time_control")
  assert_equal(#fake_nk.match_creates, 0)
end)

test("matchmaker creates a reserved two-player match", function()
  fake_nk.match_creates = {}
  fake_nk.next_match_id = "matchmaker-match"

  local match_id = fake_nk.matchmaker_matched({}, {
    {
      presence = presence("u1", "Alice"),
      properties = { game = "chess", timeControl = "5+2" },
    },
    {
      presence = presence("u2", "Bob"),
      properties = { game = "chess", timeControl = "5+2" },
    },
  })

  assert_equal(match_id, "matchmaker-match")
  assert_equal(#fake_nk.match_creates, 1)

  local params = fake_nk.match_creates[1].params
  assert_equal(params.mode, "quick")
  assert_equal(params.rated, true)
  assert_equal(#params.expected_users, 2)
  assert_equal(params.expected_users[1].color, "w")
  assert_equal(params.expected_users[2].color, "b")
  assert_equal(params.time_control.initial_ms, 300000)
  assert_equal(params.time_control.increment_ms, 2000)
end)

test("matchmaker rejects mismatched time controls", function()
  fake_nk.match_creates = {}

  local match_id = fake_nk.matchmaker_matched({}, {
    {
      presence = presence("u1", "Alice"),
      properties = { game = "chess", timeControl = "5+0" },
    },
    {
      presence = presence("u2", "Bob"),
      properties = {
        game = "chess",
        timeControlKey = "600000_0",
      },
    },
  })

  assert_nil(match_id)
  assert_equal(#fake_nk.match_creates, 0)
end)

test("private match reserves white for the creator", function()
  local state, dispatcher = new_match({
    mode = "private",
    creator = "creator",
  })
  state = join(state, dispatcher, "opponent", "Opponent")
  assert_equal(state.players.opponent.color, "b")
  assert_equal(state.started_at, nil)

  state = join(state, dispatcher, "creator", "Creator")
  assert_equal(state.players.creator.color, "w")
  assert_truthy(state.started_at)
end)

print("")
print(string.format("%d/%d tests passed", tests_passed, tests_run))

if tests_failed > 0 then
  os.exit(1)
end
