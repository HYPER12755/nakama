local protocol = require("uno_protocol")

local rules = {}

rules.VERSION = 2
rules.HAND_SIZE = 7
rules.DRAW_TWO_AMOUNT = 2
rules.WILD_FOUR_AMOUNT = 4
rules.CHALLENGE_PENALTY = 6
rules.MERCY_LIMIT = 25
rules.DRAW_FOUR_AMOUNT = 4
rules.WILD_DRAW_SIX_AMOUNT = 6
rules.WILD_DRAW_TEN_AMOUNT = 10
rules.WILD_REVERSE_FOUR_AMOUNT = 4
rules.JUMP_WINDOW_MS = protocol.JUMP_WINDOW_MS

local WILD_KINDS = {
  wild = true, wild4 = true, wildAttack = true, wildDraw6 = true,
  wildDraw10 = true, wildReverse4 = true, wildRoulette = true,
  wildDraw2 = true, wildDrawColor = true,
}
local WILD_COLOR_KINDS = {
  wild = true, wild4 = true, wildAttack = true, wildDraw6 = true,
  wildDraw10 = true, wildReverse4 = true, wildDraw2 = true, wildDrawColor = true,
}

local FLIP_COLOR_MAP = {
  red = "pink", pink = "red",
  yellow = "orange", orange = "yellow",
  green = "teal", teal = "green",
  blue = "purple", purple = "blue",
}
local FLIP_KIND = {
  draw1 = "draw5", draw5 = "draw1",
  skip = "skipEveryone", skipEveryone = "skip",
  reverse = "reverse", flip = "flip", wild = "wild",
  wildDraw2 = "wildDrawColor", wildDrawColor = "wildDraw2",
}
local FLIP_KIND_ID = {
  draw1 = "draw1", draw5 = "draw5", skip = "skip", skipEveryone = "skipeveryone",
  reverse = "reverse", flip = "flip", wild = "wild",
  wildDraw2 = "wilddraw2", wildDrawColor = "wilddrawcolor",
}

function rules.flip_color(color)
  return FLIP_COLOR_MAP[color] or color
end

function rules.colors_for_side(side)
  return side == "dark" and protocol.DARK_COLORS or protocol.LIGHT_COLORS
end

function rules.flip_card(card)
  local side
  if card.id:sub(1, 6) == "light-" then
    side = "dark"
  elseif card.id:sub(1, 5) == "dark-" then
    side = "light"
  else
    return card
  end
  local kind = FLIP_KIND[card.kind] or card.kind
  local color
  if card.color ~= nil and not kind:find("^wild") then
    color = rules.flip_color(card.color)
  end
  local copy = tonumber(card.id:match("([^%-]+)$")) or 0
  local kind_id = card.kind == "number" and tostring(card.value or 0) or (FLIP_KIND_ID[kind] or kind)
  local id = color == nil
    and string.format("%s-%s-%d", side, kind_id, copy)
    or string.format("%s-%s-%s-%d", side, color, kind_id, copy)
  local result = { id = id, color = color, kind = kind }
  if card.value ~= nil then
    result.value = card.value
  end
  return result
end

function rules.draw_card_value(kind)
  if kind == "draw2" then return rules.DRAW_TWO_AMOUNT end
  if kind == "draw4" or kind == "wild4" or kind == "wildReverse4" then
    return rules.DRAW_FOUR_AMOUNT
  end
  if kind == "wildDraw6" then return rules.WILD_DRAW_SIX_AMOUNT end
  if kind == "wildDraw10" then return rules.WILD_DRAW_TEN_AMOUNT end
  return 0
end
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

local function press_launcher(state)
  local amount = rules.random_int(state.seed, 4)
  state.seed = rules.next_seed(state.seed)
  return amount
end

