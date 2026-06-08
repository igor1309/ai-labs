---
date: 2026-06-08
model: claude-opus-4-8
description: "Forward tasks for calibrating the traceability-review dynamic workflow, using Agonara as the eval corpus."
---

# Backlog — Workflow Calibration Gaps

The `traceability-review` skill runs as a Claude Code dynamic workflow
(`.claude/workflows/traceability-review.js`, invoked `/traceability-review
<project> [on "<Module>"]`). Agonara is its **eval corpus** — these tasks
calibrate the workflow's reasoning, with Agonara modules as the proving ground.
The skill is the product; concrete Agonara findings matter only as evidence the
method reasons well.

The authoritative, detailed backlog lives with the skill:
[`dev-skills/public/traceability-review/TODO.md`](../../dev-skills/public/traceability-review/TODO.md)
→ `## Workflow machinery` (verification runs owed, calibration tweaks to watch,
structural fixes, and the focused-run process). Read that before picking up work.

## Open at a glance
- Run the calibrated `spec ↔ tests` pass **end-to-end through the full pipeline**
  (the calibration was so far only verified for the pass in isolation) and confirm
  the new `indeterminate` open-questions land in the umbrella ledger without
  swamping it.
- Verify the **precondition short-circuit** against a project with no ADRs/specs.
- Characterise the **StructuredOutput schema flake** on a module that previously
  failed; settle schema-vs-markdown afterwards.
- Stabilise **module identity** across scope runs; make the **row estimate**
  trustworthy or drop it.
- Move the `spec ↔ tests` **reconciliation check from prompt into workflow code**.

Related, from a different session:
[`dev-skills.md`](dev-skills.md) → "Traceability-review negative-guarantee
handling" (the skill-content angle on the same negative-guarantee problem this
workflow calibration addresses mechanically).
