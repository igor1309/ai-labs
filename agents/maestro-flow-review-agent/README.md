---
date: 2026-05-30
model: claude-opus-4-8
description: "maestro-flow-review-agent project README — draft OpenClaw agent that reviews igor1309/ios.config Maestro flow YAML against that repo's maestro-flows review rubric and proposes fixes as PRs; never merges or approves"
---

# maestro-flow-review-agent

Draft definition for a specialized OpenClaw agent that reviews the Maestro flow YAML in the `igor1309/ios.config` repository against that repo's own `maestro-flows` review rubric, and proposes the resulting fixes as a pull request.

Sibling to `doc-drift-agent` and `dashboard-sync-agent`: same OpenClaw runtime pattern (manual + scheduled triggers, per-agent suppression state, CI-synced system prompt), but it reviews a **different repository** (`ios.config`, not `ai-labs`). Fixes route by the rubric's confidence model — **Verified** findings are applied as code in the PR diff, **Provisional** findings ride as line-anchored comments or commented-out drafts and never become a live step.

This directory owns the source of truth for what the agent inspects and how it reports. The review *standard* is owned by ios.config (`.claude/skills/maestro-flows/review.md`) and read fresh on every run — it is not duplicated here. The runtime — schedule, listener, GitHub credentials, checkout path — lives in OpenClaw and is out of scope here.

## Status

**Draft — definition authored 2026-05-30; observability artifacts added 2026-06-01.** Not yet deployed. The new `agents/` directory is registered in the repo dashboards (`scripts/loc-dashboard.sh`, `docs/loc-dashboard.html`) and the `README.md` `## Components` table. The notify/suppression specs and the cron wrapper are authored (heartbeat model — one message per scheduled tick, so absence means failure). Remaining before deployment: live VPS provisioning (OpenClaw account/bot binding, the `ios.config` checkout) and a CI sync workflow under `.github/workflows/`. Consolidating the existing top-level agents under `agents/` is tracked in issue #434.

## Layout

| Path | Purpose |
|------|---------|
| `agent/agent.md` | Agent system prompt |
| `agent/notification-spec.md` | Heartbeat notification contract (findings / clean / suppressed) |
| `agent/suppression-policy.md` | 12h scheduled-run suppression gate |
| `runtime/cron/maestro-review-cron.sh` | VPS cron wrapper (refresh, gate, invoke, post one message/tick) |
| `runtime/cron/openclaw-maestro-review.cron` | `/etc/cron.d` entry (daily 06:00 UTC) |
| `runtime/README.md` | VPS-side deployment notes |
| `docs/log.md` | Project log |
| `README.md` | This file |
| `TODO.md` | Project TODO list |

The review rubric is **not** vendored here — it lives in the repository under review:

| Path (in `igor1309/ios.config`) | Purpose |
|------|---------|
| `.claude/skills/maestro-flows/review.md` | Enforcible review rubric: dimensions, confidence model, **Output format** |
| `.claude/skills/maestro-flows/SKILL.md` | Context the rubric assumes (runner, requirement rules, composition) |

## Boundaries

- **Opens a fix PR when there's a Verified change; never merges or approves.** With ≥1 Verified fix, it pushes a `maestro-review/<slug>` branch and opens a PR against the ios.config default branch (Provisional-only runs have no diff, so they post review comments / a report instead of an empty PR). Auto-merge is never enabled; it never approves.
- **Only Verified fixes become code.** Provisional findings are line-anchored comments, checklist items, or commented-out drafts with a verification recipe — never a live step. With no simulator, a fix is Verified only when read off the code or an existing flow.
- **The rubric is `review.md`, read fresh.** No private copy, no softened criteria. A finding is enforcible (file, line, why, concrete fix) or it is discarded — `review.md`'s rule is absolute: no `fix:`, no finding.
- **Edits only `.maestro/flows/**`.** It never touches app source, project config, or the `maestro-flows` skill itself (skill updates are *proposed* in the review, not committed). Each Verified change is the minimum edit.
- **Output format is fixed** to `review.md`'s "Output format" section, verbatim, as the PR body's review section.

## Description

Draft OpenClaw reviewer that audits *igor1309/ios.config* Maestro flow YAML against the repo's own *maestro-flows* review rubric and proposes fixes as a PR — PR scope (changed flows + their `runFlow` chains), path scope, or whole-collection scope. The standard is owned by ios.config and read each run; Verified fixes are applied as code, Provisional findings ride as comments, and the agent never merges or approves.

## Stack

- OpenClaw
- Maestro flow YAML
- GitHub PRs
- Markdown
