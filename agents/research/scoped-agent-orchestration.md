---
date: 2026-06-02
model: claude-opus-4-8
description: "Research: execution-model options for orchestrating a scoped agent fleet (cron / eligibility / budget) on the shared OpenClaw VPS. OpenClaw-native capabilities verified against the live 2026.5.28 install and docs.openclaw.ai. Prompted by doc-drift's scoped-audit redesign but fleet-level."
---

# Scoped Agent Orchestration — Execution-Model Research

Produced by a Sonnet research subagent (2026-06-02) for the doc-drift scoped-audit
redesign (`doc-drift-agent/docs/scoped-audit-pre-adr-shapes.md`, Shape 2), then
fact-checked. Lives under `agents/` because the orchestration question — schedule
a scoped agent on the shared VPS, one target at a time, change + staleness
eligibility, budget — is **fleet-level** (applies to dashboard-sync and maestro
too), not doc-drift-specific.

## Verification status

- **OpenClaw-native section: VERIFIED** against the live install (`OpenClaw
  2026.5.28`, `e932160`, SSH 2026-06-02) and `docs.openclaw.ai`. `cron` exists
  with the cited schedule types/session modes/backoff/`maxConcurrentRuns: 8`.
  TaskFlow is a real docs concept but **not a CLI command in our 2026.5.28**
  (`openclaw taskflow` → unknown command) and offers no scope-selection/budget
  anyway.
- **Prior-art (Renovate/Dependabot/Mergify) and patterns: external, cited.**
- **Dropped from the original report:** CodeRabbit — an event-driven PR reviewer,
  not a scheduler; its one transferable idea (diff-as-context) is already covered
  by the change-comparison rows.

## Ground truth (local sources)

- OpenClaw 2026.5.28, single instance, systemd, 2 vCPU / ~2.4 GB RAM.
- Cron wrappers live in `runtime/**` in the repo but are **hand-deployed** to
  `~/.openclaw/scripts/` — no CI sync.
- Prior concurrent-run load spike on the 2-vCPU box → strictly serial today.
- Gotcha #13: `openclaw cron add/list/edit` need a live gateway RPC; the CLI's
  ~13 s cold-start can blow the 3 s handshake timeout. Workaround documented;
  **its presence in the live systemd unit is unconfirmed.** Treat native
  `openclaw cron` management as unreliable for scripting until verified.
- State today: `~/.openclaw/agents/doc-drift-agent/state.json` holds only
  `last_manual_run_utc`; no per-scope tracking exists.

## 1. Orchestration patterns (process a set of targets one-at-a-time over time)

- **A. Fixed round-robin cursor.** State = one integer. Trivial, testable. Blind
  to change vs unchanged; new scope shifts the sequence; missed nights don't
  catch up. Adequate only as a bootstrap phase.
- **B. Eligible-set with priority drain (target).** State = per-scope
  `{eligibleSince, reason: changed|stale, lastAuditedCommit, lastAuditedAt}`. Each
  tick: recompute eligibility (git diff + staleness), pick highest priority
  (changed > stale), drain one under budget, mark done. Decision is a pure
  function `(registry, gitState, now) → (selectedScope, updatedRegistry)`. This is
  the converged design.
- **C. Per-scope cron entry.** Decision logic lives in the cron schedule (not
  tested code); a new project needs a new hand-deployed cron file; no budget;
  concurrency risk. **Ruled out.**
- **D. External work queue (Redis/Temporal/Celery).** Overkill for one worker /
  one VPS / low frequency; new service to run on a congested box. **Rejected.**
- **E. Git-notes as per-scope marker.** Fragile — notes live in `refs/notes/` and
  are dropped by default `git pull`. A plain JSON/SQLite file is simpler,
  durable, testable. **Not recommended.**

## 2. Prior art — cadence / throttle / dedup / change-detection

