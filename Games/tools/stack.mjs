#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import {
  access,
  appendFile,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createConnection } from "node:net";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import {
  canonicalService,
  parseDatabaseAddress,
  parseNakamaConfig,
  parsePositiveInteger,
} from "./lib/stack-config.mjs";

const GAMES_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const REPO_ROOT = path.dirname(GAMES_ROOT);
const HOME = os.homedir();
const PREFIX = process.env.PREFIX ?? "/data/data/com.termux/files/usr";
const SERVICES = ["postgres", "nakama", "web", "releases"];
const START_ORDER = ["postgres", "nakama", "web", "releases"];
const STOP_ORDER = [...START_ORDER].reverse();
const SERVICE_LABELS = {
  postgres: "PostgreSQL",
  nakama: "Nakama",
  web: "Launcher",
  releases: "Releases",
};
const SERVICE_LOGS = {
  postgres: "postgres.log",
  nakama: "nakama.log",
  web: "web.log",
  releases: "releases.log",
};
const CHESS_ENTRY = path.join(GAMES_ROOT, "launcher", "dist", "chess", "index.html");
const WEB_ENTRY = path.join(GAMES_ROOT, "launcher", "dist", "index.html");
const WEB_CATALOG = path.join(GAMES_ROOT, "launcher", "dist", "games.json");
const MODULE_SOURCE = path.join(GAMES_ROOT, "Chess", "server");
const RELEASE_MANIFEST = path.join(GAMES_ROOT, "releases", "release-manifest.json");

