---
date: 2026-06-02
model: claude-opus-4-8
description: "Repo-specific process gates for plan authoring, archiving, and PR work — read when planning, implementing, or opening a PR"
---

# Process Gates

Repo-specific addenda to the `process-gates` skill, for plan authoring, implementation, and PR work. Read when planning, implementing, or opening a PR. (Always-on verification commands stay in the root `CLAUDE.md`.)

- Log locations: `docs/log.md` (repo-level), `<project>/docs/log.md` (project-level).
- Plans directory: `docs/plans/` → `docs/plans/implemented/` (or `<project>/docs/plans/` → `<project>/docs/plans/implemented/`).
- Worktree convention: `worktrees/<slug>` with branch `<slug>`.
- Implementation plans must follow `docs/my-way/05-implementation-plan/structure.md`. Required sections are `Goal`, `Execution mode`, `Execution lock`, `Scope guardrails`, phases/tasks, `Done criteria`, and `Final closeout`.
- Missing required implementation-plan sections are a fail, not a style warning. Do not substitute scattered equivalent bullets for required headings.
- Implementation plans must declare execution mode, human-review behavior, worktree mode, push policy, and final archive behavior.
- Default preferred execution mode is `auto-continue` unless the plan explicitly says `human-review-gated`.
- Completed plans move to the relevant `implemented/` directory as the final closeout step. The move (`git mv docs/plans/<name>.md docs/plans/implemented/<name>.md`) ships in the **same PR as the implementation**, not as a follow-up PR — the merge is the moment the plan becomes implemented, so trunk never sees a state where the implementation is in but the plan still sits in `docs/plans/` as "to do".
- Before committing or opening a PR for implementation-plan changes, run adversarial review against the implementation-plan review skill and mandatory structure. Fix fail/warn findings before committing or opening the PR.
- PR titles and bodies for plan/implementation PRs must be derived from the plan goal, scope, source artifacts, verification gates, and changed docs/code. Do not use a vague commit-summary title or body when a plan provides better context.
- Before opening a PR after substantial implementation or documentation movement, refresh `docs/loc-dashboard.html` from `./scripts/loc-dashboard.sh --sort=name` and verify the summary cards, table footer, `data` array, and `Last updated` line match the script output.
