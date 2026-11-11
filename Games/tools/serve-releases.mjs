#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const GAMES_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const MIME_TYPES = new Map([
  [".json", "application/json; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".wasm", "application/wasm"],
  [".zip", "application/zip"],
  [".txt", "text/plain; charset=utf-8"],
]);

function usage() {
  console.log(`Usage: node tools/serve-releases.mjs [options]

Options:
  --root <dir>   Release root to serve (default: releases)
  --port <n>     Port to listen on (default: 8099)
  --host <addr>  Bind address (default: 0.0.0.0)
  --help         Show this help
`);
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function safePath(root, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) {
    return null;
  }
  const candidate = path.resolve(root, `.${decoded}`);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    return null;
  }
  return candidate;
}

async function main() {
  const { values } = parseArgs({
    options: {
      root: { type: "string", default: "releases" },
      port: { type: "string", default: "8099" },
      host: { type: "string", default: "0.0.0.0" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    usage();
    return;
  }

  const root = path.resolve(values.root);
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail("--port must be an integer between 1 and 65535.");
  }

  const server = createServer(async (request, response) => {
    const started = Date.now();
    const method = request.method ?? "GET";
    const pathname = (request.url ?? "/").split("?")[0];

    response.on("finish", () => {
      console.log(
        `${method} ${pathname} ${response.statusCode} ${Date.now() - started}ms`,
      );
    });

    if (method !== "GET" && method !== "HEAD") {
      response.writeHead(405, { allow: "GET, HEAD" }).end("method not allowed");
      return;
    }

    let file = safePath(root, pathname);
    if (file === null) {
      response.writeHead(403).end("forbidden");
      return;
    }

    try {
      let fileStat = await stat(file);
      if (fileStat.isDirectory()) {
        file = path.join(file, "index.html");
        fileStat = await stat(file);
      }
      if (!fileStat.isFile()) {
        response.writeHead(404).end("not found");
        return;
      }

      response.writeHead(200, {
        "access-control-allow-origin": "*",
        "cache-control": "no-cache",
        "content-length": fileStat.size,
        "content-type":
          MIME_TYPES.get(path.extname(file).toLowerCase()) ??
          "application/octet-stream",
      });
      if (method === "HEAD") {
        response.end();
        return;
      }
      createReadStream(file)
        .on("error", (cause) => {
          console.error(`error reading ${file}: ${cause.message}`);
          response.destroy();
        })
        .pipe(response);
    } catch (cause) {
      if (cause?.code === "ENOENT" || cause?.code === "ENOTDIR") {
        response.writeHead(404).end("not found");
        return;
      }
      console.error(`error serving ${pathname}: ${cause.message}`);
      response.writeHead(500).end("internal server error");
    }
  });

  server.listen(port, values.host, () => {
    console.log(`Serving ${root} at http://${values.host}:${port}/`);
  });
}

main().catch((cause) => {
  fail(cause instanceof Error ? cause.message : String(cause));
});
