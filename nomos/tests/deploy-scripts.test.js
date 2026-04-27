import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readScript(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("deploy staging should copy production compose for prod promotion", () => {
  const script = readScript("../scripts/deploy-staging.sh");

  assert.match(script, /cp \/tmp\/nomos-deploy\/docker-compose\.yml \./);
});

test("release workflow should upload production compose for Nomos deploy", () => {
  const workflow = readScript("../../.github/workflows/release-unit.yml");

  assert.match(workflow, /nomos\/docker-compose\.yml/);
});
