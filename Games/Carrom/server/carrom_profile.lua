-- MoonGames Carrom progression.
--
-- The same shape as the Chess progression: a rating, the counters, the stats
-- a title owns, the finished game history, and a rating leaderboard. The
-- client reads one shared profile contract, so every title can show the same
-- panel.

local nk = require("nakama")

local progression = {}

progression.PROFILE_COLLECTION = "carrom_profile"
progression.HISTORY_COLLECTION = "carrom_history"
progression.LEADERBOARD_ID = "carrom_rating"
progression.DEFAULT_RATING = 1200
progression.MIN_RATING = 100
progression.K_FACTOR = 32
progression.HISTORY_LIMIT = 10
progression.HISTORY_SCAN_LIMIT = 50

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

function progression.expected_score(rating, opponent_rating)
  return 1 / (1 + math.pow(10, (opponent_rating - rating) / 400))
end

function progression.score_for_outcome(outcome)
  if outcome == "win" then
    return 1
  end
  if outcome == "draw" then
    return 0.5
  end
  return 0
end

function progression.rating_delta(rating, opponent_rating, outcome)
  local expected = progression.expected_score(rating, opponent_rating)
  local score = progression.score_for_outcome(outcome)
  return round_away(progression.K_FACTOR * (score - expected))
end

local COLOUR_TEAM = {
  white = "A",
  black = "A",
  yellow = "B",
  green = "B",
}

function progression.team_of_colour(colour)
  return COLOUR_TEAM[colour]
end

function progression.outcome_for_result(result, colour, user_id, team)
  if type(result) ~= "table" then
    return "draw"
  end
  if result.status == "abandoned" then
    return "abandoned"
  end
  -- A player who leaves the table loses and everyone who stayed wins, even
  -- when the table had three or four seats.
  if result.loserUserId and user_id then
    if result.loserUserId == user_id then
      return "loss"
    end
    return "win"
  end
  if result.winnerTeam ~= nil then
    local side = team or progression.team_of_colour(colour)
    if side ~= nil then
      return result.winnerTeam == side and "win" or "loss"
    end
  end
  if result.winnerColour == nil then
    return "draw"
  end
  if result.winnerColour == colour then
    return "win"
  end
  return "loss"
end

function progression.default_profile(username, now)
  return {
    username = username or "Player",
    rating = progression.DEFAULT_RATING,
    peak_rating = progression.DEFAULT_RATING,
    games = 0,
    wins = 0,
    losses = 0,
    draws = 0,
    rated_games = 0,
    casual_games = 0,
    pieces_pocketed = 0,
    queens_covered = 0,
    best_streak = 0,
    updated_at = now or 0,
  }
end

local function copy_stats(value)
  local stats = {
    pieces_pocketed = number(value.pieces_pocketed, 0),
    queens_covered = number(value.queens_covered, 0),
    best_streak = number(value.best_streak, 0),
  }
  return stats
end

function progression.normalize_profile(value, username, now)
  local profile = progression.default_profile(username, now)
  if type(value) ~= "table" then
    return profile
  end
  profile.username = value.username or profile.username
  profile.rating = math.max(
    progression.MIN_RATING,
    number(value.rating, progression.DEFAULT_RATING)
  )
  profile.peak_rating = math.max(
    profile.rating,
    number(value.peak_rating, profile.rating)
  )
  profile.games = number(value.games, 0)
  profile.wins = number(value.wins, 0)
  profile.losses = number(value.losses, 0)
  profile.draws = number(value.draws, 0)
  profile.rated_games = number(value.rated_games, 0)
  profile.casual_games = number(value.casual_games, 0)
  local stats = copy_stats(value)
  profile.pieces_pocketed = stats.pieces_pocketed
  profile.queens_covered = stats.queens_covered
  profile.best_streak = stats.best_streak
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
    peakRating = profile.peak_rating,
    games = profile.games,
    wins = profile.wins,
    losses = profile.losses,
    draws = profile.draws,
    ratedGames = profile.rated_games,
    casualGames = profile.casual_games,
    updatedAt = profile.updated_at,
    stats = {
      pieces_pocketed = profile.pieces_pocketed,
      queens_covered = profile.queens_covered,
      best_streak = profile.best_streak,
    },
  }
