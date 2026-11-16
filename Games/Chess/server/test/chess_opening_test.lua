-- Tests for the openings: the tree made from the games played here.

local script_path = arg[0] or "Chess/server/test/chess_opening_test.lua"
local script_dir = script_path:match("^(.*)[/\\]") or "."
local server_dir = script_dir .. "/.."
package.path = server_dir .. "/?.lua;" .. package.path

local fake_time = 1700000000000
local records = {}
local page_size = 2

package.preload["nakama"] = function()
  return {
    time = function()
      return fake_time
    end,
    register_rpc = function() end,
    logger_error = function() end,
    storage_list = function(user_id, collection, limit, cursor)
      local objects = {}
      for _, record in ipairs(records) do
        if user_id == "" and collection == "chess_history" then
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

      local start = 1
      if cursor ~= "" and cursor ~= nil then
        start = tonumber(cursor) or 1
      end
      local page = {}
      for index = start, math.min(start + page_size - 1, #objects) do
        page[#page + 1] = objects[index]
      end
      local next_cursor = nil
      if start + page_size <= #objects then
        next_cursor = tostring(start + page_size)
      end
      return page, next_cursor
    end,
  }
end

local opening = require("chess_opening")

local function reset()
  records = {}
  fake_time = 1700000000000
  opening.forget()
end

local function add_record(key, user_id, value)
  records[#records + 1] = { key = key, user_id = user_id, value = value }
end

local function game(match_id, color, username, opponent, steps, pgn, ended_at)
  return {
    matchId = match_id,
    color = color,
    username = username,
    opponent = { username = opponent },
    steps = steps,
    pgn = pgn,
    moves = #(steps or {}),
    endedAt = ended_at or 100,
    winnerColor = "w",
    status = "checkmate",
  }
end

local function ok(condition, message)
  if not condition then
    error(message, 0)
  end
end

local function count_of(moves, san)
  for _, move in ipairs(moves) do
    if move.san == san then
      return move.count
    end
  end
  return 0
end

-- A game is counted once, though each player has a record of it.
reset()
add_record("game|white", "white-id", game(
  "game", "w", "Alice", "Bob", { "e4", "e5", "Nf3" }, nil, 300
))
add_record("game|black", "black-id", game(
  "game", "b", "Bob", "Alice", { "e4", "e5", "Nf3" }, nil, 300
))

local root = opening.explorer({})
ok(root.ok, "the explorer answers")
ok(root.total == 1, "a game with two records is counted once")
ok(root.path and #root.path == 0, "the root has no path")
ok(count_of(root.moves, "e4") == 1, "the first move is in the tree")
ok(root.moves[1].san == "e4", "the tree begins with the first move")

local after_e4 = opening.explorer({ "e4" })
ok(after_e4.total == 1, "the branch after e4 holds the game")
ok(count_of(after_e4.moves, "e5") == 1, "the reply is in the tree")
ok(after_e4.path and after_e4.path[1] == "e4", "the path is given back")

local after_nf3 = opening.explorer({ "e4", "e5", "Nf3" })
ok(after_nf3.total == 1, "the branch after Nf3 holds the game")
ok(#after_nf3.moves == 0, "a leaf has no moves")

local unknown = opening.explorer({ "d4" })
ok(unknown.ok == false, "a move nobody played is refused")
ok(unknown.error and unknown.error.code == "unknown_opening", "with the right reason")

-- The games behind a place are named, with both players.
ok(#root.games == 1, "the game is named")
ok(root.games[1].white == "Alice", "the white player is named")
ok(root.games[1].black == "Bob", "the black player is named")
ok(root.games[1].result == "1-0", "the result is written on a score sheet")

-- The older games kept only their PGN, and they count too.
reset()
add_record("pgn|white", "white-id", game(
  "pgn", "w", "Alice", "Bob", nil, "1. d4 d5 2. c4 e6", 400
))
local from_pgn = opening.explorer({})
ok(from_pgn.total == 1, "a game written as a PGN is counted")
ok(count_of(from_pgn.moves, "d4") == 1, "the PGN's first move is in the tree")
local second = opening.explorer({ "d4", "d5" })
ok(count_of(second.moves, "c4") == 1, "the PGN's third move is in the tree")

-- The most played move comes first, and the pages are all read.
reset()
for index = 1, 5 do
  add_record("e" .. index, "user" .. index, game(
    "e" .. index, "w", "Player" .. index, "Other",
    { "e4", "e5" }, nil, index
  ))
end
for index = 1, 2 do
  add_record("d" .. index, "user" .. index, game(
    "d" .. index, "w", "Player" .. index, "Other",
    { "d4" }, nil, index
  ))
end
local popular = opening.explorer({})
ok(popular.total == 7, "every page of the history is read")
ok(popular.moves[1].san == "e4", "the most played move comes first")
ok(popular.moves[1].count == 5, "the most played move's count is right")

-- The book is kept for a minute, then read again.
add_record("after", "user", game("after", "w", "A", "B", { "Nf3" }, nil, 9))
local cached = opening.explorer({})
ok(cached.total == 7, "the book is kept while it is fresh")
fake_time = fake_time + 61000
local fresh = opening.explorer({})
ok(fresh.total == 8, "the book is read again when it is old")

print("chess opening ok")
