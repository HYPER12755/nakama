// A small watchdog for the local stack.
//
// A phone that has been asleep may have lost its services. The launcher can
// ask this watchdog to heal them, and the watchdog can check on its own. It
// only starts services the player wants running; a service that was stopped
// on purpose is left alone.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GAMES_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const STACK_SCRIPT = path.join(GAMES_ROOT, "tools", "stack.mjs");
const STATE_PATH = process.env.MOONGAMES_STACK_STATE
  ? path.resolve(process.env.MOONGAMES_STACK_STATE)
  : path.join(GAMES_ROOT, "runtime", "stack", "state.json");
const PORT = Number(process.env.MOONGAMES_WATCHDOG_PORT ?? 4180);
const INTERVAL = Number(process.env.MOONGAMES_WATCHDOG_INTERVAL_MS ?? 15000);
const COOLDOWN_MS = Number(process.env.MOONGAMES_WATCHDOG_COOLDOWN_MS ?? 300000);
const REQUEST_TIMEOUT = 20000;

const lastStart = new Map();
let lock = null;

function run(args, timeout = REQUEST_TIMEOUT) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [STACK_SCRIPT, ...args], {
      cwd: GAMES_ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, output });
    }, timeout);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output });
    });
  });
}

async function desiredServices() {
  try {
    const state = JSON.parse(await fs.readFile(STATE_PATH, "utf8"));
    const desired = state.desired ?? {};
    return Object.keys(desired).filter((name) => desired[name] !== false);
  } catch {
    // No state yet: the default stack is all of them.
    return ["postgres", "nakama", "web", "releases", "engine"];
  }
}

async function status() {
  const result = await run(["status", "--json"]);
  if (!result.ok) {
    return [];
  }
  try {
    const line = result.output
      .split("\n")
      .find((text) => text.trim().startsWith("["));
    return line === undefined ? [] : JSON.parse(line);
  } catch {
    return [];
  }
}

/** Start wanted services that are down, with a cooldown and a single lock. */
export async function heal() {
  if (lock !== null) {
    return lock;
  }
  lock = (async () => {
    const wanted = new Set(await desiredServices());
    const services = await status();
    const started = [];
    for (const service of services) {
      if (service.up || !wanted.has(service.service)) {
        continue;
      }
      const last = lastStart.get(service.service) ?? 0;
      if (Date.now() - last < COOLDOWN_MS) {
        continue;
      }
      lastStart.set(service.service, Date.now());
      const result = await run(["start", service.service, "--no-build"]);
      started.push({
        service: service.service,
        ok: result.ok,
      });
    }
    return started;
  })();
  try {
    return await lock;
  } finally {
    lock = null;
  }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
    const address = request.socket.remoteAddress ?? "";
    // Healing the local stack is only for this device, never the LAN.
    const local = address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
    response.setHeader("Content-Type", "application/json");
    if (url.pathname === "/health") {
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (url.pathname === "/heal") {
      if (request.method !== "POST" || !local) {
        response.statusCode = 403;
        response.end(JSON.stringify({ ok: false, error: "local only" }));
        return;
      }
      void heal().then((started) => {
        response.end(JSON.stringify({ ok: true, started }));
      });
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ ok: false }));
  });
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`stack watchdog listening on 127.0.0.1:${PORT}`);
  });
  setInterval(() => {
    void heal();
  }, INTERVAL).unref();
}
