-- Pure-Lua tests for the shared MoonGames social state machine.

local script_path = arg[0] or "Games/shared/server/test/moongames_social_test.lua"
local script_dir = script_path:match("^(.*)[/\\]") or "."
local server_dir = script_dir .. "/.."
package.path = server_dir .. "/?.lua;" .. package.path

local fake_time = 1700000000000
local uuid_counter = 0
local storage = {}
local notifications = {}
local friends = {}
local rpc_handlers = {}
local users = {
  {
    user_id = "user-a",
    username = "alice",
    display_name = "Alice",
  },
  {
    user_id = "user-b",
    username = "bob",
    display_name = "Bob",
  },
  {
    user_id = "user-c",
    username = "carol",
    display_name = "Carol",
  },
}

local function copy(value)
  if type(value) ~= "table" then
    return value
  end
  local result = {}
  for key, item in pairs(value) do
    result[key] = copy(item)
  end
  return result
end

local function storage_key(user_id, collection, key)
  return table.concat({ user_id or "", collection, key }, "|")
end

local function reset()
  fake_time = 1700000000000
  uuid_counter = 0
  for key in pairs(storage) do
    storage[key] = nil
  end
  for key in pairs(notifications) do
    notifications[key] = nil
  end
  for key in pairs(friends) do
    friends[key] = nil
  end
end

local function find_user_by_id(user_id)
  for _, user in ipairs(users) do
    if user.user_id == user_id then
      return user
    end
  end
  return nil
end

local function find_user_by_name(username)
  for _, user in ipairs(users) do
    if user.username == username then
      return user
    end
  end
  return nil
end

local function set_friend_state(user_id, target_id, state)
  friends[user_id .. "|" .. target_id] = state
end

local function get_friend_state(user_id, target_id)
  if user_id == target_id then
    return nil
  end
  return friends[user_id .. "|" .. target_id]
end

