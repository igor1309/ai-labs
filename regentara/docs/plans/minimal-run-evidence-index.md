---
date: 2026-04-30
model: gpt-5
description: "Implementation plan for a minimal Regentara run evidence index."
---

# Minimal Run Evidence Index Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a minimal `evidence-index.json` at terminal completion so a run's evidence beads can be discovered without parsing Markdown artifacts.

**Architecture:** Build the first index from Orchestrator-known structural references only: run ID, task file, round number, producer artifact references, reviewer note references, policy decisions, terminal status, and terminal artifact reference. Do not parse reviewer notes, terminal artifact content, provider output text, Git state, branches, commits, or policy session internals.

**Tech Stack:** Node.js ESM, `node:test`, Regentara Orchestrator/run artifact storage, root `scripts/run_silent.sh` verification wrapper.

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
- Vision: `regentara/research/regentara-review-evidence-vision.md`
- Artifact policy: `regentara/docs/adr/adr-004-run-artifact-storage-and-mutation-policy.md`
- Terminal artifact spec: `regentara/docs/specs/terminal-decision-artifact.md`
- Reviewer note spec: `regentara/docs/specs/reviewer-authored-review-note.md`

## File Structure

- Modify: `regentara/src/orchestrator.js`
  - Accumulate per-round evidence references during the workflow and write the index at policy-terminal completion.
- Optionally modify: `regentara/src/artifact-store.js`
  - Reuse `createAuthoredArtifact` for immutable `evidence-index.json` persistence if no new helper is needed.
- Modify: `regentara/tests/orchestrator-sequence.test.js`
  - Cover one-round and remediated runs.
- Modify: `regentara/docs/log.md`
  - Add concise implementation entry.

## Task 1: Persist Minimal Evidence Index

**Files:**

- Modify: `regentara/tests/orchestrator-sequence.test.js`
- Modify: `regentara/src/orchestrator.js`
- Modify: `regentara/docs/log.md`

- [x] **Step 1: Run implementation preflight**

Run: `git worktree list --porcelain`

Run: `git branch --show-current`

Expected: current path is the dedicated worktree and branch is `codex/regentara-evidence-options`.

- [x] **Step 2: Write failing one-round index test**

Add a test that runs one successful review and asserts `evidence-index.json` exists with:

```json
{
  "runId": "<actual run id>",
  "taskFile": "tasks/implement.md",
  "rounds": [
    {
      "reviewRoundIndex": 1,
      "producerArtifact": "producer/result.json",
      "reviewNoteReference": "review-01.md",
      "policyDecision": "complete-ok"
    }
  ],
  "terminal": {
    "status": "succeeded",
    "terminalArtifact": "terminal-decision.md"
  }
}
```

Use the actual fake-driven test helpers and assert only stable fields.

- [x] **Step 3: Run RED**

Run: `./scripts/run_silent.sh "evidence-index-red" node --test regentara/tests/orchestrator-sequence.test.js`

Expected: FAIL because `evidence-index.json` is missing. Compilation errors are not RED.

- [x] **Step 4: Implement minimal one-round index**

Accumulate the producer artifact, reviewer note reference, policy decision, terminal status, and terminal artifact reference in local Orchestrator state.

Persist `evidence-index.json` with `createAuthoredArtifact` before emitting terminal completion or immediately adjacent to terminal artifact persistence.

- [x] **Step 5: Run targeted GREEN**

Run: `./scripts/run_silent.sh "evidence-index-green" node --test regentara/tests/orchestrator-sequence.test.js`

Expected: PASS.

- [x] **Step 6: Add remediated-run test**

Add a second test for two rounds. Assert that `rounds.map((round) => round.reviewRoundIndex)` is `[1, 2]`, the first round has `policyDecision: "remediate"`, and the terminal object reflects the final decision.

- [x] **Step 7: Run targeted GREEN**

Run: `./scripts/run_silent.sh "evidence-index-remediated-green" node --test regentara/tests/orchestrator-sequence.test.js`

Expected: PASS.

- [x] **Step 8: Update log**

Add a 2026-04-30 entry to `regentara/docs/log.md` describing the new minimal evidence index.

- [x] **Step 9: Run full gates**

Run: `./scripts/run_silent.sh "tests" npm test`

Run: `./scripts/run_silent.sh "build" npx tsc --noEmit`

Expected: both PASS.

- [ ] **Step 10: Commit implementation**

Commit: `git commit -m "add minimal evidence index"`

- [ ] **Step 11: Mark implemented and archive plan**

Move this plan to `regentara/docs/plans/implemented/minimal-run-evidence-index.md` after implementation and review pass.

Commit: `git commit -m "archive evidence index plan"`
