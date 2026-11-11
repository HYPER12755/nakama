-- MoonGames Chess progression: ratings, profiles, history, and leaderboards.
--
-- This module owns completed-game persistence. The match handler calls
-- finalize_match exactly once when a result is set; the result broadcast waits
-- for the profile/history writes so clients can refresh immediately.

local nk = require("nakama")

local progression = {}

progression.PROFILE_COLLECTION = "chess_profile"
progression.HISTORY_COLLECTION = "chess_history"
progression.LEADERBOARD_ID = "chess_rating"
progression.DEFAULT_RATING = 1200
progression.MIN_RATING = 100
progression.K_FACTOR = 32
progression.HISTORY_LIMIT = 10
progression.HISTORY_SCAN_LIMIT = 50

local PROFILE_KEY = "profile"

local function round_away(value)
  if value >= 0 then
    return math.floor(value + 0.5)
  end
  return -math.floor(-value + 0.5)
end

local function number(value, fallback)
  local parsed = tonumber(value)
  if parsed == nil then
    return fallback
  end
  return parsed
end

local function player_for_color(state, color)
  for _, user_id in ipairs(state.player_order or {}) do
    local player = state.players and state.players[user_id]
    if player and player.color == color then
      return player
    end
  end
  return nil
end

function progression.expected_score(rating, opponent_rating)
  local mine = number(rating, progression.DEFAULT_RATING)
  local theirs = number(opponent_rating, progression.DEFAULT_RATING)
  return 1 / (1 + 10 ^ ((theirs - mine) / 400))
end

function progression.score_for_outcome(outcome)
  if outcome == "win" then
    return 1
  end
  if outcome == "draw" then
    return 0.5
  end
  if outcome == "loss" then
    return 0
  end
  return nil
end

function progression.rating_delta(rating, opponent_rating, outcome)
  local score = progression.score_for_outcome(outcome)
  if score == nil then
    return 0
  end

  local expected = progression.expected_score(rating, opponent_rating)
  return round_away(progression.K_FACTOR * (score - expected))
end

function progression.outcome_for_color(result, color)
  if type(result) ~= "table" then
    return nil
  end

  if result.winnerColor then
    if result.winnerColor == color then
      return "win"
    end
    return "loss"
  end

  if result.status == "draw" or result.status == "stalemate" then
    return "draw"
  end

  return "abandoned"
end

function progression.default_profile(username, now)
  return {
    username = username or "Player",
    rating = progression.DEFAULT_RATING,
    peakRating = progression.DEFAULT_RATING,
    games = 0,
    wins = 0,
    losses = 0,
    draws = 0,
    ratedGames = 0,
    casualGames = 0,
    updatedAt = now or 0,
  }
end

function progression.normalize_profile(value, username, now)
  local normalized = value or progression.default_profile(username, now)

  normalized.username = username or normalized.username or "Player"
  normalized.rating = math.floor(
    number(normalized.rating, progression.DEFAULT_RATING)
  )
  normalized.peakRating = math.floor(
    number(normalized.peakRating, normalized.rating)
  )
  normalized.games = math.max(0, math.floor(number(normalized.games, 0)))
  normalized.wins = math.max(0, math.floor(number(normalized.wins, 0)))
  normalized.losses = math.max(0, math.floor(number(normalized.losses, 0)))
  normalized.draws = math.max(0, math.floor(number(normalized.draws, 0)))
  normalized.ratedGames = math.max(
    0,
    math.floor(number(normalized.ratedGames, 0))
  )
  normalized.casualGames = math.max(
    0,
    math.floor(number(normalized.casualGames, 0))
  )
  normalized.updatedAt = number(normalized.updatedAt, now or 0)

  if normalized.peakRating < normalized.rating then
    normalized.peakRating = normalized.rating
  end

  return normalized
end

