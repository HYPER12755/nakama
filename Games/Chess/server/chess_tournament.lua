-- MoonGames Chess tournaments.
--
-- A tournament is a number of rounds in which everybody plays one game
-- in every round, the way a swiss does on lichess: the players are paired
-- by the points they have, the games are rated, and the standings are
-- kept until the last round is done.
--
-- The tournament is kept in the storage of the server, so every player
-- sees the same one, and the games of a round are ordinary chess games
-- with the same rules and the same clocks as any other game here.

local nk = require("nakama")
local protocol = require("chess_protocol")
local progression = require("chess_profile")

local tournament = {}

tournament.COLLECTION = "chess_tournaments"
tournament.MAX_PLAYERS = 32
tournament.MAX_ROUNDS = 9
tournament.MIN_ROUNDS = 2
tournament.MAX_NAME = 40
-- The rating of a player who has never played a rated game.
tournament.DEFAULT_RATING = 1200

local function number(value, fallback)
  local parsed = tonumber(value)
  if parsed == nil then
    return fallback
  end
  return parsed
end

--- The rating of a player, read from the server, not from the client.
local function rating_of(user_id)
  if type(user_id) ~= "string" or user_id == "" then
    return tournament.DEFAULT_RATING
  end

  local objects = nk.storage_read({
    {
      collection = progression.PROFILE_COLLECTION,
      key = "profile",
      user_id = user_id,
    },
  })

  local record = objects and objects[1] and objects[1].value
  if type(record) ~= "table" then
    return tournament.DEFAULT_RATING
  end
  return math.floor(number(record.rating, tournament.DEFAULT_RATING))
end

--- The name of a player at the time they join.
local function username_of(context)
  if context and type(context.username) == "string" and context.username ~= "" then
    return context.username
  end
  return "Player"
end

-- The helpers that score a game and make the next round are defined below,
-- but withdrawal needs them too.
local score_game, find_game, advance

local function error_payload(code, message)
  return {
    ok = false,
    error = {
      code = code,
      message = message,
    },
  }
end

local function trim(text)
  if type(text) ~= "string" then
    return ""
  end
  return (text:gsub("^%s+", ""):gsub("%s+$", ""))
end

--- A short name for a tournament, so it can be found again.
local function tournament_id()
  return "t" .. string.format("%08x", math.floor(nk.time()) % 4294967296)
    .. tostring(math.random(1000, 9999))
end

--- Keep a tournament.
local function save(state)
  for _ = 1, 3 do
    local writes = {
      {
        collection = tournament.COLLECTION,
        key = state.id,
        value = state,
        permission_read = 0,
        permission_write = 0,
      },
    }
    local ok, acks = pcall(nk.storage_write, writes)
    if ok then
      return true
    end
  end
  return false
end

--- Read a tournament.
local function load(id)
  local objects = nk.storage_read({
    {
      collection = tournament.COLLECTION,
      key = id,
    },
  })
  local value = objects and objects[1] and objects[1].value or nil
  if type(value) ~= "table" then
    return nil
  end
  return value
end

