-- Pure authoritative Ludo rules. No Nakama dependency, plain Lua 5.4.
--
-- The state shape mirrors Ludo/core/src/types.ts exactly: four JSON-safe
-- player records, 0-based seat/token ids, a seeded dice roll, and an event log
-- that a replay can rebuild. The TS↔Lua vectors test keeps the two in step.

local rules = {}

rules.TRACK_LENGTH = 52
rules.HOME_COLUMN_START = 51
rules.FINISH_PROGRESS = 56
rules.TOKENS_PER_PLAYER = 4
rules.TWO_32 = 4294967296
rules.DEFAULT_SEED = 0x9e3779b9
rules.MULTIPLIER = 1664525
rules.INCREMENT = 1013904223

rules.COLOURS = { "red", "green", "yellow", "blue" }
rules.START_INDEX = { red = 0, green = 13, yellow = 26, blue = 39 }
rules.SAFE_SQUARES = { [0] = true, [8] = true, [13] = true, [21] = true,
  [26] = true, [34] = true, [39] = true, [47] = true }

rules.DEFAULT_RULES = {
  safeSquares = true,
  blocks = true,
  threeSixesFoul = true,
  captureExtra = true,
  sixExtra = true,
  exactFinish = true,
  sixToStart = true,
  turnOrder = "normal",
  rushMode = false,
}

local function number(value, fallback)
  local parsed = tonumber(value)
  if parsed == nil then
    return fallback
  end
  return parsed
end

function rules.normalize_seed(seed)
  local value = math.floor(number(seed, rules.DEFAULT_SEED)) % rules.TWO_32
  if value < 0 then
    value = value + rules.TWO_32
  end
  if value == 0 then
    return rules.DEFAULT_SEED
  end
  return value
end

function rules.next_seed(seed)
  local value = rules.normalize_seed(seed)
  return math.floor((value * rules.MULTIPLIER + rules.INCREMENT) % rules.TWO_32)
end

function rules.roll_from_seed(seed, sides)
  local value = rules.next_seed(seed)
  local faces = sides or 6
  return {
    value = math.floor((value / rules.TWO_32) * faces) + 1,
    seed = value,
  }
end

function rules.track_index(colour, progress)
  return (rules.START_INDEX[colour] + progress) % rules.TRACK_LENGTH
end

function rules.is_safe_square(index)
  return rules.SAFE_SQUARES[index % rules.TRACK_LENGTH] == true
end

function rules.on_track(token)
  return token.location == "track" and token.progress >= 0 and token.progress <= 50
end

local function player_at(state, seat)
  local player = state.players[seat + 1]
  if not player then
    error("no Ludo seat " .. tostring(seat))
  end
  return player
end
rules.player_at = player_at

local function copy_value(value)
  if type(value) ~= "table" then
    return value
  end
  local result = {}
  for key, item in pairs(value) do
    result[key] = copy_value(item)
  end
  return result
end

function rules.clone_state(state)
  return copy_value(state)
end

