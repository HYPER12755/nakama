--[[
  Nakama showcase server module.
  This is deliberately thin platform glue: resource seeding, wallet/ledger,
  notifications, tournament claims, and a public config object.
  All authoritative gameplay + validation lives in the Go game server.
--]]

local nk = require("nakama")

local SECRET = "dev_showcase_secret_2026"
local SYSTEM_USER = "00000000-0000-0000-0000-000000000000"

local LB_FASTEST = "showcase_reaction_ms"
local LB_WINS = "showcase_reaction_wins"
local TOURNAMENT = "showcase_reaction_daily"
local GROUP_NAME = "Showcase Lounge"

local function encode(t)
  return nk.json_encode(t)
end

local function ensure_leaderboards()
  local ok, err = pcall(function()
    nk.leaderboard_create(
      LB_FASTEST, false, "asc", "best", "",
      { title = "Fastest reaction", description = "Lowest server-measured reaction time in ms" },
      true
    )
  end)
  if not ok then
    nk.logger_info("showcase leaderboard fastest: " .. tostring(err))
  end

  local ok2, err2 = pcall(function()
    nk.leaderboard_create(
      LB_WINS, false, "desc", "incr", "",
      { title = "Reaction wins", description = "Total reaction duel wins" },
      true
    )
  end)
  if not ok2 then
    nk.logger_info("showcase leaderboard wins: " .. tostring(err2))
  end
end

local function ensure_tournament()
  local ok, err = pcall(function()
    nk.tournament_create(
      TOURNAMENT, false, "desc", "best", 86400, "0 0 * * *",
      { title = "Daily Reaction Cup" },
      "Daily Reaction Cup",
      "One score per day. Beat the bot or another player.",
      1, 0, 0, 0, 0, false, true
    )
  end)
  if not ok then
    nk.logger_info("showcase tournament: " .. tostring(err))
  end
end

local function public_config()
  return {
    game = "reaction",
    protocol = 1,
    title = "Nakama Feature Showcase",
    features = {
      "authentication", "sessions", "account", "friends", "groups",
      "parties", "chat", "status", "matchmaker", "relayed matches",
      "authoritative matches", "leaderboards", "tournaments", "wallet",
      "storage", "notifications", "rpc", "go game server"
    },
    seeded_at = nk.time(),
  }
end

local function write_public_config()
  local ok, err = pcall(function()
    nk.storage_write({
      {
        collection = "showcase",
        key = "config",
        user_id = SYSTEM_USER,
        value = public_config(),
        permission_read = 2,
        permission_write = 1,
      },
    })
  end)
  if not ok then
    nk.logger_error("showcase config write: " .. tostring(err))
  end
end

local function ensure_seed()
  ensure_leaderboards()
  ensure_tournament()
  write_public_config()
end

-- ---------------------------------------------------------------------------
-- RPC: seed / info
-- ---------------------------------------------------------------------------

local function rpc_seed(context, payload)
  ensure_seed()
  return encode({
    ok = true,
    leaderboards = { LB_FASTEST, LB_WINS },
    tournament = TOURNAMENT,
    config = public_config(),
    user_id = context.user_id,
  })
end
nk.register_rpc(rpc_seed, "showcase_seed")

local function rpc_info(context, payload)
  local account = nk.account_get_id(context.user_id)
  return encode({
    ok = true,
    server_time_ms = nk.time(),
    user = {
      id = account.user_id,
      username = account.username,
      display_name = account.display_name,
      wallet = account.wallet,
    },
    leaderboards = { LB_FASTEST, LB_WINS },
    tournament = TOURNAMENT,
    authority = "Nakama Lua for platform glue; Go for authoritative gameplay",
  })
end
nk.register_rpc(rpc_info, "showcase_info")

-- ---------------------------------------------------------------------------
-- RPC: economy
-- ---------------------------------------------------------------------------

