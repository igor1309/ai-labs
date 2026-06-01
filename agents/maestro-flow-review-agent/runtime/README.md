---
date: 2026-06-01
model: claude-opus-4-8
description: "Runtime infrastructure for maestro-flow-review-agent on the OpenClaw VPS: cron wrapper, cron entry, heartbeat notification behavior, deployment notes"
---

# Runtime Infrastructure

Files here describe the VPS-side wiring needed to run the maestro-flow-review-agent. They are NOT loaded by OpenClaw at agent runtime — only `agent/` is. These are operator-facing artifacts kept under version control so the deployment is reproducible.

> **Topic routing.** No per-agent Telegram bot/account. Per the ai-labs OpenClaw convention (see `agents/README.md`), the agent lives in the shared supergroup `-1003954520541` on `@igor1309_ai_labs_bot` (account `docdrift`): notifications post to the **`#maestro-review` topic (thread 2)** via `message_thread_id`; inbound triggering is routed by that topic's per-topic `agentId`. The agent appears only in `openclaw.json` `agents.list` (id + workspace) plus `accounts.docdrift.groups."-1003954520541".topics."2".agentId` — no `channels.telegram.accounts`/`bindings` entry of its own.

## Layout

| Path | Deployed to | Owner / mode |
|------|-------------|--------------|
| `cron/maestro-review-cron.sh` | `/home/openclaw/.openclaw/scripts/maestro-review-cron.sh` | `openclaw:openclaw` 700 |
| `cron/openclaw-maestro-review.cron` | `/etc/cron.d/openclaw-maestro-review` | `root:root` 644 |

## Repository under review

The agent reviews `igor1309/ios.config`, **not** `ai-labs`. The wrapper refreshes a checkout at `/home/openclaw/ios.config` to the latest `trunk` (ios.config's default branch) before invoking the agent.

## Model

The agent runs on the **gateway default model** — `openclaw.json` → `agents.defaults.model.primary`, currently `codex/gpt-5.5` (codex harness over OpenAI OAuth). There is no per-agent model override; it inherits whatever the gateway is set to (`openclaw models set <model>`). The gateway also has **OpenRouter configured as a fallback** (`OPENROUTER_API_KEY` is loaded and OpenRouter models are in the list), so OpenRouter activates only if Codex fails — a single-provider outage degrades the model rather than killing the run.

If the model/auth is genuinely unavailable (Codex OAuth invalid *and* OpenRouter fallback failing), the `openclaw agent` call errors or returns no run summary. The wrapper is **fail-closed**: it posts the `⚠ run FAILED` message (`notification-spec.md`), never a falsely-clean heartbeat. OAuth liveness is maintained out-of-band by OpenClaw's daily 04:00 UTC proactive-refresh + 04:30 monitor; a hard auth failure stops the gateway and raises a "manual reauth required" alert, in which case this agent's 03:00 tick simply cannot fire (absence = failure, as designed).

## Bot token

Reused, not new: the wrapper reads `channels.telegram.accounts.docdrift.botToken` from `~/.openclaw/openclaw.json` (mode 600) at runtime via `jq`; never inlined into any version-controlled file. Rotating the `docdrift` bot token rotates this agent's notifier too.

## Heartbeat notification behavior

This agent uses the **heartbeat model** (`agent/notification-spec.md`): the wrapper posts **exactly one message per cron tick**, so the absence of a message at the scheduled cadence (03:00 UTC daily) means the cron or host failed — not that nothing happened.

- **Findings > 0:** Findings message (counts + PR link); body truncated at ~4000 chars, remainder in the cron log.
- **0 findings (clean run):** `✓ ran — 0 findings` heartbeat — the liveness ping. This is the deliberate difference from `doc-drift-agent`, which is silent on a clean scheduled run.
- **Suppressed tick:** the wrapper posts `⏸ suppressed — manual run <Xh Ym> ago` itself (the agent is never invoked), so suppression is distinguishable from failure.
- **Invocation failed:** `⚠ run FAILED` — non-zero exit or no parseable run summary (the model-unavailable path; see **Model** above). Fail-closed so a failure never masquerades as a clean heartbeat.

The wrapper fills these templates from the agent's parseable run summary (the `- Findings: …` / `- Commit: …` block defined in `notification-spec.md`).

## Manual-run timestamp persistence

The 12h suppression gate (`agent/suppression-policy.md`) reads `/home/openclaw/.openclaw/agents/maestro-flow-review-agent/state.json` (`last_manual_run_utc`). The wrapper *reads* it on every scheduled tick; the **agent writes** it on manual-run completion via step 10 of `agent/agent.md`. Manual vs scheduled is detected by the literal `--scheduled` token: the wrapper always sends `/maestro-review --scheduled`; manual DMs do not.

## Deployment

The agent definition (`agent/**`) ships to `~/.openclaw/workspace-maestro-review/` via `.github/workflows/maestro-flow-review-agent-sync.yml` on `trunk` push (renaming `agent.md` → `AGENTS.md`), mirroring `doc-drift-agent-sync.yml` and reusing the `OPENCLAW_DEPLOY_SSH_KEY` secret.

This `runtime/` tree is operator-applied once on the VPS:

1. `git clone` (or `gh repo clone`) `igor1309/ios.config` to `/home/openclaw/ios.config`, on `trunk`.
2. `mkdir -p ~/.openclaw/agents/maestro-flow-review-agent` (state dir).
3. Copy `cron/maestro-review-cron.sh` → `~/.openclaw/scripts/maestro-review-cron.sh`, `chmod 700`.
4. Install `cron/openclaw-maestro-review.cron` → `/etc/cron.d/openclaw-maestro-review` (root:root, 644).
5. Add `{ "id": "maestro-flow-review-agent", "workspace": "/home/openclaw/.openclaw/workspace-maestro-review" }` to `openclaw.json` `agents.list` (no account/binding — reuses `docdrift` for notifications), then `systemctl restart openclaw`.

The live VPS state must be reflected in the `inventory` repo (`vps/OpenClaw/README.md`, `migration.md`, `log.md`) in the same change.
