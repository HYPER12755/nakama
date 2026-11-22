local protocol = require("uno_protocol")

local rules = {}

rules.VERSION = 2
rules.HAND_SIZE = 7
rules.DRAW_TWO_AMOUNT = 2
rules.WILD_FOUR_AMOUNT = 4
rules.CHALLENGE_PENALTY = 6
rules.JUMP_WINDOW_MS = protocol.JUMP_WINDOW_MS
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

function rules.build_deck(mode)
  if mode == "attack" then
    return build_attack_deck()
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
  if card.kind == "wild" or card.kind == "wild4" or card.kind == "wildAttack" then
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
      if card.kind == state.pending_stack.kind then
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
  return {
    cards = cards,
    can_draw = state.mode == "attack" or state.drawn_card_id == nil,
  }
end

function rules.clear_jump_window(state, now)
  if state.jump_window == nil or (now or 0) < state.jump_window.expires_at then
    return state
  end
  local next_state = rules.clone_state(state)
  next_state.jump_window = nil
  return next_state
end

local function most_common_color(hand)
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
    dealt[index] = { id = player.id, name = player.name, hand = hand }
  end

  local starter = table.remove(deck)
  while starter.kind == "wild4" do
    table.insert(deck, 1, starter)
    state_seed = rules.next_seed(state_seed)
    starter = table.remove(deck)
  end
  if starter.kind == "wild" or starter.kind == "wildAttack" then
    starter.color = most_common_color(dealt[1].hand)
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
    drawn_card_id = nil,
    pending_challenge = nil,
    pending_stack = nil,
    pending_hit = nil,
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

function rules.pick_target(state, player_id)
  local best
  for _, player in ipairs(state.players) do
    if player.id ~= player_id then
      if best == nil or #player.hand > #best.hand then
        best = player
      end
    end
  end
  return best == nil and nil or best.id
end

local function player_index(state, player_id)
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
  if pending_winner_id == nil then
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
    advance(state, stack.kind == "draw2" and 1 or 2)
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
  local clock = now or 0
  local actor
  for _, player in ipairs(state.players) do
    if player.id == action.player_id then
      actor = player
      break
    end
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
    if stack_card.kind ~= stack.kind then
      return fail(previous, protocol.ERROR.ILLEGAL_CARD)
    end
    if state.drawn_card_id ~= nil and state.drawn_card_id ~= stack_card.id then
      return fail(previous, protocol.ERROR.ILLEGAL_CARD)
    end
    if stack_card.kind == "wild4" and action.chosen_color == nil then
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
    if action.accept then
      if pending.legal then
        draw_cards(state, target, rules.CHALLENGE_PENALTY)
      else
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
  if (card.kind == "wild" or card.kind == "wild4" or card.kind == "wildAttack")
    and action.chosen_color == nil then
    return fail(previous, protocol.ERROR.MISSING_COLOR)
  end
  local wild_four_legal = card.kind == "wild4" and not has_color_match(state, actor)

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

  local swap_target
  if state.mode == "sevenO" and card.kind == "number" and card.value == 7 then
    local target_id = action.target_id or action.targetId
    if target_id == nil or target_id == "" then
      return fail(previous, protocol.ERROR.MISSING_TARGET)
    end
    for _, player in ipairs(state.players) do
      if player.id == target_id and player.id ~= actor.id then
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
  elseif state.mode == "attack" and card.color ~= nil then
    state.current_color = card.color
  end
  if state.mode == "attack" and card.kind == "discardAll" and card.color ~= nil then
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

  if state.mode == "sevenO" and card.kind == "number" then
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
        local from = ((hand_index - 1 - state.direction + count * 4) % count) + 1
        state.players[hand_index].hand = original[from]
      end
    end
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
    else
      draw_cards(state, next_player, rules.DRAW_TWO_AMOUNT)
      advance(state, 2)
      if #actor.hand == 0 then
        state.finished = true
        state.winner = actor.id
      end
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
  elseif card.kind == "wild4" then
    state.pending_challenge = {
      owner_id = actor.id,
      target_id = next_player.id,
      legal = wild_four_legal,
    }
    if state.mode == "progressive" then
      state.pending_stack = {
        kind = "wild4",
        amount = rules.WILD_FOUR_AMOUNT,
        owner_id = actor.id,
        target_id = next_player.id,
        legal = wild_four_legal,
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
    and #actor.hand == 0 then
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
    elseif card.kind == "wild" or card.kind == "wild4" or card.kind == "wildAttack" then
      total = total + 50
    else
      total = total + 20
    end
  end
  return total
end

return rules
