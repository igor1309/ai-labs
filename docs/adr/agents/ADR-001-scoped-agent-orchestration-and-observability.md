---
date: 2026-06-02
author: Igor Malyarov
version: 0.0.1
status: proposed
description: "Orchestrate scoped agent runs via OpenClaw Lobster/TaskFlow; scope selection as tested TS step CLIs; observability via the TaskFlow/tasks ledger. First adopter: doc-drift scoped audit."
---

# ADR: Scoped Agent Orchestration & Observability via OpenClaw Lobster/TaskFlow

## 1. Executive Summary

Orchestrate **scoped agent runs** (one scope per run, nightly) using OpenClaw's
native **Lobster** workflow runtime plus the **TaskFlow / tasks ledger**, while
keeping the **scope-selection decision** (eligible-set: changed ∪ stale, under a
per-night budget) as **tested, version-controlled TypeScript step CLIs**. A run is
launched by a scheduled **agent turn** that executes a version-controlled
`.lobster` pipeline gateway-side. The native runtime supplies durability,
resumability, and — the newly first-class requirement — **observability**: every
run's outcome is recorded (succeeded / produced PR / failed / crashed / timed
out), so the operator is alerted off the happy path, not only on it. Scope: the
orchestration + observability substrate for scoped agent runs; first adopter is
doc-drift's scoped audit, but the substrate is fleet-level.

## 2. Context

**Problem.** doc-drift runs as one nightly job that audits all READMEs in a single
pass and emits one bloated, happy-path-only Telegram message. The redesign
(`doc-drift-agent/docs/scoped-audit-intake.md`,
`…/scoped-audit-pre-adr-shapes.md`) splits work into **scopes** — cross-project
READMEs plus one per top-level project's docs — audited **one per run** to bound
context. That demands an orchestrator (which scope, when) and, elevated here to a
first-class requirement, **observability**: we must know an audit was launched for
a scope and how it ended, including failure and crash, not just success.

**Constraints.**

- Single OpenClaw gateway on a 2-vCPU / ~2.4 GB VPS; a prior concurrent-run load
  spike means **≤ 1 active run** at a time.
- VPS is busy during the day → batch work runs at **night**.
- Orchestration logic **must be tested, version-controlled code**, not decision
  logic glued into a hand-deployed bash wrapper (the failure mode already hit
  this month).
