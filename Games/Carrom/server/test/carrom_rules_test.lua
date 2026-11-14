-- Tests for the authoritative Carrom physics and rules.
--
-- The parity vectors come from the TypeScript core, so the server and the
-- client resolve the same shot the same way.

local script_path = arg[0] or "Carrom/server/test/carrom_rules_test.lua"
local script_dir = script_path:match("^(.*)[/\\]") or "."
local server_dir = script_dir .. "/.."

package.path = server_dir .. "/?.lua;" .. package.path

local physics = require("carrom_physics")
local rules = require("carrom_rules")

local failures = 0

local function test(name, fn)
  local ok, err = pcall(fn)
  if ok then
    print("ok - " .. name)
  else
    failures = failures + 1
    print("not ok - " .. name .. ": " .. tostring(err))
  end
end

local function assert_equal(actual, expected, message)
  if actual ~= expected then
    error(
      (message or "values differ")
        .. ": expected "
        .. tostring(expected)
        .. " but got "
        .. tostring(actual),
      2
    )
  end
end

local function assert_near(actual, expected, tolerance, message)
  if math.abs(actual - expected) > (tolerance or 1e-6) then
    error(
      (message or "values differ")
        .. ": expected "
        .. tostring(expected)
        .. " but got "
        .. tostring(actual),
      2
    )
  end
end

local function count_discs(state, kind)
  local total = 0
  for _, disc in ipairs(state.discs) do
    if disc.kind == kind then
      total = total + 1
    end
  end
  return total
end

-- The reference shot: straight up the board from the bottom baseline.
local REFERENCE = {
  { "queen", 0.713965, 0.273371, false },
  { "w1", 0.443125, 0.259480, false },
  { "b1", 0.469462, 0.464569, false },
  { "w2", 0.338996, 0.747500, false },
  { "b2", 0.265515, 0.315526, false },
  { "w3", 0.929379, 0.377471, false },
  { "b3", 0.559062, 0.375093, false },
  { "w4", 0.632513, 0.515642, false },
  { "b4", 0.301612, 0.596193, false },
  { "w5", 0.200215, 0.655450, false },
  { "b5", 0.163060, 0.390473, false },
  { "w6", 0.498850, 0.207320, false },
  { "b6", 0.051941, 0.331563, false },
  { "w7", 0.828435, 0.385190, false },
  { "b7", 0.607566, 0.374000, false },
  { "w8", 0.733676, 0.075445, false },
  { "b8", 0.846186, 0.568947, false },
  { "w9", 0.674797, 0.605750, false },
  { "b9", 0.576525, 0.577042, false },
}