local function rpc_daily(context, payload)
  local uid = context.user_id
  if not uid then
    return encode({ ok = false, error = "RPC requires a user session" })
  end

  local day = math.floor(nk.time() / 86400000)
  local existing = nk.storage_read({
    { collection = "showcase_player", key = "daily", user_id = uid },
  })

  if #existing > 0 and existing[1].value and existing[1].value.day == day then
    return encode({ ok = false, error = "Daily bonus already claimed today" })
  end

  local updated, previous = nk.wallet_update(uid, { coins = 100, gems = 5 }, { source = "daily_bonus" }, true)
  nk.storage_write({
    {
      collection = "showcase_player",
      key = "daily",
      user_id = uid,
      value = { day = day, claimed_at = nk.time() },
      permission_read = 1,
      permission_write = 0,
    },
  })
  nk.notification_send(uid, "Daily bonus claimed", { coins = 100, gems = 5 }, 10, "", true)

  return encode({ ok = true, wallet = updated, previous = previous })
end
nk.register_rpc(rpc_daily, "showcase_daily")

local function rpc_purchase(context, payload)
  local uid = context.user_id
  if not uid then
    return encode({ ok = false, error = "RPC requires a user session" })
  end

  local item = "neon_skin"
  local price = 50
  local account = nk.account_get_id(uid)
  local coins = (account.wallet and account.wallet.coins) or 0
  if coins < price then
    return encode({ ok = false, error = "Not enough coins", coins = coins, price = price })
  end

  local updated, previous = nk.wallet_update(uid, { coins = -price }, { item = item }, true)

  local existing = nk.storage_read({
    { collection = "showcase_inventory", key = "items", user_id = uid },
  })
  local inventory = { items = {} }
  if #existing > 0 and existing[1].value then
    inventory = existing[1].value
    inventory.items = inventory.items or {}
  end
  inventory.items[item] = (inventory.items[item] or 0) + 1

  nk.storage_write({
    {
      collection = "showcase_inventory",
      key = "items",
      user_id = uid,
      value = inventory,
      permission_read = 1,
      permission_write = 0,
    },
  })
  nk.notification_send(uid, "Purchase complete", { item = item, price = price }, 11, "", true)

  return encode({ ok = true, wallet = updated, previous = previous, inventory = inventory })
end
nk.register_rpc(rpc_purchase, "showcase_purchase")

local function rpc_claim_tournament(context, payload)
  local uid = context.user_id
  if not uid then
    return encode({ ok = false, error = "RPC requires a user session" })
  end

  local ok, records = pcall(nk.tournament_records_list, TOURNAMENT, { uid }, 1, "", 0)
  if not ok or not records or #records == 0 then
    return encode({ ok = false, error = "Join the Daily Reaction Cup and submit a score first" })
  end

  local day = math.floor(nk.time() / 86400000)
  local existing = nk.storage_read({
    { collection = "showcase_player", key = "tournament_claim", user_id = uid },
  })
  if #existing > 0 and existing[1].value and existing[1].value.day == day then
    return encode({ ok = false, error = "Tournament reward already claimed today" })
  end

  local updated = nk.wallet_update(uid, { coins = 100, gems = 10 }, { source = "tournament_claim" }, true)
  nk.storage_write({
    {
      collection = "showcase_player",
      key = "tournament_claim",
      user_id = uid,
      value = { day = day, claimed_at = nk.time() },
      permission_read = 1,
      permission_write = 0,
    },
  })
  nk.notification_send(uid, "Tournament reward", { coins = 100, gems = 10 }, 12, "", true)

  return encode({ ok = true, wallet = updated })
end
nk.register_rpc(rpc_claim_tournament, "showcase_claim_tournament")

local function rpc_notify(context, payload)
  local uid = context.user_id
  if not uid then
    return encode({ ok = false, error = "RPC requires a user session" })
  end
  nk.notification_send(uid, "Nakama says hi", {
    text = "This notification was created by a Lua RPC and delivered over Nakama realtime.",
    at = nk.time(),
  }, 13, "", true)
  return encode({ ok = true })
end
nk.register_rpc(rpc_notify, "showcase_notify")

-- ---------------------------------------------------------------------------
-- RPC: social helper (shared open group)
-- ---------------------------------------------------------------------------

