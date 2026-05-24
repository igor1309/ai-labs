---
date: 2026-04-30
model: gpt-5
description: "Implementation plan for linking Reinix evidence index entries to policy decision events."
---

# Stale Decision Integrity Evidence Index Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen stale-decision integrity by linking each evidence-index round and terminal entry to the policy-decision event that produced it.

**Architecture:** Keep the Orchestrator semantic-free: add structural event identifiers generated when policy-decision events are emitted, then copy those references into `evidence-index.json`. Do not parse reviewer notes, terminal artifacts, policy sessions, provider output text, Git state, branches, commits, or pull requests.

**Tech Stack:** Node.js ESM, `node:test`, Reinix Orchestrator, existing `scripts/run_silent.sh` verification wrapper.

---

## Execution Lock

- Execution mode: auto-continue
- Human review between tasks: no
- Worktree mode: reuse existing
- Expected worktree: `/Users/igormalyarov/Developer/my-apps/ai-labs/ai-labs/worktrees/reinix-evidence-options`
- Expected branch: `codex/reinix-evidence-options`
- Push policy: no push
- Final archive behavior: move this plan to `reinix/docs/plans/implemented/` after implementation and final verification.
- Preflight check: [x] done

## Source Documents

- Vision: `reinix/research/reinix-review-evidence-vision.md`
- Existing evidence index implementation: `reinix/src/orchestrator.js`
- Existing tests: `reinix/tests/orchestrator-sequence.test.js`

## File Structure

- Modify: `reinix/src/orchestrator.js`
  - Generate a stable run-local `policyDecisionReference` such as `policy-decision-01`.
  - Include it on `policy-decision` events.
  - Include it on matching `evidence-index.json` round entries and terminal entry.
- Modify: `reinix/tests/orchestrator-sequence.test.js`
  - Extend current evidence-index tests to assert the policy decision references.
- Modify: `reinix/docs/log.md`
  - Add a concise entry describing the integrity link.

## Task 1: Link Evidence Index To Policy Decision Events

**Files:**

- Modify: `reinix/tests/orchestrator-sequence.test.js`
- Modify: `reinix/src/orchestrator.js`
- Modify: `reinix/docs/log.md`

- [x] **Step 1: Write failing tests**

Extend existing evidence-index tests to assert:

```js
rounds: [
  {
    policyDecision: "complete-ok",
    policyDecisionReference: "policy-decision-01",
    producerArtifact: "producer/result.json",
    reviewNoteReference: "review-01.md",
    reviewRoundIndex: 1,
  },
],
terminal: {
  policyDecisionReference: "policy-decision-01",
  status: "succeeded",
  terminalArtifact: "terminal-decision.md",
}
```

For the remediated run, assert `policy-decision-01` and `policy-decision-02`, with terminal referencing `policy-decision-02`.

- [x] **Step 2: Run RED**

Run: `./scripts/run_silent.sh "stale-decision-index-red" node --test reinix/tests/orchestrator-sequence.test.js`

Expected: FAIL with missing `policyDecisionReference` fields. Compilation errors are not RED.

- [x] **Step 3: Implement minimal structural references**

In `runWorkflow`, derive:

```js
const policyDecisionReference = `policy-decision-${String(reviewRoundIndex).padStart(2, "0")}`;
```

Add it to:

- the `policy-decision` event
- the evidence round pushed for that review round
- the terminal section of `evidence-index.json` for terminal policy decisions

- [x] **Step 4: Run targeted GREEN**

Run: `./scripts/run_silent.sh "stale-decision-index-green" node --test reinix/tests/orchestrator-sequence.test.js`

Expected: PASS.

- [x] **Step 5: Update log**

Add a 2026-04-30 entry to `reinix/docs/log.md` describing policy-decision references in the evidence index.

- [x] **Step 6: Run full gates**

Run: `./scripts/run_silent.sh "tests" npm test`

Run: `./scripts/run_silent.sh "build" npx tsc --noEmit`

Expected: both PASS.

- [x] **Step 7: Commit implementation**

Commit: `git commit -m "link evidence index to policy decisions"`

- [x] **Step 8: Mark implemented and archive plan**

Move this plan to `reinix/docs/plans/implemented/stale-decision-integrity-evidence-index.md`.

Commit: `git commit -m "archive stale decision integrity plan"`
