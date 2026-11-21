local nk = require("nakama")
local config = require("moongames_config")

local CLEANUP_INTERVAL_MS = tonumber(
  config.get("MOONGAMES_CLEANUP_INTERVAL_MS", "3600000")
) or 60 * 60 * 1000
local BATCH_LIMIT = 200
local GUARD_COLLECTION = "moongames_cleanup"
local GUARD_KEY = "guest_accounts"
local RUNNER_COLLECTION = "moongames_cleanup"
local RUNNER_KEY = "runner"
local SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000"

local cleanup = {}

local GUEST_QUERY = [[
SELECT id::text AS id
FROM users
WHERE (email IS NULL OR email = '')
  AND password IS NULL
  AND custom_id IS NULL
  AND facebook_id IS NULL
  AND google_id IS NULL
  AND gamecenter_id IS NULL
  AND steam_id IS NULL
  AND apple_id IS NULL
  AND id <> ']] .. SYSTEM_USER_ID .. [['
  AND EXISTS (SELECT 1 FROM user_device d WHERE d.user_id = users.id)
LIMIT ]] .. tostring(BATCH_LIMIT)

local function still_guest(user_id)
  if type(nk.account_get_id) ~= "function" then
    return true
  end
  local ok, account = pcall(nk.account_get_id, user_id)
  if not ok or type(account) ~= "table" then
    return false
  end
  if account.email ~= nil and account.email ~= "" then
    return false
  end
  if account.custom_id ~= nil or account.apple_id ~= nil then
    return false
  end
  if account.facebook_id ~= nil or account.google_id ~= nil then
    return false
  end
  if account.gamecenter_id ~= nil or account.steam_id ~= nil then
    return false
  end
  return type(account.devices) == "table" and #account.devices > 0
end

function cleanup.run()
  local result = { scanned = 0, deleted = 0, failed = 0, skipped = false }
  if type(nk.storage_read) ~= "function" or type(nk.storage_write) ~= "function" then
    result.failed = 1
    return result
  end

  local now = nk.time()
  local read_ok, objects = pcall(nk.storage_read, {
    { collection = GUARD_COLLECTION, key = GUARD_KEY },
  })
  local record = read_ok and type(objects) == "table" and objects[1] or nil
  local version = type(record) == "table" and record.version or nil
  if type(record) == "table" and type(record.value) == "table" then
    local last = tonumber(record.value.lastRunAt) or 0
    if now - last < CLEANUP_INTERVAL_MS then
      result.skipped = true
      return result
    end
  end

  local claim_ok = pcall(nk.storage_write, {
    {
      collection = GUARD_COLLECTION,
      key = GUARD_KEY,
      value = { lastRunAt = now, updatedAt = now },
      version = version or "*",
      permission_read = 0,
      permission_write = 0,
    },
  })
  if not claim_ok then
    result.skipped = true
    return result
  end

  if type(nk.sql_query) ~= "function" or type(nk.account_delete_id) ~= "function" then
    result.failed = 1
    return result
  end

  local query_ok, rows = pcall(nk.sql_query, GUEST_QUERY, {})
  if not query_ok or type(rows) ~= "table" then
    result.failed = 1
    return result
  end

  for _, row in ipairs(rows) do
    local user_id = type(row) == "table" and row.id or nil
    if type(user_id) == "string" and user_id ~= "" then
      result.scanned = result.scanned + 1
      if still_guest(user_id) then
        local deleted = pcall(nk.account_delete_id, user_id, false)
        if deleted then
          result.deleted = result.deleted + 1
        else
          result.failed = result.failed + 1
        end
      end
    end
  end

  return result
end

local function cleanup_rpc(context, payload)
  if context and context.user_id and context.user_id ~= "" then
    return nk.json_encode({
      ok = false,
      error = { code = "server_key_required", message = "Server access is required." },
    })
  end
  local result = cleanup.run()
  result.ok = true
  return nk.json_encode(result)
end
nk.register_rpc(cleanup_rpc, "moongames_cleanup_guest_accounts")

local function log_result(result)
  if type(nk.logger_warn) == "function" then
    nk.logger_warn(
      "Guest account cleanup: scanned "
        .. tostring(result.scanned)
        .. ", deleted "
        .. tostring(result.deleted)
        .. ", failed "
        .. tostring(result.failed)
    )
  end
end

local function start_runner()
  if type(nk.storage_read) ~= "function" or type(nk.match_create) ~= "function" then
    return
  end
  local ok, objects = pcall(nk.storage_read, {
    { collection = RUNNER_COLLECTION, key = RUNNER_KEY },
  })
  local record = ok and type(objects) == "table" and objects[1] or nil
  local version = type(record) == "table" and record.version or nil
  local match_id = type(record) == "table" and record.value and record.value.matchId or nil
  if type(match_id) == "string" and match_id ~= "" and type(nk.match_get) == "function" then
    local found = pcall(nk.match_get, match_id)
    if found then
      return
    end
  end
  local created, new_id = pcall(nk.match_create, "moongames_guest_cleanup", {})
  if not created or type(new_id) ~= "string" then
    return
  end
  pcall(nk.storage_write, {
    {
      collection = RUNNER_COLLECTION,
      key = RUNNER_KEY,
      value = { matchId = new_id, startedAt = nk.time() },
      version = version or "*",
      permission_read = 0,
      permission_write = 0,
    },
  })
end

function cleanup.match_init(context, params)
  return { next_at = nk.time() + CLEANUP_INTERVAL_MS }, 1, "moongames-guest-cleanup"
end

function cleanup.match_loop(context, dispatcher, tick, state, messages)
  if nk.time() >= state.next_at then
    state.next_at = nk.time() + CLEANUP_INTERVAL_MS
    log_result(cleanup.run())
  end
  return state
end

if type(nk.register_req_after) == "function" then
  nk.register_req_after(function(context, payload)
    start_runner()
  end, "Rpc")
end

return cleanup
