---
date: 2026-06-02
model: claude-opus-4-8
description: "Telegram notification format for the doc-drift-agent: the compact drift-found message the cron wrapper builds from the report, the silent-on-clean-scheduled rule, and the mandatory plain-text rendering contract"
---

# Notification Spec

The cron wrapper (`runtime/cron/doc-drift-cron.sh` for scheduled runs, or the OpenClaw Telegram listener for manual runs) posts one Telegram message per agent run. The format is fixed so the maintainer can scan it on a phone in two seconds. The wrapper builds the message from the drift report (`report-format.md`); it does not forward the report.

## When a notification is posted

| Run mode | Findings | Telegram message |
|----------|----------|------------------|
| manual | ≥ 1 | "Drift found" message (below) |
| manual | 0 | "No drift" acknowledgement (below) |
| scheduled | ≥ 1 | "Drift found" message (below) |
| scheduled | 0 | **silent** — no message posted |
| any | run failed | "Run failed" alert (below) |

Rationale for "silent on scheduled, ack on manual": scheduled runs are expected to be quiet; a no-drift Telegram ping every cadence period is noise. Manual runs are operator-initiated; the operator wants confirmation the run completed even when nothing was found. A *failed* run is never silent — see "Run-failed alert".

## Rendering

These rules are mandatory; a run that posts anything else to Telegram is a defect.

- **Never post the agent's raw run report.** The report (per `report-format.md`) is Markdown — a `# Doc Drift Report` header, per-finding `##` blocks, and a `| Finding | … |` table — which Telegram does not render and which reads as noise. Worse, the `openclaw agent` invocation also emits plugin warnings (`[plugins] plugins.allow is empty …`) and tool-call traces (`⚠️ 🛠️ run … failed`) into the captured output. The wrapper parses the report's `- Field: value` header lines plus the Fix PRs table URLs and emits only the compact format below. Forwarding the captured output verbatim is the bug this section exists to prevent.
- **Send as plain text.** Post with no Telegram parse mode (no Markdown, no MarkdownV2, no HTML). The compact format contains no markup, so literal `#`, `|`, `*`, or backticks must never appear in a posted message. Because no parse mode is set, message text needs no escaping.
- **One message per run.** A single message in the compact format, not a stream of lines or the multi-section report.

## Drift-found message

The `·` separators are literal plain-text characters, not Markdown. The whole block is the message body.

```
[doc-drift] Drift found — <count> finding(s)

Run: <manual | scheduled> · <YYYY-MM-DD HH:MM UTC>
Commit: <short SHA> on trunk
READMEs inspected: <count>

PRs opened: <new> · already tracked: <tracked>
- <PR URL>
- ...

Do not auto-merge. Review each PR manually.
```

Rules:

- The `[doc-drift]` prefix matches the PR title prefix in `fix-pr-template.md`. Same string, byte-identical.
- Every value is parsed from the report header (`report-format.md` "Top-level structure"): `<count>` from `Findings`, `<new>` from `Fix PRs opened`, `<tracked>` from `Already tracked`, `READMEs inspected` and `Commit` from their header lines. The wrapper does not recompute them.
- The PR list is the `https://…/pull/<n>` URLs from the report's Fix PRs table, in table order, deduplicated. When a finding produced no PR (e.g. the fix would touch a non-README file the agent may not edit), the list line is `- (no PR opened — see report … on VPS)` so the maintainer knows to read the full report.
- The closing "Do not auto-merge" line is mandatory. It mirrors the social safety net in `fix-pr-template.md`.
- No Markdown rendering tricks (no inline images, no buttons, no tables) — Telegram clients vary too much. Plain text + URLs is the entire surface.

## Run-failed alert

Posted when the agent invocation exits non-zero or emits no parseable report header (`- Findings: ` absent). The wrapper is fail-closed: a failed run must never be misread as a clean (silent) one.

```
[doc-drift] ⚠ run FAILED — no valid report

Run: scheduled · <YYYY-MM-DD HH:MM UTC>
Exit: <rc> · report: <present | missing>
Likely the model/auth was unavailable or a tool crashed. Check the gateway and <log path> on VPS.

<bounded tail of the captured output>
```

Rules:

- Only a bounded tail of the captured output is included (never the whole file), so a flood of plugin warnings or tool traces cannot reconstruct the raw-dump bug.
- The alert is posted in any run mode — a failure the maintainer cannot see is worse than noise.

## No-drift acknowledgement (manual run only)

```
[doc-drift] No drift found

Run: manual · <YYYY-MM-DD HH:MM UTC>
Commit: <short SHA> on trunk
READMEs inspected: <count>
```

Rules:

- Posted only for manual runs. Scheduled runs with zero findings are silent.
- One line per field; no extra commentary.
- The `READMEs inspected:` count must match the report header's count.

## Telegram channel

Shared bot `@igor1309_ai_labs_bot` (OpenClaw account `ai-labs`), posting into the forum supergroup `-1003954520541`, topic `#doc-drift` (`message_thread_id` 4). This replaces the retired per-agent `docdrift` account and maintainer DM `54589373` (one-bot + per-agent-topic routing went live 2026-06-01; see `docs/log.md`). The live cron wrapper on the VPS is the source of truth for the token and thread id; these values are recorded here so the spec is not stale.

## Failure modes

If OpenClaw cannot post the Telegram message (network failure, rate limit, invalid token), the runtime must:

1. Persist the message body locally so it can be replayed.
2. Surface the failure via the standard OpenClaw alerting path on the VPS (out of scope for this spec).

The agent's drift report and any PRs it opened are unaffected by Telegram failures — they remain valid artifacts on GitHub.
