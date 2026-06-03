---
date: 2026-06-02
model: claude-opus-4-8
description: "Runtime infrastructure for doc-drift-agent on the OpenClaw VPS: cron wrapper, cron entry, deployment notes"
---

# Runtime Infrastructure

Files in this directory describe the VPS-side wiring needed to run the doc-drift-agent. They are NOT loaded by OpenClaw at agent runtime — only the contents of `agent/` are. These are operator-facing artifacts kept under version control so the deployment is reproducible.

## Layout

| Path | Deployed to | Owner / mode |
|------|-------------|--------------|
| `cron/doc-drift-orchestrator.sh` | `/home/openclaw/.openclaw/scripts/doc-drift-orchestrator.sh` | `openclaw:openclaw` 700 |
| `cron/doc-drift-cron.sh` | `/home/openclaw/.openclaw/scripts/doc-drift-cron.sh` | `openclaw:openclaw` 700 |
| `cron/openclaw-doc-drift.cron` | `/etc/cron.d/openclaw-doc-drift` | `root:root` 644 |

### Scoped orchestrator (ADR-001 §7)

`cron/doc-drift-orchestrator.sh` is the scoped nightly orchestrator: it refreshes the
source clone, runs the tested `scope-select/select-cli.js` to pick one scope (changed ∪
stale, budget 1), invokes `openclaw agent --scope <id>`, and — only on a verified-good
run — records the audit via `commit-cli.js` into the per-scope state file
`/home/openclaw/.openclaw/agents/doc-drift-agent/orchestrator-state.json`. Observability is
the fail-closed Telegram alert + this log + that state file (ADR-001 §7; the tasks ledger
is broken on the unit — `agents/TODO.md` §4). It **supersedes** `doc-drift-cron.sh` (the
all-READMEs-in-one-pass wrapper); the `/etc/cron.d` entry is repointed to it at the Phase 6
cutover. Config is env-overridable so the wiring is exercised by
`cron/doc-drift-orchestrator.test.sh` (`bash …test.sh`) with stubs, no host/network needed.

## Bot token

The bot token is stored only in `~/.openclaw/openclaw.json` under `channels.telegram.accounts["ai-labs"].botToken` (file mode 600). The cron wrapper reads it at runtime via `jq`; the token is never inlined into the script or any version-controlled file. Rotate by replacing the value in `openclaw.json` and restarting the gateway.

## Telegram notification behavior

The wrapper posts into the `#doc-drift` topic (`message_thread_id` 4) of the ai-labs agents supergroup `-1003954520541` via the shared `@igor1309_ai_labs_bot` (account `ai-labs`). It builds a `notification-spec.md`-shaped **compact** message by parsing the report header — it never forwards the agent's raw stdout (which carries Markdown, plugin warnings, and tool-call traces):

- **Findings > 0:** posts the compact "Drift found" summary (count, commit, READMEs inspected, PRs opened / already tracked, PR URLs) per `notification-spec.md` "Drift-found message".
- **Scheduled run + 0 findings:** silent. No Telegram message — only a syslog line.
- **Run failed (non-zero exit or no parseable report):** posts the fail-closed "run FAILED" alert with a bounded tail of the output, so a failed run is never misread as clean. See `notification-spec.md` "Run-failed alert".
- **Manual run + 0 findings (when invoked through this wrapper):** would emit a short ack; the current wrapper only fires from cron, so in practice manual runs go through the Telegram listener directly and the response goes back to the originating topic naturally.

## Manual-run timestamp persistence

The 12h suppression gate reads `/home/openclaw/.openclaw/agents/doc-drift-agent/state.json` (`last_manual_run_utc`). The cron wrapper *reads* this file on every scheduled tick. The **agent itself writes** the file on manual-run completion via step 9 of `agent/agent.md`, using its `write` tool. The trigger is detected by the absence of the literal `--scheduled` token in the message body — the cron wrapper always sends `/doc-drift-review --scheduled`, while manual DMs do not. Verified end-to-end on 2026-05-09 with a step-9-only invocation that wrote a real timestamp.

## Deployment

Initial deployment was done out-of-band on 2026-05-09 via SSH. Subsequent updates to `cron/doc-drift-cron.sh` are not auto-synced — the CI workflow at `.github/workflows/doc-drift-agent-sync.yml` only ships `agent/**` to the workspace. To redeploy this script, scp it to the VPS path above and `chmod 700`.
