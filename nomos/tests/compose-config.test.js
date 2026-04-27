import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readCompose(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("production compose should default Nomos JSON body limit to 1mb", () => {
  const compose = readCompose("../docker-compose.yml");

  assert.match(compose, /NOMOS_JSON_BODY_LIMIT: \$\{NOMOS_JSON_BODY_LIMIT:-1mb\}/);
});

test("staging compose should default Nomos JSON body limit to 1mb", () => {
  const compose = readCompose("../docker-compose.staging.yml");

  assert.match(compose, /NOMOS_JSON_BODY_LIMIT: \$\{NOMOS_JSON_BODY_LIMIT:-1mb\}/);
});

test("production compose should bind the persistent data directory", () => {
  const compose = readCompose("../docker-compose.yml");

  assert.match(compose, /- \.\/data:\/app\/data/);
  assert.doesNotMatch(compose, /- nomos-data:\/app\/data/);
});
