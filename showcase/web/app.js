import { Client } from "./nakama-js.esm.mjs";

/* ------------------------------------------------------------------------- */
/* Constants + state                                                         */
/* ------------------------------------------------------------------------- */

const LB_FASTEST = "showcase_reaction_ms";
const LB_WINS = "showcase_reaction_wins";
const TOURNAMENT_ID = "showcase_reaction_daily";
const GLOBAL_ROOM = "showcase-global";
const DEVICE_KEY = "showcase_device_id";
const CUSTOM_KEY = "showcase_custom_id";
const COVERAGE_KEY = "showcase_feature_coverage_v1";
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

const FEATURE_DEFS = [
  {
    group: "Identity & account", goto: "#auth", items: [
      ["auth_device", "Device auth"], ["auth_custom", "Custom auth"], ["auth_email", "Email auth"],
      ["session_refresh", "Session refresh"], ["session_logout", "Logout"],
      ["account_get", "Account read"], ["account_update", "Account update"],
    ]
  },
  {
    group: "Realtime & matches", goto: "#realtime", items: [
      ["socket_connect", "Socket connect"], ["status_update", "Status update"], ["status_follow", "Status follow"],
      ["chat_global", "Global chat"], ["chat_dm", "Direct message"], ["chat_group", "Group chat"],
      ["chat_history", "Channel history"], ["relay_match", "Relayed match"], ["matchmaker", "Matchmaker ticket"],
      ["matchmaker_matched", "Matchmaker matched"], ["arena_match", "Nakama authoritative match"],
    ]
  },
  {
    group: "Social graph", goto: "#social", items: [
      ["friends_add", "Add friend"], ["friends_list", "List friends"], ["friends_delete", "Delete friend"],
      ["groups_create", "Create group"], ["groups_join", "Join group"], ["groups_list", "My groups"],
      ["groups_users", "Group users"], ["party_create", "Create party"], ["party_join", "Join party"],
      ["party_data", "Party data"],
    ]
  },
  {
    group: "Game (Go authoritative)", goto: "#game", items: [
      ["go_game", "Go game socket"], ["go_bot", "Bot match"], ["go_private", "Private room"],
      ["game_result", "Verified result"], ["wallet_result", "Wallet reward"], ["leaderboard_result", "Leaderboard write"],
    ]
  },
  {
    group: "Economy & competition", goto: "#economy", items: [
      ["wallet_daily", "Daily bonus"], ["wallet_purchase", "Store purchase"], ["leaderboard_read", "Leaderboard read"],
      ["leaderboard_write", "Leaderboard write"], ["tournament_join", "Tournament join"],
      ["tournament_write", "Tournament write"], ["tournament_claim", "Tournament claim"],
      ["notifications_list", "Notifications list"], ["notifications_send", "Notifications send"],
      ["notifications_delete", "Notifications delete"],
    ]
  },
  {
    group: "Storage & RPC", goto: "#storage", items: [
      ["storage_write", "Storage write"], ["storage_read", "Storage read"], ["storage_list", "Storage list"],
      ["storage_delete", "Storage delete"], ["storage_public", "Public config"], ["rpc_call", "Custom RPC"],
    ]
  },
  {
    group: "Ops", goto: "#ops", items: [
      ["healthcheck", "Healthcheck"], ["go_health", "Go health"], ["console", "Console access"],
    ]
  },
];

const FEATURE_MAP = new Map();
for (const group of FEATURE_DEFS) for (const [id, label] of group.items) FEATURE_MAP.set(id, label);

const state = {
  client: null,
  session: null,
  provider: "device",
  socket: null,
  socketConnected: false,
  account: null,
  user: null,
  wallet: {},
  config: null,
  friends: [],
  groups: [],
  group: null,
  party: null,
  channels: { global: null, dm: null, group: null },
  messages: { global: [], dm: [], group: [] },
  leaderboardId: LB_FASTEST,
  tournaments: [],
  tournamentId: TOURNAMENT_ID,
  notifications: [],
  relayMatchId: null,
  arenaMatchId: null,
  arenaEvents: [],
  relayEvents: [],
  mmTicket: null,
  game: null,
  gamePingTimer: null,
  gameTimer: null,
  done: new Set(),
  formFilled: false,
  events: [],
  best: null,
};

/* ------------------------------------------------------------------------- */
/* Utilities                                                                 */
/* ------------------------------------------------------------------------- */

