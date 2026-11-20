-- MoonGames Carrom physics.
--
-- This is the authoritative port of Carrom/core/src/physics.ts. The step
-- order, constants, and collision rules match the TypeScript core so the
-- client animation and the server result agree.
--
-- The module has no Nakama dependencies so it can be tested with plain Lua.

local physics = {}

physics.DISC_RADIUS = 0.0216
physics.STRIKER_RADIUS = 0.0279
-- The hole in the frame: 4.45 cm across. A piece drops when its centre
-- passes over it.
physics.POCKET_RADIUS = 0.0301
physics.POCKETS = {
  { x = 0.018, y = 0.018 },
  { x = 0.982, y = 0.018 },
  { x = 0.018, y = 0.982 },
  { x = 0.982, y = 0.982 },
}
physics.BASELINE_MIN = 0.25
physics.BASELINE_MAX = 0.75
physics.FRICTION = 1.45
physics.WALL_RESTITUTION = 0.86
physics.DISC_RESTITUTION = 0.92
physics.STRIKER_RESTITUTION = 0.95
physics.STRIKER_MASS = 2.8
physics.DISC_MASS = 1
physics.MIN_SHOT_SPEED = 1
physics.MAX_SHOT_SPEED = 4.6
physics.STOP_SPEED = 0.02
physics.STEP_SECONDS = 1 / 240
physics.MAX_SIMULATION_SECONDS = 9
physics.PIECES_PER_PLAYER = 9

-- The strikers a player can bring to the table. The power is a multiplier on
-- the launch speed, and it mirrors Carrom/core/src/board.ts.
physics.STRIKERS = {
  { id = "classic", label = "Classic", power = 1, mass = 1 },
  { id = "heavy", label = "Heavy", power = 1.28, mass = 1.5 },
  { id = "light", label = "Light", power = 0.72, mass = 0.7 },
  { id = "swift", label = "Swift", power = 1.12, mass = 0.85 },
}

function physics.striker_skin(id)
  for _, skin in ipairs(physics.STRIKERS) do
    if skin.id == id then
      return skin
    end
  end
  return physics.STRIKERS[1]
end

-- Seating order around the table, clockwise.
physics.SEATS = { "white", "yellow", "black", "green" }

physics.BASELINES = {
  white = {
    slide_axis = "x",
    line_axis = "y",
    line_position = 0.75,
    inward = -1,
    axis_angle = math.pi / 2,
  },
  yellow = {
    slide_axis = "y",
    line_axis = "x",
    line_position = 0.25,
    inward = 1,
    axis_angle = math.pi,
  },
  black = {
    slide_axis = "x",
    line_axis = "y",
    line_position = 0.25,
    inward = 1,
    axis_angle = math.pi * 1.5,
  },
  green = {
    slide_axis = "y",
    line_axis = "x",
    line_position = 0.75,
    inward = -1,
    axis_angle = 0,
  },
}

physics.PLAYER_LABEL = {
  white = "PLAYER",
  black = "PLAYER",
  green = "PLAYER",
  yellow = "PLAYER",
}

function physics.striker_point(player, position)
  local baseline = physics.BASELINES[player]
  if baseline.slide_axis == "x" then
    return position, baseline.line_position
  end
  return baseline.line_position, position
end

function physics.find_pocket(x, y)
  for _, pocket in ipairs(physics.POCKETS) do
    local dx = x - pocket.x
    local dy = y - pocket.y
    if math.sqrt(dx * dx + dy * dy) <= physics.POCKET_RADIUS then
      return pocket
    end
  end
  return nil
end

local function copy_discs(discs)
  local copy = {}
  for index, disc in ipairs(discs or {}) do
    copy[index] = {
      id = disc.id,
      kind = disc.kind,
      x = disc.x,
      y = disc.y,
      pocketed = disc.pocketed == true,
    }
  end
  return copy
end

local function resolve_wall(body, time, events)
  local minimum = body.r
  local maximum = 1 - body.r
  local strength = 0
  if body.x < minimum then
    strength = math.max(strength, math.abs(body.vx))
    body.x = minimum
    body.vx = math.abs(body.vx) * physics.WALL_RESTITUTION
  elseif body.x > maximum then
    strength = math.max(strength, math.abs(body.vx))
    body.x = maximum
    body.vx = -math.abs(body.vx) * physics.WALL_RESTITUTION
  end
  if body.y < minimum then
    strength = math.max(strength, math.abs(body.vy))
    body.y = minimum
    body.vy = math.abs(body.vy) * physics.WALL_RESTITUTION
  elseif body.y > maximum then
    strength = math.max(strength, math.abs(body.vy))
    body.y = maximum
    body.vy = -math.abs(body.vy) * physics.WALL_RESTITUTION
  end
  if strength > 0.16 and #events < 48 then
    events[#events + 1] = {
      type = "impact",
      time = time,
      strength = math.min(1, strength / 2.4),
      kinds = { body.kind, body.kind },
      wall = true,
    }
  end
