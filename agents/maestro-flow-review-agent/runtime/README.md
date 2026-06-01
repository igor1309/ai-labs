---
date: 2026-06-01
model: claude-opus-4-8
description: "Runtime infrastructure for maestro-flow-review-agent on the OpenClaw VPS: cron wrapper, cron entry, heartbeat notification behavior, deployment notes"
---

# Runtime Infrastructure

Files here describe the VPS-side wiring needed to run the maestro-flow-review-agent. They are NOT loaded by OpenClaw at agent runtime — only `agent/` is. These are operator-facing artifacts kept under version control so the deployment is reproducible.

> **Draft / placeholders.** The OpenClaw account binding (`maestroreview`), bot, chat, and the on-host checkout of `igor1309/ios.config` are not provisioned yet. The account name in the wrapper is a placeholder the maintainer pins during runtime wiring.

## Layout

| Path | Deployed to | Owner / mode |
|------|-------------|--------------|
| `cron/maestro-review-cron.sh` | `/home/openclaw/.openclaw/scripts/maestro-review-cron.sh` | `openclaw:openclaw` 700 |
| `cron/openclaw-maestro-review.cron` | `/etc/cron.d/openclaw-maestro-review` | `root:root` 644 |

## Repository under review

The agent reviews `igor1309/ios.config`, **not** `ai-labs`. The wrapper refreshes a checkout at `/home/openclaw/ios.config` to the latest `trunk` (ios.config's default branch) before invoking the agent.

## Bot token

Stored only in `~/.openclaw/openclaw.json` under `channels.telegram.accounts.maestroreview.botToken` (file mode 600). The wrapper reads it at runtime via `jq`; never inlined into any version-controlled file. Rotate by replacing the value and restarting the gateway.

## Heartbeat notification behavior

This agent uses the **heartbeat model** (`agent/notification-spec.md`): the wrapper posts **exactly one message per cron tick**, so the absence of a message at the scheduled cadence (06:00 UTC daily) means the cron or host failed — not that nothing happened.

- **Findings > 0:** Findings message (counts + PR link); body truncated at ~4000 chars, remainder in the cron log.
- **0 findings (clean run):** `✓ ran — 0 findings` heartbeat — the liveness ping. This is the deliberate difference from `doc-drift-agent`, which is silent on a clean scheduled run.
- **Suppressed tick:** the wrapper posts `⏸ suppressed — manual run <Xh Ym> ago` itself (the agent is never invoked), so suppression is distinguishable from failure.

The wrapper fills these templates from the agent's parseable run summary (the `- Findings: …` / `- Commit: …` block defined in `notification-spec.md`).

## Manual-run timestamp persistence

The 12h suppression gate (`agent/suppression-policy.md`) reads `/home/openclaw/.openclaw/agents/maestro-flow-review-agent/state.json` (`last_manual_run_utc`). The wrapper *reads* it on every scheduled tick; the **agent writes** it on manual-run completion via step 10 of `agent/agent.md`. Manual vs scheduled is detected by the literal `--scheduled` token: the wrapper always sends `/maestro-review --scheduled`; manual DMs do not.

## Deployment

Not yet deployed. A CI sync workflow (to be added under `.github/workflows/`) would ship `agent/**` to the OpenClaw workspace, mirroring `doc-drift-agent-sync.yml`. This `runtime/` tree is operator-applied: scp `cron/maestro-review-cron.sh` to the path above and `chmod 700`, install the `.cron` entry, then provision the account/bot/checkout.
