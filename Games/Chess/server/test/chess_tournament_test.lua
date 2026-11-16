-- Tests for the tournaments: the rounds, the pairing, and the standings.

local script_path = arg[0] or "Chess/server/test/chess_tournament_test.lua"
local script_dir = script_path:match("^(.*)[/\\]") or "."
local server_dir = script_dir .. "/.."
package.path = server_dir .. "/?.lua;" .. package.path

local fake_time = 1700000000000
local storage = {}
local matches = {}

package.preload["nakama"] = function()
  return {
    time = function()
      return fake_time
    end,
    register_rpc = function() end,
    logger_error = function() end,
    logger_warn = function() end,
    match_create = function(runtime, params)
      matches[#matches + 1] = params
      return "match-" .. tostring(#matches)
    end,
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
        acks[#acks + 1] = { version = version }
      end
      return acks
    end,
    storage_list = function(user_id, collection, limit, cursor)
      local objects = {}
      for _, record in pairs(storage) do
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

local tournament = require("chess_tournament")

local function reset()
  storage = {}
  matches = {}
  fake_time = 1700000000000
end

local function context(user_id, username)
  return { user_id = user_id, username = username or user_id }
end

local function ok(condition, message)
  if not condition then
    error(message, 0)
  end
end

-- A tournament is made, and the host has a seat in it.
reset()
local created = tournament.create(context("host", "The host"), {
  name = "The Cup",
  rounds = 2,
  timeControl = { initialMs = 300000, incrementMs = 0 },
})
ok(created.ok, "the tournament is made")
ok(created.tournament.name == "The Cup", "the tournament has its name")
ok(created.tournament.rounds == 2, "the tournament has its rounds")
ok(#created.tournament.players == 1, "the host has a seat")
ok(created.tournament.status == "open", "the tournament is open")
local id = created.tournament.id

-- Another player takes a seat.
local joined = tournament.join(context("second", "Second"), { id = id })
ok(joined.ok, "the second player takes a seat")
ok(#joined.tournament.players == 2, "there are two players")

-- A third player takes a seat.
joined = tournament.join(context("third", "Third"), { id = id })
ok(#joined.tournament.players == 3, "there are three players")

-- The tournament cannot be begun by another player.
local refused = tournament.start(context("second"), { id = id })
ok(refused.ok == false, "another player began the tournament")
ok(refused.error.code == "not_the_host", "with the right reason")

-- The host begins it, and the first round is made.
local started = tournament.start(context("host"), { id = id })
ok(started.ok, "the host begins the tournament")
ok(started.tournament.status == "running", "the tournament is running")
ok(started.tournament.round == 1, "the first round is made")
-- Three players make one game and one bye.
ok(#matches == 1, "there is a game for every pair of players")
local bye_player = nil
for _, player in ipairs(started.tournament.players) do
  if player.byes == 1 then
    bye_player = player
  end
end
ok(bye_player ~= nil, "the player left over is given a point for the round")
ok(bye_player.points == 1, "the point for the round is given")

-- The players know which game is theirs.
local view = tournament.get(context("host"), { id = id })
ok(#view.tournament.players == 3, "the standings hold every player")
local with_game = 0
for _, player in ipairs(view.tournament.players) do
  if player.matchId ~= nil then
    with_game = with_game + 1
  end
end
ok(with_game == 2, "the players know their game")
ok(view.tournament.players[1].position == 1, "the standings are numbered")
ok(#view.tournament.roundsDone == 1, "the round is kept")

-- The result of a game gives the points.
local first_match = "match-1"
local winner = matches[1].expected_users[1].user_id
local loser = matches[1].expected_users[2].user_id
tournament.finish_match(first_match, winner, "checkmate")
local after = tournament.get(context("host"), { id = id })
local points = {}
for _, player in ipairs(after.tournament.players) do
  points[player.userId] = player.points
end
ok(points[winner] == 1, "the winner has a point")
ok(points[loser] == 0, "the loser has none")
local win_kept = false
for _, player in ipairs(after.tournament.players) do
  if player.userId == winner and player.results[1] == "w" then
    win_kept = true
  end
end
ok(win_kept, "the win is kept")

-- The round had one game, so it is done, and the next round is made.
local round_two = tournament.get(context("host"), { id = id })
ok(round_two.tournament.round == 2, "the second round is made")
ok(#round_two.tournament.roundsDone == 2, "both rounds are kept")
ok(round_two.tournament.status == "running", "the tournament is still running")

-- The last round, and the tournament is over.
for _, round in ipairs(round_two.tournament.roundsDone) do
  for _, game in ipairs(round.games) do
    if game.result == nil then
      tournament.finish_match(game.matchId, game.white, "checkmate")
    end
  end
end
local finished = tournament.get(context("host"), { id = id })
ok(finished.tournament.status == "finished", "the tournament is over")
ok(finished.tournament.round == 2, "the tournament had two rounds")

-- The tournaments are listed.
local listed = tournament.list(context("host"))
ok(listed.ok, "the tournaments are listed")
ok(#listed.tournaments == 1, "there is one tournament")

-- A tournament that is not there is refused.
local unknown = tournament.get(context("host"), { id = "t-nothing" })
ok(unknown.ok == false, "a tournament that is not there is refused")
ok(unknown.error.code == "unknown_tournament", "with the right reason")

print("chess tournament ok")
