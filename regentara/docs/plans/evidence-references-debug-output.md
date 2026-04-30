---
date: 2026-04-30
model: gpt-5
description: "Implementation plan for adding Regentara evidence artifact references to debug output."
---

# Evidence References Debug Output Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface existing review-note and terminal-artifact references in `--debug` output.

**Architecture:** Treat artifact references as scalar observability fields. The debug reporter already safely formats scalar fields; the Orchestrator should pass existing references through without parsing artifact contents or changing event schemas.

**Tech Stack:** Node.js ESM, `node:test`, Regentara debug reporter, Orchestrator debug lifecycle, root `scripts/run_silent.sh` verification wrapper.

---

## Execution Lock

- Execution mode: auto-continue
- Human review between tasks: no
- Worktree mode: reuse existing
- Expected worktree: `/Users/igormalyarov/Developer/my-apps/ai-labs/ai-labs/worktrees/regentara-evidence-options`
- Expected branch: `codex/regentara-evidence-options`
- Push policy: no push
- Final archive behavior: move this plan to `regentara/docs/plans/implemented/` after implementation and final verification.
- Preflight check: [ ] done

## Source Documents

- Options: `regentara/docs/plans/regentara-review-evidence-options.md`
- Debug implementation: `regentara/src/debug-reporter.js`
- Existing tests: `regentara/tests/debug-reporter.test.js`, `regentara/tests/orchestrator-sequence.test.js`

## File Structure

- Modify: `regentara/src/orchestrator.js`
  - Include `reviewNoteReference` in reviewer `agent-end` debug output.
  - Include `terminalArtifact` in terminal completion debug output when present.
- Modify: `regentara/tests/orchestrator-sequence.test.js`
  - Add fake-driven tests for debug fields.
- Modify: `regentara/docs/log.md`
  - Add concise implementation entry.

## Task 1: Add Evidence References To Debug Output

**Files:**

- Modify: `regentara/tests/orchestrator-sequence.test.js`
- Modify: `regentara/src/orchestrator.js`
- Modify: `regentara/docs/log.md`

- [ ] **Step 1: Run implementation preflight**

Run: `git worktree list --porcelain`

Run: `git branch --show-current`

Expected: current path is the dedicated worktree and branch is `codex/regentara-evidence-options`.

- [ ] **Step 2: Write failing tests**

Add assertions using the existing `debugEvents` test seam:

```js
const debugEvents = [];
await runWorkflowWithCalls([], {
  debugEvents,
  policyDecisions: [{ decision: "complete-ok", terminalArtifact: { content: "# Terminal Decision\n" } }],
  reviewerOutputs: [{ verdict: "accepted", summary: "round one summary" }],
});

const reviewerEnd = debugEvents.find((event) =>
  event.event === "agent-end" && event.fields.agent === "reviewer",
);
assert.equal(reviewerEnd.fields.reviewNoteReference, "review-01.md");

const completion = debugEvents.find((event) => event.event === "completion");
assert.equal(completion.fields.terminalArtifact, "terminal-decision.md");
```

- [ ] **Step 3: Run RED**

Run: `./scripts/run_silent.sh "debug-evidence-red" node --test regentara/tests/orchestrator-sequence.test.js`

Expected: FAIL with missing debug fields. Compilation errors are not RED.

- [ ] **Step 4: Implement minimal debug fields**

Thread the already-computed `reviewNoteReference` into the `debugReporter.report("agent-end", ...)` fields.

Pass persisted terminal artifact references into `completionDebugFields` or merge them at the call site so completion debug output includes `terminalArtifact` only when one exists.

- [ ] **Step 5: Run targeted GREEN**

Run: `./scripts/run_silent.sh "debug-evidence-green" node --test regentara/tests/orchestrator-sequence.test.js`

Expected: PASS.

- [ ] **Step 6: Update log**

Add a 2026-04-30 entry to `regentara/docs/log.md` describing debug visibility for persisted evidence references.

- [ ] **Step 7: Run full gates**

Run: `./scripts/run_silent.sh "tests" npm test`

Run: `./scripts/run_silent.sh "build" npx tsc --noEmit`

Expected: both PASS.

- [ ] **Step 8: Commit implementation**

Commit: `git commit -m "show evidence references in debug output"`

- [ ] **Step 9: Mark implemented and archive plan**

Move this plan to `regentara/docs/plans/implemented/evidence-references-debug-output.md` after implementation and review pass.

Commit: `git commit -m "archive debug evidence plan"`
