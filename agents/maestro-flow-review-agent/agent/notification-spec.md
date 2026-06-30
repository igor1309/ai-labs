---
date: 2026-06-01
model: claude-opus-4-8
description: "Notification format for the maestro-flow-review-agent: findings, heartbeat (clean run), and suppressed-tick messages — heartbeat-on-clean so every scheduled tick produces exactly one message and absence means failure"
---

# Notification Spec

The runtime posts **exactly one message per cron tick** for this agent. That is the whole point of the heartbeat model: a tick always yields a message, so the *absence* of a message at the expected cadence (see `runtime/cron/openclaw-maestro-review.cron`) means the cron or the host failed — not that "nothing happened."

This differs deliberately from `doc-drift-agent`, which is silent on a clean scheduled run. Here a clean scheduled run still pings.

## Message matrix

| Tick outcome | Findings | Message |
|--------------|----------|---------|
| ran (manual) | ≥ 1 | **Findings** message |
| ran (manual) | 0 | **Heartbeat** message (`Run: manual`) |
| ran (scheduled) | ≥ 1 | **Findings** message |
| ran (scheduled) | 0 | **Heartbeat** message (`Run: scheduled`) |
| suppressed (scheduled) | — | **Suppressed** message |
| failed (any) | — | **Failed** message (wrapper-posted) |

Every row posts. There is no silent outcome.

"Failed" covers the case where the agent invocation does not return a valid result — a non-zero exit, or output with no parseable run summary. This is the model-unavailable path: the gateway model is the OpenClaw default (`agents.defaults.model.primary`, currently `codex/gpt-5.5` over OAuth, with OpenRouter as the gateway's fallback). If Codex auth is invalid and the OpenRouter fallback also fails, the call errors and emits no summary. The wrapper is **fail-closed**: it must post the Failed message, never a `0`-defaulted heartbeat that would falsely read as "✓ ran — 0 findings".

## Parseable run summary (agent → runtime)

So the runtime can fill the message without re-deriving anything, the agent ends every run with this block, one field per line, after the `review.md`-format review:

```
- Findings: <n>
- Critical: <n>
- Recommendations: <n>
- Minor: <n>
- Flows reviewed: <n>
- Commit: <short SHA>
- Fix: <short SHA of the trunk commit pushed | none>
```

`Fix: none` is correct and expected on a clean run or a Provisional-only run (no Verified diff to commit — see `agent.md`). The runtime reads `Findings` to choose between the Findings and Heartbeat templates; it copies the rest verbatim.

## Findings message

```
[maestro-review] Findings — <count>

Run: <manual | scheduled> · <YYYY-MM-DD HH:MM UTC>
ios.config: <short SHA> on trunk

Critical: <n> · Recommendations: <n> · Minor: <n>
Fix: <committed to trunk — short SHA | none>

Committed straight to trunk (ios.config uses trunk, not PRs). Review the change.
```

Rules:

- The `[maestro-review]` prefix is byte-identical to the commit-message prefix in `agent.md`.
- `Fix:` reads `none — no Verified fix to apply (findings are Provisional; see review)` when the run found issues but committed nothing.
- Counts come from the parseable summary; the runtime does not recompute them.

## Heartbeat message (clean run)

```
[maestro-review] ✓ ran — 0 findings

Run: <manual | scheduled> · <YYYY-MM-DD HH:MM UTC>
ios.config: <short SHA> on trunk
Flows reviewed: <count>
```

Rules:

- Posted on **every** clean run, scheduled or manual. This is the liveness signal.
- One line per field; no commentary. The maintainer scans it in two seconds and moves on.
- `Flows reviewed` must match the parseable summary's `Flows reviewed`.

## Suppressed message (wrapper-posted)

When the suppression gate skips a scheduled tick (`suppression-policy.md`), the agent is never invoked, so the **cron wrapper itself** posts this so the tick is not silent:

```
[maestro-review] ⏸ suppressed — manual run <Xh Ym> ago

Run: scheduled · <YYYY-MM-DD HH:MM UTC>
```

Rationale: without this, a suppressed tick would be indistinguishable from a failed tick, breaking the "absence = failure" guarantee. The maintainer already saw the manual run's message; this just confirms the scheduled cron fired and chose to defer.

## Failed message (wrapper-posted)

When the agent invocation exits non-zero or returns no parseable run summary, the wrapper posts:

```
[maestro-review] ⚠ run FAILED — no valid result

Run: scheduled · <YYYY-MM-DD HH:MM UTC>
Exit: <code> · run summary: <present | missing>
Likely the model/auth was unavailable (codex OAuth or OpenRouter fallback). Check the gateway and OAuth.

<last ~1200 chars of the run output>
```

This is the fail-closed branch — the deliberate opposite of a silent or falsely-clean heartbeat. A model outage, an OAuth-invalid gateway, or a crashed run all land here, not in the heartbeat. The included output tail lets the maintainer tell a model/auth failure from a code/runtime one without SSHing in.

## Telegram chat

The chat is the same one used as the manual-trigger listener for this agent's OpenClaw account, unless the maintainer configures a separate alerts chat. The account/chat binding is part of the runtime wiring left to the maintainer; the message shapes above are independent of which chat receives them.

## Failure modes

If the runtime cannot post (network, rate limit, invalid token), it must:

1. Persist the message body to the wrapper log (`runtime/cron/maestro-review-cron.sh` → `LOG_FILE`) for replay.
2. Surface the failure via the host's standard alerting path (out of scope here).

Any commit the agent pushed to trunk is unaffected by a notification failure — it remains on GitHub.