function fail(message) {
  throw new Error(message);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isExecutable(filePath) {
  try {
    await access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findExecutable(command, candidates = []) {
  if (command.includes(path.sep)) {
    return (await isExecutable(command)) ? command : undefined;
  }
  for (const candidate of candidates) {
    if (candidate && (await isExecutable(candidate))) {
      return candidate;
    }
  }
  const pathEntries = (process.env.PATH ?? "").split(path.delimiter);
  const names =
    process.platform === "win32" ? [`${command}.exe`, `${command}.cmd`] : [command];
  for (const entry of pathEntries) {
    if (entry.length === 0) {
      continue;
    }
    for (const name of names) {
      const candidate = path.join(entry, name);
      if (await isExecutable(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

function firstExisting(candidates) {
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (cause) {
    if (cause.code === "ENOENT") {
      return fallback;
    }
    throw cause;
  }
}

function integerFrom(value, fallback) {
  return parsePositiveInteger(value) ?? fallback;
}

function findNakamaConfig() {
  const explicit = process.env.MOONGAMES_NAKAMA_CONFIG;
  if (explicit !== undefined) {
    const resolved = path.resolve(explicit);
    if (!existsSync(resolved)) {
      fail(`Nakama config does not exist: ${resolved}`);
    }
    return resolved;
  }
  return firstExisting([
    path.join(HOME, "nakama", "nakama.yml"),
    path.join(HOME, "nakama", "local.yml"),
    path.join(REPO_ROOT, "nakama.yml"),
    path.join(REPO_ROOT, "local.yml"),
    path.join(GAMES_ROOT, "runtime", "nakama.yml"),
  ]);
}

function postgresDataCandidates() {
  return [
    process.env.MOONGAMES_PG_DATA,
    path.join(PREFIX, "var", "lib", "postgresql"),
    "/var/lib/postgresql/data",
    "/usr/local/var/postgres",
    "/opt/homebrew/var/postgres",
    path.join(HOME, ".local", "share", "postgresql"),
  ];
}

function postgresSocketCandidates() {
  return [
    process.env.MOONGAMES_PG_SOCKET,
    path.join(PREFIX, "var", "run", "postgresql"),
    "/var/run/postgresql",
    "/tmp",
  ];
}

function resolvePostgresDataDir() {
  const candidates = postgresDataCandidates();
  const explicit = process.env.MOONGAMES_PG_DATA;
  if (explicit) {
    return path.resolve(explicit);
  }
  return (
    candidates
      .slice(1)
      .find((candidate) => existsSync(path.join(candidate, "PG_VERSION"))) ??
    candidates[1]
  );
}

function resolvePostgresSocketDir() {
  const explicit = process.env.MOONGAMES_PG_SOCKET;
  if (explicit) {
    return path.resolve(explicit);
  }
  return (
    postgresSocketCandidates()
      .slice(1)
      .find((candidate) => existsSync(candidate)) ??
    path.join(PREFIX, "var", "run", "postgresql")
  );
}

async function loadSettings() {
  const stackRoot = path.resolve(
    process.env.MOONGAMES_STACK_DIR ?? path.join(GAMES_ROOT, "runtime", "stack"),
  );
  const logDir = path.join(stackRoot, "logs");
  const stateFile = path.join(stackRoot, "state.json");
  const modulesDir = path.resolve(
    process.env.MOONGAMES_NAKAMA_MODULES ??
      path.join(GAMES_ROOT, "runtime", "modules"),
  );
  const pgDataDir = resolvePostgresDataDir();
  const pgSocketDir = resolvePostgresSocketDir();
  const pgPort = integerFrom(process.env.MOONGAMES_PG_PORT, 5432);
  const pgHost = process.env.MOONGAMES_PG_HOST ?? "127.0.0.1";

  const configPath = findNakamaConfig();
  let config;
  if (configPath !== undefined) {
    try {
      config = parseNakamaConfig(await readFile(configPath, "utf8"));
    } catch (cause) {
      fail(
        `Could not read Nakama config ${configPath}: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    }
  }

  const socket = config?.socket ?? {};
  const consoleSection = config?.console ?? {};
  const runtime = config?.runtime ?? {};
  const database = config?.database ?? { addresses: [] };

  const nakamaPort = integerFrom(
    process.env.MOONGAMES_NAKAMA_PORT,
    integerFrom(socket.port, 7350),
  );
  const consolePort = integerFrom(
    process.env.MOONGAMES_CONSOLE_PORT,
    integerFrom(consoleSection.port, 7351),
  );
  const webPort = integerFrom(process.env.MOONGAMES_WEB_PORT, 4174);
  const releasesPort = integerFrom(process.env.MOONGAMES_RELEASES_PORT, 8099);

  const configuredDatabase =
    process.env.MOONGAMES_NAKAMA_DB ??
    database.addresses[0] ??
    `postgres@${pgHost}:${pgPort}/nakama`;

  const nakamaBinary =
    process.env.MOONGAMES_NAKAMA_BIN !== undefined
      ? path.resolve(process.env.MOONGAMES_NAKAMA_BIN)
      : await findExecutable("nakama", [
          path.join(REPO_ROOT, "nakama"),
          path.join(HOME, "nakama", "nakama"),
        ]);

  const pgCtl =
    process.env.MOONGAMES_PG_CTL ?? (await findExecutable("pg_ctl"));
  const pgIsReady =
    process.env.MOONGAMES_PG_ISREADY ?? (await findExecutable("pg_isready"));
  const psql = process.env.MOONGAMES_PSQL ?? (await findExecutable("psql"));
  const pnpm = process.env.MOONGAMES_PNPM ?? (await findExecutable("pnpm"));

  return {
    gamesRoot: GAMES_ROOT,
    repoRoot: REPO_ROOT,
    stackRoot,
    logDir,
    stateFile,
    modulesDir,
    moduleSource: MODULE_SOURCE,
    web: {
      host: process.env.MOONGAMES_WEB_HOST ?? "0.0.0.0",
      port: webPort,
      entry: WEB_ENTRY,
      catalog: WEB_CATALOG,
      logPath: path.join(logDir, SERVICE_LOGS.web),
    },
    releases: {
      host: process.env.MOONGAMES_RELEASES_HOST ?? "0.0.0.0",
      port: releasesPort,
      manifest: RELEASE_MANIFEST,
      logPath: path.join(logDir, SERVICE_LOGS.releases),
    },
    pg: {
      host: pgHost,
      port: pgPort,
      dataDir: pgDataDir,
      socketDir: pgSocketDir,
      logPath: path.join(logDir, SERVICE_LOGS.postgres),
      serverLog: path.join(pgDataDir, "server.log"),
      pgCtl,
      pgIsReady,
      psql,
    },
    nakama: {
      binary: nakamaBinary,
      configPath,
      config,
      dataDir:
        process.env.MOONGAMES_NAKAMA_DATA ??
        config?.dataDir ??
        path.join(HOME, "nakama", "data"),
      runtimePath: runtime.path,
      socketAddress: socket.address ?? "127.0.0.1",
      socketPort: nakamaPort,
      consoleAddress: consoleSection.address ?? "127.0.0.1",
      consolePort,
      consoleUsername:
        process.env.MOONGAMES_CONSOLE_USERNAME ?? consoleSection.username,
      consolePassword:
        process.env.MOONGAMES_CONSOLE_PASSWORD ?? consoleSection.password,
      serverKey: socket.serverKey,
      httpKey: runtime.httpKey,
      configuredDatabase,
      logPath: path.join(logDir, SERVICE_LOGS.nakama),
    },
    pnpm,
  };
}

function stateTemplate() {
  return { version: 1, services: {} };
}

async function loadState(settings) {
  const state = await readJson(settings.stateFile, stateTemplate());
  if (
    typeof state !== "object" ||
    state === null ||
    typeof state.services !== "object" ||
    state.services === null
  ) {
    console.warn(
      `warning: ignoring invalid stack state at ${settings.stateFile}`,
    );
    return stateTemplate();
  }
  return state;
}

async function saveState(settings, state) {
  await mkdir(settings.stackRoot, { recursive: true });
  const temporary = `${settings.stateFile}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`);
  await rename(temporary, settings.stateFile);
}

function stateEntry(state, service) {
  return state.services[service];
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return cause.code === "EPERM";
  }
}

function isGroupAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

function processIsAlive(entry) {
  return isPidAlive(entry?.pid) || isGroupAlive(entry?.pid);
}

async function terminateManaged(entry) {
  if (!processIsAlive(entry)) {
    return true;
  }
  const pid = entry.pid;
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      return !processIsAlive(entry);
    }
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (!processIsAlive(entry)) {
      return true;
    }
    await delay(200);
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // The process may have exited between checks.
    }
  }
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (!processIsAlive(entry)) {
      return true;
    }
    await delay(100);
  }
  return !processIsAlive(entry);
}

function spawnAndWait(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let settled = false;
    child.once("error", (cause) => {
      if (!settled) {
        settled = true;
        reject(cause);
      }
    });
    child.once("spawn", () => {
      if (!settled) {
        settled = true;
        resolve(child);
      }
    });
  });
}

async function startManaged(settings, state, service, options) {
  const logPath = options.logPath;
  await mkdir(settings.logDir, { recursive: true });
  await mkdir(path.dirname(logPath), { recursive: true });
  await appendFile(
    logPath,
    `\n[stack ${new Date().toISOString()}] starting ${service}\n`,
  );

  const descriptor = openSync(logPath, "a");
  let child;
  try {
    child = await spawnAndWait(options.command, options.args, {
      cwd: options.cwd ?? settings.gamesRoot,
      detached: true,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", descriptor, descriptor],
    });
    child.unref();
  } finally {
    closeSync(descriptor);
  }

  const entry = {
    pid: child.pid,
    managed: true,
    startedAt: new Date().toISOString(),
    log: logPath,
    command: options.displayCommand ?? options.command,
  };
  state.services[service] = entry;
  await saveState(settings, state);
  return entry;
}

function runForeground(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? GAMES_ROOT,
      env: { ...process.env, ...options.env },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            signal === null
              ? `${command} exited with code ${code}.`
              : `${command} exited after signal ${signal}.`,
          ),
        );
      }
    });
  });
}

async function httpStatus(url, timeout = 1600) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
    });
    return response.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

function pgReady(settings) {
  if (settings.pg.pgIsReady === undefined) {
    return false;
  }
  const result = spawnSync(
    settings.pg.pgIsReady,
    ["-h", settings.pg.host, "-p", String(settings.pg.port)],
    { encoding: "utf8", timeout: 3000 },
  );
  return result.status === 0;
}

function isPortOpen(host, port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(700);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function waitFor(label, predicate, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return true;
    }
    await delay(250);
  }
  console.warn(`warning: ${label} did not become ready within ${timeout}ms.`);
  return false;
}

function urlHost(host) {
  return host === "0.0.0.0" || host === "::" || host === "[::]"
    ? "127.0.0.1"
    : host;
}

function nakamaHealthUrl(settings) {
  return `http://${urlHost(settings.nakama.socketAddress)}:${settings.nakama.socketPort}/healthcheck`;
}

function consoleUrl(settings) {
  return `http://${urlHost(settings.nakama.consoleAddress)}:${settings.nakama.consolePort}/`;
}

function webUrl(settings, host = "localhost") {
  return `http://${host}:${settings.web.port}/`;
}

function chessUrl(settings, host = "localhost") {
  return `${webUrl(settings, host)}chess/`;
}

function releasesUrl(settings) {
  return `http://${urlHost(settings.releases.host)}:${settings.releases.port}/`;
}

async function releasesUp(settings) {
  const manifest = await httpStatus(
    `${releasesUrl(settings)}release-manifest.json`,
  );
  if (manifest === 200) {
    return true;
  }
  const root = await httpStatus(releasesUrl(settings));
  return root > 0 && root < 500;
}

async function serviceUp(settings, service) {
  switch (service) {
    case "postgres":
      return pgReady(settings);
    case "nakama":
      return (await httpStatus(nakamaHealthUrl(settings))) === 200;
    case "web":
      return (await httpStatus(webUrl(settings))) === 200;
    case "releases":
      return releasesUp(settings);
    default:
      return false;
  }
}

async function readPostmasterPid(settings) {
  try {
    const contents = await readFile(
      path.join(settings.pg.dataDir, "postmaster.pid"),
      "utf8",
    );
    const pid = Number(contents.split(/\r?\n/)[0]);
    return Number.isInteger(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
}

async function tailLog(filePath, lines = 40) {
  try {
    const contents = await readFile(filePath, "utf8");
    return contents.split(/\r?\n/).slice(-lines).join("\n").trimEnd();
  } catch (cause) {
    if (cause.code === "ENOENT") {
      return "";
    }
    throw cause;
  }
}

async function showLogHint(settings, service) {
  const filePath = path.join(settings.logDir, SERVICE_LOGS[service]);
  const tail = await tailLog(filePath);
  if (tail.length > 0) {
    console.error(`\nLast ${SERVICE_LABELS[service]} log lines (${filePath}):`);
    console.error(tail);
  }
}

async function syncModules(settings) {
  if (!(await exists(settings.moduleSource))) {
    fail(`Chess module directory is missing: ${settings.moduleSource}`);
  }
  const entries = await readdir(settings.moduleSource, { withFileTypes: true });
  const modules = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".lua"))
    .map((entry) => entry.name)
    .sort();
  if (modules.length === 0) {
    fail(`No Lua modules found in ${settings.moduleSource}`);
  }
  await mkdir(settings.modulesDir, { recursive: true });
  for (const module of modules) {
    await copyFile(
      path.join(settings.moduleSource, module),
      path.join(settings.modulesDir, module),
    );
  }
  console.log(
    `Synced ${modules.length} Lua module${modules.length === 1 ? "" : "s"} to ${settings.modulesDir}`,
  );
}

async function canConnectDatabase(settings, address) {
  const parsed = parseDatabaseAddress(address);
  if (parsed === undefined || settings.pg.psql === undefined) {
    return false;
  }
  const env = { ...process.env };
  if (parsed.password === undefined || parsed.password.length === 0) {
    delete env.PGPASSWORD;
  } else {
    env.PGPASSWORD = parsed.password;
  }
  const result = spawnSync(
    settings.pg.psql,
    [
      "-h",
      parsed.host,
      "-p",
      String(parsed.port),
      "-U",
      parsed.user ?? os.userInfo().username,
      "-d",
      parsed.database,
      "-w",
      "-Atqc",
      "SELECT 1",
    ],
    { encoding: "utf8", env, timeout: 5000 },
  );
  return result.status === 0;
}

async function resolveDatabaseAddress(settings) {
  const configured = settings.nakama.configuredDatabase;
  if (process.env.MOONGAMES_NAKAMA_DB !== undefined) {
    return { address: configured, configured, fallback: false, forced: true };
  }
  const parsed = parseDatabaseAddress(configured);
  const candidates = [configured];
  if (parsed !== undefined) {
    const local = `postgres@${parsed.host}:${parsed.port}/${parsed.database}`;
    if (!candidates.includes(local)) {
      candidates.push(local);
    }
    const osUser = os.userInfo().username;
    const userAddress = `${osUser}@${parsed.host}:${parsed.port}/${parsed.database}`;
    if (!candidates.includes(userAddress)) {
      candidates.push(userAddress);
    }
  }
  for (const candidate of candidates) {
    if (await canConnectDatabase(settings, candidate)) {
      return {
        address: candidate,
        configured,
        fallback: candidate !== configured,
        forced: false,
      };
    }
  }
  return {
    address: configured,
    configured,
    fallback: false,
    forced: false,
    unvalidated: true,
  };
}

async function ensureWebBuild(settings, options) {
  const required = [WEB_ENTRY, WEB_CATALOG, CHESS_ENTRY];
  const missing = [];
  for (const filePath of required) {
    if (!(await exists(filePath))) {
      missing.push(path.relative(GAMES_ROOT, filePath));
    }
  }

  if (options.noBuild && (options.build || missing.length > 0)) {
    if (missing.length > 0) {
      fail(
        `Web build is incomplete (${missing.join(", ")}). Run without --no-build or run pnpm build:web.`,
      );
    }
    fail("--build and --no-build cannot be used together.");
  }

  if (options.build || missing.length > 0) {
    if (missing.length > 0) {
      console.log(
        `Web build is incomplete (${missing.join(", ")}); building it now.`,
      );
    } else {
      console.log("Rebuilding the launcher and game bundles...");
    }
    if (settings.pnpm === undefined) {
      fail("pnpm was not found. Install pnpm or set MOONGAMES_PNPM.");
    }
    await runForeground(settings.pnpm, ["build:web"], { cwd: GAMES_ROOT });
  }
}

async function startPostgres(settings, state) {
  if (pgReady(settings)) {
    if (state.services.postgres === undefined) {
      console.log("PostgreSQL is already running.");
    } else {
      console.log("PostgreSQL is already running (managed).");
    }
    return;
  }
  if (settings.pg.pgCtl === undefined) {
    fail("pg_ctl was not found. Install PostgreSQL or set MOONGAMES_PG_CTL.");
  }
  if (!(await exists(path.join(settings.pg.dataDir, "PG_VERSION")))) {
    fail(
      `PostgreSQL data directory is not initialized: ${settings.pg.dataDir}`,
    );
  }

  await mkdir(settings.pg.socketDir, { recursive: true });
  await mkdir(settings.logDir, { recursive: true });
  const result = spawnSync(
    settings.pg.pgCtl,
    [
      "-D",
      settings.pg.dataDir,
      "-l",
      settings.pg.logPath,
      "-o",
      `-p ${settings.pg.port} -h ${settings.pg.host} -k ${settings.pg.socketDir}`,
      "start",
    ],
    { encoding: "utf8" },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (output.length > 0) {
    console.log(output);
  }
  if (result.status !== 0) {
    await showLogHint(settings, "postgres");
    fail("PostgreSQL failed to start.");
  }
  if (!(await waitFor("PostgreSQL", () => pgReady(settings), 20_000))) {
    await showLogHint(settings, "postgres");
    fail("PostgreSQL did not become ready.");
  }

  const pid = await readPostmasterPid(settings);
  state.services.postgres = {
    pid,
    managed: true,
    startedAt: new Date().toISOString(),
    log: settings.pg.logPath,
    command: "pg_ctl",
  };
  await saveState(settings, state);
  console.log(`PostgreSQL started on ${settings.pg.host}:${settings.pg.port}.`);
}

async function stopPostgres(settings, state, options) {
  const managed = state.services.postgres !== undefined;
  if (!(await pgReady(settings))) {
    delete state.services.postgres;
    await saveState(settings, state);
    return;
  }
  if (options.keepDb) {
    console.log("PostgreSQL left running (--keep-db).");
    return;
  }
  if (!managed && !options.all) {
    console.log(
      "PostgreSQL is running outside the managed stack; leaving it running (use --all to stop it).",
    );
    return;
  }
  if (settings.pg.pgCtl === undefined) {
    fail("pg_ctl was not found. Install PostgreSQL or set MOONGAMES_PG_CTL.");
  }
  const result = spawnSync(
    settings.pg.pgCtl,
    ["-D", settings.pg.dataDir, "stop", "-m", "fast"],
    { encoding: "utf8" },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (output.length > 0) {
    console.log(output);
  }
  if (result.status !== 0 && (await pgReady(settings))) {
    fail("PostgreSQL failed to stop.");
  }
  delete state.services.postgres;
  await saveState(settings, state);
  console.log("PostgreSQL stopped.");
}

async function startNakama(settings, state) {
  if (await serviceUp(settings, "nakama")) {
    console.log("Nakama is already healthy.");
    return;
  }
  if (settings.nakama.binary === undefined) {
    fail(
      "Nakama binary was not found. Set MOONGAMES_NAKAMA_BIN or place it at the repository root.",
    );
  }
  if (!(await isExecutable(settings.nakama.binary))) {
    fail(`Nakama binary is not executable: ${settings.nakama.binary}`);
  }
  if (settings.nakama.configPath === undefined) {
    fail(
      "Nakama config was not found. Set MOONGAMES_NAKAMA_CONFIG or place nakama.yml in ~/nakama/.",
    );
  }

  const existing = stateEntry(state, "nakama");
  if (processIsAlive(existing)) {
    console.log("Nakama process is running; waiting for health...");
    if (!(await waitFor("Nakama", () => serviceUp(settings, "nakama"), 15_000))) {
      await showLogHint(settings, "nakama");
      fail("Nakama is running but not healthy. Run pnpm stack restart nakama.");
    }
    return;
  }
  if (await isPortOpen(urlHost(settings.nakama.socketAddress), settings.nakama.socketPort)) {
    fail(
      `Nakama port ${settings.nakama.socketPort} is already in use by another process.`,
    );
  }

  await syncModules(settings);
  await mkdir(settings.nakama.dataDir, { recursive: true });

  const database = await resolveDatabaseAddress(settings);
  if (database.fallback) {
    const parsed = parseDatabaseAddress(database.address);
    console.log(
      `Using PostgreSQL role "${parsed?.user ?? "unknown"}" for Nakama (configured role was unavailable).`,
    );
  }
  if (database.unvalidated) {
    console.warn(
      "warning: could not validate the Nakama database role; trying the configured address.",
    );
  }

  const args = [
    "--config",
    settings.nakama.configPath,
    "--runtime.path",
    settings.modulesDir,
  ];
  if (database.address !== database.configured) {
    args.push("--database.address", database.address);
  }

  await startManaged(settings, state, "nakama", {
    command: settings.nakama.binary,
    args,
    logPath: settings.nakama.logPath,
    displayCommand: "nakama",
  });

  if (!(await waitFor("Nakama", () => serviceUp(settings, "nakama"), 30_000))) {
    const entry = stateEntry(state, "nakama");
    if (entry !== undefined) {
      await terminateManaged(entry);
      delete state.services.nakama;
      await saveState(settings, state);
    }
    await showLogHint(settings, "nakama");
    fail("Nakama failed to become healthy.");
  }
  console.log(
    `Nakama started on ${settings.nakama.socketAddress}:${settings.nakama.socketPort}.`,
  );
}

async function stopNakama(settings, state) {
  const entry = stateEntry(state, "nakama");
  if (entry === undefined) {
    if (await serviceUp(settings, "nakama")) {
      console.log(
        "Nakama is running outside the managed stack; stopping it requires a manual restart.",
      );
    }
    return;
  }
  if (!processIsAlive(entry)) {
    delete state.services.nakama;
    await saveState(settings, state);
    return;
  }
  const stopped = await terminateManaged(entry);
  delete state.services.nakama;
  await saveState(settings, state);
  if (!stopped) {
    await showLogHint(settings, "nakama");
    fail("Nakama did not stop cleanly.");
  }
  console.log("Nakama stopped.");
}

async function startWeb(settings, state, options) {
  if (await serviceUp(settings, "web")) {
    console.log("Launcher is already running.");
    return;
  }
  await ensureWebBuild(settings, options);
  if (settings.pnpm === undefined) {
    fail("pnpm was not found. Install pnpm or set MOONGAMES_PNPM.");
  }
  if (await isPortOpen("127.0.0.1", settings.web.port)) {
    fail(`Web port ${settings.web.port} is already in use by another process.`);
  }

  await startManaged(settings, state, "web", {
    command: settings.pnpm,
    args: [
      "--filter",
      "@moongames/launcher",
      "exec",
      "vite",
      "preview",
      "--host",
      settings.web.host,
      "--port",
      String(settings.web.port),
      "--strictPort",
    ],
    logPath: settings.web.logPath,
    displayCommand: "vite preview",
  });

  if (!(await waitFor("Launcher", () => serviceUp(settings, "web"), 20_000))) {
    await stopService(settings, state, "web", { all: false, quiet: true });
    await showLogHint(settings, "web");
    fail("Launcher failed to start.");
  }
  console.log(`Launcher started at ${webUrl(settings)}.`);
}

async function stopWeb(settings, state, options) {
  await stopManagedService(settings, state, "web");
}

async function stopManagedService(settings, state, service, options = {}) {
  const entry = stateEntry(state, service);
  if (entry === undefined) {
    if (await serviceUp(settings, service)) {
      if (!options.quiet) {
        console.log(
          `${SERVICE_LABELS[service]} is running outside the managed stack; not stopping it.`,
        );
      }
    }
    return;
  }
  if (!processIsAlive(entry)) {
    delete state.services[service];
    await saveState(settings, state);
    return;
  }
  const stopped = await terminateManaged(entry);
  delete state.services[service];
  await saveState(settings, state);
  if (!stopped) {
    await showLogHint(settings, service);
    fail(`${SERVICE_LABELS[service]} did not stop cleanly.`);
  }
  if (!options.quiet) {
    console.log(`${SERVICE_LABELS[service]} stopped.`);
  }
}

async function startReleases(settings, state) {
  if (await serviceUp(settings, "releases")) {
    console.log("Release server is already running.");
    return;
  }
  if (await isPortOpen("127.0.0.1", settings.releases.port)) {
    fail(
      `Release port ${settings.releases.port} is already in use by another process.`,
    );
  }
  await startManaged(settings, state, "releases", {
    command: process.execPath,
    args: [
      path.join(GAMES_ROOT, "tools", "serve-releases.mjs"),
      "--host",
      settings.releases.host,
      "--port",
      String(settings.releases.port),
    ],
    logPath: settings.releases.logPath,
    displayCommand: "serve-releases",
  });
  if (!(await waitFor("Release server", () => serviceUp(settings, "releases"), 15_000))) {
    await stopManagedService(settings, state, "releases", { quiet: true });
    await showLogHint(settings, "releases");
    fail("Release server failed to start.");
  }
  if (!(await exists(settings.releases.manifest))) {
    console.warn(
      "warning: releases/release-manifest.json is missing; the release server is up but has no manifest to serve.",
    );
  }
  console.log(`Release server started at ${releasesUrl(settings)}.`);
}

async function stopReleases(settings, state) {
  await stopManagedService(settings, state, "releases");
}

function resolveServices(names, addDependencies = false) {
  if (names.length === 0) {
    return new Set(SERVICES);
  }
  const selected = new Set();
  for (const name of names) {
    const service = canonicalService(name);
    if (service === undefined) {
      fail(
        `Unknown service "${name}". Use postgres, nakama, web, or releases.`,
      );
    }
    if (service === "all") {
      return new Set(SERVICES);
    }
    selected.add(service);
  }
  if (addDependencies && selected.has("nakama")) {
    selected.add("postgres");
  }
  return selected;
}

async function startService(settings, state, service, options) {
  switch (service) {
    case "postgres":
      return startPostgres(settings, state);
    case "nakama":
      return startNakama(settings, state);
    case "web":
      return startWeb(settings, state, options);
    case "releases":
      return startReleases(settings, state);
    default:
      fail(`Unknown service "${service}".`);
  }
}

async function stopService(settings, state, service, options) {
  switch (service) {
    case "postgres":
      return stopPostgres(settings, state, options);
    case "nakama":
      return stopNakama(settings, state);
    case "web":
      return stopWeb(settings, state, options);
    case "releases":
      return stopReleases(settings, state, options);
    default:
      fail(`Unknown service "${service}".`);
  }
}

async function startSelected(settings, state, names, options) {
  const selected = resolveServices(names, true);
  if (selected.has("web")) {
    await ensureWebBuild(settings, options);
  }
  for (const service of START_ORDER) {
    if (selected.has(service)) {
      await startService(settings, state, service, options);
    }
  }
}

async function stopSelected(settings, state, names, options) {
  const selected = resolveServices(names);
  for (const service of STOP_ORDER) {
    if (selected.has(service)) {
      await stopService(settings, state, service, options);
    }
  }
}

async function commandStart(settings, state, names, options) {
  await startSelected(settings, state, names, options);
  await printStatus(settings, state, false);
  console.log("");
  printUrls(settings);
  console.log("");
  printCredentials(settings);
}

async function commandStop(settings, state, names, options) {
  await stopSelected(settings, state, names, options);
  await printStatus(settings, state, false);
}

async function commandRestart(settings, state, names, options) {
  const selected = [...resolveServices(names)];
  await stopSelected(settings, state, selected, options);
  await startSelected(settings, state, selected, options);
  await printStatus(settings, state, false);
  console.log("");
  printUrls(settings);
}

async function commandSync(settings, state, options) {
  await syncModules(settings);
  if (options.noRestart) {
    return;
  }
  if (!(await serviceUp(settings, "nakama"))) {
    return;
  }
  if (state.services.nakama === undefined) {
    console.log(
      "Nakama is running outside the managed stack; restart it to load the synced modules.",
    );
    return;
  }
  console.log("Restarting Nakama to load the synced modules...");
  await stopNakama(settings, state);
  await startNakama(settings, state);
}

async function commandBuild(settings) {
  if (settings.pnpm === undefined) {
    fail("pnpm was not found. Install pnpm or set MOONGAMES_PNPM.");
  }
  await runForeground(settings.pnpm, ["build:web"], { cwd: GAMES_ROOT });
}

function ipv4Addresses() {
  const addresses = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (
        entry.family === "IPv4" &&
        !entry.internal &&
        !entry.address.startsWith("127.")
      ) {
        addresses.push(entry.address);
      }
    }
  }
  return [...new Set(addresses)];
}

function bindIncludesLan(address) {
  return address === "0.0.0.0" || address === "::" || address === "[::]";
}

function printUrls(settings) {
  console.log("MoonGames URLs");
  console.log(`  Launcher:      ${webUrl(settings, "localhost")}`);
  console.log(`  Chess:         ${chessUrl(settings, "localhost")}`);
  console.log(
    `  Host preview:  ${chessUrl(settings, "localhost")}?hostPreview=1`,
  );
  console.log(`  Nakama API:    http://${urlHost(settings.nakama.socketAddress)}:${settings.nakama.socketPort}`);
  console.log(`  Console:       ${consoleUrl(settings)}`);
  console.log(`  Releases:      ${releasesUrl(settings)}`);
  if (bindIncludesLan(settings.web.host)) {
    for (const address of ipv4Addresses()) {
      console.log(`  LAN menu:      ${webUrl(settings, address)}`);
    }
  }
  if (
    bindIncludesLan(settings.nakama.socketAddress) &&
    bindIncludesLan(settings.nakama.consoleAddress)
  ) {
    for (const address of ipv4Addresses()) {
      console.log(
        `  LAN API:       http://${address}:${settings.nakama.socketPort}`,
      );
      console.log(
        `  LAN console:   http://${address}:${settings.nakama.consolePort}/`,
      );
    }
  } else {
    console.log(
      "  Note:          Nakama is bound to loopback; online play from another device needs a LAN bind.",
    );
  }
}

function printCredentials(settings) {
  console.log("Nakama console credentials");
  console.log(`  URL:      ${consoleUrl(settings)}`);
  console.log(`  Username: ${settings.nakama.consoleUsername ?? "(not configured)"}`);
  console.log(`  Password: ${settings.nakama.consolePassword ?? "(not configured)"}`);
  console.log(`  Server key: ${settings.nakama.serverKey ?? "(not configured)"}`);
  if (settings.nakama.httpKey !== undefined) {
    console.log(`  HTTP key:   ${settings.nakama.httpKey}`);
  }
}

async function collectStatus(settings, state) {
  const pgPid = await readPostmasterPid(settings);
  const rows = [];
  for (const service of SERVICES) {
    const entry = stateEntry(state, service);
    const up = await serviceUp(settings, service);
    let url;
    if (service === "postgres") {
      url = `${settings.pg.host}:${settings.pg.port}`;
    } else if (service === "nakama") {
      url = nakamaHealthUrl(settings);
    } else if (service === "web") {
      url = webUrl(settings);
    } else {
      url = releasesUrl(settings);
    }
    rows.push({
      service,
      label: SERVICE_LABELS[service],
      up,
      pid: service === "postgres" ? pgPid : entry?.pid,
      managed: entry?.managed === true,
      url,
      log: service === "postgres" ? settings.pg.logPath : entry?.log,
    });
  }
  rows.splice(2, 0, {
    service: "console",
    label: "Nakama console",
    up: (await httpStatus(consoleUrl(settings))) === 200,
    pid: undefined,
    managed: state.services.nakama?.managed === true,
    url: consoleUrl(settings),
    log: settings.nakama.logPath,
  });
  return rows;
}

async function printStatus(settings, state, json) {
  const rows = await collectStatus(settings, state);
  if (json) {
    console.log(JSON.stringify({ services: rows }, null, 2));
    return;
  }
  console.log("MoonGames stack status");
  console.log(
    `${"SERVICE".padEnd(15)} ${"STATE".padEnd(9)} ${"PID".padEnd(9)} ${"MANAGED".padEnd(9)} URL`,
  );
  for (const row of rows) {
    const stateLabel = row.up ? "up" : "down";
    const pid = row.pid === undefined ? "-" : String(row.pid);
    const managed = row.managed ? "yes" : "no";
    console.log(
      `${row.label.padEnd(15)} ${stateLabel.padEnd(9)} ${pid.padEnd(9)} ${managed.padEnd(9)} ${row.url}`,
    );
  }
}

async function commandStatus(settings, state, json) {
  await printStatus(settings, state, json);
}

async function commandLogs(settings, state, name, options) {
  let service = name === undefined ? undefined : canonicalService(name);
  if (name !== undefined && service === undefined) {
    fail(`Unknown service "${name}". Use postgres, nakama, web, or releases.`);
  }
  if (service === "all") {
    service = undefined;
  }
  const selected = service === undefined ? SERVICES : [service];
  if (options.follow && selected.length > 1) {
    fail("Choose one service when using --follow.");
  }
  for (const current of selected) {
    const entry = stateEntry(state, current);
    const filePath =
      entry?.log ??
      (current === "web"
        ? settings.web.logPath
        : current === "releases"
          ? settings.releases.logPath
          : current === "postgres"
            ? settings.pg.logPath
            : settings.nakama.logPath);
    console.log(`\n--- ${SERVICE_LABELS[current]} (${filePath}) ---`);
    if (!(await exists(filePath))) {
      console.log("No log file yet.");
      continue;
    }
    if (options.follow) {
      await new Promise((resolve, reject) => {
        const child = spawn(
          "tail",
          ["-n", String(options.lines), "-f", filePath],
          { stdio: "inherit" },
        );
        child.once("error", reject);
        child.once("exit", resolve);
      });
    } else {
      const output = await tailLog(filePath, options.lines);
      console.log(output.length === 0 ? "(empty)" : output);
    }
  }
}

async function commandDoctor(settings) {
  console.log("MoonGames stack doctor");
  console.log(`  Node:             ${process.version}`);
  console.log(
    `  pnpm:             ${settings.pnpm ?? "MISSING"}`,
  );
  console.log(
    `  pg_ctl:           ${settings.pg.pgCtl ?? "MISSING"}`,
  );
  console.log(
    `  pg_isready:       ${settings.pg.pgIsReady ?? "MISSING"}`,
  );
  console.log(
    `  psql:             ${settings.pg.psql ?? "MISSING (role validation disabled)"}`,
  );
  console.log(`  PostgreSQL data:  ${settings.pg.dataDir}`);
  console.log(`  PostgreSQL socket: ${settings.pg.socketDir}`);
  console.log(`  Nakama binary:    ${settings.nakama.binary ?? "MISSING"}`);
  console.log(`  Nakama config:    ${settings.nakama.configPath ?? "MISSING"}`);
  console.log(`  Nakama data:      ${settings.nakama.dataDir}`);
  console.log(`  Nakama modules:   ${settings.modulesDir}`);
  console.log(`  Launcher build:   ${(await exists(WEB_ENTRY)) ? "ready" : "MISSING"}`);
  console.log(
    `  Release manifest: ${(await exists(RELEASE_MANIFEST)) ? "ready" : "MISSING (release server will still start)"}`,
  );
  const required = [
    ["pnpm", settings.pnpm],
    ["pg_ctl", settings.pg.pgCtl],
    ["pg_isready", settings.pg.pgIsReady],
    [
      "Nakama binary",
      settings.nakama.binary !== undefined &&
      (await isExecutable(settings.nakama.binary))
        ? settings.nakama.binary
        : undefined,
    ],
    ["Nakama config", settings.nakama.configPath],
    [
      "PostgreSQL data",
      (await exists(path.join(settings.pg.dataDir, "PG_VERSION")))
        ? settings.pg.dataDir
        : undefined,
    ],
  ];
  const missing = required.filter(([, value]) => value === undefined);
  if (missing.length > 0) {
    console.log("");
    console.log("Missing prerequisites:");
    for (const [label] of missing) {
      console.log(`  - ${label}`);
    }
    process.exitCode = 1;
  }
}

function usage() {
  console.log(`Usage: pnpm stack <command> [services...] [options]

Manage the local MoonGames full stack: PostgreSQL, Nakama, the launcher
preview, and the signed-release server.

Commands:
  start [services...]     Start the stack (builds the web bundle if needed)
  stop [services...]      Stop managed services
  restart [services...]   Restart services
  status [--json]         Show service health, PIDs, and URLs
  urls                    Show local and LAN URLs
  credentials             Show Nakama console credentials
  logs [service]          Show recent logs; add --follow to stream
  sync                    Copy Lua modules and restart Nakama
  build                   Build the launcher and game bundles
  doctor                  Check local prerequisites
  help                    Show this help

Services:
  postgres (db), nakama (api), web (launcher), releases
  Omit services to operate on all of them.

Options:
  --build              Force a web rebuild before starting
  --no-build           Never build automatically
  --all                Stop PostgreSQL even if it was already running
  --keep-db            Leave PostgreSQL running when stopping
  --follow, -f         Follow a service log
  --lines <n>          Number of log lines to show (default: 80)
  --json               Print status as JSON
  --no-restart         Copy modules without restarting Nakama
  --help, -h           Show this help

Environment:
  MOONGAMES_NAKAMA_CONFIG   Nakama config path
  MOONGAMES_NAKAMA_BIN      Nakama binary path
  MOONGAMES_NAKAMA_DB       Nakama database address override
  MOONGAMES_NAKAMA_DATA     Nakama data directory
  MOONGAMES_NAKAMA_MODULES  Nakama Lua module directory
  MOONGAMES_PG_DATA         PostgreSQL data directory
  MOONGAMES_PG_SOCKET       PostgreSQL socket directory
  MOONGAMES_PG_PORT         PostgreSQL port (default: 5432)
  MOONGAMES_PG_HOST         PostgreSQL host (default: 127.0.0.1)
  MOONGAMES_NAKAMA_PORT     Nakama socket port (default: 7350)
  MOONGAMES_CONSOLE_PORT    Nakama console port (default: 7351)
  MOONGAMES_CONSOLE_USERNAME  Nakama console username override
  MOONGAMES_CONSOLE_PASSWORD  Nakama console password override
  MOONGAMES_WEB_PORT        Launcher port (default: 4174)
  MOONGAMES_RELEASES_PORT   Release server port (default: 8099)
  MOONGAMES_WEB_HOST        Launcher bind address (default: 0.0.0.0)
  MOONGAMES_RELEASES_HOST   Release bind address (default: 0.0.0.0)
  MOONGAMES_PNPM            pnpm executable
  MOONGAMES_PG_CTL          pg_ctl executable
  MOONGAMES_PG_ISREADY      pg_isready executable
  MOONGAMES_PSQL            psql executable
  MOONGAMES_STACK_DIR       Stack state/log directory (default: runtime/stack)
`);
}

function parseOptions() {
  const { values, positionals } = parseArgs({
    options: {
      help: { type: "boolean", short: "h", default: false },
      json: { type: "boolean", default: false },
      follow: { type: "boolean", short: "f", default: false },
      lines: { type: "string" },
      build: { type: "boolean", default: false },
      "no-build": { type: "boolean", default: false },
      all: { type: "boolean", default: false },
      "keep-db": { type: "boolean", default: false },
      "no-restart": { type: "boolean", default: false },
    },
    allowPositionals: true,
  });
  const [command = "help", ...services] = positionals;
  return {
    command,
    services,
    options: {
      ...values,
      lines: integerFrom(values.lines, 80),
    },
  };
}

async function main() {
  const { command, services, options } = parseOptions();
  if (options.help || command === "help") {
    usage();
    return;
  }
  if (options.build && options["no-build"]) {
    fail("--build and --no-build cannot be used together.");
  }

  const settings = await loadSettings();
  const state = await loadState(settings);

  switch (command) {
    case "start":
    case "up":
      await commandStart(settings, state, services, options);
      break;
    case "stop":
    case "down":
      if (options["keep-db"]) {
        options.keepDb = true;
      }
      await commandStop(settings, state, services, options);
      break;
    case "restart":
      await commandRestart(settings, state, services, options);
      break;
    case "status":
      await commandStatus(settings, state, options.json);
      break;
    case "urls":
      printUrls(settings);
      break;
    case "credentials":
      printCredentials(settings);
      break;
    case "logs":
      await commandLogs(settings, state, services[0], options);
      break;
    case "sync":
      await commandSync(settings, state, options);
      break;
    case "build":
      await commandBuild(settings);
      break;
    case "doctor":
      await commandDoctor(settings);
      break;
    default:
      fail(`Unknown command "${command}". Run pnpm stack help.`);
  }
}

main().catch((cause) => {
  console.error(`error: ${cause instanceof Error ? cause.message : String(cause)}`);
  process.exitCode = 1;
});
