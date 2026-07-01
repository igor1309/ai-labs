---
date: 2026-07-01
author: Igor Malyarov
version: 0.0.1
status: proposed
source_intent: inventory vps/OpenClaw/hermes-memory-review-agent-handoff.md (2026-07-01)
description: "Use a dedicated OpenClaw agent for the weekly review step of the Hermes self-improvement loop: it turns a read-only Hermes memory snapshot into a proposing-only review report in the canonical skills repo, and pings a Telegram topic hourly when new memory writes are staged. Never writes to Hermes, never merges."
---

# ADR: Specialized OpenClaw Agent for Hermes Memory Review

## 1. Executive Summary

Use a dedicated OpenClaw agent to run the **weekly review** step of the Hermes
self-improvement loop defined in the inventory-side
`vps/Hermes/adr/adr-001-canonical-skill-distribution.md`. Once a week the agent
reads a **read-only** dated snapshot of a Hermes bot's memory, `state.db`, and
staged `pending/` writes, and produces a **proposing-only** markdown review
report committed (never merged) to the canonical skills repo at
`reviews/memory-review/<YYYY-MM-DD>.md`. Separately, an **hourly deterministic
ping** (owned by the cron wrapper, no LLM) notifies a Telegram topic when new
memory writes are staged, so learning gets fast visibility. A human is the only
promotion gate.

## 2. Context

Hermes bots self-edit their skills and memory. Under inventory ADR-001 those
edits now stage via `write_approval` instead of auto-applying, a daily snapshot
(18:00 UTC) archives them, and a weekly review turns the snapshot into
proposals; canonical skills change only by human-merged PR. That review step is
this agent.

Ownership boundary (from the handoff): **ai-labs owns the agent cores/skills** —
this definition, its `runtime/` cron wrapper, and the CI-sync workflow.
**Inventory owns the wiring** — enabling `write_approval`, the daily snapshot
job, the OpenClaw cron scheduling/deploy, cross-host snapshot reads, the
canonical skills repo location, and Telegram topic/bot allocation.

Constraints:

- Reuse the existing OpenClaw instance; one active run at a time on a small VPS.
- Read-only over the snapshot; the agent never writes to Hermes.
- The maintainer reviews and merges; the agent never merges or approves.
- The two verified OpenClaw runtime constraints from the `add-openclaw-agent`
  skill apply (forum-topic file delivery via `sendDocument`; web-search needs a
  provider).

Rejected alternatives:

- Auto-apply staged proposals — the exact silent drift ADR-001 removes.
- Open PRs from the review now (Option C) — deferred; v0.0.1 is a committed
  report only (Option B).
- Run the hourly ping through the LLM agent — the ping is a deterministic file
  count; invoking the model hourly is waste. The wrapper owns it.

## 3. Decision

Use a specialized OpenClaw agent for **Hermes memory review**:

- **Weekly review (LLM).** On a Sunday 06:00 UTC cron (and manual trigger), the
  agent reads the read-only dated snapshot and emits one report per run, shaped
  by `agent/report-format.md`, with the seven fixed sections. Each finding
  carries snapshot evidence. It commits the report to the canonical skills repo
  at `reviews/memory-review/<snapshot-date>.md` and returns a structured
  run-result to the wrapper. It proposes only — it opens no PR and never merges.
- **Hourly ping (deterministic, wrapper-owned).** The cron wrapper reads the
  bot's `pending/memory/`, diffs it against a durable cursor, and posts one
  short "memory updates staged" count to the ping topic when there is something
  new, silent otherwise. No LLM invocation.
- **Delivery, gating, state (wrapper).** The wrapper owns repo freshening, the
  suppression gate, the concurrency lock, `sendDocument` file delivery, the
  failed-run alert, and the ping cursor. The agent owns the review reasoning and
  the report content.

The full contract is
`agents/hermes-memory-review-agent/docs/specs/hermes-memory-review-agent-v0.0.1.md`.

## 4. Rules / Invariants

- The agent **MUST** treat the snapshot and `pending/` as read-only; it never
  writes to Hermes or the snapshot.
- The agent **MUST NOT** apply, promote, or merge any staged proposal; the
  weekly output is a committed report only. Option C (proposal files + PRs) is
  out of scope for v0.0.1.
- Every review finding **MUST** carry snapshot evidence (a file path within the
  dated dir, or a `state.db` query + stable id); an evidence-less finding is
  dropped.
- The report **MUST** contain the seven fixed sections in order (never omitting
  an empty section) per `agent/report-format.md`.
- The weekly report file **MUST** be delivered into its forum topic via
  `sendDocument` (the `message` tool is auto-disabled in forum topics).
- The hourly ping **MUST** be silent when nothing new is staged and **MUST NOT**
  transcribe or apply memory content — it carries only a count.
- The ping cursor **MUST** advance only after a ping is delivered successfully.
- Scope: v0.0.1 covers a **single** Hermes bot; multi-bot aggregation is a later
  version.

## 5. Consequences

- The review step of the Hermes loop is automated; canonical skills still change
  only by human-merged PR — drift stays closed.
- The runtime specs (`agent.md`, `report-format.md`, `review-methodology.md`,
  `notification-spec.md`, `suppression-policy.md`) follow this ADR and are
  CI-synced to the live workspace on `trunk` merge.
- A `/etc/cron.d` wrapper (`runtime/cron/hermes-memory-review-cron.sh`) drives
  the weekly review (with a 24h manual-run suppression gate) and the hourly ping,
  and posts the `notification-spec.md`-shaped Telegram messages.
- Several concrete values are inventory-owned and handed to the agent at wiring
  time: canonical repo location + branch, snapshot/pending paths, Telegram
  `chat_id` + both `message_thread_id`s, bot token, and gateway `sqlite3`
  availability.

## 6. Non-Goals

- Not writing to Hermes, the snapshot, or `pending/` — ever.
- Not auto-applying, merging, or approving anything.
- Not opening review PRs in v0.0.1 (Option C deferred).
- Not aggregating multiple Hermes bots in v0.0.1.
- Not running the hourly ping through the LLM.