local function log_event(state, event)
  state.action = state.action + 1
  event.action = state.action
  state.events[#state.events + 1] = event
end

function rules.create_game(options)
  options = options or {}
  local player_count = number(options.playerCount, 4)
  if player_count < 2 or player_count > 4 then
    error("a Ludo game needs two to four players")
  end
  local tokens_per_player = number(options.tokensPerPlayer, rules.TOKENS_PER_PLAYER)
  if tokens_per_player < 1 or tokens_per_player > rules.TOKENS_PER_PLAYER then
    error("a race uses one to four tokens per player")
  end
  local chosen = (type(options.colors) == "table" and #options.colors >= player_count)
      and options.colors or rules.COLOURS
  local seen = {}
  for index = 1, player_count do
    local colour = chosen[index]
    local known = false
    for _, valid in ipairs(rules.COLOURS) do
      if valid == colour then known = true end
    end
    if not known or seen[colour] then
      error("seats must have four different Ludo colours")
    end
    seen[colour] = true
  end
  local players = {}
  for seat = 0, player_count - 1 do
    local tokens = {}
    for id = 0, tokens_per_player - 1 do
      tokens[id + 1] = { id = id, location = "home", progress = -1 }
    end
    local label = type(options.names) == "table" and options.names[seat + 1] or nil
    if type(label) == "string" then label = label:gsub("^%s+", ""):gsub("%s+$", "") end
    players[seat + 1] = {
      seat = seat,
      color = chosen[seat + 1],
      name = (type(label) == "string" and label ~= "") and label or nil,
      tokens = tokens,
      finished = 0,
      ai = options.ai and options.ai[seat + 1] == true or false,
    }
  end

  local settings = {}
  for key, value in pairs(rules.DEFAULT_RULES) do
    settings[key] = value
  end
  if type(options.rules) == "table" then
    for key, value in pairs(options.rules) do
      settings[key] = value
    end
  end

  return {
    players = players,
    playerCount = player_count,
    tokensPerPlayer = tokens_per_player,
    current = 0,
    phase = "roll",
    dice = nil,
    seed = rules.normalize_seed(options.seed),
    sixStreak = 0,
    extraTurn = false,
    winner = nil,
    ranking = {},
    action = 0,
    events = {},
    rules = settings,
  }
end

function rules.advance_turn(state)
  state.extraTurn = false
  state.dice = nil
  state.sixStreak = 0
  state.phase = "roll"
  if state.winner ~= nil then
    return
  end
  local next_seat = state.current
  local direction = state.rules.turnOrder == "reverse" and -1 or 1
  for _ = 1, state.playerCount do
    next_seat = (next_seat + direction + state.playerCount) % state.playerCount
    if player_at(state, next_seat).finished < state.tokensPerPlayer then
      state.current = next_seat
      return
    end
  end
  state.current = next_seat
end

local function apply_roll(state, value, seed)
  state.seed = seed
  state.dice = value
  state.phase = "move"
  log_event(state, { type = "roll", player = state.current, value = value, seed = seed })

  if value == 6 then
    state.sixStreak = state.sixStreak + 1
    if state.rules.threeSixesFoul and state.sixStreak >= 3 then
      log_event(state, { type = "six-foul", player = state.current })
      rules.advance_turn(state)
    end
  else
    state.sixStreak = 0
  end
end

function rules.roll_dice(state)
  if state.phase ~= "roll" then
    error("cannot roll while the game is in " .. tostring(state.phase) .. " phase")
  end
  if state.winner ~= nil then
    error("the game is over")
  end
  local roll = rules.roll_from_seed(state.seed)
  apply_roll(state, roll.value, roll.seed)
  return roll.value
end

local function tokens_on_square(state, colour, index)
  local found = {}
  for _, player in ipairs(state.players) do
    if player.color == colour then
      for _, token in ipairs(player.tokens) do
        if rules.on_track(token) and rules.track_index(colour, token.progress) == index then
          found[#found + 1] = { player = player.seat, token = token.id }
        end
      end
    end
  end
  return found
end
rules.tokens_on_square = tokens_on_square

local function is_blocked_by(state, colour, index)
  return state.rules.blocks and #tokens_on_square(state, colour, index) >= 2
end

function rules.legal_moves(state)
  if state.phase ~= "move" or state.dice == nil then
    return {}
  end
  local player = player_at(state, state.current)
  local die = state.dice
  local moves = {}

  for _, token in ipairs(player.tokens) do
    if token.location ~= "finished" then
      if token.location == "home" then
        if not (state.rules.sixToStart and die ~= 6) then
          moves[#moves + 1] = {
            player = player.seat,
            token = token.id,
            from = -1,
            to = 0,
            leavesHome = true,
            finishes = false,
            captures = {},
            safe = rules.is_safe_square(rules.START_INDEX[player.color]),
          }
        end
      else
        local raw = token.progress + die
        if not (state.rules.exactFinish and raw > rules.FINISH_PROGRESS) then
          local to = math.min(raw, rules.FINISH_PROGRESS)
          local safe = false
          local allowed = true
          local captures = {}

          if to <= 50 then
            local index = rules.track_index(player.color, to)
            safe = rules.is_safe_square(index)
            for _, other in ipairs(state.players) do
              if other.seat ~= player.seat and other.seat < state.playerCount then
                if is_blocked_by(state, other.color, index) then
                  allowed = false
                  break
                end
              end
            end
            if allowed and not (state.rules.safeSquares and safe) then
              for _, other in ipairs(state.players) do
                if other.seat ~= player.seat and other.seat < state.playerCount then
                  for _, foe in ipairs(other.tokens) do
                    if rules.on_track(foe) and rules.track_index(other.color, foe.progress) == index then
                      captures[#captures + 1] = { player = other.seat, token = foe.id }
                    end
                  end
                end
              end
            end
          end

          if allowed then
            moves[#moves + 1] = {
              player = player.seat,
              token = token.id,
              from = token.progress,
              to = to,
              leavesHome = false,
              finishes = to == rules.FINISH_PROGRESS,
              captures = captures,
              safe = safe,
            }
          end
        end
      end
    end
  end
  return moves
end

function rules.apply_move(state, token_id)
  if state.phase ~= "move" or state.dice == nil then
    error("cannot move while the game is in " .. tostring(state.phase) .. " phase")
  end
  local chosen = nil
  for _, move in ipairs(rules.legal_moves(state)) do
    if move.token == token_id then
      chosen = move
      break
    end
  end
  if chosen == nil then
    error("token " .. tostring(token_id) .. " cannot move")
  end

  local player = player_at(state, state.current)
  local token = player.tokens[token_id + 1]

  for _, capture in ipairs(chosen.captures) do
    local foe = player_at(state, capture.player).tokens[capture.token + 1]
    foe.location = "home"
    foe.progress = -1
  end
  if #chosen.captures > 0 then
    log_event(state, {
      type = "capture",
      player = player.seat,
      token = token_id,
      captured = chosen.captures,
    })
  end

  if chosen.leavesHome then
    token.location = "track"
    token.progress = 0
    log_event(state, { type = "leave-home", player = player.seat, token = token_id, from = -1, to = 0 })
  else
    token.progress = chosen.to
    if chosen.finishes then
      token.location = "finished"
      player.finished = player.finished + 1
      log_event(state, { type = "finish", player = player.seat, token = token_id, from = chosen.from, to = chosen.to })
    else
      token.location = chosen.to >= rules.HOME_COLUMN_START and "column" or "track"
      log_event(state, { type = "move", player = player.seat, token = token_id, from = chosen.from, to = chosen.to })
    end
  end

  local was_six = state.dice == 6
  local extra = state.rules.rushMode
    or (was_six and state.rules.sixExtra)
    or (#chosen.captures > 0 and state.rules.captureExtra)

  if player.finished == state.tokensPerPlayer then
    state.winner = player.seat
    state.ranking[#state.ranking + 1] = player.seat
    state.phase = "over"
    state.dice = nil
    state.extraTurn = false
    log_event(state, { type = "win", player = player.seat })
    return { move = chosen, extra = false, foul = false, won = true, nextPlayer = player.seat }
  end

  if extra then
    state.extraTurn = true
    state.phase = "roll"
    state.dice = nil
    if not was_six then
      state.sixStreak = 0
    end
    log_event(state, { type = "extra", player = player.seat })
    return { move = chosen, extra = true, foul = false, won = false, nextPlayer = player.seat }
  end

  rules.advance_turn(state)
  return { move = chosen, extra = false, foul = false, won = false, nextPlayer = state.current }
end

function rules.pass_turn(state)
  if state.phase ~= "move" then
    error("cannot pass while the game is in " .. tostring(state.phase) .. " phase")
  end
  log_event(state, { type = "no-move", player = state.current, value = state.dice })
  rules.advance_turn(state)
end

function rules.record_replay(state)
  local steps = {}
  for _, roll in ipairs(state.events) do
    if roll.type == "roll" then
      local token = nil
      for _, event in ipairs(state.events) do
        if event.action > roll.action then
          if event.type == "roll" then
            break
          end
          if event.type == "move" or event.type == "leave-home" or event.type == "finish"
            or event.type == "no-move" or event.type == "six-foul" then
            token = event.token
            break
          end
        end
      end
      steps[#steps + 1] = {
        roll = roll.value,
        seed = roll.seed or state.seed,
        token = token,
      }
    end
  end
  return steps
end

function rules.replay_steps(initial, steps)
  local state = rules.clone_state(initial)
  state.events = {}
  state.action = 0
  local frames = { rules.clone_state(state) }
  for _, step in ipairs(steps or {}) do
    if state.phase ~= "roll" or state.winner ~= nil then
      break
    end
    apply_roll(state, step.roll, step.seed)
    local phase = state.phase
    if phase == "move" then
      if step.token == nil then
        rules.pass_turn(state)
      else
        rules.apply_move(state, step.token)
      end
    end
    frames[#frames + 1] = rules.clone_state(state)
  end
  return frames
end

return rules
