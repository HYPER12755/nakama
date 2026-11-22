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
  match_get = function(match_id)
    return { match_id = match_id, label = "uno|private|2|open" }
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

test("a non-creator can join a room-code private room", function()
  rpcs.uno_create_private_match({ user_id = "u1", username = "Alice" }, { seats = 2 })
  local params = created[#created].params
  assert_equal(params.expected_users, nil, "no reserved users for a code room")

  local MATCH = dofile(server_dir .. "/uno_match.lua")
  local state = MATCH.match_init({ match_id = "match-1" }, params)
  assert_equal(state.expected_count, 0, "no expected users in the match")
  local _, allowed = MATCH.match_join_attempt({}, {}, 1, state, {
    user_id = "u1", username = "Alice", session_id = "u1-session",
  }, {})
  assert_equal(allowed, true, "creator may join")
  local _, guest_allowed = MATCH.match_join_attempt({}, {}, 2, state, {
    user_id = "u2", username = "Bob", session_id = "u2-session",
  }, {})
  assert_equal(guest_allowed, true, "code holder may fill the second seat")
end)

test("invite-created rooms stay reserved for the recipient", function()
  games.uno.create_room({ user_id = "u1", username = "Alice" }, { seats = 2 }, {
    user_id = "u2", username = "Bob",
  })
  local invite_params = created[#created].params
  assert_equal(#invite_params.expected_users, 2, "creator and recipient reserved")
  assert_equal(invite_params.expected_users[2].user_id, "u2", "recipient reserved")
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

test("creates a sevenO private room through the RPC", function()
  local response = rpcs.uno_create_private_match(
    { user_id = "u1", username = "Alice" },
    { seats = 2, rulesMode = "sevenO" }
  )
  assert_equal(response:find("rulesMode=sevenO", 1, true) ~= nil, true, "mode in response")
  assert_equal(created[#created].params.rulesMode, "sevenO", "mode passed to the match")
end)

test("defaults private rooms to classic and carries the mode in invites", function()
  local room = games.uno.create_room({ user_id = "u1", username = "Alice" }, { seats = 2 }, {
    user_id = "u2", username = "Bob",
  })
  assert_equal(room.metadata.rulesMode, "classic", "default invite metadata mode")
  assert_equal(created[#created].params.rulesMode, "classic", "default match mode")

  local seven_o = games.uno.create_room({ user_id = "u1", username = "Alice" }, {
    seats = 2,
    mode = "sevenO",
  }, { user_id = "u2", username = "Bob" })
  assert_equal(seven_o.metadata.rulesMode, "sevenO", "sevenO invite metadata mode")
  assert_equal(created[#created].params.rulesMode, "sevenO", "sevenO match mode")

  local attached = games.uno.attach_room({ user_id = "u1", username = "Alice" }, {
    matchId = "match-1",
    metadata = { rulesMode = "sevenO" },
  })
  assert_equal(attached.rulesMode, "sevenO", "attached room mode")
  assert_equal(attached.metadata.rulesMode, "sevenO", "attached invite metadata mode")
end)

test("refuses unknown rules modes", function()
  local before = #created
  local response = rpcs.uno_create_private_match(
    { user_id = "u1", username = "Alice" },
    { seats = 2, rulesMode = "bogus" }
  )
  assert_equal(response:find("ok=false", 1, true) ~= nil, true, "rpc refused")
  assert_equal(#created, before, "no match created")
  local ok = pcall(games.uno.create_room, { user_id = "u1", username = "Alice" }, {
    seats = 2, rulesMode = "bogus",
  }, nil)
  assert_equal(ok, false, "invite room refused")
end)

test("matchmaker matches only tickets that agree on the rules mode", function()
  local pair = matchmakers.uno({}, {
    { presence = { user_id = "a", username = "A" }, properties = { game = "uno", seats = 2, rulesMode = "sevenO" } },
    { presence = { user_id = "b", username = "B" }, properties = { game = "uno", seats = 2, rulesMode = "sevenO" } },
  })
  assert_equal(pair ~= nil, true, "sevenO pair created")
  assert_equal(created[#created].params.rulesMode, "sevenO", "sevenO passed to match")

  local mixed = matchmakers.uno({}, {
    { presence = { user_id = "a" }, properties = { game = "uno", seats = 2, rulesMode = "sevenO" } },
    { presence = { user_id = "b" }, properties = { game = "uno", seats = 2, rulesMode = "classic" } },
  })
  assert_equal(mixed, nil, "mixed modes refused")

  local aliased = matchmakers.uno({}, {
    { presence = { user_id = "a" }, properties = { game = "uno", seats = 2, mode = "sevenO" } },
    { presence = { user_id = "b" }, properties = { game = "uno", seats = 2, mode = "sevenO" } },
  })
  assert_equal(aliased ~= nil, true, "mode alias accepted")
  assert_equal(created[#created].params.rulesMode, "sevenO", "aliased mode passed")

  local legacy = matchmakers.uno({}, {
    { presence = { user_id = "a" }, properties = { game = "uno", seats = 2 } },
    { presence = { user_id = "b" }, properties = { game = "uno", seats = 2 } },
  })
  assert_equal(legacy ~= nil, true, "legacy tickets still match")
  assert_equal(created[#created].params.rulesMode, "classic", "legacy defaults to classic")

  local invalid = matchmakers.uno({}, {
    { presence = { user_id = "a" }, properties = { game = "uno", seats = 2, rulesMode = "bogus" } },
    { presence = { user_id = "b" }, properties = { game = "uno", seats = 2, rulesMode = "bogus" } },
  })
  assert_equal(invalid, nil, "invalid mode refused")
end)

test("creates a progressive private room through the RPC", function()
  local response = rpcs.uno_create_private_match(
    { user_id = "u1", username = "Alice" },
    { seats = 2, rulesMode = "progressive" }
  )
  assert_equal(response:find("rulesMode=progressive", 1, true) ~= nil, true, "mode in response")
  assert_equal(created[#created].params.rulesMode, "progressive", "mode passed to match")
end)

test("carries progressive mode through invites and attachment", function()
  local room = games.uno.create_room({ user_id = "u1", username = "Alice" }, {
    seats = 2,
    rulesMode = "progressive",
  }, { user_id = "u2", username = "Bob" })
  assert_equal(room.rulesMode, "progressive", "invite response mode")
  assert_equal(room.metadata.rulesMode, "progressive", "invite metadata mode")
  assert_equal(created[#created].params.rulesMode, "progressive", "invite match mode")
  local attached = games.uno.attach_room({ user_id = "u1", username = "Alice" }, {
    matchId = "match-1",
    metadata = { rulesMode = "progressive" },
  })
  assert_equal(attached.rulesMode, "progressive", "attached room mode")
  assert_equal(attached.metadata.rulesMode, "progressive", "attached invite metadata mode")
end)

test("matchmaker matches only tickets that agree on progressive mode", function()
  local pair = matchmakers.uno({}, {
    { presence = { user_id = "a", username = "A" }, properties = { game = "uno", seats = 2, rulesMode = "progressive" } },
    { presence = { user_id = "b", username = "B" }, properties = { game = "uno", seats = 2, rulesMode = "progressive" } },
  })
  assert_equal(pair ~= nil, true, "progressive pair created")
  assert_equal(created[#created].params.rulesMode, "progressive", "progressive passed to match")

  local mixed = matchmakers.uno({}, {
    { presence = { user_id = "a" }, properties = { game = "uno", seats = 2, rulesMode = "progressive" } },
    { presence = { user_id = "b" }, properties = { game = "uno", seats = 2, rulesMode = "classic" } },
  })
  assert_equal(mixed, nil, "mixed modes refused")

  local aliased = matchmakers.uno({}, {
    { presence = { user_id = "a" }, properties = { game = "uno", seats = 2, mode = "progressive" } },
    { presence = { user_id = "b" }, properties = { game = "uno", seats = 2, mode = "progressive" } },
  })
  assert_equal(aliased ~= nil, true, "mode alias accepted")
  assert_equal(created[#created].params.rulesMode, "progressive", "aliased mode passed")
end)

test("creates a jumpIn private room through the RPC", function()
  local response = rpcs.uno_create_private_match(
    { user_id = "u1", username = "Alice" },
    { seats = 2, rulesMode = "jumpIn" }
  )
  assert_equal(response:find("rulesMode=jumpIn", 1, true) ~= nil, true, "mode in response")
  assert_equal(created[#created].params.rulesMode, "jumpIn", "mode passed to the match")
end)

test("carries jumpIn mode through invites and attachment", function()
  local room = games.uno.create_room({ user_id = "u1", username = "Alice" }, {
    seats = 2,
    rulesMode = "jumpIn",
  }, { user_id = "u2", username = "Bob" })
  assert_equal(room.rulesMode, "jumpIn", "invite response mode")
  assert_equal(room.metadata.rulesMode, "jumpIn", "invite metadata mode")
  assert_equal(created[#created].params.rulesMode, "jumpIn", "invite match mode")
  local attached = games.uno.attach_room({ user_id = "u1", username = "Alice" }, {
    matchId = "match-1",
    metadata = { rulesMode = "jumpIn" },
  })
  assert_equal(attached.rulesMode, "jumpIn", "attached room mode")
  assert_equal(attached.metadata.rulesMode, "jumpIn", "attached invite metadata mode")
end)

test("matchmaker matches only tickets that agree on jumpIn mode", function()
  local pair = matchmakers.uno({}, {
    { presence = { user_id = "a", username = "A" }, properties = { game = "uno", seats = 2, rulesMode = "jumpIn" } },
    { presence = { user_id = "b", username = "B" }, properties = { game = "uno", seats = 2, rulesMode = "jumpIn" } },
  })
  assert_equal(pair ~= nil, true, "jumpIn pair created")
  assert_equal(created[#created].params.rulesMode, "jumpIn", "jumpIn passed to match")
  local mixed = matchmakers.uno({}, {
    { presence = { user_id = "a" }, properties = { game = "uno", seats = 2, rulesMode = "jumpIn" } },
    { presence = { user_id = "b" }, properties = { game = "uno", seats = 2, rulesMode = "classic" } },
  })
  assert_equal(mixed, nil, "mixed modes refused")
  local aliased = matchmakers.uno({}, {
    { presence = { user_id = "a" }, properties = { game = "uno", seats = 2, mode = "jumpIn" } },
    { presence = { user_id = "b" }, properties = { game = "uno", seats = 2, mode = "jumpIn" } },
  })
  assert_equal(aliased ~= nil, true, "mode alias accepted")
  assert_equal(created[#created].params.rulesMode, "jumpIn", "aliased mode passed")
end)

test("creates an attack private room through the RPC", function()
  local response = rpcs.uno_create_private_match(
    { user_id = "u1", username = "Alice" },
    { seats = 2, rulesMode = "attack" }
  )
  assert_equal(response:find("rulesMode=attack", 1, true) ~= nil, true, "mode in response")
  assert_equal(created[#created].params.rulesMode, "attack", "mode passed to the match")
end)

test("carries attack mode through invites and attachment", function()
  local room = games.uno.create_room({ user_id = "u1", username = "Alice" }, {
    seats = 2,
    rulesMode = "attack",
  }, { user_id = "u2", username = "Bob" })
  assert_equal(room.rulesMode, "attack", "invite response mode")
  assert_equal(room.metadata.rulesMode, "attack", "invite metadata mode")
  assert_equal(created[#created].params.rulesMode, "attack", "invite match mode")
  local attached = games.uno.attach_room({ user_id = "u1", username = "Alice" }, {
    matchId = "match-1",
    metadata = { rulesMode = "attack" },
  })
  assert_equal(attached.rulesMode, "attack", "attached room mode")
  assert_equal(attached.metadata.rulesMode, "attack", "attached invite metadata mode")
end)

test("matchmaker matches only tickets that agree on attack mode", function()
  local pair = matchmakers.uno({}, {
    { presence = { user_id = "a", username = "A" }, properties = { game = "uno", seats = 2, rulesMode = "attack" } },
    { presence = { user_id = "b", username = "B" }, properties = { game = "uno", seats = 2, rulesMode = "attack" } },
  })
  assert_equal(pair ~= nil, true, "attack pair created")
  assert_equal(created[#created].params.rulesMode, "attack", "attack passed to match")
  local mixed = matchmakers.uno({}, {
    { presence = { user_id = "a" }, properties = { game = "uno", seats = 2, rulesMode = "attack" } },
    { presence = { user_id = "b" }, properties = { game = "uno", seats = 2, rulesMode = "classic" } },
  })
  assert_equal(mixed, nil, "mixed modes refused")
  local aliased = matchmakers.uno({}, {
    { presence = { user_id = "a" }, properties = { game = "uno", seats = 2, mode = "attack" } },
    { presence = { user_id = "b" }, properties = { game = "uno", seats = 2, mode = "attack" } },
  })
  assert_equal(aliased ~= nil, true, "mode alias accepted")
  assert_equal(created[#created].params.rulesMode, "attack", "aliased mode passed")
end)

test("creates a noMercy private room through the RPC", function()
  local response = rpcs.uno_create_private_match(
    { user_id = "u1", username = "Alice" },
    { seats = 2, rulesMode = "noMercy" }
  )
  assert_equal(response:find("rulesMode=noMercy", 1, true) ~= nil, true, "mode in response")
  assert_equal(created[#created].params.rulesMode, "noMercy", "mode passed to the match")
end)

test("carries noMercy mode through invites and attachment", function()
  local room = games.uno.create_room({ user_id = "u1", username = "Alice" }, {
    seats = 2,
    rulesMode = "noMercy",
  }, { user_id = "u2", username = "Bob" })
  assert_equal(room.rulesMode, "noMercy", "invite response mode")
  assert_equal(room.metadata.rulesMode, "noMercy", "invite metadata mode")
  assert_equal(created[#created].params.rulesMode, "noMercy", "invite match mode")
  local attached = games.uno.attach_room({ user_id = "u1", username = "Alice" }, {
    matchId = "match-1",
    metadata = { rulesMode = "noMercy" },
  })
  assert_equal(attached.rulesMode, "noMercy", "attached room mode")
  assert_equal(attached.metadata.rulesMode, "noMercy", "attached invite metadata mode")
end)

test("matchmaker matches only tickets that agree on noMercy mode", function()
  local pair = matchmakers.uno({}, {
    { presence = { user_id = "a", username = "A" }, properties = { game = "uno", seats = 2, rulesMode = "noMercy" } },
    { presence = { user_id = "b", username = "B" }, properties = { game = "uno", seats = 2, rulesMode = "noMercy" } },
  })
  assert_equal(pair ~= nil, true, "noMercy pair created")
  assert_equal(created[#created].params.rulesMode, "noMercy", "noMercy passed to match")
  local mixed = matchmakers.uno({}, {
    { presence = { user_id = "a" }, properties = { game = "uno", seats = 2, rulesMode = "noMercy" } },
    { presence = { user_id = "b" }, properties = { game = "uno", seats = 2, rulesMode = "classic" } },
  })
  assert_equal(mixed, nil, "mixed modes refused")
  local aliased = matchmakers.uno({}, {
    { presence = { user_id = "a" }, properties = { game = "uno", seats = 2, mode = "noMercy" } },
    { presence = { user_id = "b" }, properties = { game = "uno", seats = 2, mode = "noMercy" } },
  })
  assert_equal(aliased ~= nil, true, "mode alias accepted")
  assert_equal(created[#created].params.rulesMode, "noMercy", "aliased mode passed")
end)

test("creates a flip private room through the RPC", function()
  local response = rpcs.uno_create_private_match(
    { user_id = "u1", username = "Alice" },
    { seats = 2, rulesMode = "flip" }
  )
  assert_equal(response:find("rulesMode=flip", 1, true) ~= nil, true, "mode in response")
  assert_equal(created[#created].params.rulesMode, "flip", "mode passed to the match")
end)

test("carries flip mode through invites and attachment", function()
  local room = games.uno.create_room({ user_id = "u1", username = "Alice" }, {
    seats = 2,
    rulesMode = "flip",
  }, { user_id = "u2", username = "Bob" })
  assert_equal(room.rulesMode, "flip", "invite response mode")
  assert_equal(room.metadata.rulesMode, "flip", "invite metadata mode")
  assert_equal(created[#created].params.rulesMode, "flip", "invite match mode")
  local attached = games.uno.attach_room({ user_id = "u1", username = "Alice" }, {
    matchId = "match-1",
    metadata = { rulesMode = "flip" },
  })
  assert_equal(attached.rulesMode, "flip", "attached room mode")
  assert_equal(attached.metadata.rulesMode, "flip", "attached invite metadata mode")
end)

test("matchmaker matches only tickets that agree on flip mode", function()
  local pair = matchmakers.uno({}, {
    { presence = { user_id = "a", username = "A" }, properties = { game = "uno", seats = 2, rulesMode = "flip" } },
    { presence = { user_id = "b", username = "B" }, properties = { game = "uno", seats = 2, rulesMode = "flip" } },
  })
  assert_equal(pair ~= nil, true, "flip pair created")
  assert_equal(created[#created].params.rulesMode, "flip", "flip passed to match")
  local mixed = matchmakers.uno({}, {
    { presence = { user_id = "a" }, properties = { game = "uno", seats = 2, rulesMode = "flip" } },
    { presence = { user_id = "b" }, properties = { game = "uno", seats = 2, rulesMode = "classic" } },
  })
  assert_equal(mixed, nil, "mixed modes refused")
  local aliased = matchmakers.uno({}, {
    { presence = { user_id = "a" }, properties = { game = "uno", seats = 2, mode = "flip" } },
    { presence = { user_id = "b" }, properties = { game = "uno", seats = 2, mode = "flip" } },
  })
  assert_equal(aliased ~= nil, true, "mode alias accepted")
  assert_equal(created[#created].params.rulesMode, "flip", "aliased mode passed")
end)

if failures > 0 then
  io.stderr:write(failures .. " Uno RPC test(s) failed\n")
  os.exit(1)
end
print("all Uno RPC tests passed")