| Tool | Cadence | Throttle/budget | Dedup | Change-detection | Borrow |
|---|---|---|---|---|---|
| **Renovate** | Backend run-freq + per-repo `schedule:` window; no push trigger | `prHourlyLimit`, `prConcurrentLimit` (default 10), `commitHourlyLimit` | Skips if an open PR already covers the dep+version | Version compare vs registry (not git-diff) | `prConcurrentLimit` → cap open `[doc-drift]` PRs; idempotence dedup (already in `agent.md` step 7) |
| **Dependabot** | Schedule (`daily`/`weekly`/cron since 2025-04-22); per-dep `cooldown` | `cooldown` per dependency | Skips if no new version | Version compare | **`cooldown` → per-scope min re-audit interval** (don't re-audit a hot project nightly) |
| **Mergify** | Event-driven; merge queue serializes | `batch_size`, `max_parallel_checks: 1` | Dequeues duplicates | Webhook | **`max_parallel_checks: 1` → our ≤1-run rule** |
| **pre-commit.ci** | On push | — | Skips if passing | Push | Minimal (push model rejected) |

## 3. Change detection from git history (no CI/webhooks)

Per scope store `lastAuditedCommit` (HEAD of `~/ai-labs` at last completed audit).
Each night: `git -C ~/ai-labs diff --name-only <lastAuditedCommit>..HEAD --
<scope-globs>` → non-empty = changed-eligible; `now - lastAuditedAt >
stalenessWindow` = stale-eligible.

**State location:** flat JSON (`~/.openclaw/agents/doc-drift-agent/orchestrator-state.json`),
written atomically (temp + rename); SQLite if N grows; **not** git-notes.

Trade-off vs CI path-filter triggers: no CI dependency, independent of GitHub API,
catches all scope-touching commits — at the cost of ≤24 h latency, which is fine
for documentation.

## 4. OpenClaw-native capabilities (VERIFIED)

Verified against the live install and `docs.openclaw.ai`:

- **`cron`** — real subcommand (`add/disable/edit/enable/get/list/rm/run/runs/show/status`).
  Schedule types `--at` (one-shot/relative), `--every` (interval), `--cron`
  (5/6-field, `--tz`). Session modes: `main`, `isolated` (`cron:<jobId>`),
  `current`, `session:<custom-id>`. Retry `backoffMs [60000,120000,300000]`,
  `maxAttempts 3` (exp backoff 30 s–60 m, resets on success).
  **`maxConcurrentRuns: 8`** "limits both scheduled cron dispatch and isolated
  agent-turn execution." Jobs persist in gateway SQLite. **Caveat:** gateway-RPC
  based → gotcha #13 reliability risk on our box.
- **`agent`** — "Run one agent turn via the Gateway" (what our wrappers use).
- **TaskFlow** — documented (durable multi-step flows, sync/cancel/preflight) but
  **NOT a CLI command in our 2026.5.28** and exposes **no** scope-selection,
  per-set iteration, budget, or rate-limiting. Not usable, not suitable.
- **Background tasks** — activity ledger (SQLite, 7-day retention); no concurrency
  cap or budget.

**Conclusion (verified):** OpenClaw provides scheduling and multi-step building
blocks, but **no** native scope registry, change-detection, staleness, budget, or
"process exactly one of a set" primitive. The eligibility/selection/budget logic
must be **external tested code**. This is the intended Shape-2 separation, not a
gap. Design should invoke `openclaw agent` from an external `/etc/cron.d` job and
**avoid the `openclaw cron` CLI** (gotcha #13).

## 5. Testable orchestration on a cron/VPS model

**Functional core / imperative shell.** Shell (bash wrapper) reads state, runs
`git diff`, calls the decision module, writes state, invokes `openclaw agent` —
~5 I/O steps, no branching. Core (TypeScript) is a pure function
`(ScopeRegistry, GitState, ClockNow) → (SelectedScope | null, UpdatedRegistry)` —
zero side effects, unit-tested in the existing suite without a VPS, git, or
OpenClaw. State example:

```json
{
  "scopes": {
    "readmes": { "lastAuditedCommit": "abc123", "lastAuditedAt": "2026-06-01T01:00:00Z" },
    "oracle":  { "lastAuditedCommit": "abc123", "lastAuditedAt": "2026-05-28T01:00:00Z" }
  },
  "nightlyBudgetUsed": 0,
  "budgetResetDate": "2026-06-02"
}
```

## 6. Throttling / budgeting

| Lever | Controls | Suggested | Rationale |
|---|---|---|---|
| Max runs/night | scopes drained per tick | 1 (hard) | 2-vCPU; prior incident; no parallel |
| Min re-audit interval | re-audit of a hot scope | 7 d | avoid nightly waste |
| Staleness window | re-audit unchanged | 14 d (per-scope overridable) | catch latent drift / better tooling |
| Open-PR cap | reviewer load | ~5 open `[doc-drift]` PRs | Renovate `prConcurrentLimit` analog |

Serial execution **is** the budget: one run blocks the window; budget=1 bounds VPS
load to one agent turn. Cost budgeting at an API proxy is unnecessary at this scale
(one LLM session per run, not a fleet).

## Recommended execution model

**Eligible-set with priority drain (Pattern B), staged:**

1. **Stage 1 (ships with Shape 1):** wrapper calls the TS decision module with a
   hardcoded ordered scope list, no eligibility state → trivial selector
   (effectively N=1 round-robin). Establishes the tested-module interface.
2. **Stage 2:** module reads `orchestrator-state.json` + `git diff
   <lastAuditedCommit>..HEAD -- <globs>` → changed scopes first.
3. **Stage 3:** add staleness clock + per-night budget (default 1; overflow rolls
   over via the persistent eligible set).

Honors every hard constraint: serial (budget=1), night-only (single `/etc/cron.d`
entry), tested-not-bash (pure decision fn), no CI trigger (local git diff), and
sidesteps gotcha #13 (no `openclaw cron` CLI). Trade-offs accepted: ≤24 h change
latency; VPS state file initialized on first deploy (absent file ⇒ "all stale");
the `runtime/**` deploy/sync gap persists (unchanged from today).

## Open questions for the ADR

1. **Deploy/sync gap (critical):** orchestrator TS code in `runtime/**` is
   hand-deployed. Accept + document, or add a CI-sync (analogous to
   `doc-drift-agent-sync.yml`)? Ties to `TODO.md` items 1 & 4.
2. **State file** location + safe default when absent/corrupt (→ "all stale") +
   who initializes on first deploy.
3. **Scope-registry location:** hardcoded in TS, a repo JSON synced to the VPS, or
   derived from `loc-dashboard.sh` `known` list.
4. **Manual runs updating orchestration state** — the existing `last_manual_run_utc`
   write-gap would otherwise repeat for `lastAuditedCommit`/`lastAuditedAt`.
5. **Eligibility re-evaluated each tick vs frozen FIFO** (a scope fixed before its
   night should drop off).
6. **Night window** (01:00 UTC today) vs the 04:00 UTC OAuth-refresh window — a
   long drain could collide; budget=1 bounds it.
7. **Staleness/cooldown defaults** and whether per-scope overridable in the registry.

## Sources

- Renovate scheduling / config; Dependabot cron + cooldown
  (github.blog changelog 2025-04-22, docs.github.com); Mergify merge queue.
- OpenClaw: live install (`openclaw --help`, `openclaw cron --help`, 2026.5.28
  `e932160`, SSH 2026-06-02); `docs.openclaw.ai/automation/cron-jobs`,
  `…/taskflow`, `/cli/cron`.
- Functional-core/imperative-shell; cron-orchestration anti-patterns;
  LLM-agent rate-limiting (TrueFoundry).
