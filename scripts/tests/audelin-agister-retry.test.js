import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const retry = fileURLToPath(new URL("../../audelin/scripts/agister-retry.sh", import.meta.url));

test("a rate limit's leftovers are saved and cleared, staged moves and deletions too", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "agister-retry-")));
  const work = path.join(dir, "work");
  fs.mkdirSync(work);
  const git = (...args) => execFileSync("git", args, { cwd: work, stdio: "pipe" }).toString();
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  for (const name of ["moved", "removed", "changed"]) fs.writeFileSync(path.join(work, name), `${name}\n`);
  git("add", ".");
  git("commit", "-qm", "base");
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  // An agister run that stages a move and a deletion, edits a file and adds one, then hits a rate limit.
  fs.writeFileSync(path.join(bin, "agister"), `#!/bin/sh
git mv moved renamed
git rm -q removed
echo edited >> changed
echo new > added
echo started
printf '%s\\n' '{"status": "failed", "class": "rate_limited", "reason": "limit"}'
`, { mode: 0o755 });
  const out = path.join(dir, "out");

  const run = spawnSync("sh", [retry, "-n", "1", "-o", out, "--", "implement_tested"], {
    cwd: work, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, encoding: "utf8",
  });

  assert.match(run.stdout, /RETRY: try 1 leftovers saved/, run.stdout + run.stderr);
  assert.match(run.stdout, /STOP: 1 tries spent/, run.stdout);
  assert.equal(git("status", "--porcelain"), "");
  git("apply", "--index", path.join(out, "left1.patch"));
  assert.equal(git("status", "--porcelain"), "A  added\nM  changed\nD  removed\nR  moved -> renamed\n");
});
