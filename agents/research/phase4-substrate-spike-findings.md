---
date: 2026-06-02
model: claude-opus-4-8
description: "Phase 4 substrate spike outcome (ADR-001): the in-gateway .lobster-as-agent-tool path is unviable (nested-call deadlock) and the tasks/TaskFlow ledger does not populate on the live VPS; observability resolves to cron run history. Verified live against OpenClaw 2026.5.28 on 107.172.143.196."
---

# Phase 4 Substrate Spike — Findings

Spike for `docs/plans/scoped-agent-orchestration-and-observability.md` Phase 4 and
the ADR-001 "Known risk to spike." Goal: prove the in-gateway path — a `.lobster`
pipeline run gateway-side, the worker invoked from a step, and every run recorded
in the TaskFlow / tasks ledger with a terminal status.

Verified live against OpenClaw `2026.5.28` (commit `e932160`, Lobster runtime
`2026.5.22`) on the RackNerd VPS `107.172.143.196`, 2026-06-02.

## Outcome

The in-gateway `.lobster`-as-agent-tool substrate is **unviable** for this design,
on two independent grounds, and the observability premise it rested on does not
hold on this install. Per ADR-001's own *Decision stability* clause, the spike
triggers the documented fallback: the same tested selection CLIs wire into a
cron-triggered agent turn, with observability from **cron run history**.

## Findings

### 1. Step `command:` runs via `/bin/sh`; `openclaw.invoke` is not usable there

`lobster run --dry-run` labels every step `[shell]`. A step `command:` is executed
by `/bin/sh`, so the worker must be invoked with the real `openclaw agent` CLI.
`openclaw.invoke` is a Lobster *pipeline stage*, not a shell binary, so it cannot
be a step `command:`. (Matches the prior mechanism decision.)

### 2. A nested `openclaw agent` step deadlocks under the embedded runner

A smoke `.lobster` whose second step ran `openclaw agent --agent doc-drift-agent
… --json`, invoked in-gateway via the `lobster` tool, returned **`lobster runtime
timed out`**. The agent did call the tool (`toolSummary: {calls: 1, tools:
["lobster"], failures: 0}`) — the *nested* gateway turn is what hung. This is the
ADR-001 "Known risk to spike": embedded Lobster does not reliably support nested
gateway calls. The blessed mitigation (`llm-task`) is **disabled** on this host
and is not a drop-in for a full agent turn anyway.

### 3. An in-gateway lobster tool call does not register in the tasks/TaskFlow ledger

A trivial all-shell smoke (two `echo`/`cat` steps, no nested turn) run via the
agent's `lobster` tool returned `ok` — yet `openclaw tasks list` stayed at
`count 0`. A synchronous, in-gateway lobster tool call is part of a foreground
turn and creates no ledger entry. A standalone `lobster run --file` likewise
registers nothing.

### 4. The tasks/TaskFlow ledger is not populating on this install at all

This is the decisive, broader finding. The ledger is empty not because of how
Lobster is invoked, but because **this install records no task entries for any
run type tested** — foreground `openclaw agent`, lobster tool, or cron-dispatched
isolated agent turn:

- A one-shot isolated **cron** job (`doc-drift-agent`, `--session isolated`,
  `--no-deliver`) fired and **succeeded** — `openclaw cron runs --id` shows
  `action: finished, status: ok, durationMs: 6025`. Yet `openclaw tasks list`
  (all runtimes) stayed `count 0`.
- `~/.openclaw/tasks/runs.sqlite` (the confirmed task store, per
  `dist/task-registry-*.js`) was **last written 12:11 UTC** while the box was
  inspected at **21:04 UTC** — ~9 h stale — despite the `vps:monitor` cron
  running **every 10 minutes** and succeeding ~5 min before inspection.
- `openclaw tasks maintenance` (preview) reports **all zeros**
  (`reconciled 0, recovered 0, pruned 0, runningCronJobs 0`) — nothing pending
  reconciliation, so the docs' 5-minute grace-window reconciliation does not
  explain the emptiness.
- `openclaw doctor --lint` finds **no** task-tracking fault (only an unrelated
  Telegram message-cache migration and security advisories). `doctor --fix`
  would not address this and was deliberately **not** run.
