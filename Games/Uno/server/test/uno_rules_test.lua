local script_path = arg[0] or "Uno/server/test/uno_rules_test.lua"
local script_dir = script_path:match("^(.*)[/\\]") or "."
local server_dir = script_dir .. "/.."

package.path = server_dir .. "/?.lua;" .. script_dir .. "/?.lua;" .. package.path

local json = require("json")
local rules = require("uno_rules")
local protocol = require("uno_protocol")

local failures = 0

local function test(name, fn)
  local ok, err = pcall(fn)
  if ok then
    print("ok - " .. name)
  else
    failures = failures + 1
    io.stderr:write("not ok - " .. name .. ": " .. tostring(err) .. "\n")
  end
end

local function assert_equal(actual, expected, message)
  if actual ~= expected then
    error((message or "values differ") .. ": expected " .. tostring(expected) .. " got " .. tostring(actual))
  end
end

local vector_file = io.open(script_dir .. "/../../tests/vectors.json", "r")
if vector_file == nil then
  error("missing shared vectors")
end
local vectors = json.decode(vector_file:read("*a"))
vector_file:close()

local function ids(cards)
  local result = {}
  for index, card in ipairs(cards) do
    result[index] = card.id
  end
  return result
end

local function join(values)
  return table.concat(values, ",")
end

local function players(list)
  local result = {}
  for index, id in ipairs(list) do
    result[index] = { id = id, name = "Player " .. index }
  end
  return result
end

local function action_from_vector(value)
  local action = { type = value.type, player_id = value.playerId }
  if value.cardId ~= nil then
    action.card_id = value.cardId
  end
  if value.chosenColor ~= nil then
    action.chosen_color = value.chosenColor
  end
  if value.accept ~= nil then
    action.accept = value.accept
  end
  return action
end

local function seats()
  return players(vectors.reference.players)
end

local function find_seed(kind)
  for seed = 1, 10000 do
    local game = rules.create_game(seed, seats())
    if game.starting_rule.kind == kind then
      return seed
    end
  end
  error("no seed found for " .. kind)
end

local wild_four_card = { id = "wild4-0", color = nil, kind = "wild4" }
local red_zero = { id = "red-0-0", color = "red", kind = "number", value = 0 }
local blue_zero = { id = "blue-0-0", color = "blue", kind = "number", value = 0 }
local red_seven = { id = "red-7-0", color = "red", kind = "number", value = 7 }
local blue_draw_two = { id = "blue-draw2-0", color = "blue", kind = "draw2" }
local green_draw_two = { id = "green-draw2-0", color = "green", kind = "draw2" }
local yellow_draw_two = { id = "yellow-draw2-0", color = "yellow", kind = "draw2" }
local second_wild_four = { id = "wild4-1", color = nil, kind = "wild4" }
local green_zero = { id = "green-0-0", color = "green", kind = "number", value = 0 }

local function staged_game(hand, color, mode)
  local game = rules.create_game(vectors.seed, seats(), 0, mode)
  game.turn = 1
  game.direction = 1
  game.current_color = color or "red"
  game.drawn_card_id = nil
  game.pending_challenge = nil
  game.pending_stack = nil
  game.finished = false
  game.winner = nil
  game.players[1].hand = hand
  return game
end

local function progressive(hand, color)
  return staged_game(hand, color, "progressive")
end

local function all_hands(state)
  local result = {}
  for index, player in ipairs(state.players) do
    result[index] = ids(player.hand)
  end
  return result
end

local function assert_hands(actual, expected, message)
  for index, hand in ipairs(expected) do
    assert_equal(join(actual[index]), join(hand), (message or "hands") .. " seat " .. index)
  end
end

local function play_wild_four(game)
  local state, ok, error_code = rules.apply_action(game, {
    type = "play",
    player_id = "p1",
    card_id = wild_four_card.id,
    chosen_color = "green",
  })
  assert_equal(ok, true, "wild four play: " .. tostring(error_code))
  assert_equal(state.turn, 1, "turn still on owner")
  assert_equal(state.finished, false, "not finished before challenge")
  return state
end