end

function progression.history_record(
  match_id,
  mode,
  rated,
  outcome,
  status,
  reason,
  opponent,
  steps,
  summary,
  rating_before,
  rating_after,
  rating_delta,
  ended_at,
  opponent_rating,
  opponents,
  replay
)
  return {
    match_id = match_id,
    game_id = "carrom",
    mode = mode,
    rated = rated == true,
    outcome = outcome,
    status = status or "finished",
    reason = reason or "board cleared",
    opponent = {
      user_id = opponent.user_id,
      username = opponent.username or "Player",
    },
    opponent_rating = opponent_rating or progression.DEFAULT_RATING,
    opponents = opponents or {},
    replay = replay or {},
    steps = steps or {},
    summary = summary or "",
    rating_before = rating_before,
    rating_after = rating_after,
    rating_delta = rating_delta,
    ended_at = ended_at or 0,
  }
end

local function read_records(objects)
  local result = {}
  for _, object in ipairs(objects) do
    local ok, value = pcall(nk.storage_read, objects)
    if ok and type(value) == "table" then
      for _, record in ipairs(value) do
        if record.value then
          result[record.key] = record.value
        end
      end
    end
    break
  end
  return result
end

local function read_profiles(players)
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

-- The history entry of a player is the marker that a match was written. The
-- match handler only sets a result once, but a repeated finalization must not
-- hand out a second rating change.
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
    return true
  end
  local ok, err = pcall(nk.storage_write, writes)
  if not ok then
    nk.logger_warn("Could not write Carrom progression: " .. tostring(err))
    return false
  end
  return true
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
      title = "MoonGames Carrom Rating",
      game = "carrom",
      rating = "Elo",
    },
    true
  )

  if not ok then
    nk.logger_warn(
      "Could not create Carrom rating leaderboard: " .. tostring(create_error)
    )
    return false
  end

  return true
end

local function write_leaderboard(player, value, state, outcome)
  if outcome == "abandoned" or state.rated ~= true or not ensure_leaderboard() then
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
      "Could not write Carrom rating for "
        .. tostring(player.user_id)
        .. ": "
        .. tostring(write_error)
    )
    return false
  end

  return true
end

-- The shots of a finished game, kept so the board can be replayed on the
-- device. The server already simulates these, so the replay is the same game.
local function replay_shots(state)
  local shots = {}
  for _, shot in ipairs(state.shots or {}) do
    shots[#shots + 1] = {
      by = shot.by,
      colour = shot.colour,
      position = shot.position,
      angle = shot.angle,
      power = shot.power,
      striker = shot.striker,
      pocketed_count = shot.pocketed_count or 0,
    }
  end
  return shots
end

