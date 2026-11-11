import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalService,
  parseDatabaseAddress,
  parseNakamaConfig,
  parsePositiveInteger,
} from "../lib/stack-config.mjs";

test("parses the Nakama config subset used by the stack manager", () => {
  const config = parseNakamaConfig(`
name: nakama-local
data_dir: /home/test/nakama/data

logger:
  level: INFO
  stdout: true

socket:
  server_key: defaultkey
  port: 7350
  address: 127.0.0.1

console:
  port: 7351
  address: 127.0.0.1
  username: admin
  password: "local password"
  signing_key: signing

database:
  address:
    - nakama:nakama_local_pw@127.0.0.1:5432/nakama
    - postgres@127.0.0.1:5432/nakama

runtime:
  path: /home/test/nakama/data/modules
  http_key: showcase_http_key
`);

  assert.equal(config.name, "nakama-local");
  assert.equal(config.dataDir, "/home/test/nakama/data");
  assert.deepEqual(config.socket, {
    address: "127.0.0.1",
    port: "7350",
    serverKey: "defaultkey",
  });
  assert.equal(config.console.username, "admin");
  assert.equal(config.console.password, "local password");
  assert.equal(config.console.signingKey, "signing");
  assert.deepEqual(config.database.addresses, [
    "nakama:nakama_local_pw@127.0.0.1:5432/nakama",
    "postgres@127.0.0.1:5432/nakama",
  ]);
  assert.equal(config.runtime.path, "/home/test/nakama/data/modules");
  assert.equal(config.runtime.httpKey, "showcase_http_key");
});

test("parses PostgreSQL DSNs with and without credentials and IPv6", () => {
  assert.deepEqual(parseDatabaseAddress("postgres@127.0.0.1:5432/nakama"), {
    user: "postgres",
    password: undefined,
    host: "127.0.0.1",
    port: 5432,
    database: "nakama",
  });
  assert.deepEqual(
    parseDatabaseAddress("nakama:local_pw@127.0.0.1:5432/nakama"),
    {
      user: "nakama",
      password: "local_pw",
      host: "127.0.0.1",
      port: 5432,
      database: "nakama",
    },
  );
  assert.deepEqual(
    parseDatabaseAddress("nakama:secret@[::1]:5433/nakama"),
    {
      user: "nakama",
      password: "secret",
      host: "::1",
      port: 5433,
      database: "nakama",
    },
  );
  assert.equal(parseDatabaseAddress("not a database address"), undefined);
});

test("normalizes service aliases and numeric options", () => {
  assert.equal(canonicalService("db"), "postgres");
  assert.equal(canonicalService("launcher"), "web");
  assert.equal(canonicalService("api"), "nakama");
  assert.equal(canonicalService("release"), "releases");
  assert.equal(canonicalService("unknown"), undefined);
  assert.equal(parsePositiveInteger("4174"), 4174);
  assert.equal(parsePositiveInteger("0"), undefined);
  assert.equal(parsePositiveInteger("nope"), undefined);
});
