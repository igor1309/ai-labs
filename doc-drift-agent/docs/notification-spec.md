---
date: 2026-05-09
model: claude-opus-4-7
description: "Telegram notification format for the doc-drift-agent: drift-found and no-drift cases, with the silent-on-scheduled / acknowledge-on-manual rule"
---

# Notification Spec

OpenClaw posts one Telegram message per agent run. The format is fixed so the maintainer can scan it on a phone in two seconds.

## When a notification is posted

| Run mode | Findings | Telegram message |
|----------|----------|------------------|
| manual | ≥ 1 | "Drift found" message (below) |
| manual | 0 | "No drift" acknowledgement (below) |
| scheduled | ≥ 1 | "Drift found" message (below) |
| scheduled | 0 | **silent** — no message posted |

Rationale for "silent on scheduled, ack on manual": scheduled runs are expected to be quiet; a no-drift Telegram ping every cadence period is noise. Manual runs are operator-initiated; the operator wants confirmation the run completed even when nothing was found.

## Drift-found message

```
[doc-drift] Drift found — <count> finding(s)

Run: <manual | scheduled> · <YYYY-MM-DD HH:MM UTC>
Commit: <short SHA> on trunk

By category:
- README ↔ README: <n>
- README ↔ repo state: <n>
- Internal consistency: <n>

Fix PRs:
- #<num> <readme path>: <one-line summary> — <PR URL>
- ...

Do not auto-merge. Review each PR manually.
```

Rules:

- The `[doc-drift]` prefix matches the PR title prefix in `fix-pr-template.md`. Same string, byte-identical.
- Counts come from the drift report (`docs/report-format.md`); the agent does not recompute them on the Telegram side.
- The "By category" block lists all three categories even when one or two have a count of 0. Skipping zeros makes the message asymmetric across runs and harder to skim.
- Each "Fix PRs" line is one cohesive PR. Order matches the order in the drift report's Fix PRs table (insertion order).
- The closing "Do not auto-merge" line is mandatory. It mirrors the social safety net in `fix-pr-template.md`.
- No Markdown rendering tricks (no inline images, no buttons, no tables) — Telegram clients vary too much. Plain text + URLs is the entire surface.

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

## Telegram chat

The chat OpenClaw posts into is the same chat used as the manual-trigger listener, unless the maintainer configures a separate alerts chat. This is open question #6 in `docs/plans/doc-drift-agent.md`; the runtime resolves it during Phase B Task B3. The notification format is identical regardless of which chat receives the message.

## Failure modes

If OpenClaw cannot post the Telegram message (network failure, rate limit, invalid token), the runtime must:

1. Persist the message body locally so it can be replayed.
2. Surface the failure via the standard OpenClaw alerting path on the VPS (out of scope for this spec).

The agent's drift report and any PRs it opened are unaffected by Telegram failures — they remain valid artifacts on GitHub.