local function players_seats(state)
  local seats = {}
  for _, colour in ipairs(state.game and state.game.players or {}) do
    seats[#seats + 1] = colour
  end
  if #seats == 0 then
    for _, player in ipairs(state.player_order or {}) do
      local seated = state.players[player]
      if seated then
        seats[#seats + 1] = seated.colour
      end
    end
  end
  return seats
end

-- Record the finished game: the rating, the counters, the stats, the history,
-- and the leaderboard entry for every player at the table.
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

  -- A match result is set once, but a repeated call must not write another
  -- game and another rating change. The per-player history is the marker.
  local existing = read_histories(players, context.match_id)
  local written_players = 0
  for _, player in ipairs(players) do
    if existing[context.match_id .. ":" .. player.user_id] then
      written_players = written_players + 1
    end
  end
  if written_players > 0 then
    if written_players < #players then
      nk.logger_warn(
        "Carrom match "
          .. tostring(context.match_id)
          .. " has partial history; skipping duplicate finalization"
      )
    end
    return true
  end

  local stored = read_profiles(players)

  -- The opponents of every seat are gathered once, so a three or four player
  -- table is rated against the whole table and the history names the same
  -- opponents. The first one stays in the single opponent field for the
  -- profile panel.
  local opponents_by_player = {}
  for _, player in ipairs(players) do
    local opponents = {}
    for _, other in ipairs(players) do
      if other.user_id ~= player.user_id then
        opponents[#opponents + 1] = {
          user_id = other.user_id,
          username = other.username,
          colour = other.colour,
          rating = progression.normalize_profile(
            stored[other.user_id],
            other.username,
            now
          ).rating,
        }
      end
    end
    opponents_by_player[player.user_id] = opponents
  end

  local writes = {}
  local history_writes = {}
  local steps = {}
  local summary = ""
  for _, shot in ipairs(state.shots or {}) do
    -- The match records pocketed_count. Older records used pocketed, so both
    -- are read to keep old histories readable.
    local count = number(shot.pocketed_count or shot.pocketed, 0)
    local colours = shot.pocketed_colours
    local detail
    if type(colours) == "table" and #colours > 0 then
      detail = #colours .. " " .. table.concat(colours, ", ")
    elseif count > 0 then
      detail = count .. (count == 1 and " piece" or " pieces")
    else
      detail = "no pocket"
    end
    steps[#steps + 1] = string.format(
      "%s shot %s (power %d%%)",
      shot.colour or "player",
      detail,
      math.floor(number(shot.power, 0) * 100)
    )
  end
  if result.winnerTeam ~= nil then
    local labels = { A = "Ivory & Onyx", B = "Amber & Jade" }
    summary = (labels[result.winnerTeam] or result.winnerTeam)
      .. " won the board together"
  elseif result.winnerColour ~= nil then
    summary = (result.winnerColour or "") .. " cleared the board"
  end

  for _, player in ipairs(players) do
    local outcome = progression.outcome_for_result(
      result,
      player.colour,
      player.user_id,
      progression.team_of_colour(player.colour)
    )
    local profile = progression.normalize_profile(
      stored[player.user_id],
      player.username,
      now
    )

    local opponents = opponents_by_player[player.user_id] or {}
    local opponent = opponents[1]
    local opponent_rating = progression.DEFAULT_RATING
    if #opponents > 0 then
      local total = 0
      for _, other in ipairs(opponents) do
        total = total + other.rating
      end
      opponent_rating = round_away(total / #opponents)
    end

    local rating_before = profile.rating
    local rating_delta = 0
    if state.rated == true and outcome ~= "abandoned" then
      rating_delta = progression.rating_delta(
        rating_before,
        opponent_rating,
        outcome
      )
      profile.rating = math.max(
        progression.MIN_RATING,
        rating_before + rating_delta
      )
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
    elseif outcome == "abandoned" then
      -- Nobody played the game out, so there is no result to add.
    else
      profile.draws = profile.draws + 1
    end

    local pocketed = 0
    local covered = 0
    for _, shot in ipairs(state.shots or {}) do
      if shot.by == player.user_id then
        pocketed = pocketed + (shot.pocketed_count or 0)
        if shot.queen_covered == true then
          covered = covered + 1
        end
      end
    end
    profile.pieces_pocketed = profile.pieces_pocketed + pocketed
    profile.queens_covered = profile.queens_covered + covered
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
      value = progression.history_record(
        context.match_id,
        state.mode or "quick",
        state.rated == true,
        outcome,
        result.status or "finished",
        result.reason or "board cleared",
        opponent or { user_id = "", username = "Player" },
        steps,
        summary,
        rating_before,
        profile.rating,
        rating_delta,
        now,
        opponent_rating,
        opponents,
        {
          variant = state.variant or "classic",
          teams = state.teams == true,
          seats = players_seats(state),
          shots = replay_shots(state),
        }
      ),
    }

    write_leaderboard(player, profile, state, outcome)
  end

  commit(writes)
  commit(history_writes)

  -- The launcher shows the most played title in the middle of the orbit.
  local social_ok, social = pcall(require, "moongames_social")
  if social_ok and type(social) == "table" and social.record_play then
    for _, player in ipairs(players) do
      pcall(social.record_play, {
        user_id = player.user_id,
        username = player.username,
      }, "carrom")
    end
  end

  return true
end

local function load_history(user_id, limit)
  local objects = {{
    collection = progression.HISTORY_COLLECTION,
    key = "",
    user_id = user_id,
  }}
  local ok, values = pcall(nk.storage_list, user_id, progression.HISTORY_COLLECTION, progression.HISTORY_SCAN_LIMIT)
  if not ok or type(values) ~= "table" then
    return {}
  end

  local records = {}
  for _, value in ipairs(values) do
    if type(value.value) == "table" then
      records[#records + 1] = value.value
    end
  end
  table.sort(records, function(left, right)
    return (left.ended_at or 0) > (right.ended_at or 0)
  end)

  local history = {}
  for index, record in ipairs(records) do
    if index > limit then
      break
    end
    history[#history + 1] = {
      matchId = record.match_id,
      gameId = record.game_id or "carrom",
      mode = record.mode or "quick",
      rated = record.rated == true,
      outcome = record.outcome or "draw",
      status = record.status or "finished",
      reason = record.reason or "",
      opponent = {
        userId = (record.opponent or {}).user_id or "",
        username = (record.opponent or {}).username or "Player",
      },
      opponentRating = record.opponent_rating or progression.DEFAULT_RATING,
      opponents = record.opponents or {},
      steps = record.steps or {},
      summary = record.summary or "",
      metadata = { replay = record.replay or {} },
      ratingBefore = record.rating_before,
      ratingAfter = record.rating_after,
      ratingDelta = record.rating_delta or 0,
      endedAt = record.ended_at or 0,
    }
  end
  return history
end

local function error_payload(code, message)
  return { ok = false, error = { code = code, message = message } }
end

function progression.profile_payload(context)
  local user_id = context and context.user_id
  if not user_id or user_id == "" then
    return error_payload("unauthenticated", "A user session is required")
  end

  local stored = read_profiles({ { user_id = user_id, username = context.username } })
  local profile = progression.public_profile(
    progression.normalize_profile(stored[user_id], context.username, nk.time())
  )
  local history = load_history(user_id, progression.HISTORY_LIMIT)

  return {
    ok = true,
    profile = profile,
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
    userId = record.user_id or "",
    username = record.username or "Player",
    rating = number(record.rating, progression.DEFAULT_RATING),
    metadata = metadata,
  }
end

function progression.leaderboard_payload(context, payload)
  local user_id = context and context.user_id
  if not user_id or user_id == "" then
    return error_payload("unauthenticated", "A user session is required")
  end

  local limit = 10
  if type(payload) == "table" and payload.limit ~= nil then
    limit = math.max(1, math.min(50, number(payload.limit, 10)))
  end

  -- The list call also returns the number of ranked players. Reading only the
  -- first page made the total equal the number of rows shown.
  local ok, records, _, _, _, rank_count = pcall(
    nk.leaderboard_records_list,
    progression.LEADERBOARD_ID,
    nil,
    limit,
    "",
    0
  )
  if not ok or type(records) ~= "table" then
    return { ok = true, entries = {}, me = nil, total = 0 }
  end

  local entries = {}
  for index, record in ipairs(records) do
    local entry = normalize_leaderboard_record(record)
    if entry then
      entry.rank = index
      entries[#entries + 1] = entry
    end
  end

  local me
  local ok_me, own_records, own_owner_records = pcall(
    nk.leaderboard_records_list,
    progression.LEADERBOARD_ID,
    { user_id },
    1,
    "",
    0
  )
  if ok_me then
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
