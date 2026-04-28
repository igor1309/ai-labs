---
date: 2026-04-28
model: gpt-5
description: "TODO plan for learning from agent-develop-review-loop and applying selected ergonomics to Regentara"
---

# Learn From Develop Review Loop TODO

## Source

- Prior art: `https://github.com/geserdugarov/agent-develop-review-loop`
- Compared commit: `74cd387a0cd20c408e9baac635288224ef626d08`
- Regentara baseline: current `regentara` MVP workflow runner and ADR/spec set.

## Execution Mode

Execution mode: auto-continue
Human review between tasks: no
Worktree mode: create new
Expected worktree: `worktrees/regentara-develop-review-loop-learnings`
Expected branch: `codex/regentara-develop-review-loop-learnings`
Push policy: no push
Final archive behavior: move this plan to `regentara/docs/plans/implemented/` after every TODO is implemented, verified, logged, and committed.
Preflight check: [ ] done

## Comparison

`agent-develop-review-loop` is a small Bash wrapper around one concrete workflow: Claude implements a task, Codex reviews the cumulative git diff, and Claude receives the review until Codex emits `REVIEW_PASSED` or the iteration cap is reached. It optimizes for immediate usefulness, minimal setup, and visible local artifacts in `.develop-review-loop/`.

Regentara is a governed orchestration package. It validates `agents.yaml` and `models.yaml`, invokes configured provider CLIs, validates JSON runtime output, persists runs under `~/.regentara/runs/`, preserves artifact invariants, and delegates every review routing decision to an injected `ReviewFixPolicy`. It optimizes for durable contracts and provider-agnostic orchestration, but it does not yet offer a simple runnable local path with defaults.

## TODO

### 1. Add a Batteries-Included Local Demo

- [ ] Add a sample `.regentara/agents.yaml` and `.regentara/models.yaml` under Regentara docs or examples.
- [ ] Add a documented demo policy that maps an acceptable review to `complete-ok`, a rejected review to `remediate`, and exhausted budget to `complete-fail`.
- [ ] Keep the demo clearly outside production composition so Regentara still requires explicit policy injection for real use.
- [ ] Verify the demo path with a local smoke command and document the exact command.

### 2. Add Watch and Progress Ergonomics

- [ ] Define the minimal run progress surface Regentara should expose without weakening artifact immutability.
- [ ] Add a follow command or documented shell recipe that tails the latest run output under `~/.regentara/runs/`.
- [ ] Include run ID, current agent, current decision state, and final status in the watched surface.
- [ ] Verify the watch path against a fake or sample run directory.

### 3. Add a Plain-Text Provider Output Bridge

- [ ] Specify how Regentara should adapt provider CLIs that emit mixed text instead of clean JSON stdout.
- [ ] Add an adapter boundary that can extract or request the configured JSON payload without changing the Orchestrator's JSON-schema contract.
- [ ] Decide whether malformed or missing extracted JSON remains a runtime failure under the existing fail-fast ADR.
- [ ] Cover clean JSON, mixed text with extractable JSON, and mixed text without extractable JSON in tests.

## Verification

Docs-only changes to this plan require:

- [ ] Markdown front matter is present.
- [ ] Exactly one `#` title is present.
- [ ] Execution mode, human review behavior, worktree mode, expected worktree, expected branch, push policy, final archive behavior, and preflight status are declared.
- [ ] Regentara log is updated when this plan is created or materially changed.
- [ ] Git diff is limited to the plan, relevant log entries, and any later files required by checked TODOs.
