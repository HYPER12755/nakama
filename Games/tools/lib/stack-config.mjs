const SERVICE_ALIASES = new Map([
  ["all", "all"],
  ["db", "postgres"],
  ["postgres", "postgres"],
  ["postgresql", "postgres"],
  ["api", "nakama"],
  ["nakama", "nakama"],
  ["web", "web"],
  ["launcher", "web"],
  ["menu", "web"],
  ["releases", "releases"],
  ["release", "releases"],
]);

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Parse the small YAML subset used by Nakama's configuration file. This is not
 * a general YAML parser; it handles top-level scalars, one level of sections,
 * and the address list under `database`.
 */
export function parseNakamaConfig(text) {
  const top = {};
  const sections = {};
  let section;
  let listKey;

  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine.trim().length === 0 || rawLine.trimStart().startsWith("#")) {
      continue;
    }
    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trim();

    if (indent === 0) {
      const match = /^([A-Za-z0-9_.-]+):(?:\s*(.*))?$/.exec(line);
      if (match === null) {
        continue;
      }
      const [, key, rawValue] = match;
      if (rawValue === undefined || rawValue.length === 0) {
        section = key;
        sections[section] ??= { values: {}, lists: {} };
        listKey = undefined;
      } else {
        section = undefined;
        listKey = undefined;
        top[key] = unquote(rawValue);
      }
      continue;
    }

    if (section === undefined) {
      continue;
    }

    const current = sections[section];
    if (line.startsWith("-")) {
      if (listKey !== undefined) {
        current.lists[listKey].push(unquote(line.slice(1)));
      }
      continue;
    }

    const match = /^([A-Za-z0-9_.-]+):(?:\s*(.*))?$/.exec(line);
    if (match === null) {
      continue;
    }
    const [, key, rawValue] = match;
    if (rawValue === undefined || rawValue.length === 0) {
      listKey = key;
      current.lists[key] ??= [];
    } else {
      listKey = undefined;
      current.values[key] = unquote(rawValue);
    }
  }

  const socket = sections.socket?.values ?? {};
  const consoleSection = sections.console?.values ?? {};
  const database = sections.database ?? { values: {}, lists: {} };
  const runtime = sections.runtime?.values ?? {};

  return {
    name: top.name,
    dataDir: top.data_dir,
    socket: {
      address: socket.address,
      port: socket.port,
      serverKey: socket.server_key,
    },
    console: {
      address: consoleSection.address,
      port: consoleSection.port,
      username: consoleSection.username,
      password: consoleSection.password,
      signingKey: consoleSection.signing_key,
    },
    database: {
      addresses: [...(database.lists.address ?? [])],
    },
    runtime: {
      path: runtime.path,
      httpKey: runtime.http_key,
    },
  };
}

/**
 * Split a Nakama/PostgreSQL DSN into connection fields. The parser supports
 * `user[:password]@host[:port]/database` and bracketed IPv6 hosts.
 */
export function parseDatabaseAddress(address) {
  const match =
    /^(?:([^:@/?#]+)(?::([^@/?#]*))?@)?(\[[^\]]+\]|[^:/?#]+)(?::(\d+))?\/([^?]+)/.exec(
      address,
    );
  if (match === null) {
    return undefined;
  }
  const [, user, password, rawHost, rawPort, database] = match;
  return {
    user,
    password,
    host: rawHost.replace(/^\[|\]$/g, ""),
    port: rawPort === undefined ? 5432 : Number(rawPort),
    database,
  };
}

export function canonicalService(name) {
  return SERVICE_ALIASES.get(name.toLowerCase());
}

export function parsePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
