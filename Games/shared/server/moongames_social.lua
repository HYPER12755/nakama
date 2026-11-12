-- MoonGames shared social layer: friends, direct-invite cards, and notifications.
--
-- Game rules stay in each game module. A game registers how to create an
-- authoritative private room here; this module owns the platform-level invite
-- state machine, expiry, friend checks, and notification delivery.

local nk = require("nakama")

local social = {}

social.INVITE_COLLECTION = "moongames_invites"
social.NOTIFICATION_STATE_COLLECTION = "moongames_notification_state"
social.RECENT_PLAYERS_COLLECTION = "moongames_recent_players"
social.INVITE_TTL_MS = 24 * 60 * 60 * 1000
social.MAX_INVITE_MESSAGE = 240
social.MAX_RECENT_PLAYERS = 12

social.CODES = {
  friend_accepted = 1102,
  friend_declined = 1103,
  friend_cancelled = 1104,
  friend_removed = 1105,
  invite_received = 2101,
  invite_accepted = 2102,
  invite_declined = 2103,
  invite_cancelled = 2104,
  invite_expired = 2105,
}

local STATE_KEY = "state"
local INVITE_PREFIX = "invite_"
local TOKEN_PREFIX = "token_"
local games = {}

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

local function text(value, fallback)
  if type(value) == "string" and value ~= "" then
    return value
  end
  return fallback
end

local function trim(value)
  if type(value) ~= "string" then
    return nil
  end
  local result = value:match("^%s*(.-)%s*$")
  if result == "" then
    return nil
  end
  return result
end

local function number(value, fallback)
  local parsed = tonumber(value)
  if parsed == nil or parsed ~= parsed then
    return fallback
  end
  return parsed
end

local function decode_payload(payload)
  if payload == nil or payload == "" then
    return {}
  end
  local ok, value = pcall(nk.json_decode, payload)
  if not ok or type(value) ~= "table" then
    return nil, "invalid JSON payload"
  end
  return value
end

local function ok(value)
  value = value or {}
  value.ok = true
  return nk.json_encode(value)
end

local function fail(code, message)
  return nk.json_encode({
    ok = false,
    error = {
      code = code,
      message = message,
    },
  })
end

local function require_user(context)
  if not context or not context.user_id or context.user_id == "" then
    return nil, fail("unauthenticated", "A user session is required")
  end
  return context.user_id
end

local function require_payload(context, payload, handler)
  local params, decode_error = decode_payload(payload)
  if not params then
    return nil, fail("invalid_payload", decode_error)
  end
  local user_id, auth_error = require_user(context)
  if not user_id then
    return nil, auth_error
  end
  local result, result_error = handler(user_id, params)
  if result == nil then
    return nil, result_error
  end
  return result
end

local function public_user(user)
  return {
    userId = user.user_id or user.userId,
    username = user.username or "Player",
    displayName = user.display_name or user.displayName,
    avatarUrl = user.avatar_url or user.avatarUrl,
  }
end

local function find_user_by_id(user_id)
  if type(user_id) ~= "string" or user_id == "" then
    return nil
  end
  local users = nk.users_get_id({ user_id })
  if users and users[1] then
    return users[1]
  end
  return nil
end

local function find_user_by_username(username)
  if type(username) ~= "string" or username == "" then
    return nil
  end
  local users = nk.users_get_username({ username })
  if users and users[1] then
    return users[1]
  end
  return nil
end

local function resolve_recipient(params)
  local user = nil
  local recipient_id = trim(params.recipientId or params.recipient_id)
  local recipient_username =
    trim(params.recipientUsername or params.recipient_username)
  if recipient_id then
    user = find_user_by_id(recipient_id)
  elseif recipient_username then
    user = find_user_by_username(recipient_username)
  end
  if not user then
    return nil, fail("recipient_not_found", "That MoonGames player was not found")
  end
  return user
end

local function friend_state(user_id, target_id)
  local friends = nk.friends_list(user_id, 100, nil, nil)
  if not friends then
    return nil
  end
  for _, friend in ipairs(friends) do
    local candidate = friend.user_id or (friend.user and friend.user.user_id)
    if candidate == target_id then
      return friend.state
    end
  end
  return nil
end

