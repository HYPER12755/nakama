import assert from "node:assert/strict";
import test from "node:test";
import { cacheControlFor, etagFor } from "../serve-releases.mjs";

test("release manifest is revalidated and immutable artifacts are cached", () => {
  assert.equal(cacheControlFor("/release-manifest.json"), "no-cache");
  assert.equal(cacheControlFor("/games.json"), "no-cache");
  assert.equal(
    cacheControlFor("/uno/0.1.0/uno-0.1.0.zip"),
    "public, max-age=31536000, immutable",
  );
  assert.equal(
    cacheControlFor("/uno/0.1.0/deltas/0.0.9-0.1.0/delta.json"),
    "public, max-age=31536000, immutable",
  );
});

test("release etag changes with file size and mtime", () => {
  const first = etagFor({ size: 10, mtimeMs: 1000 });
  const second = etagFor({ size: 11, mtimeMs: 1000 });
  const third = etagFor({ size: 10, mtimeMs: 2000 });
  assert.notEqual(first, second);
  assert.notEqual(first, third);
});
