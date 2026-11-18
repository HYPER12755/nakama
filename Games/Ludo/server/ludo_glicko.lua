-- MoonGames Ludo ratings in the Glicko-2 system.
--
-- A rating on its own says little: a player who has played one game is
-- not the same as a player who has played two hundred. Glicko-2 keeps the
-- rating, how far it may be from the truth, and how much that distance may
-- move, so a new player is treated as uncertain and settles down.
--
-- The numbers are the ones from the paper by Mark Glickman, with the
-- scale of the ratings left as it is for MoonGames.

local glicko = {}

-- The rating a player starts on.
glicko.DEFAULT_RATING = 1200
-- How far the rating of a new player may be from the truth.
glicko.DEFAULT_DEVIATION = 60
-- How much that distance may move at the start.
glicko.DEFAULT_VOLATILITY = 0.06
-- The smallest a rating may be.
glicko.MIN_RATING = 100
-- The number that turns a rating into the scale Glicko-2 works in.
glicko.SCALE = 173.7178
-- The number that turns the scale back into a rating.
glicko.RATING_SCALE = 400
-- The number the square root of the sum of squares uses.
glicko.PI_SQUARED = math.pi * math.pi

local function number(value, fallback)
  local parsed = tonumber(value)
  if parsed == nil then
    return fallback
  end
  return parsed
end

local function round_away(value)
  if value >= 0 then
    return math.floor(value + 0.5)
  end
  return -math.floor(-value + 0.5)
end

--- The rating on the scale Glicko-2 works in.
function glicko.to_mu(rating)
  return (number(rating, glicko.DEFAULT_RATING) - 1500) / glicko.SCALE
end

--- The rating on the scale the players see.
function glicko.from_mu(mu)
  return glicko.SCALE * mu + 1500
end

--- How far the rating may be from the truth, on the scale Glicko-2 uses.
function glicko.to_phi(deviation)
  return number(deviation, glicko.DEFAULT_DEVIATION) / glicko.SCALE
end

--- How far the rating may be from the truth, on the scale the players see.
function glicko.from_phi(phi)
  return glicko.SCALE * phi
end

--- The weight of a game against a player whose uncertainty is phi.
local function g(phi)
  return 1 / math.sqrt(1 + 3 * phi * phi / glicko.PI_SQUARED)
end

--- How likely the game is to be won, against a player with the given
--- rating and uncertainty.
function glicko.expected_score(mu, mu_opponent, phi_opponent)
  return 1 / (1 + math.exp(-g(phi_opponent) * (mu - mu_opponent)))
end

--- The score of a game: a win is one, a draw is a half, a loss is none.
function glicko.score_for_outcome(outcome)
  if outcome == "win" then
    return 1
  elseif outcome == "draw" then
    return 0.5
  elseif outcome == "loss" then
    return 0
  end
  return nil
end

--- The new rating of a player, after a game.
--
-- The player and the opponent are given as tables with a rating, a
-- deviation and a volatility. The opponent's volatility is not needed,
-- for it does not change when the game is over.
function glicko.update(player, opponent, outcome)
  local score = glicko.score_for_outcome(outcome)
  if score == nil then
    return nil
  end

  local mu = glicko.to_mu(player.rating)
  local phi = glicko.to_phi(player.deviation)
  local sigma = number(player.volatility, glicko.DEFAULT_VOLATILITY)
  local mu_opponent = glicko.to_mu(opponent.rating)
  local phi_opponent = glicko.to_phi(opponent.deviation)

  local g_opponent = g(phi_opponent)
  local expected = glicko.expected_score(mu, mu_opponent, phi_opponent)

  -- The sum of the games against the opponents, and how far the result was
  -- from what was expected.
  local sum_score = g_opponent * (score - expected)
  local sum = g_opponent * g_opponent * expected * (1 - expected)
  local v = 1
  if sum > 0 then
    v = 1 / sum
  end
  -- The distance the result was from the truth.
  local delta = v * sum_score

  -- The volatility is found the way the paper says, by the Illinois method:
  -- the sum is made as small as it can be.
  local phi_star = math.sqrt(phi * phi + sigma * sigma)
  local delta_sq = delta * delta
  local phi_sq = phi * phi
  local tau_squared = 0.06

  local function f(x)
    local ex = math.exp(x)
    local numerator = ex * (delta_sq - phi_sq - v - ex)
    local denominator = 2 * (phi_sq + v + ex) * (phi_sq + v + ex)
    local inner = 1
      + ((phi_sq + v + ex) * (phi_sq + v + ex) - delta_sq)
      / (2 * phi_sq * v + ex + phi_sq + v)
    return numerator / denominator
      - (math.log(inner) - math.log(0.5)) / tau_squared
  end

  local a = math.log(sigma * sigma)
  local b = a
  local delta_sigma = 1
  local tolerance = 0.000001
  local rounds = 0

  while math.abs(delta_sigma) > tolerance and rounds < 100 do
    rounds = rounds + 1
    local f_a = f(a)
    if f_a * delta_sigma < 0 then
      b = a
    else
      a = b
    end
    f_a = f(a)
    local f_b = f(b)
    local denominator = f_b - f_a
    if denominator == 0 then
      break
    end
    local u = f_a / denominator
    a = a + delta_sigma * u
    local step = -((a - b) * (a - b) * f(a)) / (u * (a - b) * (a - b) + f_b - f_a)
    delta_sigma = step
  end

  local new_sigma = math.exp(a / 2)
  if new_sigma > sigma then
    new_sigma = sigma
  end

  local new_phi = 1 / math.sqrt(1 / (phi_star * phi_star) + 1 / v)
  local new_mu = mu + new_phi * new_phi * sum_score

  return {
    rating = round_away(glicko.from_mu(new_mu)),
    deviation = math.floor(glicko.from_phi(new_phi)),
    volatility = new_sigma,
  }
end

return glicko
