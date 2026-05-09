---
date: 2026-05-09
model: claude-opus-4-7
description: "doc-drift-agent project README — README drift review agent definition owned by ai-labs, runtime hosted in OpenClaw"
---

# doc-drift-agent

Definition for a specialized OpenClaw agent that detects README drift across `ai-labs` and proposes README fixes as PRs.

This directory owns the source of truth for what the agent inspects, how it reports findings, and the shape of its fix PRs and notifications. The runtime — schedule, Telegram listener, GitHub credentials for opening PRs — lives in OpenClaw and is out of scope here.

## Status

Phase A: in-repo definitions. Integration wiring (Phase B) is blocked on open questions captured in `doc-drift-agent/docs/plans/doc-drift-agent.md`.

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
| `docs/plans/doc-drift-agent.md` | Implementation plan |
| `docs/log.md` | Project log |

## Boundaries

- The agent edits READMEs only.
- The agent never merges or approves PRs.
- Style, format, and restructure passes are out of scope (mirrors the `doc-drift-audit` skill).