local function is_recent_player(user_id, target_id)
  local objects = nk.storage_read({
    {
      collection = social.RECENT_PLAYERS_COLLECTION,
      key = "recent",
      user_id = user_id,
    },
  })
  if not objects or not objects[1] then
    return false
  end
  local entries = objects[1].value and objects[1].value.entries or {}
  for _, entry in ipairs(entries) do
    if entry.userId == target_id then
      return true
    end
  end
  return false
end

-- Game modules call this during module load. `create_room` receives
-- (context, params, recipient) and returns { matchId, gameTitle, previewUrl,
-- mode, metadata } after creating an authoritative private room. `attach_room`
-- is optional and validates an invite into an existing room, returning the same
-- shape plus an optional expiresAt.
function social.register_game(game_id, handler)
  if type(game_id) ~= "string" or type(handler) ~= "table" then
    error("register_game requires a game id and handler table")
  end
  games[game_id] = handler
end

function social.game_handler(game_id)
  return games[game_id]
end

local function token_hash(token)
  return nk.sha256_hash(token)
end

local function invite_key(invite_id)
  return INVITE_PREFIX .. invite_id
end

local function token_key(hash)
  return TOKEN_PREFIX .. hash
end

local function load_invite(invite_id)
  if type(invite_id) ~= "string" or invite_id == "" then
    return nil, "missing invite id"
  end
  local objects = nk.storage_read({
    {
      collection = social.INVITE_COLLECTION,
      key = invite_key(invite_id),
    },
  })
  if not objects or not objects[1] then
    return nil, "invite_not_found"
  end
  return copy(objects[1].value), objects[1].version
end

local function load_invite_by_token(token)
  token = trim(token)
  if not token or #token < 16 then
    return nil, "invite_not_found"
  end
  local hash = token_hash(token)
  local objects = nk.storage_read({
    {
      collection = social.INVITE_COLLECTION,
      key = token_key(hash),
    },
  })
  if not objects or not objects[1] then
    -- Older invite cards used the invite id as the deep-link value. Keep those
    -- working; the viewer check still prevents unrelated accounts from reading.
    return load_invite(token)
  end
  local invite_id = objects[1].value and objects[1].value.inviteId
  if not invite_id then
    return nil, "invite_not_found"
  end
  return load_invite(invite_id)
end

local function write_invite(record, version)
  local writes = {
    {
      collection = social.INVITE_COLLECTION,
      key = invite_key(record.inviteId),
      value = record,
      version = version,
      permission_read = 0,
      permission_write = 0,
    },
  }
  local acks = nk.storage_write(writes)
  return acks and acks[1] and acks[1].version or nil
end

local function create_token_index(record, token)
  nk.storage_write({
    {
      collection = social.INVITE_COLLECTION,
      key = token_key(token_hash(token)),
      value = { inviteId = record.inviteId },
      permission_read = 0,
      permission_write = 0,
    },
  })
end

local function public_invite(record)
  local result = {
    inviteId = record.inviteId,
    gameId = record.gameId,
    gameTitle = record.gameTitle,
    mode = record.mode,
    matchId = record.matchId,
    sender = record.sender,
    recipient = record.recipient,
    status = record.status,
    createdAt = record.createdAt,
    expiresAt = record.expiresAt,
    joinPath = record.joinPath,
    deepLink = record.deepLink,
    previewUrl = record.previewUrl,
    message = record.message,
    metadata = record.metadata,
  }
  return result
end

local function notify(user_id, subject, code, content, sender_id)
  if not user_id or user_id == "" then
    return
  end
  nk.notifications_send({
    {
      user_id = user_id,
      subject = subject,
      content = content or {},
      code = code,
      sender_id = sender_id or "",
      persistent = true,
    },
  })
end

local function invite_expired(record, now)
  return record.status == "pending" and now >= record.expiresAt
end

local function mark_expired(record, version, now)
  record.status = "expired"
  record.updatedAt = now
  write_invite(record, version)
  notify(
    record.sender.userId,
    record.recipient.username .. "'s invite to " .. record.gameTitle .. " expired",
    social.CODES.invite_expired,
    { invite = public_invite(record) },
    record.recipient.userId
  )
  return record
end

