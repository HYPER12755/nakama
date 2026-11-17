-- MoonGames Carrom rules.
--
-- The authoritative port of Carrom/core/src/rules.ts. It applies the carrom
-- rules to a finished physics step, so the same rules drive the local game,
-- the AI, and the server. The module has no Nakama dependencies.

local physics = require("carrom_physics")

local rules = {}

local ALL_PLAYERS = { "white", "black", "green", "yellow" }

rules.ALL_PLAYERS = ALL_PLAYERS
rules.PLAYER_LABEL = physics.PLAYER_LABEL

-- Partners sit opposite one another. Team A is white and black, team B is
-- yellow and green, so the clockwise turn crosses the teams at every shot.
rules.TEAM_PLAYERS = {
  A = { "white", "black" },
  B = { "yellow", "green" },
}
rules.TEAM_LABEL = {
  A = "Ivory & Onyx",
  B = "Amber & Jade",
}
local PLAYER_TEAM = {
  white = "A",
  black = "A",
  yellow = "B",
  green = "B",
}

function rules.team_of(player)
  return PLAYER_TEAM[player]
end

function rules.teammate_of(player)
  local team = rules.TEAM_PLAYERS[PLAYER_TEAM[player]] or {}
  for _, seat in ipairs(team) do
    if seat ~= player then
      return seat
    end
  end
  return player
end

function rules.is_team_game(state)
  return state.teams == true and #(state.players or {}) >= 4
end

