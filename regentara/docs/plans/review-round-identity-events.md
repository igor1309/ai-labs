---
date: 2026-04-30
model: gpt-5
description: "Implementation plan for adding review round identity to Regentara events."
---

# Review Round Identity Events Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `reviewRoundIndex` to review-round events so reviewer notes, policy decisions, and terminal completion can be tied to the review round that produced them.

**Architecture:** Keep round identity as Orchestrator-owned structural metadata. Reuse the existing `reviewHistory.length + 1` value already passed to reviewer execution and review-note persistence; do not inspect reviewer note content, policy session contents, Git state, branches, or provider semantics.

**Tech Stack:** Node.js ESM, `node:test`, Regentara Orchestrator, existing `scripts/run_silent.sh` verification wrapper.

---

## Execution Lock

- Execution mode: auto-continue
- Human review between tasks: no
- Worktree mode: reuse existing
- Expected worktree: `/Users/igormalyarov/Developer/my-apps/ai-labs/ai-labs/worktrees/regentara-evidence-options`
- Expected branch: `codex/regentara-evidence-options`
- Push policy: no push
- Final archive behavior: move this plan to `regentara/docs/plans/implemented/` after implementation and final verification.
- Preflight check: [x] done before plan creation

## Source Documents

- Options: `regentara/docs/plans/regentara-review-evidence-options.md`
- Vision: `regentara/research/regentara-review-evidence-vision.md`
- Existing spec: `regentara/docs/specs/reviewer-authored-review-note.md`

## File Structure

- Modify: `regentara/src/orchestrator.js`
  - Add structural `reviewRoundIndex` fields to reviewer round events, policy decisions, and policy-terminal completion events.
- Modify: `regentara/tests/orchestrator-sequence.test.js`
  - Add focused tests for round identity on first-round and remediated runs.
- Modify: `regentara/docs/log.md`
  - Add a concise Regentara log entry after the code change is green.

## Task 1: Add Review Round Identity To Events

**Files:**

- Modify: `regentara/tests/orchestrator-sequence.test.js`
- Modify: `regentara/src/orchestrator.js`
- Modify: `regentara/docs/log.md`

- [x] **Step 1: Run implementation preflight**

Run: `git worktree list --porcelain`

Run: `git branch --show-current`

Expected: current path is the dedicated worktree and branch is `codex/regentara-evidence-options`.

- [x] **Step 2: Write failing tests**

Add tests asserting:

```js
test("runWorkflow should include reviewRoundIndex on first-round reviewer and policy events", async () => {
  const result = await runWorkflowWithCalls([], {
    policyDecisions: [{ decision: "complete-ok" }],
    reviewerOutputs: [{ verdict: "accepted", summary: "round one summary" }],
  });

  const events = await readEvents(result.runDirectory);
  const relevantEvents = events
    .filter((event) =>
      (event.type === "agent-start" && event.agentId === "reviewer")
      || (event.type === "agent-end" && event.agentId === "reviewer")
      || event.type === "policy-decision"
      || event.type === "completion",
    )
    .map((event) => ({ type: event.type, reviewRoundIndex: event.reviewRoundIndex }));

  assert.deepEqual(relevantEvents, [
    { type: "agent-start", reviewRoundIndex: 1 },
    { type: "agent-end", reviewRoundIndex: 1 },
    { type: "policy-decision", reviewRoundIndex: 1 },
    { type: "completion", reviewRoundIndex: 1 },
  ]);
});
```

Also add a second test for two reviewer rounds asserting reviewer and policy events carry `[1, 1, 2, 2]` and the terminal completion carries `2`.

- [x] **Step 3: Run RED**

Run: `./scripts/run_silent.sh "review-round-identity-red" node --test regentara/tests/orchestrator-sequence.test.js`

Expected: FAIL with an assertion showing missing `reviewRoundIndex` on at least one event. Compilation errors are not RED.

- [x] **Step 4: Implement minimal event fields**

In `runWorkflow`, capture the next round index in a local variable before reviewer execution:

```js
const reviewRoundIndex = reviewHistory.length + 1;
```

Pass that variable to `executeAgent`, include it on the following `policy-decision`, and include it on `complete-ok` / `complete-fail` completion events.

In `executeAgent`, include `reviewRoundIndex` on `agent-start` and `agent-end` only when defined.

- [x] **Step 5: Run targeted GREEN**

Run: `./scripts/run_silent.sh "review-round-identity-green" node --test regentara/tests/orchestrator-sequence.test.js`

Expected: PASS.

- [x] **Step 6: Update log**

Add a 2026-04-30 entry to `regentara/docs/log.md` describing that review-round events now carry explicit round identity.

- [x] **Step 7: Run full gates**

Run: `./scripts/run_silent.sh "tests" npm test`

Run: `./scripts/run_silent.sh "build" npx tsc --noEmit`

Expected: both PASS.

- [ ] **Step 8: Commit implementation**

Gate status required before commit:

- Preflight: passed
- RED evidence: captured
- Targeted verification: passed
- Full tests/build: passed
- Scope check: only Orchestrator, sequence tests, log, and this plan status

Commit: `git commit -m "add review round event identity"`

- [ ] **Step 9: Mark implemented and archive plan**

Move this plan to `regentara/docs/plans/implemented/review-round-identity-events.md` after implementation and review pass.

Run docs check: verify the implemented plan still has front matter and exactly one `#` title.

Commit: `git commit -m "archive review round identity plan"`