local function load_for_viewer(params, user_id)
  local invite_id = trim(params.inviteId or params.invite_id)
  local token = trim(params.token)
  local record, version
  local load_error
  if invite_id then
    record, version = load_invite(invite_id)
    load_error = (not record) and version or nil
  elseif token then
    record, version = load_invite_by_token(token)
    load_error = (not record) and version or nil
  else
    return nil, nil, fail("missing_invite", "An invite id or token is required")
  end
  if not record then
    return nil, nil, fail(load_error or "invite_not_found", "That invite was not found")
  end
  if record.sender.userId ~= user_id and record.recipient.userId ~= user_id then
    return nil, nil, fail("not_invited", "This invite belongs to another player")
  end
  local now = nk.time()
  if invite_expired(record, now) then
    local current_version = version
    record = mark_expired(record, current_version, now)
  end
  return record, version, nil
end

function social.create_invite(context, params)
  local user_id = context.user_id
  local recipient, recipient_error = resolve_recipient(params)
  if not recipient then
    return nil, recipient_error
  end
  if recipient.user_id == user_id then
    return nil, fail("self_invite", "You cannot invite yourself")
  end
  local relation = friend_state(user_id, recipient.user_id)
  local reverse_relation = friend_state(recipient.user_id, user_id)
  if relation == 3 or reverse_relation == 3 then
    return nil, fail("blocked", "That player is not available for invites")
  end
  if relation ~= 0 then
    if not is_recent_player(user_id, recipient.user_id) then
      return nil, fail(
        "not_eligible",
        "You can only invite a MoonGames friend or recent player"
      )
    end
  end
  local game_id = trim(params.gameId or params.game_id)
  if not game_id then
    return nil, fail("missing_game", "A game id is required")
  end
  local handler = games[game_id]
  if not handler then
    return nil, fail("game_unavailable", "That game cannot create invite rooms yet")
  end

  local now = nk.time()
  local requested_match_id = trim(params.matchId or params.match_id)
  local room
  local room_ok

  if requested_match_id then
    if type(handler.attach_room) ~= "function" then
      return nil, fail(
        "game_unavailable",
        "That game cannot invite players into an existing room"
      )
    end
    room_ok, room =
      pcall(handler.attach_room, context, params, recipient)
    if
      not room_ok
      or type(room) ~= "table"
      or room.matchId ~= requested_match_id
    then
      return nil, fail(
        "room_unavailable",
        "That game room is no longer available for invites"
      )
    end
  else
    if type(handler.create_room) ~= "function" then
      return nil, fail(
        "game_unavailable",
        "That game cannot create invite rooms yet"
      )
    end
    room_ok, room = pcall(handler.create_room, context, params, recipient)
    if not room_ok or type(room) ~= "table" or not room.matchId then
      return nil, fail("room_failed", "The game room could not be created")
    end
  end

  local expires_at = now + social.INVITE_TTL_MS
  if type(room.expiresAt) == "number" then
    expires_at = math.min(expires_at, room.expiresAt)
  end
  if expires_at <= now then
    return nil, fail("room_expired", "That game room has expired")
  end

  local token = nk.uuid_v4() .. nk.uuid_v4()
  local invite_id = nk.uuid_v4()
  local message = trim(params.message)
  if message and #message > social.MAX_INVITE_MESSAGE then
    message = message:sub(1, social.MAX_INVITE_MESSAGE)
  end

  local record = {
    inviteId = invite_id,
    tokenHash = token_hash(token),
    gameId = game_id,
    gameTitle = text(room.gameTitle, game_id),
    mode = text(room.mode or params.mode, "private"),
    matchId = room.matchId,
    sender = public_user({
      user_id = user_id,
      username = context.username or "Player",
    }),
    recipient = public_user(recipient),
    status = "pending",
    createdAt = now,
    expiresAt = expires_at,
    updatedAt = now,
    joinPath = "/invite/" .. invite_id,
    deepLink = "moongames://invite/" .. invite_id,
    previewUrl = room.previewUrl,
    message = message,
    metadata = room.metadata or params.metadata or {},
  }

  local version = write_invite(record, nil)
  if not version then
    return nil, fail("storage_failed", "The invite could not be saved")
  end
  create_token_index(record, token)

  notify(
    recipient.user_id,
    record.sender.username .. " invited you to " .. record.gameTitle,
    social.CODES.invite_received,
    { invite = public_invite(record) },
    user_id
  )

  local result = public_invite(record)
  result.token = token
  return result, record
