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
  for index = #(result.pocketed or {}), 1, -1 do
    local event = result.pocketed[index]
    if event.kind == kind then
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
    if disc.kind == kind and disc.pocketed then
      fallback = disc
      break
    end
  end
  return fallback
end

-- The ICF opening layout: the queen on the centre spot, three men per player
-- touching the centre circle, and six men per player touching that ring.
function rules.create_initial_state(players)
  local seated = rules.players_in_turn_order(players or { "white", "black" })
  local count = math.max(2, #seated)

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
    queen = { status = "board" },
    scores = { white = 0, black = 0, green = 0, yellow = 0 },
    status = "aiming",
    winner = nil,
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
  local own_pocketed = 0
  local opponent_pocketed = 0
  local queen_pocketed = false
  for _, event in ipairs(result.pocketed or {}) do
    if event.kind == player then
      own_pocketed = own_pocketed + 1
    elseif event.kind ~= "queen" and event.kind ~= "striker" then
      opponent_pocketed = opponent_pocketed + 1
    elseif event.kind == "queen" then
      queen_pocketed = true
    end
  end
  local striker_pocketed = result.striker_pocketed == true
  local foul = striker_pocketed or opponent_pocketed > 0

  local next_state = {
    discs = copy_discs(result.discs),
    striker = { x = 0, y = 0, pocketed = false },
    turn = player,
    players = {},
    queen = { status = state.queen.status },
    scores = { white = 0, black = 0, green = 0, yellow = 0 },
    status = "aiming",
    winner = nil,
    shotNumber = (state.shotNumber or 0) + 1,
  }
  for _, seat in ipairs(seated) do
    next_state.players[#next_state.players + 1] = seat
  end
  if state.queen.owner ~= nil then
    next_state.queen.owner = state.queen.owner
  end

  local queen_covered_this_shot = false
  local queen_returned = false
  local returned_disc = nil
  local queen_blocked_finish = false

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

  if striker_pocketed then
    local penalty = rules.last_pocketed_disc(next_state, result, player)
    if penalty then
      rules.return_disc_to_board(next_state, penalty)
      returned_disc = player
    end
  end

  rules.score_state(next_state)

  local function try_finish(candidate)
    if next_state.scores[candidate] < physics.PIECES_PER_PLAYER then
      return false
    end
    if next_state.queen.status == "covered" then
      next_state.status = "finished"
      next_state.winner = candidate
      return true
    end
    local blocker = rules.last_pocketed_disc(next_state, result, candidate)
    if blocker then
      rules.return_disc_to_board(next_state, blocker)
      returned_disc = candidate
    end
    queen_blocked_finish = true
    rules.score_state(next_state)
    return false
  end

  local order = rules.players_in_turn_order(seated)
  local finished = false
  local candidates = { player }
  for _, seat in ipairs(order) do
    if seat ~= player then
      candidates[#candidates + 1] = seat
    end
  end
  for _, candidate in ipairs(candidates) do
    if try_finish(candidate) then
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

  next_state.turn = turn_continued and player
    or rules.next_player(seated, player)

  local requested = turn_continued and shot.position or 0.5
  local position = rules.nearest_valid_position(next_state, requested)
  local x, y = physics.striker_point(next_state.turn, position)
  next_state.striker = { x = x, y = y, pocketed = false }

  local parts = {}
  if next_state.winner then
    parts[#parts + 1] = physics.PLAYER_LABEL[next_state.winner]
      .. " clears the board and wins."
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
      parts[#parts + 1] = "Queen covered."
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
    if turn_continued then
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
    message = table.concat(parts, " "),
  }
  next_state.lastOutcome = outcome

  return next_state, outcome
end

return rules
