local nk = require("nakama")
local glicko = require("uno_glicko")

local progression = {}

progression.PROFILE_COLLECTION = "uno_profile"
progression.HISTORY_COLLECTION = "uno_history"
progression.LEADERBOARD_ID = "uno_rating"
progression.DEFAULT_RATING = glicko.DEFAULT_RATING
progression.MIN_RATING = glicko.MIN_RATING
progression.HISTORY_LIMIT = 10
progression.HISTORY_SCAN_LIMIT = 50

local function number(value, fallback)
  local parsed = tonumber(value)
  if parsed == nil then
    return fallback
  end
  return parsed
end

local function error_payload(code, message)
  return { ok = false, error = { code = code, message = message } }
end

local function is_email_account(user_id)
  if type(nk.account_get_id) ~= "function" then
    return true
  end
  local ok, account = pcall(nk.account_get_id, user_id)
  return ok
    and type(account) == "table"
    and type(account.email) == "string"
    and account.email ~= ""
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
    cards_played = 0,
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
  profile.rating = math.floor(number(value.rating, profile.rating))
  profile.peak_rating = math.floor(number(value.peak_rating, profile.peak_rating))
  profile.rating_deviation = number(value.rating_deviation, profile.rating_deviation)
  profile.volatility = number(value.volatility, profile.volatility)
  for _, key in ipairs({
    "games", "wins", "losses", "draws", "rated_games", "casual_games",
    "cards_played", "best_streak",
  }) do
    profile[key] = math.floor(number(value[key], profile[key]))
  end
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
      cards_played = profile.cards_played,
      best_streak = profile.best_streak,
    },
  }
end

function progression.outcome_for_result(result, user_id)
  if result == nil then
    return "abandoned"
  end
  if result.status == "abandoned" then
    return "abandoned"
  end
  if result.winner_user_id == user_id then
    return "win"
  end
  if result.winner_user_id == nil then
    return "draw"
  end
  return "loss"
end

local function read_records(collection, user_ids)
  local reads = {}
  for index, user_id in ipairs(user_ids) do
    reads[index] = { collection = collection, key = user_id }
  end
  local objects = nk.storage_read(reads)
  local result = {}
  for _, object in ipairs(objects or {}) do
    result[object.key] = object.value
  end
  return result
end

