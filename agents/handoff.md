---
date: 2026-06-02
model: claude-opus-4-8
description: "Session handoff: scoped-agent orchestrator (ADR-001) Phases 1–3 merged; doc-drift-agent relocation executed AND merged into gateway (5b4c6e31c); next is the Phase 4 Lobster substrate spike (human-review-gated, live gateway/VPS)."
---

# Session Handoff — Scoped Doc-Drift Orchestrator + Relocation

How to use: read top-to-bottom in a new session. Repo root:
`/Users/igormalyarov/Developer/my-apps/ai-labs/ai-labs`. This repo uses git
worktrees heavily — the harness default cwd is an unrelated worktree
(`worktrees/agonara-student-attempt-api`), so always `cd` into the right worktree
or use `EnterWorktree`.

## Integration strategy (user's intent)

- A new session executes the **relocation plan** on branch
  `relocate-doc-drift-agent`, then **merges that branch INTO
  `scoped-orchestrator-gateway`** (the integration branch) — NOT a separate
  trunk PR. (Adjust the plan's Final closeout accordingly: merge target is the
  gateway branch, not trunk.)
- `scoped-orchestrator-gateway` then carries: relocation + Phase 4–6, and
  eventually opens ONE PR to trunk.
- **This handoff lives on `scoped-orchestrator-gateway`** so it survives and stays
  the source of truth for the integration work. Update it as phases land.

## Big picture

Building the **Shape-2 scoped-agent orchestrator** for `doc-drift-agent` (a
specialized OpenClaw agent that audits documentation drift one scope per run and
opens fix PRs). Governing design:

- ADR: `docs/adr/agents/ADR-001-scoped-agent-orchestration-and-observability.md`
- Plan (6 phases): `docs/plans/scoped-agent-orchestration-and-observability.md` (in `plans/`, phases 4–6 remain)
- Shapes: `doc-drift-agent/docs/scoped-audit-pre-adr-shapes.md` (Shape 1 worker, Shape 2 orchestrator, Shape 3 rendering — only Shape-2 Phases 4–6 remain)
- Research (verified vs live VPS): `agents/research/{openclaw-lobster,openclaw-taskflow,scoped-agent-orchestration}.md`

The orchestrator does NOT replace Lobster — it is the tested `select`/`commit`
step CLIs a Lobster pipeline calls; Lobster + TaskFlow/tasks ledger give
durability/observability.

## Current state (trunk = dd981833; PR #457 merged)

Merged to trunk:
- **PR #455** — Shape-1 worker (`--scope`, `scope-registry.json`) + ADR-001 groundwork.
- **PR #457** — Shape-2 **Phases 1–3**: the pure, tested selection layer under
  `doc-drift-agent/scope-select/`:
  - `scopes.js` `loadScopeIds(registry)`.
  - `select.js` `selectScopes({scopeIds,state,changed,stale,budget=1})` — changed-before-stale,
    least-recently-audited within class (by parsed instant), capped at budget, `[]` when none. (Singular `selectScope` retired.)
  - `eligibility.js` — `isChangedEligible`, `changedPathsSince` (injected `runGit`),
    `eligibleScopes`, `isStaleEligible`, `staleScopes` (per-scope `stalenessDays`), `DAY_MS`.
  - `state.js` — `commitScope`, `pruneState`, `readState` (absent ⇒ `{}` all-stale), `writeStateAtomic` (temp+rename).
  - `select-cli.js` (`--registry --state --repo --budget --staleness-days=30 --now`),
    `commit-cli.js` (`--registry --state --scope --commit --at`).
  - Tests: `doc-drift-agent/tests/scope-select*.test.js` (pure; injected git/clock facts).

## Worktrees / branches (live now)

- `worktrees/relocate-doc-drift-agent` (`relocate-doc-drift-agent`): relocation plan
  **executed (all 3 phases) and fully merged into `scoped-orchestrator-gateway`** — 0
  commits ahead of gateway. Worktree is **cleanup-ready** (`git worktree remove`).
- `worktrees/scoped-orchestrator-gateway` (`scoped-orchestrator-gateway`): integration
  branch, at `5b4c6e31c`. Carries relocation + this handoff. Gates green: 31/31
  `agents/doc-drift-agent/tests/*` pass, `tsc --noEmit` ok. `doc-drift-agent/` now lives
  at `agents/doc-drift-agent/` with `scope-select/` (Phases 1–3) intact. The earlier WIP
  `smoke.lobster` was **removed** (used the disproven `openclaw.invoke` mechanism) — to be
  recreated in Phase 4 with the subprocess mechanism at `agents/doc-drift-agent/runtime/smoke.lobster`.

## NEXT ACTIONS — Phase 4 (Lobster substrate spike), human-review-gated

The plan (`docs/plans/scoped-agent-orchestration-and-observability.md`) is
`human-review-gated`; Phases 4–6 each require human review before starting because they
touch the live gateway/VPS. **Phase 4 also needs explicit per-session SSH authorization
naming the VPS host.** Do not proceed into live/destructive ops without it.

1. Recreate the smoke `.lobster` at `agents/doc-drift-agent/runtime/smoke.lobster` using the
   subprocess mechanism (`openclaw agent`, NOT `openclaw.invoke`). Validate locally with the
   bundled runner: `graph --file --format ascii` + `run --dry-run` (non-destructive, file-based).
2. Run it gateway-side and **assert the ledger from `openclaw tasks … --json`** (parsed status):
   a clean run registers a terminal status; an induced-failure run shows `failed`. (This is the
   one OPEN Phase-4 item.)
3. Commit the smoke `.lobster` + record the audit-step mechanism decision. Then gate to Phase 5.