test("opens a two player board with the ICF piece counts", function()
  local state = rules.create_initial_state({ "white", "black" })
  assert_equal(#state.discs, 19, "disc count")
  assert_equal(count_discs(state, "white"), 9, "white men")
  assert_equal(count_discs(state, "black"), 9, "black men")
  assert_equal(count_discs(state, "queen"), 1, "queen")
  assert_equal(state.turn, "white", "first player")
  assert_equal(state.queen.status, "board", "queen status")
end)

test("opens three and four player boards", function()
  local three = rules.create_initial_state({ "white", "black", "green" })
  assert_equal(#three.discs, 28, "three player disc count")
  assert_equal(count_discs(three, "green"), 9, "green men")

  local four = rules.create_initial_state({ "white", "black", "green", "yellow" })
  assert_equal(#four.discs, 37, "four player disc count")
  assert_equal(count_discs(four, "yellow"), 9, "yellow men")
end)

test("moves the turn around the table", function()
  assert_equal(rules.next_player({ "white", "black" }, "white"), "black", "two players")
  assert_equal(
    rules.next_player({ "white", "black", "green" }, "black"),
    "green",
    "three players"
  )
  assert_equal(
    rules.next_player({ "white", "black", "green", "yellow" }, "white"),
    "yellow",
    "four players"
  )
end)

test("matches the TypeScript core for the reference shot", function()
  local state = rules.create_initial_state({ "white", "black" })
  local shot = { position = 0.5, angle = -math.pi / 2, power = 0.8 }
  local result = physics.simulate(state, shot)
  local next_state, outcome = rules.resolve(state, result, shot)

  assert_equal(#next_state.discs, #REFERENCE, "disc count")
  for index, expected in ipairs(REFERENCE) do
    local disc = next_state.discs[index]
    assert_equal(disc.id, expected[1], "disc id")
    assert_near(disc.x, expected[2], 1e-5, "disc x")
    assert_near(disc.y, expected[3], 1e-5, "disc y")
    assert_equal(disc.pocketed, expected[4], "disc pocketed")
  end

  assert_equal(next_state.turn, "black", "turn after the shot")
  assert_equal(next_state.scores.white, 0, "white score")
  assert_equal(next_state.scores.black, 0, "black score")
  assert_equal(outcome.ownPocketed, 0, "own pocketed")
  assert_equal(outcome.foul, false, "foul")
  assert_near(result.duration, 3.25, 0.01, "duration")
end)

-- Build a physics result with the given pieces pocketed, without running the
-- simulation. It mirrors the fabricated results used by the TypeScript tests.
local function fabricate(state, pocketed_ids, striker_pocketed)
  local pocket = physics.POCKETS[1]
  local discs = {}
  local pocketed = {}
  for _, disc in ipairs(state.discs) do
    local copy = {
      id = disc.id,
      kind = disc.kind,
      x = disc.x,
      y = disc.y,
      pocketed = disc.pocketed,
    }
    for _, id in ipairs(pocketed_ids or {}) do
      if id == disc.id then
        copy.pocketed = true
        copy.x = pocket.x
        copy.y = pocket.y
        pocketed[#pocketed + 1] = {
          time = 0.5,
          id = disc.id,
          kind = disc.kind,
          x = pocket.x,
          y = pocket.y,
        }
      end
    end
    discs[#discs + 1] = copy
  end
  return {
    discs = discs,
    striker_pocketed = striker_pocketed == true,
    striker = { x = 0.5, y = 0.75, pocketed = striker_pocketed == true },
    pocketed = pocketed,
    events = {},
    duration = 1,
  }
end

test("scores an own pocket and keeps the turn", function()
  local state = rules.create_initial_state({ "white", "black" })
  local shot = { position = 0.5, angle = -math.pi / 2, power = 0.8 }
  local result = fabricate(state, { "w1" })
  local next_state, outcome = rules.resolve(state, result, shot)
  assert_equal(next_state.scores.white, 1, "white score")
  assert_equal(next_state.turn, "white", "turn")
  assert_equal(outcome.turnContinued, true, "turn continued")
  assert_equal(outcome.foul, false, "foul")
end)

test("returns one piece after a striker foul", function()
  local state = rules.create_initial_state({ "white", "black" })
  local shot = { position = 0.5, angle = -math.pi / 2, power = 0.8 }
  local result = fabricate(state, { "w1" }, true)
  local next_state, outcome = rules.resolve(state, result, shot)
  assert_equal(next_state.scores.white, 0, "white score after the penalty")
  assert_equal(next_state.turn, "black", "turn after the foul")
  assert_equal(outcome.returnedDisc, "white", "returned piece")
  assert_equal(outcome.foul, true, "foul")
end)

test("requires the queen to be covered", function()
  local state = rules.create_initial_state({ "white", "black" })
  local shot = { position = 0.5, angle = -math.pi / 2, power = 0.8 }
  local result = fabricate(state, { "queen" })

  local pending, outcome = rules.resolve(state, result, shot)
  assert_equal(pending.queen.status, "pending", "queen status")
  assert_equal(pending.queen.owner, "white", "queen owner")
  assert_equal(pending.turn, "white", "turn")
  assert_equal(outcome.turnContinued, true, "turn continued")

  local cover = fabricate(pending, { "w1" })
  local covered, cover_outcome = rules.resolve(pending, cover, shot)
  assert_equal(covered.queen.status, "covered", "queen status")
  assert_equal(covered.queen.owner, "white", "queen owner")
  assert_equal(covered.scores.white, 1, "white score")
  assert_equal(cover_outcome.turnContinued, true, "turn continued")
end)

test("declares a winner once the queen is covered and the colour is clear", function()
  local state = rules.create_initial_state({ "white", "black" })
  state.queen = { status = "covered", owner = "white" }
  local white_ids = {}
  for _, disc in ipairs(state.discs) do
    if disc.kind == "white" then
      white_ids[#white_ids + 1] = disc.id
    end
  end
  local result = fabricate(state, white_ids)
  local next_state, outcome = rules.resolve(state, result, {
    position = 0.5,
    angle = -math.pi / 2,
    power = 0.8,
  })
  assert_equal(next_state.status, "finished", "status")
  assert_equal(next_state.winner, "white", "winner")
  assert_equal(outcome.winner, "white", "outcome winner")
end)

test("a game type keeps its rules", function()
  local state = rules.create_initial_state({ "white", "black" }, {
    variant = "freestyle",
  })
  assert_equal(state.rules.id, "freestyle", "variant id")
  assert_equal(state.rules.coverQueen, false, "cover queen")

  local queen_id = nil
  for _, disc in ipairs(state.discs) do
    if disc.kind == "queen" then
      queen_id = disc.id
    end
  end
  local next_state = rules.resolve(
    state,
    fabricate(state, { queen_id }),
    { position = 0.5, angle = -math.pi / 2, power = 0.8 }
  )
  assert_equal(next_state.queen.status, "covered", "queen status")
  assert_equal(next_state.queen.owner, "white", "queen owner")
  assert_equal(rules.points_for(next_state, "white"), 3, "points")
end)

test("a practice table does not punish a foul", function()
  local state = rules.create_initial_state({ "white", "black" }, {
    variant = "practice",
  })
  local black_id = nil
  for _, disc in ipairs(state.discs) do
    if disc.kind == "black" then
      black_id = disc.id
      break
    end
  end
  local next_state, outcome = rules.resolve(
    state,
    fabricate(state, { black_id }, true),
    { position = 0.5, angle = -math.pi / 2, power = 0.8 }
  )
  assert_equal(outcome.foul, false, "foul")
  assert_equal(next_state.scores.black, 1, "score")
end)

test("a solo table keeps the turn", function()
  local state = rules.create_initial_state({ "white", "black" }, {
    solo = true,
  })
  local next_state = rules.resolve(
    state,
    fabricate(state, {}),
    { position = 0.5, angle = -math.pi / 2, power = 0.8 }
  )
  assert_equal(next_state.turn, "white", "turn")
end)

if failures > 0 then
  print(failures .. " carrom rule test(s) failed")
  os.exit(1)
end

print("carrom rules ok")
