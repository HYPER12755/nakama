-- MoonGames Chess openings: the tree of the openings people play here.
--
-- The book is made from the games that were played on this platform, the
-- same way lichess makes its explorer from the games that were played
-- there. The moves are written the way a player writes them, so the same
-- game gives the same branch for everybody, and the tree is the tree of
-- the moves rather than of the positions: two games that reach the same
-- position by different moves are two branches, as they are on lichess.
--
-- The book is read from the history of every game, so it is built again
-- when it is older than a minute and it keeps up with the games that are
-- being played now.

local nk = require("nakama")

local opening = {}

opening.HISTORY_COLLECTION = "chess_history"
opening.SCAN_LIMIT = 100
-- How deep the tree goes. Lichess lets the explorer go as deep as the
-- games do; twelve moves is as deep as a game usually goes.
opening.MAX_DEPTH = 12
-- How many games are named behind a position.
opening.MAX_GAMES = 25
-- How long the book is kept before it is read again.
opening.BOOK_LIFETIME_MS = 60000

local book = nil
local book_built_at = 0

--- The moves of a game, in the way a player writes them.
--
-- The older games kept only their PGN, so the moves are read out of it.
local function moves_of(record)
  local steps = record.steps
  if type(steps) == "table" and #steps > 0 then
    local moves = {}
    for index, san in ipairs(steps) do
      if type(san) ~= "string" or san == "" then
        return nil
      end
      moves[index] = san
    end
    return moves
  end

  local pgn = record.pgn
  if type(pgn) ~= "string" or pgn == "" then
    return nil
  end

  local moves = {}
  for word in pgn:gmatch("[^%s]+") do
    local clean = word:gsub("%.$", "")
    if clean == "" then
      -- an empty word, nothing to keep
    elseif clean:match("^%d+$") or clean == "..." then
      -- the number of the move
    elseif
      clean == "1-0"
      or clean == "0-1"
      or clean == "1/2-1/2"
      or clean == "*"
    then
      -- how the game ended
    else
      moves[#moves + 1] = clean
    end
  end

  if #moves == 0 then
    return nil
  end
  return moves
end

--- How the game ended, in the way a score sheet writes it.
local function result_of(record)
  if record.winnerColor == "w" then
    return "1-0"
  end
  if record.winnerColor == "b" then
    return "0-1"
  end
  if record.status == "draw" or record.status == "stalemate" then
    return "1/2-1/2"
  end
  return "*"
end

--- Every game the server knows about, newest first.
local function each_game(visit)
  local cursor = ""
  while true do
    -- The cursor of the next page comes back beside the objects.
    local ok, objects, next_cursor = pcall(
      nk.storage_list,
      "",
      opening.HISTORY_COLLECTION,
      opening.SCAN_LIMIT,
      cursor
    )
    if not ok or type(objects) ~= "table" then
      return false
    end
    if #objects == 0 then
      return true
    end

    for _, object in ipairs(objects) do
      if type(object.value) == "table" then
        visit(object.value)
      end
    end

    if
      type(next_cursor) ~= "string"
      or next_cursor == ""
      or next_cursor == cursor
    then
      return true
    end
    cursor = next_cursor
  end
end

--- The games, one for each game and not one for each player.
local function collect_games()
  local games = {}
  local order = {}

  each_game(function(record)
    local match_id = record.matchId
    if type(match_id) == "string" and match_id ~= "" then
      local game = games[match_id]
      if game == nil then
        game = {
          matchId = match_id,
          moves = moves_of(record),
          result = result_of(record),
          mode = record.mode or "quick",
          endedAt = tonumber(record.endedAt) or 0,
          moveCount = tonumber(record.moves) or 0,
        }
        games[match_id] = game
        order[#order + 1] = match_id
      elseif game.moves == nil then
        game.moves = moves_of(record)
      end

      -- The record of a player holds the name of the other player. The two
      -- records of a game together hold both names.
      local opponent = record.opponent and record.opponent.username
      local owner = record.username
      if record.color == "w" then
        game.white = game.white or owner
        game.black = game.black or opponent
      elseif record.color == "b" then
        game.black = game.black or owner
        game.white = game.white or opponent
      end
    end
  end)

  table.sort(order, function(left, right)
    local first = games[left]
    local second = games[right]
    if first.endedAt == second.endedAt then
      return left < right
    end
    return first.endedAt > second.endedAt
  end)

  return games, order
end

--- A branch of the tree: the games that came through it, and the moves
--- that were played from it.
local function new_branch()
  return { count = 0, children = {}, games = {} }
end

--- Put a game into the tree.
local function add_game(tree, game, moves)
  local node = tree
  local depth = math.min(#moves, opening.MAX_DEPTH)
  for index = 1, depth do
    local san = moves[index]
    local child = node.children[san]
    if child == nil then
      child = new_branch()
      node.children[san] = child
    end
    child.count = child.count + 1
    if #child.games < opening.MAX_GAMES then
      child.games[#child.games + 1] = game
    end
    node = child
  end
end

--- The tree of the openings, read from the games if it is time.
function opening.book()
  local now = nk.time()
  if book ~= nil and (now - book_built_at) < opening.BOOK_LIFETIME_MS then
    return book
  end

  local games, order = collect_games()
  local tree = new_branch()
  for _, match_id in ipairs(order) do
    local game = games[match_id]
    local moves = game.moves
    if moves ~= nil and #moves > 0 then
      tree.count = tree.count + 1
      if #tree.games < opening.MAX_GAMES then
        tree.games[#tree.games + 1] = game
      end
      add_game(tree, game, moves)
    end
  end

  book = tree
  book_built_at = now
  return book
end

--- The games behind a position, ready to be shown.
local function games_of(node)
  local result = {}
  for _, game in ipairs(node.games) do
    result[#result + 1] = {
      matchId = game.matchId,
      white = game.white or "Player",
      black = game.black or "Player",
      result = game.result,
      mode = game.mode,
      moves = game.moveCount,
      endedAt = game.endedAt,
    }
  end
  return result
end

--- The openings played from a place in the tree.
--
-- The path is the list of the moves that lead to the place, starting with
-- the first move of the game.
function opening.explorer(path)
  local tree = opening.book()
  local node = tree
  local walked = {}

  if path ~= nil then
    if type(path) ~= "table" then
      return {
        ok = false,
        error = {
          code = "invalid_payload",
          message = "the path is not written properly",
        },
      }
    end

    for _, san in ipairs(path) do
      if type(san) ~= "string" then
        return {
          ok = false,
          error = {
            code = "invalid_payload",
            message = "the path is not written properly",
          },
        }
      end
      local child = node.children[san]
      if child == nil then
        return {
          ok = false,
          error = {
            code = "unknown_opening",
            message = "no game here played " .. san,
          },
        }
      end
      node = child
      walked[#walked + 1] = san
    end
  end

  -- The moves that were played from here, the ones played most often first.
  local moves = {}
  for san, child in pairs(node.children) do
    moves[#moves + 1] = { san = san, count = child.count }
  end
  table.sort(moves, function(left, right)
    if left.count == right.count then
      return left.san < right.san
    end
    return left.count > right.count
  end)

  return {
    ok = true,
    path = walked,
    total = node.count,
    moves = moves,
    games = games_of(node),
  }
end

--- Forget the book, so the next reader reads it again.
function opening.forget()
  book = nil
  book_built_at = 0
end

return opening
