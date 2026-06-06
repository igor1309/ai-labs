---
date: 2026-06-02
model: claude-opus-4-8
description: "Reference: what OpenClaw TaskFlow is and how to use it. Verified against the live 2026.5.28 install on the RackNerd VPS (107.172.143.196) and docs.openclaw.ai."
---

# OpenClaw TaskFlow — What It Is and How to Use It

Grounded against the live CLI (OpenClaw `2026.5.28`, commit `e932160`) on the
RackNerd VPS (`107.172.143.196`) and the official docs at `docs.openclaw.ai`.

## What It Is

**TaskFlow** (the docs spell it "Task Flow") is OpenClaw's **flow-orchestration
layer that sits above background tasks**. A background task is one unit of
detached work; a TaskFlow coordinates **multi-step, durable workflows**
(A → B → C) that own their own state, track revisions, and survive Gateway
restarts.

There is no top-level `openclaw flows` command — all inspection lives under
`openclaw tasks flow`.

It was previously called **ClawFlow**, now redirected to Task Flow. The older
`api.runtime.taskFlow` plugin alias is deprecated.

## When to Use It vs. Alternatives

| Scenario | Use |
| --- | --- |
| Single detached job | plain background task (`openclaw tasks`) |
| Multi-step pipeline with branching/progress that must survive restarts | TaskFlow (managed) |
| Observe tasks created elsewhere (cron/CLI) under one progress view | TaskFlow (mirrored) |
| One-time reminder / scheduled wake | cron (`openclaw cron`) |
| Permanent operating authority | standing orders |

### Two Modes

- **Managed** — TaskFlow creates the tasks, drives them to completion, and
  advances state between steps itself.
- **Mirrored** — TaskFlow only *observes* independently created tasks (from
  cron, CLI, etc.) and maintains a unified progress view without owning task
  creation.

### Durability

- Each flow persists its state in SQLite with revision-based conflict detection
  and periodic checkpoints (to bound WAL-file growth).
- A **cancel intent is "sticky"** — a cancelled flow stays cancelled across
  Gateway reboots.

## How to Use It (CLI)

Inspection and control live under `openclaw tasks flow`:

```bash
openclaw tasks flow list          # list tracked TaskFlows
openclaw tasks flow show <id>     # show one flow by flow id or owner key
openclaw tasks flow cancel <id>   # cancel a running flow (and its active tasks)
```

The parent `tasks` command covers the underlying task ledger / audits:

```bash
openclaw tasks list                       # tracked background tasks
openclaw tasks list --runtime cron        # filter by kind: subagent|acp|cron|cli
openclaw tasks list --status running      # queued|running|succeeded|failed|timed_out|cancelled|lost
openclaw tasks show <id>                  # one task by task id / run id / session key
openclaw tasks audit                      # stale or broken tasks AND TaskFlows
openclaw tasks maintenance                # preview/apply tasks + TaskFlow maintenance
openclaw tasks notify                     # set task notify policy
```

Add `--json` to script against any of these.

## How Flows Get Created / Triggered

You do not hand-author a flow file. Flows are produced by the agent
runtime/plugins. The typical pattern stacks layers:

1. **cron** schedules it.
2. an optional **session** carries persistent context.
3. **Lobster** provides deterministic resumable steps with approval gates.
4. **TaskFlow** orchestrates the multi-step run.

External systems can also kick off flows via the **webhooks plugin**
(authenticated TaskFlow ingress).

Recommended practice inside a flow:

- preflight checks (credentials, network reachability, required tools)
- approval gates before critical actions
- provenance fields (`sourceUrl`, `retrievedAt`, `asOf`) with stale-data
  rejection before LLM steps

## Ledger not populating on the VPS (watch item)

> **2026-06-02 finding:** on the live unit (`2026.5.28`) the tasks/TaskFlow ledger
> records **nothing** for any run type tested — foreground `openclaw agent`, the
> in-gateway `lobster` tool, or cron-dispatched isolated turns — even though the
> docs say cron/CLI runs create task records and the machinery is present
> (`task_runs` table, `recordTask`, cron files wired). `runs.sqlite` stayed ~9 h
> stale while a 10-minute cron succeeded; `tasks maintenance` is all-zeros;
> `doctor` finds no fault; no config gate. The orchestrator (ADR-001 §7) therefore
> relies on its `/etc/cron.d` wrapper's fail-closed Telegram + log + per-scope state
> for observability, not this ledger. Full historical ai-labs diagnosis:
> `phase4-substrate-spike-findings.md` §4. Live OpenClaw diagnosis, versions,
> storage paths, and recheck schedule are owned by the inventory repo
> (`vps/OpenClaw/log.md` and `vps/OpenClaw/CLAUDE.md`).

## Live State on the VPS (2026-06-02)

At the time of writing, the production server had no flows running:

```text
TaskFlows: 0
TaskFlow pressure: 0 active · 0 blocked · 0 cancel-requested · 0 total

Tasks audit: 0 findings · 0 errors · 0 warnings
Task findings: 0 · TaskFlow findings: 0
```

## References

- https://docs.openclaw.ai/automation/taskflow
- https://docs.openclaw.ai/cli/tasks
- https://docs.openclaw.ai/cli/flows (redirect → `openclaw tasks flow`)
