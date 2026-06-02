---
date: 2026-06-02
model: claude-opus-4-8
description: "Implementation plan: relocate the top-level doc-drift-agent project under agents/ (consolidation follow-up), dropping its dedicated drift scope to match maestro-flow-review-agent, with all CI/dashboard/registry surfaces updated."
---

# Implementation Plan — Relocate `doc-drift-agent` under `agents/`

Completes the tracked "consolidate the existing top-level agents into `agents/`"
follow-up (recorded in `docs/log.md`; `maestro-flow-review-agent` already lives
under `agents/`). Moves `doc-drift-agent/` → `agents/doc-drift-agent/`.

## Goal

Relocate the `doc-drift-agent` project directory under `agents/` so the fleet
agents share one home, keeping the **agent id `doc-drift-agent` unchanged** (the
VPS workspace, Telegram routing, and cron are untouched). Per the chosen scope
model, the project's own docs stop being a dedicated drift scope — matching the
already-relocated `maestro-flow-review-agent`.

## Execution mode

```
Mode: auto-continue
Human review between tasks: no — the plan itself is human-reviewed before execution; phases then auto-continue after green gates + local commit.
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption, any unmet precondition.
Push policy: push at closeout (single PR).
```

Each phase ends with its own commit; gates green before advancing; phases are
never bundled. Phase 1 must leave the build/test suite green on its own.

## Execution lock

```
Worktree mode: reuse existing
Expected worktree: worktrees/relocate-doc-drift-agent
Expected branch: relocate-doc-drift-agent
Preflight check: [ ] done
```

Preconditions:

- [ ] Branch is off the merged `trunk` containing the Shape-2 scope-select work
  (`agents/`-bound paths below assume `doc-drift-agent/scope-select/` exists).

## Scope guardrails

Out of scope for this plan:

- **No agent-id rename.** The OpenClaw agent id stays `doc-drift-agent`; the VPS
  workspace (`workspace-doc-drift`), Telegram account/topic routing, and
  `/etc/cron.d` entry are NOT touched. Only the in-repo project path moves.
- **No behavior change** to the worker, the scope-select selection logic, or the
  orchestrator phases (ADR-001 Phases 4–6 remain separate, pending work).
- **No broadening of the `agents` scope.** Per the chosen scope model, the
  relocated agent's own docs become unscoped (consistent with maestro); the
  `agents` scope stays `agents/README.md` only.
- Not a release-unit change (`doc-drift-agent` is not in `release-units.toml`).

## Phase 1 — Relocate the tree and keep gates green

- **Objective:** the directory is moved and the full TS test suite + `tsc` build
  pass, with no broken intermediate state.
- **Key work items:**
  - `git mv doc-drift-agent agents/doc-drift-agent`.
  - **Scope registry** (`agents/doc-drift-agent/agent/scope-registry.json`):
    remove the `doc-drift-agent` scope (scope-model: drop it); **remove**
    `doc-drift-agent/README.md` from the `readmes` scope — do NOT repath it.
    This matches maestro: nested agent READMEs under `agents/` are not in the
    cross-project `readmes` set, which already carries `agents/README.md` for the
    fleet. (`dashboard-sync-agent/README.md` stays — it is still top-level until
    its own relocation.)
  - **Coverage test** (`agents/doc-drift-agent/tests/scope-registry.test.js`):
    fix `repoRoot` — the file moved one level deeper, so the
    `new URL('../../', import.meta.url)` repo-root anchor becomes
    `new URL('../../../', import.meta.url)`. (The sibling
    `../agent/scope-registry.json` URL stays valid.)
  - **Root `package.json`** test script: `doc-drift-agent/tests/*.test.js` →
    `agents/doc-drift-agent/tests/*.test.js`.
  - **CI**: `.github/workflows/doc-drift-agent-core.yml` (test glob),
    `.github/workflows/doc-drift-agent-sync.yml` (rsync source path + trigger
    `paths`), and `.github/workflows/ci.yml` path filter
    (`doc-drift-agent: - "doc-drift-agent/**"` → `"agents/doc-drift-agent/**"`
    and the `doc-drift-agent-core.yml` path). Keep workflow filenames and job
    ids (`doc-drift-agent-core`) as-is — the agent id is unchanged.
  - **In-tree path references**: update `agent.md`'s
    `doc-drift-agent/agent/scope-registry.json` reference and any other
    `doc-drift-agent/`-prefixed paths in `agents/doc-drift-agent/agent/*.md`
    that denote repo-relative locations (not the agent id).
- **Dependencies:** preconditions only.
- **Risks:** a missed path reference leaves a broken glob or a failing coverage
  test (top-level `doc-drift-agent` no longer exists, so a lingering scope or a
  wrong repoRoot fails) — caught by the gate. The `ci.yml` change-filter must
  still route `agents/doc-drift-agent/**` to the doc-drift core job.
