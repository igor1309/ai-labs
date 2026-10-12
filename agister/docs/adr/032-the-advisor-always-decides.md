# ADR-032: The advisor always decides

- **Status:** Accepted
- **Date:** 2026-10-12
- **Scope:** what the advisor answers, which questions reach it, and how
  its decisions are kept in view
- **Decision type:** Process
- **Amends:** [ADR-007](007-an-advisor-decides-open-questions.md) rules 1
  and 2 (policy questions go to the owner; the advisor does not decide
  from code) and rule 5 (who writes the question and appends the record)
- **Source:** LAB-206, from the LAB-171 postmortem (LAB-199, lesson 4);
  the owner's decisions, 2026-10-12

## Context

In LAB-171 the advisor was asked four times and answered `owner` three
times: each time an ADR's wording "does not unambiguously settle" the
question, and ADR-007 rule 1 says that in doubt a question is policy.
The implementer, before it, asked the owner a question ADR-028 settled.
The owner's test of such a question is "what is not clear from the ADRs
and the existing code"; most were clear from one or the other. A path to
the owner stays open to every question that might be policy, and in
practice every question might be.

A decision taken without the owner must not go silent either. And a
record any agent may write grows without bound: in another repository a
week of work went to records of edge cases with negligible chance of
occurring, far from the task.

[ADR-031](031-the-judge-rules-on-the-quoted-record.md) already took
`owner` from the judge, so the advisor now answers the implementer only.

## Decision

### 1. The advisor answers every question with a decision

The advisor has no `owner` answer. It chooses one of the options given.
An option that would change an accepted ADR, the project's rules
(`AGENTS.md`), the scope of the issue, a security boundary or a cost
limit is excluded, with the rule it would change; it is not a reason to
ask anyone.

### 2. The record holds the truth, in an order

The advisor settles the question from, in order:

1. what the recorded decisions say: the ADRs, the decisions record and
   the `AGENTS.md` files;
2. where they are silent or leave a gap, what they mean: a decision's
   stated context and intent, and the decisions it rests on;
3. where those are silent, the code and tests that carry the decisions
   out, read at the revision given.

It names each source its answer rests on. Code that carries out a
decision is evidence of it; code no decision bears on is evidence of
nothing but itself, and a decision resting on it says so.

### 3. A defect in the record stops the step

When every option is excluded, or two recorded decisions contradict each
other on the question, the advisor answers `conflict` with the records
that collide and decides nothing. That is not doubt: the record is wrong,
and correcting it is the owner's. The step stops.

### 4. A question reaches the advisor only when it blocks the step

The implementer decides in the code what the record leaves to it, and
leaves a point open only when all three hold:

- the work cannot go on without the answer;
- the ADRs and the decisions record, searched, do not settle it, and the
  point names what was searched;
- the options differ in behaviour a user or a caller can observe, or in
  a contract.

An edge case that fails the third is handled in the code or left alone,
not recorded. A step puts at most one question to the advisor; a second
open point means the issue does not say enough, and the step stops.

### 5. No agent writes the record; the driver appends it

Neither the implementer, a reviewer, the judge nor the advisor writes an
ADR or the decisions record. Whoever drives the step writes the question
file from the open point, runs the advisor and appends its decision,
unedited, as ADR-007 rule 3 says. The driver's summary of the step lists
each record it appended, and the pull request lists them as ADR-007 rule
4 says, so the owner sees every agent decision without being asked for
one. A reviewer that finds a record's search or sources do not hold
raises it as a finding on the change.

## Consequences

- Nothing in the step waits for the owner except a defect in the record.
- The owner reviews decisions after the fact, in the pull request, and
  overrides one by superseding it (ADR-007 rule 4); a wrong decision costs
  a further change.
- The decisions record grows by at most one record a step, and only for a
  question with observable consequences.
- The advisor's output schema loses `owner` and gains `conflict`; the
  implementation's output gains its open point, with what was searched.

## Alternatives considered

- **Keep `owner` for policy, and tighten what counts as doubt:** rejected;
  any line between build and policy is the advisor's judgement, and the
  door stays open to every question near it.
- **The implementer writes the decisions record:** rejected; the
  implementer meets every small question first and would record them, and
  would lean to deciding before reading the ADRs.
- **Agents may write ADRs:** rejected; an ADR is the owner's.
- **No record of a decision taken without the owner:** rejected; a
  decision nobody sees cannot be overridden.
