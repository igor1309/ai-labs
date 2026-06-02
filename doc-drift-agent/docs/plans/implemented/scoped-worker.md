---
date: 2026-06-02
model: claude-opus-4-8
description: "Implementation plan: the single-scope doc-drift worker (Shape 1) — the scope registry data and the worker's scope-parameterization — so the agent audits exactly one scope per run."
---

# Implementation Plan — Scoped doc-drift Worker (Shape 1)

Implements the worker side of `doc-drift-agent/docs/adr-specialized-openclaw-agent-readme-drift-review.md` (scoped documentation drift review). The agent **prompt** is already reframed to the scoped worker (cascade); this plan adds the **data** (scope registry) and the **scope-parameterization** the prompt refers to. Precedes the orchestrator (`docs/plans/scoped-agent-orchestration-and-observability.md`, ADR-001), which lists this worker as a precondition.

## Goal

Make the agent a true single-scope worker: a version-controlled **scope registry** (scope 0 = all READMEs, plus one scope per top-level project with docs) and the worker behavior to **take an active scope, resolve its document set, audit only that scope, and label the report with it**.

## Execution mode

```
Mode: human-review-gated
Human review between tasks: yes — review at each phase boundary.
Stop conditions: failed gates, unclear scope, missing tooling, destructive operations, explicit user interruption.
Push policy: no push (held until the user says we are done).
```

Each phase ends with its own commit; gates green before advancing; phases are never bundled. Self-review is executor discipline, not the human-review gate.

## Execution lock

```
Worktree mode: reuse existing
Expected worktree: worktrees/agent-ops-skills-todo
Expected branch: agent-ops-skills-todo
Preflight check: [ ] done
```

## Scope guardrails

- Not orchestration / scheduling / observability — owned by ADR-001 (`docs/plans/scoped-agent-orchestration-and-observability.md`).
- Not notification rendering (Shape 3) or the cron-wrapper rework.
- Not editing code/config — the worker edits only the active scope's documentation.
- The runtime spec cascade (`agent.md`, methodology, templates, etc.) is already done; this plan does not redo it.

## ADR traceability matrix

| Scope-model ADR Rule | Phase |
|---|---|
| review one scope per run; the active scope is provided to the worker | 2 |
| a scope = a project's `README.md` + `docs/` (or the cross-project README set) | 1 |
| the scope registry is the agent's own doc; scope-set drift is a finding | 1 |
| edit only the active scope's documentation | 2 (worker honors it; pinned in `agent.md`) |
| evidence-mandatory, minimum-edit discipline unchanged | 2 (inherited) |

## Phase 1 — Scope registry (data)

- **Objective:** a single source-of-truth **scope registry** enumerating scope 0 (the README set) and one scope per top-level project with docs, each with its document set (paths/globs: `README.md` + `docs/**`).
- **Key work items:** a machine-readable registry (format is an implementation choice — e.g. JSON — consumable by both the worker and the orchestrator) that `readme-inventory.md` documents; entries for the 22 derived project scopes + scope 0; the rule "a top-level project with a README/`docs/` but no scope entry (or a scope for a removed project) is registry drift."
- **Dependencies:** preconditions only.
- **Risks:** registry drifting from the real project set — covered by a coverage check.
- **Validation:** an automated **coverage check** (in the repo test suite) that derives the project-with-docs set from the working tree and asserts the registry covers exactly that set (a missing or extra scope fails). The registry parses; every scope names a non-empty document set.
- **Completion signal:** the coverage check passes in CI; the registry lists scope 0 + the 22 project scopes.

## Phase 2 — Worker scope-parameterization

- **Objective:** the worker takes an **active scope**, resolves its documents from the registry, audits only that scope, and labels the report.
- **Key work items:** `agent.md` parses a `--scope <id>` token (the way `--scheduled` is parsed today); resolves the scope's document set from the registry; restricts inspection and edits to that set; emits the `Scope:` header per `report-format.md`. Define the default when no `--scope` is given (e.g. scope 0).
- **Dependencies:** Phase 1.
- **Risks:** the LLM reading the wrong scope or leaking outside it — bounded by the explicit registry-resolved document set and the "edit only the active scope" hard constraint.
- **Validation:** a controlled run with `--scope <id>` (e.g. `oracle`) produces a report whose `Scope:` is that id and whose findings reference only that scope's documents (integration check on the VPS / a dry run); a run with no `--scope` defaults as specified. The report shape conforms to `report-format.md`.
- **Completion signal:** a per-scope run audits only the named scope and labels the report with it.

## Done criteria

- The scope registry covers scope 0 + every top-level project with docs (coverage check green in CI); a project added/removed without a matching scope entry fails the check.
- A worker run for a given scope inspects and edits **only** that scope's documents and emits the correct `Scope:` label.
- The agent prompt + registry are internally consistent with the already-cascaded specs (`drift-methodology.md`, `fix-pr-template.md`, `report-format.md`).
- No orchestration, scheduling, rendering, or code-editing behavior was introduced (out of scope).

## Final closeout

```
Final gates: ./scripts/run_silent.sh "tests" npm test ; ./scripts/run_silent.sh "build" npx tsc --noEmit (the registry coverage check) ; one controlled per-scope worker run observed.
Archive plan: git mv doc-drift-agent/docs/plans/scoped-worker.md doc-drift-agent/docs/plans/implemented/ in the SAME change set as the implementation.
Commit archive move: yes
Push/PR: follow push policy (no push until the user says we are done).
```
