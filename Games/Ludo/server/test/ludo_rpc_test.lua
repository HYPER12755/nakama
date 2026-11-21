-- Tests for Ludo RPCs, private rooms and the matchmaker hook.

local script_path = arg[0] or "Ludo/server/test/ludo_rpc_test.lua"
local script_dir = script_path:match("^(.*)[/\\]") or "."
local server_dir = script_dir .. "/.."

package.path = server_dir .. "/?.lua;"
  .. script_dir .. "/../../../shared/server/?.lua;"
  .. script_dir .. "/?.lua;" .. package.path

local fake_nk
local fake_social
fake_social = {
  INVITE_TTL_MS = 24 * 60 * 60 * 1000,
  games = {},
  matchmakers = {},
  register_game = function(id, handler) fake_social.games[id] = handler end,
  register_matchmaker_game = function(id, handler) fake_social.matchmakers[id] = handler end,
  create_room_code = function(match_id) return "LUDO-" .. match_id end,
}

package.preload["nakama"] = function() return fake_nk end
package.preload["moongames_social"] = function() return fake_social end

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

local created = {}
local rpcs = {}

fake_nk = {
  time = function() return 1700000000000 end,
  json_encode = function(value) return value end,
  json_decode = function(value)
    if type(value) == "table" then return value end
    if value == "{}" or value == "" then return {} end
    return { seats = 4 }
  end,
  logger_warn = function() end,
  storage_read = function() return {} end,
  storage_write = function() return {} end,
  storage_list = function() return {} end,
  leaderboard_create = function() return {} end,
  leaderboard_record_write = function() return {} end,
  leaderboard_records_list = function() return {}, nil, nil, nil, nil, 0 end,
  match_list = function() return {} end,
  match_get = function()
    return { label = "ludo|private|4|closed" }
  end,
  match_create = function(name, props)
    created[#created + 1] = { name = name, props = props }
    return "ludo-match-" .. #created
  end,
  register_rpc = function(fn, name) rpcs[name] = fn end,
  register_matchmaker_matched = function() end,
}

dofile(server_dir .. "/ludo_rpc.lua")

test("registers Ludo with the social layer", function()
  assert_equal(fake_social.games.ludo ~= nil, true, "game registered")
  assert_equal(fake_social.matchmakers.ludo ~= nil, true, "matchmaker registered")
end)

test("registers the private and profile RPCs", function()
  for _, name in ipairs({
    "ludo_create_private_match", "ludo_get_profile", "ludo_get_leaderboard",
  }) do
    assert_equal(type(rpcs[name]), "function", name)
  end
end)

test("quick match cannot open a room before a partner is found", function()
  assert_equal(rpcs.ludo_quick_match, nil, "no eager quick match RPC")
  assert_equal(#created, 0, "no match created")
end)

test("creates a private room with a room code", function()
  local payload = rpcs.ludo_create_private_match({ user_id = "a", username = "Alice" }, { seats = 2 })
  assert_equal(payload.ok, true, "ok")
  assert_equal(payload.roomCode, "LUDO-ludo-match-1", "room code")
  assert_equal(created[#created].props.mode, "private", "private mode")
end)

test("the matchmaker only pairs matching Ludo requests", function()
  local matched = fake_social.matchmakers.ludo({}, {
    { presence = { user_id = "a", username = "A" }, properties = { game = "ludo", seats = 2, turnSeconds = 0 } },
    { presence = { user_id = "b", username = "B" }, properties = { game = "ludo", seats = 2, turnSeconds = 0 } },
  })
  assert_equal(matched ~= nil, true, "creates a match")
  local different = fake_social.matchmakers.ludo({}, {
    { presence = { user_id = "a" }, properties = { game = "ludo", seats = 2 } },
    { presence = { user_id = "b" }, properties = { game = "carrom", seats = 2 } },
  })
  assert_equal(different, nil, "does not mix games")
  local mixed_seats = fake_social.matchmakers.ludo({}, {
    { presence = { user_id = "a" }, properties = { game = "ludo", seats = 2, turnSeconds = 0 } },
    { presence = { user_id = "b" }, properties = { game = "ludo", seats = 4, turnSeconds = 0 } },
  })
  assert_equal(mixed_seats, nil, "does not mix two- and four-player tables")
  local four = fake_social.matchmakers.ludo({}, {
    { presence = { user_id = "a" }, properties = { game = "ludo", seats = 4, turnSeconds = 0 } },
    { presence = { user_id = "b" }, properties = { game = "ludo", seats = 4, turnSeconds = 0 } },
    { presence = { user_id = "c" }, properties = { game = "ludo", seats = 4, turnSeconds = 0 } },
    { presence = { user_id = "d" }, properties = { game = "ludo", seats = 4, turnSeconds = 0 } },
  })
  assert_equal(four ~= nil, true, "fills a four-player table")
  local last = created[#created]
  assert_equal(last.props.seats, 4, "four seats on the match")
  assert_equal(#last.props.expected_users, 4, "four expected players")
  local partial = fake_social.matchmakers.ludo({}, {
    { presence = { user_id = "a" }, properties = { game = "ludo", seats = 4, turnSeconds = 0 } },
    { presence = { user_id = "b" }, properties = { game = "ludo", seats = 4, turnSeconds = 0 } },
  })
  assert_equal(partial, nil, "does not open a four-seat table for two players")
end)

if failures > 0 then
  io.stderr:write(failures .. " Ludo RPC test(s) failed\n")
  os.exit(1)
end
print("all Ludo RPC tests passed")
