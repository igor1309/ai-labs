import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { parse } from "yaml";

import { isDescendant } from "../scripts/publish-guard.mjs";

const workflowPath = fileURLToPath(
  new URL("../../.github/workflows/agonara-skills-publish.yml", import.meta.url),
);

function git(cwd, ...args) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

test("isDescendant_shouldAcceptDescendantAndRejectNonDescendant_overTag", () => {
  const repo = mkdtempSync(join(tmpdir(), "guard-"));
  git(repo, "init", "-q");
  git(repo, "config", "user.email", "t@t");
  git(repo, "config", "user.name", "t");
  writeFileSync(join(repo, "a"), "a");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "A");
  git(repo, "tag", "release/aaa");
  writeFileSync(join(repo, "b"), "b");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "B");

  assert.equal(isDescendant({ ancestor: "release/aaa", head: "HEAD", cwd: repo }), true);
  assert.equal(isDescendant({ ancestor: "HEAD", head: "release/aaa", cwd: repo }), false);
});

test("publishWorkflow_shouldTriggerOnTrunkPushOverFullInputSet_andWorkflowDispatch", () => {
  const workflow = parse(readFileSync(workflowPath, "utf8"));
  const on = workflow.on ?? workflow[true];

  assert.equal("workflow_dispatch" in on, true);
  assert.deepEqual(on.push.branches, ["trunk"]);
  for (const required of [
    "agonara/skills/**",
    "agonara/skills-publish-manifest.json",
    "agonara/publish-assets/**",
    "agonara/scripts/project-public-skills.mjs",
    "agonara/scripts/skill-contract.mjs",
    "agonara/docs/api/openapi.yml",
    ".github/workflows/agonara-skills-publish.yml",
  ]) {
    assert.equal(on.push.paths.includes(required), true, `missing path filter: ${required}`);
  }
});