end

local function collide(left, right, time, events)
  if not left.active or not right.active then
    return
  end
  local dx = right.x - left.x
  local dy = right.y - left.y
  local distance_squared = dx * dx + dy * dy
  local minimum = left.r + right.r
  if distance_squared >= minimum * minimum then
    return
  end

  local distance = math.sqrt(distance_squared)
  local nx, ny
  if distance < 0.0000001 then
    nx, ny = 1, 0
  else
    nx = dx / distance
    ny = dy / distance
  end

  local overlap = minimum - (distance > 0 and distance or 0)
  local inverse_total = left.im + right.im
  if inverse_total > 0 then
    local left_share = left.im / inverse_total
    local right_share = right.im / inverse_total
    left.x = left.x - nx * overlap * left_share
    left.y = left.y - ny * overlap * left_share
    right.x = right.x + nx * overlap * right_share
    right.y = right.y + ny * overlap * right_share
  end

  local relative_x = right.vx - left.vx
  local relative_y = right.vy - left.vy
  local normal_velocity = relative_x * nx + relative_y * ny
  if normal_velocity >= 0 then
    return
  end

  local restitution = physics.DISC_RESTITUTION
  if left.kind == "striker" or right.kind == "striker" then
    restitution = physics.STRIKER_RESTITUTION
  end
  local impulse = (-(1 + restitution) * normal_velocity) / inverse_total
  left.vx = left.vx - impulse * nx * left.im
  left.vy = left.vy - impulse * ny * left.im
  right.vx = right.vx + impulse * nx * right.im
  right.vy = right.vy + impulse * ny * right.im

  if math.abs(normal_velocity) > 0.16 and #events < 48 then
    events[#events + 1] = {
      type = "impact",
      time = time,
      strength = math.min(1, math.abs(normal_velocity) / 2.4),
      kinds = { left.kind, right.kind },
    }
  end
end

local function max_speed(bodies)
  local maximum = 0
  for _, body in ipairs(bodies) do
    if body.active then
      local speed = math.sqrt(body.vx * body.vx + body.vy * body.vy)
      if speed > maximum then
        maximum = speed
      end
    end
  end
  return maximum
end

