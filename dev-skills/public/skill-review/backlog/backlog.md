---
date: 2026-06-14
model: claude-opus-4-8
description: "Open improvement items for the skill-review skill"
---

# skill-review backlog

## Proposed Evaluation Axis #8 — Failure observability

Source: 2026-06-14, the Poeme add-module experiment (haiku vs sonnet controlled
re-run). A scripted wiring step (`add-module-manifest.py`) failed with a clear
non-zero exit on every run, but both agents silently worked around it by hand and
the run still reported `PASS`. The failure was invisible in the parent session's
summary and only surfaced by mining the subagent transcript — so the underlying
script bug looked low-priority for weeks because every run "succeeded."

### The gap

The current axes (§1–§7) evaluate a skill's *content*. None asks whether, **when
the skill drives a script that fails, that failure reaches the user.** A skill can
score well on every existing axis and still launder deterministic-step failures
into clean-looking successes.

### Proposed axis text (promote into SKILL.md "Evaluation Axes" when shipped)

**8. Failure observability** (applies only to skills that drive scripts/tools)

- When a script the skill invokes exits non-zero, does the skill's report/gate
  **surface** it — or can the agent silently hand-fix and still report success?
- Is there a **mechanical breadcrumb** (the script logs its own exit; the gate
  echoes it) so the failure record does not depend on the agent narrating it?
- Is "script failure surfaced" a **DoD criterion**, not just prose?

Flag as a finding any script-driving skill where a non-zero script exit can be
absent from the run's report. Cite the skill-conventions `## Scripts`
"fail loud, fail visible" rule.

### When shipped

Fold the axis into `skill-review/SKILL.md` §Evaluation Axes as §8, add it to the
Output Format section-by-section expectations, and remove this item.