Relocation cleanup (housekeeping, any time): `git worktree remove worktrees/relocate-doc-drift-agent`.

## Relocation plan — key decisions baked in

Move `doc-drift-agent/` → `agents/doc-drift-agent/` (consolidation; maestro already there).
- **Agent id stays `doc-drift-agent`** — VPS workspace (`workspace-doc-drift`), Telegram routing, `/etc/cron.d` NOT touched. Only the in-repo path moves.
- **Scope model = match maestro**: remove the `doc-drift-agent` scope; **remove** `doc-drift-agent/README.md` from the `readmes` scope (do NOT repath; `agents/README.md` covers the fleet). `dashboard-sync-agent` stays top-level for now.
- Phase 1 (one green commit): `git mv`; registry edits; coverage-test `repoRoot` `../../`→`../../../` (file one level deeper); root `package.json` test glob; `.github/workflows/doc-drift-agent-core.yml` + `doc-drift-agent-sync.yml` + `ci.yml` path filters (keep workflow/job names); `agent.md` registry path ref.
- Phase 2: `scripts/loc-dashboard.sh` (drop from loop/known/header → folds into `agents`), `docs/loc-dashboard.html`, `docs/products.html`, README `## Components` (remove standalone row).
- Phase 3: logs (`docs/log.md` + relocated `agents/doc-drift-agent/docs/log.md`) + `git mv` plan to `docs/plans/implemented/`.

## Phase 4 spike (paused) — findings + decisions

Goal: prove in-gateway Lobster + resolve ADR-001 risk (embedded Lobster "does not reliably support `openclaw.invoke` for nested calls").

- Lobster plugin **loaded + enabled** (`tools.alsoAllow:["lobster"]`). No standalone `lobster` on PATH; bundled runner: `node ~/.openclaw/extensions/lobster/node_modules/@clawdbot/lobster/bin/lobster.js` (`run --file`, `run --dry-run`, `graph --file --format ascii|mermaid|dot`).
- `.lobster` schema (from OpenClaw examples `~/.npm-global/lib/node_modules/openclaw/skills/taskflow/examples/*.lobster`): `name:` + `steps:` each `{id, command, stdin: $step.stdout, condition}`.
- **`command:` runs via `/bin/sh` in BOTH standalone and in-gateway.** `openclaw.invoke` is NOT a shell binary → fails `127` in both. → **MECHANISM DECISION: audit step = `openclaw agent` subprocess**, not `openclaw.invoke`.
- Ledger = `openclaw tasks list/show/flow --json`. **OPEN**: confirm a clean (passing) in-gateway smoke registers a terminal status; also assert an induced-failure run shows `failed`. (Standalone runs don't register; the one prior run failed at the invoke step.)
- Driver agent for the nightly turn: **user chose a NEW dedicated orchestrator agent** (driver ≠ worker). NO `ai-labs` agent exists — `ai-labs` is the shared Telegram account. Agents: `main`(default), `doc-drift-agent`, `dashboard-sync-agent`, `maestro-flow-review-agent`, `son`, `wife`.
- Recreate the smoke `.lobster` (subprocess mechanism) at `agents/doc-drift-agent/runtime/smoke.lobster` post-relocation; `graph` + `--dry-run` validate; run in-gateway; assert ledger.

## Environment / key facts

- **VPS**: RackNerd `107.172.143.196`, user `openclaw`, OpenClaw `2026.5.28`. SSH allowed but the safety classifier needs EXPLICIT per-session user authorization naming the host. `openclaw` bin: `/home/openclaw/.npm-global/bin/openclaw`.
- doc-drift-agent on VPS: agent id `doc-drift-agent`, workspace `/home/openclaw/.openclaw/workspace-doc-drift` (prompt `AGENTS.md`, synced from `…/agent/agent.md` by `doc-drift-agent-sync.yml` on trunk merge, renaming `agent.md`→`AGENTS.md`). Source clone `/home/openclaw/ai-labs` (on trunk). Telegram: account `ai-labs` (`@igor1309_ai_labs_bot`), supergroup `-1003954520541`, `#doc-drift` thread 4.
- **Gates**: `./scripts/run_silent.sh "tests" <cmd>` and `… "build" npx tsc --noEmit`. Never bare `npm test`/`tsc`.
- **Conventions**: JS ESM + `node:test`, Node built-ins only for doc-drift; strict TDD; plans follow `docs/my-way/05-implementation-plan/structure.md`; trunk protected (PRs only; `--merge --auto --delete-branch`).
- **Logs**: repo `docs/log.md`; project `doc-drift-agent/docs/log.md` (→ `agents/doc-drift-agent/docs/log.md` after relocation).

## Gotchas

- Full `npm test` FAILS on an unrelated pre-existing `agonara` workspace-bin gap (passes in CI). Do NOT chase it / touch agonara. Use targeted globs locally.
- `EnterWorktree` sometimes errors `ERR_STREAM_PREMATURE_CLOSE` on `git worktree list` — retry, or `cd` per command. Harness may reset cwd after each Bash call.
- `.claude/settings.local.json` shows modified in worktrees — local permission state; never commit; force-removing worktrees over it is fine.
- After a fresh `EnterWorktree`, re-Read files before Edit (cache clears).

## User decisions log (this session)

- Orchestrator under `doc-drift-agent/` (not new top-level) — "promote only when real deps exist".
- Dir named `scope-select` (Lobster is the orchestrator; these are its selection steps).
- Phase-4 driver = new dedicated orchestrator agent.
- doc-drift-agent: relocate under `agents/`; scope model = match maestro (drop scope).
- Plan-first for relocation: draft → review → execute.
- Integration: relocation merges INTO `scoped-orchestrator-gateway`; handoff lives there; wrong `smoke.lobster` removed.