- **Validation:** `./scripts/run_silent.sh "tests" node --test agents/doc-drift-agent/tests/*.test.js` (registry coverage + scope-select suites) and
  `./scripts/run_silent.sh "build" npx tsc --noEmit` both green. (The full
  `npm test` is not used as the local gate — it trips on an unrelated pre-existing
  `agonara` workspace-bin gap; CI's `doc-drift-agent-core` job validates the
  relocated glob + the `ci.yml`/sync path-filter changes end-to-end on the PR.)
  `grep -rn "doc-drift-agent/"` over `*.js`, `*.json`, `*.yml`, `*.md` returns no
  stale top-level paths — only `agents/doc-drift-agent/` paths and bare
  `doc-drift-agent` agent-id usages remain.
- **Completion signal:** suite + build green from the new location; no top-level
  `doc-drift-agent/` directory remains.

## Phase 2 — Dashboard and registry-of-record surfaces

- **Objective:** the project registries reflect the relocation (doc-drift-agent
  folds into the `agents` row, no standalone row).
- **Key work items:**
  - `scripts/loc-dashboard.sh`: remove `doc-drift-agent` from the `ROW PROJECTS`
    header comment, the per-project `for proj in …` loop, and the `known` list
    in `check_project_drift` (its LOC now counts under `agents`).
  - `docs/loc-dashboard.html`: remove the `doc-drift-agent` `data` row, fold its
    lines into the `agents` row, and refresh the summary cards, table footer,
    `data` array, and `Last updated` from `./scripts/loc-dashboard.sh --sort=name`.
  - `docs/products.html`: remove/adjust the `doc-drift-agent` card if present so
    it matches the Components set.
  - `README.md` `## Components`: **remove** the standalone `doc-drift-agent` row
    so it folds under the `agents` entry — matching maestro, whose top-level row
    was removed when it moved under `agents/`.
- **Dependencies:** Phase 1.
- **Risks:** dashboard drift (the New Project Checklist surfaces disagree) — the
  drift check in `loc-dashboard.sh` flags unknown/missing dirs; run it.
- **Validation:** `./scripts/loc-dashboard.sh --sort=name` runs with no drift
  warnings and its totals match `docs/loc-dashboard.html` (cards, footer, `data`).
  Markdown structure + required Components row reviewed.
- **Completion signal:** `loc-dashboard.sh` reports no project drift; the HTML and
  README match the script output.

## Phase 3 — Logs and closeout

- **Objective:** the relocation is recorded and the plan is archived.
- **Key work items:**
  - `agents/doc-drift-agent/docs/log.md` (project log, now relocated): entry noting
    the move under `agents/` and the dropped drift scope.
  - `docs/log.md` (repo log): entry summarizing the relocation + affected surfaces.
  - `git mv docs/plans/relocate-doc-drift-agent-under-agents.md docs/plans/implemented/` in this same PR.
- **Dependencies:** Phases 1–2.
- **Validation:** docs-only; verify Markdown structure, front matter on the plan,
  and git diff scope.
- **Completion signal:** both logs updated; the plan sits under
  `docs/plans/implemented/`.

## Done criteria

- `doc-drift-agent/` no longer exists at top level; the project lives at
  `agents/doc-drift-agent/` with the agent id `doc-drift-agent` unchanged.
- The `doc-drift-agent` drift scope is removed; the coverage test passes from the
  new location; the `readmes` scope points at `agents/doc-drift-agent/README.md`.
- Full TS suite + `tsc` build pass; CI path filters route the relocated paths to
  the existing `doc-drift-agent-core`/`-sync` workflows.
- All New Project Checklist surfaces (loc-dashboard.sh/.html, products.html,
  README Components) agree with `loc-dashboard.sh --sort=name`.
- No VPS-side change is required; the sync workflow ships from the new source path
  on the next `trunk` merge.
- Both logs updated; plan archived in the same PR.

## Final closeout

```
Final gates: ./scripts/run_silent.sh "tests" node --test agents/doc-drift-agent/tests/*.test.js ; ./scripts/run_silent.sh "build" npx tsc --noEmit ; ./scripts/loc-dashboard.sh --sort=name (no drift; matches HTML). CI's doc-drift-agent-core job is the end-to-end gate for the workflow/path-filter changes.
Archive plan: git mv docs/plans/relocate-doc-drift-agent-under-agents.md docs/plans/implemented/ in the SAME PR as the implementation.
Commit archive move: yes
Push/PR: push at closeout; one PR titled for the relocation, based on `scoped-orchestrator-gateway` (merge `relocate-doc-drift-agent` → `scoped-orchestrator-gateway`, not `trunk`); merge --merge --auto --delete-branch.
```