-- Run one authoritative shot. Returns the new disc positions, the pocket
-- events, and whether the striker was pocketed.
function physics.simulate(state, shot)
  local bodies = {}
  for index, disc in ipairs(state.discs) do
    bodies[index] = {
      index = index,
      id = disc.id,
      kind = disc.kind,
      x = disc.x,
      y = disc.y,
      vx = 0,
      vy = 0,
      r = physics.DISC_RADIUS,
      im = 1 / physics.DISC_MASS,
      active = not disc.pocketed,
      pocketed = disc.pocketed == true,
    }
  end

  local sx, sy = physics.striker_point(state.turn, shot.position)
  -- The striker the player brought to the table decides how hard the shot
  -- leaves the baseline.
  local skin = physics.striker_skin((state.strikers or {})[state.turn])
  local speed = (physics.MIN_SHOT_SPEED
    + (physics.MAX_SHOT_SPEED - physics.MIN_SHOT_SPEED) * shot.power)
    * skin.power
  local striker = {
    index = #bodies + 1,
    id = "striker",
    kind = "striker",
    x = sx,
    y = sy,
    vx = math.cos(shot.angle) * speed,
    vy = math.sin(shot.angle) * speed,
    r = physics.STRIKER_RADIUS,
    im = 1 / (physics.STRIKER_MASS * physics.striker_skin((state.strikers or {})[state.turn]).mass),
    active = true,
    pocketed = false,
  }
  bodies[#bodies + 1] = striker

  local events = {}
  local pocketed = {}
  local time = 0
  local striker_pocketed = false
  local step = physics.STEP_SECONDS
  local damping = math.exp(-physics.FRICTION * step)
  local maximum_steps = math.ceil(physics.MAX_SIMULATION_SECONDS / step)
  local stop_speed_squared = physics.STOP_SPEED * physics.STOP_SPEED
  local body_count = #bodies
  local pockets = physics.POCKETS
  local pocket_count = #pockets
  local pocket_radius_squared = physics.POCKET_RADIUS * physics.POCKET_RADIUS
  local pocket_low = math.huge
  local pocket_high = -math.huge
  for index = 1, pocket_count do
    local centre = pockets[index].x
    pocket_low = math.min(pocket_low, centre - physics.POCKET_RADIUS)
    pocket_high = math.max(pocket_high, centre + physics.POCKET_RADIUS)
  end
  local active = {}
  local pair_left = {}
  local pair_right = {}
  local pair_minimum = {}
  for left_index = 1, body_count do
    for right_index = left_index + 1, body_count do
      local left = bodies[left_index]
      local right = bodies[right_index]
      local minimum = left.r + right.r
      local slot = #pair_left + 1
      pair_left[slot] = left
      pair_right[slot] = right
      pair_minimum[slot] = minimum * minimum
    end
  end
  local pair_count = #pair_left

  local function pocket_body(body, pocket)
    body.active = false
    body.pocketed = true
    body.vx = 0
    body.vy = 0
    body.x = pocket.x
    body.y = pocket.y
    events[#events + 1] = {
      type = "pocket",
      time = time,
      id = body.id,
      kind = body.kind,
      pocket = { x = pocket.x, y = pocket.y },
    }
    pocketed[#pocketed + 1] = {
      time = time,
      id = body.id,
      kind = body.kind,
      x = pocket.x,
      y = pocket.y,
    }
    if body.kind == "striker" then
      striker_pocketed = true
    end
  end

  -- The squared-distance test and numeric loops are equivalent to
  -- physics.find_pocket with ipairs, but avoid per-body sqrt and iterator
  -- allocations in the server's hottest path.
  local function settle_pockets()
    for index = 1, body_count do
      local body = bodies[index]
      if body.active then
        local x = body.x
        local y = body.y
        -- A pocket only covers the four corners; skip the centre of the board.
        if
          (x >= pocket_low and x <= pocket_high)
          and (y >= pocket_low and y <= pocket_high)
        then
          for pocket_index = 1, pocket_count do
            local pocket = pockets[pocket_index]
            local dx = x - pocket.x
            local dy = y - pocket.y
            if dx * dx + dy * dy <= pocket_radius_squared then
              pocket_body(body, pocket)
              break
            end
          end
        end
      end
    end
  end

  local function build_active()
    local count = 0
    for index = 1, body_count do
      local body = bodies[index]
      if body.active then
        count = count + 1
        active[count] = body
      end
    end
    return count
  end

  for _ = 1, maximum_steps do
    time = time + step

    for index = 1, body_count do
      local body = bodies[index]
      if body.active then
        body.vx = body.vx * damping
        body.vy = body.vy * damping
        body.x = body.x + body.vx * step
        body.y = body.y + body.vy * step
      end
    end

    settle_pockets()

    local active_count = build_active()
    for index = 1, active_count do
      local body = active[index]
      local minimum = body.r
      local maximum = 1 - minimum
      local x, y = body.x, body.y
      if x < minimum or x > maximum or y < minimum or y > maximum then
        resolve_wall(body, time, events)
      end
    end

    -- The pair order matches the TypeScript core exactly: the broad phase is
    -- an inline overlap test so only touching pairs pay for a function call.
    for _ = 1, 3 do
      for index = 1, pair_count do
        local left = pair_left[index]
        local right = pair_right[index]
        if left.active and right.active then
          local dx = right.x - left.x
          local dy = right.y - left.y
          if dx * dx + dy * dy < pair_minimum[index] then
            collide(left, right, time, events)
          end
        end
      end
    end

    settle_pockets()

    local moving = false
    for index = 1, body_count do
      local body = bodies[index]
      if body.active then
        local speed_squared = body.vx * body.vx + body.vy * body.vy
        if speed_squared >= stop_speed_squared then
          moving = true
          break
        end
      end
    end
    if not moving then
      break
    end
  end

  local discs = {}
  for index, disc in ipairs(state.discs) do
    local body = bodies[index]
    discs[index] = {
      id = disc.id,
      kind = disc.kind,
      x = body.x,
      y = body.y,
      pocketed = body.pocketed,
    }
  end

  return {
    discs = discs,
    striker_pocketed = striker_pocketed,
    striker = { x = striker.x, y = striker.y, pocketed = striker.pocketed },
    pocketed = pocketed,
    events = events,
    duration = time,
  }
end

function physics.copy_discs(discs)
  return copy_discs(discs)
end

return physics
