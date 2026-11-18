-- MoonGames Ludo progression. Keeps the shared profile contract the same as
-- the other titles, with Ludo's own history, replay and rating leaderboard.

local nk = require("nakama")
local glicko = require("ludo_glicko")

local progression = {}

progression.PROFILE_COLLECTION = "ludo_profile"
progression.HISTORY_COLLECTION = "ludo_history"
progression.LEADERBOARD_ID = "ludo_rating"
progression.DEFAULT_RATING = glicko.DEFAULT_RATING
progression.MIN_RATING = glicko.MIN_RATING
progression.HISTORY_LIMIT = 10

local function number(value, fallback)
  local parsed = tonumber(value)
  if parsed == nil then
    return fallback
  end
  return parsed
end

function progression.default_profile(username, now)
  return {
    username = username or "Player",
    rating = progression.DEFAULT_RATING,
    peak_rating = progression.DEFAULT_RATING,
    rating_deviation = glicko.DEFAULT_DEVIATION,
    volatility = glicko.DEFAULT_VOLATILITY,
    games = 0,
    wins = 0,
    losses = 0,
    draws = 0,
    rated_games = 0,
    casual_games = 0,
    tokens_finished = 0,
    captures = 0,
    best_streak = 0,
    updated_at = now or 0,
  }
end

function progression.normalize_profile(value, username, now)
  local profile = progression.default_profile(username, now)
  if type(value) ~= "table" then
    return profile
  end
  profile.username = value.username or profile.username
  profile.rating = math.max(progression.MIN_RATING, number(value.rating, profile.rating))
  profile.peak_rating = math.max(profile.rating, number(value.peak_rating, profile.rating))
  profile.rating_deviation = math.max(1, number(value.rating_deviation, glicko.DEFAULT_DEVIATION))
  profile.volatility = number(value.volatility, glicko.DEFAULT_VOLATILITY)
  profile.games = number(value.games, 0)
  profile.wins = number(value.wins, 0)
  profile.losses = number(value.losses, 0)
  profile.draws = number(value.draws, 0)
  profile.rated_games = number(value.rated_games, 0)
  profile.casual_games = number(value.casual_games, 0)
  profile.tokens_finished = number(value.tokens_finished, 0)
  profile.captures = number(value.captures, 0)
  profile.best_streak = number(value.best_streak, 0)
  profile.updated_at = number(value.updated_at, now or 0)
  return profile
end

function progression.public_profile(value)
  if type(value) ~= "table" then
    return nil
  end
  local profile = progression.normalize_profile(value, value.username, value.updated_at)
  return {
    username = profile.username,
    rating = profile.rating,
    ratingDeviation = profile.rating_deviation,
    peakRating = profile.peak_rating,
    games = profile.games,
    wins = profile.wins,
    losses = profile.losses,
    draws = profile.draws,
    ratedGames = profile.rated_games,
    casualGames = profile.casual_games,
    updatedAt = profile.updated_at,
    stats = {
      tokens_finished = profile.tokens_finished,
      captures = profile.captures,
      best_streak = profile.best_streak,
    },
  }
end

function progression.outcome_for_result(result, colour, user_id)
  if type(result) ~= "table" then
    return "draw"
  end
  if result.status == "abandoned" then
    return "abandoned"
  end
  if result.loserUserId and user_id then
    return result.loserUserId == user_id and "loss" or "win"
  end
  if result.winnerColour == nil then
    return "draw"
  end
  return result.winnerColour == colour and "win" or "loss"
end

local function read_records(objects)
  local values = {}
  local ok, records = pcall(nk.storage_read, objects)
  if ok and type(records) == "table" then
    for _, record in ipairs(records) do
      if record.value then
        values[record.key] = record.value
      end
    end
  end
  return values
end

local function read_players(players)
  local objects = {}
  for _, player in ipairs(players) do
    objects[#objects + 1] = {
      collection = progression.PROFILE_COLLECTION,
      key = player.user_id,
      user_id = player.user_id,
    }
  end
  return read_records(objects)
end

local function read_histories(players, match_id)
  local objects = {}
  for _, player in ipairs(players) do
    objects[#objects + 1] = {
      collection = progression.HISTORY_COLLECTION,
      key = match_id .. ":" .. player.user_id,
      user_id = player.user_id,
    }
  end
  return read_records(objects)
end

local function commit(writes)
  if #writes == 0 then
    return
  end
  local ok, err = pcall(nk.storage_write, writes)
  if not ok then
    nk.logger_warn("Could not write Ludo progression: " .. tostring(err))
  end