end

function social.resolve_invite(context, params)
  local record, version, resolve_error = load_for_viewer(params, context.user_id)
  if not record then
    return nil, resolve_error
  end
  local direction = record.sender.userId == context.user_id and "outgoing" or "incoming"
  return {
    invite = public_invite(record),
    direction = direction,
    canAccept = record.status == "pending" and direction == "incoming",
    canDecline = record.status == "pending" and direction == "incoming",
    canCancel = record.status == "pending" and direction == "outgoing",
    canJoin = record.status == "accepted"
      and record.matchId ~= nil
      and nk.time() < record.expiresAt,
  }
end

function social.accept_invite(context, params)
  local record, version, resolve_error = load_for_viewer(params, context.user_id)
  if not record then
    return nil, resolve_error
  end
  if record.recipient.userId ~= context.user_id then
    return nil, fail("not_recipient", "Only the invited player can accept")
  end
  if record.status == "accepted" then
    return public_invite(record)
  end
  if record.status == "expired" then
    return nil, fail("invite_expired", "That invite has expired")
  end
  if record.status ~= "pending" then
    return nil, fail("invite_not_pending", "That invite is no longer pending")
  end
  local now = nk.time()
  if now >= record.expiresAt then
    mark_expired(record, version, now)
    return nil, fail("invite_expired", "That invite has expired")
  end
  record.status = "accepted"
  record.updatedAt = now
  write_invite(record, version)
  notify(
    record.sender.userId,
    record.recipient.username .. " accepted your " .. record.gameTitle .. " invite",
    social.CODES.invite_accepted,
    { invite = public_invite(record) },
    record.recipient.userId
  )
  return public_invite(record)
end

function social.decline_invite(context, params)
  local record, version, resolve_error = load_for_viewer(params, context.user_id)
  if not record then
    return nil, resolve_error
  end
  if record.recipient.userId ~= context.user_id then
    return nil, fail("not_recipient", "Only the invited player can decline")
  end
  if record.status == "declined" then
    return public_invite(record)
  end
  if record.status == "expired" then
    return nil, fail("invite_expired", "That invite has expired")
  end
  if record.status ~= "pending" then
    return nil, fail("invite_not_pending", "That invite is no longer pending")
  end
  local now = nk.time()
  if now >= record.expiresAt then
    mark_expired(record, version, now)
    return nil, fail("invite_expired", "That invite has expired")
  end
  record.status = "declined"
  record.updatedAt = now
  write_invite(record, version)
  notify(
    record.sender.userId,
    record.recipient.username .. " declined your " .. record.gameTitle .. " invite",
    social.CODES.invite_declined,
    { invite = public_invite(record) },
    record.recipient.userId
  )
  return public_invite(record)
end

function social.cancel_invite(context, params)
  local record, version, resolve_error = load_for_viewer(params, context.user_id)
  if not record then
    return nil, resolve_error
  end
  if record.sender.userId ~= context.user_id then
    return nil, fail("not_sender", "Only the sender can cancel this invite")
  end
  if record.status == "cancelled" then
    return public_invite(record)
  end
  if record.status == "expired" then
    return nil, fail("invite_expired", "That invite has expired")
  end
  if record.status ~= "pending" then
    return nil, fail("invite_not_pending", "That invite is no longer pending")
  end
  local now = nk.time()
  if now >= record.expiresAt then
    mark_expired(record, version, now)
    return nil, fail("invite_expired", "That invite has expired")
  end
  record.status = "cancelled"
  record.updatedAt = now
  write_invite(record, version)
  notify(
    record.recipient.userId,
    record.sender.username .. " cancelled the " .. record.gameTitle .. " invite",
    social.CODES.invite_cancelled,
    { invite = public_invite(record) },
    record.sender.userId
  )
  return public_invite(record)
end

local function notification_state(user_id)
  local objects = nk.storage_read({
    {
      collection = social.NOTIFICATION_STATE_COLLECTION,
      key = STATE_KEY,
      user_id = user_id,
    },
  })
  if objects and objects[1] then
    return copy(objects[1].value), objects[1].version
  end
  return { readIds = {}, readAt = 0 }, nil
end

