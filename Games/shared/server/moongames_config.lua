local nk = require("nakama")

local config = {}

local context = type(nk.get_context) == "function" and nk.get_context() or nil
local env = type(context) == "table" and context.env or {}

function config.get(name, fallback)
  if type(env[name]) == "string" then
    return env[name]
  end
  return fallback
end

return config