function progression.record_outcome(value, outcome, rating_after, rated, now)
  value.username = value.username or "Player"
  value.updatedAt = now or value.updatedAt

  if outcome == "abandoned" then
    return value
  end

  value.games = (value.games or 0) + 1
  if outcome == "win" then
    value.wins = (value.wins or 0) + 1
  elseif outcome == "loss" then
    value.losses = (value.losses or 0) + 1
  elseif outcome == "draw" then
    value.draws = (value.draws or 0) + 1
  end

  if rated then
    value.ratedGames = (value.ratedGames or 0) + 1
  else
    value.casualGames = (value.casualGames or 0) + 1
  end

  value.rating = math.max(
    progression.MIN_RATING,
    math.floor(number(rating_after, value.rating))
  )
  if value.rating > (value.peakRating or 0) then
    value.peakRating = value.rating
  end

  return value
end

function progression.public_profile(value)
  return {
    username = value.username,
    rating = value.rating,
    peakRating = value.peakRating,
    games = value.games,
    wins = value.wins,
    losses = value.losses,
    draws = value.draws,
    ratedGames = value.ratedGames,
    casualGames = value.casualGames,
    updatedAt = value.updatedAt,
  }
end

function progression.history_record(
  context,
  state,
  result,
  color,
  opponent,
  rating_before,
  rating_after,
  outcome
)
  local history = {}
  if state.game and state.game.history_san then
    history = state.game:history_san()
  end

  local pgn = ""
  if state.game and state.game.pgn then
    pgn = state.game:pgn()
  end

  local final_fen = nil
  if state.game and state.game.fen then
    final_fen = state.game:fen()
  end

  local time_control = state.time_control or {
    initial_ms = 0,
    increment_ms = 0,
  }

  return {
    matchId = context.match_id,
    mode = state.mode,
    rated = state.rated == true,
    color = color,
    outcome = outcome,
    status = result.status,
    reason = result.reason,
    winnerColor = result.winnerColor,
    opponent = {
      userId = opponent and opponent.user_id or "",
      username = opponent and opponent.username or "Player",
    },
    moves = #history,
    sans = history,
    pgn = pgn,
    finalFen = final_fen,
    timeControl = {
      initialMs = time_control.initial_ms,
      incrementMs = time_control.increment_ms,
    },
    ratingBefore = rating_before,
    ratingAfter = rating_after,
    ratingDelta = rating_after - rating_before,
    endedAt = result.endedAt,
  }
end

local function read_records(objects)
  local ok, result = pcall(nk.storage_read, objects)
  if not ok then
    return nil, tostring(result)
  end
  if type(result) ~= "table" then
    return {}, nil
  end
  return result, nil
end

local function read_profiles(players)
  local objects = {}
  for _, player in ipairs(players) do
    objects[#objects + 1] = {
      collection = progression.PROFILE_COLLECTION,
      key = PROFILE_KEY,
      user_id = player.user_id,
    }
  end

  local result, read_error = read_records(objects)
  if not result then
    return nil, read_error
  end

  local profiles = {}
  for _, object in ipairs(result) do
    if object.user_id then
      profiles[object.user_id] = {
        value = object.value,
        version = object.version,
      }
    end
  end

  return profiles, nil
end

local function read_histories(players, match_id)
  local objects = {}
  for _, player in ipairs(players) do
    objects[#objects + 1] = {
      collection = progression.HISTORY_COLLECTION,
      key = match_id,
      user_id = player.user_id,
    }
  end

  local result, read_error = read_records(objects)
  if not result then
    return nil, read_error
  end

  local histories = {}
  for _, object in ipairs(result) do
    if object.user_id then
      histories[object.user_id] = object
    end
  end

  return histories, nil
end

local function commit(writes)
  local ok, write_error = pcall(nk.storage_write, writes)
  if not ok then
    return false, tostring(write_error)
  end
  return true, nil
end

local function ensure_leaderboard()
  local ok, create_error = pcall(
    nk.leaderboard_create,
    progression.LEADERBOARD_ID,
    true,
    "desc",
    "set",
    "",
    {
      title = "MoonGames Chess Rating",
      game = "chess",
      rating = "Elo",
    },
    true
  )

  if not ok then
    nk.logger_warn(
      "Could not create Chess rating leaderboard: " .. tostring(create_error)
    )
    return false
  end

  return true
