-- Tests for the Carrom progression: the rating maths, the profile shape, the
-- history records, and a finished game written through the fake storage.

local script_path = arg[0] or "Carrom/server/test/carrom_profile_test.lua"
local script_dir = script_path:match("^(.*)[/\\]") or "."
local server_dir = script_dir .. "/.."

package.path = server_dir .. "/?.lua;" .. package.path

local fake_time = 1700000000000
local storage = {}

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

local fake_nk = {
  time = function()
    return fake_time
  end,
  json_encode = function(value)
    return value
  end,
  storage_read = function(objects)
    local result = {}
    for _, object in ipairs(objects) do
      local record = storage[storage_key(object.user_id, object.collection, object.key)]
      if record then
        result[#result + 1] = {
          collection = object.collection,
          key = object.key,
          user_id = object.user_id,
          value = copy(record.value),
        }
      end
    end
    return result
  end,
  storage_write = function(writes)
    for _, write in ipairs(writes) do
      storage[storage_key(write.user_id, write.collection, write.key)] = {
        value = copy(write.value),
      }
    end
    return {}
  end,
  storage_list = function(user_id, collection, limit)
    local result = {}
    for key, record in pairs(storage) do
      local parts = {}
      for part in key:gmatch("[^|]+") do
        parts[#parts + 1] = part
      end
      if parts[1] == user_id and parts[2] == collection then
        result[#result + 1] = { key = parts[3], value = copy(record.value) }
      end
    end
    table.sort(result, function(left, right)
      return tostring(left.key) < tostring(right.key)
    end)
    local limited = {}
    for index = 1, math.min(limit, #result) do
      limited[index] = result[index]
    end
    return limited
  end,
  leaderboard_create = function()
    return {}
  end,
  leaderboard_record_write = function()
    return {}
  end,
  leaderboard_record_read = function()
    return {}
  end,
  leaderboard_records_list = function(_, _, _, _, _, rank_count)
    local records = {}
    records[1] = {
      user_id = "user-a",
      username = "Ivory",
      rating = 1300,
      rank = 1,
      metadata = { games = 5 },
    }
    return records, {}, 0, nil, nil, rank_count or #records
  end,
  logger_warn = function() end,
  logger_error = function() end,
}

package.preload["nakama"] = function()
  return fake_nk
end

local progression = require("carrom_profile")

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

local function assert_near(actual, expected, tolerance, message)
  if math.abs(actual - expected) > (tolerance or 0.001) then
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

test("a new player starts on the default rating", function()
  local profile = progression.default_profile("Player", 1000)
  assert_equal(profile.rating, 1200, "rating")
  assert_equal(profile.peak_rating, 1200, "peak rating")
  assert_equal(profile.games, 0, "games")
  assert_equal(profile.pieces_pocketed, 0, "pieces pocketed")
end)

test("a win moves the rating up and a loss moves it down", function()
  assert_equal(progression.rating_delta(1200, 1200, "win"), 16, "win delta")
  assert_equal(progression.rating_delta(1200, 1200, "loss"), -16, "loss delta")
  assert_equal(progression.rating_delta(1200, 1200, "draw"), 0, "draw delta")
  assert_near(
    progression.expected_score(1200, 1200),
    0.5,
    0.0001,
    "expected score"
  )
end)

test("the public profile carries the shared counters", function()
  local public = progression.public_profile({
    username = "Player",
    rating = 1240,
    peak_rating = 1240,
    games = 12,
    wins = 7,
    losses = 4,
    draws = 1,
    rated_games = 9,
    casual_games = 3,
    pieces_pocketed = 48,
    queens_covered = 3,
    best_streak = 4,
    updated_at = 1700000000000,
  })
  assert_equal(public.username, "Player", "username")
  assert_equal(public.rating, 1240, "rating")
  assert_equal(public.games, 12, "games")
  assert_equal(public.stats.pieces_pocketed, 48, "pieces pocketed")
  assert_equal(public.stats.queens_covered, 3, "queens covered")
  assert_equal(public.stats.best_streak, 4, "best streak")
end)

test("a history record carries the replay steps", function()
  local record = progression.history_record(
    "match-1",
    "quick",
    true,
    "win",
    "finished",
    "board cleared",
    { user_id = "user-b", username = "Onyx" },
    { "Ivory shot 2 pieces (power 72%)" },
    "Ivory cleared the board",
    1200,
    1216,
    16,
    1700000000000
  )
  assert_equal(record.match_id, "match-1", "match id")
  assert_equal(record.game_id, "carrom", "game id")
  assert_equal(record.outcome, "win", "outcome")
  assert_equal(record.opponent.username, "Onyx", "opponent")
  assert_equal(#record.steps, 1, "steps")
  assert_equal(record.rating_delta, 16, "rating delta")
end)

test("the outcome follows the winner", function()
  assert_equal(
    progression.outcome_for_result({ winnerColour = "white" }, "white"),
    "win",
    "the winner"
  )
  assert_equal(
    progression.outcome_for_result({ winnerColour = "white" }, "black"),
    "loss",
    "the other player"
  )
  assert_equal(progression.outcome_for_result({}, "white"), "draw", "no winner")
end)

test("a finished game writes the profile, the history, and the stats", function()
  for key in pairs(storage) do
    storage[key] = nil
  end

  local state = {
    mode = "quick",
    rated = true,
    player_order = { "user-a", "user-b" },
    players = {
      ["user-a"] = { user_id = "user-a", username = "Ivory", colour = "white" },
      ["user-b"] = { user_id = "user-b", username = "Onyx", colour = "black" },
    },
    shots = {
      {
        by = "user-a",
        colour = "white",
        pocketed_count = 3,
        queen_covered = true,
      },
    },
  }
  local result = {
    status = "finished",
    winnerColour = "white",
    reason = "board cleared",
    endedAt = fake_time,
  }

  local written = progression.finalize_match(
    { match_id = "match-9" },
    state,
    result,
    fake_time
  )
  assert_equal(written, true, "the match was recorded")

  local profile = storage[storage_key("user-a", "carrom_profile", "user-a")]
  assert_equal(profile ~= nil, true, "the profile was written")
  assert_equal(profile.value.games, 1, "games")
  assert_equal(profile.value.wins, 1, "wins")
  assert_equal(profile.value.rating, 1210, "rating")
  assert_equal(profile.value.pieces_pocketed, 3, "pieces pocketed")
  assert_equal(profile.value.queens_covered, 1, "queens covered")
  assert_equal(
    profile.value.rating_deviation > 0 and profile.value.volatility > 0,
    true,
    "the uncertainty is kept"
  )

  local history = storage[storage_key("user-a", "carrom_history", "match-9:user-a")]
  assert_equal(history ~= nil, true, "the history was written")
  assert_equal(history.value.outcome, "win", "the outcome")
  assert_equal(history.value.opponent.username, "Onyx", "the opponent")
  assert_equal(#history.value.steps, 1, "the replay steps")
end)

test("a history step says which pieces were pocketed", function()
  for key in pairs(storage) do
    storage[key] = nil
  end
  local state = {
    mode = "quick",
    rated = true,
    player_order = { "user-a", "user-b" },
    players = {
      ["user-a"] = { user_id = "user-a", username = "Ivory", colour = "white" },
      ["user-b"] = { user_id = "user-b", username = "Onyx", colour = "black" },
    },
    shots = {
      {
        by = "user-a",
        colour = "white",
        pocketed_count = 2,
        pocketed_colours = { "white", "black" },
        power = 0.72,
      },
    },
  }
  progression.finalize_match(
    { match_id = "match-steps" },
    state,
    { status = "finished", winnerColour = "white", endedAt = fake_time },
    fake_time
  )
  local history = storage[storage_key("user-a", "carrom_history", "match-steps:user-a")]
  assert_equal(
    history.value.steps[1],
    "white shot 2 white, black (power 72%)",
    "the step"
  )
end)

test("finishing the same match twice does not move the rating again", function()
  for key in pairs(storage) do
    storage[key] = nil
  end
  local state = {
    mode = "quick",
    rated = true,
    player_order = { "user-a", "user-b" },
    players = {
      ["user-a"] = { user_id = "user-a", username = "Ivory", colour = "white" },
      ["user-b"] = { user_id = "user-b", username = "Onyx", colour = "black" },
    },
    shots = {},
  }
  local result = {
    status = "finished",
    winnerColour = "white",
    endedAt = fake_time,
  }
  progression.finalize_match({ match_id = "match-twice" }, state, result, fake_time)
  progression.finalize_match({ match_id = "match-twice" }, state, result, fake_time)
  local profile = storage[storage_key("user-a", "carrom_profile", "user-a")]
  assert_equal(profile.value.games, 1, "the game is counted once")
  assert_equal(profile.value.rating, 1210, "the rating moved once")
end)

test("a three player table rates against all the opponents", function()
  for key in pairs(storage) do
    storage[key] = nil
  end
  storage[storage_key("user-b", "carrom_profile", "user-b")] = {
    value = progression.default_profile("Onyx", fake_time - 1),
  }
  storage[storage_key("user-b", "carrom_profile", "user-b")].value.rating = 1400
  storage[storage_key("user-c", "carrom_profile", "user-c")] = {
    value = progression.default_profile("Green", fake_time - 1),
  }
  storage[storage_key("user-c", "carrom_profile", "user-c")].value.rating = 1600
  local state = {
    mode = "quick",
    rated = true,
    player_order = { "user-a", "user-b", "user-c" },
    players = {
      ["user-a"] = { user_id = "user-a", username = "Ivory", colour = "white" },
      ["user-b"] = { user_id = "user-b", username = "Onyx", colour = "black" },
      ["user-c"] = { user_id = "user-c", username = "Green", colour = "green" },
    },
    shots = {},
  }
  progression.finalize_match(
    { match_id = "match-three" },
    state,
    { status = "finished", winnerColour = "white", endedAt = fake_time },
    fake_time
  )
  local profile = storage[storage_key("user-a", "carrom_profile", "user-a")]
  -- The two opponents are 1400 and 1600, so the table is rated as 1500.
  assert_equal(profile.value.rating, 1217, "the average opponent was used")
  local history = storage[storage_key("user-a", "carrom_history", "match-three:user-a")]
  assert_equal(history.value.opponent_rating, 1500, "the history carries that rating")
  assert_equal(#history.value.opponents, 2, "both opponents are recorded")
end)

test("the leaderboard total counts all the ranked players", function()
  local payload = progression.leaderboard_payload(
    { user_id = "user-a" },
    { limit = 1 }
  )
  assert_equal(payload.total, 1, "the total comes from the rank count")
  assert_equal(#payload.entries, 1, "only one row was asked for")
end)

test("a player who leaves loses and the ones who stayed win", function()
  assert_equal(
    progression.outcome_for_result(
      { status = "disconnect", loserUserId = "u1" },
      "black",
      "u1"
    ),
    "loss",
    "the leaver"
  )
  assert_equal(
    progression.outcome_for_result(
      { status = "disconnect", loserUserId = "u1" },
      "green",
      "u3"
    ),
    "win",
    "the player who stayed"
  )
  assert_equal(
    progression.outcome_for_result({ status = "abandoned" }, "white", "u1"),
    "abandoned",
    "an abandoned table"
  )
end)

test("a team result is won by everybody on the winning side", function()
  assert_equal(
    progression.outcome_for_result({ winnerTeam = "A" }, "white", "u1", "A"),
    "win",
    "a white player"
  )
  assert_equal(
    progression.outcome_for_result({ winnerTeam = "A" }, "black", "u2", "A"),
    "win",
    "a black player"
  )
  assert_equal(
    progression.outcome_for_result({ winnerTeam = "A" }, "yellow", "u3", "B"),
    "loss",
    "a yellow player"
  )
  assert_equal(
    progression.outcome_for_result({ winnerTeam = "A" }, "green", "u4", "B"),
    "loss",
    "a green player"
  )
end)

test("a team win writes the result for both partners", function()
  for key in pairs(storage) do
    storage[key] = nil
  end
  local state = {
    mode = "quick",
    rated = true,
    teams = true,
    player_order = { "u1", "u2", "u3", "u4" },
    players = {
      ["u1"] = { user_id = "u1", username = "Ivory", colour = "white" },
      ["u2"] = { user_id = "u2", username = "Onyx", colour = "black" },
      ["u3"] = { user_id = "u3", username = "Amber", colour = "yellow" },
      ["u4"] = { user_id = "u4", username = "Jade", colour = "green" },
    },
    shots = {},
  }
  progression.finalize_match(
    { match_id = "match-doubles" },
    state,
    { status = "finished", winnerColour = "white", winnerTeam = "A", endedAt = fake_time },
    fake_time
  )
  local winner = storage[storage_key("u2", "carrom_profile", "u2")]
  local loser = storage[storage_key("u3", "carrom_profile", "u3")]
  assert_equal(winner.value.wins, 1, "the partner won")
  assert_equal(loser.value.losses, 1, "the rival lost")
end)

test("a finished game keeps its shots for the replay", function()
  for key in pairs(storage) do
    storage[key] = nil
  end
  local state = {
    mode = "quick",
    rated = false,
    variant = "freestyle",
    player_order = { "user-a", "user-b" },
    players = {
      ["user-a"] = { user_id = "user-a", username = "Ivory", colour = "white" },
      ["user-b"] = { user_id = "user-b", username = "Onyx", colour = "black" },
    },
    game = { players = { "white", "black" } },
    shots = {
      {
        by = "user-a",
        colour = "white",
        position = 0.5,
        angle = -1.57,
        power = 0.8,
        pocketed_count = 1,
        striker = "heavy",
      },
    },
  }
  progression.finalize_match(
    { match_id = "match-replay" },
    state,
    { status = "finished", winnerColour = "white", endedAt = fake_time },
    fake_time
  )
  local history = storage[storage_key("user-a", "carrom_history", "match-replay:user-a")]
  local replay = history.value.replay
  assert_equal(replay.variant, "freestyle", "the game type")
  assert_equal(#replay.shots, 1, "one shot was kept")
  assert_equal(replay.shots[1].position, 0.5, "the striker position")
  assert_equal(replay.shots[1].striker, "heavy", "the striker skin")
  assert_equal(replay.seats[1], "white", "the first seat")
end)

if failures > 0 then
  print(failures .. " carrom profile test(s) failed")
  os.exit(1)
end

print("carrom profile ok")
