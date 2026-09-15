import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RegistryState } from "../src/claude-code-registry.js";
import type { SessionStatus } from "../src/claude-code.js";
import { composeClaudeCodeRuntimeStates } from "../src/compose-claude-code-runtime-states.js";

// Not QA scenarios: the status the adapter is given for each state the registry
// can read. The two vocabularies are spelled independently, so a state sent in
// under the wrong word type-checks. `working` is read end to end from a `busy`
// registration in `claude-code-sessions.test.ts`, so a wrong word for it fails
// there too; `waiting` and `idle` are caught nowhere but here.
describe("What a registry state says to the Claude Code adapter", () => {
  it("gives a working session the working status", () => {
    assert.equal(statusOf("working"), "working");
  });

  it("gives a waiting session the waiting status", () => {
    assert.equal(statusOf("waiting"), "waiting");
  });

  it("gives an idle session the idle status", () => {
    assert.equal(statusOf("idle"), "idle");
  });

  // Not running is the absence of a state on both sides, and composition passes
  // it through rather than choosing a word for it.
  it("says nothing about a session the registry holds no state for", () => {
    assert.equal(composeClaudeCodeRuntimeStates(() => () => undefined)()("gone"), undefined);
  });
});

// The status the composed port reports for a session the registry reads as
// `state`.
function statusOf(state: RegistryState): SessionStatus | undefined {
  return composeClaudeCodeRuntimeStates(() => () => state)()("registered");
}
