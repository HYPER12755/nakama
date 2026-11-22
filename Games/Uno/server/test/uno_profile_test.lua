local script_path = arg[0] or "Uno/server/test/uno_profile_test.lua"
local script_dir = script_path:match("^(.*)[/\\]") or "."
local server_dir = script_dir .. "/.."

package.path = server_dir .. "/?.lua;" .. script_dir .. "/?.lua;" .. package.path

local stored = {}
local leaderboards = {}
local social_calls = {}
local recent_calls = {}

local fake_nk = {
  time = function()
    return 1700000000000
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
  storage_list = function(user_id, collection, limit)
    local result = {}
    local prefix = collection .. ":"
    local suffix = ":" .. user_id
    for key, value in pairs(stored) do
      if key:find(prefix, 1, true) == 1 and key:sub(-#suffix) == suffix then
        result[#result + 1] = { key = key, value = value }
      end
    end
    table.sort(result, function(left, right)
      return tostring(left.key) < tostring(right.key)
    end)
    while #result > (limit or 50) do
      table.remove(result)
    end
    return result
  end,
  leaderboard_create = function(id, authoritative, sort_order, operator, reset_schedule, metadata, enable_ranks)
    if leaderboards[id] == nil then
      leaderboards[id] = {
        authoritative = authoritative,
        sort_order = sort_order,
        operator = operator,
        reset_schedule = reset_schedule,
        metadata = metadata,
        enable_ranks = enable_ranks,
        records = {},
      }
    end
  end,
  leaderboard_record_write = function(id, owner_id, username, score, subscore, metadata)
    local leaderboard = leaderboards[id]
    if leaderboard == nil then
      error("leaderboard does not exist")
    end
    leaderboard.records[owner_id] = {
      owner_id = owner_id,
      username = username,
      score = score,
      subscore = subscore,
      metadata = metadata,
      rank = 1,
    }
  end,
  leaderboard_records_list = function(id, owner_ids, limit)
    local leaderboard = leaderboards[id]
    if leaderboard == nil then
      return {}, {}, nil, nil, 0
    end
    local records = {}
    for _, record in pairs(leaderboard.records) do
      records[#records + 1] = record
    end
    table.sort(records, function(left, right)
      if left.score ~= right.score then
        return left.score > right.score
      end
      return tostring(left.owner_id) < tostring(right.owner_id)
    end)
    if type(owner_ids) == "table" then
      local owners = {}
      for _, record in ipairs(records) do
        for _, owner in ipairs(owner_ids) do
          if record.owner_id == owner then
            owners[#owners + 1] = record
          end
        end
      end
      return {}, owners, nil, nil, #records
    end
    local top = {}
    for index = 1, math.min(limit or 10, #records) do
      top[index] = records[index]
    end
    return top, {}, nil, nil, #records
  end,
  account_get_id = function(user_id)
    if user_id == "guest" then
      return { devices = { { id = "device" } } }
    end
    return { email = "player@example.com", devices = { { id = "device" } } }
  end,
  logger_warn = function() end,
  logger_error = function() end,
}

package.preload["nakama"] = function()
  return fake_nk
end

package.preload["moongames_social"] = function()
  return {
    INVITE_TTL_MS = 86400000,
    record_play = function(entry, game)
      social_calls[#social_calls + 1] = { entry = entry, game = game }
    end,
    record_recent_players = function(game, players)
      recent_calls[#recent_calls + 1] = { game = game, players = players }
    end,
  }
end

local progression = require("uno_profile")

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

local function match_state(winner)
  return {
    mode = "quick",
    rated = true,
    seats = 2,
    winner = winner,
    replay = {
      { player_id = "a", action = "play" },
      { player_id = "b", action = "draw" },
    },
    players = {
      { user_id = "a", username = "Alice" },
      { user_id = "b", username = "Bob" },
    },
  }
end

test("persists a finished rated hand and updates ratings", function()
  stored = {}
  leaderboards = {}
  social_calls = {}
  recent_calls = {}
  local state = match_state("a")
  local result = { status = "finished", winner_user_id = "a" }
  assert_equal(progression.finalize_match({ match_id = "m1" }, state, result, 1000), true, "finalized")
  assert_equal(stored["uno_profile:a"].wins, 1, "winner wins")
  assert_equal(stored["uno_profile:b"].losses, 1, "loser loss")
  assert_equal(stored["uno_profile:b"].rating < 1200, true, "loser lost rating")
  assert_equal(stored["uno_history:m1:a"] ~= nil, true, "history saved")
  assert_equal(#social_calls, 2, "play counts recorded")
  assert_equal(progression.finalize_match({ match_id = "m1" }, state, result, 2000), false, "idempotent")
  assert_equal(stored["uno_profile:a"].wins, 1, "no second game")
end)

test("returns shared history entries and records recent players", function()
  stored = {}
  leaderboards = {}
  social_calls = {}
  recent_calls = {}
  local state = match_state("a")
  progression.finalize_match({ match_id = "m1" }, state, {
    status = "finished",
    reason = "hand finished",
    winner_user_id = "a",
  }, 1000)
  local payload = progression.profile_payload({ user_id = "a", username = "Alice" })
  local entry = payload.history[1]
  assert_equal(entry ~= nil, true, "history entry returned")
  assert_equal(entry.matchId, "m1", "match id")
  assert_equal(entry.mode, "quick", "mode")
  assert_equal(entry.rated, true, "rated")
  assert_equal(entry.outcome, "win", "outcome")
  assert_equal(entry.status, "finished", "status")
  assert_equal(entry.reason, "hand finished", "reason")
  assert_equal(entry.opponent.userId, "b", "opponent id")
  assert_equal(entry.opponent.username, "Bob", "opponent name")
  assert_equal(entry.pointsFor, 1, "points for")
  assert_equal(entry.ratingDelta, stored["uno_profile:a"].rating - 1200, "rating delta")
  assert_equal(entry.endedAt, 1000, "ended at")
  assert_equal(#entry.steps, 2, "replay steps")
  assert_equal(#recent_calls, 1, "recent players recorded")
  assert_equal(recent_calls[1].game, "uno", "recent game")
  assert_equal(recent_calls[1].players[1].user_id, "a", "recent player id")
  assert_equal(recent_calls[1].players[1].userId, "a", "shared opponent shape")
end)

test("keeps guests off the leaderboard", function()
  stored = {}
  leaderboards = {}
  local state = match_state("guest")
  state.players[1].user_id = "guest"
  progression.finalize_match({ match_id = "m2" }, state, { status = "finished", winner_user_id = "guest" }, 1000)
  assert_equal(leaderboards.uno_rating.records.guest, nil, "guest not ranked")
  assert_equal(leaderboards.uno_rating.records.b ~= nil, true, "email account ranked")
end)

test("returns the shared profile contract", function()
  stored = {}
  local payload = progression.profile_payload({ user_id = "u1", username = "Player" })
  assert_equal(payload.ok, true, "ok")
  assert_equal(payload.profile.rating, 1200, "starting rating")
  assert_equal(payload.profile.stats.cards_played, 0, "stat present")
  assert_equal(#payload.history, 0, "empty history")
end)

test("reads real leaderboard records and the caller's row", function()
  stored = {}
  leaderboards = {}
  leaderboards.uno_rating = {
    records = {
      a = { owner_id = "a", username = "Alice", score = 1310, rank = 1, metadata = { games = 4 } },
      guest = { owner_id = "guest", username = "Guest", score = 1500, rank = 2, metadata = {} },
    },
  }
  local payload = progression.leaderboard_payload({ user_id = "a" }, { limit = 10 })
  assert_equal(#payload.entries, 1, "only the email account is listed")
  assert_equal(payload.entries[1].userId, "a", "owner id")
  assert_equal(payload.entries[1].rating, 1310, "score")
  assert_equal(payload.me ~= nil, true, "caller row returned")
end)

if failures > 0 then
  io.stderr:write(failures .. " Uno profile test(s) failed\n")
  os.exit(1)
end
print("all Uno profile tests passed")
