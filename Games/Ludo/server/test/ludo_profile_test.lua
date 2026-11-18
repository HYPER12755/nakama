-- Tests for Ludo progression: result mapping, idempotent finalization,
-- profile payloads and the rating leaderboard.

local script_path = arg[0] or "Ludo/server/test/ludo_profile_test.lua"
local script_dir = script_path:match("^(.*)[/\\]") or "."
local server_dir = script_dir .. "/.."

package.path = server_dir .. "/?.lua;"
  .. script_dir .. "/../../../shared/server/?.lua;"
  .. script_dir .. "/?.lua;" .. package.path

local fake_time = 1700000000000
local stored = {}
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
  json_encode = function(value) return value end,
  json_decode = function() return {} end,
  logger_warn = function() end,
  logger_info = function() end,
  storage_read = function(objects)
    local result = {}
    for _, object in ipairs(objects) do
      local key = object.collection .. ":" .. object.key
      if stored[key] then
        result[#result + 1] = { key = object.key, value = stored[key] }
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
  storage_list = function(user_id, collection)
    local result = {}
    for key, value in pairs(stored) do
      if key:find(collection .. ":", 1, true) == 1 then
        result[#result + 1] = { value = value }
      end
    end
    return result
  end,
  leaderboard_create = function() return {} end,
  leaderboard_record_write = function() return {} end,
  leaderboard_records_list = function()
    return {}, nil, nil, nil, nil, 0
  end,
}

local progression = require("ludo_profile")

test("maps winner colour to win and loss", function()
  local result = { winnerColour = "red" }
  assert_equal(progression.outcome_for_result(result, "red", "a"), "win", "winner")
  assert_equal(progression.outcome_for_result(result, "green", "b"), "loss", "loser")
  assert_equal(progression.outcome_for_result({}, "green", "b"), "draw", "no winner")
  assert_equal(
    progression.outcome_for_result({ status = "abandoned" }, "red", "a"),
    "abandoned", "abandoned"
  )
end)

test("finalizes once and raises the winner rating", function()
  stored = {}
  local state = {
    mode = "quick",
    rated = true,
    colours = { "red", "green" },
    player_order = { "a", "b" },
    players = {
      a = { user_id = "a", username = "Alice", colour = "red" },
      b = { user_id = "b", username = "Bob", colour = "green" },
    },
    moves = {
      { user_id = "a", captures = 1, finished = 4 },
      { user_id = "b", captures = 0, finished = 2 },
    },
    replay_steps = { { roll = 6, seed = 12, token = 0 } },
  }
  local context = { match_id = "match-1" }
  assert_equal(progression.finalize_match(context, state, {
    status = "finished", winnerColour = "red", winnerUserId = "a",
  }, fake_time), true, "first finalize")
  local alice = stored["ludo_profile:a"]
  local bob = stored["ludo_profile:b"]
  assert_equal(alice.wins, 1, "win recorded")
  assert_equal(bob.losses, 1, "loss recorded")
  assert_equal(alice.rating > 1200, true, "winner gained rating")
  assert_equal(bob.rating < 1200, true, "loser lost rating")
  assert_equal(alice.captures, 1, "capture stat")
  assert_equal(alice.tokens_finished, 4, "finished stat")
  assert_equal(stored["ludo_history:match-1:a"] ~= nil, true, "history saved")
  assert_equal(progression.finalize_match(context, state, {
    status = "finished", winnerColour = "red", winnerUserId = "a",
  }, fake_time + 100), true, "repeat finalize")
  assert_equal(stored["ludo_profile:a"].wins, 1, "no second game")
end)

test("returns the shared profile contract", function()
  stored = {}
  local payload = progression.profile_payload({ user_id = "u1", username = "Player" })
  assert_equal(payload.ok, true, "ok")
  assert_equal(payload.profile.rating, 1200, "starting rating")
  assert_equal(payload.profile.stats.tokens_finished, 0, "stat present")
  assert_equal(#payload.history, 0, "empty history")
end)

if failures > 0 then
  io.stderr:write(failures .. " Ludo profile test(s) failed\n")
  os.exit(1)
end
print("all Ludo profile tests passed")
