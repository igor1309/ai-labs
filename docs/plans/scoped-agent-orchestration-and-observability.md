---
date: 2026-06-02
model: claude-opus-4-8
description: "Implementation plan: deliver the ADR-001 orchestration + observability substrate (an /etc/cron.d imperative-shell wrapper + tested eligible-set selector CLIs; observability via fail-closed Telegram + log + per-scope state, after the Phase 4 spike) for scoped agent runs; doc-drift is the first adopter."
---

# Implementation Plan — Scoped Agent Orchestration & Observability (ADR-001)

Implements `docs/adr/agents/ADR-001-scoped-agent-orchestration-and-observability.md`
(v0.0.3, accepted 2026-06-03). Design context: `doc-drift-agent/docs/scoped-audit-intake.md`,
`…/scoped-audit-pre-adr-shapes.md`; evidence: `agents/research/{scoped-agent-orchestration,openclaw-taskflow,openclaw-lobster,phase4-substrate-spike-findings}.md`.

**Substrate amended (ADR-001 §7, 2026-06-02).** The Phase 4 spike found the in-gateway
Lobster/TaskFlow path unviable on the live unit (nested-`openclaw agent` deadlock; the
tasks/TaskFlow ledger does not populate). Phase 4 is closed by the spike. Phases 5–6
below are revised to the **external-cron imperative-shell substrate**: an `/etc/cron.d`
entry runs an orchestrator **wrapper** (bash) that drives `select → openclaw agent
worker → commit`, with observability from the wrapper's **fail-closed Telegram alert +
log + per-scope state** (native `openclaw cron`/cron run history don't fit a multi-step
wrapper; the tasks ledger is broken on the unit). No production `.lobster`. See
`agents/research/phase4-substrate-spike-findings.md`.

## Goal

Deliver the orchestration + observability substrate decided in ADR-001: scoped
agent runs are selected by tested TypeScript CLIs (eligible-set: changed ∪ stale,
budget), executed by an `/etc/cron.d` orchestrator wrapper (ADR-001 §7, after the
Phase 4 spike), with **every** run's outcome observable via the wrapper's fail-closed
Telegram alert + log + per-scope state, not just the happy path. The plan preserves the
ADR-001 core invariants;
doc-drift's scoped audit is the first adopter.

## Execution mode

```
Mode: human-review-gated
Human review between tasks: yes — mandatory before each phase that touches the
  live gateway / VPS (Phases 4, 5, 6). Pure-code phases (1–3) auto-continue after
  green gates + local commit.
Stop conditions: failed gates, unclear scope, missing credentials/tooling,
  destructive operations (plugin enablement, deploy, prod scheduling), explicit
  user interruption, any unmet precondition.
Push policy: no push (held until the user says we are done).
```

Each phase ends with its own commit; the tests + build gates MUST be green before
advancing; logical phases are never bundled into a single commit. Self-review is
executor discipline, not the human-review gate above.

## Execution lock

```
Worktree mode: reuse existing
Expected worktree: worktrees/scoped-orchestrator-gateway
Expected branch: scoped-orchestrator-gateway (integration branch; one PR to trunk at the end)
Preflight check: [x] done — Phases 1–3 merged (PR #457), relocation merged, Phase 4 spike closed, trunk merged in
```

Preconditions (block the **entire** plan; verify in preflight):

