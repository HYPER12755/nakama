--[[
  A small Nakama authoritative match handler, written in Lua.

  This exists to demonstrate Nakama's built-in server-authoritative match
  framework. The main Reaction Duel in the showcase is hosted by a separate
  Go game server so the heavy simulation/tick/validation path is in Go.
--]]

local nk = require("nakama")

local function names(state)
  local out = {}
  for _, name in pairs(state.players) do
    table.insert(out, name)
  end
  table.sort(out)
  return out
end

local function match_init(context, params)
  local state = {
    players = {},
    tick = 0,
    created_at = nk.time(),
  }
  return state, 2, "showcase_arena"
end

local function match_join_attempt(context, dispatcher, tick, state, presence, metadata)
  return state, true
end

local function match_join(context, dispatcher, tick, state, presences)
  for _, p in ipairs(presences) do
    state.players[p.user_id] = p.username
  end
  dispatcher.broadcast_message(2, nk.json_encode({
    event = "join",
    users = names(state),
  }), nil, nil)
  return state
end

local function match_leave(context, dispatcher, tick, state, presences)
  for _, p in ipairs(presences) do
    state.players[p.user_id] = nil
  end
  dispatcher.broadcast_message(2, nk.json_encode({
    event = "leave",
    users = names(state),
  }), nil, nil)
  return state
end

local function match_loop(context, dispatcher, tick, state, messages)
  state.tick = tick
  dispatcher.broadcast_message(1, nk.json_encode({
    event = "tick",
    tick = tick,
    players = names(state),
    match_id = context.match_id,
  }), nil, nil)

  for _, message in ipairs(messages) do
    dispatcher.broadcast_message(3, nk.json_encode({
      event = "echo",
      from = message.sender.username,
      data = message.data or "",
    }), nil, message.sender)
  end
  return state
end

local function match_terminate(context, dispatcher, tick, state, grace_seconds)
  return state
end

local function match_signal(context, dispatcher, tick, state, data)
  return state, "arena:" .. tostring(data)
end

return {
  match_init = match_init,
  match_join_attempt = match_join_attempt,
  match_join = match_join,
  match_leave = match_leave,
  match_loop = match_loop,
  match_terminate = match_terminate,
  match_signal = match_signal,
}
