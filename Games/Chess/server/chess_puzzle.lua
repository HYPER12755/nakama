-- MoonGames Chess puzzles: positions to solve.
--
-- The puzzles are made from the games that were played here. The engine
-- looks at a game and the moves where a player gave away the most become
-- puzzles: the position before the mistake, and the move that should have
-- been played there. The puzzles are the same for everybody, and each
-- player keeps their own record of the ones they have solved.
--
-- The server does not take a puzzle on trust. The position must be one of
-- the positions of the game the puzzle says it comes from, and the answer
-- must be a legal move in that position. The game is played out again
-- with the rules of the server for that, the same way a game brought from
-- somewhere else is played out before it is kept.

local nk = require("nakama")
local rules = require("chess_rules")
local progression = require("chess_profile")

local puzzle = {}

puzzle.PUZZLE_COLLECTION = "chess_puzzles"
puzzle.PROGRESS_COLLECTION = "chess_puzzle_progress"
puzzle.PROGRESS_KEY = "progress"

-- The most a move may give away and still be a puzzle.
puzzle.LOSS_THRESHOLD = 0.2
-- How many puzzles are taken from one game.
puzzle.MAX_PER_GAME = 5
-- The fewest moves a game must have for a puzzle to come of it.
puzzle.MIN_MOVES = 8
-- How many objects are read at a time.
puzzle.SCAN_LIMIT = 100

local function error_payload(code, message)
  return {
    ok = false,
    error = {
      code = code,
      message = message,
    },
  }
end

local function number(value, fallback)
  local parsed = tonumber(value)
  if parsed == nil then
    return fallback
  end
  return parsed
end

--- The name of a puzzle, so the same position is the same puzzle.
function puzzle.id_for(fen)
  return "p" .. progression.hash_key(fen)
end

--- Play a move that is written the way the engine writes it.
local function play_uci(game, uci)
  if type(uci) ~= "string" or #uci < 4 then
    return nil
  end
  local promotion = uci:sub(5, 5)
  if
    promotion ~= ""
    and promotion ~= "n"
    and promotion ~= "b"
    and promotion ~= "r"
    and promotion ~= "q"
  then
    return nil
  end
  return game:move({
    from = uci:sub(1, 2),
    to = uci:sub(3, 4),
    promotion = promotion ~= "" and promotion or nil,
  })
end

--- The positions of a game, played out again with the rules of the server.
--
-- Every position is given with the move that was played from it.
function puzzle.positions(steps, initial_fen)
  if type(steps) ~= "table" or #steps == 0 then
    return nil, "the game has no moves"
  end

  local game = rules.new(initial_fen or rules.DEFAULT_FEN)
  local positions = {}

  for index, san in ipairs(steps) do
    if type(san) ~= "string" then
      return nil, "a move is not written properly"
    end
    local fen = game:fen()
    local move = game:move_san(san)
    if not move then
      return nil, "the game cannot be played"
    end
    positions[#positions + 1] = {
      ply = index - 1,
      fen = fen,
      uci = move.uci,
      san = move.san,
    }
  end

  return positions, nil
end