test("builds and shuffles a deterministic 108 card deck", function()
  assert_equal(#rules.build_deck(), vectors.deckSize, "deck size")
  local shuffled, _ = rules.shuffle(vectors.seed, rules.build_deck())
  local head = {}
  for index = 1, 12 do
    head[index] = shuffled[index].id
  end
  assert_equal(join(head), join(vectors.shuffledHead), "shuffled head")
end)

test("deals the same hand and applies the starting Draw Two", function()
  local game = rules.create_game(vectors.seed, seats())
  assert_equal(join(ids(game.players[1].hand)), join(vectors.startingHand), "starting hand")
  assert_equal(#game.players[1].hand, rules.HAND_SIZE + rules.DRAW_TWO_AMOUNT, "starting hand size")
  assert_equal(game.discard[1].id, vectors.startingDiscard, "starting discard")
  assert_equal(game.discard[1].kind, "draw2", "draw two starts play")
  assert_equal(game.current_color, vectors.startingColor, "starting colour")
  assert_equal(game.turn, 2, "first player skipped")
  assert_equal(game.direction, 1, "clockwise")
  assert_equal(join(game.starting_rule.drew_cards),
    vectors.startingHand[#vectors.startingHand - 1] .. "," .. vectors.startingHand[#vectors.startingHand],
    "starting draw two cards")
end)

test("never starts on a Wild Draw Four", function()
  for seed = 1, 200 do
    local game = rules.create_game(seed, seats())
    assert_equal(game.discard[1].kind == "wild4", false, "starter kind for seed " .. seed)
    assert_equal(game.starting_rule.kind == "wild4", false, "starting rule for seed " .. seed)
  end
end)

test("lets the first player choose the colour of a Wild starter", function()
  local game = rules.create_game(find_seed("wild"), seats())
  assert_equal(game.discard[1].kind, "wild", "wild starter")
  assert_equal(game.discard[1].color, rules.most_common_color(game.players[1].hand), "chosen colour")
  assert_equal(game.current_color, rules.most_common_color(game.players[1].hand), "current colour")
  assert_equal(game.turn, 1, "first player starts")
  assert_equal(game.direction, 1, "clockwise")
end)

test("skips the first player when the starter is Skip", function()
  local game = rules.create_game(find_seed("skip"), seats())
  assert_equal(game.discard[1].kind, "skip", "skip starter")
  assert_equal(game.turn, 2, "second seat starts")
  assert_equal(game.direction, 1, "clockwise")
  for _, player in ipairs(game.players) do
    assert_equal(#player.hand, rules.HAND_SIZE, "unchanged hand")
  end
end)

test("makes the last seat the dealer when the starter is Reverse", function()
  local game = rules.create_game(find_seed("reverse"), seats())
  assert_equal(game.discard[1].kind, "reverse", "reverse starter")
  assert_equal(game.turn, #game.players, "last seat starts")
  assert_equal(game.direction, -1, "counter-clockwise")
end)

test("reports the same legal moves as the TypeScript core", function()
  local game = rules.create_game(vectors.seed, seats())
  local first = rules.legal_moves(game, "p1")
  assert_equal(#first.cards, 0, "first seat is skipped")
  assert_equal(first.can_draw, false, "no draw for skipped seat")
  local moves = rules.legal_moves(game, game.players[game.turn].id)
  assert_equal(join(moves.cards), join(vectors.startingLegal.cards), "legal cards")
  assert_equal(moves.can_draw, vectors.startingLegal.canDraw, "draw available")
end)

test("rejects illegal plays and wrong turns", function()
  local game = rules.create_game(vectors.seed, seats())
  local state, ok, error_code = rules.apply_action(game, { type = "draw", player_id = "p1" })
  assert_equal(ok, false, "wrong turn refused")
  assert_equal(error_code, protocol.ERROR.NOT_YOUR_TURN, "error code")
  assert_equal(state == game, true, "state untouched")
end)

test("rejects a second draw while a drawn card is pending", function()
  local game = rules.create_game(vectors.seed, seats())
  game.drawn_card_id = game.players[game.turn].hand[1].id
  local _, ok, error_code = rules.apply_action(game, { type = "draw", player_id = game.players[game.turn].id })
  assert_equal(ok, false, "second draw refused")
  assert_equal(error_code, protocol.ERROR.ILLEGAL_CARD, "illegal card code")
  assert_equal(rules.legal_moves(game, game.players[game.turn].id).can_draw, false, "draw disabled")
end)

test("keeps a drawn Wild Draw Four playable even as a bluff", function()
  local game = staged_game({ wild_four_card, red_zero }, "red")
  game.drawn_card_id = wild_four_card.id
  local moves = rules.legal_moves(game, "p1")
  assert_equal(join(moves.cards), wild_four_card.id, "bluff is in legal moves")
  assert_equal(moves.can_draw, false, "draw disabled")
  local state, ok = rules.apply_action(game, {
    type = "play",
    player_id = "p1",
    card_id = wild_four_card.id,
    chosen_color = "green",
  })
  assert_equal(ok, true, "drawn bluff played")
  assert_equal(state.pending_challenge.legal, false, "pending marked guilty")
end)

test("allows an illegal bluff and marks the pending challenge guilty", function()
  local game = staged_game({ wild_four_card, red_zero }, "red")
  local moves = rules.legal_moves(game, "p1")
  local found = false
  for _, card_id in ipairs(moves.cards) do
    if card_id == wild_four_card.id then
      found = true
    end
  end
  assert_equal(found, true, "bluff is legal to play")
  local state = play_wild_four(game)
  assert_equal(state.pending_challenge.owner_id, "p1", "challenge owner")
  assert_equal(state.pending_challenge.target_id, "p2", "challenge target")
  assert_equal(state.pending_challenge.legal, false, "guilty")
end)

test("marks a legal Wild Draw Four innocent", function()
  local state = play_wild_four(staged_game({ wild_four_card, blue_zero }, "red"))
  assert_equal(state.pending_challenge.legal, true, "innocent")
end)

test("makes the owner draw four when a guilty play is challenged", function()
  local game = staged_game({ wild_four_card, red_zero }, "red")
  local target_before = #game.players[2].hand
  local state, ok = rules.apply_action(play_wild_four(game), {
    type = "challenge",
    player_id = "p2",
    accept = true,
  })
  assert_equal(ok, true, "accept accepted")
  assert_equal(state.pending_challenge, nil, "challenge cleared")
  assert_equal(#state.players[1].hand, 1 + rules.WILD_FOUR_AMOUNT, "owner drew four")
  assert_equal(#state.players[2].hand, target_before, "target drew none")
  assert_equal(state.turn, 3, "target lost turn")
  assert_equal(state.finished, false, "game continues")
end)

test("makes the target draw six when an innocent play is challenged", function()
  local game = staged_game({ wild_four_card, blue_zero }, "red")
  local target_before = #game.players[2].hand
  local state, ok = rules.apply_action(play_wild_four(game), {
    type = "challenge",
    player_id = "p2",
    accept = true,
  })
  assert_equal(ok, true, "accept accepted")
  assert_equal(#state.players[1].hand, 1, "owner drew none")
  assert_equal(#state.players[2].hand, target_before + rules.CHALLENGE_PENALTY, "target drew six")
  assert_equal(state.turn, 3, "target lost turn")
end)

test("makes the target take four when the challenge is declined", function()
  local game = staged_game({ wild_four_card, red_zero }, "red")
  local target_before = #game.players[2].hand
  local state, ok = rules.apply_action(play_wild_four(game), {
    type = "challenge",
    player_id = "p2",
    accept = false,
  })
  assert_equal(ok, true, "decline accepted")
  assert_equal(#state.players[1].hand, 1, "owner drew none")
  assert_equal(#state.players[2].hand, target_before + rules.WILD_FOUR_AMOUNT, "target drew four")
  assert_equal(state.turn, 3, "target lost turn")
end)

test("refuses a challenge from the owner or an unknown player", function()
  local pending = play_wild_four(staged_game({ wild_four_card, red_zero }, "red"))
  local _, owner_ok, owner_error = rules.apply_action(pending, {
    type = "challenge",
    player_id = "p1",
    accept = true,
  })
  assert_equal(owner_ok, false, "owner refused")
  assert_equal(owner_error, protocol.ERROR.BAD_CHALLENGE, "bad challenge code")
  local _, stranger_ok = rules.apply_action(pending, {
    type = "challenge",
    player_id = "nobody",
    accept = true,
  })
  assert_equal(stranger_ok, false, "stranger refused")
end)

test("makes the next player draw two before a final Draw Two wins", function()
  local game = staged_game({ blue_draw_two }, "blue")
  local target_before = #game.players[2].hand
  local state, ok = rules.apply_action(game, {
    type = "play",
    player_id = "p1",
    card_id = blue_draw_two.id,
  })
  assert_equal(ok, true, "draw two played")
  assert_equal(#state.players[2].hand, target_before + rules.DRAW_TWO_AMOUNT, "target drew two")
  assert_equal(state.turn, 3, "target lost turn")
  assert_equal(state.finished, true, "hand finished")
  assert_equal(state.winner, "p1", "winner")
end)

test("waits for the challenge before a final Wild Draw Four wins", function()
  local game = staged_game({ wild_four_card }, "red")
  local target_before = #game.players[2].hand
  local played, ok = rules.apply_action(game, {
    type = "play",
    player_id = "p1",
    card_id = wild_four_card.id,
    chosen_color = "blue",
  })
  assert_equal(ok, true, "wild four played")
  assert_equal(played.pending_challenge.legal, true, "innocent")
  assert_equal(played.finished, false, "not finished before challenge")
  assert_equal(played.winner, nil, "no winner before challenge")
  local state, accepted = rules.apply_action(played, {
    type = "challenge",
    player_id = "p2",
    accept = false,
  })
  assert_equal(accepted, true, "decline accepted")
  assert_equal(#state.players[2].hand, target_before + rules.WILD_FOUR_AMOUNT, "target drew four")
  assert_equal(state.finished, true, "hand finished")
  assert_equal(state.winner, "p1", "winner")
end)

test("lets the owner win a final Wild Draw Four after an innocent challenge", function()
  local game = staged_game({ wild_four_card }, "red")
  local target_before = #game.players[2].hand
  local played, _ = rules.apply_action(game, {
    type = "play",
    player_id = "p1",
    card_id = wild_four_card.id,
    chosen_color = "blue",
  })
  local state, ok = rules.apply_action(played, {
    type = "challenge",
    player_id = "p2",
    accept = true,
  })
  assert_equal(ok, true, "accept accepted")
  assert_equal(#state.players[1].hand, 0, "owner still empty")
  assert_equal(#state.players[2].hand, target_before + rules.CHALLENGE_PENALTY, "target drew six")
  assert_equal(state.finished, true, "hand finished")
  assert_equal(state.winner, "p1", "winner")
end)

test("finishes immediately on an ordinary final card", function()
  local game = staged_game({ blue_zero }, "blue")
  local state, ok = rules.apply_action(game, {
    type = "play",
    player_id = "p1",
    card_id = blue_zero.id,
  })
  assert_equal(ok, true, "card played")
  assert_equal(state.finished, true, "hand finished")
  assert_equal(state.winner, "p1", "winner")
end)

test("plays the shared reference game to the same winner", function()
  local state = rules.create_game(vectors.seed, seats())
  for _, value in ipairs(vectors.reference.actions) do
    local next_state, ok, error_code = rules.apply_action(state, action_from_vector(value))
    if not ok then
      error("rejected action " .. value.type .. ": " .. tostring(error_code))
    end
    state = next_state
  end
  assert_equal(state.finished, vectors.reference.finished, "finished")
  local expected_winner = vectors.reference.winner
  if expected_winner == json.null then
    expected_winner = nil
  end
  assert_equal(state.winner, expected_winner, "winner")
  assert_equal(#state.replay, vectors.reference.steps, "replay length")
end)

test("defaults to classic and records the explicit rules mode", function()
  local classic = rules.create_game(vectors.seed, seats())
  local seven_o = rules.create_game(vectors.seed, seats(), 0, "sevenO")
  assert_equal(classic.mode, "classic", "classic mode")
  assert_equal(seven_o.mode, "sevenO", "sevenO mode")
  assert_equal(classic.version, 2, "version")
  assert_equal(seven_o.version, 2, "sevenO version")
  assert_equal(join(ids(seven_o.players[1].hand)), join(ids(classic.players[1].hand)), "same deal")
end)

test("swaps the actor's whole hand with the chosen target", function()
  local game = staged_game({ red_seven, blue_zero }, "red", "sevenO")
  local before = all_hands(game)
  local state, ok, error_code = rules.apply_action(game, {
    type = "play",
    player_id = "p1",
    card_id = red_seven.id,
    target_id = "p2",
  })
  assert_equal(ok, true, "seven play: " .. tostring(error_code))
  assert_hands(all_hands(state), { before[2], { blue_zero.id }, before[3] }, "swapped hands")
  assert_equal(state.turn, 2, "turn advanced")
  assert_equal(state.direction, 1, "direction unchanged")
  assert_equal(state.finished, false, "game continues")
end)

test("accepts the camelCase target alias", function()
  local game = staged_game({ red_seven }, "red", "sevenO")
  local before = all_hands(game)
  local state, ok, error_code = rules.apply_action(game, {
    type = "play",
    player_id = "p1",
    card_id = red_seven.id,
    targetId = "p3",
  })
  assert_equal(ok, true, "seven play: " .. tostring(error_code))
  assert_equal(join(ids(state.players[1].hand)), join(before[3]), "actor took target hand")
  assert_equal(#state.players[3].hand, 0, "target took empty hand")
end)

test("checks the swap before declaring a winner", function()
  local game = staged_game({ red_seven }, "red", "sevenO")
  local state, ok = rules.apply_action(game, {
    type = "play",
    player_id = "p1",
    card_id = red_seven.id,
    target_id = "p2",
  })
  assert_equal(ok, true, "seven played")
  assert_equal(state.finished, false, "not finished")
  assert_equal(state.winner, nil, "no winner")
  assert_equal(#state.players[1].hand > 0, true, "actor holds the target's cards")
end)

test("rejects a seven without a valid target", function()
  local cases = { {}, { target_id = "p1" }, { target_id = "nobody" } }
  for _, extra in ipairs(cases) do
    local game = staged_game({ red_seven, blue_zero }, "red", "sevenO")
    local action = {
      type = "play",
      player_id = "p1",
      card_id = red_seven.id,
    }
    for key, value in pairs(extra) do
      action[key] = value
    end
    local state, ok, error_code = rules.apply_action(game, action)
    assert_equal(ok, false, "seven refused")
    assert_equal(error_code, protocol.ERROR.MISSING_TARGET, "missing target code")
    assert_equal(state == game, true, "state untouched")
  end
end)

test("rotates every hand clockwise on zero", function()
  local game = staged_game({ red_zero }, "red", "sevenO")
  local before = all_hands(game)
  local state, ok, error_code = rules.apply_action(game, {
    type = "play",
    player_id = "p1",
    card_id = red_zero.id,
  })
  assert_equal(ok, true, "zero play: " .. tostring(error_code))
  assert_hands(all_hands(state), { before[3], {}, before[2] }, "clockwise rotation")
  assert_equal(state.turn, 2, "turn advanced")
  assert_equal(state.direction, 1, "clockwise")
  assert_equal(state.finished, false, "game continues")
end)

test("rotates every hand counter-clockwise on zero", function()
  local game = staged_game({ red_zero }, "red", "sevenO")
  game.direction = -1
  local before = all_hands(game)
  local state, ok, error_code = rules.apply_action(game, {
    type = "play",
    player_id = "p1",
    card_id = red_zero.id,
  })
  assert_equal(ok, true, "zero play: " .. tostring(error_code))
  assert_hands(all_hands(state), { before[2], before[3], {} }, "counter-clockwise rotation")
  assert_equal(state.turn, 3, "turn advanced backwards")
  assert_equal(state.direction, -1, "counter-clockwise")
end)

test("classic ignores the seven and zero effects", function()
  local seven = staged_game({ red_seven, blue_zero }, "red")
  local before_seven = all_hands(seven)
  local seven_state, seven_ok = rules.apply_action(seven, {
    type = "play",
    player_id = "p1",
    card_id = red_seven.id,
    target_id = "p2",
  })
  assert_equal(seven_ok, true, "seven played in classic")
  assert_equal(join(ids(seven_state.players[2].hand)), join(before_seven[2]), "classic target unchanged")
  assert_equal(join(ids(seven_state.players[1].hand)), blue_zero.id, "classic actor kept remainder")

  local zero = staged_game({ red_zero, blue_zero }, "red")
  local before_zero = all_hands(zero)
  local zero_state, zero_ok = rules.apply_action(zero, {
    type = "play",
    player_id = "p1",
    card_id = red_zero.id,
  })
  assert_equal(zero_ok, true, "zero played in classic")
  assert_hands(all_hands(zero_state), { { blue_zero.id }, before_zero[2], before_zero[3] }, "classic rotation skipped")
end)

test("picks the opponent with the most cards as a swap target", function()
  local game = rules.create_game(vectors.seed, seats(), 0, "sevenO")
  game.players[1].hand = { red_zero }
  game.players[2].hand = { red_zero, blue_zero }
  game.players[3].hand = { red_zero, blue_zero }
  assert_equal(rules.pick_target(game, "p1"), "p2", "tie goes to first seat")
  game.players[3].hand = { red_zero, blue_zero, red_seven }
  assert_equal(rules.pick_target(game, "p1"), "p3", "largest hand wins")
end)

test("exposes progressive as a valid mode with an empty pending stack", function()
  local game = rules.create_game(vectors.seed, seats(), 0, "progressive")
  assert_equal(game.mode, "progressive", "mode")
  assert_equal(game.pending_stack, nil, "empty pending stack")
  assert_equal(protocol.is_rules_mode("progressive"), true, "protocol accepts mode")
  assert_equal(protocol.normalize_rules_mode("progressive"), "progressive", "protocol normalizes mode")
end)

test("sets a Draw Two stack instead of drawing immediately", function()
  local game = progressive({ blue_draw_two, red_zero }, "blue")
  local target_before = #game.players[2].hand
  local state, ok, error_code = rules.apply_action(game, {
    type = "play",
    player_id = "p1",
    card_id = blue_draw_two.id,
  })
  assert_equal(ok, true, "play: " .. tostring(error_code))
  assert_equal(state.pending_stack.kind, "draw2", "stack kind")
  assert_equal(state.pending_stack.amount, rules.DRAW_TWO_AMOUNT, "stack amount")
  assert_equal(state.pending_stack.owner_id, "p1", "stack owner")
  assert_equal(state.pending_stack.target_id, "p2", "stack target")
  assert_equal(#state.players[2].hand, target_before, "no immediate draw")
  assert_equal(state.turn, 2, "turn on target")
  assert_equal(state.finished, false, "not finished")
end)

test("stacks Draw Twos and makes the final target take the accumulated amount", function()
  local played = rules.apply_action(progressive({ blue_draw_two }, "blue"), {
    type = "play",
    player_id = "p1",
    card_id = blue_draw_two.id,
  })
  assert_equal(played.finished, false, "win deferred")
  assert_equal(played.pending_stack.pending_winner_id, "p1", "pending winner")
  played.players[2].hand = { green_draw_two }
  local stacked, stacked_ok = rules.apply_action(played, {
    type = "play",
    player_id = "p2",
    card_id = green_draw_two.id,
  })
  assert_equal(stacked_ok, true, "stack accepted")
  assert_equal(stacked.pending_stack.amount, 4, "amount accumulated")
  assert_equal(stacked.pending_stack.owner_id, "p2", "owner advanced")
  assert_equal(stacked.pending_stack.target_id, "p3", "target advanced")
  assert_equal(stacked.pending_stack.pending_winner_id, "p1", "winner unchanged")
  local third_before = #stacked.players[3].hand
  local taken, taken_ok = rules.apply_action(stacked, { type = "draw", player_id = "p3" })
  assert_equal(taken_ok, true, "take accepted")
  assert_equal(taken.pending_stack, nil, "stack cleared")
  assert_equal(#taken.players[3].hand, third_before + 4, "target drew four")
  assert_equal(taken.finished, true, "hand finished")
  assert_equal(taken.winner, "p1", "deferred winner")
end)

test("declares the deferred Draw Two winner when the first stack is taken", function()
  local game = progressive({ blue_draw_two }, "blue")
  local target_before = #game.players[2].hand
  local played = rules.apply_action(game, {
    type = "play",
    player_id = "p1",
    card_id = blue_draw_two.id,
  })
  assert_equal(played.finished, false, "not finished before resolution")
  local taken, ok = rules.apply_action(played, { type = "draw", player_id = "p2" })
  assert_equal(ok, true, "take accepted")
  assert_equal(#taken.players[2].hand, target_before + rules.DRAW_TWO_AMOUNT, "target drew two")
  assert_equal(taken.finished, true, "hand finished")
  assert_equal(taken.winner, "p1", "winner")
end)

test("keeps the hand alive when a Draw Two stack returns to the owner", function()
  local played = rules.apply_action(progressive({ blue_draw_two }, "blue"), {
    type = "play",
    player_id = "p1",
    card_id = blue_draw_two.id,
  })
  played.players[2].hand = { green_draw_two }
  local stacked = rules.apply_action(played, {
    type = "play",
    player_id = "p2",
    card_id = green_draw_two.id,
  })
  assert_equal(stacked.pending_stack.amount, 4, "amount after second stack")
  stacked.players[3].hand = { yellow_draw_two }
  local stacked_thrice = rules.apply_action(stacked, {
    type = "play",
    player_id = "p3",
    card_id = yellow_draw_two.id,
  })
  assert_equal(stacked_thrice.pending_stack.amount, 6, "amount after third stack")
  assert_equal(stacked_thrice.pending_stack.target_id, "p1", "stack returns to owner")
  local taken, ok = rules.apply_action(stacked_thrice, { type = "draw", player_id = "p1" })
  assert_equal(ok, true, "owner takes the stack")
  assert_equal(#taken.players[1].hand > 0, true, "owner holds cards")
  assert_equal(taken.finished, false, "game continues")
end)

test("rejects cross-stacking a Wild Four onto a Draw Two stack", function()
  local played = rules.apply_action(progressive({ blue_draw_two, red_zero }, "blue"), {
    type = "play",
    player_id = "p1",
    card_id = blue_draw_two.id,
  })
  played.players[2].hand = { wild_four_card }
  local moves = rules.legal_moves(played, "p2")
  assert_equal(#moves.cards, 0, "no wild four in legal moves")
  assert_equal(moves.can_draw, true, "take available")
  local state, ok, error_code = rules.apply_action(played, {
    type = "play",
    player_id = "p2",
    card_id = wild_four_card.id,
    chosen_color = "green",
  })
  assert_equal(ok, false, "cross-stack refused")
  assert_equal(error_code, protocol.ERROR.ILLEGAL_CARD, "error code")
end)

test("sets a stacked Wild Four and resolves an innocent challenge by the accumulated amount", function()
  local played = rules.apply_action(progressive({ wild_four_card, blue_zero }, "red"), {
    type = "play",
    player_id = "p1",
    card_id = wild_four_card.id,
    chosen_color = "green",
  })
  assert_equal(played.pending_stack.kind, "wild4", "stack kind")
  assert_equal(played.pending_stack.amount, rules.WILD_FOUR_AMOUNT, "stack amount")
  assert_equal(played.pending_stack.legal, true, "innocent")
  assert_equal(played.pending_stack.color, "green", "chosen colour")
  played.players[2].hand = { second_wild_four, blue_zero }
  local stacked, stacked_ok = rules.apply_action(played, {
    type = "play",
    player_id = "p2",
    card_id = second_wild_four.id,
    chosen_color = "yellow",
  })
  assert_equal(stacked_ok, true, "stack accepted")
  assert_equal(stacked.pending_stack.amount, 8, "accumulated amount")
  assert_equal(stacked.pending_stack.legal, true, "still innocent")
  assert_equal(stacked.pending_stack.color, "yellow", "last colour chosen")
  assert_equal(stacked.current_color, "yellow", "current colour")
  local third_before = #stacked.players[3].hand
  local challenged, ok = rules.apply_action(stacked, {
    type = "challenge",
    player_id = "p3",
    accept = true,
  })
  assert_equal(ok, true, "challenge accepted")
  assert_equal(#challenged.players[3].hand, third_before + 10, "challenger drew amount plus two")
  assert_equal(challenged.pending_stack, nil, "stack cleared")
  assert_equal(challenged.pending_challenge, nil, "challenge cleared")
end)

test("makes the last Wild Four owner draw the accumulated amount on a guilty challenge", function()
  local played = rules.apply_action(progressive({ wild_four_card, green_zero }, "green"), {
    type = "play",
    player_id = "p1",
    card_id = wild_four_card.id,
    chosen_color = "blue",
  })
  assert_equal(played.pending_challenge.legal, false, "guilty")
  played.players[2].hand = { second_wild_four, blue_zero }
  local stacked = rules.apply_action(played, {
    type = "play",
    player_id = "p2",
    card_id = second_wild_four.id,
    chosen_color = "yellow",
  })
  assert_equal(stacked.pending_stack.legal, false, "guilty stack")
  assert_equal(stacked.pending_stack.amount, 8, "accumulated amount")
  local challenged, ok = rules.apply_action(stacked, {
    type = "challenge",
    player_id = "p3",
    accept = true,
  })
  assert_equal(ok, true, "challenge accepted")
  assert_equal(#challenged.players[2].hand, 1 + 8, "owner drew eight")
end)

test("makes the target take the accumulated amount when a stacked Wild Four is declined", function()
  local played = rules.apply_action(progressive({ wild_four_card, blue_zero }, "red"), {
    type = "play",
    player_id = "p1",
    card_id = wild_four_card.id,
    chosen_color = "green",
  })
  played.players[2].hand = { second_wild_four, blue_zero }
  local stacked = rules.apply_action(played, {
    type = "play",
    player_id = "p2",
    card_id = second_wild_four.id,
    chosen_color = "yellow",
  })
  local third_before = #stacked.players[3].hand
  local declined, ok = rules.apply_action(stacked, {
    type = "challenge",
    player_id = "p3",
    accept = false,
  })
  assert_equal(ok, true, "challenge declined")
  assert_equal(#declined.players[3].hand, third_before + 8, "target drew eight")
end)

test("rejects cross-stacking a Draw Two onto a Wild Four stack", function()
  local played = rules.apply_action(progressive({ wild_four_card, blue_zero }, "red"), {
    type = "play",
    player_id = "p1",
    card_id = wild_four_card.id,
    chosen_color = "blue",
  })
  played.players[2].hand = { blue_draw_two }
  local moves = rules.legal_moves(played, "p2")
  assert_equal(#moves.cards, 0, "no draw two in legal moves")
  local state, ok, error_code = rules.apply_action(played, {
    type = "play",
    player_id = "p2",
    card_id = blue_draw_two.id,
  })
  assert_equal(ok, false, "cross-stack refused")
  assert_equal(error_code, protocol.ERROR.ILLEGAL_CARD, "error code")
end)

test("defers a final Wild Four win until the stack resolves", function()
  local played = rules.apply_action(progressive({ wild_four_card }, "red"), {
    type = "play",
    player_id = "p1",
    card_id = wild_four_card.id,
    chosen_color = "blue",
  })
  assert_equal(played.finished, false, "not finished before resolution")
  assert_equal(played.pending_stack.pending_winner_id, "p1", "pending winner")
  local target_before = #played.players[2].hand
  local declined, ok = rules.apply_action(played, {
    type = "challenge",
    player_id = "p2",
    accept = false,
  })
  assert_equal(ok, true, "challenge declined")
  assert_equal(#declined.players[2].hand, target_before + rules.WILD_FOUR_AMOUNT, "target drew four")
  assert_equal(declined.finished, true, "hand finished")
  assert_equal(declined.winner, "p1", "winner")
end)

test("withholds a final Wild Four win after a guilty challenge", function()
  local played = rules.apply_action(progressive({ wild_four_card, green_zero }, "green"), {
    type = "play",
    player_id = "p1",
    card_id = wild_four_card.id,
    chosen_color = "blue",
  })
  local challenged, ok = rules.apply_action(played, {
    type = "challenge",
    player_id = "p2",
    accept = true,
  })
  assert_equal(ok, true, "challenge accepted")
  assert_equal(#challenged.players[1].hand, 1 + rules.WILD_FOUR_AMOUNT, "owner drew four")
  assert_equal(challenged.finished, false, "game continues")
end)

test("leaves classic and Seven-O draw effects immediate with no stack", function()
  for _, mode in ipairs({ "classic", "sevenO" }) do
    local draw_result = rules.apply_action(staged_game({ blue_draw_two, red_zero }, "blue", mode), {
      type = "play",
      player_id = "p1",
      card_id = blue_draw_two.id,
    })
    assert_equal(draw_result.pending_stack, nil, "no draw stack in " .. mode)
    assert_equal(draw_result.finished, false, "actor kept a card in " .. mode)
    local wild_result = rules.apply_action(staged_game({ wild_four_card }, "red", mode), {
      type = "play",
      player_id = "p1",
      card_id = wild_four_card.id,
      chosen_color = "blue",
    })
    assert_equal(wild_result.pending_stack, nil, "no wild stack in " .. mode)
    assert_equal(wild_result.pending_challenge ~= nil, true, "challenge pending in " .. mode)
  end
end)

local yellow_seven = { id = "yellow-7-0", color = "yellow", kind = "number", value = 7 }
local second_yellow_seven = { id = "yellow-7-1", color = "yellow", kind = "number", value = 7 }
local third_yellow_seven = { id = "yellow-7-2", color = "yellow", kind = "number", value = 7 }
local red_seven = { id = "red-7-0", color = "red", kind = "number", value = 7 }
local yellow_six = { id = "yellow-6-0", color = "yellow", kind = "number", value = 6 }
local yellow_skip = { id = "yellow-skip-0", color = "yellow", kind = "skip" }
local green_six = { id = "green-6-0", color = "green", kind = "number", value = 6 }

local function jump_game()
  local game = staged_game({ yellow_seven, blue_zero }, "yellow", "jumpIn")
  game.jump_window = nil
  game.players[2].hand = { second_yellow_seven, blue_zero }
  game.players[3].hand = { green_six }
  return game
end

local function open_jump_window(game, now)
  local state, ok, error_code = rules.apply_action(game, {
    type = "play",
    player_id = "p1",
    card_id = yellow_seven.id,
  }, now or 1000)
  assert_equal(ok, true, "jump window play: " .. tostring(error_code))
  return state
end

test("exposes jumpIn as a valid authoritative mode", function()
  assert_equal(protocol.JUMP_WINDOW_MS, 1800, "window length")
  assert_equal(rules.JUMP_WINDOW_MS, 1800, "rules window length")
  assert_equal(protocol.is_rules_mode("jumpIn"), true, "protocol accepts mode")
  assert_equal(protocol.normalize_rules_mode("jumpIn"), "jumpIn", "protocol normalizes mode")
  assert_equal(protocol.ERROR.JUMP_WINDOW_OPEN, "jump_window_open", "window error code")
  assert_equal(protocol.ERROR.BAD_JUMP, "bad_jump", "bad jump error code")
  local game = rules.create_game(vectors.seed, seats(), 0, "jumpIn")
  assert_equal(game.mode, "jumpIn", "game mode")
  assert_equal(game.jump_window, nil, "no window at creation")
end)

test("opens a jump window after a number card", function()
  local state = open_jump_window(jump_game())
  assert_equal(state.jump_window.card_id, yellow_seven.id, "window card")
  assert_equal(state.jump_window.owner_id, "p1", "window owner")
  assert_equal(state.jump_window.expires_at, 2800, "window expiry")
  assert_equal(state.turn, 2, "turn advanced")
  assert_equal(state.finished, false, "game continues")
end)

test("jumps with an exact number-card match", function()
  local state = open_jump_window(jump_game())
  local p2_moves = rules.legal_moves(state, "p2", 1100)
  assert_equal(join(p2_moves.cards), second_yellow_seven.id, "matching card is legal")
  assert_equal(p2_moves.can_draw, false, "no draw during a window")
  assert_equal(#rules.legal_moves(state, "p3", 1100).cards, 0, "no card for p3")
  local jumped, ok, error_code = rules.apply_action(state, {
    type = "play",
    player_id = "p2",
    card_id = second_yellow_seven.id,
    jump = true,
  }, 1100)
  assert_equal(ok, true, "jump accepted: " .. tostring(error_code))
  assert_equal(join(ids(jumped.players[2].hand)), blue_zero.id, "jumper kept spare card")
  assert_equal(jumped.discard[#jumped.discard].id, second_yellow_seven.id, "jump card discarded")
  assert_equal(jumped.turn, 3, "turn advanced past jumper")
  assert_equal(jumped.jump_window.card_id, second_yellow_seven.id, "new window card")
  assert_equal(jumped.jump_window.owner_id, "p2", "new window owner")
  assert_equal(jumped.jump_window.expires_at, 2900, "new window expiry")
  assert_equal(jumped.replay[#jumped.replay].action, "jump", "jump replay")
end)

test("rejects invalid jumps and jump requests without a window", function()
  local state = open_jump_window(jump_game())
  for _, card in ipairs({ red_seven, yellow_six }) do
    state.players[2].hand = { card }
    local result, ok, error_code = rules.apply_action(state, {
      type = "play",
      player_id = "p2",
      card_id = card.id,
      jump = true,
    }, 1100)
    assert_equal(ok, false, "non-matching jump refused")
    assert_equal(error_code, protocol.ERROR.BAD_JUMP, "bad jump code")
    assert_equal(result == state, true, "state untouched")
  end
  state.players[2].hand = { yellow_skip }
  local _, action_ok, action_error = rules.apply_action(state, {
    type = "play",
    player_id = "p2",
    card_id = yellow_skip.id,
    jump = true,
  }, 1100)
  assert_equal(action_ok, false, "action-card jump refused")
  assert_equal(action_error, protocol.ERROR.BAD_JUMP, "action-card error code")
  local _, no_window_ok, no_window_error = rules.apply_action(jump_game(), {
    type = "play",
    player_id = "p2",
    card_id = second_yellow_seven.id,
    jump = true,
  }, 1100)
  assert_equal(no_window_ok, false, "jump without window refused")
  assert_equal(no_window_error, protocol.ERROR.BAD_JUMP, "no-window error code")
end)

test("blocks the window owner and non-jump actions during a window", function()
  local state = open_jump_window(jump_game())
  assert_equal(#rules.legal_moves(state, "p1", 1100).cards, 0, "owner has no legal moves")
  local cases = {
    { type = "draw", player_id = "p1" },
    { type = "play", player_id = "p1", card_id = blue_zero.id },
    { type = "play", player_id = "p2", card_id = second_yellow_seven.id },
    { type = "draw", player_id = "p2" },
  }
  for _, action in ipairs(cases) do
    local result, ok, error_code = rules.apply_action(state, action, 1100)
    assert_equal(ok, false, "action refused during window")
    assert_equal(error_code, protocol.ERROR.JUMP_WINDOW_OPEN, "window open code")
    assert_equal(result == state, true, "state untouched")
  end
end)

test("clears only an expired jump window and resumes normal play", function()
  local state = open_jump_window(jump_game())
  assert_equal(rules.clear_jump_window(state, 2799) == state, true, "window still open")
  local cleared = rules.clear_jump_window(state, 2800)
  assert_equal(cleared.jump_window, nil, "window cleared")
  assert_equal(state.jump_window ~= nil, true, "original untouched")
  assert_equal(cleared.turn, 2, "current turn unchanged")
  assert_equal(rules.legal_moves(cleared, "p2", 2800).can_draw, true, "draw restored")
  local normal, ok = rules.apply_action(cleared, { type = "draw", player_id = "p2" }, 2801)
  assert_equal(ok, true, "normal play resumed")
  assert_equal(normal.jump_window, nil, "no window after draw")
  local implicit, implicit_ok = rules.apply_action(state, { type = "draw", player_id = "p2" }, 2801)
  assert_equal(implicit_ok, true, "expired window ignored by apply_action")
  assert_equal(implicit.jump_window, nil, "no window after implicit clear")
end)

test("finishes immediately when a jumper empties their hand", function()
  local game = jump_game()
  game.players[2].hand = { second_yellow_seven }
  local state = open_jump_window(game)
  local jumped, ok = rules.apply_action(state, {
    type = "play",
    player_id = "p2",
    card_id = second_yellow_seven.id,
    jump = true,
  }, 1100)
  assert_equal(ok, true, "final card jumped")
  assert_equal(jumped.finished, true, "hand finished")
  assert_equal(jumped.winner, "p2", "jumper wins")
  assert_equal(jumped.jump_window, nil, "no window after win")
end)

test("action-card plays do not open a jump window", function()
  local game = staged_game({ yellow_skip, blue_zero }, "yellow", "jumpIn")
  local state, ok, error_code = rules.apply_action(game, {
    type = "play",
    player_id = "p1",
    card_id = yellow_skip.id,
  }, 1000)
  assert_equal(ok, true, "skip played: " .. tostring(error_code))
  assert_equal(state.jump_window, nil, "no window")
  assert_equal(state.turn, 3, "skip advanced two seats")
end)

test("allows chained jumps", function()
  local state = jump_game()
  state.players[3].hand = { third_yellow_seven, green_six }
  local opened = open_jump_window(state)
  local first, first_ok = rules.apply_action(opened, {
    type = "play",
    player_id = "p2",
    card_id = second_yellow_seven.id,
    jump = true,
  }, 1100)
  assert_equal(first_ok, true, "first jump")
  local second, second_ok = rules.apply_action(first, {
    type = "play",
    player_id = "p3",
    card_id = third_yellow_seven.id,
    jump = true,
  }, 1200)
  assert_equal(second_ok, true, "second jump")
  assert_equal(second.turn, 1, "turn wrapped around")
  assert_equal(second.jump_window.owner_id, "p3", "last jumper owns window")
end)

local hit1_red = { id = "red-hit1-0", color = "red", kind = "hit1" }
local hit2_green = { id = "green-hit2-0", color = "green", kind = "hit2" }
local wild_attack = { id = "wildattack-0", color = nil, kind = "wildAttack" }
local discard_red = { id = "red-discardall-0", color = "red", kind = "discardAll" }
local discard_yellow = { id = "yellow-discardall-0", color = "yellow", kind = "discardAll" }
local reverse_red = { id = "red-reverse-0", color = "red", kind = "reverse" }
local one_red = { id = "red-1-0", color = "red", kind = "number", value = 1 }

local function attack_game(hand, color, seed, seat_count)
  local ids_list = { "p1", "p2", "p3" }
  if seat_count == 2 then
    ids_list = { "p1", "p2" }
  end
  local game = rules.create_game(seed or 42, players(ids_list), 0, "attack")
  game.turn = 1
  game.direction = 1
  game.current_color = color or "red"
  game.drawn_card_id = nil
  game.pending_challenge = nil
  game.pending_stack = nil
  game.pending_hit = nil
  game.jump_window = nil
  game.finished = false
  game.winner = nil
  for _, player in ipairs(game.players) do
    player.hand = {}
  end
  game.players[1].hand = hand
  return game
end

local function kind_count(deck, kind)
  local count = 0
  for _, card in ipairs(deck) do
    if card.kind == kind then
      count = count + 1
    end
  end
  return count
end

test("exposes attack as an authoritative mode with a 112 card deck", function()
  assert_equal(protocol.is_rules_mode("attack"), true, "protocol accepts attack")
  assert_equal(protocol.normalize_rules_mode("attack"), "attack", "protocol normalizes attack")
  local game = rules.create_game(7, players({ "p1", "p2", "p3" }), 0, "attack")
  assert_equal(game.mode, "attack", "game mode")
  assert_equal(game.pending_hit, nil, "no pending hit at creation")
  local deck = rules.build_deck("attack")
  assert_equal(#deck, 112, "deck size")
  assert_equal(kind_count(deck, "number"), 72, "number cards")
  assert_equal(kind_count(deck, "hit1"), 4, "hit one cards")
  assert_equal(kind_count(deck, "hit2"), 8, "hit two cards")
  assert_equal(kind_count(deck, "discardAll"), 8, "discard all cards")
  assert_equal(kind_count(deck, "reverse"), 4, "reverse cards")
  assert_equal(kind_count(deck, "skip"), 8, "skip cards")
  assert_equal(kind_count(deck, "wild"), 4, "wild cards")
  assert_equal(kind_count(deck, "wildAttack"), 4, "wild attack cards")
  assert_equal(kind_count(deck, "draw2"), 0, "no draw two")
  assert_equal(kind_count(deck, "wild4"), 0, "no wild four")
  local has_zero = false
  for _, card in ipairs(deck) do
    if card.value == 0 then
      has_zero = true
    end
  end
  assert_equal(has_zero, false, "no zero cards")
  assert_equal(#rules.build_deck(), 108, "classic deck unchanged")
end)

test("draws seeded 0-3 cards per launcher press and advances the seed", function()
  local game = attack_game({}, "red", 42)
  assert_equal(game.seed, 2783053479, "shuffled seed")
  local expected = { 1, 1, 1, 2 }
  for press, wanted in ipairs(expected) do
    local actor = game.players[game.turn]
    local before = #actor.hand
    local seed_before = game.seed
    local state, ok = rules.apply_action(game, { type = "draw", player_id = actor.id })
    assert_equal(ok, true, "launcher press " .. press)
    local after = 0
    for _, player in ipairs(state.players) do
      if player.id == actor.id then
        after = #player.hand
      end
    end
    assert_equal(after - before, wanted, "launcher count " .. press)
    assert_equal(state.seed == seed_before, false, "seed advanced " .. press)
    assert_equal(state.drawn_card_id, nil, "no playable drawn card")
    game = state
  end
end)

test("sets a pending hit and takes it with launcher draws", function()
  local game = attack_game({ hit1_red }, "red")
  local state, ok, error_code = rules.apply_action(game, {
    type = "play", player_id = "p1", card_id = hit1_red.id,
  })
  assert_equal(ok, true, "hit played: " .. tostring(error_code))
  assert_equal(state.pending_hit.amount, 1, "hit amount")
  assert_equal(state.pending_hit.owner_id, "p1", "hit owner")
  assert_equal(state.pending_hit.target_id, "p2", "hit target")
  assert_equal(state.turn, 2, "target's turn")
  local moves = rules.legal_moves(state, "p2")
  assert_equal(moves.can_draw, true, "target can take")
  assert_equal(rules.legal_moves(state, "p1").can_draw, false, "owner cannot act")
  local taken, taken_ok = rules.apply_action(state, { type = "draw", player_id = "p2" })
  assert_equal(taken_ok, true, "hit taken")
  assert_equal(taken.pending_hit, nil, "hit cleared")
  assert_equal(#taken.players[2].hand, 1, "one launcher card drawn")
  assert_equal(taken.turn, 3, "turn passed")
end)

test("presses the launcher once per hit for Hit 2", function()
  local game = attack_game({ hit2_green }, "green", 123456789)
  local played, ok = rules.apply_action(game, {
    type = "play", player_id = "p1", card_id = hit2_green.id,
  })
  assert_equal(ok, true, "hit two played")
  assert_equal(played.pending_hit.amount, 2, "two hits")
  local taken, taken_ok = rules.apply_action(played, { type = "draw", player_id = "p2" })
  assert_equal(taken_ok, true, "hits taken")
  assert_equal(#taken.players[2].hand, 5, "three plus two launcher cards")
end)

test("deflects a hit with any hit card and accumulates the amount", function()
  local game = attack_game({ hit1_red }, "red")
  game.players[2].hand = { hit2_green, blue_zero }
  local played = rules.apply_action(game, {
    type = "play", player_id = "p1", card_id = hit1_red.id,
  })
  local deflected, ok, error_code = rules.apply_action(played, {
    type = "play", player_id = "p2", card_id = hit2_green.id,
  })
  assert_equal(ok, true, "deflect accepted: " .. tostring(error_code))
  assert_equal(deflected.pending_hit.amount, 3, "accumulated amount")
  assert_equal(deflected.pending_hit.owner_id, "p2", "new owner")
  assert_equal(deflected.pending_hit.target_id, "p3", "new target")
  assert_equal(deflected.turn, 3, "turn on new target")
  assert_equal(deflected.current_color, "green", "colour changed")
  assert_equal(join(ids(deflected.players[2].hand)), blue_zero.id, "spare card kept")
end)

test("rejects a deflection that is not a hit card", function()
  local game = attack_game({ hit1_red }, "red")
  game.players[2].hand = { blue_zero }
  local played = rules.apply_action(game, {
    type = "play", player_id = "p1", card_id = hit1_red.id,
  })
  local _, ok, error_code = rules.apply_action(played, {
    type = "play", player_id = "p2", card_id = blue_zero.id,
  })
  assert_equal(ok, false, "deflection refused")
  assert_equal(error_code, protocol.ERROR.ILLEGAL_CARD, "error code")
end)

test("Wild Attack requires a valid target and hits them twice", function()
  local game = attack_game({ wild_attack, one_red }, "red")
  local cases = { {}, { target_id = "p1" }, { target_id = "nobody" } }
  for _, extra in ipairs(cases) do
    local action = {
      type = "play", player_id = "p1", card_id = wild_attack.id, chosen_color = "blue",
    }
    for key, value in pairs(extra) do
      action[key] = value
    end
    local _, ok, error_code = rules.apply_action(game, action)
    assert_equal(ok, false, "target required")
    assert_equal(error_code, protocol.ERROR.MISSING_TARGET, "missing target code")
  end
  local no_color, color_ok, color_error = rules.apply_action(game, {
    type = "play", player_id = "p1", card_id = wild_attack.id, target_id = "p3",
  })
  assert_equal(color_ok, false, "colour required")
  assert_equal(color_error, protocol.ERROR.MISSING_COLOR, "missing colour code")
  local played, ok, error_code = rules.apply_action(game, {
    type = "play", player_id = "p1", card_id = wild_attack.id,
    chosen_color = "blue", target_id = "p3",
  })
  assert_equal(ok, true, "wild attack played: " .. tostring(error_code))
  assert_equal(played.current_color, "blue", "chosen colour")
  assert_equal(played.pending_hit.amount, 2, "two hits")
  assert_equal(played.pending_hit.target_id, "p3", "chosen target")
  assert_equal(played.turn, 3, "turn on target")
  local taken, taken_ok = rules.apply_action(played, { type = "draw", player_id = "p3" })
  assert_equal(taken_ok, true, "target took hits")
  assert_equal(taken.turn, 1, "play continues after target")
end)

test("deflects with Wild Attack and redirects the hit", function()
  local game = attack_game({ hit1_red }, "red")
  game.players[2].hand = { wild_attack }
  local played = rules.apply_action(game, {
    type = "play", player_id = "p1", card_id = hit1_red.id,
  })
  local deflected, ok = rules.apply_action(played, {
    type = "play", player_id = "p2", card_id = wild_attack.id,
    chosen_color = "yellow", target_id = "p1",
  })
  assert_equal(ok, true, "redirect accepted")
  assert_equal(deflected.current_color, "yellow", "chosen colour")
  assert_equal(deflected.pending_hit.amount, 3, "accumulated amount")
  assert_equal(deflected.pending_hit.target_id, "p1", "redirected target")
  assert_equal(deflected.turn, 1, "turn redirected")
end)

test("Discard All removes every card of its colour and can win", function()
  local game = attack_game({ discard_red, one_red, red_zero }, "red")
  game.players[1].hand[3] = blue_zero
  local state, ok = rules.apply_action(game, {
    type = "play", player_id = "p1", card_id = discard_red.id,
  })
  assert_equal(ok, true, "discard all played")
  assert_equal(join(ids(state.players[1].hand)), blue_zero.id, "other colour kept")
  assert_equal(state.discard[#state.discard].id, one_red.id, "same colour card discarded")
  assert_equal(state.finished, false, "game continues")

  local final = attack_game({ discard_red, one_red }, "red")
  local won, won_ok = rules.apply_action(final, {
    type = "play", player_id = "p1", card_id = discard_red.id,
  })
  assert_equal(won_ok, true, "final discard all played")
  assert_equal(won.finished, true, "hand finished")
  assert_equal(won.winner, "p1", "winner")

  local other = attack_game({ discard_yellow, blue_zero }, "blue")
  table.insert(other.discard, { id = discard_red.id, color = "red", kind = "discardAll" })
  local cross, cross_ok = rules.apply_action(other, {
    type = "play", player_id = "p1", card_id = discard_yellow.id,
  })
  assert_equal(cross_ok, true, "discard all on discard all")
  assert_equal(cross.current_color, "yellow", "colour updated")
end)

test("attack mode always allows a draw and treats two player Reverse as Skip", function()
  local game = attack_game({ one_red }, "red")
  assert_equal(rules.legal_moves(game, "p1").can_draw, true, "draw always available")
  local drawn, ok = rules.apply_action(game, { type = "draw", player_id = "p1" })
  assert_equal(ok, true, "draw accepted")
  assert_equal(drawn.drawn_card_id, nil, "drawn card not playable")
  assert_equal(drawn.turn, 2, "turn passed")

  local two = attack_game({ reverse_red }, "red", 42, 2)
  local reversed, reverse_ok = rules.apply_action(two, {
    type = "play", player_id = "p1", card_id = reverse_red.id,
  })
  assert_equal(reverse_ok, true, "reverse played")
  assert_equal(reversed.turn, 1, "actor keeps the turn")
  assert_equal(reversed.direction, 1, "direction unchanged")
end)

local nm_red_five = { id = "red-5-0", color = "red", kind = "number", value = 5 }
local nm_red_one = { id = "red-1-0", color = "red", kind = "number", value = 1 }
local nm_blue_zero = { id = "blue-0-0", color = "blue", kind = "number", value = 0 }
local nm_blue_draw_two = { id = "blue-draw2-0", color = "blue", kind = "draw2" }
local nm_red_draw_two = { id = "red-draw2-0", color = "red", kind = "draw2" }
local nm_green_draw_two = { id = "green-draw2-0", color = "green", kind = "draw2" }
local nm_red_draw_four = { id = "red-draw4-0", color = "red", kind = "draw4" }
local nm_blue_draw_four = { id = "blue-draw4-0", color = "blue", kind = "draw4" }
local nm_red_skip_everyone = { id = "red-skipeveryone-0", color = "red", kind = "skipEveryone" }
local nm_red_discard_all = { id = "red-discardall-0", color = "red", kind = "discardAll" }
local nm_red_seven = { id = "red-7-0", color = "red", kind = "number", value = 7 }
local nm_red_zero = { id = "red-0-0", color = "red", kind = "number", value = 0 }
local nm_red_reverse = { id = "red-reverse-0", color = "red", kind = "reverse" }
local nm_wild_draw6 = { id = "wilddraw6-0", color = nil, kind = "wildDraw6" }
local nm_wild_draw10 = { id = "wilddraw10-0", color = nil, kind = "wildDraw10" }
local nm_wild_reverse4 = { id = "wildreverse4-0", color = nil, kind = "wildReverse4" }
local nm_wild_roulette = { id = "wildroulette-0", color = nil, kind = "wildRoulette" }
local nm_wild = { id = "wild-0", color = nil, kind = "wild" }

local function nm_players(count)
  local ids = { "p1", "p2", "p3" }
  if count == 2 then
    ids = { "p1", "p2" }
  end
  return players(ids)
end

local function nm_game(hand, color, seat_count)
  local game = rules.create_game(4242, nm_players(seat_count), 0, "noMercy")
  game.turn = 1
  game.direction = 1
  game.current_color = color or "red"
  game.discard = { nm_red_five }
  game.drawn_card_id = nil
  game.pending_challenge = nil
  game.pending_stack = nil
  game.pending_hit = nil
  game.pending_roulette = nil
  game.finished = false
  game.winner = nil
  for _, player in ipairs(game.players) do
    player.hand = {}
    player.out = false
  end
  game.players[1].hand = hand
  return game
end

local function nm_filler(index)
  return { id = "blue-" .. index .. "-0", color = "blue", kind = "number", value = index % 10 }
end

test("exposes noMercy as an authoritative mode with a 168 card deck", function()
  assert_equal(protocol.is_rules_mode("noMercy"), true, "protocol accepts mode")
  assert_equal(protocol.normalize_rules_mode("noMercy"), "noMercy", "protocol normalizes mode")
  assert_equal(protocol.OP.COLOR_CHOOSE, 108, "colour opcode")
  local game = rules.create_game(7, nm_players(3), 0, "noMercy")
  assert_equal(game.mode, "noMercy", "game mode")
  assert_equal(game.pending_roulette, nil, "no pending roulette at creation")
  assert_equal(game.players[1].out, false, "players start active")
  local deck = rules.build_deck("noMercy")
  assert_equal(#deck, 168, "deck size")
  assert_equal(kind_count(deck, "number"), 80, "number cards")
  assert_equal(kind_count(deck, "skip"), 12, "skip cards")
  assert_equal(kind_count(deck, "reverse"), 12, "reverse cards")
  assert_equal(kind_count(deck, "draw2"), 12, "draw two cards")
  assert_equal(kind_count(deck, "draw4"), 8, "coloured draw four cards")
  assert_equal(kind_count(deck, "discardAll"), 12, "discard all cards")
  assert_equal(kind_count(deck, "skipEveryone"), 8, "skip everyone cards")
  assert_equal(kind_count(deck, "wildReverse4"), 8, "wild reverse four cards")
  assert_equal(kind_count(deck, "wildRoulette"), 8, "wild roulette cards")
  assert_equal(kind_count(deck, "wildDraw6"), 4, "wild draw six cards")
  assert_equal(kind_count(deck, "wildDraw10"), 4, "wild draw ten cards")
  assert_equal(kind_count(deck, "wild"), 0, "no plain wild")
  assert_equal(kind_count(deck, "wild4"), 0, "no classic wild four")
  local unique = {}
  for _, card in ipairs(deck) do
    assert_equal(unique[card.id] == nil, true, "unique id " .. card.id)
    unique[card.id] = true
  end
  for _, id in ipairs({
    "red-draw4-0", "blue-skipeveryone-1", "green-discardall-2", "wilddraw6-3",
    "wilddraw10-3", "wildreverse4-7", "wildroulette-7",
  }) do
    assert_equal(unique[id] == true, true, "documented id " .. id)
  end
  assert_equal(rules.draw_card_value("draw2"), 2, "draw two value")
  assert_equal(rules.draw_card_value("draw4"), 4, "draw four value")
  assert_equal(rules.draw_card_value("wildReverse4"), 4, "wild reverse four value")
  assert_equal(rules.draw_card_value("wildDraw6"), 6, "wild draw six value")
  assert_equal(rules.draw_card_value("wildDraw10"), 10, "wild draw ten value")
end)

test("always flips a number card as the noMercy starter", function()
  for seed = 1, 120 do
    local game = rules.create_game(seed, nm_players(3), 0, "noMercy")
    assert_equal(game.discard[1].kind, "number", "number starter for seed " .. seed)
    assert_equal(game.starting_rule.kind, "number", "starting rule for seed " .. seed)
  end
end)

test("draws one card at a time until a playable card is drawn", function()
  local game = nm_game({}, "red")
  game.draw_pile = { nm_red_one, nm_blue_zero }
  local drawn, ok = rules.apply_action(game, { type = "draw", player_id = "p1" })
  assert_equal(ok, true, "draw accepted")
  assert_equal(drawn.turn, 1, "turn stays on actor")
  assert_equal(join(ids(drawn.players[1].hand)), nm_blue_zero.id .. "," .. nm_red_one.id, "drawn cards")
  assert_equal(drawn.drawn_card_id, nm_red_one.id, "playable card pending")
  local moves = rules.legal_moves(drawn, "p1")
  assert_equal(join(moves.cards), nm_red_one.id, "only drawn card playable")
  assert_equal(moves.can_draw, false, "no second draw")
  local played, played_ok = rules.apply_action(drawn, { type = "play", player_id = "p1", card_id = nm_red_one.id })
  assert_equal(played_ok, true, "drawn card played")
  assert_equal(played.turn, 2, "turn advanced")
end)

test("reshuffles the discard keeping the top without stalling", function()
  local game = nm_game({}, "red")
  game.draw_pile = { nm_blue_zero }
  game.discard = {
    { id = "blue-1-0", color = "blue", kind = "number", value = 1 },
    nm_blue_zero,
    nm_red_five,
  }
  local drawn, ok = rules.apply_action(game, { type = "draw", player_id = "p1" })
  assert_equal(ok, true, "draw accepted")
  assert_equal(drawn.drawn_card_id, nil, "no playable card")
  assert_equal(drawn.turn, 2, "turn passed")
  assert_equal(#drawn.players[1].hand, 3, "all cards drawn")
  assert_equal(join(ids(drawn.discard)), nm_red_five.id, "top card kept")
end)

test("stacks equal or higher draw cards regardless of colour", function()
  local game = nm_game({ nm_red_draw_four }, "red")
  game.players[2].hand = { nm_blue_draw_two }
  local first, first_ok = rules.apply_action(game, { type = "play", player_id = "p1", card_id = nm_red_draw_four.id })
  assert_equal(first_ok, true, "first draw played")
  assert_equal(first.pending_stack.amount, 4, "initial amount")
  assert_equal(first.pending_stack.value, 4, "initial value")
  local moves = rules.legal_moves(first, "p2")
  assert_equal(#moves.cards, 0, "lower card not stackable")
  assert_equal(moves.can_draw, true, "take available")
  local rejected, rejected_ok, rejected_code = rules.apply_action(first, {
    type = "play", player_id = "p2", card_id = nm_blue_draw_two.id,
  })
  assert_equal(rejected_ok, false, "lower stack refused")
  assert_equal(rejected_code, protocol.ERROR.ILLEGAL_CARD, "illegal card code")
  assert_equal(rejected == first, true, "state untouched")

  game = nm_game({ nm_blue_draw_two }, "blue")
  game.discard = { nm_blue_draw_two }
  game.players[2].hand = { nm_red_draw_four }
  game.players[3].hand = { nm_wild_draw6 }
  local started = rules.apply_action(game, { type = "play", player_id = "p1", card_id = nm_blue_draw_two.id })
  local stacked = rules.apply_action(started, { type = "play", player_id = "p2", card_id = nm_red_draw_four.id })
  assert_equal(stacked.pending_stack.amount, 6, "accumulated amount")
  assert_equal(stacked.pending_stack.value, 4, "new value")
  local stacked_again = rules.apply_action(stacked, {
    type = "play", player_id = "p3", card_id = nm_wild_draw6.id, chosen_color = "green",
  })
  assert_equal(stacked_again.pending_stack.amount, 12, "wild draw six added")
  assert_equal(stacked_again.current_color, "green", "chosen colour")
  local before = #stacked_again.players[1].hand
  local taken = rules.apply_action(stacked_again, { type = "draw", player_id = "p1" })
  assert_equal(#taken.players[1].hand, before + 12, "target drew the full stack")
  assert_equal(taken.pending_stack, nil, "stack cleared")
end)

test("eliminates a player at 25 cards and declares the last active player the winner", function()
  local game = nm_game({ nm_blue_draw_two }, "blue", 2)
  for index = 1, 24 do
    game.players[2].hand[index] = nm_filler(index)
  end
  local played = rules.apply_action(game, { type = "play", player_id = "p1", card_id = nm_blue_draw_two.id })
  local state, ok = rules.apply_action(played, { type = "draw", player_id = "p2" })
  assert_equal(ok, true, "stack taken")
  assert_equal(#state.players[2].hand, 26, "target drew two")
  assert_equal(state.players[2].out, true, "target eliminated")
  assert_equal(#state.players, 2, "seat kept")
  assert_equal(state.finished, true, "hand finished")
  assert_equal(state.winner, "p1", "survivor wins")
end)

test("refuses an action from an eliminated seat", function()
  local game = nm_game({ nm_red_one }, "red")
  game.players[1].out = true
  local state, ok, error_code = rules.apply_action(game, {
    type = "play", player_id = "p1", card_id = nm_red_one.id,
  })
  assert_equal(ok, false, "eliminated actor refused")
  assert_equal(error_code, protocol.ERROR.NOT_YOUR_TURN, "not your turn code")
  assert_equal(state == game, true, "state untouched")
end)

test("skips eliminated seats and rotates only active hands on zero", function()
  local game = nm_game({ nm_red_zero }, "red")
  game.players[1].out = false
  game.players[2].hand = { nm_blue_zero }
  game.players[3].hand = { nm_green_draw_two }
  game.players[2].out = true
  local state, ok = rules.apply_action(game, { type = "play", player_id = "p1", card_id = nm_red_zero.id })
  assert_equal(ok, true, "zero played")
  assert_equal(join(ids(state.players[1].hand)), nm_green_draw_two.id, "p1 received p3 hand")
  assert_equal(join(ids(state.players[2].hand)), nm_blue_zero.id, "eliminated hand untouched")
  assert_equal(#state.players[3].hand, 0, "p3 received empty hand")
  assert_equal(rules.legal_moves(state, "p2").can_draw, false, "eliminated player cannot act")
end)

test("swaps hands on a seven with a valid active target", function()
  local game = nm_game({ nm_red_seven, nm_red_one }, "red")
  game.players[2].hand = { nm_blue_zero }
  local missing, missing_ok, missing_code = rules.apply_action(game, {
    type = "play", player_id = "p1", card_id = nm_red_seven.id,
  })
  assert_equal(missing_ok, false, "target required")
  assert_equal(missing_code, protocol.ERROR.MISSING_TARGET, "missing target code")
  assert_equal(missing == game, true, "state untouched")
  game.players[2].out = true
  local refused, refused_ok = rules.apply_action(game, {
    type = "play", player_id = "p1", card_id = nm_red_seven.id, target_id = "p2",
  })
  assert_equal(refused_ok, false, "eliminated target refused")
  assert_equal(refused == game, true, "state untouched")
  game.players[2].out = false
  local state, ok = rules.apply_action(game, {
    type = "play", player_id = "p1", card_id = nm_red_seven.id, target_id = "p2",
  })
  assert_equal(ok, true, "seven played")
  assert_equal(join(ids(state.players[1].hand)), nm_blue_zero.id, "actor took target hand")
  assert_equal(join(ids(state.players[2].hand)), nm_red_one.id, "target took actor hand")
end)

test("plays a coloured Draw Four on another Draw Four without a colour change", function()
  local game = nm_game({ nm_red_draw_four, nm_red_one }, "green")
  game.discard = { nm_blue_draw_four }
  local state, ok = rules.apply_action(game, { type = "play", player_id = "p1", card_id = nm_red_draw_four.id })
  assert_equal(ok, true, "draw four played")
  assert_equal(state.current_color, "green", "colour unchanged")
  assert_equal(state.pending_challenge, nil, "no challenge")
  assert_equal(state.pending_stack.kind, "draw4", "stack kind")
  local challenged, challenge_ok, challenge_code = rules.apply_action(state, {
    type = "challenge", player_id = "p2", accept = true,
  })
  assert_equal(challenge_ok, false, "no challenge accepted")
  assert_equal(challenge_code, protocol.ERROR.BAD_CHALLENGE, "bad challenge code")
  assert_equal(challenged == state, true, "state untouched")
end)

test("requires a colour for Wild Draw Six and Wild Draw Ten", function()
  for _, entry in ipairs({
    { card = nm_wild_draw6, amount = 6 },
    { card = nm_wild_draw10, amount = 10 },
  }) do
    local game = nm_game({ entry.card, nm_red_one }, "red")
    local missing, missing_ok, missing_code = rules.apply_action(game, {
      type = "play", player_id = "p1", card_id = entry.card.id,
    })
    assert_equal(missing_ok, false, "colour required")
    assert_equal(missing_code, protocol.ERROR.MISSING_COLOR, "missing colour code")
    assert_equal(missing == game, true, "state untouched")
    local state, ok = rules.apply_action(game, {
      type = "play", player_id = "p1", card_id = entry.card.id, chosen_color = "yellow",
    })
    assert_equal(ok, true, "wild draw played")
    assert_equal(state.current_color, "yellow", "chosen colour")
    assert_equal(state.pending_stack.amount, entry.amount, "stack amount")
    assert_equal(state.pending_stack.value, entry.amount, "stack value")
  end
end)

test("reverses before drawing with Wild Reverse Draw Four", function()
  local game = nm_game({ nm_wild_reverse4 }, "red")
  local state, ok = rules.apply_action(game, {
    type = "play", player_id = "p1", card_id = nm_wild_reverse4.id, chosen_color = "blue",
  })
  assert_equal(ok, true, "wild reverse four played")
  assert_equal(state.direction, -1, "direction reversed")
  assert_equal(state.pending_stack.target_id, "p3", "new direction target")
  assert_equal(state.pending_stack.amount, 4, "four pending")

  local two = nm_game({ nm_wild_reverse4 }, "red", 2)
  local self_target, self_ok = rules.apply_action(two, {
    type = "play", player_id = "p1", card_id = nm_wild_reverse4.id, chosen_color = "blue",
  })
  assert_equal(self_ok, true, "two player wild reverse four played")
  assert_equal(self_target.pending_stack.target_id, "p1", "targets the actor")
  local taken, taken_ok = rules.apply_action(self_target, { type = "draw", player_id = "p1" })
  assert_equal(taken_ok, true, "actor took the stack")
  assert_equal(#taken.players[1].hand, 4, "actor drew four")
  assert_equal(taken.turn, 2, "turn passed")
end)

test("resolves Wild Colour Roulette with an authoritative chooser", function()
  local game = nm_game({ nm_wild_roulette, nm_red_one }, "red")
  game.draw_pile = { nm_red_one, nm_wild, { id = "blue-9-0", color = "blue", kind = "number", value = 9 } }
  local played, ok = rules.apply_action(game, { type = "play", player_id = "p1", card_id = nm_wild_roulette.id })
  assert_equal(ok, true, "roulette played")
  assert_equal(played.pending_roulette.chooser_id, "p2", "chooser stored")
  assert_equal(played.pending_roulette.owner_id, "p1", "owner stored")
  assert_equal(played.turn, 2, "chooser acts")
  local moves = rules.legal_moves(played, "p2")
  assert_equal(#moves.cards, 0, "no cards to play")
  assert_equal(moves.can_draw, false, "no draw")
  local wrong, wrong_ok, wrong_code = rules.apply_action(played, {
    type = "choose_colour", player_id = "p1", colour = "red",
  })
  assert_equal(wrong_ok, false, "wrong chooser refused")
  assert_equal(wrong_code, protocol.ERROR.NOT_YOUR_TURN, "not your turn code")
  local invalid, invalid_ok, invalid_code = rules.apply_action(played, {
    type = "choose_colour", player_id = "p2", colour = "purple",
  })
  assert_equal(invalid_ok, false, "invalid colour refused")
  assert_equal(invalid_code, protocol.ERROR.MISSING_COLOR, "missing colour code")
  assert_equal(invalid == played, true, "state untouched")
  local chosen, chosen_ok = rules.apply_action(played, {
    type = "choose_colour", player_id = "p2", colour = "red",
  })
  assert_equal(chosen_ok, true, "colour chosen")
  assert_equal(chosen.pending_roulette, nil, "roulette cleared")
  assert_equal(join(ids(chosen.players[2].hand)), "blue-9-0," .. nm_wild.id .. "," .. nm_red_one.id,
    "wilds revealed but did not stop the reveal")
  assert_equal(chosen.turn, 3, "turn passed after reveal")

  local final = nm_game({ nm_wild_roulette }, "red")
  local won, won_ok = rules.apply_action(final, { type = "play", player_id = "p1", card_id = nm_wild_roulette.id })
  assert_equal(won_ok, true, "final roulette played")
  assert_equal(won.finished, true, "hand finished")
  assert_equal(won.winner, "p1", "winner")
  assert_equal(won.pending_roulette, nil, "no pending roulette")
end)

test("plays Discard All and Skip Everyone in noMercy", function()
  local discard = nm_game({ nm_red_discard_all, nm_red_one }, "red")
  discard.players[1].hand[3] = nm_blue_zero
  local discarded, discarded_ok = rules.apply_action(discard, {
    type = "play", player_id = "p1", card_id = nm_red_discard_all.id,
  })
  assert_equal(discarded_ok, true, "discard all played")
  assert_equal(join(ids(discarded.players[1].hand)), nm_blue_zero.id, "other colour kept")
  local final = nm_game({ nm_red_discard_all, nm_red_one }, "red")
  local won, won_ok = rules.apply_action(final, {
    type = "play", player_id = "p1", card_id = nm_red_discard_all.id,
  })
  assert_equal(won_ok, true, "final discard all played")
  assert_equal(won.finished, true, "hand finished")
  assert_equal(won.winner, "p1", "winner")

  local skip = nm_game({ nm_red_skip_everyone, nm_red_one }, "red")
  local skipped, skip_ok = rules.apply_action(skip, {
    type = "play", player_id = "p1", card_id = nm_red_skip_everyone.id,
  })
  assert_equal(skip_ok, true, "skip everyone played")
  assert_equal(skipped.turn, 1, "actor acts again")
  assert_equal(skipped.current_color, "red", "colour updated")
  assert_equal(#rules.legal_moves(skipped, "p2").cards, 0, "other seats skipped")

  local two = nm_game({ nm_red_reverse, nm_red_one }, "red", 2)
  local reverse, reverse_ok = rules.apply_action(two, { type = "play", player_id = "p1", card_id = nm_red_reverse.id })
  assert_equal(reverse_ok, true, "reverse played")
  assert_equal(reverse.turn, 1, "reverse skips with two players")
  assert_equal(reverse.direction, 1, "direction unchanged")
end)

test("scores noMercy wild variants at 50 and coloured actions at 20", function()
  assert_equal(rules.score_hand({ nm_wild_draw6, nm_wild_draw10, nm_wild_reverse4, nm_wild_roulette }), 200,
    "wild variant score")
  assert_equal(rules.score_hand({ nm_red_draw_four, nm_red_skip_everyone, nm_red_discard_all }), 60,
    "coloured action score")
end)

if failures > 0 then
  io.stderr:write(failures .. " Uno rules test(s) failed\n")
  os.exit(1)
end
print("all Uno rules tests passed")
