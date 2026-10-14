---
date: 2026-10-14
model: claude-opus-5-5
description: "The plan for the new Agister's ADRs: their order, what each covers, the archived material for it, and how each is written"
---

# ADR plan

ADR-001 is the architecture and its invariants. Each behaviour gets an ADR
of its own, written fresh in ADR-001's parts, one at a time.

## How each ADR is written

- Design only, per `agister/AGENTS.md`: parts, rules, invariants. No edge
  cases, no types, no command lists. An edge case is a test, written with
  the code.
- Written from scratch. The archived ADRs are material, never referenced
  from the new docs.
- An adversarial pass by a subagent whose prompt names only the files.
- The owner reviews it. Commits stay local until the owner says to push.

## Order

| # | ADR | Parts | Archived material | State |
|---|---|---|---|---|
| 001 | Architecture and invariants | all | 001 | Proposed |
| 002 | Settings: documents, layers, composition, extends, references, resolve, blocks, check | `settings/layout`, `documents`, `resolve`, `check` | 001 rules 3–4 and 7, 014, 015, 018, 021 rules 1–4, 028 (layered), 030 | Proposed |
| 003 | Permission planning and runtime facts | `settings/resolve`, `runtime/<name>` | 001 rule 5, 006, 021 rules 5–6, 029 (probe), 036 | Proposed |
| 004 | The call: admission, worktree holds, continuation | `core/admit`, the composition; git outside core | 001 rule 12, 025, 035, 037 | Proposed |
| 005 | Verification and repair | `core/attempts`, `core/verify` | 002, 010, 024 rule 8 | Proposed |
| 006 | Stale recovery | `core/session`, `core/watch` | 024 | Proposed |
| 007 | Workflows | `core/workflow` | 003, 004, 030 rule 6, 034 | Proposed |
| 008 | Install | `settings/home` | 016, 027 rules 8–9 | Proposed |
| 009 | Pages | `pages` | 009, 011 | Proposed |
| 010 | Testing with spies | all | 017 | |

`core/inputs` (026 rules 6–8) has no ADR in the order yet. 019 (gokit)
stands unchanged.

## Decided against

- **A service-shaped contract** (001 rules 15–16): future work, dropped.
- **Not code:** 007, 020, 023, 026 rules 1–5 and 9, 027 rules 1–7, 029
  (investigator), 031, 032, 033.
- **Superseded:** 005, 008, 012, 013, 019 (prompt optional), 022.
- **Proposed only, not carried:** 028 (a run keeps its output).

## Open in the written ADRs

- ADR-001: git-backed behaviour outside core; where reaping lives; pages
  and layering.
- ADR-002: lists of named items.
