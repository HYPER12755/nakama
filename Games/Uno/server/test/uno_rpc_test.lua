local script_path = arg[0] or "Uno/server/test/uno_rpc_test.lua"
local script_dir = script_path:match("^(.*)[/\\]") or "."
local server_dir = script_dir .. "/.."

package.path = server_dir .. "/?.lua;" .. script_dir .. "/?.lua;" .. script_dir .. "/../../../shared/server/?.lua;" .. package.path

local rpcs = {}
local created = {}
local games = {}
local matchmakers = {}

local fake_social = {
  INVITE_TTL_MS = 86400000,
  register_game = function(id, handlers)
    games[id] = handlers
  end,
  register_matchmaker_game = function(id, handler)
    matchmakers[id] = handler
  end,
  create_room_code = function(match_id, game_id, seats)
    return "UNO-" .. match_id .. "-" .. seats
  end,
  record_play = function() end,
}

local fake_nk = {
  time = function()
    return 1700000000000
  end,
  json_encode = function(value)
    local parts = {}
    for key, item in pairs(value) do
      parts[#parts + 1] = tostring(key) .. "=" .. tostring(item)
    end
    return table.concat(parts, ",")
  end,
  json_decode = function(value)
    if type(value) == "table" then
      return value
    end
    return {}
  end,
  register_rpc = function(fn, name)
    rpcs[name] = fn
  end,
  match_create = function(module, params)
    created[#created + 1] = { module = module, params = params }
    return "match-" .. #created
  end,
  storage_read = function()
    return {}
  end,
  storage_write = function()
    return {}
  end,
  storage_list = function()
    return {}
  end,
  leaderboard_create = function() end,
  logger_warn = function() end,
}

package.preload["nakama"] = function()
  return fake_nk
end
package.preload["moongames_social"] = function()
  return fake_social
end

dofile(server_dir .. "/uno_rpc.lua")

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

test("registers Uno with the shared social layer", function()
  assert_equal(games.uno ~= nil, true, "room factory registered")
  assert_equal(matchmakers.uno ~= nil, true, "matchmaker registered")
end)

test("registers only the profile and private room RPCs", function()
  for _, name in ipairs({
    "uno_create_private_match", "uno_get_profile", "uno_get_leaderboard",
  }) do
    assert_equal(type(rpcs[name]), "function", name)
  end
  assert_equal(rpcs.uno_quick_match, nil, "no eager quick match RPC")
end)

test("creates a private room with a room code", function()
  local response = rpcs.uno_create_private_match(
    { user_id = "u1", username = "Alice" },
    { seats = 3 }
  )
  assert_equal(response:find("roomCode=UNO-match-1-3", 1, true) ~= nil, true, "room code")
  assert_equal(created[#created].params.mode, "private", "private mode")
  assert_equal(created[#created].params.seats, 3, "three seats")
end)

test("the matchmaker pairs matching tables only", function()
  local pair = matchmakers.uno({}, {
    { presence = { user_id = "a", username = "A" }, properties = { game = "uno", seats = 2 } },
    { presence = { user_id = "b", username = "B" }, properties = { game = "uno", seats = 2 } },
  })
  assert_equal(pair ~= nil, true, "two player match created")
  local mixed = matchmakers.uno({}, {
    { presence = { user_id = "a" }, properties = { game = "uno", seats = 2 } },
    { presence = { user_id = "b" }, properties = { game = "chess", seats = 2 } },
  })
  assert_equal(mixed, nil, "mixed games refused")
  local mixed_seats = matchmakers.uno({}, {
    { presence = { user_id = "a" }, properties = { game = "uno", seats = 2 } },
    { presence = { user_id = "b" }, properties = { game = "uno", seats = 4 } },
  })
  assert_equal(mixed_seats, nil, "mixed seats refused")
  local partial = matchmakers.uno({}, {
    { presence = { user_id = "a" }, properties = { game = "uno", seats = 4 } },
    { presence = { user_id = "b" }, properties = { game = "uno", seats = 4 } },
  })
  assert_equal(partial, nil, "four seat table needs four players")
end)

if failures > 0 then
  io.stderr:write(failures .. " Uno RPC test(s) failed\n")
  os.exit(1)
end
print("all Uno RPC tests passed")