end

local function ensure_leaderboard()
  local ok, err = pcall(
    nk.leaderboard_create,
    progression.LEADERBOARD_ID,
    true,
    "desc",
    "set",
    "",
    { title = "MoonGames Ludo Rating", game = "ludo", rating = "Glicko-2" },
    true
  )
  if not ok then
    nk.logger_warn("Could not create Ludo rating leaderboard: " .. tostring(err))
    return false
  end
  return true
end

local function write_leaderboard(player, profile, state)
  if state.rated ~= true or not ensure_leaderboard() then
    return
  end
  local ok, err = pcall(
    nk.leaderboard_record_write,
    progression.LEADERBOARD_ID,
    player.user_id,
    profile.username,
    profile.rating,
    0,
    {
      wins = profile.wins,
      losses = profile.losses,
      games = profile.games,
      mode = state.mode or "quick",
    },
    "set"
  )
  if not ok then
    nk.logger_warn("Could not write Ludo rating for " .. tostring(player.user_id) .. ": " .. tostring(err))
  end
end

local function history_record(context, state, player, outcome, rating_before, profile, opponents, now, result)
  return {
    match_id = context.match_id,
    game_id = "ludo",
    mode = state.mode or "quick",
    rated = state.rated == true,
    outcome = outcome,
    status = result.status or "finished",
    reason = result.reason or "all tokens home",
    opponent = opponents[1] or { user_id = "", username = "Player" },
    opponents = opponents,
    steps = state.move_summary or {},
    summary = result.winnerColour and (result.winnerColour .. " reached home first") or "race finished",
    rating_before = rating_before,
    rating_after = profile.rating,
    rating_delta = profile.rating - rating_before,
    ended_at = now,
    replay = {
      seats = state.colours or {},
      steps = state.replay_steps or {},
    },
  }
end

function progression.finalize_match(context, state, result, now)
  if type(context) ~= "table" or not context.match_id then
    return false, "missing match context"
  end
  if type(state) ~= "table" or type(result) ~= "table" then
    return false, "missing match state"
  end
  local players = {}
  for _, user_id in ipairs(state.player_order or {}) do
    local player = state.players[user_id]
    if player then
      players[#players + 1] = {
        user_id = user_id,
        username = player.username,
        colour = player.colour,
      }
    end
  end
  if #players == 0 then
    return false, "no players"
  end

  local existing = read_histories(players, context.match_id)
  for _, player in ipairs(players) do
    if existing[context.match_id .. ":" .. player.user_id] then
      return true
    end
  end

  local stored = read_players(players)
  local opponents_by_player = {}
  for _, player in ipairs(players) do
    local opponents = {}
    for _, other in ipairs(players) do
      if other.user_id ~= player.user_id then
        local other_profile = progression.normalize_profile(
          stored[other.user_id], other.username, now
        )
        opponents[#opponents + 1] = {
          user_id = other.user_id,
          username = other.username,
          colour = other.colour,
          rating = other_profile.rating,
          deviation = other_profile.rating_deviation,
        }
      end
    end
    opponents_by_player[player.user_id] = opponents
  end

  local writes = {}
  local history_writes = {}
  for _, player in ipairs(players) do
    local outcome = progression.outcome_for_result(result, player.colour, player.user_id)
    local profile = progression.normalize_profile(
      stored[player.user_id], player.username, now
    )
    local opponents = opponents_by_player[player.user_id] or {}
    local rating_before = profile.rating
    local opponent_rating = progression.DEFAULT_RATING
    local opponent_deviation = glicko.DEFAULT_DEVIATION
    if #opponents > 0 then
      local total, deviation_total = 0, 0
      for _, other in ipairs(opponents) do
        total = total + other.rating
        deviation_total = deviation_total + other.deviation
      end
      opponent_rating = total / #opponents
      opponent_deviation = deviation_total / #opponents
    end

    if state.rated == true and outcome ~= "abandoned" then
      local update = glicko.update(
        { rating = profile.rating, deviation = profile.rating_deviation, volatility = profile.volatility },
        { rating = opponent_rating, deviation = opponent_deviation, volatility = glicko.DEFAULT_VOLATILITY },
        outcome
      )
      if update then
        profile.rating = math.max(glicko.MIN_RATING, update.rating)
        profile.rating_deviation = update.deviation
        profile.volatility = update.volatility
      end
      profile.peak_rating = math.max(profile.peak_rating, profile.rating)
      profile.rated_games = profile.rated_games + 1
    else
      profile.casual_games = profile.casual_games + 1
    end

    profile.games = profile.games + 1
    if outcome == "win" then
      profile.wins = profile.wins + 1
      profile.best_streak = profile.best_streak + 1
    elseif outcome == "loss" then
      profile.losses = profile.losses + 1
      profile.best_streak = 0
    elseif outcome == "draw" then
      profile.draws = profile.draws + 1
    end

    for _, move in ipairs(state.moves or {}) do
      if move.user_id == player.user_id then
        profile.captures = profile.captures + (move.captures or 0)
        profile.tokens_finished = profile.tokens_finished + (move.finished or 0)
      end
    end
    profile.updated_at = now

    writes[#writes + 1] = {
      collection = progression.PROFILE_COLLECTION,
      key = player.user_id,
      user_id = player.user_id,
      value = profile,
    }
    history_writes[#history_writes + 1] = {
      collection = progression.HISTORY_COLLECTION,
      key = context.match_id .. ":" .. player.user_id,
      user_id = player.user_id,
      value = history_record(context, state, player, outcome, rating_before, profile, opponents, now, result),
    }
    write_leaderboard(player, profile, state)
  end

  commit(writes)
  commit(history_writes)

  local social_ok, social = pcall(require, "moongames_social")
  if social_ok and type(social) == "table" and social.record_play then
    for _, player in ipairs(players) do
      pcall(social.record_play, {
        user_id = player.user_id,
        username = player.username,
      }, "ludo")
    end
  end
  return true
