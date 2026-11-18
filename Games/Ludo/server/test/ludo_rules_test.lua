-- Tests for the authoritative Ludo rules. The vectors come from the
-- TypeScript core so the client and the server resolve the same game.

local script_path = arg[0] or "Ludo/server/test/ludo_rules_test.lua"
local script_dir = script_path:match("^(.*)[/\\]") or "."
local server_dir = script_dir .. "/.."
local tests_dir = script_dir .. "/../../../Ludo/tests"

package.path = server_dir .. "/?.lua;" .. script_dir .. "/?.lua;" .. package.path

local rules = require("ludo_rules")
local json = require("json")

local file = io.open(tests_dir .. "/vectors.json", "r")
assert(file, "cannot read Ludo parity vectors")
local vectors = json.decode(file:read("*a"))
file:close()

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

test("dice sequences match the TypeScript core", function()
  for _, curve in ipairs(vectors.rolls) do
    local seed = curve.seed
    for _, expected in ipairs(curve.rolls) do
      local roll = rules.roll_from_seed(seed)
      assert_equal(roll.value, expected, "roll from " .. tostring(seed))
      seed = roll.seed
    end
    assert_equal(seed, curve.finalSeed, "final seed")
  end
end)

test("legal moves match the TypeScript core", function()
  for _, vector in ipairs(vectors.legalMoves) do
    local game = rules.create_game({ seed = 99 })
    game.current = vector.current
    game.dice = vector.dice
    game.phase = "move"
    for _, placed in ipairs(vector.tokens) do
      local token = rules.player_at(game, placed.seat).tokens[placed.token + 1]
      token.progress = placed.progress
      token.location = placed.progress >= 56 and "finished"
        or (placed.progress >= 51 and "column" or "track")
      if placed.progress >= 56 then
        rules.player_at(game, placed.seat).finished = rules.player_at(game, placed.seat).finished + 1
      end
    end
    local moves = rules.legal_moves(game)
    assert_equal(#moves, #vector.expected, vector.name)
    for _, expected in ipairs(vector.expected) do
      local found = nil
      for _, move in ipairs(moves) do
        if move.token == expected.token then
          found = move
        end
      end
      assert_equal(found ~= nil, true, vector.name .. " has token " .. expected.token)
      assert_equal(found.to, expected.to, vector.name .. " destination")
      assert_equal(found.leavesHome, expected.leavesHome, vector.name .. " leaves home")
      assert_equal(#found.captures, expected.captures, vector.name .. " captures")
      if expected.finishes ~= nil then
        assert_equal(found.finishes, expected.finishes, vector.name .. " finishes")
      end
    end
  end
end)

test("plays the same reference game as the TypeScript core", function()
  local game = rules.create_game({ seed = vectors.game.seed, playerCount = 4 })
  local index = 0
  while game.phase ~= "over" and index < vectors.game.count do
    if game.phase == "roll" then
      local before = game.current
      local value = rules.roll_dice(game)
      if game.phase == "move" then
        local expected = vectors.game.decisions[index + 1]
        if expected then
          assert_equal(before, expected[1], "decision seat " .. index)
          assert_equal(value, expected[2], "decision roll " .. index)
        end
        local moves = rules.legal_moves(game)
        local token = moves[1] and moves[1].token or nil
        if expected then
          assert_equal(token or -1, expected[3], "decision token " .. index)
        end
        if token == nil then
          rules.pass_turn(game)
        else
          rules.apply_move(game, token)
        end
        index = index + 1
      end
    end
  end
  assert_equal(index, vectors.game.count, "decision count")
  assert_equal(game.winner, vectors.game.winner, "winner")
  for seat, finished in ipairs(vectors.game.finished) do
    assert_equal(game.players[seat].finished, finished, "finished " .. seat)
  end

  local recorded = rules.record_replay(game)
  for i, expected in ipairs(vectors.game.replay) do
    assert_equal(recorded[i].roll, expected.roll, "replay roll " .. i)
    assert_equal(recorded[i].seed, expected.seed, "replay seed " .. i)
    assert_equal(recorded[i].token or -1, expected.token, "replay token " .. i)
  end
end)

test("captures send a token home and earn an extra roll", function()
  local game = rules.create_game({ seed = 7 })
  local red = game.players[1].tokens[1]
  red.location = "track"
  red.progress = 5
  local green = game.players[2].tokens[1]
  green.location = "track"
  green.progress = 40
  game.current = 1
  game.dice = 4
  game.phase = "move"
  local result = rules.apply_move(game, 0)
  assert_equal(red.location, "home", "captured token location")
  assert_equal(red.progress, -1, "captured token progress")
  assert_equal(result.extra, true, "extra roll")
  assert_equal(game.current, 1, "keeps the turn")
end)

test("safe squares cannot be captured on", function()
  local game = rules.create_game({ seed = 7 })
  local red = game.players[1].tokens[1]
  red.location = "track"
  red.progress = 8
  local green = game.players[2].tokens[1]
  green.location = "track"
  green.progress = 41
  game.current = 1
  game.dice = 6
  game.phase = "move"
  local move = rules.legal_moves(game)[1]
  assert_equal(#move.captures, 0, "no capture on a star")
  rules.apply_move(game, 0)
  assert_equal(red.location, "track", "red stays on the board")
end)

test("three sixes forfeit the turn", function()
  local seed = 1
  while rules.roll_from_seed(seed).value ~= 6 do
    seed = seed + 1
  end
  local game = rules.create_game({ seed = seed })
  game.sixStreak = 2
  rules.roll_dice(game)
  assert_equal(game.current, 1, "next seat")
  assert_equal(game.phase, "roll", "roll phase")
  assert_equal(game.dice, nil, "dice cleared")
end)

if failures > 0 then
  io.stderr:write(failures .. " Ludo rules test(s) failed\n")
  os.exit(1)
end
print("all Ludo rules tests passed")
