import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readFile(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("nomos staging compose declares nomos-shared as external network", () => {
  const compose = readFile("../docker-compose.staging.yml");

  assert.match(compose, /^networks:\s*\n\s+nomos-shared:\s*\n\s+external:\s*true/m);
});

test("nomos staging compose attaches nomos-staging to nomos-shared", () => {
  const compose = readFile("../docker-compose.staging.yml");

  assert.match(compose, /nomos:[\s\S]*?networks:[\s\S]*?- nomos-shared/);
});
