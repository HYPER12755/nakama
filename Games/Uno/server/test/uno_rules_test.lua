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

test("builds and shuffles a deterministic 108 card deck", function()
  assert_equal(#rules.build_deck(), vectors.deckSize, "deck size")
  local shuffled, _ = rules.shuffle(vectors.seed, rules.build_deck())
  local head = {}
  for index = 1, 12 do
    head[index] = shuffled[index].id
  end
  assert_equal(join(head), join(vectors.shuffledHead), "shuffled head")
end)

test("deals the same hand and starting card as the TypeScript core", function()
  local game = rules.create_game(vectors.seed, players(vectors.reference.players))
  assert_equal(join(ids(game.players[1].hand)), join(vectors.startingHand), "starting hand")
  assert_equal(game.discard[1].id, vectors.startingDiscard, "starting discard")
  assert_equal(game.current_color, vectors.startingColor, "starting colour")
  assert_equal(game.discard[1].kind, "number", "number card starts play")
end)

test("reports the same legal moves as the TypeScript core", function()
  local game = rules.create_game(vectors.seed, players(vectors.reference.players))
  local moves = rules.legal_moves(game, "p1")
  assert_equal(join(moves.cards), join(vectors.startingLegal.cards), "legal cards")
  assert_equal(moves.can_draw, vectors.startingLegal.canDraw, "draw available")
end)

test("rejects illegal plays and wrong turns", function()
  local game = rules.create_game(vectors.seed, players(vectors.reference.players))
  local state, ok, error_code = rules.apply_action(game, { type = "draw", player_id = "p2" })
  assert_equal(ok, false, "wrong turn refused")
  assert_equal(error_code, protocol.ERROR.NOT_YOUR_TURN, "error code")
  assert_equal(state == game, true, "state untouched")
end)

test("plays the shared reference game to the same winner", function()
  local state = rules.create_game(vectors.seed, players(vectors.reference.players))
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