end

local function load_history(user_id, limit)
  local ok, records = pcall(nk.storage_list, user_id, progression.HISTORY_COLLECTION, 50)
  if not ok or type(records) ~= "table" then
    return {}
  end
  table.sort(records, function(left, right)
    return (left.value and left.value.ended_at or 0) > (right.value and right.value.ended_at or 0)
  end)
  local history = {}
  for index, record in ipairs(records) do
    if index > limit then
      break
    end
    local value = record.value or {}
    history[#history + 1] = {
      matchId = value.match_id,
      gameId = "ludo",
      mode = value.mode or "quick",
      rated = value.rated == true,
      outcome = value.outcome or "draw",
      status = value.status or "finished",
      reason = value.reason or "",
      opponent = {
        userId = (value.opponent or {}).user_id or "",
        username = (value.opponent or {}).username or "Player",
      },
      opponents = value.opponents or {},
      steps = value.steps or {},
      summary = value.summary or "",
      metadata = { replay = value.replay or {} },
      ratingBefore = value.rating_before,
      ratingAfter = value.rating_after,
      ratingDelta = value.rating_delta or 0,
      endedAt = value.ended_at or 0,
    }
  end
  return history
end

function progression.profile_payload(context)
  local user_id = context and context.user_id
  if not user_id or user_id == "" then
    return { ok = false, error = { code = "unauthenticated", message = "A user session is required" } }
  end
  local stored = read_players({ { user_id = user_id, username = context.username } })
  local profile = progression.public_profile(
    progression.normalize_profile(stored[user_id], context.username, nk.time())
  )
  return {
    ok = true,
    profile = profile,
    history = load_history(user_id, progression.HISTORY_LIMIT),
  }
end

function progression.leaderboard_payload(context, payload)
  local user_id = context and context.user_id
  if not user_id or user_id == "" then
    return { ok = false, error = { code = "unauthenticated", message = "A user session is required" } }
  end
  local limit = 10
  if type(payload) == "table" and payload.limit ~= nil then
    limit = math.max(1, math.min(50, number(payload.limit, 10)))
  end
  local ok, records, _, _, _, rank_count = pcall(
    nk.leaderboard_records_list, progression.LEADERBOARD_ID, nil, limit, "", 0
  )
  if not ok or type(records) ~= "table" then
    return { ok = true, entries = {}, me = nil, total = 0 }
  end
  local entries = {}
  for index, record in ipairs(records) do
    entries[#entries + 1] = {
      rank = index,
      userId = record.user_id or "",
      username = record.username or "Player",
      rating = number(record.rating, progression.DEFAULT_RATING),
      metadata = type(record.metadata) == "table" and record.metadata or {},
    }
  end
  return { ok = true, entries = entries, me = nil, total = math.floor(number(rank_count, #entries)) }
end

return progression