function social.notifications_state(context)
  local state = notification_state(context.user_id)
  return {
    readIds = state.readIds or {},
    readAt = state.readAt or 0,
  }
end

function social.mark_notifications_read(context, params)
  local state, version = notification_state(context.user_id)
  local known = {}
  for _, id in ipairs(state.readIds or {}) do
    known[id] = true
  end
  local ids = params.ids or params.notificationIds or {}
  if params.all == true then
    local notifications = nk.notifications_list(context.user_id, 1000)
    for _, notification in ipairs(notifications or {}) do
      if notification.id then
        known[notification.id] = true
      end
    end
  end
  for _, id in ipairs(ids) do
    if type(id) == "string" and id ~= "" then
      known[id] = true
    end
  end
  local read_ids = {}
  for id in pairs(known) do
    read_ids[#read_ids + 1] = id
  end
  table.sort(read_ids)
  if #read_ids > 1000 then
    local trimmed = {}
    for index = #read_ids - 999, #read_ids do
      trimmed[#trimmed + 1] = read_ids[index]
    end
    read_ids = trimmed
  end
  state.readIds = read_ids
  state.readAt = nk.time()
  nk.storage_write({
    {
      collection = social.NOTIFICATION_STATE_COLLECTION,
      key = STATE_KEY,
      user_id = context.user_id,
      value = state,
      version = version,
      permission_read = 0,
      permission_write = 0,
    },
  })
  return {
    readIds = read_ids,
    readAt = state.readAt,
  }
end

local function target_user(params)
  local target_id = trim(params.userId or params.user_id)
  local target_username = trim(params.username or params.targetUsername)
  local user = nil
  if target_id then
    user = find_user_by_id(target_id)
  elseif target_username then
    user = find_user_by_username(target_username)
  end
  return user
end

local function friend_params(context, params)
  local target, target_error = target_user(params)
  if not target then
    return nil, nil, target_error or fail("player_not_found", "That MoonGames player was not found")
  end
  if target.user_id == context.user_id then
    return nil, nil, fail("self_friend", "That is your own player name")
  end
  return target, friend_state(context.user_id, target.user_id)
end

function social.request_friend(context, params)
  local target, state, target_error = friend_params(context, params)
  if not target then
    return nil, target_error
  end
  if state == 0 then
    return { status = "friends" }
  end
  if state == 1 then
    return { status = "already_requested" }
  end
  if state == 3 then
    return nil, fail("blocked", "That player has blocked friend requests")
  end
  -- State 2 is an incoming request. Accepting it must reciprocate the
  -- relationship in Nakama instead of only reporting success to the client.
  nk.friends_add(
    context.user_id,
    context.username,
    { target.user_id },
    nil,
    nil
  )
  if state == 2 then
    return { status = "friends" }
  end
  return { status = "requested" }
end

function social.search_players(context, params)
  local query = trim((params or {}).query or (params or {}).q)
  if query then
    query = query:gsub("^@", "")
  end
  local length = query and ((utf8 and utf8.len(query)) or #query) or 0
  if length < 2 then
    return nil, fail("query_too_short", "Enter at least 2 characters to search")
  end
  if length > 32 then
    query = string.sub(query, 1, 32)
  end

  local rows = nil
  local ok, result = pcall(
    nk.sql_query,
    [[SELECT id::text AS id, username, display_name, avatar_url
       FROM users
      WHERE username IS NOT NULL
        AND POSITION(LOWER($1) IN LOWER(username)) = 1
        AND id::text <> $2
      ORDER BY LOWER(username) ASC, username ASC
      LIMIT 20]],
    { query, context.user_id }
  )
  if ok and type(result) == "table" then
    rows = result
  else
    local exact = find_user_by_username(query)
    rows = exact and { exact } or {}
  end

  local players = {}
  for _, row in ipairs(rows) do
    local user_id = row.user_id or row.id
    local username = row.username
    if user_id and username and user_id ~= context.user_id then
      players[#players + 1] = {
        userId = user_id,
        username = username,
        displayName = row.display_name or row.displayName,
        avatarUrl = row.avatar_url or row.avatarUrl,
        friendState = friend_state(context.user_id, user_id),
      }
    end
  end
  return { players = players }
end

function social.accept_friend(context, params)
  local target, state, target_error = friend_params(context, params)
  if not target then
    return nil, target_error
  end
  if state == 0 then
    return { status = "friends" }
  end
  if state ~= 2 then
    return nil, fail("not_requested", "That player has not sent you a friend request")
  end
  nk.friends_add(
    context.user_id,
    context.username,
    { target.user_id },
    nil,
    nil
  )
  return { status = "friends" }
end

function social.decline_friend(context, params)
  local target, state, target_error = friend_params(context, params)
  if not target then
    return nil, target_error
  end
  if state ~= 2 then
    return nil, fail("not_requested", "There is no incoming request from that player")
  end
  nk.friends_delete(
    context.user_id,
    context.username,
    { target.user_id },
    nil
  )
  notify(
    target.user_id,
    (context.username or "Player") .. " declined your friend request",
    social.CODES.friend_declined,
    { userId = context.user_id, username = context.username },
    context.user_id
  )
  return { status = "declined" }
end

function social.cancel_friend(context, params)
  local target, state, target_error = friend_params(context, params)
  if not target then
    return nil, target_error
  end
  if state ~= 1 then
    return nil, fail("not_pending", "There is no outgoing request to that player")
  end
  nk.friends_delete(
    context.user_id,
    context.username,
    { target.user_id },
    nil
  )
  notify(
    target.user_id,
    (context.username or "Player") .. " cancelled their friend request",
    social.CODES.friend_cancelled,
    { userId = context.user_id, username = context.username },
    context.user_id
  )
  return { status = "cancelled" }
end

function social.remove_friend(context, params)
  local target, state, target_error = friend_params(context, params)
  if not target then
    return nil, target_error
  end
  if state ~= 0 then
    return nil, fail("not_friends", "That player is not in your friends list")
  end
  nk.friends_delete(
    context.user_id,
    context.username,
    { target.user_id },
    nil
  )
  notify(
    target.user_id,
    (context.username or "Player") .. " removed you from their friends",
    social.CODES.friend_removed,
    { userId = context.user_id, username = context.username },
    context.user_id
  )
  return { status = "removed" }
end

local function recent_state(user_id)
  local objects = nk.storage_read({
    {
      collection = social.RECENT_PLAYERS_COLLECTION,
      key = "recent",
      user_id = user_id,
    },
  })
  if objects and objects[1] then
    return copy(objects[1].value), objects[1].version
  end
  return { entries = {} }, nil
end

function social.record_recent_players(game_id, players)
  if type(players) ~= "table" or #players < 2 then
    return
  end
  local now = nk.time()
  for _, player in ipairs(players) do
    if player.userId and player.userId ~= "" then
      local state, version = recent_state(player.userId)
      local entries = {}
      for _, entry in ipairs(state.entries or {}) do
        if entry.userId ~= player.userId then
          entries[#entries + 1] = entry
        end
      end
      for _, opponent in ipairs(players) do
        if opponent.userId and opponent.userId ~= player.userId then
          local found = false
          for _, entry in ipairs(entries) do
            if entry.userId == opponent.userId and entry.gameId == game_id then
              entry.lastPlayedAt = now
              entry.username = opponent.username or entry.username
              found = true
              break
            end
          end
          if not found then
            entries[#entries + 1] = {
              userId = opponent.userId,
              username = opponent.username or "Player",
              gameId = game_id,
              lastPlayedAt = now,
            }
          end
        end
      end
      table.sort(entries, function(left, right)
        return (left.lastPlayedAt or 0) > (right.lastPlayedAt or 0)
      end)
      local limited = {}
      for index = 1, math.min(#entries, social.MAX_RECENT_PLAYERS) do
        limited[index] = entries[index]
      end
      nk.storage_write({
        {
          collection = social.RECENT_PLAYERS_COLLECTION,
          key = "recent",
          user_id = player.userId,
          value = { entries = limited },
          version = version,
          permission_read = 0,
          permission_write = 0,
        },
      })
    end
  end
end

function social.recent_players(context)
  local state = recent_state(context.user_id)
  local result = {}
  for _, entry in ipairs(state.entries or {}) do
    if entry.userId and entry.userId ~= context.user_id then
      local user = find_user_by_id(entry.userId)
      if user then
        local public = public_user(user)
        public.gameId = entry.gameId
        public.lastPlayedAt = entry.lastPlayedAt
        result[#result + 1] = public
      end
    end
  end
  return { players = result }
end

-- RPC entry points ---------------------------------------------------------

local function rpc_create(context, payload)
  local response, error_response = require_payload(context, payload, function(_, params)
    return social.create_invite(context, params)
  end)
  if not response then
    return error_response
  end
  return ok({ invite = response })
end
nk.register_rpc(rpc_create, "moongames_invite_create")

local function rpc_resolve(context, payload)
  local response, error_response = require_payload(context, payload, function(_, params)
    return social.resolve_invite(context, params)
  end)
  if not response then
    return error_response
  end
  return ok(response)
end
nk.register_rpc(rpc_resolve, "moongames_invite_resolve")

local function rpc_accept(context, payload)
  local response, error_response = require_payload(context, payload, function(_, params)
    return social.accept_invite(context, params)
  end)
  if not response then
    return error_response
  end
  return ok({ invite = response })
end
nk.register_rpc(rpc_accept, "moongames_invite_accept")

local function rpc_decline(context, payload)
  local response, error_response = require_payload(context, payload, function(_, params)
    return social.decline_invite(context, params)
  end)
  if not response then
    return error_response
  end
  return ok({ invite = response })
end
nk.register_rpc(rpc_decline, "moongames_invite_decline")

local function rpc_cancel(context, payload)
  local response, error_response = require_payload(context, payload, function(_, params)
    return social.cancel_invite(context, params)
  end)
  if not response then
    return error_response
  end
  return ok({ invite = response })
end
nk.register_rpc(rpc_cancel, "moongames_invite_cancel")

local function rpc_notifications_state(context)
  local user_id, auth_error = require_user(context)
  if not user_id then
    return auth_error
  end
  return ok(social.notifications_state(context))
end
nk.register_rpc(rpc_notifications_state, "moongames_notifications_state")

local function rpc_notifications_mark_read(context, payload)
  local response, error_response = require_payload(context, payload, function(_, params)
    return social.mark_notifications_read(context, params)
  end)
  if not response then
    return error_response
  end
  return ok(response)
end
nk.register_rpc(rpc_notifications_mark_read, "moongames_notifications_mark_read")

local function rpc_player_search(context, payload)
  local response, error_response = require_payload(context, payload, function(_, params)
    return social.search_players(context, params)
  end)
  if not response then
    return error_response
  end
  return ok(response)
end
nk.register_rpc(rpc_player_search, "moongames_player_search")

local function rpc_friend_request(context, payload)
  local response, error_response = require_payload(context, payload, function(_, params)
    return social.request_friend(context, params)
  end)
  if not response then
    return error_response
  end
  return ok(response)
end
nk.register_rpc(rpc_friend_request, "moongames_friend_request")

local function rpc_friend_accept(context, payload)
  local response, error_response = require_payload(context, payload, function(_, params)
    return social.accept_friend(context, params)
  end)
  if not response then
    return error_response
  end
  return ok(response)
end
nk.register_rpc(rpc_friend_accept, "moongames_friend_accept")

local function rpc_friend_decline(context, payload)
  local response, error_response = require_payload(context, payload, function(_, params)
    return social.decline_friend(context, params)
  end)
  if not response then
    return error_response
  end
  return ok(response)
end
nk.register_rpc(rpc_friend_decline, "moongames_friend_decline")

local function rpc_friend_cancel(context, payload)
  local response, error_response = require_payload(context, payload, function(_, params)
    return social.cancel_friend(context, params)
  end)
  if not response then
    return error_response
  end
  return ok(response)
end
nk.register_rpc(rpc_friend_cancel, "moongames_friend_cancel")

local function rpc_friend_remove(context, payload)
  local response, error_response = require_payload(context, payload, function(_, params)
    return social.remove_friend(context, params)
  end)
  if not response then
    return error_response
  end
  return ok(response)
end
nk.register_rpc(rpc_friend_remove, "moongames_friend_remove")

local function rpc_recent_players(context)
  local user_id, auth_error = require_user(context)
  if not user_id then
    return auth_error
  end
  return ok(social.recent_players(context))
end
nk.register_rpc(rpc_recent_players, "moongames_recent_players_list")

return social