-- The colours that count as ours for this shot: one in singles, our pair in
-- doubles. Only colours with a seat are included.
function rules.own_colours(state, player)
  if not rules.is_team_game(state) then
    return { player }
  end
  local result = {}
  for _, seat in ipairs(rules.TEAM_PLAYERS[PLAYER_TEAM[player]] or {}) do
    for _, seated in ipairs(state.players or {}) do
      if seated == seat then
        result[#result + 1] = seat
        break
      end
    end
  end
  return result
end

-- The game types. They mirror Carrom/core/src/board.ts, and the keys are the
-- ones the client reads, so the table and the interface always agree.
rules.VARIANTS = {
  classic = {
    id = "classic",
    label = "Classic",
    fouls = true,
    coverQueen = true,
    queenPoints = 3,
    manPoints = 1,
  },
  freestyle = {
    id = "freestyle",
    label = "Freestyle",
    fouls = true,
    coverQueen = false,
    queenPoints = 3,
    manPoints = 1,
  },
  practice = {
    id = "practice",
    label = "Practice",
    fouls = false,
    coverQueen = false,
    queenPoints = 0,
    manPoints = 0,
  },
}

function rules.variant_rules(variant)
  return rules.VARIANTS[variant] or rules.VARIANTS.classic
end

function rules.rules_of(state)
  return (state and state.rules) or rules.VARIANTS.classic
end

function rules.players_in_turn_order(players)
  local order = {}
  local seated = {}
  for _, player in ipairs(players or {}) do
    seated[player] = true
  end
  for _, seat in ipairs(physics.SEATS) do
    if seated[seat] then
      order[#order + 1] = seat
    end
  end
  return order
end

function rules.next_player(players, current)
  local order = rules.players_in_turn_order(players)
  if #order == 0 then
    return current
  end
  for index, player in ipairs(order) do
    if player == current then
      return order[(index % #order) + 1]
    end
  end
  return current
end

function rules.count_pocketed(discs, kind)
  local total = 0
  for _, disc in ipairs(discs or {}) do
    if disc.kind == kind and disc.pocketed then
      total = total + 1
    end
  end
  return total
end

function rules.score_state(state)
  state.scores = {
    white = rules.count_pocketed(state.discs, "white"),
    black = rules.count_pocketed(state.discs, "black"),
    green = rules.count_pocketed(state.discs, "green"),
    yellow = rules.count_pocketed(state.discs, "yellow"),
  }
end

-- The pieces of a colour still on the board.
function rules.pieces_left(state, player)
  return math.max(0, physics.PIECES_PER_PLAYER - (state.scores[player] or 0))
end

-- The points of a colour: a man is worth one point and the queen is worth
-- three, the way the carrom apps count them.
function rules.points_for(state, player)
  local ruleset = rules.rules_of(state)
  local points = (state.scores[player] or 0) * (ruleset.manPoints or 0)
  if state.queen.status == "covered" and state.queen.owner == player then
    points = points + (ruleset.queenPoints or 0)
  end
  return points
end

function rules.striker_fits(state, position)
  local x, y = physics.striker_point(state.turn, position)
  local minimum = physics.DISC_RADIUS + physics.STRIKER_RADIUS + 0.002
  for _, disc in ipairs(state.discs) do
    if not disc.pocketed then
      local dx = disc.x - x
      local dy = disc.y - y
      if math.sqrt(dx * dx + dy * dy) < minimum then
        return false
      end
    end
  end
  return true
end

function rules.nearest_valid_position(state, requested)
  local target = math.min(
    physics.BASELINE_MAX,
    math.max(physics.BASELINE_MIN, requested)
  )
  local best = target
  local best_distance = math.huge
  local step = 0.002
  local position = physics.BASELINE_MIN
  while position <= physics.BASELINE_MAX + 0.0001 do
    if rules.striker_fits(state, position) then
      local distance = math.abs(position - target)
      if distance < best_distance then
        best = position
        best_distance = distance
      end
    end
    position = position + step
  end
  return best
end

local function is_open_spot(discs, x, y, radius, ignore_id)
  local edge = radius + 0.03
  if x < edge or x > 1 - edge or y < edge or y > 1 - edge then
    return false
  end
  for _, pocket in ipairs(physics.POCKETS) do
    local dx = x - pocket.x
    local dy = y - pocket.y
    if math.sqrt(dx * dx + dy * dy) < physics.POCKET_RADIUS + radius then
      return false
    end
  end
  for _, disc in ipairs(discs) do
    if disc.id ~= ignore_id and not disc.pocketed then
      local dx = disc.x - x
      local dy = disc.y - y
      if math.sqrt(dx * dx + dy * dy) < physics.DISC_RADIUS + radius + 0.002 then
        return false
      end
    end
  end
  return true
end

function rules.find_open_spot(discs, preferred, radius, ignore_id)
  preferred = preferred or { x = 0.5, y = 0.5 }
  radius = radius or physics.DISC_RADIUS
  if is_open_spot(discs, preferred.x, preferred.y, radius, ignore_id) then
    return preferred.x, preferred.y
  end

  local ring_radii = { 0.04, 0.07, 0.1, 0.13, 0.16, 0.19, 0.22, 0.26, 0.3 }
  for _, ring_radius in ipairs(ring_radii) do
    for index = 0, 23 do
      local angle = -math.pi / 2 + index * math.pi / 12
      local x = preferred.x + math.cos(angle) * ring_radius
      local y = preferred.y + math.sin(angle) * ring_radius
      if is_open_spot(discs, x, y, radius, ignore_id) then
        return x, y
      end
    end
  end

  return preferred.x, preferred.y
end

function rules.return_disc_to_board(state, disc, preferred)
  local x, y = rules.find_open_spot(
    state.discs,
    preferred or { x = 0.5, y = 0.5 },
    physics.DISC_RADIUS,
    disc.id
  )
  disc.pocketed = false
  disc.x = x
  disc.y = y
end

function rules.return_queen_to_centre(state)
  for _, disc in ipairs(state.discs) do
    if disc.kind == "queen" then
      rules.return_disc_to_board(state, disc)
      break
    end
  end
  state.queen = { status = "board" }
end

function rules.last_pocketed_disc(state, result, kind)
  local kinds = type(kind) == "table" and kind or { kind }
  local function wanted(value)
    for _, candidate in ipairs(kinds) do
      if candidate == value then
        return true
      end
    end
    return false
  end
  for index = #(result.pocketed or {}), 1, -1 do
    local event = result.pocketed[index]
    if wanted(event.kind) then
      for _, disc in ipairs(state.discs) do
        if disc.id == event.id and disc.pocketed then
          return disc
        end
      end
    end
  end
  local fallback
  for index = #(state.discs), 1, -1 do
    local disc = state.discs[index]
    if wanted(disc.kind) and disc.pocketed then
      fallback = disc
      break
    end
  end
  return fallback
end

-- The ICF opening layout: the queen on the centre spot, three men per player
-- touching the centre circle, and six men per player touching that ring.
function rules.create_initial_state(players, options)
  options = options or {}
  local seated = rules.players_in_turn_order(players or { "white", "black" })
  local count = math.max(2, #seated)
  local ruleset = options.rules
    or rules.variant_rules(options.variant or "classic")
  local strikers = options.strikers or {}

  local men = physics.DISC_RADIUS
  local inner = math.max(0.0432, (3 * count * men) / math.pi)
  local outer = math.max(inner + 2 * men, (6 * count * men) / math.pi)

  local discs = {
    { id = "queen", kind = "queen", x = 0.5, y = 0.5, pocketed = false },
  }
  local counts = { white = 0, black = 0, green = 0, yellow = 0 }

  local function push(kind, x, y)
    counts[kind] = counts[kind] + 1
    discs[#discs + 1] = {
      id = string.sub(kind, 1, 1) .. tostring(counts[kind]),
      kind = kind,
      x = x,
      y = y,
      pocketed = false,
    }
  end

  local first = seated[1] or "white"
  local start = physics.BASELINES[first].axis_angle

  for index = 0, 3 * count - 1 do
    local kind = seated[(index % count) + 1]
    local angle = start + index * math.pi * 2 / (3 * count)
    push(kind, 0.5 + math.cos(angle) * inner, 0.5 + math.sin(angle) * inner)
  end

  for index = 0, 6 * count - 1 do
    local kind = seated[(index % count) + 1]
    local angle = start + index * math.pi * 2 / (6 * count)
    push(kind, 0.5 + math.cos(angle) * outer, 0.5 + math.sin(angle) * outer)
  end

  local x, y = physics.striker_point(first, 0.5)

  return {
    discs = discs,
    striker = { x = x, y = y, pocketed = false },
    turn = first,
    players = seated,
    rules = ruleset,
    strikers = {
      white = strikers.white or physics.STRIKERS[1].id,
      black = strikers.black or physics.STRIKERS[1].id,
      green = strikers.green or physics.STRIKERS[1].id,
      yellow = strikers.yellow or physics.STRIKERS[1].id,
    },
    turnSeconds = options.turnSeconds or 0,
    turnDeadline = options.turnDeadline,
    solo = options.solo == true,
    teams = options.teams == true and #seated >= 4,
    queen = { status = "board" },
    scores = { white = 0, black = 0, green = 0, yellow = 0 },
    status = "aiming",
    winner = nil,
    winnerTeam = nil,
    shotNumber = 0,
  }
end

local function copy_discs(discs)
  local copy = {}
  for index, disc in ipairs(discs or {}) do
    copy[index] = {
      id = disc.id,
      kind = disc.kind,
      x = disc.x,
      y = disc.y,
      pocketed = disc.pocketed == true,
    }
  end
  return copy
end

-- Apply the carrom rules to a finished physics step.
function rules.resolve(state, result, shot)
  local player = state.turn
  local seated = state.players or { player }
  local ruleset = rules.rules_of(state)
  local teams = rules.is_team_game(state)
  local own_colours = rules.own_colours(state, player)
  local own_pocketed = 0
  local opponent_pocketed = 0
  local queen_pocketed = false
  local function is_own(kind)
    for _, colour in ipairs(own_colours) do
      if colour == kind then
        return true
      end
    end
    return false
  end
  for _, event in ipairs(result.pocketed or {}) do
    if is_own(event.kind) then
      own_pocketed = own_pocketed + 1
    elseif event.kind ~= "queen" and event.kind ~= "striker" then
      opponent_pocketed = opponent_pocketed + 1
    elseif event.kind == "queen" then
      queen_pocketed = true
    end
  end
  local striker_pocketed = result.striker_pocketed == true
  -- A table without fouls never punishes a shot, it only costs the turn.
  local foul = ruleset.fouls == true
    and (striker_pocketed or opponent_pocketed > 0)

  local next_state = {
    discs = copy_discs(result.discs),
    striker = { x = 0, y = 0, pocketed = false },
    turn = player,
    players = {},
    rules = ruleset,
    strikers = {},
    turnSeconds = state.turnSeconds or 0,
    turnDeadline = nil,
    solo = state.solo == true,
    teams = teams,
    winnerTeam = nil,
    queen = { status = state.queen.status },
    scores = { white = 0, black = 0, green = 0, yellow = 0 },
    status = "aiming",
    winner = nil,
    shotNumber = (state.shotNumber or 0) + 1,
  }
  for _, seat in ipairs(seated) do
    next_state.players[#next_state.players + 1] = seat
  end
  for _, seat in ipairs(rules.ALL_PLAYERS) do
    next_state.strikers[seat] = (state.strikers or {})[seat]
      or physics.STRIKERS[1].id
  end
  if state.queen.owner ~= nil then
    next_state.queen.owner = state.queen.owner
  end

  local queen_covered_this_shot = false
  local queen_returned = false
  local returned_disc = nil
  local queen_blocked_finish = false

  if ruleset.coverQueen then
    if state.queen.status == "pending" then
      if own_pocketed > 0 and not foul then
        next_state.queen = { status = "covered", owner = player }
        queen_covered_this_shot = true
      else
        rules.return_queen_to_centre(next_state)
        queen_returned = true
      end
    elseif state.queen.status == "board" and queen_pocketed then
      if foul then
        rules.return_queen_to_centre(next_state)
        queen_returned = true
      elseif own_pocketed > 0 then
        next_state.queen = { status = "covered", owner = player }
        queen_covered_this_shot = true
      else
        next_state.queen = { status = "pending", owner = player }
      end
    end
  elseif state.queen.status == "board" and queen_pocketed and not foul then
    -- Without the covering rule the queen is an ordinary piece: it belongs to
    -- whoever pocketed it and it is worth its points straight away.
    next_state.queen = { status = "covered", owner = player }
    queen_covered_this_shot = true
  end

  if striker_pocketed and ruleset.fouls then
    local penalty = rules.last_pocketed_disc(next_state, result, own_colours)
    if penalty then
      rules.return_disc_to_board(next_state, penalty)
      returned_disc = penalty.kind
    end
  end

  rules.score_state(next_state)

  local function try_finish(side)
    local cleared = {}
    for _, seat in ipairs(side) do
      for _, seated_player in ipairs(seated) do
        if seat == seated_player then
          cleared[#cleared + 1] = seat
          break
        end
      end
    end
    if #cleared == 0 then
      return false
    end
    for _, seat in ipairs(cleared) do
      if (next_state.scores[seat] or 0) < physics.PIECES_PER_PLAYER then
        return false
      end
    end
    if ruleset.coverQueen ~= true or next_state.queen.status == "covered" then
      next_state.status = "finished"
      -- The winner is the colour that took the last piece; the side is stored
      -- so every player on it gets the result.
      local winner = player
      for index = #cleared, 1, -1 do
        if (next_state.scores[cleared[index]] or 0) >= physics.PIECES_PER_PLAYER then
          winner = cleared[index]
          break
        end
      end
      next_state.winner = winner
      if teams then
        next_state.winnerTeam = rules.team_of(winner)
      end
      return true
    end
    local blocker = rules.last_pocketed_disc(next_state, result, cleared)
    if blocker then
      rules.return_disc_to_board(next_state, blocker)
      returned_disc = blocker.kind
    end
    queen_blocked_finish = true
    rules.score_state(next_state)
    return false
  end

  local order = rules.players_in_turn_order(seated)
  local sides = {}
  if teams then
    local sides_by_team = {}
    for _, team_id in ipairs({ "A", "B" }) do
      local side = {}
      for _, seat in ipairs(rules.TEAM_PLAYERS[team_id]) do
        for _, seated_player in ipairs(seated) do
          if seat == seated_player then
            side[#side + 1] = seat
            break
          end
        end
      end
      if #side > 0 then
        sides_by_team[team_id] = side
        sides[#sides + 1] = side
      end
    end
    -- The shooter's side resolves first.
    local shooter_team = rules.team_of(player)
    if sides_by_team[shooter_team] then
      table.sort(sides, function(left, right)
        if left == sides_by_team[shooter_team] then
          return true
        end
        if right == sides_by_team[shooter_team] then
          return false
        end
        return false
      end)
    end
  else
    for _, seat in ipairs(order) do
      sides[#sides + 1] = { seat }
    end
  end
  local finished = false
  for _, side in ipairs(sides) do
    if try_finish(side) then
      finished = true
      break
    end
  end

  local queen_pending_now = next_state.queen.status == "pending"
    and not foul
    and not queen_returned
  local turn_continued = not finished
    and not foul
    and not queen_blocked_finish
    and (own_pocketed > 0 or (queen_pocketed and queen_pending_now))

  -- A solo table belongs to one player, so the turn never leaves them.
  local keeps_turn = turn_continued or state.solo == true
  next_state.turn = keeps_turn and player
    or rules.next_player(seated, player)

  local requested = turn_continued and shot.position or 0.5
  local position = rules.nearest_valid_position(next_state, requested)
  local x, y = physics.striker_point(next_state.turn, position)
  next_state.striker = { x = x, y = y, pocketed = false }

  local parts = {}
  if next_state.winner then
    if teams and next_state.winnerTeam then
      parts[#parts + 1] = rules.TEAM_LABEL[next_state.winnerTeam]
        .. " win the board."
    else
      parts[#parts + 1] = physics.PLAYER_LABEL[next_state.winner]
        .. " clears the board and wins."
    end
  else
    if queen_blocked_finish then
      parts[#parts + 1] = "The queen must be covered before the final piece."
    end
    if striker_pocketed then
      parts[#parts + 1] = "Striker pocketed — foul."
    end
    if opponent_pocketed > 0 then
      parts[#parts + 1] = "Pocketed " .. tostring(opponent_pocketed)
        .. " opponent " .. (opponent_pocketed == 1 and "piece" or "pieces")
        .. " — foul."
    end
    if queen_covered_this_shot then
      if ruleset.coverQueen then
        parts[#parts + 1] = "Queen covered."
      else
        parts[#parts + 1] = "Queen taken."
      end
    elseif next_state.queen.status == "pending" then
      parts[#parts + 1] = "Queen pocketed — cover it with one of your pieces."
    end
    if queen_returned then
      parts[#parts + 1] = "Queen returned to the centre."
    end
    if returned_disc then
      parts[#parts + 1] = physics.PLAYER_LABEL[returned_disc]
        .. " piece returned."
    end
    if own_pocketed > 0 and not striker_pocketed then
      parts[#parts + 1] = "Pocketed " .. tostring(own_pocketed) .. " "
        .. physics.PLAYER_LABEL[player] .. " "
        .. (own_pocketed == 1 and "piece." or "pieces.")
    end
    if keeps_turn then
      parts[#parts + 1] = "Shoot again."
    else
      parts[#parts + 1] = "Turn passes."
    end
    if own_pocketed == 0 and opponent_pocketed == 0 and not queen_pocketed
      and not striker_pocketed then
      table.insert(parts, 1, "No pocket.")
    end
  end

  local outcome = {
    player = player,
    nextTurn = next_state.turn,
    ownPocketed = own_pocketed,
    opponentPocketed = opponent_pocketed,
    queenPocketed = queen_pocketed,
    queenCovered = queen_covered_this_shot,
    queenReturned = queen_returned,
    strikerPocketed = striker_pocketed,
    foul = foul,
    turnContinued = turn_continued,
    returnedDisc = returned_disc,
    winner = next_state.winner,
    winnerTeam = next_state.winnerTeam,
    message = table.concat(parts, " "),
  }
  next_state.lastOutcome = outcome

  return next_state, outcome
end

-- The moment the current shot clock runs out, in epoch milliseconds. A table
-- without a clock has no deadline.
function rules.deadline(state, now)
  local seconds = (state and state.turnSeconds) or 0
  if seconds <= 0 then
    return nil
  end
  return now + seconds * 1000
end

-- Hand the turn to the next player without a shot. The shot clock uses this
-- when a player runs out of time.
function rules.pass_turn(state)
  local seated = state.players or { state.turn }
  local next_turn = rules.next_player(seated, state.turn)
  local moved = {
    discs = state.discs,
    turn = next_turn,
    striker = { x = 0, y = 0, pocketed = false },
  }
  local position = rules.nearest_valid_position(moved, 0.5)
  local x, y = physics.striker_point(next_turn, position)
  local next_state = {}
  for key, value in pairs(state) do
    next_state[key] = value
  end
  next_state.turn = next_turn
  next_state.striker = { x = x, y = y, pocketed = false }
  next_state.turnDeadline = nil
  return next_state
end

return rules