local function read_histories(user_id, limit)
  local objects = nk.storage_list(user_id, progression.HISTORY_COLLECTION, limit or progression.HISTORY_SCAN_LIMIT)
  local result = {}
  for _, object in ipairs(objects or {}) do
    result[#result + 1] = object.value
  end
  table.sort(result, function(left, right)
    return number(left.ended_at, 0) > number(right.ended_at, 0)
  end)
  while #result > limit do
    table.remove(result)
  end
  return result
end

local function commit(writes)
  if #writes == 0 then
    return true
  end
  local ok, err = pcall(nk.storage_write, writes)
  if not ok then
    nk.logger_warn("Could not write Uno progression: " .. tostring(err))
    return false
  end
  return true
end

local function ensure_leaderboard()
  local ok, err = pcall(
    nk.leaderboard_create,
    progression.LEADERBOARD_ID,
    true,
    "desc",
    "set",
    "",
    { title = "MoonGames Uno Rating", game = "uno", rating = "Glicko-2" },
    true
  )
  if not ok then
    nk.logger_warn("Could not create Uno rating leaderboard: " .. tostring(err))
    return false
  end
  return true
end

local function write_leaderboard(player, profile, state, outcome)
  if state.rated ~= true or outcome == "abandoned" or not is_email_account(player.user_id) then
    return
  end
  if not ensure_leaderboard() then
    return
  end
  local ok, err = pcall(
    nk.leaderboard_record_write,
    progression.LEADERBOARD_ID,
    player.user_id,
    profile.username or player.username or "Player",
    profile.rating,
    profile.wins or 0,
    {
      wins = profile.wins,
      losses = profile.losses,
      draws = profile.draws,
      games = profile.games,
      rated = true,
      mode = state.mode or "quick",
    },
    "set"
  )
  if not ok then
    nk.logger_warn("Could not write Uno rating for " .. tostring(player.user_id) .. ": " .. tostring(err))
  end
end

local function history_record(context, state, player, outcome, points_for, rating_before, profile, now, result, opponents)
  local opponent = opponents[1]
  for _, candidate in ipairs(opponents) do
    if candidate.user_id == state.winner then
      opponent = candidate
      break
    end
  end
  if opponent == nil then
    opponent = { user_id = "", username = "Player" }
  end
  local steps = {}
  for _, step in ipairs(state.replay or {}) do
    steps[#steps + 1] = step.action .. (step.cardId and (":" .. step.cardId) or "")
  end
  return {
    match_id = context.match_id,
    game_id = "uno",
    mode = state.mode or "quick",
    rated = state.rated == true,
    outcome = outcome,
    status = result and result.status or "finished",
    reason = result and result.reason or "hand finished",
    opponent = opponent,
    points_for = points_for,
    rating_before = rating_before,
    rating_after = profile.rating,
    rating_delta = profile.rating - rating_before,
    ended_at = now,
    steps = steps,
    replay = { seats = state.seats or #state.players, steps = state.replay or {} },
  }
end

local function public_history(value)
  if type(value) ~= "table" then
    return nil
  end
  local opponent = value.opponent or {}
  return {
    matchId = value.match_id,
    gameId = value.game_id or "uno",
    mode = value.mode or "quick",
    rated = value.rated == true,
    outcome = value.outcome or "draw",
    status = value.status or "finished",
    reason = value.reason or "",
    opponent = {
      userId = opponent.user_id or opponent.userId or "",
      username = opponent.username or "Player",
    },
    pointsFor = number(value.points_for, 0),
    ratingBefore = value.rating_before,
    ratingAfter = value.rating_after,
    ratingDelta = number(value.rating_delta, 0),
    endedAt = number(value.ended_at, 0),
    steps = value.steps or {},
    metadata = { replay = value.replay or {} },
  }
end

function progression.finalize_match(context, state, result, now)
  if state.finalized then
    return false
  end
  state.finalized = true

  local players = state.players or {}
  local user_ids = {}
  for index, player in ipairs(players) do
    user_ids[index] = player.user_id
  end
  local stored = read_records(progression.PROFILE_COLLECTION, user_ids)
  local writes = {}
  local history_writes = {}
  local finalized = {}
  local opponents_by_player = {}

  for _, player in ipairs(players) do
    local opponents = {}
    for _, other in ipairs(players) do
      if other.user_id ~= player.user_id then
        opponents[#opponents + 1] = {
          user_id = other.user_id,
          username = other.username,
          rating = number(stored[other.user_id] and stored[other.user_id].rating, progression.DEFAULT_RATING),
          deviation = number(
            stored[other.user_id] and stored[other.user_id].rating_deviation,
            glicko.DEFAULT_DEVIATION
          ),
          volatility = number(
            stored[other.user_id] and stored[other.user_id].volatility,
            glicko.DEFAULT_VOLATILITY
          ),
        }
      end
    end
    opponents_by_player[player.user_id] = opponents
  end

  for _, player in ipairs(players) do
    local profile = progression.normalize_profile(
      stored[player.user_id],
      player.username,
      now
    )
    local rating_before = profile.rating
    local outcome = progression.outcome_for_result(result, player.user_id)
    local opponents = opponents_by_player[player.user_id] or {}
    local average_rating = progression.DEFAULT_RATING
    local average_deviation = glicko.DEFAULT_DEVIATION
    if #opponents > 0 then
      local rating_total = 0
      local deviation_total = 0
      for _, opponent in ipairs(opponents) do
        rating_total = rating_total + opponent.rating
        deviation_total = deviation_total + opponent.deviation
      end
      average_rating = rating_total / #opponents
      average_deviation = deviation_total / #opponents
    end

    if state.rated == true and outcome ~= "abandoned" and #opponents > 0 then
      local update = glicko.update(
        {
          rating = profile.rating,
          deviation = profile.rating_deviation,
          volatility = profile.volatility,
        },
        {
          rating = average_rating,
          deviation = average_deviation,
          volatility = glicko.DEFAULT_VOLATILITY,
        },
        outcome
      )
      if update ~= nil then
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
    local played = 0
    for _, step in ipairs(state.replay or {}) do
      if step.player_id == player.user_id then
        played = played + 1
      end
    end
    profile.cards_played = profile.cards_played + played
    profile.updated_at = now
    finalized[player.user_id] = profile

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
      value = history_record(
        context,
        state,
        player,
        outcome,
        played,
        rating_before,
        profile,
        now,
        result,
        opponents_by_player[player.user_id] or {}
      ),
    }
  end

  commit(writes)
  commit(history_writes)

  for _, player in ipairs(players) do
    write_leaderboard(player, finalized[player.user_id], state, progression.outcome_for_result(result, player.user_id))
  end

  local social_ok, social = pcall(require, "moongames_social")
  if social_ok and type(social) == "table" then
    local recent_players = {}
    for _, player in ipairs(players) do
      local entry = {
        user_id = player.user_id,
        username = player.username,
        userId = player.user_id,
      }
      recent_players[#recent_players + 1] = entry
      if social.record_play then
        pcall(social.record_play, entry, "uno")
      end
    end
    if social.record_recent_players then
      pcall(social.record_recent_players, "uno", recent_players)
    end
  end
  return true
end

function progression.profile_payload(context, username)
  local user_id = context and context.user_id
  if user_id == nil or user_id == "" then
    return error_payload("unauthenticated", "A user session is required")
  end
  local stored = read_records(progression.PROFILE_COLLECTION, { user_id })
  local profile = progression.normalize_profile(
    stored[user_id],
    username or context.username,
    nk.time()
  )
  local history = {}
  for index, record in ipairs(read_histories(user_id, progression.HISTORY_LIMIT)) do
    local entry = public_history(record)
    if entry ~= nil then
      history[index] = entry
    end
  end
  return {
    ok = true,
    profile = progression.public_profile(profile),
    history = history,
  }
end

local function normalize_leaderboard_record(record)
  if type(record) ~= "table" then
    return nil
  end
  local metadata = type(record.metadata) == "table" and record.metadata or {}
  return {
    rank = number(record.rank, 0),
    userId = record.owner_id or record.user_id or "",
    username = record.username or "Player",
    rating = math.floor(number(record.score, number(record.rating, progression.DEFAULT_RATING))),
    metadata = metadata,
  }
end

function progression.leaderboard_payload(context, payload)
  local user_id = context and context.user_id
  if user_id == nil or user_id == "" then
    return error_payload("unauthenticated", "A user session is required")
  end
  local limit = 10
  if type(payload) == "table" and payload.limit ~= nil then
    limit = math.max(1, math.min(50, number(payload.limit, 10)))
  end
  if not ensure_leaderboard() then
    return error_payload("leaderboard_unavailable", "The rating leaderboard is not available")
  end

  local ok, records, _, _, _, rank_count = pcall(
    nk.leaderboard_records_list,
    progression.LEADERBOARD_ID,
    nil,
    limit,
    "",
    0
  )
  if not ok or type(records) ~= "table" then
    return error_payload(
      "leaderboard_unavailable",
      "Could not load the rating leaderboard: " .. tostring(records)
    )
  end

  local entries = {}
  for _, record in ipairs(records) do
    local entry = normalize_leaderboard_record(record)
    if entry ~= nil and is_email_account(entry.userId) then
      entries[#entries + 1] = entry
    end
  end

  local me
  local own_ok, own_records, own_owner_records = pcall(
    nk.leaderboard_records_list,
    progression.LEADERBOARD_ID,
    { user_id },
    1,
    "",
    0
  )
  if own_ok then
    local own_record = own_owner_records and own_owner_records[1]
    if own_record == nil and type(own_records) == "table" then
      for _, record in ipairs(own_records) do
        if record.owner_id == user_id then
          own_record = record
          break
        end
      end
    end
    me = normalize_leaderboard_record(own_record)
    if me ~= nil and not is_email_account(me.userId) then
      me = nil
    end
  end

  return {
    ok = true,
    entries = entries,
    me = me,
    total = math.floor(number(rank_count, #entries)),
  }
end

return progression
