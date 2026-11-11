-- Tests for Chess progression: Elo, profiles, history, and leaderboards.

local script_path = arg[0] or "Chess/server/test/chess_profile_test.lua"
local script_dir = script_path:match("^(.*)[/\\]") or "."
local server_dir = script_dir .. "/.."

package.path = server_dir .. "/?.lua;" .. package.path

local fake_time = 1700000000000
local storage = {}
local leaderboards = {}
local fake_nk

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

local function reset()
  fake_time = 1700000000000
  for key in pairs(storage) do
    storage[key] = nil
  end
  for key in pairs(leaderboards) do
    leaderboards[key] = nil
  end
end

local function exposed_record(user_id, collection, key)
  return storage[storage_key(user_id, collection, key)]
end

fake_nk = {
  time = function()
    return fake_time
  end,
  logger_warn = function() end,
  logger_error = function() end,
  storage_read = function(objects)
    local result = {}
    for _, object in ipairs(objects) do
      local record = exposed_record(object.user_id, object.collection, object.key)
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
    local acks = {}
    for _, write in ipairs(writes) do
      local key = storage_key(write.user_id, write.collection, write.key)
      local current = storage[key]
      if write.version and (not current or current.version ~= write.version) then
        error("storage version conflict")
      end
      local version = tostring((tonumber(current and current.version) or 0) + 1)
      storage[key] = {
        collection = write.collection,
        key = write.key,
        user_id = write.user_id,
        version = version,
        value = copy(write.value),
      }
      acks[#acks + 1] = {
        collection = write.collection,
        key = write.key,
        user_id = write.user_id,
        version = version,
      }
    end
    return acks
  end,
  storage_list = function(user_id, collection, limit, cursor, caller)
    local result = {}
    for _, record in pairs(storage) do
      if record.user_id == user_id and record.collection == collection then
        result[#result + 1] = copy(record)
        result[#result].value = copy(record.value)
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
  leaderboard_create = function(id, authoritative, sort_order, operator, reset_schedule, metadata, enable_ranks)
    if not leaderboards[id] then
      leaderboards[id] = {
        authoritative = authoritative,
        sort_order = sort_order,
        operator = operator,
        metadata = copy(metadata),
        records = {},
      }
    end
  end,
  leaderboard_record_write = function(id, owner_id, username, score, subscore, metadata, override_operator)
    local leaderboard = leaderboards[id]
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
  leaderboard_records_list = function(id, owner_ids, limit, cursor, expiry)
    local leaderboard = leaderboards[id]
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
      record.leaderboard_id = id
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
}

package.preload["nakama"] = function()
  return fake_nk
end

local rules = require("chess_rules")
local progression = require("chess_profile")

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

local function assert_near(actual, expected, tolerance, message)
  if math.abs(actual - expected) > (tolerance or 0.0001) then
    error(
      (message or "assert_near")
        .. ": expected "
        .. tostring(expected)
        .. ", got "
        .. tostring(actual),
      2
    )
  end
end

local function new_state(options)
  options = options or {}
  local state = {
    game = rules.new(),
    players = {
      u1 = {
        user_id = "u1",
        username = "Alice",
        color = "w",
        connected = true,
      },
      u2 = {
        user_id = "u2",
        username = "Bob",
        color = "b",
        connected = true,
      },
    },
    player_order = { "u1", "u2" },
    mode = options.mode or "quick",
    rated = options.rated == true,
    time_control = {
      initial_ms = 300000,
      increment_ms = 0,
    },
  }

  state.game:move(rules.parse_action({ from = "e2", to = "e4" }))
  state.game:move(rules.parse_action({ from = "e7", to = "e5" }))
  return state
end

local function result_for(status, winner, reason)
  return {
    status = status,
    winnerColor = winner,
    winnerUserId = winner == "w" and "u1" or winner == "b" and "u2" or nil,
    reason = reason or status,
    endedAt = fake_time,
  }
end

test("expected score and Elo deltas are correct", function()
  assert_near(progression.expected_score(1200, 1200), 0.5)
  assert_near(progression.expected_score(1600, 1200), 0.90909, 0.0001)
  assert_equal(progression.rating_delta(1200, 1200, "win"), 16)
  assert_equal(progression.rating_delta(1200, 1200, "loss"), -16)
  assert_equal(progression.rating_delta(1200, 1200, "draw"), 0)
  assert_equal(progression.rating_delta(1600, 1200, "win"), 3)
  assert_equal(progression.rating_delta(1200, 1600, "win"), 29)
end)

test("result outcomes map to per-color results", function()
  local win = result_for("resign", "b")
  assert_equal(progression.outcome_for_color(win, "w"), "loss")
  assert_equal(progression.outcome_for_color(win, "b"), "win")

  local draw = result_for("draw")
  assert_equal(progression.outcome_for_color(draw, "w"), "draw")
  assert_equal(progression.outcome_for_color(draw, "b"), "draw")

  local stalemate = result_for("stalemate")
  assert_equal(progression.outcome_for_color(stalemate, "w"), "draw")

  local abandoned = result_for("abandoned")
  assert_equal(progression.outcome_for_color(abandoned, "w"), "abandoned")
end)

test("a rated resignation persists ratings, stats, history, and leaderboard", function()
  reset()
  local state = new_state({ mode = "quick", rated = true })
  local result = result_for("resign", "b")

  local ok, finalize_error = progression.finalize_match(
    { match_id = "match-rated" },
    state,
    result,
    fake_time
  )
  assert_truthy(ok, finalize_error)

  local alice = exposed_record("u1", progression.PROFILE_COLLECTION, "profile")
  local bob = exposed_record("u2", progression.PROFILE_COLLECTION, "profile")
  assert_truthy(alice)
  assert_truthy(bob)
  assert_equal(alice.value.rating, 1184)
  assert_equal(alice.value.games, 1)
  assert_equal(alice.value.losses, 1)
  assert_equal(alice.value.ratedGames, 1)
  assert_equal(bob.value.rating, 1216)
  assert_equal(bob.value.wins, 1)
  assert_equal(bob.value.peakRating, 1216)

  local history = exposed_record(
    "u1",
    progression.HISTORY_COLLECTION,
    "match-rated"
  )
  assert_truthy(history)
  assert_equal(history.value.outcome, "loss")
  assert_equal(history.value.opponent.username, "Bob")
  assert_equal(history.value.moves, 2)
  assert_equal(history.value.sans[1], "e4")
  assert_equal(history.value.sans[2], "e5")
  assert_equal(history.value.pgn, "1. e4 e5")
  assert_equal(history.value.ratingBefore, 1200)
  assert_equal(history.value.ratingAfter, 1184)
  assert_equal(history.value.ratingDelta, -16)

  local leaderboard = leaderboards[progression.LEADERBOARD_ID]
  assert_truthy(leaderboard)
  assert_equal(leaderboard.records.u1.score, 1184)
  assert_equal(leaderboard.records.u2.score, 1216)
  assert_equal(leaderboard.records.u2.username, "Bob")
  assert_equal(leaderboard.records.u2.metadata.wins, 1)

  local repeated_ok = progression.finalize_match(
    { match_id = "match-rated" },
    state,
    result,
    fake_time
  )
  assert_truthy(repeated_ok)

  local alice_again = exposed_record(
    "u1",
    progression.PROFILE_COLLECTION,
    "profile"
  )
  assert_equal(alice_again.version, alice.version)
  assert_equal(alice_again.value.games, 1)
  assert_equal(alice_again.value.losses, 1)
  assert_equal(leaderboard.records.u1.score, 1184)
end)

test("an unrated draw updates stats but not rating", function()
  reset()
  local state = new_state({ mode = "private", rated = false })
  local result = result_for("draw", nil, "agreement")

  local ok = progression.finalize_match(
    { match_id = "match-casual" },
    state,
    result,
    fake_time
  )
  assert_truthy(ok)

  local alice = exposed_record("u1", progression.PROFILE_COLLECTION, "profile")
  local bob = exposed_record("u2", progression.PROFILE_COLLECTION, "profile")
  assert_equal(alice.value.rating, 1200)
  assert_equal(alice.value.draws, 1)
  assert_equal(alice.value.games, 1)
  assert_equal(alice.value.casualGames, 1)
  assert_equal(alice.value.ratedGames, 0)
  assert_equal(bob.value.draws, 1)

  local history = exposed_record(
    "u2",
    progression.HISTORY_COLLECTION,
    "match-casual"
  )
  assert_equal(history.value.rated, false)
  assert_equal(history.value.outcome, "draw")
  assert_equal(history.value.ratingDelta, 0)
  assert_nil(leaderboards[progression.LEADERBOARD_ID])
end)

test("an abandoned match writes history without changing stats", function()
  reset()
  local state = new_state({ mode = "quick", rated = true })
  local result = result_for("abandoned", nil, "both players disconnected")

  local ok = progression.finalize_match(
    { match_id = "match-abandoned" },
    state,
    result,
    fake_time
  )
  assert_truthy(ok)

  local alice = exposed_record("u1", progression.PROFILE_COLLECTION, "profile")
  assert_truthy(alice)
  assert_equal(alice.value.rating, 1200)
  assert_equal(alice.value.games, 0)
  assert_equal(alice.value.wins, 0)
  assert_equal(alice.value.losses, 0)
  assert_equal(alice.value.draws, 0)

  local history = exposed_record(
    "u1",
    progression.HISTORY_COLLECTION,
    "match-abandoned"
  )
  assert_truthy(history)
  assert_equal(history.value.outcome, "abandoned")
  assert_nil(leaderboards[progression.LEADERBOARD_ID])
end)

test("profile payload returns defaults, stats, and newest history first", function()
  reset()

  local empty = progression.profile_payload({
    user_id = "u9",
    username = "New Player",
  })
  assert_equal(empty.ok, true)
  assert_equal(empty.profile.username, "New Player")
  assert_equal(empty.profile.rating, 1200)
  assert_equal(empty.profile.games, 0)
  assert_equal(#empty.history, 0)

  fake_time = 1700000001000
  local first_state = new_state({ rated = true })
  progression.finalize_match(
    { match_id = "old-match" },
    first_state,
    result_for("resign", "b"),
    1700000001000
  )

  fake_time = 1700000005000
  local second_state = new_state({ rated = true })
  progression.finalize_match(
    { match_id = "new-match" },
    second_state,
    result_for("draw", nil, "agreement"),
    1700000005000
  )

  local payload = progression.profile_payload({
    user_id = "u1",
    username = "Alice",
  })
  assert_equal(payload.ok, true)
  assert_equal(payload.profile.games, 2)
  assert_equal(payload.profile.losses, 1)
  assert_equal(payload.profile.draws, 1)
  assert_equal(#payload.history, 2)
  assert_equal(payload.history[1].matchId, "new-match")
  assert_equal(payload.history[2].matchId, "old-match")
end)

test("leaderboard payload returns ranked entries and the caller's record", function()
  reset()
  local state = new_state({ rated = true })
  progression.finalize_match(
    { match_id = "leaderboard-match" },
    state,
    result_for("resign", "b"),
    fake_time
  )

  local payload = progression.leaderboard_payload(
    { user_id = "u1" },
    { limit = 5 }
  )
  assert_equal(payload.ok, true)
  assert_equal(#payload.entries, 2)
  assert_equal(payload.entries[1].username, "Bob")
  assert_equal(payload.entries[1].rating, 1216)
  assert_equal(payload.entries[1].rank, 1)
  assert_equal(payload.entries[2].username, "Alice")
  assert_equal(payload.entries[2].rating, 1184)

  assert_truthy(payload.me)
  assert_equal(payload.me.userId, "u1")
  assert_equal(payload.me.rating, 1184)
  assert_equal(payload.me.rank, 2)
end)

test("leaderboard payload does not invent a record for new players", function()
  reset()
  local state = new_state({ rated = true })
  progression.finalize_match(
    { match_id = "leaderboard-existing" },
    state,
    result_for("resign", "b"),
    fake_time
  )

  local payload = progression.leaderboard_payload(
    { user_id = "u9" },
    { limit = 5 }
  )
  assert_equal(payload.ok, true)
  assert_equal(#payload.entries, 2)
  assert_nil(payload.me)
end)

print("")
print(string.format("%d/%d tests passed", tests_passed, tests_run))

if tests_failed > 0 then
  os.exit(1)
end
