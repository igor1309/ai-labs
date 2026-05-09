---
date: 2026-05-09
model: claude-opus-4-7
description: "doc-drift-agent project README — README drift review agent definition owned by ai-labs, runtime hosted in OpenClaw"
---

# doc-drift-agent

Definition for a specialized OpenClaw agent that detects README drift across `ai-labs` and proposes README fixes as PRs.

This directory owns the source of truth for what the agent inspects, how it reports findings, and the shape of its fix PRs and notifications. The runtime — schedule, Telegram listener, GitHub credentials for opening PRs — lives in OpenClaw and is out of scope here.

## Status

Phase A: in-repo definitions. Integration wiring (Phase B) is blocked on open questions captured in `docs/plans/doc-drift-agent.md`.

## Source

- Intent: `docs/doc-drift-agent/automated-doc-drift-review-and-fix-suggestions-intent.md`
- ADR: `docs/doc-drift-agent/adr-specialized-openclaw-agent-readme-drift-review-v0.0.4.md` (status: proposed)

## Layout

| Path | Purpose |
|------|---------|
| `agent/` | Agent prompt and instructions consumed by OpenClaw |
| `docs/readme-inventory.md` | Every README the agent must inspect |
| `docs/drift-methodology.md` | Drift categories, detection signals, evidence shape |
| `docs/report-format.md` | Drift report shape returned by the agent |
| `docs/fix-pr-template.md` | Fix PR title and body template |
| `docs/notification-spec.md` | Telegram notification format |
| `docs/suppression-policy.md` | 12-hour scheduled-run suppression rule |
| `docs/log.md` | Project log |

## Boundaries

- The agent edits READMEs only.
- The agent never merges or approves PRs.
- Style, format, and restructure passes are out of scope (mirrors the `doc-drift-audit` skill).