--- Every tournament the server knows about.
local function all()
  local tournaments = {}
  local cursor = ""
  while true do
    local ok, objects, next_cursor = pcall(
      nk.storage_list,
      "",
      tournament.COLLECTION,
      100,
      cursor
    )
    if not ok or type(objects) ~= "table" then
      break
    end
    for _, object in ipairs(objects) do
      if type(object.value) == "table" then
        tournaments[#tournaments + 1] = object.value
      end
    end
    if type(next_cursor) ~= "string" or next_cursor == "" then
      break
    end
    cursor = next_cursor
  end
  return tournaments
end

--- The Buchholz of a player: the sum of the points of their opponents.
---
--- This is the tie break lichess uses for a swiss. A player who faced
--- stronger opponents comes first when the points are the same.
local function buchholz(state, player)
  local total = 0
  for _, opponent_id in ipairs(player.opponents or {}) do
    local opponent = state.players[opponent_id]
    if opponent ~= nil then
      total = total + number(opponent.points, 0)
    end
  end
  return total
end

--- The players of a tournament, best first.
local function standing(state)
  local players = {}
  for _, player in pairs(state.players or {}) do
    if not player.withdrawn then
      players[#players + 1] = player
    end
  end

  table.sort(players, function(left, right)
    if left.points == right.points then
      local left_buchholz = buchholz(state, left)
      local right_buchholz = buchholz(state, right)
      if left_buchholz == right_buchholz then
        if left.rating == right.rating then
          return tostring(left.userId) < tostring(right.userId)
        end
        return left.rating > right.rating
      end
      return left_buchholz > right_buchholz
    end
    return left.points > right.points
  end)

  for index, player in ipairs(players) do
    player.position = index
  end
  return players
end

--- The tournament as it is shown to a player.
function tournament.view(state)
  local players = standing(state)
  local entries = {}
  for _, player in ipairs(players) do
    entries[#entries + 1] = {
      userId = player.userId,
      username = player.username,
      rating = player.rating,
      points = player.points,
      position = player.position,
      opponents = player.opponents or {},
      results = player.results or {},
      matchId = player.matchId or nil,
      color = player.color or nil,
      byes = player.byes or 0,
      whites = player.whites or 0,
      blacks = player.blacks or 0,
      buchholz = buchholz(state, player),
      withdrawn = player.withdrawn == true,
    }
  end

  local rounds = {}
  for _, round in ipairs(state.rounds_done or {}) do
    local games = {}
    for _, game in ipairs(round.games or {}) do
      games[#games + 1] = {
        white = game.white,
        black = game.black,
        result = game.result or nil,
        matchId = game.matchId or nil,
      }
    end
    rounds[#rounds + 1] = {
      number = round.number,
      games = games,
    }
  end

  return {
    id = state.id,
    name = state.name,
    host = state.host,
    hostName = state.hostName,
    status = state.status,
    round = state.round or 0,
    rounds = state.rounds or 0,
    timeControl = {
      initialMs = state.time_control and state.time_control.initial_ms or 0,
      incrementMs = state.time_control and state.time_control.increment_ms or 0,
    },
    players = entries,
    roundsDone = rounds,
    createdAt = state.createdAt,
  }
end

--- The games of the next round.
--
-- The players are paired by the points they have, and the ones who have
-- played each other already are kept apart as far as it can be done.
local function pair_players(state)
  local players = standing(state)
  local pairings = {}
  local used = {}

  local function has_played(player, other)
    for _, opponent in ipairs(player.opponents or {}) do
      if opponent == other then
        return true
      end
    end
    return false
  end

  local half = math.ceil(#players / 2)
  for index = 1, half do
    local first = players[index]
    local second = nil
    if #players % 2 == 0 or index < half then
      second = players[#players + 1 - index]
    end

    if second ~= nil and second.userId == first.userId then
      -- One player is left over: they are given a point for the round.
      second = nil
    end

    if second == nil then
      first.points = first.points + 1
      first.byes = (first.byes or 0) + 1
      first.results = first.results or {}
      first.results[#first.results + 1] = "b"
    else
      if has_played(first, second) then
        -- They have played each other already, so another player is looked
        -- for.
        local other = nil
        for candidate = index + 1, #players do
          local candidate_player = players[candidate]
          if
            candidate_player ~= nil
            and not used[candidate_player.userId]
            and candidate_player.userId ~= first.userId
            and not has_played(first, candidate_player)
          then
            other = candidate_player
            break
          end
        end
        if other ~= nil then
          second = other
        end
      end

      used[first.userId] = true
      used[second.userId] = true
      pairings[#pairings + 1] = { first, second }
    end
  end

  return pairings
end

--- The games of a round.
local function play_round(state)
  local pairings = pair_players(state)
  local games = {}

  for _, pairing in ipairs(pairings) do
    local first = pairing[1]
    local second = pairing[2]

    -- The colours alternate: the player who has played fewer games as
    -- White takes White this time.
    local white, black = first, second
    if number(first.whites, 0) > number(second.whites, 0) then
      white, black = second, first
    end

    local match_id = nk.match_create("chess_match", {
      mode = "tournament",
      rated = true,
      expected_users = {
        {
          user_id = white.userId,
          username = white.username,
          color = "w",
        },
        {
          user_id = black.userId,
          username = black.username,
          color = "b",
        },
      },
      time_control = {
        initial_ms = state.time_control.initial_ms,
        increment_ms = state.time_control.increment_ms,
      },
    })

    white.matchId = match_id
    white.color = "w"
    black.matchId = match_id
    black.color = "b"
    white.whites = number(white.whites, 0) + 1
    black.blacks = number(black.blacks, 0) + 1
    white.opponents = white.opponents or {}
    black.opponents = black.opponents or {}
    white.opponents[#white.opponents + 1] = black.userId
    black.opponents[#black.opponents + 1] = white.userId

    games[#games + 1] = {
      matchId = match_id,
      white = white.userId,
      black = black.userId,
      result = nil,
    }
  end

  state.round = (state.round or 0) + 1
  state.rounds_done = state.rounds_done or {}
  state.rounds_done[#state.rounds_done + 1] = {
    number = state.round,
    games = games,
  }
  state.status = "running"
  return games
end

--- Make a tournament.
function tournament.create(context, params)
  if not context or not context.user_id or context.user_id == "" then
    return error_payload("unauthenticated", "A user session is required")
  end

  local time_control, time_error = protocol.parse_time_control(
    params.timeControl or params.time_control
  )
  if not time_control then
    return error_payload("invalid_time_control", time_error)
  end

  local rounds = math.floor(number(params.rounds, 3))
  if rounds < tournament.MIN_ROUNDS then
    rounds = tournament.MIN_ROUNDS
  end
  if rounds > tournament.MAX_ROUNDS then
    rounds = tournament.MAX_ROUNDS
  end

  local name = trim(params.name)
  if name == "" then
    name = "A tournament"
  end
  if #name > tournament.MAX_NAME then
    name = name:sub(1, tournament.MAX_NAME)
  end

  local now = nk.time()
  local state = {
    id = tournament_id(),
    name = name,
    host = context.user_id,
    hostName = username_of(context),
    status = "open",
    round = 0,
    rounds = rounds,
    time_control = {
      initial_ms = time_control.initial_ms,
      increment_ms = time_control.increment_ms,
    },
    players = {},
    rounds_done = {},
    createdAt = now,
  }

  state.players[context.user_id] = {
    userId = context.user_id,
    username = username_of(context),
    rating = rating_of(context.user_id),
    points = 0,
    opponents = {},
    results = {},
    byes = 0,
    whites = 0,
    blacks = 0,
  }

  if not save(state) then
    return error_payload("storage_unavailable", "the tournament could not be kept")
  end

  return {
    ok = true,
    tournament = tournament.view(state),
  }
end

--- Take a seat in a tournament.
function tournament.join(context, params)
  if not context or not context.user_id or context.user_id == "" then
    return error_payload("unauthenticated", "A user session is required")
  end

  local state = load(params.id)
  if state == nil then
    return error_payload("unknown_tournament", "there is no such tournament")
  end
  if state.status ~= "open" then
    return error_payload("tournament_started", "the tournament has begun")
  end

  if state.players[context.user_id] == nil then
    local count = 0
    for _ in pairs(state.players) do
      count = count + 1
    end
    if count >= tournament.MAX_PLAYERS then
      return error_payload("tournament_full", "the tournament is full")
    end
    state.players[context.user_id] = {
      userId = context.user_id,
      username = username_of(context),
      rating = rating_of(context.user_id),
      points = 0,
      opponents = {},
      results = {},
      byes = 0,
      whites = 0,
      blacks = 0,
    }
  end

  if not save(state) then
    return error_payload("storage_unavailable", "the tournament could not be kept")
  end

  return {
    ok = true,
    tournament = tournament.view(state),
  }
end

--- Begin the tournament, and make the first round.
function tournament.start(context, params)
  if not context or not context.user_id or context.user_id == "" then
    return error_payload("unauthenticated", "A user session is required")
  end

  local state = load(params.id)
  if state == nil then
    return error_payload("unknown_tournament", "there is no such tournament")
  end
  if state.host ~= context.user_id then
    return error_payload("not_the_host", "only the host can begin the tournament")
  end
  if state.status ~= "open" then
    return error_payload("tournament_started", "the tournament has begun")
  end

  local count = 0
  for _ in pairs(state.players) do
    count = count + 1
  end
  if count < 2 then
    return error_payload("not_enough_players", "a tournament needs two players")
  end

  play_round(state)
  if not save(state) then
    return error_payload("storage_unavailable", "the tournament could not be kept")
  end

  return {
    ok = true,
    tournament = tournament.view(state),
  }
end

--- Leave a tournament, even one that has begun.
--
-- When the tournament is still open, the player's seat is removed. When
-- it has begun, the player is marked as withdrawn: they play no more
-- rounds, and the game they were due to play is given to their opponent.
function tournament.withdraw(context, params)
  if not context or not context.user_id or context.user_id == "" then
    return error_payload("unauthenticated", "A user session is required")
  end

  local state = load(params.id)
  if state == nil then
    return error_payload("unknown_tournament", "there is no such tournament")
  end

  local player = state.players[context.user_id]
  if player == nil then
    return error_payload("not_in_tournament", "you are not in this tournament")
  end

  if state.status == "open" then
    state.players[context.user_id] = nil
  else
    player.withdrawn = true

    -- The game of the current round is given to the opponent.
    if player.matchId ~= nil then
      local game = find_game(state, player.matchId)
      if game ~= nil and game.result == nil then
        local opponent_id = game.white == context.user_id and game.black or game.white
        game.result = opponent_id
        score_game(state, game, opponent_id, "withdraw")
        advance(state)
      end
    end
    player.matchId = nil
    player.color = nil
  end

  if not save(state) then
    return error_payload("storage_unavailable", "the tournament could not be kept")
  end

  return {
    ok = true,
    tournament = tournament.view(state),
  }
end

--- Stop a tournament. Only its host may do so.
function tournament.cancel(context, params)
  if not context or not context.user_id or context.user_id == "" then
    return error_payload("unauthenticated", "A user session is required")
  end

  local state = load(params.id)
  if state == nil then
    return error_payload("unknown_tournament", "there is no such tournament")
  end
  if state.host ~= context.user_id then
    return error_payload("not_the_host", "only the host can stop the tournament")
  end
  if state.status == "finished" then
    return error_payload("tournament_finished", "the tournament is already over")
  end

  state.status = "cancelled"
  for _, player in pairs(state.players) do
    player.matchId = nil
    player.color = nil
  end

  if not save(state) then
    return error_payload("storage_unavailable", "the tournament could not be kept")
  end

  return {
    ok = true,
    tournament = tournament.view(state),
  }
end

--- A tournament and its standings.
function tournament.get(context, params)
  local state = load(params.id)
  if state == nil then
    return error_payload("unknown_tournament", "there is no such tournament")
  end

  return {
    ok = true,
    tournament = tournament.view(state),
  }
end

--- The tournaments there are.
function tournament.list(context)
  local tournaments = all()
  local views = {}
  for _, state in ipairs(tournaments) do
    views[#views + 1] = tournament.view(state)
  end

  table.sort(views, function(left, right)
    if left.createdAt == right.createdAt then
      return left.id < right.id
    end
    return left.createdAt > right.createdAt
  end)

  return {
    ok = true,
    tournaments = views,
  }
end

--- The result of a game of a tournament.
--
-- The standings are kept, and when the last game of the round is done the
-- next round is made, until the rounds run out.
--- Give the points of one game, and clear the game from the players so
--- the Play button goes away when the game is done.
score_game = function(state, game, winner_user_id, status)
  local white = state.players[game.white]
  local black = state.players[game.black]

  if winner_user_id == game.white then
    if white ~= nil then
      white.points = white.points + 1
      white.results[#white.results + 1] = "w"
    end
    if black ~= nil then
      black.results[#black.results + 1] = "l"
    end
  elseif winner_user_id == game.black then
    if black ~= nil then
      black.points = black.points + 1
      black.results[#black.results + 1] = "w"
    end
    if white ~= nil then
      white.results[#white.results + 1] = "l"
    end
  elseif status == "abandoned" then
    -- Nobody was there. Neither player gets a point.
    if white ~= nil then
      white.results[#white.results + 1] = "l"
    end
    if black ~= nil then
      black.results[#black.results + 1] = "l"
    end
  else
    -- A draw.
    if white ~= nil then
      white.points = white.points + 0.5
      white.results[#white.results + 1] = "d"
    end
    if black ~= nil then
      black.points = black.points + 0.5
      black.results[#black.results + 1] = "d"
    end
  end

  if white ~= nil then
    white.matchId = nil
    white.color = nil
  end
  if black ~= nil then
    black.matchId = nil
    black.color = nil
  end
end

--- The game of a round that has just finished.
find_game = function(state, match_id)
  for _, round in ipairs(state.rounds_done or {}) do
    for _, game in ipairs(round.games or {}) do
      if game.matchId == match_id then
        return game, round
      end
    end
  end
  return nil, nil
end

--- Make the next round when the last game of the round is done.
advance = function(state)
  local waiting = 0
  local last_round = state.rounds_done[#state.rounds_done]
  for _, game in ipairs(last_round.games or {}) do
    if game.result == nil then
      waiting = waiting + 1
    end
  end

  if waiting == 0 then
    if (state.round or 0) < (state.rounds or 0) then
      play_round(state)
    else
      state.status = "finished"
    end
  end
end

--- The result of a game of a tournament.
--
-- The standings are kept, and when the last game of the round is done the
-- next round is made, until the rounds run out.
function tournament.finish_match(match_id, winner_user_id, status)
  if type(match_id) ~= "string" or match_id == "" then
    return false
  end

  for _, state in ipairs(all()) do
    if state.status == "running" then
      local game = find_game(state, match_id)
      if game ~= nil and game.result == nil then
        game.result = winner_user_id or status or "draw"
        score_game(state, game, winner_user_id, status)
        advance(state)
        save(state)
        return true
      end
    end
  end

  return false
end

return tournament
