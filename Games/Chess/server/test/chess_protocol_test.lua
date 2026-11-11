-- Tests for the pure Lua chess wire protocol helpers.

local script_path = arg[0] or "Chess/server/test/chess_protocol_test.lua"
local script_dir = script_path:match("^(.*)[/\\]") or "."
local protocol = assert(dofile(script_dir .. "/../chess_protocol.lua"))

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

local function assert_truthy(value, message)
  if not value then
    error(message or "expected a truthy value", 2)
  end
end

local function assert_nil(value, message)
  if value ~= nil then
    error((message or "expected nil") .. ", got " .. tostring(value), 2)
  end
end

test("default time control", function()
  local value = protocol.parse_time_control(nil)
  assert_equal(value.initial_ms, 300000)
  assert_equal(value.increment_ms, 0)
end)

test("camelCase and snake_case time controls", function()
  local camel = assert(protocol.parse_time_control({
    initialMs = 600000,
    incrementMs = 2000,
  }))
  assert_equal(camel.initial_ms, 600000)
  assert_equal(camel.increment_ms, 2000)

  local snake = assert(protocol.parse_time_control({
    initial_ms = 180000,
    increment_ms = 3000,
  }))
  assert_equal(snake.initial_ms, 180000)
  assert_equal(snake.increment_ms, 3000)
end)

test("partial time controls keep defaults", function()
  local initial_only = assert(protocol.parse_time_control({ initialMs = 900000 }))
  assert_equal(initial_only.initial_ms, 900000)
  assert_equal(initial_only.increment_ms, 0)

  local increment_only = assert(protocol.parse_time_control({ incrementMs = 5000 }))
  assert_equal(increment_only.initial_ms, 300000)
  assert_equal(increment_only.increment_ms, 5000)
end)

test("string time control is minutes plus seconds", function()
  local value = assert(protocol.parse_time_control("5+2"))
  assert_equal(value.initial_ms, 300000)
  assert_equal(value.increment_ms, 2000)
end)

test("invalid time controls are rejected", function()
  local too_short, too_short_error = protocol.parse_time_control(1000)
  assert_nil(too_short)
  assert_truthy(too_short_error)

  local too_long, too_long_error = protocol.parse_time_control({
    initialMs = 3600000,
  })
  assert_nil(too_long)
  assert_truthy(too_long_error)

  local bad_increment, bad_increment_error = protocol.parse_time_control({
    incrementMs = 61000,
  })
  assert_nil(bad_increment)
  assert_truthy(bad_increment_error)

  local bad_string, bad_string_error = protocol.parse_time_control("five")
  assert_nil(bad_string)
  assert_truthy(bad_string_error)

  local bad_number, bad_number_error = protocol.parse_time_control({
    initialMs = "five",
  })
  assert_nil(bad_number)
  assert_truthy(bad_number_error)
end)

test("wire time control", function()
  local value = assert(protocol.parse_time_control("10+5"))
  local wire = protocol.time_control_wire(value)
  assert_equal(wire.initialMs, 600000)
  assert_equal(wire.incrementMs, 5000)
end)

test("match label", function()
  local value = assert(protocol.parse_time_control("5+0"))
  assert_equal(protocol.label("quick", value, "open"), "chess|quick|300000|0|open")
  assert_equal(protocol.label("private", value, "full"), "chess|private|300000|0|full")
end)

test("colors and opcode ranges", function()
  assert_equal(protocol.opposite_color("w"), "b")
  assert_equal(protocol.opposite_color("b"), "w")
  assert_equal(protocol.color_for_seat(1), "w")
  assert_equal(protocol.color_for_seat(2), "b")

  local seen = {}
  for name, opcode in pairs(protocol.OP) do
    assert_truthy(seen[opcode] == nil, "duplicate opcode for " .. name)
    seen[opcode] = name
  end
  assert_equal(protocol.OP.STATE, 1)
  assert_equal(protocol.OP.MOVE_REQUEST, 101)
end)

print("")
print(string.format("%d/%d tests passed", tests_passed, tests_run))

if tests_failed > 0 then
  os.exit(1)
end
