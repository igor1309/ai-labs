import assert from "node:assert/strict";
import test from "node:test";

import { scopeViolation } from "../pr-scope.js";

test("prScope_shouldReject_projectChangeCarryingAgisterHomeChange", () => {
  const files = ["warder/cmd/warder/main.go", "agister/home/runtimes/codex.yaml"];

  assert.deepEqual(scopeViolation(files), {
    agister: ["agister/home/runtimes/codex.yaml"],
    projects: ["warder/cmd/warder/main.go"],
  });
});

test("prScope_shouldReject_projectChangeCarryingRepositorySettingsChange", () => {
  const files = [".agister/processes/implement_warder.yaml", "warder/go.mod"];

  assert.deepEqual(scopeViolation(files), {
    agister: [".agister/processes/implement_warder.yaml"],
    projects: ["warder/go.mod"],
  });
});

test("prScope_shouldReject_agisterChangeEditingProjectInstructions", () => {
  const files = ["agister/home/prompts/implement.md", "warder/AGENTS.md"];

  assert.deepEqual(scopeViolation(files)?.projects, ["warder/AGENTS.md"]);
});

test("prScope_shouldAccept_agisterChangeMigratingProjectSettingsLayer", () => {
  const files = ["agister/cmd/agister/main.go", "warder/.agister/verifies/repo.yaml", "agister/.agister/verifies/repo.yaml"];

  assert.equal(scopeViolation(files), null);
});

test("prScope_shouldAccept_agisterChangeWithSharedFiles", () => {
  const files = [
    "agister/internal/app/check.go",
    ".claude/skills/deliver/SKILL.md",
    ".codex/prompts/deliver.md",
    ".github/workflows/ci.yml",
    "docs/x.md",
    "gokit/supervisor/supervisor.go",
    "prompts/go-architecture.md",
    "research/agister/research/note.md",
    "scripts/pr-scope.js",
    "AGENTS.md",
    "package.json",
  ];

  assert.equal(scopeViolation(files), null);
});

test("prScope_shouldAccept_projectChangeAlone", () => {
  assert.equal(scopeViolation(["warder/cmd/warder/main.go", "nomos/src/a.js"]), null);
});

test("prScope_shouldAccept_agisterChangeAlone", () => {
  assert.equal(scopeViolation(["agister/home/prompts/code-review-tests.md", ".agister/processes/implement.yaml"]), null);
});
