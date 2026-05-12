---
date: 2026-04-30
model: gpt-5
description: "Three low-hanging Reinix review evidence implementation options grounded in current code."
---

# Reinix Review Evidence Options

## Context

`reinix/research/reinix-review-evidence-vision.md` names a broader direction: make review loops inspectable without making the Orchestrator semantic.

Part of that direction is already implemented:

- `reinix/src/settings/agent-settings.js` requires the built-in reviewer output schema to include non-empty `summary`.
- `reinix/src/orchestrator.js` persists reviewer summaries as `review-NN.md`.
- Reviewer `agent-end` events include `reviewNoteReference`.
- Terminal policy artifacts are persisted as `terminal-decision.md`.

The next small slices should improve identity and discoverability around those existing artifacts rather than inventing new review semantics.

## Option 1: Review Round Identity In Events

Add explicit `reviewRoundIndex` fields to events that already belong to a review round.

Current grounding:

- `runWorkflow` computes the review round as `reviewHistory.length + 1` before calling the reviewer.
- `persistReviewNote` already derives `review-01.md`, `review-02.md`, and later filenames from that index.
- `policy-decision` and terminal `completion` events currently reference decisions and artifacts without explicit round identity.

Implementation surface:

- Modify `reinix/src/orchestrator.js`.
- Extend `reinix/tests/orchestrator-sequence.test.js`.

Expected result:

- Reviewer `agent-start` and `agent-end` events include `reviewRoundIndex`.
- The immediately following `policy-decision` event includes the same `reviewRoundIndex`.
- Terminal completion events caused by review policy decisions include the final `reviewRoundIndex`.

Why it is low-hanging:

- The data already exists in the Orchestrator.
- No new files, schemas, storage layout, CLI command, or policy behavior are required.
- It directly supports stale-decision integrity from the vision note.

## Option 2: Evidence Artifact References In Debug Output

Expose existing artifact references in live `--debug` output.

Current grounding:

- Reviewer `agent-end` events already include `reviewNoteReference`.
- Completion events and workflow results already include `terminalArtifact` when a policy returns one.
- `completionDebugFields` currently reports status, duration, and total cost but omits artifact references.
- `agent-end` debug output currently omits `reviewNoteReference`.

Implementation surface:

- Modify `reinix/src/orchestrator.js`.
- Extend `reinix/tests/orchestrator-sequence.test.js` or `reinix/tests/debug-reporter.test.js`.

Expected result:

- Reviewer debug `agent-end` lines include `reviewNoteReference="review-01.md"` when present.
- Completion debug lines include `terminalArtifact="terminal-decision.md"` when present.

Why it is low-hanging:

- It is a scalar debug surface change using the existing debug reporter.
- It does not alter `events.jsonl`, run metadata, policy decisions, or provider execution.
- It makes current durable artifacts easier to find while preserving the Orchestrator boundary.

## Option 3: Minimal Run Evidence Index

Create a small machine-readable run evidence index at terminal completion.

Current grounding:

- `events.jsonl` already records agent lifecycle, policy decisions, completion status, provider references, `reviewNoteReference`, and `terminalArtifact`.
- Reviewer notes and terminal decision artifacts already exist as immutable authored artifacts.
- The vision note says a round-level evidence index should be reporting or artifact-indexing, not routing logic.

Implementation surface:

- Add a small index writer near run-store or artifact-store responsibility.
- Modify `reinix/src/orchestrator.js` to accumulate references during the run and persist the index at terminal completion.
- Extend `reinix/tests/orchestrator-sequence.test.js`.

Expected result:

- Terminal runs write `evidence-index.json`.
- The index includes run ID, optional task file, rounds, producer artifact references, reviewer note references, policy decisions, terminal status, and terminal artifact reference.
- The index stores references and event-derived structure only; it does not parse reviewer note or terminal artifact content.

Why it is low-hanging:

- The evidence references now exist after ADR-011 and ADR-012.
- The first version can be JSON-only and avoid a human-rendered Markdown report.
- It provides the first concrete version of the vision's round-level evidence index.

## Recommendation

Implement Option 1 first.

It is the smallest change that improves the architecture: every later evidence index or stale-decision check benefits from explicit round identity, and the Orchestrator already has the value at the right lifecycle points.