local fake_nk = {
  time = function()
    return fake_time
  end,
  uuid_v4 = function()
    uuid_counter = uuid_counter + 1
    return string.format("00000000-0000-4000-8000-%012d", uuid_counter)
  end,
  sha256_hash = function(value)
    return "hash:" .. tostring(value)
  end,
  json_encode = function(value)
    return value
  end,
  json_decode = function(value)
    return value
  end,
  logger_warn = function() end,
  logger_error = function() end,
  register_rpc = function(handler, id)
    rpc_handlers[id] = handler
  end,
  users_get_id = function(ids)
    local result = {}
    for _, id in ipairs(ids) do
      local user = find_user_by_id(id)
      if user then
        result[#result + 1] = copy(user)
      end
    end
    return result
  end,
  users_get_username = function(usernames)
    local result = {}
    for _, username in ipairs(usernames) do
      local user = find_user_by_name(username)
      if user then
        result[#result + 1] = copy(user)
      end
    end
    return result
  end,
  storage_read = function(objects)
    local result = {}
    for _, object in ipairs(objects) do
      local record =
        storage[storage_key(object.user_id, object.collection, object.key)]
      if record then
        result[#result + 1] = {
          collection = object.collection,
          key = object.key,
          user_id = object.user_id,
          version = record.version,
          value = copy(record.value),
        }
      end
    end
    return result
  end,
  storage_write = function(writes)
    local acks = {}
    for _, write in ipairs(writes) do
      local key = storage_key(write.user_id, write.collection, write.key)
      local current = storage[key]
      if write.version and (not current or current.version ~= write.version) then
        error("storage version conflict")
      end
      local version = tostring((tonumber(current and current.version) or 0) + 1)
      storage[key] = {
        collection = write.collection,
        key = write.key,
        user_id = write.user_id,
        version = version,
        value = copy(write.value),
      }
      acks[#acks + 1] = {
        collection = write.collection,
        key = write.key,
        user_id = write.user_id,
        version = version,
      }
    end
    return acks
  end,
  friends_list = function(user_id)
    local result = {}
    for _, user in ipairs(users) do
      if user.user_id ~= user_id then
        local state = get_friend_state(user_id, user.user_id)
        if state ~= nil then
          result[#result + 1] = {
            state = state,
            user_id = user.user_id,
            user = copy(user),
          }
        end
      end
    end
    return result
  end,
  friends_add = function(user_id, username, user_ids)
    for _, target_id in ipairs(user_ids or {}) do
      local state = get_friend_state(user_id, target_id)
      if state == 2 then
        set_friend_state(user_id, target_id, 0)
        set_friend_state(target_id, user_id, 0)
      elseif state == nil then
        set_friend_state(user_id, target_id, 1)
        set_friend_state(target_id, user_id, 2)
      end
    end
  end,
  friends_delete = function(user_id, username, user_ids)
    for _, target_id in ipairs(user_ids or {}) do
      friends[user_id .. "|" .. target_id] = nil
      friends[target_id .. "|" .. user_id] = nil
    end
  end,
  notifications_send = function(items)
    for _, item in ipairs(items) do
      notifications[item.user_id] = notifications[item.user_id] or {}
      notifications[item.user_id][#notifications[item.user_id] + 1] = {
        id = "notice-" .. tostring(#notifications[item.user_id] + 1),
        code = item.code,
        subject = item.subject,
        content = copy(item.content),
        sender_id = item.sender_id,
        create_time = os.date("!%Y-%m-%dT%H:%M:%SZ", math.floor(fake_time / 1000)),
      }
    end
  end,
  notifications_list = function(user_id)
    return copy(notifications[user_id] or {})
  end,
}

package.preload["nakama"] = function()
  return fake_nk
end

local social = require("moongames_social")

social.register_game("chess", {
  create_room = function(context, params, recipient)
    return {
      matchId = "match-" .. recipient.user_id,
      gameTitle = "Chess",
      mode = "private",
      previewUrl = "/games/chess/cover.svg",
      metadata = { timeControl = "5+0" },
    }
  end,
})

local tests = {}
local failures = 0

local function test(name, fn)
  tests[#tests + 1] = { name = name, fn = fn }
end

local function assert_equal(actual, expected, message)
  if actual ~= expected then
    error(
      (message or "values differ")
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

local function context(user_id, username)
  return {
    user_id = user_id,
    username = username,
  }
end

local function make_invite()
  set_friend_state("user-a", "user-b", 0)
  set_friend_state("user-b", "user-a", 0)
  local invite, error_value = social.create_invite(context("user-a", "alice"), {
    gameId = "chess",
    recipientId = "user-b",
    timeControl = "5+0",
  })
  assert_truthy(invite, error_value and error_value.error and error_value.error.message)
  return invite
end

test("create invite stores a token and notifies the recipient", function()
  reset()
  local invite = make_invite()
  assert_equal(invite.status, "pending")
  assert_equal(invite.recipient.userId, "user-b")
  assert_truthy(invite.token)
  assert_equal(invite.joinPath, "/invite/" .. invite.inviteId)
  assert_equal(invite.deepLink, "moongames://invite/" .. invite.inviteId)
  assert_equal(#notifications["user-b"], 1)
  assert_equal(notifications["user-b"][1].code, social.CODES.invite_received)
  assert_equal(notifications["user-b"][1].content.invite.inviteId, invite.inviteId)
  assert_equal(notifications["user-b"][1].content.invite.token, nil)
  local by_id_link = social.resolve_invite(context("user-b", "bob"), {
    token = invite.inviteId,
  })
  assert_equal(by_id_link.invite.inviteId, invite.inviteId)
end)

test("only mutual friends can be invited", function()
  reset()
  local invite, error_value = social.create_invite(context("user-a", "alice"), {
    gameId = "chess",
    recipientId = "user-b",
  })
  assert_equal(invite, nil)
  assert_equal(error_value.error.code, "not_eligible")
end)

test("blocked players cannot be invited even after a recent match", function()
  reset()
  set_friend_state("user-a", "user-b", 3)
  social.record_recent_players("chess", {
    { userId = "user-a", username = "alice" },
    { userId = "user-b", username = "bob" },
  })
  local invite, error_value = social.create_invite(context("user-a", "alice"), {
    gameId = "chess",
    recipientId = "user-b",
  })
  assert_equal(invite, nil)
  assert_equal(error_value.error.code, "blocked")
end)

test("recent players can be invited without a friendship", function()
  reset()
  social.record_recent_players("chess", {
    { userId = "user-a", username = "alice" },
    { userId = "user-b", username = "bob" },
  })
  local invite, error_value = social.create_invite(context("user-a", "alice"), {
    gameId = "chess",
    recipientId = "user-b",
  })
  assert_truthy(invite, error_value and error_value.error and error_value.error.message)
  assert_equal(invite.recipient.userId, "user-b")
end)

test("recipient can accept and sender is notified", function()
  reset()
  local invite = make_invite()
  local accepted, error_value = social.accept_invite(context("user-b", "bob"), {
    inviteId = invite.inviteId,
  })
  assert_truthy(accepted, error_value and error_value.error and error_value.error.message)
  assert_equal(accepted.status, "accepted")
  assert_equal(#notifications["user-a"], 1)
  assert_equal(notifications["user-a"][1].code, social.CODES.invite_accepted)
  local repeated = social.accept_invite(context("user-b", "bob"), {
    inviteId = invite.inviteId,
  })
  assert_equal(repeated.status, "accepted")
  assert_equal(#notifications["user-a"], 1)
end)

test("decline is idempotent", function()
  reset()
  local invite = make_invite()
  local declined = social.decline_invite(context("user-b", "bob"), {
    inviteId = invite.inviteId,
  })
  assert_equal(declined.status, "declined")
  assert_equal(#notifications["user-a"], 1)
  local repeated = social.decline_invite(context("user-b", "bob"), {
    inviteId = invite.inviteId,
  })
  assert_equal(repeated.status, "declined")
  assert_equal(#notifications["user-a"], 1)
end)

test("sender can cancel and recipient is notified", function()
  reset()
  local invite = make_invite()
  local cancelled = social.cancel_invite(context("user-a", "alice"), {
    inviteId = invite.inviteId,
  })
  assert_equal(cancelled.status, "cancelled")
  assert_equal(#notifications["user-b"], 2)
  assert_equal(notifications["user-b"][2].code, social.CODES.invite_cancelled)
  local repeated = social.cancel_invite(context("user-a", "alice"), {
    inviteId = invite.inviteId,
  })
  assert_equal(repeated.status, "cancelled")
  assert_equal(#notifications["user-b"], 2)
end)

test("expired invites cannot be cancelled as active", function()
  reset()
  local invite = make_invite()
  fake_time = invite.expiresAt + 1
  local cancelled, error_value = social.cancel_invite(context("user-a", "alice"), {
    inviteId = invite.inviteId,
  })
  assert_equal(cancelled, nil)
  assert_equal(error_value.error.code, "invite_expired")
  local resolved = social.resolve_invite(context("user-b", "bob"), {
    inviteId = invite.inviteId,
  })
  assert_equal(resolved.invite.status, "expired")
end)

test("expired invites cannot be accepted", function()
  reset()
  local invite = make_invite()
  fake_time = invite.expiresAt + 1
  local accepted, error_value = social.accept_invite(context("user-b", "bob"), {
    inviteId = invite.inviteId,
  })
  assert_equal(accepted, nil)
  assert_equal(error_value.error.code, "invite_expired")
  local resolved = social.resolve_invite(context("user-a", "alice"), {
    inviteId = invite.inviteId,
  })
  assert_equal(resolved.invite.status, "expired")
end)

test("unrelated users cannot resolve or accept an invite", function()
  reset()
  local invite = make_invite()
  local resolved, error_value = social.resolve_invite(context("user-c", "carol"), {
    inviteId = invite.inviteId,
  })
  assert_equal(resolved, nil)
  assert_equal(error_value.error.code, "not_invited")
end)

test("notification read state marks ids and preserves other ids", function()
  reset()
  local first = social.mark_notifications_read(context("user-a", "alice"), {
    ids = { "notice-a", "notice-b" },
  })
  assert_equal(#first.readIds, 2)
  local second = social.mark_notifications_read(context("user-a", "alice"), {
    ids = { "notice-b", "notice-c" },
  })
  assert_equal(#second.readIds, 3)
  assert_equal(second.readIds[1], "notice-a")
  assert_equal(second.readIds[3], "notice-c")
end)

test("friend request, decline, cancel, and remove notify the other side", function()
  reset()
  local requested = social.request_friend(context("user-a", "alice"), {
    username = "bob",
  })
  assert_equal(requested.status, "requested")
  assert_equal(#(notifications["user-b"] or {}), 0)

  local accepted = social.accept_friend(context("user-b", "bob"), {
    username = "alice",
  })
  assert_equal(accepted.status, "friends")
  -- Nakama owns the built-in friend-accepted notification (code -3); the
  -- shared RPC must not duplicate it.
  assert_equal(#(notifications["user-a"] or {}), 0)

  social.remove_friend(context("user-a", "alice"), { username = "bob" })
  assert_equal(#(notifications["user-b"] or {}), 1)
  assert_equal(notifications["user-b"][1].code, social.CODES.friend_removed)

  social.request_friend(context("user-b", "bob"), { username = "alice" })
  social.decline_friend(context("user-a", "alice"), { username = "bob" })
  assert_equal(#(notifications["user-b"] or {}), 2)
  assert_equal(notifications["user-b"][2].code, social.CODES.friend_declined)

  social.request_friend(context("user-a", "alice"), { username = "bob" })
  social.cancel_friend(context("user-a", "alice"), { username = "bob" })
  assert_equal(#(notifications["user-b"] or {}), 3)
  assert_equal(notifications["user-b"][3].code, social.CODES.friend_cancelled)
end)

test("recent players are recorded per user and exclude self", function()
  reset()
  social.record_recent_players("chess", {
    { userId = "user-a", username = "alice" },
    { userId = "user-b", username = "bob" },
  })
  local recent = social.recent_players(context("user-a", "alice"))
  assert_equal(#recent.players, 1)
  assert_equal(recent.players[1].userId, "user-b")
  assert_equal(recent.players[1].gameId, "chess")
end)

test("RPC wrappers forward authenticated context and reject missing users", function()
  reset()
  set_friend_state("user-a", "user-b", 0)
  set_friend_state("user-b", "user-a", 0)
  local handler = rpc_handlers["moongames_invite_create"]
  assert_truthy(handler, "invite RPC was not registered")
  local created = handler(context("user-a", "alice"), {
    gameId = "chess",
    recipientId = "user-b",
    timeControl = "5+0",
  })
  assert_truthy(created.ok)
  assert_equal(created.invite.sender.userId, "user-a")
  local denied = handler({}, {
    gameId = "chess",
    recipientId = "user-b",
  })
  assert_equal(denied.ok, false)
  assert_equal(denied.error.code, "unauthenticated")
end)

for _, entry in ipairs(tests) do
  local ok, error_value = pcall(entry.fn)
  if ok then
    print("ok - " .. entry.name)
  else
    failures = failures + 1
    io.stderr:write("not ok - " .. entry.name .. "\n" .. tostring(error_value) .. "\n")
  end
end

if failures > 0 then
  error(string.format("%d social test(s) failed", failures))
end

print(string.format("%d social tests passed", #tests))