const $id = (id) => document.getElementById(id);
const setText = (id, value) => { const el = $id(id); if (el) el.textContent = value; };
const setVal = (id, value) => { const el = $id(id); if (el && document.activeElement !== el) el.value = value ?? ""; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function parseMaybe(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function pretty(value) {
  if (value == null) return "—";
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function errMsg(err) {
  if (!err) return "Unknown error";
  if (err.message) return err.message;
  if (err.error && err.error.message) return err.error.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}

function shortId(id) {
  if (!id) return "—";
  return id.length > 13 ? id.slice(0, 8) + "…" + id.slice(-4) : id;
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

function formatUnix(seconds) {
  if (!seconds) return "—";
  const d = new Date(seconds * 1000);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function formatMs(ms) {
  if (ms == null || ms === "" || Number(ms) <= 0) return "—";
  return `${Number(ms).toLocaleString()} ms`;
}

function toast(message, kind = "") {
  const host = $id("toast-host");
  if (!host) return;
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = String(message).slice(0, 420);
  host.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(-4px)";
    setTimeout(() => el.remove(), 200);
  }, 4600);
}

function log(cat, message, data) {
  const time = new Date().toLocaleTimeString([], { hour12: false });
  state.events.push({ cat, message, data, time });
  if (state.events.length > 180) state.events.shift();
  renderLog();
}

function renderLog() {
  const cls = (cat) => {
    const c = String(cat || "").toLowerCase();
    if (["error", "err"].includes(c)) return "err";
    if (["game", "go"].includes(c)) return "game";
    if (["chat", "channel"].includes(c)) return "chat";
    if (["nakama", "rpc", "social"].includes(c)) return "nakama";
    if (["go-server", "health"].includes(c)) return "go";
    return "";
  };
  const html = state.events.map((e) => {
    const data = e.data == null ? "" : ` <span>${escapeHtml(JSON.stringify(e.data).slice(0, 280))}</span>`;
    return `<div><span class="log-time">${escapeHtml(e.time)}</span> <span class="log-cat ${cls(e.cat)}">${escapeHtml(String(e.cat || "").toUpperCase())}</span> ${escapeHtml(e.message)}${data}</div>`;
  }).join("");
  for (const id of ["event-log", "ops-log"]) {
    const el = $id(id);
    if (el) {
      el.innerHTML = html || "—";
      el.scrollTop = el.scrollHeight;
    }
  }
}

function loadCoverage() {
  try {
    const raw = localStorage.getItem(COVERAGE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) for (const id of arr) if (FEATURE_MAP.has(id)) state.done.add(id);
  } catch { /* ignore */ }
}

function saveCoverage() {
  try { localStorage.setItem(COVERAGE_KEY, JSON.stringify([...state.done])); } catch { /* ignore */ }
}

function markFeature(id) {
  if (!FEATURE_MAP.has(id) || state.done.has(id)) return;
  state.done.add(id);
  saveCoverage();
  document.querySelectorAll(`[data-feature="${id}"]`).forEach((el) => el.classList.add("done"));
  renderCoverage();
}

function renderFeatureGrid() {
  const grid = $id("feature-grid");
  if (!grid) return;
  grid.innerHTML = FEATURE_DEFS.map((group) => `
    <div class="feature-group">
      <h4>${escapeHtml(group.group)}</h4>
      <div class="feature-items">
        ${group.items.map(([id, label]) => `<button type="button" class="feature-chip" data-feature="${escapeHtml(id)}" data-goto="${escapeHtml(group.goto)}">${escapeHtml(label)}</button>`).join("")}
      </div>
    </div>`).join("");
}

function renderCoverage() {
  const total = FEATURE_MAP.size;
  const done = state.done.size;
  const pct = total ? Math.round((done / total) * 100) : 0;
  setText("coverage-text", `${pct}%`);
  const bar = $id("coverage-bar");
  if (bar) bar.style.width = `${pct}%`;
  const list = $id("coverage-list");
  if (list) {
    list.innerHTML = [...FEATURE_MAP.entries()].map(([id, label]) =>
      `<span class="${state.done.has(id) ? "done" : ""}">${state.done.has(id) ? "✓ " : ""}${escapeHtml(label)}</span>`
    ).join("");
  }
  document.querySelectorAll("[data-feature]").forEach((el) => {
    el.classList.toggle("done", state.done.has(el.dataset.feature));
  });
}

async function copyText(value) {
  const text = String(value ?? "");
  if (!text) { toast("Nothing to copy", "err"); return; }
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    toast("Copied", "ok");
  } catch (err) {
    toast("Copy failed: " + errMsg(err), "err");
  }
}

function setConnection(connected, text) {
  state.socketConnected = connected;
  const dot = $id("conn-dot");
  if (dot) dot.className = "dot " + (connected ? "live" : "down");
  setText("conn-text", text);
  setText("ops-socket", connected ? "live" : "offline");
}

/* ------------------------------------------------------------------------- */
/* Boot + auth                                                               */
/* ------------------------------------------------------------------------- */

function deviceId() {
  let id = sessionStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = "showcase-device-" + (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
    sessionStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function makeClient() {
  return new Client(
    "defaultkey",
    location.hostname || "127.0.0.1",
    location.port || "4001",
    location.protocol === "https:",
    12000,
  );
}

async function bootAuth() {
  const url = new URL(location.href);
  if (url.searchParams.get("new") === "1") {
    sessionStorage.removeItem(DEVICE_KEY);
    sessionStorage.removeItem(CUSTOM_KEY);
    url.searchParams.delete("new");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  }

  state.client = makeClient();
  let session;
  const custom = sessionStorage.getItem(CUSTOM_KEY);
  if (custom) {
    try {
      session = await state.client.authenticateCustom(custom, true);
      state.provider = "custom";
      markFeature("auth_custom");
    } catch (err) {
      log("error", "Custom auth failed; falling back to device", { message: errMsg(err) });
      sessionStorage.removeItem(CUSTOM_KEY);
    }
  }
  if (!session) {
    session = await state.client.authenticateDevice(deviceId(), true);
    state.provider = "device";
  }

  state.session = session;
  state.formFilled = false;
  applySessionUI();
  markFeature("auth_device");
  markFeature("account_get");
  log("nakama", "Authenticated with Nakama", { provider: state.provider, user_id: session.user_id, username: session.username });
  await connectSocket(session);
  await loadInitialData();
}

async function connectSocket(session) {
  if (state.socket) {
    try { state.socket.disconnect(false); } catch { /* ignore */ }
  }
  setConnection(false, "connecting socket…");
  const socket = state.client.createSocket(location.protocol === "https:", false);
  bindSocket(socket);
  const returned = await socket.connect(session, true);
  if (returned && returned.token) state.session = returned;
  state.socket = socket;
  setConnection(true, "socket live");
  markFeature("socket_connect");
  applySessionUI();

  try {
    const channel = await socket.joinChat(GLOBAL_ROOM, 1, true, false);
    state.channels.global = { id: channel.id, target: GLOBAL_ROOM };
    setText("global-channel-id", shortId(channel.id));
    markFeature("chat_global");
    log("chat", "Joined the global room", { channel_id: channel.id });
  } catch (err) {
    log("error", "Global chat join failed", { message: errMsg(err) });
  }

  try {
    await socket.updateStatus("In the Nakama showcase on :4001");
    markFeature("status_update");
  } catch (err) {
    log("error", "Status update failed", { message: errMsg(err) });
  }

  if (state.group) {
    try {
      const ch = await socket.joinChat(state.group.id, 3, true, false);
      state.channels.group = { id: ch.id, target: state.group.id };
      setText("group-channel-id", shortId(ch.id));
    } catch { /* group channel can be joined manually */ }
  }
}

async function switchSession(session, provider) {
  try { state.socket?.disconnect(false); } catch { /* ignore */ }
  state.session = session;
  state.provider = provider;
  state.account = null;
  state.user = null;
  state.wallet = {};
  state.best = null;
  state.formFilled = false;
  state.friends = [];
  state.groups = [];
  state.group = null;
  state.party = null;
  state.notifications = [];
  state.relayMatchId = null;
  state.arenaMatchId = null;
  state.mmTicket = null;
  state.channels = { global: null, dm: null, group: null };
  state.messages = { global: [], dm: [], group: [] };
  renderAllChats();
  renderParty();
  renderWallet();
  applySessionUI();
  await connectSocket(session);
  await loadInitialData();
}

async function loadInitialData() {
  const jobs = [
    ["account", refreshAccount()],
    ["seed", seedShowcase()],
    ["friends", refreshFriends()],
    ["groups", refreshGroups()],
    ["leaderboard", refreshLeaderboards()],
    ["tournaments", refreshTournaments()],
    ["notifications", refreshNotifications()],
    ["public", refreshPublicConfig()],
    ["inventory", refreshInventory()],
    ["health", refreshHealth()],
  ];
  const results = await Promise.allSettled(jobs.map(([, p]) => p));
  results.forEach((result, i) => {
    if (result.status === "rejected") log("error", `${jobs[i][0]} failed`, { message: errMsg(result.reason) });
  });
  markFeature("healthcheck");
  renderCoverage();
}

function applySessionUI() {
  const session = state.session;
  const user = state.user;
  if (!session) return;
  const username = user?.username || session.username || "—";
  const displayName = user?.display_name || username;
  const userId = user?.id || session.user_id || "";
  setText("head-username", username);
  setText("head-userid", shortId(userId));
  setText("session-userid", shortId(userId));
  setText("session-username", username);
  setText("session-expiry", session.expires_at ? formatUnix(session.expires_at) : "—");
  setText("session-token", session.token ? session.token.slice(0, 26) + "…" : "—");
  setText("auth-provider", state.provider);
  setText("ops-provider", state.provider);
  setText("ops-userid", userId || "—");
  setText("ops-username", username);
  setText("ops-socket", state.socketConnected ? "live" : "offline");
  const avatar = $id("avatar");
  if (avatar) avatar.textContent = (displayName || "?").trim().slice(0, 1).toUpperCase();
  const selfName = $id("game-self-name");
  if (selfName && !state.game?.self) selfName.textContent = displayName;
}

/* ------------------------------------------------------------------------- */
/* Account / wallet / stats                                                  */
/* ------------------------------------------------------------------------- */

function parseWallet(raw) {
  const parsed = parseMaybe(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed;
}

async function refreshAccount() {
  if (!state.session) return;
  const account = await state.client.getAccount(state.session);
  state.account = account;
  state.user = account.user || {};
  state.wallet = parseWallet(account.wallet);
  if (!state.session.username && state.user.username) state.session.username = state.user.username;
  if (!state.session.user_id && state.user.id) state.session.user_id = state.user.id;
  state.formFilled = false;
  fillAccountForm();
  renderWallet();
  setText("account-json", pretty(account));
  applySessionUI();
  markFeature("account_get");
  renderStats();
}

function fillAccountForm() {
  if (state.formFilled || !state.user) return;
  setVal("acct-display-name", state.user.display_name || "");
  setVal("acct-avatar", state.user.avatar_url || "");
  setVal("acct-lang", state.user.lang_tag || "");
  setVal("acct-location", state.user.location || "");
  setVal("acct-timezone", state.user.timezone || "");
  state.formFilled = true;
}

function renderWallet() {
  const coins = Number(state.wallet.coins || 0);
  const gems = Number(state.wallet.gems || 0);
  setText("stat-wallet", `${coins} / ${gems}`);
  const host = $id("wallet-display");
  if (host) {
    const parts = [];
    for (const [key, value] of Object.entries(state.wallet || {})) {
      parts.push(`<span class="wallet-pill ${key === "gems" ? "gems" : ""}">${escapeHtml(key)}: ${escapeHtml(value)}</span>`);
    }
    if (!parts.length) {
      parts.push('<span class="wallet-pill">coins: 0</span><span class="wallet-pill gems">gems: 0</span>');
    }
    host.innerHTML = parts.join("");
  }
}

async function refreshStats() {
  setText("stat-friends", String(state.friends.filter((f) => f.state === 0).length));
  setText("stat-groups", String(state.groups.length));
  setText("stat-best", state.best != null ? `${state.best} ms` : "—");
  setText("game-best", state.best != null ? `${state.best} ms` : "—");
  try {
    const res = await state.client.listLeaderboardRecords(state.session, LB_FASTEST, [state.session.user_id], 1);
    const rec = res.owner_records?.[0] || res.records?.[0];
    if (rec && rec.score != null) {
      state.best = Number(rec.score);
      setText("stat-best", `${state.best} ms`);
      setText("game-best", `${state.best} ms`);
    }
  } catch { /* not fatal */ }
  renderCoverage();
}

function renderStats() {
  setText("stat-friends", String(state.friends.filter((f) => f.state === 0).length));
  setText("stat-groups", String(state.groups.length));
  setText("stat-best", state.best != null ? `${state.best} ms` : "—");
  setText("game-best", state.best != null ? `${state.best} ms` : "—");
}

async function seedShowcase() {
  const rpc = await callRpc("showcase_seed", {});
  state.config = rpc.config || state.config;
  markFeature("rpc_call");
  log("nakama", "Seeded leaderboards, tournament and public config", {
    leaderboards: rpc.leaderboards,
    tournament: rpc.tournament,
  });
}

async function callShowcaseInfo() {
  const info = await callRpc("showcase_info", {});
  setText("rpc-out", pretty(info));
  markFeature("rpc_call");
  log("nakama", "Called custom RPC showcase_info", info);
}

/* ------------------------------------------------------------------------- */
/* Generic RPC                                                               */
/* ------------------------------------------------------------------------- */

async function callRpc(id, input = {}) {
  const res = await state.client.rpc(state.session, id, input);
  const payload = parseMaybe(res?.payload);
  if (payload && payload.ok === false) throw new Error(payload.error || "RPC failed");
  return payload || {};
}

/* ------------------------------------------------------------------------- */
/* Friends                                                                   */
/* ------------------------------------------------------------------------- */

function friendStateLabel(friend) {
  switch (friend.state) {
    case 0: return "friend";
    case 1: return "request sent";
    case 2: return "wants to be friends";
    case 3: return "blocked";
    default: return "linked";
  }
}

async function refreshFriends() {
  // Friend states: 0 = accepted, 1 = request sent by you, 2 = request received.
  const [accepted, sent, received] = await Promise.all([
    state.client.listFriends(state.session, 0, 100),
    state.client.listFriends(state.session, 1, 100),
    state.client.listFriends(state.session, 2, 100),
  ]);
  state.friends = [
    ...(accepted.friends || []),
    ...(sent.friends || []),
    ...(received.friends || []),
  ];
  renderFriends();
  renderStats();
  markFeature("friends_list");
}

function renderFriends() {
  const host = $id("friend-list");
  if (!host) return;
  if (!state.friends.length) {
    host.innerHTML = '<div class="list-item"><span class="tag">No friends yet — add a username from the second tab.</span></div>';
    return;
  }
  host.innerHTML = state.friends.map((friend) => {
    const user = friend.user || {};
    const name = user.display_name || user.username || shortId(user.id);
    const id = escapeHtml(user.id || "");
    const actions = friend.state === 2
      ? `<button class="btn ghost" data-action="accept-friend" data-id="${id}">accept</button>
         <button class="btn ghost" data-action="delete-friend" data-id="${id}">decline</button>`
      : friend.state === 1
        ? `<button class="btn ghost" data-action="delete-friend" data-id="${id}">cancel</button>`
        : `<button class="btn ghost" data-action="dm-friend" data-id="${id}">DM</button>
           <button class="btn ghost" data-action="delete-friend" data-id="${id}">delete</button>`;
    return `<div class="list-item">
      <div class="li-main"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(user.username || user.id || "")} · ${escapeHtml(friendStateLabel(friend))}</span></div>
      <div class="li-actions">${actions}</div>
    </div>`;
  }).join("");
}

async function addFriend() {
  const input = $id("friend-username");
  const username = input?.value.trim();
  if (!username) throw new Error("Enter a friend username");
  await state.client.addFriends(state.session, [], [username]);
  input.value = "";
  markFeature("friends_add");
  await refreshFriends();
  toast("Friend request sent (or accepted if they already asked you)", "ok");
  log("social", "Added friend by username", { username });
}

async function acceptFriend(id) {
  if (!id) throw new Error("Missing friend user ID");
  await state.client.addFriends(state.session, [id], []);
  markFeature("friends_add");
  await refreshFriends();
  log("social", "Accepted friend request", { user_id: id });
  toast("Friend request accepted", "ok");
}

async function deleteFriend(id) {
  await state.client.deleteFriends(state.session, [id]);
  markFeature("friends_delete");
  await refreshFriends();
  log("social", "Deleted friend or request", { user_id: id });
}

/* ------------------------------------------------------------------------- */
/* Groups                                                                    */
/* ------------------------------------------------------------------------- */

async function refreshGroups() {
  // Leave state/limit undefined: nakama-js 2.8.0 forwards those two arguments
  // in the opposite order from its declaration for this endpoint, and state=0
  // filters out ordinary memberships.
  const res = await state.client.listUserGroups(state.session, state.session.user_id);
  state.groups = (res.user_groups || []).map((entry) => entry.group).filter(Boolean);
  renderGroups();
  renderStats();
  markFeature("groups_list");
}

function renderGroups() {
  const host = $id("group-list");
  if (!host) return;
  host.innerHTML = state.groups.map((group) => `
    <div class="list-item">
      <div class="li-main"><strong>${escapeHtml(group.name || shortId(group.id))}</strong><span>${escapeHtml(group.id || "")} · ${group.edge_count || 0} members</span></div>
      <div class="li-actions">
        <button class="btn ghost" data-action="group-chat" data-id="${escapeHtml(group.id || "")}">chat</button>
        <button class="btn ghost" data-action="group-users" data-id="${escapeHtml(group.id || "")}">users</button>
        <button class="btn ghost" data-action="leave-group" data-id="${escapeHtml(group.id || "")}">leave</button>
      </div>
    </div>`).join("");
}

async function joinDemoGroup() {
  const res = await callRpc("showcase_demo_group", {});
  state.group = res.group;
  const groupId = res.group?.id;
  if (groupId) {
    const input = $id("group-chat-id");
    if (input) input.value = groupId;
  }
  markFeature("groups_join");
  await refreshGroups();
  log("social", "Joined Showcase Lounge", res.group);
  toast("Joined Showcase Lounge", "ok");
}

async function createGroup() {
  const input = $id("group-name");
  const name = input?.value.trim();
  if (!name) throw new Error("Enter a group name");
  const group = await state.client.createGroup(state.session, {
    name,
    description: "Created from the Nakama feature showcase",
    open: true,
    max_count: 100,
  });
  input.value = "";
  markFeature("groups_create");
  await refreshGroups();
  log("social", "Created group", { id: group.id, name: group.name });
  toast("Group created", "ok");
}

async function joinGroupById(id) {
  const groupId = id || $id("group-join-id")?.value.trim();
  if (!groupId) throw new Error("Enter a group ID");
  await state.client.joinGroup(state.session, groupId);
  markFeature("groups_join");
  await refreshGroups();
  log("social", "Joined group", { group_id: groupId });
  toast("Joined group", "ok");
}

async function leaveGroup(id) {
  await state.client.leaveGroup(state.session, id);
  await refreshGroups();
  log("social", "Left group", { group_id: id });
}

async function showGroupUsers(id) {
  const res = await state.client.listGroupUsers(state.session, id, 0, 100);
  const rows = (res.group_users || []).map((entry) => {
    const user = entry.user || {};
    return `${user.username || user.id} · state=${entry.state}`;
  });
  setText("group-users", rows.length ? rows.join("\n") : "No members returned");
  markFeature("groups_users");
}

/* ------------------------------------------------------------------------- */
/* Party + status                                                            */
/* ------------------------------------------------------------------------- */

function renderParty() {
  const out = $id("party-out");
  if (!out) return;
  if (!state.party) {
    out.textContent = "No party. Create one or join by ID.";
    return;
  }
  out.textContent = pretty({
    party_id: state.party.party_id,
    open: state.party.open,
    max_size: state.party.max_size,
    leader: state.party.leader,
    presences: state.party.presences,
  });
}

async function createParty() {
  const party = await state.socket.createParty(true, 4);
  state.party = party;
  setVal("party-join-id", party.party_id);
  renderParty();
  markFeature("party_create");
  log("social", "Party created", { party_id: party.party_id });
  toast("Party created", "ok");
}

async function joinParty() {
  const id = $id("party-join-id")?.value.trim();
  if (!id) throw new Error("Enter a party ID");
  await state.socket.joinParty(id);
  markFeature("party_join");
  log("social", "Join request sent to party", { party_id: id });
  toast("Party join requested", "ok");
}

async function leaveParty() {
  const id = state.party?.party_id || $id("party-join-id")?.value.trim();
  if (!id) throw new Error("No party to leave");
  await state.socket.leaveParty(id);
  state.party = null;
  renderParty();
  log("social", "Left party", { party_id: id });
}

async function sendPartyData() {
  const id = state.party?.party_id;
  const text = $id("party-text")?.value.trim();
  if (!id) throw new Error("Create or join a party first");
  if (!text) throw new Error("Enter party data");
  await state.socket.sendPartyData(id, 1, JSON.stringify({ text, from: state.session.user_id }));
  markFeature("party_data");
  log("social", "Sent party data", { party_id: id, text });
}

async function setStatus() {
  const text = $id("status-text")?.value.trim();
  await state.socket.updateStatus(text || undefined);
  markFeature("status_update");
  log("social", "Status updated", { status: text });
  toast("Status updated", "ok");
}

async function followUser() {
  const id = $id("follow-user-id")?.value.trim();
  if (!id) throw new Error("Enter a user ID to follow");
  const res = await state.socket.followUsers([id]);
  setVal("follow-user-id", id);
  markFeature("status_follow");
  log("social", "Following user status", { user_id: id, presences: res?.presences });
  setText("status-out", pretty(res));
}

async function unfollowUser() {
  const id = $id("follow-user-id")?.value.trim();
  if (!id) throw new Error("Enter a user ID to unfollow");
  await state.socket.unfollowUsers([id]);
  log("social", "Unfollowed user status", { user_id: id });
}

/* ------------------------------------------------------------------------- */
/* Socket event handlers                                                     */
/* ------------------------------------------------------------------------- */

function bindSocket(socket) {
  socket.ondisconnect = (evt) => {
    setConnection(false, "socket disconnected");
    log("error", "Nakama socket disconnected", { event: evt?.type || "disconnect" });
  };
  socket.onerror = (evt) => {
    log("error", "Nakama socket error", { event: evt?.type || "error" });
  };
  socket.onheartbeattimeout = () => {
    setConnection(false, "heartbeat timeout");
    log("error", "Nakama socket heartbeat timeout");
  };
  socket.onnotification = (notification) => {
    log("nakama", "Notification received", notification);
    refreshNotifications().catch(() => {});
  };
  socket.onchannelmessage = (message) => {
    const content = parseMaybe(message.content);
    const text = content && typeof content === "object" ? (content.text ?? JSON.stringify(content)) : String(content ?? "");
    const kind = channelKind(message.channel_id);
    if (!kind) {
      log("chat", `Message on channel ${shortId(message.channel_id)}`, { text, username: message.username });
      return;
    }
    appendMessage(kind, {
      username: message.username || "unknown",
      text,
      time: message.create_time,
      self: message.sender_id === state.session.user_id,
    });
    markFeature(kind === "global" ? "chat_global" : kind === "dm" ? "chat_dm" : "chat_group");
  };
  socket.onchannelpresence = (event) => {
    const name = (p) => p.username || shortId(p.user_id);
    const joins = (event.joins || []).map(name);
    const leaves = (event.leaves || []).map(name);
    setText("chat-presence", pretty({ channel: shortId(event.channel_id), joins, leaves, at: new Date().toISOString() }));
    log("chat", "Channel presence", { joins, leaves });
  };
  socket.onmatchdata = (data) => {
    const bytes = data.data instanceof Uint8Array ? data.data : new Uint8Array(data.data || []);
    let text = "";
    try { text = new TextDecoder().decode(bytes); } catch { /* ignore */ }
    if (state.relayMatchId && data.match_id === state.relayMatchId) {
      let parsed = text;
      try { parsed = JSON.parse(text); } catch { /* keep string */ }
      pushRelayEvent(`op ${data.op_code} from ${data.presence?.username || "server"}: ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`);
      markFeature("relay_match");
      log("game", "Relayed match data", { op_code: data.op_code, from: data.presence?.username, text: parsed });
    } else if (state.arenaMatchId && data.match_id === state.arenaMatchId) {
      let parsed = text;
      try { parsed = JSON.parse(text); } catch { /* keep string */ }
      const label = data.op_code === 1 ? "tick" : data.op_code === 2 ? "presence" : "echo";
      pushArenaEvent(`${label}: ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`);
      markFeature("arena_match");
    } else {
      log("game", "Match data received", { match_id: data.match_id, op_code: data.op_code, text });
    }
  };
  socket.onmatchpresence = (event) => {
    const label = (p) => p.username || shortId(p.user_id);
    log("game", "Match presence", {
      match_id: event.match_id,
      joins: (event.joins || []).map(label),
      leaves: (event.leaves || []).map(label),
    });
  };
  socket.onmatchmakerticket = (ticket) => {
    state.mmTicket = ticket.ticket;
    setText("mm-ticket", shortId(ticket.ticket));
    pushMatchmakerEvent(`ticket ${ticket.ticket}`);
    markFeature("matchmaker");
    log("nakama", "Matchmaker ticket", ticket);
  };
  socket.onmatchmakermatched = (matched) => {
    state.mmTicket = null;
    setText("mm-ticket", "matched");
    const self = matched.self?.presence || { user_id: state.session.user_id, username: state.session.username };
    // Nakama's matched payload includes the local user in `users` as well as
    // in `self`, so dedupe before rendering or deriving the game room.
    const others = (matched.users || [])
      .map((u) => u.presence)
      .filter((p) => p && p.user_id && p.user_id !== self.user_id);
    renderMatchmakerUsers([self, ...others]);
    pushMatchmakerEvent(`matched: ${[self, ...others].map((p) => p.username || p.user_id).join(", ")}`);
    markFeature("matchmaker_matched");
    log("nakama", "Matchmaker matched", { match_id: matched.match_id, users: [self, ...others] });
    const ids = [...new Set([self.user_id, ...others.map((p) => p.user_id)].filter(Boolean))];
    const room = deriveRoom(ids);
    toast("Opponent found! Connecting to Go game server…", "ok");
    connectGame("pvp", room, "matchmaker");
  };
  socket.onparty = (party) => {
    state.party = party;
    renderParty();
    log("social", "Party event", { party_id: party.party_id, presences: party.presences });
  };
  socket.onpartypresence = (event) => {
    if (state.party) {
      const joins = event.joins || [];
      const leaves = event.leaves || [];
      if (joins.length) {
        state.party.presences = [...(state.party.presences || []), ...joins];
        markFeature("party_join");
      }
      if (leaves.length) {
        const gone = new Set(leaves.map((p) => p.user_id));
        state.party.presences = (state.party.presences || []).filter((p) => !gone.has(p.user_id));
      }
      renderParty();
    }
    log("social", "Party presence", {
      joins: (event.joins || []).map((p) => p.username),
      leaves: (event.leaves || []).map((p) => p.username),
    });
  };
  socket.onpartydata = (event) => {
    let text = "";
    try { text = new TextDecoder().decode(event.data); } catch { /* ignore */ }
    log("social", "Party data received", { from: event.presence?.username, op_code: event.op_code, text });
    setText("party-out", pretty({ party_data: parseMaybe(text), from: event.presence }));
    markFeature("party_data");
  };
  socket.onpartyjoinrequest = async (event) => {
    log("social", "Party join request", event);
    if (!state.party || state.party.leader?.user_id !== state.session.user_id) return;
    for (const presence of event.presences || []) {
      try {
        await state.socket.acceptPartyMember(state.party.party_id, presence);
        markFeature("party_join");
        log("social", "Accepted party member", { username: presence.username });
      } catch (err) {
        log("error", "Accept party member failed", { message: errMsg(err) });
      }
    }
  };
  socket.onpartyclose = (event) => {
    log("social", "Party closed", event);
    state.party = null;
    renderParty();
  };
  socket.onpartyleader = (event) => {
    if (state.party) state.party.leader = event.presence;
    renderParty();
    log("social", "Party leader changed", event);
  };
  socket.onstatuspresence = (event) => {
    setText("status-out", pretty(event));
    markFeature("status_follow");
    log("social", "Status presence", {
      joins: (event.joins || []).map((p) => ({ username: p.username, status: p.status })),
      leaves: (event.leaves || []).map((p) => p.username),
    });
  };
}

function channelKind(channelId) {
  for (const [kind, channel] of Object.entries(state.channels)) {
    if (channel?.id === channelId) return kind;
  }
  return null;
}

/* ------------------------------------------------------------------------- */
/* Chat                                                                      */
/* ------------------------------------------------------------------------- */

function renderAllChats() {
  for (const kind of ["global", "dm", "group"]) renderMessages(kind);
}

function appendMessage(kind, message) {
  const list = state.messages[kind];
  if (!list) return;
  list.push(message);
  if (list.length > 100) list.shift();
  renderMessages(kind);
  log("chat", `${kind} message`, { from: message.username, text: message.text });
}

function renderMessages(kind) {
  const host = $id(`${kind}-messages`);
  if (!host) return;
  host.innerHTML = state.messages[kind].map((m) => `
    <div class="msg ${m.self ? "self" : ""}">
      <div class="msg-head"><b>${escapeHtml(m.username || "unknown")}</b><span>${escapeHtml(formatDate(m.time))}</span></div>
      <p>${escapeHtml(m.text)}</p>
    </div>`).join("");
  host.scrollTop = host.scrollHeight;
}

async function sendChat(kind, inputId, feature) {
  const channel = state.channels[kind];
  const input = $id(inputId);
  const text = input?.value.trim();
  if (!channel) throw new Error(`Join the ${kind} channel first`);
  if (!text) throw new Error("Type a message first");
  await state.socket.writeChatMessage(channel.id, { text });
  input.value = "";
  markFeature(feature);
  log("chat", `Sent ${kind} message`, { channel_id: channel.id, text });
}

async function joinDM() {
  let target = $id("dm-target")?.value.trim();
  if (!target) throw new Error("Enter a friend user ID");
  const channel = await state.socket.joinChat(target, 2, true, false);
  state.channels.dm = { id: channel.id, target };
  setVal("dm-target", target);
  setText("dm-channel-id", shortId(channel.id));
  markFeature("chat_dm");
  log("chat", "Joined direct message channel", { target, channel_id: channel.id });
  toast("DM channel joined", "ok");
}

async function joinGroupChat(id) {
  const groupId = id || $id("group-chat-id")?.value.trim();
  if (!groupId) throw new Error("Enter a group ID");
  const channel = await state.socket.joinChat(groupId, 3, true, false);
  state.channels.group = { id: channel.id, target: groupId };
  setVal("group-chat-id", groupId);
  setText("group-channel-id", shortId(channel.id));
  markFeature("chat_group");
  log("chat", "Joined group channel", { group_id: groupId, channel_id: channel.id });
  toast("Group channel joined", "ok");
}

async function loadHistory(kind) {
  const channel = state.channels[kind];
  if (!channel) throw new Error(`Join the ${kind} channel first`);
  const res = await state.client.listChannelMessages(state.session, channel.id, 50, false);
  state.messages[kind] = (res.messages || []).slice().reverse().map((m) => {
    const content = parseMaybe(m.content);
    return {
      username: m.username || "unknown",
      text: content && typeof content === "object" ? (content.text ?? JSON.stringify(content)) : String(content ?? ""),
      time: m.create_time,
      self: m.sender_id === state.session.user_id,
    };
  });
  renderMessages(kind);
  markFeature("chat_history");
  log("chat", `Loaded ${kind} channel history`, { count: state.messages[kind].length });
}

/* ------------------------------------------------------------------------- */
/* Relayed match + Nakama authoritative arena                                */
/* ------------------------------------------------------------------------- */

function pushRelayEvent(line) {
  state.relayEvents.push(line);
  if (state.relayEvents.length > 30) state.relayEvents.shift();
  setText("relay-log", state.relayEvents.join("\n"));
}

async function createRelayMatch() {
  const match = await state.socket.createMatch("showcase-relay");
  await state.socket.joinMatch(match.match_id);
  state.relayMatchId = match.match_id;
  setVal("relay-id", match.match_id);
  state.relayEvents = [`created relay match ${match.match_id}`, "waiting for another tab to join…"];
  setText("relay-log", state.relayEvents.join("\n"));
  markFeature("relay_match");
  log("game", "Created relayed match", match);
  toast("Relay room created", "ok");
}

async function joinRelayMatch() {
  const id = $id("relay-id")?.value.trim();
  if (!id) throw new Error("Enter a match ID");
  const match = await state.socket.joinMatch(id);
  state.relayMatchId = match.match_id || id;
  pushRelayEvent(`joined relay match ${state.relayMatchId}`);
  markFeature("relay_match");
  log("game", "Joined relayed match", { match_id: state.relayMatchId });
}

async function leaveRelayMatch() {
  if (!state.relayMatchId) return;
  await state.socket.leaveMatch(state.relayMatchId);
  pushRelayEvent(`left ${state.relayMatchId}`);
  state.relayMatchId = null;
}

async function sendRelayMessage() {
  if (!state.relayMatchId) throw new Error("Create or join a relay match first");
  const text = $id("relay-text")?.value.trim();
  if (!text) throw new Error("Enter a relay message");
  await state.socket.sendMatchState(state.relayMatchId, 1, JSON.stringify({ text, from: state.session.username }));
  pushRelayEvent(`sent: ${text}`);
  markFeature("relay_match");
}

function pushArenaEvent(line) {
  state.arenaEvents.push(line);
  if (state.arenaEvents.length > 40) state.arenaEvents.shift();
  setText("arena-log", state.arenaEvents.join("\n"));
}

async function createArena() {
  const res = await callRpc("showcase_create_arena", {});
  if (!res.match_id) throw new Error("No arena match ID returned");
  await joinArena(res.match_id);
  toast("Nakama authoritative arena joined", "ok");
}

async function joinArena(id) {
  const matchId = id || $id("arena-id")?.value.trim();
  if (!matchId) throw new Error("Enter an arena match ID");
  const match = await state.socket.joinMatch(matchId);
  state.arenaMatchId = match.match_id || matchId;
  setVal("arena-id", state.arenaMatchId);
  pushArenaEvent(`joined authoritative match ${state.arenaMatchId}`);
  markFeature("arena_match");
  log("nakama", "Joined Nakama authoritative arena", { match_id: state.arenaMatchId, authoritative: match.authoritative });
}

async function leaveArena() {
  if (!state.arenaMatchId) return;
  await state.socket.leaveMatch(state.arenaMatchId);
  pushArenaEvent(`left ${state.arenaMatchId}`);
  state.arenaMatchId = null;
}

async function sendArenaMessage() {
  if (!state.arenaMatchId) throw new Error("Join the arena first");
  const text = $id("arena-text")?.value.trim();
  if (!text) throw new Error("Enter an arena message");
  await state.socket.sendMatchState(state.arenaMatchId, 3, JSON.stringify({ text, from: state.session.username }));
  pushArenaEvent(`sent: ${text}`);
  markFeature("arena_match");
}

/* ------------------------------------------------------------------------- */
/* Matchmaker                                                                */
/* ------------------------------------------------------------------------- */

function deriveRoom(ids) {
  const seed = ["reaction", ...[...new Set(ids)].sort()].join("|");
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return "mm" + (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

function pushMatchmakerEvent(line) {
  const el = $id("mm-log");
  if (!el) return;
  const current = el.textContent === "—" ? "" : el.textContent;
  el.textContent = (current ? current + "\n" : "") + line;
  el.scrollTop = el.scrollHeight;
}

function renderMatchmakerUsers(users) {
  const host = $id("mm-users");
  if (!host) return;
  host.innerHTML = users.map((u) => `
    <div class="list-item">
      <div class="li-main"><strong>${escapeHtml(u.username || shortId(u.user_id))}</strong><span>${escapeHtml(u.user_id || "")}</span></div>
      <span class="tag">${u.user_id === state.session.user_id ? "you" : "matched"}</span>
    </div>`).join("");
}

async function findMatch() {
  if (state.mmTicket) {
    toast("Already searching. Cancel the current ticket first.", "err");
    return;
  }
  // Nakama will not match two users who are sitting in the same party. Leave
  // one first so the two-tab quick-match path is predictable.
  if (state.party) {
    try {
      await state.socket.leaveParty(state.party.party_id);
      log("social", "Left party before matchmaking", { party_id: state.party.party_id });
      state.party = null;
      renderParty();
    } catch (err) {
      log("error", "Could not leave party before matchmaking", { message: errMsg(err) });
    }
  }
  const ticket = await state.socket.addMatchmaker(
    "+properties.game_id:reaction-duel +properties.protocol_version:1 +properties.rules_version:1",
    2,
    2,
    {
      game: "reaction",
      game_id: "reaction-duel",
      client_version: "1.0.0",
      protocol_version: "1",
      rules_version: "1",
    },
    {},
  );
  state.mmTicket = ticket.ticket;
  setText("mm-ticket", shortId(ticket.ticket));
  pushMatchmakerEvent(`searching with ticket ${ticket.ticket}`);
  markFeature("matchmaker");
  log("nakama", "Matchmaker ticket created", ticket);
  toast("Searching for an opponent… open player 2 and click Find opponent", "ok");
}

async function cancelMatch() {
  if (!state.mmTicket) {
    toast("No active matchmaker ticket", "err");
    return;
  }
  await state.socket.removeMatchmaker(state.mmTicket);
  pushMatchmakerEvent(`cancelled ${state.mmTicket}`);
  state.mmTicket = null;
  setText("mm-ticket", "—");
  log("nakama", "Matchmaker ticket cancelled");
}

/* ------------------------------------------------------------------------- */
/* Game (Go authoritative)                                                   */
/* ------------------------------------------------------------------------- */

function gameUiReset(status = "Choose a mode") {
  setText("game-state", status);
  const tap = $id("tap-btn");
  if (tap) { tap.disabled = true; tap.querySelector("small").textContent = "wait for GO"; }
  setText("game-timer", "—");
  setText("game-opponent-name", "waiting");
  setText("game-opponent-id", "—");
  setText("game-room", "room —");
  const rematch = $id("game-rematch");
  if (rematch) rematch.disabled = true;
}

function connectGame(mode, room, source = "manual") {
  if (!state.session?.token) {
    toast("Not authenticated yet", "err");
    return;
  }
  disconnectGame(false);
  gameUiReset(mode === "bot" ? "Connecting to bot room…" : "Connecting to PvP room…");
  setText("game-room", `room ${room}`);
  setText("game-log", `connecting to Go game server · mode=${mode} · room=${room}${source ? ` · ${source}` : ""}`);
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const url = `${scheme}://${location.host}/go/ws?token=${encodeURIComponent(state.session.token)}&mode=${encodeURIComponent(mode)}&room=${encodeURIComponent(room)}`;
  let ws;
  try {
    ws = new WebSocket(url);
  } catch (err) {
    toast("WebSocket failed: " + errMsg(err), "err");
    return;
  }
  state.game = { ws, mode, room, self: null, players: [], status: "connecting", goAt: 0, result: null, pingAt: 0 };
  const logEl = $id("game-log");
  if (logEl) {
    delete logEl.dataset.lines;
    logEl.textContent = `connecting to Go game server · mode=${mode} · room=${room}${source ? ` · ${source}` : ""}`;
  }
  log("go", "Opening Go game WebSocket", { mode, room, source });

  const isCurrent = () => state.game?.ws === ws;

  ws.addEventListener("open", () => {
    if (!isCurrent()) return;
    appendGameLog("websocket open; waiting for authoritative hello");
    setText("game-state", "Handshaking with Go server…");
    state.gamePingTimer = setInterval(() => {
      if (isCurrent() && ws.readyState === WebSocket.OPEN) {
        state.game.pingAt = Date.now();
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 5000);
  });
  ws.addEventListener("message", (event) => {
    if (!isCurrent()) return;
    let msg;
    try { msg = JSON.parse(event.data); } catch {
      appendGameLog("non-JSON message: " + String(event.data).slice(0, 200));
      return;
    }
    handleGameMessage(msg);
  });
  ws.addEventListener("close", (event) => {
    // A new game may already own the shared state. Never let the old socket's
    // close event clear the new game's timers or overwrite its UI.
    if (!isCurrent()) return;
    clearInterval(state.gamePingTimer);
    clearInterval(state.gameTimer);
    state.game.status = "closed";
    setText("game-latency", "socket closed");
    appendGameLog(`socket closed (${event.code}${event.reason ? ": " + event.reason : ""})`);
    log("go", "Go game socket closed", { code: event.code, reason: event.reason });
    const tap = $id("tap-btn");
    if (tap) tap.disabled = true;
    setText("game-state", event.code === 1000 ? "Disconnected" : "Go server disconnected");
  });
  ws.addEventListener("error", () => {
    if (!isCurrent()) return;
    appendGameLog("websocket error");
    setText("game-latency", "socket error");
  });
}

function disconnectGame(reset = true) {
  clearInterval(state.gamePingTimer);
  clearInterval(state.gameTimer);
  if (state.game?.ws) {
    try { state.game.ws.close(1000, "leave"); } catch { /* ignore */ }
  }
  state.game = null;
  if (reset) gameUiReset("Choose a mode");
}

function handleGameMessage(msg) {
  const type = msg.type;
  if (!state.game) return;
  switch (type) {
    case "hello": {
      state.game.self = msg.self;
      state.game.players = msg.players || [];
      renderGamePlayers(msg.players || []);
      setText("game-state", msg.mode === "bot" ? "Connected · waiting for countdown" : "Connected · waiting for opponent");
      markFeature("go_game");
      if (msg.mode === "bot") markFeature("go_bot");
      if (msg.mode === "pvp") markFeature("go_private");
      appendGameLog(`hello: room=${msg.room} mode=${msg.mode} protocol=${msg.protocol}`);
      log("go", "Go game handshake", { room: msg.room, mode: msg.mode, self: msg.self });
      break;
    }
    case "waiting":
      renderGamePlayers(msg.players || []);
      setText("game-state", msg.need > 0 ? `Waiting for ${msg.need} more player${msg.need > 1 ? "s" : ""}…` : "Waiting for countdown…");
      setText("game-room", `room ${msg.room}`);
      appendGameLog("waiting: " + (msg.message || "waiting"));
      break;
    case "peer_joined":
      appendGameLog(`peer joined: ${msg.player?.display_name || msg.player?.username || "unknown"}`);
      log("go", "Peer joined", msg.player);
      break;
    case "peer_left":
      appendGameLog(`peer left: ${msg.player?.display_name || msg.player?.username || "unknown"}`);
      log("go", "Peer left", msg.player);
      break;
    case "countdown":
      renderGamePlayers(msg.players || []);
      setText("game-state", "Get ready…");
      appendGameLog("countdown: 3s");
      setText("game-timer", "3.0s");
      break;
    case "go": {
      state.game.goAt = msg.at;
      state.game.result = null;
      setText("game-state", "GO!");
      const tap = $id("tap-btn");
      if (tap) { tap.disabled = false; tap.querySelector("small").textContent = "tap now"; }
      const shell = document.querySelector(".game-shell");
      if (shell) { shell.classList.remove("flash"); void shell.offsetWidth; shell.classList.add("flash"); }
      appendGameLog("GO — tap enabled");
      log("go", "Round live", { at: msg.at });
      clearInterval(state.gameTimer);
      state.gameTimer = setInterval(() => {
        const ms = Date.now() - state.game.goAt;
        setText("game-timer", `${Math.max(0, ms)} ms (client clock)`);
      }, 31);
      break;
    }
    case "early":
      appendGameLog("early: " + (msg.message || "wait for GO"));
      toast(msg.message || "Wait for GO", "err");
      break;
    case "result": {
      clearInterval(state.gameTimer);
      setText("game-timer", "server verified");
      const tap = $id("tap-btn");
      if (tap) { tap.disabled = true; tap.querySelector("small").textContent = "round over"; }
      const rematch = $id("game-rematch");
      if (rematch) rematch.disabled = false;
      state.game.result = msg;
      const selfId = state.session.user_id;
      const selfMs = msg.times?.[selfId];
      const winnerId = msg.winner || "";
      const won = winnerId === selfId;
      const draw = !winnerId;
      setText("game-state", draw ? "Draw / timeout" : won ? "You win!" : "You lost");
      if (selfMs && (state.best == null || selfMs < state.best)) {
        state.best = selfMs;
        setText("game-best", `${selfMs} ms`);
        setText("stat-best", `${selfMs} ms`);
      }
      appendGameLog(`result: winner=${msg.winner_name || "none"} reason=${msg.reason || ""} times=${JSON.stringify(msg.times || {})}`);
      log("game", "Verified game result", msg);
      markFeature("game_result");
      markFeature("wallet_result");
      markFeature("leaderboard_result");
      if (selfMs) setText("game-timer", `${selfMs} ms · server measured`);
      toast(draw ? "Round ended in a draw" : won ? `You won in ${selfMs || "?"} ms` : "You lost — rematch?", won ? "ok" : "");
      setTimeout(() => {
        refreshAccount().catch(() => {});
        refreshLeaderboards().catch(() => {});
        refreshTournaments().catch(() => {});
        refreshNotifications().catch(() => {});
      }, 1200);
      break;
    }
    case "pong": {
      if (state.game.pingAt) setText("game-latency", `round-trip ${Date.now() - state.game.pingAt} ms`);
      break;
    }
    case "room_closed":
      setText("game-state", "Room closed");
      appendGameLog("room closed");
      break;
    case "error":
      appendGameLog("error: " + (msg.message || "unknown"));
      toast(msg.message || "Game server error", "err");
      break;
    default:
      appendGameLog(`message: ${JSON.stringify(msg)}`);
  }
}

function renderGamePlayers(players) {
  const selfId = state.session?.user_id;
  const self = players.find((p) => p.id === selfId);
  const opponent = players.find((p) => p.id !== selfId);
  if (self) {
    setText("game-self-name", self.display_name || self.username || "you");
    setText("game-self-id", shortId(self.id));
  }
  if (opponent) {
    setText("game-opponent-name", opponent.display_name || opponent.username || "opponent");
    setText("game-opponent-id", opponent.bot ? "Nakama bot" : shortId(opponent.id));
  } else {
    setText("game-opponent-name", "waiting");
    setText("game-opponent-id", "—");
  }
}

function appendGameLog(line) {
  const el = $id("game-log");
  if (!el) return;
  const previous = el.dataset.lines ? JSON.parse(el.dataset.lines) : [];
  previous.push(`[${new Date().toLocaleTimeString([], { hour12: false })}] ${line}`);
  while (previous.length > 40) previous.shift();
  el.dataset.lines = JSON.stringify(previous);
  el.textContent = previous.join("\n");
  el.scrollTop = el.scrollHeight;
}

function tapGame() {
  if (!state.game?.ws || state.game.ws.readyState !== WebSocket.OPEN) return;
  state.game.ws.send(JSON.stringify({ type: "tap" }));
  const tap = $id("tap-btn");
  if (tap) { tap.disabled = true; tap.querySelector("small").textContent = "tap sent"; }
  setText("game-state", "Tap sent — waiting for server arbitration");
  appendGameLog("tap sent");
}

function rematchGame() {
  if (!state.game?.ws || state.game.ws.readyState !== WebSocket.OPEN) return;
  state.game.ws.send(JSON.stringify({ type: "rematch" }));
  gameUiReset("Rematch requested…");
  appendGameLog("rematch requested");
}

async function createPrivateRoom() {
  const res = await fetch("/go/room-code").then((r) => r.json());
  if (!res.room) throw new Error("Go server did not return a room code");
  setVal("private-code", res.room);
  connectGame("pvp", res.room, "private room");
  toast(`Private room ${res.room} — share the code`, "ok");
  markFeature("go_private");
}

function playBot() {
  const room = "bot-" + Math.random().toString(36).slice(2, 9);
  connectGame("bot", room, "bot");
  markFeature("go_bot");
}

function joinPrivateRoom() {
  const room = $id("private-code")?.value.trim();
  if (!room) throw new Error("Enter a room code");
  connectGame("pvp", room, "private room");
}

/* ------------------------------------------------------------------------- */
/* Leaderboards                                                              */
/* ------------------------------------------------------------------------- */

async function refreshLeaderboards() {
  if (!state.session) return;
  const id = $id("leaderboard-select")?.value || state.leaderboardId;
  state.leaderboardId = id;
  const res = await state.client.listLeaderboardRecords(state.session, id, [], 20);
  const records = res.records || [];
  renderLeaderboard(records, id);
  markFeature("leaderboard_read");
  if (id === LB_FASTEST) {
    let own = records.find((r) => r.owner_id === state.session.user_id);
    if (!own) {
      try {
        const ownRes = await state.client.listLeaderboardRecords(state.session, id, [state.session.user_id], 1);
        own = ownRes.owner_records?.[0] || ownRes.records?.[0];
      } catch { /* no record yet */ }
    }
    if (own && own.score != null) {
      state.best = Number(own.score);
      setText("stat-best", `${state.best} ms`);
      setText("game-best", `${state.best} ms`);
    }
  }
}

function renderLeaderboard(records, id) {
  const host = $id("leaderboard-list");
  if (!host) return;
  if (!records.length) {
    host.innerHTML = '<div class="list-item"><span class="tag">No records yet — play a round.</span></div>';
    return;
  }
  host.innerHTML = records.map((record) => {
    const you = record.owner_id === state.session.user_id;
    const score = id === LB_FASTEST ? formatMs(record.score) : `${record.score} wins`;
    return `<div class="list-item">
      <div class="rank">#${record.rank ?? "—"}</div>
      <div class="li-main"><strong>${escapeHtml(record.username || shortId(record.owner_id))}${you ? ' <span class="tag">you</span>' : ""}</strong><span>${escapeHtml(record.owner_id || "")}</span></div>
      <div class="score">${escapeHtml(score)}</div>
    </div>`;
  }).join("");
}

async function submitDemoLeaderboard() {
  const id = $id("leaderboard-select")?.value || LB_FASTEST;
  const score = id === LB_FASTEST ? String(120 + Math.floor(Math.random() * 180)) : "1";
  await state.client.writeLeaderboardRecord(state.session, id, {
    score,
    subscore: "0",
    metadata: { source: "client_demo", at: new Date().toISOString() },
  });
  markFeature("leaderboard_write");
  log("nakama", "Leaderboard record written by client", { leaderboard_id: id, score });
  await refreshLeaderboards();
  toast("Leaderboard record submitted", "ok");
}

/* ------------------------------------------------------------------------- */
/* Tournaments                                                               */
/* ------------------------------------------------------------------------- */

async function refreshTournaments() {
  if (!state.session) return;
  const res = await state.client.listTournaments(state.session, 0, 127, 0, 0, 30);
  state.tournaments = res.tournaments || [];
  if (!state.tournaments.some((t) => t.id === state.tournamentId) && state.tournaments[0]) {
    state.tournamentId = state.tournaments[0].id;
  }
  renderTournaments();
  await refreshTournamentRecords();
}

function renderTournaments() {
  const host = $id("tournament-list");
  if (!host) return;
  if (!state.tournaments.length) {
    host.innerHTML = '<div class="list-item"><span class="tag">No tournaments — check seed.</span></div>';
    return;
  }
  host.innerHTML = state.tournaments.map((t) => {
    const selected = t.id === state.tournamentId;
    return `<div class="list-item">
      <div class="li-main"><strong>${escapeHtml(t.title || t.id)}${selected ? ' <span class="tag">selected</span>' : ""}</strong><span>${escapeHtml(t.id || "")} · next reset ${escapeHtml(formatUnix(t.next_reset))}</span></div>
      <div class="li-actions"><button class="btn ghost" data-action="select-tournament" data-id="${escapeHtml(t.id || "")}">select</button></div>
    </div>`;
  }).join("");
}

async function refreshTournamentRecords() {
  if (!state.session || !state.tournamentId) return;
  try {
    const res = await state.client.listTournamentRecords(state.session, state.tournamentId, [], 20);
    const records = res.records || [];
    const host = $id("tournament-records");
    if (host) {
      host.innerHTML = records.length ? records.map((r) => `
        <div class="list-item">
          <div class="rank">#${r.rank ?? "—"}</div>
          <div class="li-main"><strong>${escapeHtml(r.username || shortId(r.owner_id))}</strong><span>${escapeHtml(r.owner_id || "")}</span></div>
          <div class="score">${escapeHtml(r.score ?? "—")}</div>
        </div>`).join("") : '<div class="list-item"><span class="tag">No tournament records yet.</span></div>';
    }
  } catch (err) {
    log("error", "Tournament records failed", { message: errMsg(err) });
  }
}

async function joinSelectedTournament() {
  await state.client.joinTournament(state.session, state.tournamentId);
  markFeature("tournament_join");
  log("nakama", "Joined tournament", { tournament_id: state.tournamentId });
  await refreshTournaments();
  toast("Tournament joined", "ok");
}

async function submitDemoTournament() {
  const score = String(5000 + Math.floor(Math.random() * 4000));
  await state.client.writeTournamentRecord(state.session, state.tournamentId, {
    score,
    subscore: "0",
    metadata: { source: "client_demo", at: new Date().toISOString() },
  });
  markFeature("tournament_write");
  log("nakama", "Tournament record written by client", { tournament_id: state.tournamentId, score });
  await refreshTournamentRecords();
  toast("Tournament score submitted", "ok");
}

async function claimTournament() {
  const res = await callRpc("showcase_claim_tournament", {});
  markFeature("tournament_claim");
  log("nakama", "Tournament reward claimed", res);
  setText("economy-out", pretty(res));
  await refreshAccount();
  await refreshTournaments();
  toast("Tournament reward claimed", "ok");
}

/* ------------------------------------------------------------------------- */
/* Notifications                                                             */
/* ------------------------------------------------------------------------- */

async function refreshNotifications() {
  if (!state.session) return;
  const res = await state.client.listNotifications(state.session, 50);
  state.notifications = res.notifications || [];
  renderNotifications();
  markFeature("notifications_list");
}

function renderNotifications() {
  const host = $id("notification-list");
  if (!host) return;
  if (!state.notifications.length) {
    host.innerHTML = '<div class="list-item"><span class="tag">No notifications.</span></div>';
    return;
  }
  host.innerHTML = state.notifications.map((n) => {
    const content = parseMaybe(n.content);
    return `<div class="list-item">
      <div class="li-main"><strong>${escapeHtml(n.subject || "notification")}</strong><span>${escapeHtml(formatDate(n.create_time))} · code ${escapeHtml(n.code ?? "—")}</span><span>${escapeHtml(typeof content === "string" ? content : JSON.stringify(content))}</span></div>
    </div>`;
  }).join("");
}

async function deleteAllNotifications() {
  const ids = state.notifications.map((n) => n.id).filter(Boolean);
  if (!ids.length) { toast("No notifications to delete", "err"); return; }
  await state.client.deleteNotifications(state.session, ids);
  markFeature("notifications_delete");
  await refreshNotifications();
  toast("Notifications deleted", "ok");
  log("nakama", "Deleted notifications", { count: ids.length });
}

/* ------------------------------------------------------------------------- */
/* Economy                                                                   */
/* ------------------------------------------------------------------------- */

async function claimDaily() {
  const res = await callRpc("showcase_daily", {});
  markFeature("wallet_daily");
  setText("economy-out", pretty(res));
  log("nakama", "Daily bonus claimed", res);
  await refreshAccount();
  await refreshNotifications();
  toast("Daily bonus: +100 coins, +5 gems", "ok");
}

async function purchaseSkin() {
  const res = await callRpc("showcase_purchase", {});
  markFeature("wallet_purchase");
  setText("economy-out", pretty(res));
  log("nakama", "Purchased neon skin", res);
  await refreshAccount();
  await refreshInventory();
  await refreshNotifications();
  toast("Neon skin purchased", "ok");
}

async function sendTestNotification() {
  const res = await callRpc("showcase_notify", {});
  markFeature("notifications_send");
  log("nakama", "Sent test notification", res);
  setText("economy-out", pretty(res));
  await sleep(350);
  await refreshNotifications();
  toast("Notification sent", "ok");
}

/* ------------------------------------------------------------------------- */
/* Storage                                                                   */
/* ------------------------------------------------------------------------- */

async function writeStorage() {
  const collection = $id("storage-collection")?.value.trim();
  const key = $id("storage-key")?.value.trim();
  const raw = $id("storage-value")?.value.trim();
  if (!collection || !key) throw new Error("Collection and key are required");
  let value;
  try { value = JSON.parse(raw || "{}"); } catch { throw new Error("Storage value must be valid JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Storage value must be a JSON object");
  const acks = await state.client.writeStorageObjects(state.session, [{
    collection, key, value, permission_read: 1, permission_write: 1,
  }]);
  markFeature("storage_write");
  setText("storage-out", pretty(acks));
  log("nakama", "Storage object written", { collection, key });
  toast("Storage written", "ok");
}

async function readStorage() {
  const collection = $id("storage-collection")?.value.trim();
  const key = $id("storage-key")?.value.trim();
  const res = await state.client.readStorageObjects(state.session, {
    object_ids: [{ collection, key, user_id: state.session.user_id }],
  });
  markFeature("storage_read");
  setText("storage-out", pretty((res.objects || []).map((o) => ({ ...o, value: parseMaybe(o.value) }))));
  log("nakama", "Storage object read", { collection, key, count: (res.objects || []).length });
}

async function listStorage() {
  const collection = $id("storage-collection")?.value.trim();
  const res = await state.client.listStorageObjects(state.session, collection, state.session.user_id, 20);
  markFeature("storage_list");
  setText("storage-out", pretty((res.objects || []).map((o) => ({ ...o, value: parseMaybe(o.value) }))));
  log("nakama", "Storage collection listed", { collection, count: (res.objects || []).length });
}

async function deleteStorage() {
  const collection = $id("storage-collection")?.value.trim();
  const key = $id("storage-key")?.value.trim();
  await state.client.deleteStorageObjects(state.session, {
    object_ids: [{ collection, key, user_id: state.session.user_id }],
  });
  markFeature("storage_delete");
  setText("storage-out", `deleted ${collection}/${key}`);
  log("nakama", "Storage object deleted", { collection, key });
  toast("Storage deleted", "ok");
}

async function refreshPublicConfig() {
  try {
    const res = await state.client.listStorageObjects(state.session, "showcase", undefined, 10);
    const config = (res.objects || []).find((o) => o.key === "config");
    if (config) {
      const value = parseMaybe(config.value);
      setText("public-config", pretty({
        collection: config.collection,
        key: config.key,
        user_id: config.user_id,
        permission_read: config.permission_read,
        value,
      }));
      state.config = value;
      markFeature("storage_public");
    } else {
      setText("public-config", "No public config object found. Run showcase_seed.");
    }
  } catch (err) {
    setText("public-config", "Public config read failed: " + errMsg(err));
  }
}

async function refreshInventory() {
  try {
    const res = await state.client.listStorageObjects(state.session, "showcase_inventory", state.session.user_id, 10);
    const items = (res.objects || []).find((o) => o.key === "items");
    setText("inventory-out", items ? pretty(parseMaybe(items.value)) : "No inventory object yet. Buy the neon skin.");
  } catch (err) {
    setText("inventory-out", "Inventory read failed: " + errMsg(err));
  }
}

/* ------------------------------------------------------------------------- */
/* Health / ops                                                              */
/* ------------------------------------------------------------------------- */

async function refreshHealth() {
  const res = await fetch("/go/health", { headers: { Accept: "application/json" } });
  const health = await res.json();
  setText("stat-rooms", String(health.rooms ?? "—"));
  const host = $id("health-out");
  if (host) {
    host.innerHTML = Object.entries({
      gateway: health.ok ? "up" : "degraded",
      nakama: health.nakama,
      "nakama HTTP": String(health.nakama_status ?? "—"),
      "go rooms": String(health.rooms ?? "—"),
      "go players": String(health.players ?? "—"),
      uptime: health.uptime ?? "—",
    }).map(([key, val]) => `<div class="health-item"><span>${escapeHtml(key)}</span><strong class="${val === "up" ? "good" : val === "down" ? "bad" : ""}">${escapeHtml(val)}</strong></div>`).join("");
  }
  markFeature("healthcheck");
  markFeature("go_health");
}

async function listRooms() {
  const res = await fetch("/go/rooms", { headers: { Accept: "application/json" } });
  const data = await res.json();
  setText("rooms-out", pretty(data));
  log("go-server", "Listed Go rooms", data);
}

/* ------------------------------------------------------------------------- */
/* Account actions                                                           */
/* ------------------------------------------------------------------------- */

async function saveAccount() {
  const request = {
    display_name: $id("acct-display-name")?.value.trim() || "",
    avatar_url: $id("acct-avatar")?.value.trim() || "",
    lang_tag: $id("acct-lang")?.value.trim() || "",
    location: $id("acct-location")?.value.trim() || "",
    timezone: $id("acct-timezone")?.value.trim() || "",
  };
  await state.client.updateAccount(state.session, request);
  markFeature("account_update");
  await refreshAccount();
  log("nakama", "Account updated", request);
  toast("Account updated", "ok");
}

async function refreshSession() {
  const session = await state.client.sessionRefresh(state.session);
  state.session = session;
  markFeature("session_refresh");
  applySessionUI();
  log("nakama", "Session refreshed", { expires_at: session.expires_at });
  toast("Session refreshed", "ok");
  await connectSocket(session);
}

async function logout() {
  markFeature("session_logout");
  try {
    await state.client.sessionLogout(state.session, state.session.token, state.session.refresh_token);
  } catch (err) {
    log("error", "Logout request failed", { message: errMsg(err) });
  }
  sessionStorage.removeItem(CUSTOM_KEY);
  log("nakama", "Logged out; reloading device identity");
  location.reload();
}

async function customAuth() {
  const custom = $id("custom-id")?.value.trim();
  if (!custom) throw new Error("Enter a custom ID");
  sessionStorage.setItem(CUSTOM_KEY, custom);
  markFeature("auth_custom");
  toast("Custom identity stored; reloading…", "ok");
  setTimeout(() => location.reload(), 450);
}

async function emailAuth() {
  const email = $id("email")?.value.trim();
  const password = $id("password")?.value || "";
  if (!email || !password) throw new Error("Email and password are required");
  const session = await state.client.authenticateEmail(email, password, true);
  markFeature("auth_email");
  await switchSession(session, "email");
  log("nakama", "Email authentication succeeded", { email });
  toast("Email session active", "ok");
}

/* ------------------------------------------------------------------------- */
/* Event binding                                                             */
/* ------------------------------------------------------------------------- */

function bind(id, fn) {
  const el = $id(id);
  if (!el) { console.warn("Missing element", id); return; }
  el.addEventListener("click", async (event) => {
    event.preventDefault();
    if (el.dataset.busy === "1" || el.disabled) return;
    el.dataset.busy = "1";
    const wasDisabled = el.disabled;
    el.disabled = true;
    try {
      await fn(event);
    } catch (err) {
      console.error(err);
      toast(errMsg(err), "err");
      log("error", errMsg(err));
    } finally {
      delete el.dataset.busy;
      if (!wasDisabled) el.disabled = false;
    }
  });
}

function bindCore() {
  bind("btn-new-identity", () => {
    sessionStorage.removeItem(DEVICE_KEY);
    sessionStorage.removeItem(CUSTOM_KEY);
    location.reload();
  });
  bind("btn-player2", () => {
    window.open(location.origin + "/?new=1", "_blank", "noopener");
  });
  bind("btn-refresh-session", refreshSession);
  bind("btn-reconnect", async () => connectSocket(state.session));
  bind("btn-copy-token", () => copyText(state.session?.token));
  bind("btn-logout", logout);
  bind("btn-custom-auth", customAuth);
  bind("btn-email-auth", emailAuth);
  bind("btn-save-account", saveAccount);
  bind("btn-refresh-account", refreshAccount);

  bind("btn-add-friend", addFriend);
  bind("btn-list-friends", refreshFriends);
  bind("btn-copy-username", () => copyText(state.user?.username || state.session?.username));
  bind("btn-demo-group", joinDemoGroup);
  bind("btn-my-groups", refreshGroups);
  bind("btn-create-group", createGroup);
  bind("btn-join-group", () => joinGroupById());
  bind("btn-create-party", createParty);
  bind("btn-leave-party", leaveParty);
  bind("btn-join-party", joinParty);
  bind("btn-send-party", sendPartyData);
  bind("btn-set-status", setStatus);
  bind("btn-follow", followUser);
  bind("btn-unfollow", unfollowUser);

  bind("send-global", () => sendChat("global", "global-input", "chat_global"));
  bind("send-dm", () => sendChat("dm", "dm-input", "chat_dm"));
  bind("send-group", () => sendChat("group", "group-input", "chat_group"));
  bind("history-global", () => loadHistory("global"));
  bind("history-dm", () => loadHistory("dm"));
  bind("history-group", () => loadHistory("group"));
  bind("join-dm", joinDM);
  bind("join-group-chat", () => joinGroupChat());

  bind("relay-create", createRelayMatch);
  bind("relay-join", joinRelayMatch);
  bind("relay-leave", leaveRelayMatch);
  bind("relay-send", sendRelayMessage);
  bind("mm-find", findMatch);
  bind("mm-cancel", cancelMatch);
  bind("arena-create", createArena);
  bind("arena-join", () => joinArena());
  bind("arena-leave", leaveArena);
  bind("arena-send", sendArenaMessage);

  bind("hero-quick", findMatch);
  bind("game-quick", findMatch);
  bind("hero-bot", playBot);
  bind("game-bot", playBot);
  bind("game-private", createPrivateRoom);
  bind("game-join", joinPrivateRoom);
  bind("game-leave", () => disconnectGame(true));
  bind("game-rematch", rematchGame);
  $id("tap-btn")?.addEventListener("click", tapGame);

  bind("btn-daily", claimDaily);
  bind("btn-purchase", purchaseSkin);
  bind("btn-notify", sendTestNotification);
  bind("btn-lb-refresh", refreshLeaderboards);
  bind("btn-lb-demo", submitDemoLeaderboard);
  bind("btn-tournament-join", joinSelectedTournament);
  bind("btn-tournament-submit", submitDemoTournament);
  bind("btn-tournament-records", refreshTournamentRecords);
  bind("btn-tournament-claim", claimTournament);
  bind("btn-notifications-refresh", refreshNotifications);
  bind("btn-notifications-delete", deleteAllNotifications);

  bind("btn-storage-write", writeStorage);
  bind("btn-storage-read", readStorage);
  bind("btn-storage-list", listStorage);
  bind("btn-storage-delete", deleteStorage);
  bind("btn-public-config", refreshPublicConfig);
  bind("btn-inventory", refreshInventory);
  bind("btn-rpc-info", callShowcaseInfo);

  bind("btn-health", refreshHealth);
  bind("btn-rooms", listRooms);
  bind("btn-clear-ops-log", () => { state.events = []; renderLog(); });
  bind("clear-log", () => { state.events = []; renderLog(); });

  const lbSelect = $id("leaderboard-select");
  lbSelect?.addEventListener("change", () => {
    state.leaderboardId = lbSelect.value;
    refreshLeaderboards().catch((err) => toast(errMsg(err), "err"));
  });

  document.addEventListener("click", async (event) => {
    const copy = event.target.closest("[data-copy]");
    if (copy) {
      event.preventDefault();
      const target = copy.dataset.copy;
      let value = "";
      if (target === "head-userid" || target === "ops-userid") value = state.user?.id || state.session?.user_id;
      else if (target === "ops-username" || target === "head-username") value = state.user?.username || state.session?.username;
      else value = $id(target)?.textContent || "";
      await copyText(value);
      return;
    }

    const feature = event.target.closest("[data-feature][data-goto]");
    if (feature) {
      event.preventDefault();
      document.querySelector(feature.dataset.goto)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const action = event.target.closest("[data-action]");
    if (!action) return;
    event.preventDefault();
    const id = action.dataset.id;
    try {
      switch (action.dataset.action) {
        case "dm-friend":
          setVal("dm-target", id);
          await joinDM();
          $id("dm-target")?.scrollIntoView({ behavior: "smooth", block: "center" });
          break;
        case "accept-friend":
          await acceptFriend(id);
          break;
        case "delete-friend":
          await deleteFriend(id);
          break;
        case "leave-group":
          await leaveGroup(id);
          break;
        case "group-users":
          await showGroupUsers(id);
          break;
        case "group-chat":
          setVal("group-chat-id", id);
          await joinGroupChat(id);
          break;
        case "select-tournament":
          state.tournamentId = id;
          renderTournaments();
          await refreshTournamentRecords();
          break;
        default:
          log("error", "Unknown dynamic action", { action: action.dataset.action });
      }
    } catch (err) {
      toast(errMsg(err), "err");
      log("error", errMsg(err));
    }
  });

  // The console SPA needs its own origin, so /console redirects to :7351.
  // Mark the feature when the user takes that redirect.
  document.querySelectorAll('a[href="/console"]').forEach((link) => {
    link.addEventListener("click", () => markFeature("console"));
  });

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
    });
  });

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      document.querySelectorAll(".nav-link").forEach((l) => {
        l.classList.toggle("active", l.getAttribute("href") === "#" + entry.target.id);
      });
    }
  }, { rootMargin: "-20% 0px -70% 0px", threshold: 0 });
  document.querySelectorAll(".main section[id]").forEach((section) => observer.observe(section));
}

/* ------------------------------------------------------------------------- */
/* Start                                                                     */
/* ------------------------------------------------------------------------- */

async function start() {
  loadCoverage();
  renderFeatureGrid();
  renderCoverage();
  renderAllChats();
  renderParty();
  renderWallet();
  bindCore();
  log("app", "Showcase booting on " + location.origin);

  try {
    await bootAuth();
    log("app", "Showcase ready");
  } catch (err) {
    console.error(err);
    setConnection(false, "Nakama unavailable");
    setText("conn-text", "Nakama unavailable");
    toast("Boot failed: " + errMsg(err), "err");
    log("error", "Boot failed", { message: errMsg(err) });
  }

  setInterval(() => {
    if (document.visibilityState === "visible" && state.session) {
      refreshHealth().catch(() => {});
    }
  }, 15000);
}

start();