- The registry machinery exists and is wired (`task_runs` table, `recordTask`,
  cron runtime files reference the task registry), and there is **no** config
  on/off gate (`tasks.enabled` / `taskTracking` absent in the bundle).

Conclusion: the gap is real and grounded in the installed system, but it is **not**
a Lobster limitation, a design flaw, a doctor-fixable misconfiguration, or a
config flag. The most likely explanation is a behavior/version gap in
`2026.5.28` (records intended per docs, not produced here). Root cause was not
determinable cheaply; no specific upstream issue/changelog entry was found in
search (only the docs, which say it *should* work). Tracked as a watch item —
`agents/TODO.md` §4.

### 5. Cron run history works and carries terminal status

`openclaw cron runs --id <jobId>` durably records, per run: `status`
(`ok`/failure), `durationMs`, `model`, token `usage`, and `deliveryStatus`. This
is sufficient observability for the scheduled path that ADR-001 requires, and it
is available **today**, independent of the empty tasks/TaskFlow ledger.

### Incidental

- `llm-task` plugin is **disabled** on the host.
- Native `openclaw cron` management worked with **no gotcha-#13 RPC timeout**:
  `cron add` returned immediately. (Inventory still lists gotcha #13 as
  unconfirmed on the live unit; this run did not reproduce it.)
- Lobster condition syntax: the shipped example's `$x.json.items[0].route == "…"`
  form is **rejected** at `dry-run` by runtime `2026.5.22`
  (`Unsupported condition`). A flow must avoid that form.

## Substrate decision (feeds the ADR-001 amendment, §7)

The orchestration is a **multi-step** sequence (`select → worker → commit`), so it
needs a shell driver. Native `openclaw cron` schedules only *agent turns* (static
message payloads) — it cannot run a multi-step wrapper — and `openclaw cron runs`
history covers only those native single-turn jobs. So the substrate is the
existing doc-drift **imperative-shell** pattern, not native cron:

- **Trigger:** an external `/etc/cron.d` entry invoking the orchestrator **wrapper**
  (bash) — the existing doc-drift scheduling mechanism; avoids gotcha #13.
- **Selection/commit:** the tested TS CLIs (`scope-select/`), called by the wrapper.
- **Worker:** invoked as a plain `openclaw agent --scope <id>` subprocess from the
  wrapper — not nested inside an embedded Lobster tool.
- **Observability:** the wrapper's **fail-closed** Telegram notification
  (drift-found / failed / silent-on-clean) + `doc-drift-cron.log` + the **per-scope
  state file** (which scope, at which commit/when). Absence is caught by the
  cross-cutting dead-man's-switch (`agents/TODO.md` §1). Neither the tasks ledger
  (broken — §4) nor `openclaw cron runs` history applies to a `/etc/cron.d` wrapper.
- **Lobster:** dropped from the production path (it provided neither the nested
  invocation nor the ledger observability it was chosen for here).

> The Phase-4 cron-run-history observation (§5 above) is real but applies to a
> *single* native-cron agent turn — not the multi-step wrapper — so it is not the
> orchestrator's observability mechanism.

## What survives unchanged (ADR-001 core)

Scope selection as tested, version-controlled TS code; one scope per run; eligible
set = changed ∪ stale under budget; every run's outcome observable (fail-closed).
Only the *substrate* (Lobster + tasks ledger → `/etc/cron.d` wrapper + fail-closed
notification/log/state) swaps — exactly the swap ADR-001's *Decision stability*
section anticipated.

## Reproduction pointers

- Task store: `~/.openclaw/tasks/runs.sqlite`; TaskFlow store:
  `~/.openclaw/flows/registry.sqlite` (both `0700`, no `sqlite3` on host).
- Ledger queries: `openclaw tasks list --json`, `openclaw tasks flow list`,
  `openclaw tasks maintenance --json`, `openclaw tasks audit`.
- Cron run history: `openclaw cron runs --id <jobId>`.
- Lobster runner: `node ~/.openclaw/extensions/lobster/node_modules/@clawdbot/lobster/bin/lobster.js`
  (`graph --file … --format ascii`, `run --dry-run --file …`).
