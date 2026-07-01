---
date: 2026-07-01
model: claude-opus-4-8
description: "hermes-memory-review-agent project README — the weekly Hermes memory-review agent definition owned by ai-labs, runtime hosted in OpenClaw; wiring owned by inventory."
---

# hermes-memory-review-agent

Definition for a specialized OpenClaw agent that runs the **weekly review** step
of the Hermes self-improvement loop: it reads a read-only dated Hermes memory
snapshot and proposes changes to the canonical coaching skills as a committed
review report, and pings a Telegram topic hourly when new memory writes are
staged. Read-only over Hermes; it never merges — a human is the only promotion
gate.

This directory owns the source of truth for what the agent reviews, how it
reports, and its notification shape. The runtime — schedule, credentials, and the
concrete host/Telegram/snapshot values — lives in OpenClaw and the inventory
repo, and is out of scope here.

## Status

Proposed — not yet deployed. The definition and its runtime wrapper are authored;
inventory-owned wiring (see below) must be provisioned before first run.

## Ownership boundary

- **ai-labs owns** the agent core/skills (`agent/**`), the runtime cron wrapper
  (`runtime/**`), and the CI-sync workflow.
- **Inventory owns** the wiring: enabling `write_approval` on Hermes, the daily
  18:00 UTC snapshot job, the OpenClaw cron scheduling/deploy, cross-host snapshot
  and `pending/memory` reads, the canonical skills repo location, and Telegram
  topic/bot allocation. Design context:
  `inventory vps/Hermes/adr/adr-001-canonical-skill-distribution.md`.

## Source

- Handoff: `inventory vps/OpenClaw/hermes-memory-review-agent-handoff.md`
- ADR: `docs/adr-specialized-openclaw-agent-hermes-memory-review.md`
- Spec: `docs/specs/hermes-memory-review-agent-v0.0.1.md`

## Layout

`agent/` holds everything OpenClaw loads at runtime — the system prompt plus the
artifacts it references. `docs/` holds project meta-docs not loaded by the
runtime. `runtime/` holds the VPS cron wiring (scheduled agent).

| Path | Purpose |
|------|---------|
| `agent/agent.md` | Agent system prompt (weekly review) |
| `agent/review-methodology.md` | How to mine the snapshot; section qualification; false-positive filters |
| `agent/report-format.md` | The seven-section review report shape + evidence fields |
| `agent/notification-spec.md` | Telegram format for the two topics + fail-closed alert |
| `agent/suppression-policy.md` | 24h scheduled-weekly suppression rule |
| `docs/adr-specialized-openclaw-agent-hermes-memory-review.md` | Source ADR |
| `docs/specs/hermes-memory-review-agent-v0.0.1.md` | Contract spec |
| `docs/intake.md` | Intake brief |
| `docs/log.md` | Project log |
| `runtime/cron/hermes-memory-review-cron.sh` | VPS two-mode cron wrapper (weekly review + hourly ping) |
| `runtime/cron/openclaw-hermes-memory-review.cron` | `/etc/cron.d` entries (Sun 06:00 weekly + hourly :20) |
| `runtime/README.md` | Deployment notes + inventory-owned config to fill |

## Boundaries

- Read-only over the Hermes snapshot and `pending/` — never writes to Hermes.
- Proposes only — commits a report; never opens a PR (Option C deferred), merges,
  or approves.
- The hourly ping is deterministic and wrapper-owned — no LLM invocation.
- v0.0.1 covers a single Hermes bot.

## Inventory-coordination checklist (values handed to the agent at wiring)

Provision these before first run (they are inventory-owned; see `runtime/README.md`):

- [ ] Canonical skills repo location + target branch for report commits.
- [ ] Snapshot root path and near-live `pending/memory` path (cross-host read).
- [ ] Telegram `chat_id`.
- [ ] Review-topic `message_thread_id`.
- [ ] Memory-ping-topic `message_thread_id`.
- [ ] Bot token present in `openclaw.json` (shared `ai-labs` account).
- [ ] `sqlite3` available on the gateway (agent queries `state.db`).

## Stack

- OpenClaw
- Markdown
- SQLite (`state.db` review)
- Git (report commit to the canonical repo)
- Telegram
