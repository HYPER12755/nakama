#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { connect as netConnect } from "node:net";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import {
  brotliCompressSync,
  constants as zlibConstants,
  gzipSync,
} from "node:zlib";

const TOOLS_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.join(TOOLS_ROOT, "..", "launcher", "dist");
const COMPRESSIBLE_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".svg",
  ".txt",
  ".wasm",
  ".xml",
]);
const MAX_COMPRESS_BYTES = 4 * 1024 * 1024;

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".webp", "image/webp"],
  [".xml", "application/xml; charset=utf-8"],
  [".zip", "application/zip"],
]);

const encodedCache = new Map();

function usage() {
  console.log(`Usage: node tools/serve-web.mjs [options]

Options:
  --root <dir>   Built web root to serve (default: launcher/dist)
  --port <n>     Port to listen on (default: 4174)
  --host <addr>  Bind address (default: 0.0.0.0)
  --server <a>   Where the game server is (default: 127.0.0.1:7350)
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

function mimeFor(file) {
  return (
    MIME_TYPES.get(path.extname(file).toLowerCase()) ??
    "application/octet-stream"
  );
}

function cacheControlFor(pathname, file) {
  if (pathname.startsWith("/assets/") || pathname.includes("/assets/")) {
    return "public, max-age=31536000, immutable";
  }
  const extension = path.extname(file).toLowerCase();
  if (extension === ".html" || extension === ".json") {
    return "no-cache";
  }
  return "public, max-age=3600";
}

function etagFor(fileStat) {
  return `W/"${fileStat.size.toString(16)}-${Math.trunc(fileStat.mtimeMs).toString(16)}"`;
}

function encodingFor(request) {
  const accept = String(request.headers["accept-encoding"] ?? "").toLowerCase();
  if (/\bbr\b/.test(accept)) {
    return "br";
  }
  if (/\bgzip\b/.test(accept)) {
    return "gzip";
  }
  return null;
}

async function resolveFile(root, pathname) {
  const file = safePath(root, pathname);
  if (file === null) {
    return { status: 403 };
  }
  try {
    let fileStat = await stat(file);
    if (fileStat.isDirectory()) {
      if (!pathname.endsWith("/")) {
        return { redirect: `${pathname}/` };
      }
      const index = path.join(file, "index.html");
      fileStat = await stat(index);
      return { file: index, stat: fileStat };
    }
    if (!fileStat.isFile()) {
      return { status: 404 };
    }
    return { file, stat: fileStat };
  } catch (cause) {
    if (cause?.code !== "ENOENT" && cause?.code !== "ENOTDIR") {
      throw cause;
    }
  }

  // Launcher routes such as /invite/<token> are client-side routes.
  if (path.extname(pathname) === "") {
    const index = path.join(root, "index.html");
    try {
      return { file: index, stat: await stat(index) };
    } catch {
      return { status: 404 };
    }
  }
  return { status: 404 };
}

async function compressedBody(file, fileStat, encoding) {
  const key = `${file}:${fileStat.size}:${Math.trunc(fileStat.mtimeMs)}:${encoding}`;
  const cached = encodedCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  if (encodedCache.size >= 64) {
    encodedCache.clear();
  }
  const raw = await readFile(file);
  const body =
    encoding === "br"
      ? brotliCompressSync(raw, {
          params: {
            [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
            [zlibConstants.BROTLI_PARAM_SIZE_HINT]: raw.length,
          },
        })
      : gzipSync(raw, { level: 6 });
  encodedCache.set(key, body);
  return body;
}

async function main() {
  const { values } = parseArgs({
    options: {
      root: { type: "string", default: "" },
      port: { type: "string", default: "4174" },
      host: { type: "string", default: "0.0.0.0" },
      server: { type: "string", default: "127.0.0.1:7350" },
      engine: { type: "string", default: "127.0.0.1:7352" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    usage();
    return;
  }

  const root = path.resolve(
    values.root === "" ? DEFAULT_ROOT : values.root,
  );
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail("--port must be an integer between 1 and 65535.");
  }
  // Where the game server is. The calls and the socket are passed on to it,
  // so the menu, the games and the server are all reached through one
  // address, and a tunnel or a CDN only needs that one address.
  const [serverHost, serverPort] = values.server.split(":");
  const gameServer = {
    host: serverHost && serverHost.length > 0 ? serverHost : "127.0.0.1",
    port: Number(serverPort) > 0 ? Number(serverPort) : 7350,
  };
  // Where the engine on the server lives.
  const [engineHost, enginePort] = values.engine.split(":");
  const engineServer = {
    host: engineHost && engineHost.length > 0 ? engineHost : "127.0.0.1",
    port: Number(enginePort) > 0 ? Number(enginePort) : 7352,
  };
  // The calls the server answers and the socket it holds.
  const SERVER_PATHS = ["/v2", "/v1", "/ws", "/healthcheck", "/status"];
  const isServerPath = (pathname) =>
    SERVER_PATHS.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );

  // The engine on the server, which says what a position is worth. It is
  // asked through the same address as everything else, so the client does
  // not need to know where it lives.
  const ENGINE_PATHS = ["/api/external-engine"];
  const isEnginePath = (pathname) =>
    ENGINE_PATHS.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  try {
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) {
      fail(`${root} is not a directory.`);
    }
  } catch {
    fail(`Web root not found: ${root}`);
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

    // The calls and the socket go straight to the game server, so the menu
    // and the games are reached through the same address the player came
    // to. That is what lets a tunnel, a proxy or a CDN serve the whole
    // thing from one name.
    if (isServerPath(pathname)) {
      const upstream = httpRequest(
        {
          host: gameServer.host,
          port: gameServer.port,
          path: request.url,
          method,
          headers: { ...request.headers, host: `${gameServer.host}:${gameServer.port}` },
        },
        (upstreamResponse) => {
          response.writeHead(upstreamResponse.statusCode ?? 502, {
            ...upstreamResponse.headers,
          });
          upstreamResponse.pipe(response);
        },
      );
      upstream.on("error", () => {
        response.writeHead(502, { "content-type": "text/plain" });
        response.end("The game server could not be reached.");
      });
      request.pipe(upstream);
      return;
    }

    // The engine is asked the same way, through the address the player
    // came to.
    if (isEnginePath(pathname)) {
      const upstream = httpRequest(
        {
          host: engineServer.host,
          port: engineServer.port,
          path: request.url,
          method,
          headers: {
            ...request.headers,
            host: `${engineServer.host}:${engineServer.port}`,
          },
        },
        (upstreamResponse) => {
          response.writeHead(upstreamResponse.statusCode ?? 502, {
            ...upstreamResponse.headers,
          });
          upstreamResponse.pipe(response);
        },
      );
      upstream.on("error", () => {
        response.writeHead(502, { "content-type": "text/plain" });
        response.end("The engine could not be reached.");
      });
      request.pipe(upstream);
      return;
    }

    if (method !== "GET" && method !== "HEAD") {
      response.writeHead(405, { allow: "GET, HEAD" }).end("method not allowed");
      return;
    }

    try {
      const resolved = await resolveFile(root, pathname);
      if (resolved.redirect !== undefined) {
        response.writeHead(308, { location: resolved.redirect }).end();
        return;
      }
      if (resolved.file === undefined) {
        response
          .writeHead(resolved.status ?? 404)
          .end(resolved.status === 403 ? "forbidden" : "not found");
        return;
      }

      const { file, stat: fileStat } = resolved;
      const etag = etagFor(fileStat);
      const contentType = mimeFor(file);
      const extension = path.extname(file).toLowerCase();
      const compressible =
        COMPRESSIBLE_EXTENSIONS.has(extension) &&
        fileStat.size > 1024 &&
        fileStat.size <= MAX_COMPRESS_BYTES;
      const encoding = compressible ? encodingFor(request) : null;
      const headers = {
        "cache-control": cacheControlFor(pathname, file),
        etag,
        "x-content-type-options": "nosniff",
      };
      if (encoding !== null) {
        headers.vary = "accept-encoding";
      }

      if (request.headers["if-none-match"] === etag) {
        response.writeHead(304, headers).end();
        return;
      }

      let body = null;
      if (method !== "HEAD") {
        body =
          encoding === null
            ? await readFile(file)
            : await compressedBody(file, fileStat, encoding);
      }
      if (encoding !== null) {
        headers["content-encoding"] = encoding;
      }
      headers["content-length"] =
        method === "HEAD"
          ? encoding === null
            ? fileStat.size
            : (await compressedBody(file, fileStat, encoding)).length
          : body.length;
      headers["content-type"] = contentType;

      response.writeHead(200, headers);
      response.end(body ?? undefined);
    } catch (cause) {
      console.error(`error serving ${pathname}: ${cause.message}`);
      if (!response.headersSent) {
        response.writeHead(500).end("internal server error");
      } else {
        response.destroy();
      }
    }
  });

  server.on("error", (cause) => {
    fail(cause instanceof Error ? cause.message : String(cause));
  });

  // The socket the games and the menu hold is passed on to the game server
  // as well, so the player only ever needs one address.
  server.on("upgrade", (request, socket, head) => {
    const upstream = netConnect(gameServer.port, gameServer.host, () => {
      const headers = { ...request.headers };
      delete headers["upgrade"];
      delete headers["connection"];
      upstream.write(
        `GET ${request.url} HTTP/1.1\r\n` +
          Object.entries(headers)
            .map(([name, value]) => `${name}: ${value}`)
            .join("\r\n") +
          "\r\n" +
          "Connection: Upgrade\r\n" +
          "Upgrade: websocket\r\n\r\n",
      );
      if (head && head.length > 0) {
        upstream.write(head);
      }
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on("error", () => {
      socket.destroy();
    });
    socket.on("error", () => {
      upstream.destroy();
    });
  });

  server.listen(port, values.host, () => {
    console.log(`Serving ${root} at http://${values.host}:${port}/`);
    console.log(
      `The game server is reached through this address, at ${gameServer.host}:${gameServer.port}.`,
    );
  });
}

main().catch((cause) => {
  fail(cause instanceof Error ? cause.message : String(cause));
});
