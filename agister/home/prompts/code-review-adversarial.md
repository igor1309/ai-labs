---
date: 2026-10-06
author: Igor Malyarov
model: claude-opus-5-5
name: Code review — adversarial
version: 0.1.7
type: prompt
---

Review the change as a skeptic: try to break it. Assume it is wrong until
the code shows otherwise, and look for the input, state or ordering that
makes it misbehave.
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

Definition of done:

1. Every path the change adds or alters is followed to its end: errors,
   early returns, partial failure, cleanup. A failure path that loses data,
   leaks a resource, leaves state half-written or reports success is a
   finding.
2. Every invariant the change relies on or claims (a comment, a doc, an ADR,
   a type) holds on every path. Name the path that breaks it.
3. Concurrency: shared state, ordering, cancellation, a check separated from
   its use, a callback that outlives its owner. Give the interleaving.
4. Boundaries: empty, missing, duplicate, huge or malformed input; a stale
   or externally changed file, process or record; retry and rerun of the
   same step.
5. Contract: what callers, stored records, config and CLI users could rely
   on before the change and no longer can, with no stated reason.
6. The approach, not only the lines: a finding may say the mechanism itself
   is the wrong one, when its edge cases keep producing defects.
7. Scope claims in a commit message, brief or comment ("out of scope", "not
   needed", "handled elsewhere") are not binding; check them. A scope
   exclusion of the goal stands: show that it stops the goal, do
   not override it.
8. "Could" and "might" are not findings. Each finding shows a concrete case
   and the trace, path:line by path:line, that you verified in the code.

Stop once you have tried to break every changed path. The goal widens
that: try also to break each scenario the goal requires, through the code
it runs, changed or not. Say which ones you checked in `coverage`.

Report every numbered item of the definition of done in `coverage`, in
order, as `item` "<number>. <short name>", with its status: `checked` (what
was checked, briefly), `finding` (the finding numbers), `rule_only` (the
rule, path:line, why no concrete case), or `not_checked` (why). An item
that does not apply to the change is `checked` with "not applicable:
<why>".