end

local function write_leaderboard(player, value, state, outcome)
  if
    outcome == "abandoned"
    or state.rated ~= true
    or not ensure_leaderboard()
  then
    return false
  end

  local ok, write_error = pcall(
    nk.leaderboard_record_write,
    progression.LEADERBOARD_ID,
    player.user_id,
    value.username or player.username or "Player",
    value.rating,
    0,
    {
      wins = value.wins,
      losses = value.losses,
      draws = value.draws,
      games = value.games,
      rated = state.rated == true,
      mode = state.mode,
    },
    "set"
  )

  if not ok then
    nk.logger_warn(
      "Could not write Chess rating for "
        .. tostring(player.user_id)
        .. ": "
        .. tostring(write_error)
    )
    return false
  end

  return true
end

function progression.finalize_match(context, state, result, now)
  if type(context) ~= "table" or not context.match_id then
    return false, "missing match context"
  end
  if type(state) ~= "table" or type(result) ~= "table" then
    return false, "missing match state or result"
  end

  now = now or nk.time()

  local white = player_for_color(state, "w")
  local black = player_for_color(state, "b")
  if not white or not black then
    return false, "both seats are required"
  end

  local white_outcome = progression.outcome_for_color(result, "w")
  local black_outcome = progression.outcome_for_color(result, "b")
  if not white_outcome or not black_outcome then
    return false, "missing result outcome"
  end

  local players = { white, black }
  local outcomes = {
    [white.user_id] = white_outcome,
    [black.user_id] = black_outcome,
  }

  -- The match handler guards against setting a result twice, but use the
  -- per-player history entry as a final idempotency marker as well.
  local existing_histories, history_error =
    read_histories(players, context.match_id)
  if existing_histories then
    local white_history = existing_histories[white.user_id]
    local black_history = existing_histories[black.user_id]
    if white_history and black_history then
      return true
    end
    if white_history or black_history then
      nk.logger_warn(
        "Chess match "
          .. tostring(context.match_id)
          .. " has partial history; skipping duplicate finalization"
      )
      return true
    end
  else
    nk.logger_warn(
      "Could not check Chess match history for "
        .. tostring(context.match_id)
        .. ": "
        .. tostring(history_error)
    )
  end

  local last_error = nil

  for attempt = 1, 2 do
    local stored, read_error = read_profiles(players)
    if not stored then
      last_error = read_error
      break
    end

    local values = {}
    local versions = {}

    for _, player in ipairs(players) do
      local record = stored[player.user_id]
      values[player.user_id] = progression.normalize_profile(
        record and record.value or nil,
        player.username,
        now
      )
      versions[player.user_id] = record and record.version or nil
    end

    local white_before = values[white.user_id].rating
    local black_before = values[black.user_id].rating
    local white_after = white_before
    local black_after = black_before

    if
      state.rated == true
      and white_outcome ~= "abandoned"
      and black_outcome ~= "abandoned"
    then
      local delta = progression.rating_delta(
        white_before,
        black_before,
        white_outcome
      )
      white_after = math.max(progression.MIN_RATING, white_before + delta)
      black_after = math.max(progression.MIN_RATING, black_before - delta)
    end

    local writes = {}

    for _, player in ipairs(players) do
      local outcome = outcomes[player.user_id]
      local before = player.color == "w" and white_before or black_before
      local after = player.color == "w" and white_after or black_after
      local opponent = player.color == "w" and black or white
      local value = values[player.user_id]

      value.username = player.username or value.username
      progression.record_outcome(
        value,
        outcome,
        after,
        state.rated == true,
        now
      )

      local profile_write = {
        collection = progression.PROFILE_COLLECTION,
        key = PROFILE_KEY,
        user_id = player.user_id,
        value = value,
        permission_read = 1,
        permission_write = 1,
      }
      if versions[player.user_id] then
        profile_write.version = versions[player.user_id]
      end
      writes[#writes + 1] = profile_write
      writes[#writes + 1] = {
        collection = progression.HISTORY_COLLECTION,
        key = context.match_id,
        user_id = player.user_id,
        value = progression.history_record(
          context,
          state,
          result,
          player.color,
          opponent,
          before,
          after,
          outcome
        ),
        permission_read = 1,
        permission_write = 1,
      }
    end

    local written, write_error = commit(writes)
    if written then
      for _, player in ipairs(players) do
        write_leaderboard(
          player,
          values[player.user_id],
          state,
          outcomes[player.user_id]
        )
      end
      return true
    end

    last_error = write_error
  end

  nk.logger_error(
    "Could not persist Chess match "
      .. tostring(context.match_id)
      .. ": "
      .. tostring(last_error)
  )
  return false, last_error
end

local function load_history(user_id, limit)
  local ok, objects = pcall(
    nk.storage_list,
    user_id,
    progression.HISTORY_COLLECTION,
    progression.HISTORY_SCAN_LIMIT,
    "",
    nil
  )

  if not ok or type(objects) ~= "table" then
    return {}
  end

  local entries = {}
  for _, object in ipairs(objects) do
    if type(object.value) == "table" then
      local entry = object.value
      entry.matchId = entry.matchId or object.key
      entries[#entries + 1] = entry
    end
  end

  table.sort(entries, function(left, right)
    return number(left.endedAt, 0) > number(right.endedAt, 0)
  end)

  local result = {}
  local count = math.min(limit or progression.HISTORY_LIMIT, #entries)
  for index = 1, count do
    result[index] = entries[index]
  end
  return result
end

local function error_payload(code, message)
  return {
    ok = false,
    error = {
      code = code,
      message = message,
    },
  }
end

function progression.profile_payload(context)
  local user_id = context and context.user_id
  if not user_id or user_id == "" then
    return error_payload("unauthenticated", "A user session is required")
  end

  local objects, read_error = read_records({
    {
      collection = progression.PROFILE_COLLECTION,
      key = PROFILE_KEY,
      user_id = user_id,
    },
  })
  if not objects then
    return error_payload("profile_unavailable", read_error)
  end

  local now = nk.time()
  local record = objects[1]
  local value = progression.normalize_profile(
    record and record.value or nil,
    context.username,
    now
  )

  return {
    ok = true,
    profile = progression.public_profile(value),
    history = load_history(user_id, progression.HISTORY_LIMIT),
  }
end

local function normalize_leaderboard_record(record)
  if type(record) ~= "table" then
    return nil
  end

  local metadata = record.metadata
  if type(metadata) ~= "table" then
    metadata = {}
  end

  return {
    rank = number(record.rank, 0),
    userId = record.owner_id,
    username = record.username or "Player",
    rating = math.floor(number(record.score, 0)),
    metadata = metadata,
  }
end

function progression.leaderboard_payload(context, payload)
  local user_id = context and context.user_id
  if not user_id or user_id == "" then
    return error_payload("unauthenticated", "A user session is required")
  end

  local requested = number(payload and payload.limit, 5)
  local limit = math.max(1, math.min(25, math.floor(requested)))
  if not ensure_leaderboard() then
    return error_payload(
      "leaderboard_unavailable",
      "The rating leaderboard is not available"
    )
  end

  local ok, records, _, _, _, rank_count = pcall(
    nk.leaderboard_records_list,
    progression.LEADERBOARD_ID,
    nil,
    limit,
    "",
    0
  )
  if not ok then
    return error_payload(
      "leaderboard_unavailable",
      "Could not load the rating leaderboard: " .. tostring(records)
    )
  end

  local entries = {}
  for _, record in ipairs(records or {}) do
    local entry = normalize_leaderboard_record(record)
    if entry then
      entries[#entries + 1] = entry
    end
  end

  local me = nil
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
    if not own_record and type(own_records) == "table" then
      for _, record in ipairs(own_records) do
        if record.owner_id == user_id then
          own_record = record
          break
        end
      end
    end
    me = normalize_leaderboard_record(own_record)
  end

  return {
    ok = true,
    entries = entries,
    me = me,
    total = math.floor(number(rank_count, #entries)),
  }
end

return progression
