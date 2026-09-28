import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

// Layering: only the composition root knows concrete runtimes or logging.
// The CLI and the application stay runtime-agnostic.

const SRC = new URL("../src/", import.meta.url);

function imports(file: string): string[] {
  const text = readFileSync(new URL(file, SRC), "utf8");
  return [...text.matchAll(/^import[^;]*?from\s+"\.\/([^"]+)\.js";/gms)].map((match) => match[1]!);
}

const CONCRETE_RUNTIMES = ["claude-code", "codex"];
const LOGGING = ["logging", "logged-runtime"];

test("only the composition root imports concrete runtimes", () => {
  const importers = readdirSync(SRC)
    .filter((file) => file.endsWith(".ts"))
    .filter((file) => imports(file).some((target) => CONCRETE_RUNTIMES.includes(target)))
    .sort();
  assert.deepEqual(importers, ["composition-root.ts"]);
});

test("the CLI and the application depend on neither runtimes nor logging", () => {
  for (const file of ["main.ts", "application.ts", "agents.ts", "review.ts", "run-store.ts"]) {
    const forbidden = imports(file).filter((target) => [...CONCRETE_RUNTIMES, ...LOGGING, "composition-root"].includes(target));
    assert.deepEqual(forbidden, [], `${file} imports ${forbidden.join(", ")}`);
  }
});

test("main.ts names no runtime", () => {
  const text = readFileSync(new URL("main.ts", SRC), "utf8");
  for (const name of ["claude", "codex"]) assert.ok(!text.toLowerCase().includes(name), `main.ts mentions ${name}`);
});
