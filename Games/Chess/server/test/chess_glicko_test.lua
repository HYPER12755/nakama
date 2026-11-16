-- Tests for the Glicko-2 ratings of Chess.
--
-- The example is the one from the paper by Mark Glickman, so the numbers
-- are checked against a known answer and not against themselves.

local script_path = arg[0] or "Chess/server/test/chess_glicko_test.lua"
local script_dir = script_path:match("^(.*)[/\\]") or "."
local server_dir = script_dir .. "/.."

local glicko = assert(dofile(server_dir .. "/chess_glicko.lua"))

local tests_run = 0
local tests_passed = 0
local tests_failed = 0

local function test(name, callback)
  tests_run = tests_run + 1
  local ok, err = xpcall(callback, debug.traceback)
  if ok then
    tests_passed = tests_passed + 1
    print("[ok] " .. name)
  else
    tests_failed = tests_failed + 1
    print("[FAIL] " .. name)
    print(err)
  end
end

local function assert_equal(actual, expected, message)
  if actual ~= expected then
    error(
      (message or "assert_equal")
        .. ": expected "
        .. tostring(expected)
        .. ", got "
        .. tostring(actual),
      2
    )
  end
end

local function assert_near(actual, expected, tolerance, message)
  if math.abs(actual - expected) > (tolerance or 0.01) then
    error(
      (message or "assert_near")
        .. ": expected "
        .. tostring(expected)
        .. ", got "
        .. tostring(actual),
      2
    )
  end
end

local function assert_truthy(value, message)
  if not value then
    error((message or "expected a value") .. ", got nothing", 2)
  end
end

test("the example from the paper", function()
  -- A player of 1500 with a wide uncertainty beats a player of 1400 whose
  -- rating is certain. The player rises, and the uncertainty closes.
  local player = {
    rating = 1500,
    deviation = 200,
    volatility = 0.06,
  }
  local opponent = {
    rating = 1400,
    deviation = 30,
    volatility = 0.06,
  }

  local updated = glicko.update(player, opponent, "win")

  assert_truthy(updated, "the rating was not changed")
  assert_near(updated.rating, 1564.06, 1.0, "the rating")
  assert_near(updated.deviation, 175.37, 1.0, "the deviation")
  assert_near(updated.volatility, 0.05999, 0.0001, "the volatility")
end)

test("a draw against a certain player pulls the rating down", function()
  -- The same pair, and the game is drawn. The certain player is believed
  -- more, so the uncertain player falls a little.
  local player = {
    rating = 1500,
    deviation = 200,
    volatility = 0.06,
  }
  local opponent = {
    rating = 1400,
    deviation = 30,
    volatility = 0.06,
  }

  local updated = glicko.update(player, opponent, "draw")

  assert_truthy(updated, "the rating was not changed")
  assert_near(updated.rating, 1475.42, 1.0, "the rating")
  assert_near(updated.deviation, 175.37, 1.0, "the deviation")
  assert_near(updated.volatility, 0.05999, 0.0001, "the volatility")
  assert_truthy(updated.rating < player.rating, "the rating did not fall")
  assert_truthy(updated.rating > 1400, "the rating fell too far")
end)

test("a game that is lost moves the rating the other way", function()
  local player = {
    rating = 1500,
    deviation = 200,
    volatility = 0.06,
  }
  local opponent = {
    rating = 1400,
    deviation = 30,
    volatility = 0.06,
  }

  local updated = glicko.update(player, opponent, "loss")

  assert_truthy(updated, "the rating was not changed")
  assert_truthy(updated.rating < player.rating, "the rating did not fall")
end)

test("a game that is drawn moves the rating a little", function()
  local player = {
    rating = 1500,
    deviation = 200,
    volatility = 0.06,
  }
  local opponent = {
    rating = 1400,
    deviation = 30,
    volatility = 0.06,
  }

  local updated = glicko.update(player, opponent, "draw")

  assert_truthy(updated, "the rating was not changed")
  assert_truthy(updated.rating < player.rating, "the rating did not fall")
  assert_truthy(updated.rating > 1400, "the rating fell too far")
end)

test("a game that is not a game changes nothing", function()
  local player = {
    rating = 1500,
    deviation = 200,
    volatility = 0.06,
  }
  local opponent = {
    rating = 1400,
    deviation = 30,
    volatility = 0.06,
  }

  assert_equal(glicko.update(player, opponent, "abandoned"), nil)
end)

test("the scales are turned into each other and back", function()
  assert_near(glicko.from_mu(glicko.to_mu(1234)), 1234, 0.001)
  assert_near(glicko.from_phi(glicko.to_phi(45)), 45, 0.001)
end)

test("a player who has played nothing is uncertain", function()
  -- A player with a wide deviation moves more than one with a narrow one.
  local uncertain = glicko.update(
    { rating = 1200, deviation = 200, volatility = 0.06 },
    { rating = 1200, deviation = 200, volatility = 0.06 },
    "win"
  )
  local certain = glicko.update(
    { rating = 1200, deviation = 30, volatility = 0.06 },
    { rating = 1200, deviation = 30, volatility = 0.06 },
    "win"
  )

  assert_truthy(
    uncertain.rating > certain.rating,
    "the uncertain player did not move more"
  )
end)

print("")
print(
  string.format(
    "%d/%d tests passed",
    tests_passed,
    tests_run
  )
)

if tests_failed > 0 then
  os.exit(1)
end