- [x] The **scope-model decision** (cross-project READMEs + one scope per
  top-level project's docs, with the worker's edit surface expanded from
  README-only to a project's `docs/`) is **accepted** — doc-drift ADR
  `adr-specialized-openclaw-agent-readme-drift-review.md` v0.0.6, status `accepted`
  2026-06-03.
- [x] The **parameterized single-scope worker** (Shape 1) exists and accepts a
  scope contract — `agent.md` reads `--scope <id>`, resolves `scopes.<id>.docs`
  from `scope-registry.json` (default `readmes`); shipped in PR #455.

## Scope guardrails

Out of scope for this plan (per ADR-001 Non-Goals + dependency):

- The doc-drift audit discipline and the worker's edit surface — owned by the
  scope-model decision, not here.
- **Notification rendering (Shape 3).** This plan guarantees run outcomes are
  *recorded and available* in the ledger; how they are rendered/alerted is Shape 3.
- Change detection via CI or webhooks — git history is the only change source.
- Issues / queue machinery; auto-merge or auto-approve; multi-scope-per-run
  parallelism; a bespoke scheduler/queue when the platform provides one; retiring
  the fleet's existing heartbeat / dead-man's-switch.

## ADR traceability matrix

| ADR-001 invariant | Phase(s) that establish it |
|---|---|
| ≤ 1 scope per run (budget default 1) | 1 (one-per-run), 3 (budget cap) |
| Eligibility from per-scope last-audited state + local git-diff (changed) ∪ staleness (stale); not CI/webhooks | 2 (changed), 3 (stale) |
| Selection / state logic in version-controlled, unit-tested TS CLIs; not bash/LLM | 1 |
| Run driven by an `/etc/cron.d` orchestrator wrapper (bash glue); decision logic stays in tested CLIs (ADR §7) | 5 (wiring), 6 (schedule) |
| Each run's outcome is observable via the wrapper's fail-closed Telegram + log + per-scope state (ADR §7, replaces tasks-ledger registration) | 5 (proven), 6 (scheduled) |
| Schedule via external `/etc/cron.d` (avoids gotcha #13; native `openclaw cron` can't drive a multi-step wrapper) | 6 |
| ~~Lobster tool / `.lobster` file / `lobster graph`~~ — dropped from prod path (ADR §7; Phase 4 spike) | n/a |
| Per-scope state ≠ Lobster in-flight resume state | 1 |
| Auto-merge/approve forbidden (inherited) | all (never enabled) |

## Phase 1 — Scope registry, per-scope state, trivial selector (Stage 1)

- **Objective:** a version-controlled scope registry and a per-scope last-audited
  state store, with `select` (pick the next scope) and `commit` (record
  last-audited commit + timestamp) capabilities as tested TS CLIs. Selector is
  trivial here (fixed ordered list, one scope per call) — no eligibility yet.
- **Key work items:** scope registry as version-controlled data derived from /
  validated against the repo's top-level project list; state schema with an atomic
  write; `select`/`commit` CLIs; the "one scope per run" and "state ≠ Lobster
  resume state" invariants encoded.
- **Dependencies:** preconditions only (registry needs the scope-model decision).
- **Risks:** registry drifting from the real project set — mitigate by deriving/
  validating against the existing project list; missing/corrupt state file.
- **Validation:** unit tests — select returns exactly one scope (rotation, empty
  list, single entry); commit round-trips state atomically; **absent state file ⇒
  treated as "all stale"**; a scope **removed from the registry** has its state pruned/ignored (no audit
  attempted); registry validated against the project list. Full TS
  suite + build green.
- **Completion signal:** `select`/`commit` CLIs pass unit tests in CI; a run never
  yields more than one scope.

## Phase 2 — Change eligibility (Stage 2)

- **Objective:** `select` marks a scope *changed-eligible* when its paths differ
  from its last-audited commit (a local git-history diff), with no CI/webhook
  dependency.
- **Key work items:** change-detection input (the scope's paths since its
  last-audited commit) feeding the pure selection function; changed scopes ordered
  ahead of others.
- **Dependencies:** Phase 1.
- **Risks:** path-globbing misses or over-matches a scope's docs — covered by
  fixture tests.
- **Validation:** unit tests over fixture git states — changed scope detected,
  unchanged skipped, first-audit (no prior commit) and an **unreachable
  last-audited commit** (history rewrite) both treated as eligible; selection
  depends only on injected git facts (no live git, no CI). Suite + build green.
- **Completion signal:** change-eligibility unit-tested; CI green.

## Phase 3 — Staleness, budget, priority (Stage 3)

- **Objective:** complete the eligible-set selector — *stale-eligible* (not
  audited within the staleness window), a per-night **budget** (default 1),
  `changed` prioritised over `stale`, and overflow carried to the next run.
- **Key work items:** staleness clock + window (per-scope overridable); budget cap;
  priority ordering; overflow remains eligible next run.
- **Dependencies:** Phase 2.
- **Risks:** a scope that changes daily is re-audited daily under budget=1
  (acceptable — it changed; the budget bounds load regardless). A re-audit
  cooldown is an ADR-001 *open knob*, **not** in this plan's scope. Clock-skew at
  the staleness boundary — covered by boundary tests.
- **Validation:** unit tests — staleness threshold boundary, budget caps drained
  count, changed-before-stale ordering, overflow re-eligibility next run,
  **idempotent rerun** (same inputs ⇒ same selection until `commit`), **no eligible
  scope ⇒ select returns none**. Suite + build green.
- **Completion signal:** full eligible-set selector unit-tested; CI green.

## Phase 4 — Lobster substrate spike & enablement (gateway)

> **Status: CLOSED 2026-06-02 — substrate found unviable.** The spike disproved the
> in-gateway Lobster path (nested-`openclaw agent` deadlock) and the tasks/TaskFlow
> ledger does not populate on the live unit. Outcome + evidence:
> `agents/research/phase4-substrate-spike-findings.md`; decision: ADR-001 §7. The
> original objective below is retained for the record; Phases 5–6 are revised to the
> native-cron substrate.

- **Objective:** prove the in-gateway path and resolve ADR-001's known risk —
  enable the Lobster tool, and confirm a `.lobster` step can invoke the worker
  reliably and that the run registers in the TaskFlow / tasks ledger with a
  terminal status. Choose the audit-step invocation mechanism (in-gateway
  `openclaw agent` vs standalone `lobster` CLI vs `llm-task`).
- **Key work items:** enable `tools.alsoAllow: ["lobster"]` (install the
  `@openclaw/lobster` plugin if absent — record in inventory `migration.md`); a
  minimal smoke `.lobster` (a trivial step + a step that invokes a no-op agent
  turn); run it gateway-side and inspect the ledger.
- **Dependencies:** Phases 1–3 not strictly required, but the substrate decision
  gates Phase 5; preconditions.
- **Risks:** embedded Lobster's unreliable nested `openclaw.invoke` (ADR known
  risk) ⇒ fall back to standalone CLI / `llm-task`; plugin-enable changes
  bootstrap state (must hit `migration.md`).
- **Validation:** `lobster graph` renders the smoke flow (static, automatable on
  the file); the smoke run resolves to a terminal status — **asserted
  deterministically from `openclaw tasks … --json`** (parsed status), not ad-hoc
  inspection — for both a success and a deliberately-failing step. Gateway-side
  invariants are integration-verified by design (not CI-enforceable).
- **Completion signal:** a committed smoke `.lobster` + a recorded decision on the
  audit-step mechanism; the smoke run observable in the ledger (success and
  induced-failure both).

## Phase 5 — Production orchestration wrapper + observability (imperative-shell substrate)

- **Objective:** the real nightly flow wiring `select → openclaw agent worker → commit`
  in a version-controlled bash **orchestrator wrapper** (ADR-001 §7), with each run's
  outcome (drift-found / produced-PR / failed) surfaced by the wrapper's fail-closed
  notification + log + per-scope state.
- **Key work items:** an orchestrator wrapper under `agents/doc-drift-agent/runtime/`
  that runs the tested `select` CLI, invokes the parameterized worker (`openclaw agent`
  with the selected `--scope`) only when a scope is selected, and runs `commit` only on
  a successful audit; the "no scope selected" no-op path; reuse the existing wrapper's
  fail-closed report parsing + Telegram notification. The wrapper is plain glue — no
  decision logic (that stays in the CLIs).
- **Dependencies:** Phases 3 (selector), 4 (substrate decision — closed), the
  parameterized worker (precondition).
- **Risks:** worker contract mismatch; partial-failure leaving stale state — covered by
  the commit-only-on-success rule (state advances only after a verified-good audit).
- **Validation:** an integration run on the VPS audits exactly one scope, opens its PRs,
  and advances that scope's `lastAuditedCommit`/`lastAuditedAt`; an induced audit failure
  fires the fail-closed alert and leaves `lastAuditedCommit` unchanged for that scope;
  "no eligible scope" is a recorded no-op (log line, no commit, silent). Wrapper logic is
  exercised with a stubbed worker before the live run.
- **Completion signal:** an end-to-end run for one scope — PRs opened, state advanced,
  notification posted — plus a forced-failure run that alerts and leaves per-scope state
  untouched.

## Phase 6 — Scheduling & deploy

- **Objective:** schedule the nightly launch off-peak and deploy the CLIs +
  `.lobster` to the VPS.
- **Key work items:** schedule via external `/etc/cron.d` invoking the orchestrator
  wrapper (the existing doc-drift scheduling mechanism; avoids gotcha #13; native
  `openclaw cron` can't drive a multi-step wrapper). Deploy the orchestrator wrapper +
  selection CLIs + initial per-scope state (inherits the `runtime/**` hand-deploy gap);
  record all live changes in inventory `migration.md` + the OpenClaw log.
- **Dependencies:** Phase 5.
- **Risks:** `runtime/**` not CI-synced (manual deploy drift) — mitigate with the
  byte-identical-after-deploy check from the `vps-deploy` discipline; night-window
  collision with the 04:00 OAuth refresh — budget=1 bounds it.
- **Validation:** an unattended scheduled tick fires, audits one scope, and posts the
  fail-closed notification + advances per-scope state (verified from the state file +
  `doc-drift-cron.log`); across two consecutive nights the per-scope state
  advances with no duplicate audit (idempotent); a **manual** invocation updates
  per-scope state too (no repeat of the existing `last_manual_run_utc` write-gap);
  deploy recorded in inventory.
- **Completion signal:** an observed unattended scheduled run completes end-to-end
  (notification posted, per-scope state advanced, logged); the deploy is recorded in
  `migration.md`.

## Done criteria

- All phases complete; each landed as its own commit with CI green before the next.
- The selector CLIs are unit-tested and the full TS suite + `tsc` build pass
  (`./scripts/run_silent.sh "tests" npm test`, `… "build" npx tsc --noEmit`).
- The production orchestrator runs **one scope per nightly tick** via an `/etc/cron.d`
  wrapper, and every run's outcome is surfaced by the wrapper's fail-closed notification
  + log + per-scope state — including failure, not only the happy path (ADR-001 §7).
- All ADR-001 invariants are enforceable: selection/eligibility/budget by unit
  tests; run outcomes by the fail-closed notification + per-scope state.
- Idempotent operation and edge cases handled with defined behavior: reruns
  advance per-scope state without duplicate audits; absent state ⇒ "all stale";
  "no eligible scope" ⇒ recorded no-op; scope removed from the registry ⇒ state
  pruned; unreachable last-audited commit ⇒ treated as changed; manual runs update
  per-scope state.
- Standard nightly operation needs no manual intervention.
- All governing ADR invariants traced in the matrix above are satisfied; no
  capability outside ADR-001 scope was introduced.

## Final closeout

```
Final gates: ./scripts/run_silent.sh "tests" npm test ; ./scripts/run_silent.sh "build" npx tsc --noEmit ;
             one observed end-to-end scheduled run (notification + per-scope state advance + log).
Archive plan: git mv docs/plans/scoped-agent-orchestration-and-observability.md docs/plans/implemented/ in the SAME change set as the implementation (not a follow-up PR).
Commit archive move: yes
Push/PR: follow push policy (no push until the user says we are done).
```
