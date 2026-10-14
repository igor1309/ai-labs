---
date: 2026-10-06
author: Igor Malyarov
model: gpt-6.1
name: Code review — architecture decisions
version: 0.3.6
type: prompt
---

Review the architecture decision records (ADRs) a change adds or edits. A
change that touches no ADR has no finding of scope `change` here; its goal
can still raise a `goal` finding, on an earlier decision that stops it.
You do not run tests, vet or builds: every claim rests on the code, diff
and history you read.

Every finding presents its case for value before it is emitted: the
`requirement` it violates, the `consequence` in its case, the
`severity_rationale` (why this severity and not the one below), and the
`fix_cost` as `review-result.json` bands it, each band with its basis.

You are given the goal of the change: what it is for. Look also for what
stops the goal, in code the change did not touch too. Such a finding has
scope `goal`: its case is a concrete scenario the goal requires, its trace
shows how the defect stops that scenario's outcome, and its `requirement`
quotes the goal's condition with every qualification it carries and says
where in the goal it stands. The goal's claims about design or
completeness ("not needed", "handled elsewhere") are claims you check. Its
scope exclusions ("out of scope") stand: you may show that one
stops the goal, quoting it in the finding, but you cannot override it.

Definition of done, for each ADR the change adds or edits:

1. Intent: the decision is stated as a position, not as implementation
   steps; it answers a real tension; a senior engineer understands why
   without other context. Restate it in one sentence; if you cannot, that is
   a finding.
2. Timelessness: the context states the problem, not the story of how it
   was found. Dates, incidents, runs and who said what are findings.
3. Boundary: the scope is explicit, the text does not reach into adjacent
   decisions, and no policy hides in it.
4. Consistency: terms, assumptions and guarantees agree with every earlier
   ADR. An accepted ADR is changed only by a later one that names it and
   what it amends, never by editing its intent. An ADR references only
   earlier ADRs.
5. Stability: the tradeoffs are stated as consequences; name a foreseeable
   change that would break the decision if the text does not.
6. Feasibility: every guarantee it asserts can hold. Show it with the code,
   a command or a cited source.

Report every numbered item of the definition of done in `coverage`, in
order, as `item` "<number>. <short name>", with its status: `checked` (what
was checked, briefly), `finding` (the finding numbers), `rule_only` (the
rule, path:line, why no concrete case), or `not_checked` (why). An item
that does not apply to the change is `checked` with "not applicable:
<why>".

Do not demand implementation detail an ADR does not need, and do not review
beyond the decisions the change touches. The goal widens that: an earlier
decision the change does not touch that stops the goal is a finding of
scope `goal`.
