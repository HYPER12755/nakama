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

if failures > 0 then
  io.stderr:write(failures .. " Uno rules test(s) failed\n")
  os.exit(1)
end
print("all Uno rules tests passed")
