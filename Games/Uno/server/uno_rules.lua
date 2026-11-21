local protocol = require("uno_protocol")

local rules = {}

rules.VERSION = 1
rules.HAND_SIZE = 7
rules.DRAW_TWO_AMOUNT = 2
rules.WILD_FOUR_AMOUNT = 4
rules.CHALLENGE_PENALTY = 6
rules.DEFAULT_SEED = 123456789
rules.MULTIPLIER = 1664525
rules.INCREMENT = 1013904223
rules.MODULUS = 4294967296

local function copy(value)
  if type(value) ~= "table" then
    return value
  end
  local result = {}
  for key, item in pairs(value) do
    result[key] = copy(item)
  end
  return result
end

function rules.clone_state(state)
  return copy(state)
end

function rules.normalize_seed(value)
  local parsed = tonumber(value) or rules.DEFAULT_SEED
  if parsed ~= parsed then
    return rules.DEFAULT_SEED
  end
  local absolute = math.abs(math.floor(parsed))
  return absolute % rules.MODULUS
end

function rules.next_seed(seed)
  return (rules.MULTIPLIER * rules.normalize_seed(seed) + rules.INCREMENT) % rules.MODULUS
end

function rules.random_int(seed, bound)
  if bound <= 0 then
    return 0
  end
  return math.floor((rules.next_seed(seed) / rules.MODULUS) * bound)
end

function rules.build_deck()
  local deck = {}
  for _, color in ipairs(protocol.COLORS) do
    for value = 0, 9 do
      local copies = value == 0 and 1 or 2
      for copy_index = 0, copies - 1 do
        deck[#deck + 1] = {
          id = string.format("%s-%d-%d", color, value, copy_index),
          color = color,
          kind = "number",
          value = value,
        }
      end
    end
    for _, kind in ipairs({ "skip", "reverse", "draw2" }) do
      for copy_index = 0, 1 do
        deck[#deck + 1] = {
          id = string.format("%s-%s-%d", color, kind, copy_index),
          color = color,
          kind = kind,
        }
      end
    end
  end
  for _, kind in ipairs({ "wild", "wild4" }) do
    for copy_index = 0, 3 do
      deck[#deck + 1] = {
        id = string.format("%s-%d", kind, copy_index),
        color = nil,
        kind = kind,
      }
    end
  end
  return deck
end

function rules.shuffle(seed, cards)
  local result = {}
  for index, card in ipairs(cards) do
    result[index] = card
  end
  local state = seed % rules.MODULUS
  for index = #result, 2, -1 do
    local pick = rules.random_int(state, index) + 1
    state = rules.next_seed(state)
    local temporary = result[index]
    result[index] = result[pick]
    result[pick] = temporary
  end
  return result, state
end

function rules.is_action_card(card)
  return card.kind ~= "number"
end

