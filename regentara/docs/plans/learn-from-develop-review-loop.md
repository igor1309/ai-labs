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

`agent-develop-review-loop` is an operationally useful prototype of one exact implement-review-fix loop. It assumes the target project is the current working directory, verifies that the task file, `claude`, `codex`, and a git worktree are available, records `START_REF="$(git rev-parse HEAD)"`, and then repeats a concrete sequence: Claude edits the working tree, Codex reviews `git diff "$START_REF"`, and Claude receives the previous Codex review as the next fix prompt. The review surface is deliberately cumulative, so each review evaluates the whole delta from loop start instead of only the latest fix.

Its control contract is plain text and sentinel-based. Codex must end each review with exactly one final-line token, `REVIEW_PASSED` or `REVIEW_FAILED`; the script checks only the last few lines with an anchored grep and treats anything other than a final passing sentinel as failure. Runtime artifacts are simple local files under `.develop-review-loop/`: Claude logs, Codex review files, and a final `summary.md` with task path, iteration count, verdict, start ref, duration, and final review file. The companion watcher follows the newest artifact, making the loop easy to observe without understanding any internal state model.

The prototype also has intentionally weak boundaries. Claude is prompted not to commit, but the script does not mechanically prevent commits or verify that no commit happened. It relies on uncommitted working-tree diffs as the handoff surface, keeps policy as a hard-coded pass/fail sentinel loop with a maximum iteration cap, and has no typed agent contracts, provider routing, JSON schema validation, persistent run identity, artifact immutability model, or separable review policy.

Regentara is the inverse tradeoff. It is a governed orchestration package that validates `agents.yaml` and `models.yaml`, invokes configured provider CLIs, validates runtime JSON against configured schemas, persists runs under `~/.regentara/runs/`, preserves artifact invariants, and delegates every post-review routing decision to an injected `ReviewFixPolicy`. Its core loop is provider-agnostic and policy-driven: Producer creates work evidence, Reviewer returns a structured verdict, policy decides `complete-ok`, `complete-fail`, or `remediate`, and Remediator produces the next valid task.

The lesson is not to copy the Bash script wholesale. Regentara should preserve its stronger contracts and explicit boundaries, but borrow the prototype's product ergonomics where they expose real workflow value: a runnable local demo path, a simple way to watch current progress, and a provider-output bridge for CLIs that naturally emit human text before they can satisfy Regentara's JSON-schema contract.

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