- **No CI/webhook** as the change trigger; git history is the source.
- `runtime/**` is **not** CI-synced (hand-deployed).
- `openclaw cron` is gateway-RPC and unreliable on this host (inventory gotcha
  #13).

**Rejected alternatives (brief).** Evidence: `agents/research/scoped-agent-orchestration.md`,
`agents/research/openclaw-taskflow.md`.

- Bespoke external cron + bash wrapper + flat-JSON state + hand-rolled budget and
  heartbeat — reinvents the durability/observability the platform already
  provides; the bash glue is the fragility we hit.
- Per-scope cron entries — decision logic encoded in the schedule; untested; cron
  sprawl.
- External work queue (Redis/Temporal/Celery) — overkill on a single small VPS.
- OpenClaw `cron` alone — schedules agent turns but has no
  scope-selection/eligibility/budget/observability semantics.
- Round-robin cursor *as the model* — blind to changed vs unchanged; retained
  only as a Stage-1 bootstrap selector.

## 3. Decision

Scoped agent runs are orchestrated by an OpenClaw **Lobster** pipeline (a
`.lobster` workflow), launched by a **scheduled agent turn**, with **TaskFlow**
providing durable flow state and the **tasks ledger** providing observability. The
**scope selection, state read, and state commit** logic is implemented as
**tested TypeScript CLIs invoked as Lobster step `command`s** — never embedded in
the cron wrapper and never delegated to the LLM.

The scope-selection model is the **eligible-set** from the pre-ADR shapes:
eligibility = *changed* (git diff since the scope's last-audited commit) ∪ *stale*
(not audited within the staleness window), drained one scope per run under a
per-night budget, with `changed` prioritised over `stale`.

## 4. Rules / Invariants

- A nightly pipeline run **MUST** audit at most one scope (budget default `1`).
- Eligibility **MUST** be computed from per-scope `lastAuditedCommit` /
  `lastAuditedAt` state plus `git diff <lastAuditedCommit>..HEAD -- <scope-globs>`
  (changed) and a staleness window (stale). It **MUST NOT** depend on CI or
  webhooks.
- The selection / state-read / state-commit logic **MUST** live in
  version-controlled TS CLIs (e.g. `doc-drift-orchestrator select|commit`) with
  unit tests. It **MUST NOT** live in the cron wrapper (bash) or be produced by
  the LLM.
- The pipeline **MUST** be a version-controlled `.lobster` file and **MUST** be
  inspectable via `lobster graph`.
- The pipeline **MUST** run gateway-side (the bundled Lobster tool invoked from an
  agent turn) so the run is registered in the TaskFlow / tasks ledger.
- Each run **MUST** resolve to a terminal ledger status
  (`succeeded|failed|timed_out|cancelled|lost`). The notification layer **MUST**
  surface non-`succeeded` outcomes (and `succeeded`-with-no-PR), not only the
  happy path.
- The schedule **SHOULD** live in external `/etc/cron.d` (invoking an agent turn)
  to avoid the `openclaw cron` RPC fragility (gotcha #13). If native `openclaw
  cron` is used instead, the gotcha-#13 mitigation **MUST** be confirmed on the
  host first.
- The Lobster tool **MUST** be enabled (`tools.alsoAllow: ["lobster"]`; per-agent
  scoping acceptable).
- Per-scope orchestration state (the last-audited store) **MUST NOT** be conflated
  with Lobster's in-flight resume state; the former is owned by the
  `select`/`commit` CLIs.
- Auto-merge and auto-approve of PRs remain **forbidden** (inherited from the
  doc-drift ADR).

## 5. Consequences

**Operational.**

- New dependency: the Lobster plugin enabled on the gateway; a `.lobster`
  pipeline plus the orchestrator TS CLIs deployed.
- Observability becomes native: `openclaw tasks list --status failed`,
  `openclaw tasks audit`, and TaskFlow mirrored views give per-run, per-scope
  outcome visibility — closing the happy-path-only gap and able to **subsume the
  fleet's hand-built heartbeat / dead-man's-switch**.
- Deployment: the orchestrator CLIs and `.lobster` file inherit the `runtime/**`
  hand-deploy gap (no CI sync) and must be deployed deliberately (tracked under
  the `openclaw-agent-ops` / `vps-deploy` TODO items).

**Tradeoffs accepted.**

- Flow *wiring* (`.lobster`) is integration-tested and `graph`-inspected, not
  unit-tested; only the *step logic* is unit-tested.
- Change-to-audit latency is ≤ 24 h (nightly) — acceptable for documentation.
- Platform coupling to OpenClaw Lobster/TaskFlow.

**Future extension points.**

- Reuse the substrate for dashboard-sync and maestro (fleet-level).
- Add Lobster approval gates for higher-risk actions.
- Staged delivery: Stage-1 trivial selector → Stage-2 change-eligibility →
  Stage-3 staleness + budget.

**Known risk to spike (implementation phase 1).** Embedded (in-process) Lobster
"does not reliably support `openclaw.invoke` for nested calls"; a step that calls
`openclaw agent` *is* such a nested call. Mitigations: use the standalone
`lobster` CLI for the audit step, or call `llm-task` directly. Resolve before
relying on the in-gateway path.

## 6. Non-Goals

- Not changing the doc-drift audit discipline (factual mismatch only, minimum
  edit) or the worker's edit surface (project `docs/` vs README) — owned by the
  scoped-audit shapes, not this ADR.
- Not introducing issues / queue machinery — doc-drift findings remain doc-edit
  PRs.
- Not real-time / on-push execution — eligibility is decoupled from execution
  (nightly).
- Not auto-merge or auto-approve.
- Not multi-scope-per-run parallelism.
- Not building a bespoke scheduler/queue when the platform provides one.
