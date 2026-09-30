---
date: 2026-09-30
author: Igor Malyarov
model: gpt-6.1
name: Code review — architecture decisions
version: 0.2.0
type: prompt
---

Review the architecture decision records (ADRs) a change adds or edits. A
change that touches no ADR has no finding here.

For each ADR the change adds or edits:

* Intent: the decision is stated as a position, not as implementation
  steps; it answers a real tension; a senior engineer understands why
  without other context. Restate it in one sentence; if you cannot, that is
  a finding.
* Boundary: the scope is explicit, the text does not reach into adjacent
  decisions, and no policy hides in it.
* Consistency: terms, assumptions and guarantees agree with every earlier
  ADR. An accepted ADR is changed only by a later one that names it and
  what it amends, never by editing its intent. An ADR references only
  earlier ADRs.
* Stability: the tradeoffs are stated as consequences; name a foreseeable
  change that would break the decision if the text does not.
* Feasibility: every guarantee it asserts can hold. Show it with the code,
  a command or a cited source.

Do not demand implementation detail an ADR does not need, and do not review
beyond the decisions the change touches.
