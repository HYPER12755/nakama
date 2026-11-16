-- Tests for the puzzles: the positions to solve, and the record of a player.

local script_path = arg[0] or "Chess/server/test/chess_puzzle_test.lua"
local script_dir = script_path:match("^(.*)[/\\]") or "."
local server_dir = script_dir .. "/.."
package.path = server_dir .. "/?.lua;" .. package.path

local fake_time = 1700000000000
local storage = {}

package.preload["nakama"] = function()
  return {
    time = function()
      return fake_time
    end,
    register_rpc = function() end,
    logger_error = function() end,
    storage_read = function(objects)
      local result = {}
      for _, object in ipairs(objects) do
        local key = table.concat({
          object.user_id or "",
          object.collection,
          object.key,
        }, "|")
        local record = storage[key]
        if record then
          result[#result + 1] = {
            collection = object.collection,
            key = object.key,
            user_id = record.user_id,
            value = record.value,
            version = record.version,
          }
        end
      end
      return result
    end,
    storage_write = function(writes)
      local acks = {}
      for _, write in ipairs(writes) do
        local key = table.concat({
          write.user_id or "",
          write.collection,
          write.key,
        }, "|")
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
          value = write.value,
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
    storage_list = function(user_id, collection, limit, cursor)
      local objects = {}
      for key, record in pairs(storage) do
        if record.collection == collection then
          objects[#objects + 1] = {
            key = record.key,
            user_id = record.user_id,
            value = record.value,
          }
        end
      end
      table.sort(objects, function(left, right)
        return left.key < right.key
      end)
      local page = {}
      for index = 1, math.min(limit, #objects) do
        page[#page + 1] = objects[index]
      end
      return page, nil
    end,
  }
end

local puzzle = require("chess_puzzle")

local function reset()
  storage = {}
  fake_time = 1700000000000
end

local function put(collection, key, value, user_id)
  storage[table.concat({ user_id or "", collection, key }, "|")] = {
    collection = collection,
    key = key,
    user_id = user_id,
    version = "1",
    value = value,
  }
end

local function context(user_id)
  return { user_id = user_id, username = "Player" }
end

local function ok(condition, message)
  if not condition then
    error(message, 0)
  end
end

local GAME = { "e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6" }

-- The positions of a game are the positions the game was played through.
reset()
local positions = puzzle.positions(GAME, nil)
ok(positions ~= nil, "the positions of a game are found")
ok(#positions == 8, "there is a position for every move")
ok(positions[1].fen:match("^rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"), "the first position is the start")
ok(positions[1].uci == "e2e4", "the first move is the engine's way")
ok(positions[2].fen:match("4P3"), "the second position is after e4")
ok(positions[3].fen:match("4p3"), "the third position is after e5")

-- A game that cannot be played is refused.
local broken = puzzle.positions({ "e4", "Qxh5" }, nil)
ok(broken == nil, "a game that cannot be played is refused")

-- A puzzle is kept when its position is in the game and its answer can be
-- played, and refused otherwise.
reset()
put("chess_history", "history-other", {
  matchId = "game-other",
  steps = GAME,
  endedAt = 100,
}, "player-2")
local saved = puzzle.save(context("player"), {
  gameId = "game-1",
  steps = GAME,
  puzzles = {
    { fen = positions[4].fen, solution = positions[4].uci, loss = 0.4, cp = 120, ply = 4 },
    { fen = "not a position", solution = "e2e4", loss = 0.5, ply = 1 },
    { fen = positions[6].fen, solution = "a1a8", loss = 0.3, ply = 6 },
  },
})
ok(saved.ok, "the puzzles are kept")
ok(saved.kept == 1, "only the puzzle that is true is kept")
ok(saved.refused == 2, "the others are refused")

-- The puzzle is offered to a player, and the biggest mistake first.
local next_result = puzzle.next(context("player"))
ok(next_result.ok, "a puzzle is offered")
ok(next_result.puzzle ~= nil, "the puzzle is there")
ok(next_result.puzzle.fen == positions[4].fen, "the puzzle is the position kept")
ok(next_result.puzzle.solutionSan ~= nil, "the answer is written the way a player writes it")

-- The right answer solves the puzzle and lengthens the streak.
local answer = puzzle.answer(context("player"), {
  id = next_result.puzzle.id,
  move = next_result.puzzle.solution,
})
ok(answer.ok, "the answer is taken")
ok(answer.solved, "the right answer solves the puzzle")
ok(answer.streak == 1, "the streak is one")

-- The same puzzle is not given again.
local again = puzzle.next(context("player"))
ok(again.puzzle == nil, "the solved puzzle is not given again")
ok(again.streak == 1, "the streak is kept")
ok(again.game ~= nil, "a game is named to make more puzzles")
ok(again.game.gameId == "game-other", "the game that was made into puzzles is not named again")

-- A wrong answer ends the streak.
reset()
put("chess_puzzles", "p-test", {
  id = "p-test",
  fen = positions[4].fen,
  solution = positions[4].uci,
  solutionSan = positions[4].san,
  loss = 0.4,
  cp = 0,
  ply = 4,
  game = "game-1",
})
local wrong = puzzle.answer(context("player"), { id = "p-test", move = "a1a1" })
ok(wrong.ok, "the answer is taken")
ok(not wrong.solved, "the wrong answer does not solve the puzzle")
ok(wrong.streak == 0, "the wrong answer ends the streak")

-- The record of a player is kept.
local progress = puzzle.progress(context("player"))
ok(progress.ok, "the record is read")
ok(progress.played == 1, "the attempt is counted")
ok(progress.solved == 0, "nothing is solved yet")

-- A game that has not been made into puzzles yet is named.
reset()
put("chess_history", "history-1", {
  matchId = "game-long",
  steps = GAME,
  endedAt = 500,
}, "player-1")
put("chess_history", "history-2", {
  matchId = "game-short",
  steps = { "e4" },
  endedAt = 900,
}, "player-1")
local game = puzzle.game_to_mine()
ok(game ~= nil, "a game is named")
ok(game.gameId == "game-long", "the game with enough moves is named")
ok(game.steps ~= nil and #game.steps == 8, "the moves of the game are given")

-- A puzzle must be named to be answered.
local unknown = puzzle.answer(context("player"), { id = "p-nothing", move = "e2e4" })
ok(unknown.ok == false, "a puzzle that is not there is refused")
ok(unknown.error.code == "unknown_puzzle", "with the right reason")

print("chess puzzle ok")