--- Every puzzle that has been made.
local function all_puzzles()
  local puzzles = {}
  local cursor = ""

  while true do
    local ok, objects, next_cursor = pcall(
      nk.storage_list,
      "",
      puzzle.PUZZLE_COLLECTION,
      puzzle.SCAN_LIMIT,
      cursor
    )
    if not ok or type(objects) ~= "table" then
      break
    end
    for _, object in ipairs(objects) do
      if type(object.value) == "table" then
        puzzles[#puzzles + 1] = object.value
      end
    end
    if type(next_cursor) ~= "string" or next_cursor == "" then
      break
    end
    cursor = next_cursor
  end

  return puzzles
end

--- How many puzzles a player has solved.
local function count_solved(progress)
  local count = 0
  for _ in pairs(progress.solved or {}) do
    count = count + 1
  end
  return count
end

--- The record of a player: the puzzles they have solved, and their streak.
function puzzle.progress_of(user_id)
  local objects = nk.storage_read({
    {
      collection = puzzle.PROGRESS_COLLECTION,
      key = puzzle.PROGRESS_KEY,
      user_id = user_id,
    },
  })

  local record = objects and objects[1] and objects[1].value or nil
  if type(record) ~= "table" then
    record = { solved = {}, streak = 0, best = 0, played = 0 }
  end
  if type(record.solved) ~= "table" then
    record.solved = {}
  end
  record.streak = math.max(0, math.floor(number(record.streak, 0)))
  record.best = math.max(0, math.floor(number(record.best, 0)))
  record.played = math.max(0, math.floor(number(record.played, 0)))
  return record
end

local function write_progress(user_id, record)
  local ok, acks = pcall(nk.storage_write, {
    {
      collection = puzzle.PROGRESS_COLLECTION,
      key = puzzle.PROGRESS_KEY,
      user_id = user_id,
      value = record,
      permission_read = 1,
      permission_write = 1,
    },
  })
  if not ok then
    return nil, tostring(acks)
  end
  return acks and acks[1] and acks[1].version or nil
end

--- The puzzle as it is shown to a player.
local function puzzle_view(value)
  return {
    id = value.id,
    fen = value.fen,
    solution = value.solution,
    solutionSan = value.solutionSan,
    loss = number(value.loss, 0),
    cp = number(value.cp, 0),
    ply = math.floor(number(value.ply, 0)),
    game = value.game or "",
  }
end

--- A game that has not been made into puzzles yet.
--
-- The games are the ones that were played here, and the ones with enough
-- moves for a mistake to be found in them.
function puzzle.game_to_mine()
  local puzzles = all_puzzles()
  local mined = {}
  for _, value in ipairs(puzzles) do
    if type(value.game) == "string" and value.game ~= "" then
      mined[value.game] = true
    end
  end

  local records = {}
  local cursor = ""
  while true do
    local ok, objects, next_cursor = pcall(
      nk.storage_list,
      "",
      progression.HISTORY_COLLECTION,
      puzzle.SCAN_LIMIT,
      cursor
    )
    if not ok or type(objects) ~= "table" then
      break
    end
    for _, object in ipairs(objects) do
      if type(object.value) == "table" then
        records[#records + 1] = object.value
      end
    end
    if type(next_cursor) ~= "string" or next_cursor == "" then
      break
    end
    cursor = next_cursor
  end

  -- The newest game that is long enough and has not been made into
  -- puzzles yet.
  local best = nil
  local seen = {}
  for _, record in ipairs(records) do
    local match_id = record.matchId
    if
      type(match_id) == "string"
      and match_id ~= ""
      and not seen[match_id]
      and not mined[match_id]
    then
      seen[match_id] = true
      local steps = record.steps
      if type(steps) == "table" and #steps >= puzzle.MIN_MOVES then
        if
          best == nil
          or number(record.endedAt, 0) > number(best.endedAt, 0)
        then
          best = record
        end
      end
    end
  end

  if best == nil then
    return nil, "no game here is long enough to make a puzzle of"
  end

  -- The positions of the game are given as well, so the engine is asked
  -- about the same positions the server keeps.
  local positions = puzzle.positions(best.steps, best.initialFen)
  if not positions then
    return nil, "the game cannot be played"
  end

  local frames = {}
  for _, position in ipairs(positions) do
    frames[#frames + 1] = {
      ply = position.ply,
      fen = position.fen,
      uci = position.uci,
      san = position.san,
    }
  end

  return {
    gameId = best.matchId,
    initialFen = best.initialFen or rules.DEFAULT_FEN,
    steps = best.steps,
    positions = frames,
  }
end

--- Keep the puzzles of a game.
--
-- The game is played out again with the rules of the server, and a puzzle
-- is kept only when its position is one of the positions of that game and
-- its answer is a legal move in that position.
function puzzle.save(context, params)
  if not context or not context.user_id or context.user_id == "" then
    return error_payload("unauthenticated", "A user session is required")
  end

  local game_id = params.gameId or params.game_id
  if type(game_id) ~= "string" or game_id == "" then
    return error_payload("invalid_payload", "the game is not named")
  end

  local offered = params.puzzles
  if type(offered) ~= "table" or #offered == 0 then
    return error_payload("invalid_payload", "there are no puzzles")
  end

  local positions = puzzle.positions(params.steps, params.initialFen)
  if not positions then
    return error_payload("invalid_game", "the game cannot be played")
  end

  local by_fen = {}
  for _, position in ipairs(positions) do
    by_fen[position.fen] = position
  end

  local kept = 0
  local refused = 0

  for _, entry in ipairs(offered) do
    if type(entry) == "table" and type(entry.fen) == "string" then
      local position = by_fen[entry.fen]
      local solution = entry.solution
      if position ~= nil and type(solution) == "string" and solution ~= "" then
        -- The answer must be a move that can be played in that position.
        local game = rules.new(position.fen)
        local move = play_uci(game, solution)
        if move then
          local id = puzzle.id_for(entry.fen)
          local ok = pcall(nk.storage_write, {
            {
              collection = puzzle.PUZZLE_COLLECTION,
              key = id,
              value = {
                id = id,
                fen = entry.fen,
                solution = solution,
                solutionSan = move.san,
                loss = number(entry.loss, 0),
                cp = number(entry.cp, 0),
                ply = number(entry.ply, 0),
                game = game_id,
                createdAt = nk.time(),
              },
              permission_read = 0,
              permission_write = 0,
            },
          })
          if ok then
            kept = kept + 1
          else
            refused = refused + 1
          end
        else
          refused = refused + 1
        end
      else
        refused = refused + 1
      end
    end
  end

  if kept == 0 then
    return error_payload(
      "no_puzzles",
      "none of the puzzles could be kept: "
        .. tostring(refused)
        .. " were refused"
    )
  end

  return {
    ok = true,
    kept = kept,
    refused = refused,
  }
end

--- A puzzle for a player, and the game to make more of them if there is
--- none.
function puzzle.next(context)
  if not context or not context.user_id or context.user_id == "" then
    return error_payload("unauthenticated", "A user session is required")
  end

  local progress = puzzle.progress_of(context.user_id)
  local puzzles = all_puzzles()

  -- The puzzles the player has not solved, the ones that gave away the
  -- most first.
  local candidates = {}
  for _, value in ipairs(puzzles) do
    if type(value.id) == "string" and not progress.solved[value.id] then
      candidates[#candidates + 1] = value
    end
  end

  table.sort(candidates, function(left, right)
    local left_loss = number(left.loss, 0)
    local right_loss = number(right.loss, 0)
    if left_loss == right_loss then
      return tostring(left.id) < tostring(right.id)
    end
    return left_loss > right_loss
  end)

  if #candidates > 0 then
    return {
      ok = true,
      puzzle = puzzle_view(candidates[1]),
      streak = progress.streak,
      best = progress.best,
      solved = count_solved(progress),
      remaining = #candidates,
      game = nil,
    }
  end

  -- There is nothing to solve yet, so a game is named for the engine to
  -- look at.
  local game, game_error = puzzle.game_to_mine()
  if not game then
    return error_payload("no_puzzles", game_error)
  end

  return {
    ok = true,
    puzzle = nil,
    streak = progress.streak,
    best = progress.best,
    solved = count_solved(progress),
    remaining = 0,
    game = game,
  }
end

--- The move a player made, and whether it was the answer.
function puzzle.answer(context, params)
  if not context or not context.user_id or context.user_id == "" then
    return error_payload("unauthenticated", "A user session is required")
  end

  local id = params.id
  if type(id) ~= "string" or id == "" then
    return error_payload("invalid_payload", "the puzzle is not named")
  end

  local objects = nk.storage_read({
    {
      collection = puzzle.PUZZLE_COLLECTION,
      key = id,
    },
  })
  local stored = objects and objects[1] and objects[1].value or nil
  if type(stored) ~= "table" then
    return error_payload("unknown_puzzle", "there is no such puzzle")
  end

  local progress = puzzle.progress_of(context.user_id)
  if progress.solved[id] == true then
    return {
      ok = true,
      solved = true,
      streak = progress.streak,
      best = progress.best,
      played = progress.played,
    }
  end

  local move = params.move
  local right = type(move) == "string" and move == stored.solution

  progress.played = progress.played + 1
  if right then
    progress.solved[id] = true
    progress.streak = progress.streak + 1
    if progress.streak > progress.best then
      progress.best = progress.streak
    end
  else
    -- A wrong answer ends the run, the way it does on lichess.
    progress.streak = 0
  end

  local version, write_error = write_progress(context.user_id, progress)
  if not version then
    return error_payload("storage_unavailable", write_error)
  end

  return {
    ok = true,
    solved = right,
    streak = progress.streak,
    best = progress.best,
    played = progress.played,
  }
end

--- How the player is doing.
function puzzle.progress(context)
  if not context or not context.user_id or context.user_id == "" then
    return error_payload("unauthenticated", "A user session is required")
  end

  local progress = puzzle.progress_of(context.user_id)
  return {
    ok = true,
    streak = progress.streak,
    best = progress.best,
    solved = count_solved(progress),
    played = progress.played,
  }
end

return puzzle
