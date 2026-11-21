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

local now = 1000000
local storage = {}
local next_version = 1
local rows = {}
local deleted = {}
local rpc_handlers = {}
local after_handler = nil
local match_creates = {}
local live_matches = {}

local function storage_key(collection, key)
  return collection .. ":" .. key
end

local fake_nk = {
  time = function()
    return now
  end,
  json_encode = function(value)
    local function encode(item)
      if type(item) ~= "table" then
        return tostring(item)
      end
      local parts = {}
      for key, child in pairs(item) do
        parts[#parts + 1] = tostring(key) .. "=" .. encode(child)
      end
      return "{" .. table.concat(parts, ",") .. "}"
    end
    return encode(value)
  end,
  storage_read = function(reads)
    local result = {}
    for index, read in ipairs(reads) do
      local record = storage[storage_key(read.collection, read.key)]
      if record ~= nil then
        result[index] = { value = record.value, version = record.version }
      end
    end
    return result
  end,
  storage_write = function(writes)
    local write = writes[1]
    local key = storage_key(write.collection, write.key)
    local current = storage[key]
    if current ~= nil and write.version ~= current.version then
      error("version conflict")
    end
    storage[key] = { value = write.value, version = tostring(next_version) }
    next_version = next_version + 1
  end,
  sql_query = function()
    local result = {}
    for index, id in ipairs(rows) do
      result[index] = { id = id }
    end
    return result
  end,
  account_get_id = function(user_id)
    if user_id == "linked" then
      return { email = "player@example.com", devices = { { id = "device" } } }
    end
    if user_id == "provider" then
      return { google_id = "google-id", devices = { { id = "device" } } }
    end
    return { devices = { { id = "device" } } }
  end,
  account_delete_id = function(user_id, recorded)
    assert_equal(recorded, false, "no tombstone is left behind")
    deleted[#deleted + 1] = user_id
  end,
  register_rpc = function(fn, id)
    rpc_handlers[id] = fn
  end,
  register_req_after = function(fn, id)
    assert_equal(id, "Rpc", "the runner starts after an RPC")
    after_handler = fn
  end,
  match_create = function(module, params)
    local id = "runner-match-" .. tostring(#match_creates + 1)
    match_creates[#match_creates + 1] = { module = module, params = params, id = id }
    live_matches[id] = true
    return id
  end,
  match_get = function(id)
    if live_matches[id] then
      return { match_id = id }
    end
    error("match not found")
  end,
  logger_warn = function() end,
}

package.preload["nakama"] = function()
  return fake_nk
end

local cleanup = dofile("shared/server/moongames_guest_cleanup.lua")

test("registers the manual RPC and an after-RPC runner", function()
  assert_equal(type(rpc_handlers.moongames_cleanup_guest_accounts), "function", "the RPC was registered")
  assert_equal(type(after_handler), "function", "the runner hook was registered")
end)

test("the first request starts one runner match", function()
  after_handler({}, {})
  assert_equal(#match_creates, 1, "one match was created")
  assert_equal(match_creates[1].module, "moongames_guest_cleanup", "the cleanup match module")
  after_handler({}, {})
  assert_equal(#match_creates, 1, "the live match is reused")
end)

test("the runner waits an hour before its first pass", function()
  local state, tick_rate = cleanup.match_init({}, {})
  assert_equal(tick_rate, 1, "one tick per second")
  assert_equal(state.next_at, now + 3600000, "the first run is an hour away")
  rows = { "guest-1" }
  local next_state = cleanup.match_loop({}, nil, 1, state, {})
  assert_equal(next_state, state, "the state was kept")
  assert_equal(#deleted, 0, "nothing was deleted early")
end)

test("an hourly pass deletes only device-only guests", function()
  rows = { "guest-1", "linked", "provider", "guest-2" }
  cleanup.match_loop({}, nil, 2, { next_at = now }, {})
  assert_equal(#deleted, 2, "only the two guests were deleted")
  assert_equal(deleted[1], "guest-1", "first guest")
  assert_equal(deleted[2], "guest-2", "second guest")
end)

test("a second pass inside the hour is skipped", function()
  rows = { "guest-3" }
  local result = cleanup.run()
  assert_equal(result.skipped, true, "the pass was skipped")
  assert_equal(#deleted, 2, "no extra account was deleted")
end)

test("the manual RPC refuses a client session", function()
  local response = rpc_handlers.moongames_cleanup_guest_accounts(
    { user_id = "some-client" }, "{}"
  )
  assert_equal(response:find("server_key_required", 1, true) ~= nil, true, "the client was refused")
end)

test("the manual RPC runs after the hour and reports counts", function()
  now = now + 3600000
  rows = { "guest-3" }
  local response = rpc_handlers.moongames_cleanup_guest_accounts({}, "{}")
  assert_equal(response:find("deleted=1", 1, true) ~= nil, true, "one deletion was reported")
  assert_equal(#deleted, 3, "the guest was deleted")
end)

if failures > 0 then
  io.stderr:write(failures .. " guest cleanup test(s) failed\n")
  os.exit(1)
end
print("all guest cleanup tests passed")
