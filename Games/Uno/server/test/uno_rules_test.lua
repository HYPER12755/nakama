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
local blue_draw_two = { id = "blue-draw2-0", color = "blue", kind = "draw2" }

local function staged_game(hand, color)
  local game = rules.create_game(vectors.seed, seats())
  game.turn = 1
  game.direction = 1
  game.current_color = color or "red"
  game.drawn_card_id = nil
  game.pending_challenge = nil
  game.finished = false
  game.winner = nil
  game.players[1].hand = hand
  return game
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

if failures > 0 then
  io.stderr:write(failures .. " Uno rules test(s) failed\n")
  os.exit(1)
end
print("all Uno rules tests passed")