function rules.top_card(state)
  return state.discard[#state.discard]
end

function rules.current_player(state)
  return state.players[state.turn]
end

function rules.can_play(state, card)
  if card.kind == "wild" or card.kind == "wild4" then
    return true
  end
  local top = rules.top_card(state)
  if card.color == state.current_color then
    return true
  end
  if card.kind == "number" and top.kind == "number" then
    return card.value == top.value
  end
  return card.kind == top.kind
end

local function has_color_match(state, player)
  for _, card in ipairs(player.hand) do
    if card.kind == "wild" or card.kind == "wild4" or card.color == state.current_color then
      return true
    end
  end
  return false
end

function rules.legal_moves(state, player_id)
  if state.finished or state.pending_challenge ~= nil then
    return { cards = {}, can_draw = false }
  end
  local player = rules.current_player(state)
  if player == nil or player.id ~= player_id then
    return { cards = {}, can_draw = false }
  end
  local cards = {}
  for _, card in ipairs(player.hand) do
    local playable = rules.can_play(state, card)
      and not (card.kind == "wild4" and has_color_match(state, player))
    local drawn_match = state.drawn_card_id == nil or state.drawn_card_id == card.id
    if playable and drawn_match then
      cards[#cards + 1] = card.id
    end
  end
  return { cards = cards, can_draw = true }
end

function rules.create_game(seed, players, now)
  if #players < 2 or #players > 4 then
    error("Uno needs two to four players")
  end
  local state_seed = rules.normalize_seed(seed)
  local deck, next_seed = rules.shuffle(state_seed, rules.build_deck())
  state_seed = next_seed

  local dealt = {}
  for index, player in ipairs(players) do
    local hand = {}
    for _ = 1, rules.HAND_SIZE do
      hand[#hand + 1] = table.remove(deck, 1)
    end
    dealt[index] = { id = player.id, name = player.name, hand = hand }
  end

  local starter = table.remove(deck)
  while rules.is_action_card(starter) do
    table.insert(deck, 1, starter)
    state_seed = rules.next_seed(state_seed)
    starter = table.remove(deck)
  end

  return {
    version = rules.VERSION,
    seed = state_seed,
    draw_pile = deck,
    discard = { starter },
    players = dealt,
    turn = 1,
    direction = 1,
    current_color = starter.color,
    drawn_card_id = nil,
    pending_challenge = nil,
    started = true,
    finished = false,
    winner = nil,
    events = { { type = "game_start", at = 0 } },
    replay = {},
    created_at = now or 0,
  }
end

local function recycle_draw_pile(state)
  if #state.draw_pile > 0 or #state.discard < 2 then
    return
  end
  local top = table.remove(state.discard)
  local returned = {}
  for index, card in ipairs(state.discard) do
    returned[index] = card
  end
  state.discard = top == nil and {} or { top }
  state.draw_pile, state.seed = rules.shuffle(state.seed, returned)
end

local function draw_cards(state, player, count)
  for _ = 1, count do
    recycle_draw_pile(state)
    local card = table.remove(state.draw_pile)
    if card == nil then
      return
    end
    player.hand[#player.hand + 1] = card
  end
end

local function advance(state, steps)
  local count = #state.players
  for _ = 1, steps do
    state.turn = ((state.turn - 1 + state.direction + count * 4) % count) + 1
  end
end

local function target_index(state)
  local count = #state.players
  return ((state.turn - 1 + state.direction + count * 4) % count) + 1
end

local function fail(state, code)
  return state, false, code
end

function rules.most_common_color(hand)
  local counts = {}
  for _, color in ipairs(protocol.COLORS) do
    counts[color] = 0
  end
  for _, card in ipairs(hand) do
    if card.color ~= nil then
      counts[card.color] = (counts[card.color] or 0) + 1
    end
  end
  local best = protocol.COLORS[1]
  local best_count = -1
  for _, color in ipairs(protocol.COLORS) do
    if (counts[color] or 0) > best_count then
      best = color
      best_count = counts[color] or 0
    end
  end
  return best
end

function rules.apply_action(previous, action)
  if previous.finished then
    return fail(previous, protocol.ERROR.GAME_OVER)
  end

  local state = rules.clone_state(previous)
  local actor
  for _, player in ipairs(state.players) do
    if player.id == action.player_id then
      actor = player
      break
    end
  end
  local current = rules.current_player(state)
  if actor == nil or current == nil or current.id ~= actor.id then
    return fail(previous, protocol.ERROR.NOT_YOUR_TURN)
  end

  if state.pending_challenge ~= nil then
    if action.type ~= "challenge" or state.pending_challenge.target_id ~= action.player_id then
      return fail(previous, protocol.ERROR.BAD_CHALLENGE)
    end
    local pending = state.pending_challenge
    local owner, target
    for _, player in ipairs(state.players) do
      if player.id == pending.owner_id then
        owner = player
      elseif player.id == pending.target_id then
        target = player
      end
    end
    if owner == nil or target == nil then
      return fail(previous, protocol.ERROR.BAD_CHALLENGE)
    end
    state.pending_challenge = nil
    if action.accept then
      draw_cards(state, target, rules.CHALLENGE_PENALTY)
      if not pending.legal then
        draw_cards(state, owner, rules.WILD_FOUR_AMOUNT)
      end
      advance(state, 2)
    else
      draw_cards(state, target, rules.WILD_FOUR_AMOUNT)
      advance(state, 2)
    end
    state.events[#state.events + 1] = {
      type = "challenge",
      player_id = action.player_id,
      at = #state.events,
    }
    state.replay[#state.replay + 1] = {
      player_id = action.player_id,
      action = "challenge:" .. tostring(action.accept),
    }
    return state, true
  end

  if action.type == "draw" then
    draw_cards(state, actor, 1)
    local drawn = actor.hand[#actor.hand]
    state.drawn_card_id = drawn == nil and nil or drawn.id
    if drawn ~= nil and not rules.can_play(state, drawn) then
      state.drawn_card_id = nil
      advance(state, 1)
    end
    state.events[#state.events + 1] = {
      type = "draw",
      player_id = actor.id,
      at = #state.events,
    }
    state.replay[#state.replay + 1] = { player_id = actor.id, action = "draw" }
    return state, true
  end

  if action.type ~= "play" then
    return fail(previous, protocol.ERROR.ILLEGAL_CARD)
  end

  local index
  for candidate_index, card in ipairs(actor.hand) do
    if card.id == action.card_id then
      index = candidate_index
      break
    end
  end
  if index == nil then
    return fail(previous, protocol.ERROR.UNKNOWN_CARD)
  end
  local card = actor.hand[index]
  if not rules.can_play(state, card) then
    return fail(previous, protocol.ERROR.ILLEGAL_CARD)
  end
  if state.drawn_card_id ~= nil and state.drawn_card_id ~= card.id then
    return fail(previous, protocol.ERROR.ILLEGAL_CARD)
  end
  if (card.kind == "wild" or card.kind == "wild4") and action.chosen_color == nil then
    return fail(previous, protocol.ERROR.MISSING_COLOR)
  end
  local wild_four_legal = card.kind == "wild4" and not has_color_match(state, actor)
  if card.kind == "wild4" and not wild_four_legal then
    return fail(previous, protocol.ERROR.ILLEGAL_CARD)
  end

  table.remove(actor.hand, index)
  state.discard[#state.discard + 1] = card
  state.drawn_card_id = nil
  if action.chosen_color ~= nil then
    state.current_color = action.chosen_color
  end
  state.events[#state.events + 1] = {
    type = "play",
    player_id = actor.id,
    card_id = card.id,
    text = action.chosen_color,
    at = #state.events,
  }
  state.replay[#state.replay + 1] = {
    player_id = actor.id,
    action = "play",
    card_id = card.id,
    color = action.chosen_color,
  }

  if #actor.hand == 0 then
    state.finished = true
    state.winner = actor.id
    return state, true
  end

  local next_player = state.players[target_index(state)]
  if card.kind == "skip" then
    advance(state, 2)
  elseif card.kind == "reverse" then
    if #state.players == 2 then
      advance(state, 2)
    else
      state.direction = state.direction == 1 and -1 or 1
      advance(state, 1)
    end
  elseif card.kind == "draw2" then
    draw_cards(state, next_player, rules.DRAW_TWO_AMOUNT)
    advance(state, 2)
  elseif card.kind == "wild" then
    advance(state, 1)
  elseif card.kind == "wild4" then
    state.pending_challenge = {
      owner_id = actor.id,
      target_id = next_player.id,
      legal = wild_four_legal,
    }
  else
    advance(state, 1)
  end

  return state, true
end

function rules.score_hand(hand)
  local total = 0
  for _, card in ipairs(hand) do
    if card.kind == "number" then
      total = total + (card.value or 0)
    elseif card.kind == "wild" or card.kind == "wild4" then
      total = total + 50
    else
      total = total + 20
    end
  end
  return total
end

return rules
