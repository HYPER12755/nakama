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

-- Give a player a rating on the server, so the tournament reads it.
local function rate(user_id, rating)
  storage[table.concat({ user_id, "chess_profile", "profile" }, "|")] = {
    collection = "chess_profile",
    key = "profile",
    user_id = user_id,
    version = "1",
    value = { rating = rating, username = user_id },
  }
end

-- A tournament is made, and the host has a seat in it.
reset()
rate("host", 1600)
rate("second", 1400)
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
-- The rating is read from the server, not from the client.
ok(created.tournament.players[1].rating == 1600, "the host's rating is the one on the server")
local id = created.tournament.id

local rated_join = tournament.join(context("second", "Second"), {
  id = id,
  rating = 9999,
})
ok(rated_join.tournament.players[2].rating == 1400, "a join cannot choose its own rating")

-- Another player takes a seat.
local joined = tournament.join(context("second", "Second"), { id = id })
ok(joined.ok, "the second player takes a seat")
ok(#joined.tournament.players == 2, "there are two players")

-- A third player takes a seat.
joined = tournament.join(context("third", "Third"), { id = id })
ok(#joined.tournament.players == 3, "there are three players")

-- The colours alternate over the rounds.
for _, player in ipairs(joined.tournament.players) do
  ok(player.whites == 0 and player.blacks == 0, "nobody has played a game yet")
end

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
local still_playing = 0
for _, player in ipairs(after.tournament.players) do
  if player.userId == winner and player.results[#player.results] == "w" then
    win_kept = true
  end
  if player.matchId ~= nil then
    still_playing = still_playing + 1
  end
end
ok(win_kept, "the win is kept")
-- The finished game is cleared from the players: the next round may have
-- given them a new game, but it is not the same one.
local old_game_cleared = true
for _, player in ipairs(after.tournament.players) do
  if player.matchId == first_match then
    old_game_cleared = false
  end
end
ok(old_game_cleared, "the finished game is cleared from the players")

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

-- A player can leave a tournament before it begins.
reset()
local for_leaving = tournament.create(context("host", "Host"), {
  name = "Leaving",
  rounds = 2,
  timeControl = { initialMs = 300000, incrementMs = 0 },
})
local leave_id = for_leaving.tournament.id
tournament.join(context("leaver", "Leaver"), { id = leave_id })
local left = tournament.withdraw(context("leaver"), { id = leave_id })
ok(left.ok, "a player can leave before the tournament begins")
local remaining = 0
for _ in pairs(left.tournament.players) do
  remaining = remaining + 1
end
ok(remaining == 1, "the player's seat is removed")

-- A player can withdraw while it is running, and their opponent gets the
-- point for the game they were due to play.
reset()
local for_withdraw = tournament.create(context("host", "Host"), {
  name = "Withdrawing",
  rounds = 2,
  timeControl = { initialMs = 300000, incrementMs = 0 },
})
local withdraw_id = for_withdraw.tournament.id
tournament.join(context("quitter", "Quitter"), { id = withdraw_id })
local started_withdraw = tournament.start(context("host"), { id = withdraw_id })
local quitter = nil
local stayer = nil
for _, player in ipairs(started_withdraw.tournament.players) do
  if player.userId == "quitter" then
    quitter = player
  else
    stayer = player
  end
end
ok(quitter ~= nil and stayer ~= nil, "both players have a seat")
ok(quitter.matchId == stayer.matchId, "they are due to play each other")
local withdrawn = tournament.withdraw(context("quitter"), { id = withdraw_id })
ok(withdrawn.ok, "a player can withdraw while the tournament runs")
for _, player in ipairs(withdrawn.tournament.players) do
  if player.userId == "quitter" then
    ok(player.withdrawn, "the player is marked as withdrawn")
    ok(player.matchId == nil, "the withdrawn player has no game")
  else
    -- One point for the game they did not play, and one for the bye in
    -- the round that follows, now that only one player is left.
    ok(player.points == 2, "the opponent gets the point for the game and a bye")
    ok(player.matchId == nil, "the opponent has no game")
  end
end

-- Only the host can stop a tournament.
reset()
local for_cancel = tournament.create(context("host", "Host"), {
  name = "Cancelling",
  rounds = 2,
  timeControl = { initialMs = 300000, incrementMs = 0 },
})
local cancel_id = for_cancel.tournament.id
tournament.join(context("other", "Other"), { id = cancel_id })
local refused_cancel = tournament.cancel(context("other"), { id = cancel_id })
ok(refused_cancel.ok == false, "another player stopped the tournament")
local cancelled = tournament.cancel(context("host"), { id = cancel_id })
ok(cancelled.ok, "the host stops the tournament")
local cancelled_view = tournament.get(context("host"), { id = cancel_id })
ok(cancelled_view.tournament.status == "cancelled", "the tournament is cancelled")

print("chess tournament ok")
