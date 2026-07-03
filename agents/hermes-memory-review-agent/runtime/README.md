---
date: 2026-07-01
model: claude-opus-4-8
description: "Runtime infrastructure for hermes-memory-review-agent on the OpenClaw VPS: the two-mode cron wrapper, the cron entries, inventory-owned config to fill at wiring, and deployment notes."
---

# Runtime Infrastructure

Files here describe the VPS-side wiring to run the hermes-memory-review-agent.
They are **not** loaded by OpenClaw at agent runtime — only `agent/**` is. These
are operator-facing artifacts kept under version control so the deployment is
reproducible. ai-labs owns these files as the source of truth; **inventory owns
the concrete values** they reference and the act of deploying/scheduling them.

## Layout

| Path | Deployed to | Owner / mode |
|------|-------------|--------------|
| `cron/hermes-memory-review-cron.sh` | `/home/openclaw/.openclaw/scripts/hermes-memory-review-cron.sh` | `openclaw:openclaw` 700 |
| `cron/openclaw-hermes-memory-review.cron` | `/etc/cron.d/openclaw-hermes-memory-review` | `root:root` 644 |

## Two-mode wrapper

`cron/hermes-memory-review-cron.sh` runs in two modes:

- `--weekly` (Sunday 06:00 UTC): enforces the 24h manual-run suppression gate
  (`agent/suppression-policy.md`), refreshes the canonical checkout, picks the
  latest dated snapshot, invokes the LLM agent, then delivers the report via
  `sendDocument` + a compact summary, or a fail-closed alert. The **agent**
  commits and pushes the report; the wrapper only notifies.
- `--hourly` (every hour at :20): deterministic memory-ping — counts
  `pending/memory/` ids not in the durable cursor (`state.json last_ping`) and
  posts a count to the ping topic, silent when nothing new. **No LLM.**

Both modes take a shared `flock` so the Sunday-06:00 edge and manual/scheduled
overlap resolve to a skip, never a concurrent run.

## Inventory-owned config to fill before first run

The wrapper ships with `__SET_AT_WIRING__` placeholders and **refuses to run**
until every one is replaced on the deployed copy. Fill these at wiring time (they
are inventory-owned per the ownership boundary) and record them in the inventory
`migration.md` + dated `log.md`:

| Placeholder | Meaning |
|-------------|---------|
| `CHAT_ID` | ai-labs agents supergroup chat id |
| `REVIEW_THREAD_ID` | `message_thread_id` of the review topic |
| `PING_THREAD_ID` | `message_thread_id` of the memory-ping topic |
| `SNAPSHOT_ROOT` | dir holding dated Hermes snapshots (`<root>/<YYYY-MM-DD>/`) |
| `PENDING_MEMORY_DIR` | near-live Hermes `pending/memory` dir for the hourly ping |
| `CANONICAL_REPO` | checkout of the canonical skills repo (report commit target) |
| `CANONICAL_BRANCH` | target branch for report commits |

Two topics must be created (review, memory-ping) and their `threadId`s captured
via the message-link trick (see `add-openclaw-agent` skill). Cross-host read of
the snapshot and `pending/memory` (box-1 agent ↔ box-2 Hermes) is inventory's to
wire. Confirm `sqlite3` is installed on the gateway (the agent queries `state.db`).

## Bot token

Stored only in `~/.openclaw/openclaw.json` under
`channels.telegram.accounts["ai-labs"].botToken` (mode 600). The wrapper reads it
at runtime via `jq`; never inlined into the script or any version-controlled
file. Rotate by replacing the value and restarting the gateway.

## Per-agent state

`~/.openclaw/agents/hermes-memory-review-agent/state.json` holds two independent
fields:

- `last_manual_run_utc` — written by the **agent** on manual weekly runs (step 8
  of `agent/agent.md`); read by the wrapper for the 24h suppression gate.
- `last_ping` = `{ ids: [...], utc: "..." }` — written by the **wrapper** on each
  delivered hourly ping; the durable cursor for "new since last ping".

Both writers use the **same `flock`** (`run.lock`) and an atomic
temp-file-beside-then-`mv` merge, so `last_ping` and `last_manual_run_utc` never
clobber each other even if an hourly tick and a manual weekly run overlap. The
wrapper is the sole writer of `last_ping`; the agent is the sole writer of
`last_manual_run_utc` (via the lock-guarded `jq` merge in `agent/agent.md` step 8).

## Deployment

`runtime/**` is **not** CI-synced — the `.github/workflows/hermes-memory-review-agent-sync.yml`
workflow ships only `agent/**` to the workspace. To (re)deploy this wrapper: scp
it to the VPS path above, `chmod 700`, fill the placeholders, and install the
cron entry at `/etc/cron.d/`. Mirror the live change into the inventory repo
(`vps/OpenClaw/*`) in the same change.
