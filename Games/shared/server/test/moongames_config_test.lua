local failures = 0

local function test(name, fn)
  local ok, err = pcall(fn)
  if ok then
    print("[ok] " .. name)
  else
    failures = failures + 1
    io.stderr:write("[FAIL] " .. name .. ": " .. tostring(err) .. "\n")
  end
end

local function assert_equal(actual, expected, message)
  if actual ~= expected then
    error((message or "values differ") .. ": expected " .. tostring(expected) .. " got " .. tostring(actual))
  end
end

package.preload["nakama"] = function()
  return {
    get_context = function()
      return {
        env = {
          MOONGAMES_ENGINE_ACCOUNTS = "player@example.com",
          MOONGAMES_WEB_PORT = "4174",
        },
      }
    end,
  }
end

local config = dofile("shared/server/moongames_config.lua")

test("reads a value passed through Nakama runtime env", function()
  assert_equal(config.get("MOONGAMES_ENGINE_ACCOUNTS"), "player@example.com", "allowlist")
  assert_equal(config.get("MOONGAMES_WEB_PORT"), "4174", "port")
end)

test("falls back when a value was not set", function()
  assert_equal(config.get("MISSING_VALUE", "default"), "default", "fallback")
end)

if failures > 0 then
  io.stderr:write(failures .. " config test(s) failed\n")
  os.exit(1)
end
print("all config tests passed")
