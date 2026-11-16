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

local tournament = {}

tournament.COLLECTION = "chess_tournaments"
tournament.MAX_PLAYERS = 32
tournament.MAX_ROUNDS = 9
tournament.MIN_ROUNDS = 2
tournament.MAX_NAME = 40

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

--- The players of a tournament, best first.
local function standing(state)
  local players = {}
  for _, player in pairs(state.players or {}) do
    players[#players + 1] = player
  end

  table.sort(players, function(left, right)
    if left.points == right.points then
      if left.rating == right.rating then
        return tostring(left.userId) < tostring(right.userId)
      end
      return left.rating > right.rating
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
    local match_id = nk.match_create("chess_match", {
      mode = "tournament",
      rated = true,
      expected_users = {
        {
          user_id = first.userId,
          username = first.username,
          color = "w",
        },
        {
          user_id = second.userId,
          username = second.username,
          color = "b",
        },
      },
      time_control = {
        initial_ms = state.time_control.initial_ms,
        increment_ms = state.time_control.increment_ms,
      },
    })

    first.matchId = match_id
    first.color = "w"
    second.matchId = match_id
    second.color = "b"
    first.opponents = first.opponents or {}
    second.opponents = second.opponents or {}
    first.opponents[#first.opponents + 1] = second.userId
    second.opponents[#second.opponents + 1] = first.userId

    games[#games + 1] = {
      matchId = match_id,
      white = first.userId,
      black = second.userId,
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
    hostName = context.username or "Player",
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
    username = context.username or "Player",
    rating = number(params.rating, 1200),
    points = 0,
    opponents = {},
    results = {},
    byes = 0,
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
      username = context.username or "Player",
      rating = number(params.rating, 1200),
      points = 0,
      opponents = {},
      results = {},
      byes = 0,
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

--- Leave a tournament.
function tournament.leave(context, params)
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

  state.players[context.user_id] = nil
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
function tournament.finish_match(match_id, winner_user_id, status)
  for _, state in ipairs(all()) do
    local found = false
    for _, round in ipairs(state.rounds_done or {}) do
      for _, game in ipairs(round.games or {}) do
        if game.matchId == match_id and game.result == nil then
          game.result = winner_user_id or "draw"
          found = true
        end
      end
    end

    if found then
      -- The points of the round are given.
      for _, round in ipairs(state.rounds_done or {}) do
        for _, game in ipairs(round.games or {}) do
          if game.matchId == match_id then
            local white = state.players[game.white]
            local black = state.players[game.black]
            if white ~= nil and black ~= nil then
              if winner_user_id == game.white then
                white.points = white.points + 1
                white.results[#white.results + 1] = "w"
                black.results[#black.results + 1] = "l"
              elseif winner_user_id == game.black then
                black.points = black.points + 1
                black.results[#black.results + 1] = "w"
                white.results[#white.results + 1] = "l"
              else
                white.points = white.points + 0.5
                black.points = black.points + 0.5
                white.results[#white.results + 1] = "d"
                black.results[#black.results + 1] = "d"
              end
            end
          end
        end
      end

      -- When every game of the round is done, the next round is made.
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

      save(state)
      return true
    end
  end

  return false
end

return tournament
