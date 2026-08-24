---
date: 2026-08-24
model: claude-opus-5
description: "The four-verdict output vocabulary has no slot for an objective front-matter gate failure"
---

# Verdict vocabulary has no slot for a gate failure

## Observation

Surfaced by the plant-and-detect dry-run that validated the v2.0.0
consolidation (a skill with a `name`/directory mismatch and a missing
`author`, reviewed against a clean control).

The section-by-section format offers four tags — `signal`, `noise`,
`conflict`, `ask user`. Axis 3 grades objective gates: a missing `author`
is not a judgment call and is none of those four. The reviewer resolved
this by inventing tags, emitting `[ask user -> treat as gate fail]` for the
name mismatch and `[gate fail]` for the missing `author`, plus
`[signal, but incomplete]` for a DoD that was present but lacked a
criterion.

It reached the right conclusions. The format did not carry them, so the
output drifted from the specified shape on the one axis whose answers are
least ambiguous.

## Why it is filed rather than fixed

The consolidation into `skill-conventions` was a structural refactor and
claimed to be behavior-preserving. Adding a fifth verdict changes what a
review emits, so it belongs in its own change with its own re-validation
(`SKILL.md`, *Refactoring a skill*). The weakness predates the
consolidation: axis 3 has always stated objective gates and the format has
always offered four tags.

## Options to weigh

- Add a fifth tag (`gate`) for objective front-matter and spec failures, and
  say that a gate failure outranks the verdict line.
- Keep four tags and state that gate failures are reported separately from
  the section-by-section audit, as axes 8/9/10 already are.
- Leave it, and accept that reviewers will reach for an ad-hoc label.

Whichever is chosen, re-run plant-and-detect afterwards: the planted set must
still come back complete, and the clean control must still return nothing.
