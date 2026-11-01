# ADR-031: The judge rules on the quoted record

- **Status:** Accepted
- **Date:** 2026-10-12
- **Scope:** which rulings the review judge has, how a question of what
  the goal means is settled, and where the evidence that settles it stands
- **Decision type:** Process
- **Amends:** [ADR-007](007-an-advisor-decides-open-questions.md) rule 1
  (the judge's `owner`, asked of the advisor first);
  [ADR-020](020-the-judge-weighs-the-presented-cost-and-benefit-of-a-fix.md)
  rules 2 and 3 (what stays `owner`, and a major whose cost is grossly
  disproportionate);
  [ADR-023](023-reviewers-know-the-goal.md) rules 2 and 4 (a `goal`
  finding that a scope exclusion bars)
- **Relates to:** [ADR-003](003-fan-out-and-join-workflow.md) rule 4
- **Source:** LAB-211 and LAB-214, from LAB-202's postmortem of LAB-171's
  review gate; the owner's decisions, 2026-10-11 and 2026-10-12

## Context

The judge rules each item `fix`, `defer`, `reject`, `waive` or `owner`.
`owner` means "not the reviewers' or the judge's to settle" (ADR-007
rule 1, ADR-020 rule 2), and "in doubt whether a question is one of
these, `owner`". In LAB-171 the judge ruled `owner` 24 times, 21 of them
on the intent reviewer's questions. The repository's record answered most
of them, the owner had to stop the work at S4 to say that ADR-030 rule 9
is the rule, and 7 came back unanswered round after round.

The questions started in the intent reviewer. Its prompt told it to quote
each defensible reading of the goal, "ask which the owner meant", and not
to settle it by picking one. So it collected no evidence that would
settle a reading, and the judge, which rules only on what is presented,
had nothing to rule on but the question. `owner` made that a ruling that
decides nothing.

Replays of recorded LAB-171 calls tested the change (LAB-211, LAB-214):

- Without `owner`, the judge ruled every item, but it still handed the
  question on in its reasons, copying the intent review's "which did the
  owner mean?". A rule that an unsettled reading is `reject`, with the
  missing quote named, ended that.
- An intent reviewer that settles a reading from the goal, the ADRs and
  the code at the base raised no question. Once its findings quoted the
  settling source in their own evidence, every one of its items was ruled
  `fix`, where the same judge had rejected 4 items from the reviews as
  recorded.

## Decision drivers

- The judge stays a jury (ADR-020): it rules on what the reviews present
  and supplies no fact of its own.
- Every item ends in a ruling. A ruling that leaves the item undecided
  is a free pass.
- Collecting evidence is the reviewers' job, and what the goal means is
  evidence the record holds.
- Prompts and schemas only; no code (ADR-001 rule 2).

## Decision

### 1. The judge has no `owner` ruling

The judge's rulings are `fix`, `defer`, `reject` and `waive`. No ruling,
reason or summary hands a question to anyone: a question the reviews
leave open is a gap in their evidence, and the judge rules on it as one.
ADR-020's `owner` cases are ruled thus:

- A major whose presented cost is grossly disproportionate to its
  presented benefit is `waive`.
- A finding that offers more than one fix is ruled like any other: `fix`
  when its case is met, its `action` giving each option as the reviewers
  stated them.
- A fix that would change an accepted ADR, the project's rules, the scope
  of the change's goal, a security boundary or a cost limit is proven only
  where the finding quotes the rule that allows it. Without that quote it
  is `reject`, and `missing_evidence` names the rule.
- A `goal` finding that a scope exclusion of the goal bars is `defer`: the
  exclusion stands, and neither the reviewer nor the judge overrides it.

### 2. A requirement means what its quoted words say

A reading that narrows, widens or qualifies the quoted words counts only
where a review quotes the source that supports it: the goal, an ADR, a
recorded decision. When the reviews present competing readings and no
quote settles them, the claim is not proven: `reject`, with the quote that
would settle it in `missing_evidence`. An unsettled reading is never a
reason to `waive`; `waive` weighs presented cost against presented
benefit and nothing else.

### 3. A reviewer settles a reading from the record

Where the goal's words allow more than one reading, the intent reviewer
settles which one holds, in this order:

1. the goal's own words, read whole;
2. the decisions the repository records: a reading that departs from an
   ADR is not defensible, and a change that implements it is a finding;
3. where those are silent, the code and its tests at the base.

A finding quotes its settling source in its own evidence, beside the
goal's words: a source named only in coverage is not evidence. A reading
ruled out is listed in coverage with the quote that rules it out. Where
the record settles nothing, the finding is that gap, with what was
searched. No finding asks anyone to decide.

### 4. The advisor no longer answers judge items

ADR-007's advisor stays for the questions that stop an implementer. A
judge item is no longer a question, so it is never put to the advisor.

## Consequences

- `judgement.json` loses `owner`, and the judge prompt and the intent
  prompt change together. A recorded judgement keeps its `owner` items.
- A question no recorded source settles comes back as a rejected finding
  that names the missing quote, or as an intent finding that names the
  gap. The owner meets it as a gap in the record, once, and the answer can
  be recorded where the next review will find it.
- A major waived for its cost is a recorded decision in the judgement, not
  a stop.
- The judge reads no review's coverage as evidence: a reading one review
  settles in coverage does not answer another review's finding on it.

## Alternatives considered

- **The judge sees its earlier rulings on the change:** rejected; the
  judge rules on the reviews in front of it, and a finding that comes back
  is ruled again. Memory would only hide the free pass.
- **`owner` only on a gap in the record:** rejected; the judge reads no
  record, so it cannot tell a gap from a reading the reviews left
  unsettled, and the item still ends undecided.
- **The advisor answers every `owner` item first (ADR-007):** rejected;
  it puts a question the reviewers could settle through a second process,
  after the round.