local function build_attack_deck()
  local deck = {}
  for _, color in ipairs(protocol.COLORS) do
    for value = 1, 9 do
      for copy_index = 0, 1 do
        deck[#deck + 1] = {
          id = string.format("%s-%d-%d", color, value, copy_index),
          color = color,
          kind = "number",
          value = value,
        }
      end
    end
    for _, kind in ipairs({ "hit1", "hit2", "discardAll" }) do
      local copies = kind == "hit1" and 1 or 2
      for copy_index = 0, copies - 1 do
        local id = kind == "discardAll" and string.format("%s-discardall-%d", color, copy_index)
          or string.format("%s-%s-%d", color, kind, copy_index)
        deck[#deck + 1] = { id = id, color = color, kind = kind }
      end
    end
    for _, kind in ipairs({ "reverse", "skip" }) do
      local copies = kind == "reverse" and 1 or 2
      for copy_index = 0, copies - 1 do
        deck[#deck + 1] = {
          id = string.format("%s-%s-%d", color, kind, copy_index),
          color = color,
          kind = kind,
        }
      end
    end
  end
  for _, kind in ipairs({ "wild", "wildAttack" }) do
    for copy_index = 0, 3 do
      local id = kind == "wildAttack"
        and string.format("wildattack-%d", copy_index)
        or string.format("%s-%d", kind, copy_index)
      deck[#deck + 1] = { id = id, color = nil, kind = kind }
    end
  end
  return deck
end

local function build_no_mercy_deck()
  local deck = {}
  for _, color in ipairs(protocol.COLORS) do
    for value = 0, 9 do
      for copy_index = 0, 1 do
        deck[#deck + 1] = {
          id = string.format("%s-%d-%d", color, value, copy_index),
          color = color,
          kind = "number",
          value = value,
        }
      end
    end
    for _, kind in ipairs({ "skip", "reverse", "draw2", "discardAll" }) do
      for copy_index = 0, 2 do
        local id = kind == "discardAll"
          and string.format("%s-discardall-%d", color, copy_index)
          or string.format("%s-%s-%d", color, kind, copy_index)
        deck[#deck + 1] = { id = id, color = color, kind = kind }
      end
    end
    for _, kind in ipairs({ "draw4", "skipEveryone" }) do
      for copy_index = 0, 1 do
        local id = kind == "draw4"
          and string.format("%s-draw4-%d", color, copy_index)
          or string.format("%s-skipeveryone-%d", color, copy_index)
        deck[#deck + 1] = { id = id, color = color, kind = kind }
      end
    end
  end
  for _, entry in ipairs({
    { kind = "wildDraw6", copies = 4 },
    { kind = "wildDraw10", copies = 4 },
    { kind = "wildReverse4", copies = 8 },
    { kind = "wildRoulette", copies = 8 },
  }) do
    local id_prefix = entry.kind == "wildDraw6" and "wilddraw6"
      or entry.kind == "wildDraw10" and "wilddraw10"
      or entry.kind == "wildReverse4" and "wildreverse4"
      or "wildroulette"
    for copy_index = 0, entry.copies - 1 do
      deck[#deck + 1] = {
        id = string.format("%s-%d", id_prefix, copy_index),
        color = nil,
        kind = entry.kind,
      }
    end
  end
  return deck
end

local function build_flip_deck()
  local deck = {}
  for _, color in ipairs(protocol.LIGHT_COLORS) do
    for value = 1, 9 do
      for copy_index = 0, 1 do
        deck[#deck + 1] = {
          id = string.format("light-%s-%d-%d", color, value, copy_index),
          color = color,
          kind = "number",
          value = value,
        }
      end
    end
    for _, kind in ipairs({ "draw1", "reverse", "skip", "flip" }) do
      for copy_index = 0, 1 do
        deck[#deck + 1] = {
          id = string.format("light-%s-%s-%d", color, kind, copy_index),
          color = color,
          kind = kind,
        }
      end
    end
  end
  for copy_index = 0, 3 do
    deck[#deck + 1] = { id = string.format("light-wild-%d", copy_index), color = nil, kind = "wild" }
    deck[#deck + 1] = { id = string.format("light-wilddraw2-%d", copy_index), color = nil, kind = "wildDraw2" }
  end
  return deck
end

function rules.build_deck(mode)
  if mode == "flip" then
    return build_flip_deck()
  end
  if mode == "attack" then
    return build_attack_deck()
  end
  if mode == "noMercy" then
    return build_no_mercy_deck()
  end
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
  if WILD_KINDS[card.kind] then
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

local function valid_color(state, color)
  local colors = state.mode == "flip" and protocol.ALL_COLORS or protocol.COLORS
  for _, candidate in ipairs(colors) do
    if candidate == color then
      return true
    end
  end
  return false
end

local function has_color_match(state, player)
  for _, card in ipairs(player.hand) do
    if card.color == state.current_color then
      return true
    end
  end
  return false
end

local function can_play_card(state, _player, card)
  return rules.can_play(state, card)
end

function rules.legal_moves(state, player_id, now)
  if state.finished then
    return { cards = {}, can_draw = false }
  end
  local viewer
  for _, candidate in ipairs(state.players) do
    if candidate.id == player_id then
      viewer = candidate
      break
    end
  end
  if viewer == nil or viewer.out then
    return { cards = {}, can_draw = false }
  end
  if state.pending_roulette ~= nil then
    return { cards = {}, can_draw = false }
  end
  local clock = now or 0
  local window = state.mode == "jumpIn" and state.jump_window or nil
  if window ~= nil and clock < window.expires_at then
    if player_id == window.owner_id then
      return { cards = {}, can_draw = false }
    end
    local viewer
    for _, candidate in ipairs(state.players) do
      if candidate.id == player_id then
        viewer = candidate
        break
      end
    end
    local window_card = rules.top_card(state)
    if viewer == nil or window_card == nil or window_card.id ~= window.card_id
      or window_card.kind ~= "number" then
      return { cards = {}, can_draw = false }
    end
    local cards = {}
    for _, card in ipairs(viewer.hand) do
      if card.kind == "number" and card.color == window_card.color and card.value == window_card.value then
        cards[#cards + 1] = card.id
      end
    end
    return { cards = cards, can_draw = false }
  end
  if state.pending_hit ~= nil then
    if state.pending_hit.target_id ~= player_id then
      return { cards = {}, can_draw = false }
    end
    local hit_player
    for _, candidate in ipairs(state.players) do
      if candidate.id == player_id then
        hit_player = candidate
        break
      end
    end
    if hit_player == nil then
      return { cards = {}, can_draw = false }
    end
    local cards = {}
    for _, card in ipairs(hit_player.hand) do
      if card.kind == "hit1" or card.kind == "hit2" or card.kind == "wildAttack" then
        cards[#cards + 1] = card.id
      end
    end
    return { cards = cards, can_draw = true }
  end
  if state.pending_stack ~= nil then
    if state.pending_stack.target_id ~= player_id then
      return { cards = {}, can_draw = false }
    end
    local stack_player
    for _, candidate in ipairs(state.players) do
      if candidate.id == player_id then
        stack_player = candidate
        break
      end
    end
    if stack_player == nil then
      return { cards = {}, can_draw = false }
    end
    local cards = {}
    for _, card in ipairs(stack_player.hand) do
      local eligible = false
      if state.mode == "noMercy" then
        eligible = rules.draw_card_value(card.kind) >= (state.pending_stack.value or 0)
      else
        eligible = card.kind == state.pending_stack.kind
      end
      if eligible then
        cards[#cards + 1] = card.id
      end
    end
    return { cards = cards, can_draw = true }
  end
  if state.pending_challenge ~= nil then
    return { cards = {}, can_draw = false }
  end
  local player = rules.current_player(state)
  if player == nil or player.id ~= player_id then
    return { cards = {}, can_draw = false }
  end
  local cards = {}
  for _, card in ipairs(player.hand) do
    local playable = can_play_card(state, player, card)
    local drawn_match = state.mode == "attack" or state.drawn_card_id == nil
      or state.drawn_card_id == card.id
    if playable and drawn_match then
      cards[#cards + 1] = card.id
    end
  end
  local can_draw = state.mode == "attack"
    or (state.drawn_card_id == nil
      and (#cards == 0 or state.mode ~= "noMercy"))
  return { cards = cards, can_draw = can_draw }
end

function rules.clear_jump_window(state, now)
  if state.jump_window == nil or (now or 0) < state.jump_window.expires_at then
    return state
  end
  local next_state = rules.clone_state(state)
  next_state.jump_window = nil
  return next_state
end

local function most_common_color(hand, options)
  local colors = options or protocol.COLORS
  local counts = {}
  for _, color in ipairs(colors) do
    counts[color] = 0
  end
  for _, card in ipairs(hand) do
    if card.color ~= nil then
      counts[card.color] = (counts[card.color] or 0) + 1
    end
  end
  local best = colors[1]
  local best_count = -1
  for _, color in ipairs(colors) do
    if (counts[color] or 0) > best_count then
      best = color
      best_count = counts[color] or 0
    end
  end
  return best
end

function rules.create_game(seed, players, now, mode)
  if #players < 2 or #players > 4 then
    error("Uno needs two to four players")
  end
  local rules_mode = protocol.normalize_rules_mode(mode)
  local state_seed = rules.normalize_seed(seed)
  local deck, next_seed = rules.shuffle(state_seed, rules.build_deck(rules_mode))
  state_seed = next_seed

  local dealt = {}
  for index, player in ipairs(players) do
    local hand = {}
    for _ = 1, rules.HAND_SIZE do
      hand[#hand + 1] = table.remove(deck, 1)
    end
    dealt[index] = { id = player.id, name = player.name, hand = hand, out = false }
  end

  local starter = table.remove(deck)
  while (rules_mode == "noMercy" and starter.kind ~= "number")
    or (rules_mode ~= "noMercy" and starter.kind == "wild4") do
    table.insert(deck, 1, starter)
    state_seed = rules.next_seed(state_seed)
    starter = table.remove(deck)
  end
  if starter.kind == "wild" or starter.kind == "wildAttack"
    or (rules_mode == "flip" and starter.kind:find("^wild") ~= nil) then
    starter.color = most_common_color(dealt[1].hand, rules.colors_for_side("light"))
  end

  local starting_rule = {
    kind = starter.kind,
    color = starter.color,
    turn = 1,
    direction = 1,
    drew_cards = {},
  }
  if starter.kind == "skip" then
    starting_rule.turn = 2
  elseif starter.kind == "reverse" then
    starting_rule.turn = #dealt
    starting_rule.direction = -1
  elseif starter.kind == "draw2" then
    local target = dealt[1]
    for _ = 1, rules.DRAW_TWO_AMOUNT do
      local drawn = table.remove(deck)
      if drawn == nil then break end
      target.hand[#target.hand + 1] = drawn
      starting_rule.drew_cards[#starting_rule.drew_cards + 1] = drawn.id
    end
    starting_rule.turn = 2
  end

  return {
    version = rules.VERSION,
    mode = rules_mode,
    seed = state_seed,
    draw_pile = deck,
    discard = { starter },
    players = dealt,
    turn = starting_rule.turn,
    direction = starting_rule.direction,
    current_color = starter.color,
    flip_side = "light",
    drawn_card_id = nil,
    pending_challenge = nil,
    pending_stack = nil,
    pending_hit = nil,
    pending_roulette = nil,
    jump_window = nil,
    starting_rule = starting_rule,
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

local next_active_index

local function check_mercy(state)
  if state.mode ~= "noMercy" or state.finished then
    return
  end
  for _, player in ipairs(state.players) do
    if not player.out and #player.hand >= rules.MERCY_LIMIT then
      player.out = true
    end
  end
  local active_count = 0
  local last_active
  for _, player in ipairs(state.players) do
    if not player.out then
      active_count = active_count + 1
      last_active = player
    end
  end
  if active_count <= 1 then
    state.finished = true
    if active_count == 1 then
      state.winner = last_active.id
    end
    state.pending_challenge = nil
    state.pending_stack = nil
    state.pending_hit = nil
    state.pending_roulette = nil
    return
  end
  if state.players[state.turn] ~= nil and state.players[state.turn].out then
    state.turn = next_active_index(state, state.turn)
  end
end

local function draw_cards(state, player, count)
  for _ = 1, count do
    recycle_draw_pile(state)
    local card = table.remove(state.draw_pile)
    if card == nil then
      break
    end
    player.hand[#player.hand + 1] = card
  end
  check_mercy(state)
end

local function draw_until_color(state, player, color)
  local budget = #state.draw_pile + #state.discard + 1
  while budget > 0 do
    budget = budget - 1
    recycle_draw_pile(state)
    local card = table.remove(state.draw_pile)
    if card == nil then
      break
    end
    player.hand[#player.hand + 1] = card
    if card.color == color then
      break
    end
  end
  check_mercy(state)
end

local function apply_flip(state, actor, chosen_color)
  for index, card in ipairs(state.draw_pile) do
    state.draw_pile[index] = rules.flip_card(card)
  end
  for index, card in ipairs(state.discard) do
    state.discard[index] = rules.flip_card(card)
  end
  for _, player in ipairs(state.players) do
    for index, card in ipairs(player.hand) do
      player.hand[index] = rules.flip_card(card)
    end
  end
  local reversed_draw = {}
  for index = #state.draw_pile, 1, -1 do
    reversed_draw[#reversed_draw + 1] = state.draw_pile[index]
  end
  state.draw_pile = reversed_draw
  local reversed_discard = {}
  for index = #state.discard, 1, -1 do
    reversed_discard[#reversed_discard + 1] = state.discard[index]
  end
  state.discard = reversed_discard
  state.flip_side = state.flip_side == "light" and "dark" or "light"
  local new_top = rules.top_card(state)
  if new_top == nil then
    return
  end
  if new_top.color ~= nil then
    state.current_color = new_top.color
  else
    state.current_color = chosen_color
      or most_common_color(actor.hand, rules.colors_for_side(state.flip_side))
  end
end

function rules.active_players(state)
  local result = {}
  for _, player in ipairs(state.players) do
    if not player.out then
      result[#result + 1] = player
    end
  end
  return result
end

next_active_index = function(state, from)
  local count = #state.players
  local index = ((from - 1 + state.direction + count * 4) % count) + 1
  for _ = 1, count do
    if not state.players[index].out then
      return index
    end
    index = ((index - 1 + state.direction + count * 4) % count) + 1
  end
  return from
end

local function advance(state, steps)
  if state.finished then
    return
  end
  for _ = 1, steps do
    state.turn = next_active_index(state, state.turn)
  end
end

local function target_index(state)
  return next_active_index(state, state.turn)
end

local function fail(state, code)
  return state, false, code
end

function rules.most_common_color(hand, options)
  return most_common_color(hand, options)
end

function rules.pick_target(state, player_id)
  local best
  for _, player in ipairs(state.players) do
    if player.id ~= player_id and not player.out then
      if best == nil or #player.hand > #best.hand then
        best = player
      end
    end
  end
  return best == nil and nil or best.id
end

local player_index

local function reverse_draw_target_id(state, actor_index)
  if #rules.active_players(state) == 2 then
    return state.players[actor_index].id
  end
  return state.players[next_active_index(state, actor_index)].id
end

local function start_no_mercy_stack(state, card, owner, target_id, chosen_color)
  local value = rules.draw_card_value(card.kind)
  state.pending_stack = {
    kind = card.kind,
    amount = value,
    value = value,
    owner_id = owner.id,
    target_id = target_id,
  }
  if chosen_color ~= nil then
    state.pending_stack.color = chosen_color
  end
  if #owner.hand == 0 then
    state.pending_stack.pending_winner_id = owner.id
  end
  state.turn = player_index(state, target_id)
end

player_index = function(state, player_id)
  for index, player in ipairs(state.players) do
    if player.id == player_id then
      return index
    end
  end
  return nil
end

local function stack_amount(kind)
  return kind == "draw2" and rules.DRAW_TWO_AMOUNT or rules.WILD_FOUR_AMOUNT
end

local function finish_deferred_winner(state, pending_winner_id)
  if state.finished or pending_winner_id == nil then
    return
  end
  local winner_index = player_index(state, pending_winner_id)
  local winner = winner_index == nil and nil or state.players[winner_index]
  if winner ~= nil and #winner.hand == 0 then
    state.finished = true
    state.winner = winner.id
  end
end

local function apply_stack_resolution(state, stack, accept)
  local pending_winner_id = stack.pending_winner_id
  local pending = state.pending_challenge
  local target_index_value = player_index(state, stack.target_id)
  local target = target_index_value == nil and nil or state.players[target_index_value]
  local owner = nil
  if pending ~= nil then
    local owner_index = player_index(state, pending.owner_id)
    owner = owner_index == nil and nil or state.players[owner_index]
  end
  state.pending_stack = nil
  state.pending_challenge = nil
  local turn_before = state.turn
  if stack.kind == "wild4" and accept ~= nil and owner ~= nil and target ~= nil then
    if accept then
      if pending.legal then
        draw_cards(state, target, stack.amount + 2)
      else
        draw_cards(state, owner, stack.amount)
      end
    else
      draw_cards(state, target, stack.amount)
    end
    if not state.finished then
      state.turn = turn_before
    end
    advance(state, 2)
    state.events[#state.events + 1] = {
      type = "challenge",
      player_id = target.id,
      at = #state.events,
    }
    state.replay[#state.replay + 1] = {
      player_id = target.id,
      action = "challenge:" .. tostring(accept),
    }
  elseif target ~= nil then
    draw_cards(state, target, stack.amount)
    if not state.finished then
      state.turn = turn_before
    end
    advance(state, (state.mode == "noMercy" or stack.kind == "draw2") and 1 or 2)
    state.events[#state.events + 1] = {
      type = "draw",
      player_id = target.id,
      at = #state.events,
    }
    state.replay[#state.replay + 1] = { player_id = target.id, action = "draw" }
  end
  finish_deferred_winner(state, pending_winner_id)
end

function rules.apply_action(previous, action, now)
  if previous.finished then
    return fail(previous, protocol.ERROR.GAME_OVER)
  end

  local state = rules.clone_state(previous)
  check_mercy(state)
  if state.finished then
    return state, true
  end
  local clock = now or 0
  local actor
  for _, player in ipairs(state.players) do
    if player.id == action.player_id then
      actor = player
      break
    end
  end
  if actor ~= nil and actor.out then
    return fail(previous, protocol.ERROR.NOT_YOUR_TURN)
  end
  local window = state.mode == "jumpIn" and state.jump_window or nil
  if window ~= nil and clock < window.expires_at then
    if actor == nil or actor.id == window.owner_id or action.type ~= "play" or action.jump ~= true then
      return fail(previous, protocol.ERROR.JUMP_WINDOW_OPEN)
    end
    local window_card = rules.top_card(state)
    local jump_index
    for candidate_index, card in ipairs(actor.hand) do
      if card.id == action.card_id then
        jump_index = candidate_index
        break
      end
    end
    local jump_card = jump_index == nil and nil or actor.hand[jump_index]
    if jump_card == nil or window_card == nil or window_card.id ~= window.card_id
      or window_card.kind ~= "number" or jump_card.kind ~= "number"
      or jump_card.color == nil or jump_card.color ~= window_card.color
      or jump_card.value ~= window_card.value then
      return fail(previous, protocol.ERROR.BAD_JUMP)
    end
    table.remove(actor.hand, jump_index)
    state.discard[#state.discard + 1] = jump_card
    state.drawn_card_id = nil
    state.events[#state.events + 1] = {
      type = "jump",
      player_id = actor.id,
      card_id = jump_card.id,
      at = #state.events,
    }
    state.replay[#state.replay + 1] = {
      player_id = actor.id,
      action = "jump",
      card_id = jump_card.id,
    }
    state.turn = player_index(state, actor.id)
    advance(state, 1)
    state.jump_window = {
      card_id = jump_card.id,
      owner_id = actor.id,
      expires_at = clock + rules.JUMP_WINDOW_MS,
    }
    if #actor.hand == 0 then
      state.finished = true
      state.winner = actor.id
      state.jump_window = nil
    end
    return state, true
  end
  if window ~= nil then
    state.jump_window = nil
  end
  if state.mode == "jumpIn" and action.type == "play" and action.jump == true then
    return fail(previous, protocol.ERROR.BAD_JUMP)
  end
  if state.pending_roulette ~= nil then
    local roulette = state.pending_roulette
    if actor == nil or roulette.chooser_id ~= actor.id
      or (action.type ~= "choose_colour" and action.type ~= "chooseColour") then
      return fail(previous, protocol.ERROR.NOT_YOUR_TURN)
    end
    local color = action.colour or action.color or action.chosen_color
    if not valid_color(state, color) then
      return fail(previous, protocol.ERROR.MISSING_COLOR)
    end
    local budget = #state.draw_pile + #state.discard + 1
    while budget > 0 do
      budget = budget - 1
      recycle_draw_pile(state)
      local revealed = table.remove(state.draw_pile)
      if revealed == nil then
        break
      end
      actor.hand[#actor.hand + 1] = revealed
      check_mercy(state)
      if revealed.color == color or state.finished then
        break
      end
    end
    state.pending_roulette = nil
    check_mercy(state)
    if not state.finished then
      advance(state, 1)
    end
    state.events[#state.events + 1] = {
      type = "roulette",
      player_id = actor.id,
      text = color,
      at = #state.events,
    }
    state.replay[#state.replay + 1] = {
      player_id = actor.id,
      action = "choose_colour:" .. color,
    }
    return state, true
  end
  if state.pending_hit ~= nil then
    local hit = state.pending_hit
    if actor == nil or hit.target_id ~= actor.id then
      return fail(previous, protocol.ERROR.NOT_YOUR_TURN)
    end
    if action.type == "draw" then
      for _ = 1, hit.amount do
        draw_cards(state, actor, press_launcher(state))
      end
      state.pending_hit = nil
      advance(state, 1)
      local owner_index = player_index(state, hit.owner_id)
      if owner_index ~= nil and #state.players[owner_index].hand == 0 then
        state.finished = true
        state.winner = state.players[owner_index].id
      end
      state.events[#state.events + 1] = {
        type = "launcher",
        player_id = actor.id,
        at = #state.events,
      }
      state.replay[#state.replay + 1] = { player_id = actor.id, action = "launcher" }
      return state, true
    end
    if action.type ~= "play" then
      return fail(previous, protocol.ERROR.ILLEGAL_CARD)
    end
    local hit_index
    for candidate_index, card in ipairs(actor.hand) do
      if card.id == action.card_id then
        hit_index = candidate_index
        break
      end
    end
    if hit_index == nil then
      return fail(previous, protocol.ERROR.UNKNOWN_CARD)
    end
    local hit_card = actor.hand[hit_index]
    if hit_card.kind ~= "hit1" and hit_card.kind ~= "hit2" and hit_card.kind ~= "wildAttack" then
      return fail(previous, protocol.ERROR.ILLEGAL_CARD)
    end
    if hit_card.kind == "wildAttack" and action.chosen_color == nil then
      return fail(previous, protocol.ERROR.MISSING_COLOR)
    end
    local actor_index = player_index(state, actor.id)
    local player_count = #state.players
    local next_index = ((actor_index - 1 + state.direction + player_count * 4) % player_count) + 1
    local hit_target_id = state.players[next_index].id
    if hit_card.kind == "wildAttack" then
      local requested = action.target_id or action.targetId
      if requested ~= nil and requested ~= "" then
        local found = false
        for _, player in ipairs(state.players) do
          if player.id == requested and player.id ~= actor.id then
            found = true
            break
          end
        end
        if not found then
          return fail(previous, protocol.ERROR.MISSING_TARGET)
        end
        hit_target_id = requested
      end
    end
    table.remove(actor.hand, hit_index)
    state.discard[#state.discard + 1] = hit_card
    state.drawn_card_id = nil
    if hit_card.kind == "wildAttack" and action.chosen_color ~= nil then
      state.current_color = action.chosen_color
    elseif hit_card.color ~= nil then
      state.current_color = hit_card.color
    end
    state.events[#state.events + 1] = {
      type = "play",
      player_id = actor.id,
      card_id = hit_card.id,
      text = action.chosen_color,
      at = #state.events,
    }
    state.replay[#state.replay + 1] = {
      player_id = actor.id,
      action = "play",
      card_id = hit_card.id,
      color = action.chosen_color,
    }
    state.pending_hit = {
      amount = hit.amount + (hit_card.kind == "hit1" and 1 or 2),
      owner_id = actor.id,
      target_id = hit_target_id,
    }
    state.turn = player_index(state, hit_target_id)
    return state, true
  end
  if state.pending_stack ~= nil then
    local stack = state.pending_stack
    if actor == nil or stack.target_id ~= actor.id then
      return fail(previous, protocol.ERROR.BAD_CHALLENGE)
    end
    if action.type == "challenge" then
      if stack.kind ~= "wild4" or state.pending_challenge == nil
        or state.pending_challenge.target_id ~= actor.id then
        return fail(previous, protocol.ERROR.BAD_CHALLENGE)
      end
      apply_stack_resolution(state, stack, action.accept == true)
      return state, true
    end
    if action.type == "draw" then
      apply_stack_resolution(state, stack, nil)
      return state, true
    end
    if action.type ~= "play" then
      return fail(previous, protocol.ERROR.ILLEGAL_CARD)
    end
    local stack_index
    for candidate_index, card in ipairs(actor.hand) do
      if card.id == action.card_id then
        stack_index = candidate_index
        break
      end
    end
    if stack_index == nil then
      return fail(previous, protocol.ERROR.UNKNOWN_CARD)
    end
    local stack_card = actor.hand[stack_index]
    local no_mercy = state.mode == "noMercy"
    local card_value = rules.draw_card_value(stack_card.kind)
    local eligible = no_mercy
      and card_value > 0 and card_value >= (stack.value or 0)
      or (not no_mercy and stack_card.kind == stack.kind)
    if not eligible then
      return fail(previous, protocol.ERROR.ILLEGAL_CARD)
    end
    if state.drawn_card_id ~= nil and state.drawn_card_id ~= stack_card.id then
      return fail(previous, protocol.ERROR.ILLEGAL_CARD)
    end
    if ((stack_card.kind == "wild4") or (no_mercy and WILD_COLOR_KINDS[stack_card.kind]))
      and action.chosen_color == nil then
      return fail(previous, protocol.ERROR.MISSING_COLOR)
    end
    local stack_legal = stack_card.kind == "wild4" and not has_color_match(state, actor)
    local actor_index = player_index(state, actor.id)
    table.remove(actor.hand, stack_index)
    state.discard[#state.discard + 1] = stack_card
    state.drawn_card_id = nil
    if action.chosen_color ~= nil then
      state.current_color = action.chosen_color
    end
    state.events[#state.events + 1] = {
      type = "play",
      player_id = actor.id,
      card_id = stack_card.id,
      text = action.chosen_color,
      at = #state.events,
    }
    state.replay[#state.replay + 1] = {
      player_id = actor.id,
      action = "play",
      card_id = stack_card.id,
      color = action.chosen_color,
    }
    if no_mercy then
      if stack_card.kind == "wildReverse4" then
        state.direction = state.direction == 1 and -1 or 1
      end
      stack.kind = stack_card.kind
      stack.value = card_value
      stack.amount = stack.amount + card_value
      stack.owner_id = actor.id
      local target_id = stack_card.kind == "wildReverse4"
        and reverse_draw_target_id(state, actor_index)
        or state.players[next_active_index(state, actor_index)].id
      stack.target_id = target_id
      if action.chosen_color ~= nil then
        stack.color = action.chosen_color
      end
      state.turn = player_index(state, target_id)
    else
      if stack_card.kind == "wild4" then
        state.turn = actor_index
      end
      local next_index = target_index(state)
      stack.amount = stack.amount + stack_amount(stack.kind)
      stack.owner_id = actor.id
      stack.target_id = state.players[next_index].id
      if stack_card.kind == "wild4" then
        stack.legal = stack_legal
        stack.color = action.chosen_color
        state.pending_challenge = {
          owner_id = actor.id,
          target_id = stack.target_id,
          legal = stack_legal,
        }
      else
        advance(state, 1)
      end
    end
    if #actor.hand == 0 and stack.pending_winner_id == nil then
      stack.pending_winner_id = actor.id
    end
    return state, true
  end

  if state.pending_challenge ~= nil then
    if actor == nil or action.type ~= "challenge" or state.pending_challenge.target_id ~= action.player_id then
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
    local challenge_kind = pending.kind or "wild4"
    local amount = pending.amount
      or (challenge_kind == "wildDraw2" and rules.DRAW_TWO_AMOUNT or rules.WILD_FOUR_AMOUNT)
    if challenge_kind == "wildDrawColor" then
      local color = pending.color or state.current_color
      if action.accept then
        if pending.legal then
          draw_until_color(state, target, color)
          draw_cards(state, target, 2)
        else
          draw_until_color(state, owner, color)
        end
      else
        draw_until_color(state, target, color)
      end
      advance(state, 2)
    elseif action.accept then
      if pending.legal then
        draw_cards(state, target, amount + 2)
      else
        draw_cards(state, owner, amount)
      end
      advance(state, 2)
    else
      draw_cards(state, target, amount)
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
    if #owner.hand == 0 then
      state.finished = true
      state.winner = owner.id
    end
    return state, true
  end

  local current = rules.current_player(state)
  if actor == nil or current == nil or current.id ~= actor.id then
    return fail(previous, protocol.ERROR.NOT_YOUR_TURN)
  end

  if action.type == "draw" then
    if state.mode == "attack" then
      for _ = 1, press_launcher(state) do
        draw_cards(state, actor, 1)
      end
      state.drawn_card_id = nil
      advance(state, 1)
      state.events[#state.events + 1] = {
        type = "launcher",
        player_id = actor.id,
        at = #state.events,
      }
      state.replay[#state.replay + 1] = { player_id = actor.id, action = "launcher" }
      return state, true
    end
    if state.drawn_card_id ~= nil then
      return fail(previous, protocol.ERROR.ILLEGAL_CARD)
    end
    if state.mode == "noMercy" then
      local playable = false
      for _, held in ipairs(actor.hand) do
        if can_play_card(state, actor, held) then
          playable = true
          break
        end
      end
      if playable then
        return fail(previous, protocol.ERROR.ILLEGAL_CARD)
      end
      local found = false
      local budget = #state.draw_pile + #state.discard + 1
      while budget > 0 and not state.finished and not actor.out do
        budget = budget - 1
        recycle_draw_pile(state)
        local drawn = table.remove(state.draw_pile)
        if drawn == nil then
          break
        end
        actor.hand[#actor.hand + 1] = drawn
        check_mercy(state)
        if state.finished or actor.out then
          break
        end
        if can_play_card(state, actor, drawn) then
          state.drawn_card_id = drawn.id
          found = true
          break
        end
      end
      if not found and not state.finished then
        state.drawn_card_id = nil
        advance(state, 1)
      end
      state.events[#state.events + 1] = { type = "draw", player_id = actor.id, at = #state.events }
      state.replay[#state.replay + 1] = { player_id = actor.id, action = "draw" }
      return state, true
    end
    draw_cards(state, actor, 1)
    local drawn = actor.hand[#actor.hand]
    state.drawn_card_id = drawn == nil and nil or drawn.id
    if drawn ~= nil and not can_play_card(state, actor, drawn) then
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
  if WILD_COLOR_KINDS[card.kind] and action.chosen_color == nil then
    return fail(previous, protocol.ERROR.MISSING_COLOR)
  end
  local wild_challenge_legal = (card.kind == "wild4" or card.kind == "wildDraw2"
    or card.kind == "wildDrawColor") and not has_color_match(state, actor)

  local attack_target_id
  if state.mode == "attack" and card.kind == "wildAttack" then
    local requested = action.target_id or action.targetId
    if requested == nil or requested == "" then
      return fail(previous, protocol.ERROR.MISSING_TARGET)
    end
    local found = false
    for _, player in ipairs(state.players) do
      if player.id == requested and player.id ~= actor.id then
        found = true
        break
      end
    end
    if not found then
      return fail(previous, protocol.ERROR.MISSING_TARGET)
    end
    attack_target_id = requested
  end

  local seven_o_active = state.mode == "sevenO" or state.mode == "noMercy"
  local swap_target
  if seven_o_active and card.kind == "number" and card.value == 7 then
    local target_id = action.target_id or action.targetId
    if target_id == nil or target_id == "" then
      return fail(previous, protocol.ERROR.MISSING_TARGET)
    end
    for _, player in ipairs(state.players) do
      if player.id == target_id and player.id ~= actor.id and not player.out then
        swap_target = player
        break
      end
    end
    if swap_target == nil then
      return fail(previous, protocol.ERROR.MISSING_TARGET)
    end
  end

  table.remove(actor.hand, index)
  state.discard[#state.discard + 1] = card
  state.drawn_card_id = nil
  if action.chosen_color ~= nil then
    state.current_color = action.chosen_color
  elseif (state.mode == "attack" or state.mode == "noMercy") and card.color ~= nil
    and card.kind ~= "draw4" then
    state.current_color = card.color
  end
  if (state.mode == "attack" or state.mode == "noMercy") and card.kind == "discardAll" and card.color ~= nil then
    local kept = {}
    for _, held in ipairs(actor.hand) do
      if held.color ~= card.color then
        kept[#kept + 1] = held
      else
        state.discard[#state.discard + 1] = held
      end
    end
    actor.hand = kept
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

  if seven_o_active and card.kind == "number" then
    if card.value == 7 and swap_target ~= nil then
      local actor_hand = actor.hand
      actor.hand = swap_target.hand
      swap_target.hand = actor_hand
    elseif card.value == 0 then
      local original = {}
      for hand_index, player in ipairs(state.players) do
        original[hand_index] = player.hand
      end
      local count = #state.players
      for hand_index = 1, count do
        if not state.players[hand_index].out then
          local from = ((hand_index - 1 - state.direction + count * 4) % count) + 1
          for _ = 1, count do
            if not state.players[from].out then
              break
            end
            from = ((from - 1 - state.direction + count * 4) % count) + 1
          end
          state.players[hand_index].hand = original[from]
        end
      end
    end
  end

  local no_mercy = state.mode == "noMercy"
  local next_player = state.players[target_index(state)]
  local actor_index = player_index(state, actor.id)
  if card.kind == "skip" then
    advance(state, 2)
  elseif card.kind == "reverse" then
    if #rules.active_players(state) == 2 then
      advance(state, 2)
    else
      state.direction = state.direction == 1 and -1 or 1
      advance(state, 1)
    end
  elseif card.kind == "skipEveryone" then
    if not no_mercy and state.mode ~= "flip" then
      advance(state, 1)
    end
  elseif card.kind == "draw2" then
    if state.mode == "progressive" then
      state.pending_stack = {
        kind = "draw2",
        amount = rules.DRAW_TWO_AMOUNT,
        owner_id = actor.id,
        target_id = next_player.id,
      }
      if #actor.hand == 0 then
        state.pending_stack.pending_winner_id = actor.id
      end
      advance(state, 1)
    elseif no_mercy then
      start_no_mercy_stack(state, card, actor, next_player.id, action.chosen_color)
    else
      draw_cards(state, next_player, rules.DRAW_TWO_AMOUNT)
      advance(state, 2)
      if #actor.hand == 0 then
        state.finished = true
        state.winner = actor.id
      end
    end
  elseif card.kind == "draw1" or card.kind == "draw5" then
    draw_cards(state, next_player, card.kind == "draw1" and 1 or 5)
    advance(state, 2)
    if #actor.hand == 0 then
      state.finished = true
      state.winner = actor.id
    end
  elseif card.kind == "flip" then
    apply_flip(state, actor, action.chosen_color)
    advance(state, 1)
  elseif card.kind == "draw4" or card.kind == "wildDraw6" or card.kind == "wildDraw10"
    or card.kind == "wildReverse4" then
    if no_mercy then
      if card.kind == "wildReverse4" then
        state.direction = state.direction == 1 and -1 or 1
      end
      local target_id = card.kind == "wildReverse4"
        and reverse_draw_target_id(state, actor_index)
        or next_player.id
      start_no_mercy_stack(state, card, actor, target_id, action.chosen_color)
    else
      advance(state, 1)
    end
  elseif card.kind == "wildRoulette" then
    if no_mercy and #actor.hand > 0 then
      local chooser_id = state.players[next_active_index(state, actor_index)].id
      state.pending_roulette = { chooser_id = chooser_id, owner_id = actor.id }
      state.turn = player_index(state, chooser_id)
    else
      advance(state, 1)
    end
  elseif card.kind == "hit1" or card.kind == "hit2" or card.kind == "wildAttack" then
    if state.mode == "attack" then
      local hit_target_id = attack_target_id or next_player.id
      state.pending_hit = {
        amount = card.kind == "hit1" and 1 or 2,
        owner_id = actor.id,
        target_id = hit_target_id,
      }
      state.turn = player_index(state, hit_target_id)
    else
      advance(state, 1)
    end
  elseif card.kind == "discardAll" then
    advance(state, 1)
  elseif card.kind == "wild" then
    advance(state, 1)
  elseif card.kind == "wildDraw2" then
    state.pending_challenge = {
      owner_id = actor.id,
      target_id = next_player.id,
      legal = wild_challenge_legal,
      kind = "wildDraw2",
      amount = rules.DRAW_TWO_AMOUNT,
      color = action.chosen_color,
    }
  elseif card.kind == "wildDrawColor" then
    state.pending_challenge = {
      owner_id = actor.id,
      target_id = next_player.id,
      legal = wild_challenge_legal,
      kind = "wildDrawColor",
      amount = 0,
      color = action.chosen_color,
    }
  elseif card.kind == "wild4" then
    state.pending_challenge = {
      owner_id = actor.id,
      target_id = next_player.id,
      legal = wild_challenge_legal,
    }
    if state.mode == "progressive" then
      state.pending_stack = {
        kind = "wild4",
        amount = rules.WILD_FOUR_AMOUNT,
        owner_id = actor.id,
        target_id = next_player.id,
        legal = wild_challenge_legal,
        color = action.chosen_color,
      }
      if #actor.hand == 0 then
        state.pending_stack.pending_winner_id = actor.id
      end
    end
  else
    advance(state, 1)
  end
  if state.pending_challenge == nil and state.pending_stack == nil and state.pending_hit == nil
    and state.pending_roulette == nil and #actor.hand == 0 then
    state.finished = true
    state.winner = actor.id
  end
  if state.mode == "jumpIn" and card.kind == "number" and not state.finished then
    state.jump_window = {
      card_id = card.id,
      owner_id = actor.id,
      expires_at = clock + rules.JUMP_WINDOW_MS,
    }
  end

  return state, true
end

function rules.score_hand(hand)
  local total = 0
  for _, card in ipairs(hand) do
    if card.kind == "number" then
      total = total + (card.value or 0)
    elseif WILD_KINDS[card.kind] then
      total = total + 50
    else
      total = total + 20
    end
  end
  return total
end

return rules
