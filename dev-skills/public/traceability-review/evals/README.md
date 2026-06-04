---
date: 2026-06-03
model: claude-opus-4-8
description: "How to read and maintain the traceability-review eval fixtures — a skill-quality regression harness, not a living per-project contract"
---

# Traceability Review — Evals

## What these are

`evals.json` plus the committed reference outputs are a **skill-quality
regression harness**: they answer *"does the next skill version behave like the
last on a frozen input?"* They are **not** a living per-project contract — they
do not assert that the target project's current state is correct or unchanged.

## They are perishable snapshots

Each eval's expectations and its reference output are frozen against specific
**document versions** (recorded in the reference output's front-matter
`inputs`). As the target project's docs evolve, the expected findings change. **A
failing eval after the target's docs moved is staleness, not a skill
regression** — do not "fix" the skill to satisfy a stale fixture.

## How to use

- **Validating a skill change** (a lean, a new rule, a refactor): re-run the
  relevant pass driven by the changed skill against the *same* inputs; the eval
  should still hold. A genuine difference here is a real regression worth chasing.
- **After the target's docs change**: the fixture is *expected* to drift.
  Refresh it via the human-confirm loop — re-run the pass, a human confirms real
  findings vs false positives, then update the reference output + expectations
  and record the new input doc-versions.

## Provenance

Reference outputs in `<project>/docs/traceability-reviews/` carry `skill_version`
+ input `version`/`status` in front-matter, so any diff isolates *skill* change
from *document* change. The fixtures are pinned to those snapshots; treat the
doc-versions recorded there as what each fixture is "frozen against".