local function rpc_demo_group(context, payload)
  local uid = context.user_id
  local username = context.username or ""
  if not uid then
    return encode({ ok = false, error = "RPC requires a user session" })
  end

  local groups = nk.groups_list(GROUP_NAME, "", nil, -1, 10, "")
  local group = groups and groups[1] or nil
  if not group then
    local created, groupOrErr = pcall(nk.group_create, uid, GROUP_NAME, nil, "en",
      "Open lounge used by the Nakama showcase. Join and try group chat.", "", true, { showcase = true }, 100)
    if not created then
      groups = nk.groups_list(GROUP_NAME, "", nil, -1, 10, "")
      group = groups and groups[1] or nil
    else
      group = groupOrErr
    end
  end

  if not group then
    return encode({ ok = false, error = "Could not create or find Showcase Lounge" })
  end

  pcall(nk.group_user_join, group.id, uid, username)
  return encode({ ok = true, group = { id = group.id, name = group.name, open = group.open, edge_count = group.edge_count } })
end
nk.register_rpc(rpc_demo_group, "showcase_demo_group")

-- ---------------------------------------------------------------------------
-- RPC: authoritative arena (Lua match handler)
-- ---------------------------------------------------------------------------

local function rpc_create_arena(context, payload)
  local match_id = nk.match_create("showcase_arena", {})
  return encode({ ok = true, match_id = match_id })
end
nk.register_rpc(rpc_create_arena, "showcase_create_arena")

-- ---------------------------------------------------------------------------
-- Privileged match result from the Go game server.
-- The secret is never shipped to the browser.
-- ---------------------------------------------------------------------------

local function rpc_result(context, payload)
  local ok, data = pcall(nk.json_decode, payload)
  if not ok or not data then
    return encode({ ok = false, error = "Invalid payload" })
  end
  if data.secret ~= SECRET then
    return encode({ ok = false, error = "Unauthorized" })
  end

  local uid = data.user_id
  local username = data.username or ""
  local ms = tonumber(data.ms) or 0
  local won = data.won == true
  local room = tostring(data.room or "")
  local opponent = tostring(data.opponent or "")

  if not uid or uid == "" then
    return encode({ ok = false, error = "Missing user_id" })
  end
  if ms < 0 or ms > 60000 then
    return encode({ ok = false, error = "Invalid reaction time" })
  end

  ensure_seed()

  local record = nil
  if ms > 0 then
    local rok, rerr = pcall(nk.leaderboard_record_write, LB_FASTEST, uid, username, math.floor(ms), 0,
      { room = room, won = won }, "best")
    if rok then record = rerr end
  end

  if won then
    pcall(nk.leaderboard_record_write, LB_WINS, uid, username, 1, 0, { room = room }, "incr")
  end

  local score = 0
  if ms > 0 then score = math.max(0, 10000 - math.floor(ms)) end
  if won then score = score + 1000 end
  pcall(nk.tournament_record_write, TOURNAMENT, uid, username, score, 0,
    { ms = ms, won = won, room = room }, "best")

  local coins = 10 + (won and 25 or 0)
  local wallet = nil
  local wok, updated = pcall(nk.wallet_update, uid, { coins = coins }, { source = "reaction_result", room = room }, true)
  if wok then wallet = updated end

  nk.notification_send(uid, "Reaction Duel result", {
    won = won,
    ms = ms,
    coins = coins,
    opponent = opponent,
  }, 20, "", true)

  pcall(nk.storage_write, {
    {
      collection = "showcase_matches",
      key = "room-" .. room .. "-" .. uid,
      user_id = uid,
      value = {
        won = won,
        ms = ms,
        opponent = opponent,
        room = room,
        at = nk.time(),
      },
      permission_read = 1,
      permission_write = 0,
    },
  })

  return encode({
    ok = true,
    wallet = wallet,
    leaderboard_record = record,
    tournament_score = score,
    coins = coins,
  })
end
nk.register_rpc(rpc_result, "showcase_result")
