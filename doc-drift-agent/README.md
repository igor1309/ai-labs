---
date: 2026-06-02
model: claude-opus-4-8
description: "doc-drift-agent project README — README drift review agent definition owned by ai-labs, runtime hosted in OpenClaw"
---

# doc-drift-agent

Definition for a specialized OpenClaw agent that detects README drift across `ai-labs` and proposes README fixes as PRs.

This directory owns the source of truth for what the agent inspects, how it reports findings, and the shape of its fix PRs and notifications. The runtime — schedule, Telegram listener, GitHub credentials for opening PRs — lives in OpenClaw and is out of scope here.

## Status

Live on OpenClaw as of 2026-05-09. Notifications post via the shared bot `@igor1309_ai_labs_bot` (account `ai-labs`) into the `#doc-drift` topic (`message_thread_id` 4) of the ai-labs agents supergroup `-1003954520541` — the per-agent `docdrift` account and DM `54589373` were retired when one-bot + per-agent-topic routing went live on 2026-06-01. Daily cron at 01:00 UTC via `/etc/cron.d/openclaw-doc-drift`. Source tree mirrored at `/home/openclaw/ai-labs` and refreshed before every scheduled run. CI sync workflow at `.github/workflows/doc-drift-agent-sync.yml` ships `agent/**` to the VPS workspace on `trunk` merge.

## Source

- Intent: `doc-drift-agent/docs/automated-doc-drift-review-and-fix-suggestions-intent.md`
- ADR: `doc-drift-agent/docs/adr-specialized-openclaw-agent-readme-drift-review-v0.0.4.md` (status: proposed)

## Layout

`agent/` holds everything OpenClaw loads at runtime — the system prompt plus the artifacts it references. `docs/` holds project meta-docs not loaded by the runtime.

| Path | Purpose |
|------|---------|
| `agent/agent.md` | Agent system prompt |
| `agent/readme-inventory.md` | Every README the agent must inspect |
| `agent/drift-methodology.md` | Drift categories, detection signals, evidence shape |
| `agent/report-format.md` | Drift report shape returned by the agent |
| `agent/fix-pr-template.md` | Fix PR title and body template |
| `agent/notification-spec.md` | Telegram notification format |
| `agent/suppression-policy.md` | 12-hour scheduled-run suppression rule |
| `docs/automated-doc-drift-review-and-fix-suggestions-intent.md` | Source intent |
| `docs/adr-specialized-openclaw-agent-readme-drift-review-v0.0.4.md` | Source ADR |
| `docs/plans/implemented/doc-drift-agent.md` | Implementation plan (closed) |
| `docs/log.md` | Project log |
| `runtime/cron/doc-drift-cron.sh` | VPS cron wrapper (suppression gate + Telegram ack) |
| `runtime/cron/openclaw-doc-drift.cron` | `/etc/cron.d/openclaw-doc-drift` daily 01:00 UTC entry |
| `runtime/README.md` | Deployment notes for the VPS-side runtime |

## Boundaries

- The agent edits READMEs only.
- The agent never merges or approves PRs.
- Style, format, and restructure passes are out of scope (mirrors the `doc-drift-audit` skill).

## Description

Specialized OpenClaw agent that compares the root and per-project READMEs against each other and against actual repo state, then proposes README fixes as PRs with evidence. *ai-labs owns the definition; OpenClaw owns the runtime*. Auto-merge is never used.

## Stack

- OpenClaw
- Markdown
- GitHub PRs
- Telegram
