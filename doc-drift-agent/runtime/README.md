---
date: 2026-05-09
model: claude-opus-4-7
description: "Runtime infrastructure for doc-drift-agent on the OpenClaw VPS: cron wrapper, cron entry, deployment notes"
---

# Runtime Infrastructure

Files in this directory describe the VPS-side wiring needed to run the doc-drift-agent. They are NOT loaded by OpenClaw at agent runtime — only the contents of `agent/` are. These are operator-facing artifacts kept under version control so the deployment is reproducible.

## Layout

| Path | Deployed to | Owner / mode |
|------|-------------|--------------|
| `cron/doc-drift-cron.sh` | `/home/openclaw/.openclaw/scripts/doc-drift-cron.sh` | `openclaw:openclaw` 700 |
| `cron/openclaw-doc-drift.cron` | `/etc/cron.d/openclaw-doc-drift` | `root:root` 644 |

## Bot token

The bot token is stored only in `~/.openclaw/openclaw.json` under `channels.telegram.accounts.docdrift.botToken` (file mode 600). The cron wrapper reads it at runtime via `jq`; the token is never inlined into the script or any version-controlled file. Rotate by replacing the value in `openclaw.json` and restarting the gateway.

## Telegram notification behavior

The wrapper posts a `notification-spec.md`-shaped Telegram message based on the agent's stdout:

- **Findings > 0:** posts the agent's full drift report (truncated at ~4000 chars; remainder in the cron log on the VPS).
- **Scheduled run + 0 findings:** silent. No Telegram message — only a syslog line.
- **Manual run + 0 findings (when invoked through this wrapper):** would emit a short ack; the current wrapper only fires from cron, so in practice manual runs go through Telegram-DM directly and the response goes back to the originating chat naturally.

## Manual-run timestamp persistence

The 12h suppression gate reads `/home/openclaw/.openclaw/agents/doc-drift-agent/state.json` (`last_manual_run_utc`). The cron wrapper *reads* this file on every scheduled tick. The **agent itself writes** the file on manual-run completion via step 9 of `agent/agent.md`, using its `write` tool. The trigger is detected by the absence of the literal `--scheduled` token in the message body — the cron wrapper always sends `/doc-drift-review --scheduled`, while manual DMs do not. Verified end-to-end on 2026-05-09 with a step-9-only invocation that wrote a real timestamp.

## Deployment

Initial deployment was done out-of-band on 2026-05-09 via SSH. Subsequent updates to `cron/doc-drift-cron.sh` are not auto-synced — the CI workflow at `.github/workflows/doc-drift-agent-sync.yml` only ships `agent/**` to the workspace. To redeploy this script, scp it to the VPS path above and `chmod 700`.
