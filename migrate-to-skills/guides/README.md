---
date: 2026-08-21
model: claude-opus-5
description: "Superseded staging area — every guide here has shipped as an installed skill or was absorbed by one"
---

# Superseded — do not read these as live guidance

This folder was the staging area for the skills migration. It is finished. No
config points here any more: the global `## GUIDES` rule in `~/.claude/rules/
general.md` that pointed at this folder was deleted on 2026-08-21, and
`test-discipline` now names `rx-tdd-essentials` by skill name.

## Where each guide went

| guide | now lives as |
|---|---|
| `rx-tdd-essentials` | `ios.config/.claude/skills/rx-tdd-essentials` (installed verbatim) |
| `tdd-flow` | `dev-skills:tdd-interactive` (overlap 95) |
| `tdd-essentials` | `dev-skills:strict-tdd` (88) |
| `tdd-spec-review` | `dev-skills:tdd-scaffold-review` (86) |
| `tdd-practitioner` | `dev-skills:strict-tdd` (72) |
| `swift-xctest-testing-master-prompt` | `ios.config:test-discipline` + global `swift-testing` rule (68) |
| `vortex-seasoned-iOS-developer` | global `swift.md` + `ios.config:swift-coding-rules` (35–52) |

Overlap scores are from `skills-overlap-audit.md` in this folder, which also
records the six staged skills that shipped to `dev-skills` earlier
(`bug-analysis`, `component-arch-review`, `executable-spec-scaffolding`,
`feature-spec-protocol`, `tactical-action-plan-guide`, `swift-package-manifest`).

Unclassified leftovers, never covered by that audit:
`swiftui-module-view-extraction.md` and `three-buckets-merge-strategy.md`.
