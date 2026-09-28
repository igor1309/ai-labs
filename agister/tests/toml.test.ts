import assert from "node:assert/strict";
import { test } from "node:test";

import { parseFlatToml, stringifyFlatToml } from "../src/toml.js";

test("parses flat key/value lines with comments", () => {
  const table = parseFlatToml(`# profile
schema = "agister.agent/v1alpha1"
name = "reviewer" # trailing comment
retries = 2
enabled = true
tags = ["a", "b # not a comment", "c,d"]
empty = []
`);
  assert.deepEqual(table, {
    schema: "agister.agent/v1alpha1",
    name: "reviewer",
    retries: 2,
    enabled: true,
    tags: ["a", "b # not a comment", "c,d"],
    empty: [],
  });
});

test("round-trips through stringify", () => {
  const table = { name: 'quote " and \\ backslash', count: 3, flag: false, list: ["x", "y"] };
  assert.deepEqual(parseFlatToml(stringifyFlatToml(table)), table);
});

test("rejects TOML it does not understand instead of half-parsing it", () => {
  assert.throws(() => parseFlatToml("[table]\n", "p.toml"), /p\.toml:1: expected `key = value`/);
  assert.throws(() => parseFlatToml("a = 'single'\n"), /unsupported value/);
  assert.throws(() => parseFlatToml("a = 1\na = 2\n"), /:2: duplicate key: a/);
  assert.throws(() => parseFlatToml("a.b = 1\n"), /unsupported key/);
});
