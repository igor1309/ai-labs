import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../../audelin/scripts/review-step.sh", import.meta.url));

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function commit(cwd, name) {
  fs.writeFileSync(path.join(cwd, name), name);
  git(cwd, "add", name);
  git(cwd, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", name);
  return git(cwd, "rev-parse", "HEAD");
}

// A branch one commit off a trunk that has since moved on, with an `agister`
// that records its arguments.
function makeBranch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "review-step-"));
  const repo = path.join(dir, "repo");
  fs.mkdirSync(repo);
  git(repo, "init", "-q", "-b", "trunk");
  const forkPoint = commit(repo, "fork");
  git(repo, "clone", "-q", "--bare", repo, path.join(dir, "origin.git"));
  git(repo, "remote", "add", "origin", path.join(dir, "origin.git"));
  commit(repo, "trunk-work");
  git(repo, "push", "-q", "origin", "trunk");
  git(repo, "checkout", "-q", "-b", "step", forkPoint);
  const head = commit(repo, "step-work");
  git(repo, "fetch", "-q", "origin");

  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  const args = path.join(dir, "args");
  fs.writeFileSync(path.join(bin, "agister"), `#!/bin/sh\necho "$@" > "${args}"\n`, { mode: 0o755 });
  const goal = path.join(dir, "goal.md");
  fs.writeFileSync(goal, "goal");

  const run = (...extra) => execFileSync("sh", [script, goal, path.join(dir, "out"), ...extra], {
    cwd: repo,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    stdio: "pipe",
  });
  return { repo, forkPoint, head, args, run };
}

test("the review leaves the branch where it was", () => {
  const { repo, head, run } = makeBranch();
  run();
  assert.strictEqual(git(repo, "rev-parse", "HEAD"), head);
});

test("the review's base defaults to the merge-base with trunk", () => {
  const { forkPoint, args, run } = makeBranch();
  run();
  assert.match(fs.readFileSync(args, "utf8"), new RegExp(`base=${forkPoint} `));
});

test("a named base focuses the review", () => {
  const { head, args, run } = makeBranch();
  run(head);
  assert.match(fs.readFileSync(args, "utf8"), new RegExp(`base=${head} `));
});
