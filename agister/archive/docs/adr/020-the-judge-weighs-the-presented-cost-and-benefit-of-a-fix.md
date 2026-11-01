# ADR-020: The judge weighs the presented cost and benefit of a fix

- **Status:** Accepted
- **Date:** 2026-10-05
- **Scope:** how the review judge disposes of a finding whose evidence
  holds, and what a review finding must present for it to do so
- **Decision type:** Process
- **Amends:** [ADR-007](007-an-advisor-decides-open-questions.md)
  rule 1 (what `owner` leaves to the judge)
- **Relates to:** [ADR-003](003-fan-out-and-join-workflow.md)
- **Source:** [cost-benefit-for-ai-judge-discussion.md](../../../research/judge/cost-benefit-for-ai-judge-discussion.md)

## Context

The judge (`prompts/code-review-judge.md`) rules on evidence and scope.
A finding whose evidence holds and that the change introduced or left is
ruled `fix`, unless what to do about it is a trade-off, which it rules
`owner` (ADR-007). Whether a proven finding is worth fixing at all is
not a ruling of its own: it is `fix` by default, or `owner`. Each review
round can then present further valid findings, each `fix`, so review and
repair do not converge on their own; only a fixed round limit stops them,
and that limit may cut off a late finding that matters.

Findings do carry some of the case for value, but not as a contract the
judge can weigh: `review-result.json` asks for "why it matters and the
smallest fix" in free prose (`detail`), the architecture review for
"Impact" and "Improvement". No field requires the violated requirement,
the consequence, a basis for the severity, or the cost of the fix, so
none of them is presented in a form the judge can hold a reviewer to.

The judge is a jury: it has no tools, never sees the code (ADR-003 rule 4),
rules only on what is presented, adds nothing of its own, and rejects what
the reviewer did not prove.

## Decision drivers

- The judge stays a jury: it re-investigates nothing and supplies no fact,
  cost included, that the reviewer did not present.
- Proving a finding and disposing of it stay separate questions, and
  `reject` keeps one meaning: the evidence does not hold.
- A ruling can be inspected without redoing the review: it states what
  decided it and what would change it.
- No invented precision: no probabilities, scores or ratios.
- Prompts and schemas only; no code (ADR-001 rule 2).

## Decision

### 1. A ruling answers two questions, in order

First, does the evidence hold? This is unchanged: a finding whose evidence
does not hold is `reject`, with its `missing_evidence`. A finding outside
the change is `defer`, as today.

Second, for a finding whose evidence holds and that lies in the change:
does its presented case meet the burden for fixing at its severity
(rule 3)? It weighs the presented benefit of fixing (the consequence
avoided) against the presented cost (the fix, its verification, and the
risk the fix itself brings). Effort already spent is sunk and never
counts.

### 2. `waive` is a new ruling: proven, and the case for fixing not met

`waive` means the evidence holds, the change introduced it, and its
presented case does not meet the burden for fixing at its severity. It is
distinct from `reject`, so a waived finding counts in the reviewer's
favour, and from `owner`.

This amends ADR-007 rule 1. `owner` still means "not the reviewers' or the
judge's to settle", but one question is now the judge's: whether a single
proven finding is fixed or waived, when the presented case settles it
under rule 3. Everything else stays `owner`, and the advisor is asked
first: a choice between two or more fixes, an option that touches policy
(ADR-007 rule 1), and a major finding whose cost is grossly
disproportionate. In doubt whether a question is one of these, `owner`.
Doubt about the economics is not such a question: when the presented case
leaves benefit and cost unresolved, the presumption for its severity
decides (rule 3), because the burden lies on the presenting side.

### 3. Severity sets the burden of proof

Severity is assessed before merging. For each source, the judge checks its
`severity_rationale` (rule 4) against its evidence; an unsupported severity
is ruled at the highest severity the evidence supports, and the ruling
says so. A merged item takes the highest **supported** severity among its
sources. This replaces "the highest severity among its sources" in the
judge prompt and in `judgement.json`.

The presumption then depends on that severity:

| Severity | Presumption | To leave it unfixed |
|---|---|---|
| blocker | fix | never |
| major | fix | presented cost grossly disproportionate to benefit → `owner` |
| minor | fix | presented cost exceeds presented benefit → `waive` |
| nit | waive | (to fix: presented benefit exceeds presented cost) |

When the presented case leaves benefit and cost equal or unresolved, the
presumption stands. The existing rule stands that a finding asking for a
new guard, check or mechanism must show the case that needs it.

### 4. A finding presents its case for value

`review-result.json` gains four required fields on each finding:

- `requirement`: the rule, invariant, recorded decision or contract it
  violates, quoted or named.
- `consequence`: what happens if it stays, in the concrete case given.
- `severity_rationale`: why this severity and not the one below it.
- `fix_cost`: a band for each of size and change risk, each with its
  basis (the files, functions, tests and callers it names). Where a fix
  meets more than one anchor, the highest one is its band:

  | Size | Anchor |
  |---|---|
  | trivial | one function, no new test |
  | small | one function or file, with its test |
  | substantial | several files, or a new seam for its test |
  | major | crosses a component boundary, or changes a contract |

  | Change risk | Anchor |
  |---|---|
  | contained | nothing outside the touched code depends on what changes |
  | moderate | callers inside the same component |
  | broad | other components, stored records, config or CLI users |

Every reviewer keeps its own definition of done; these fields are the
shared contract every finding meets before it is emitted. The judge
rejects a finding without a causal chain from evidence through requirement
and consequence to severity. A `fix_cost` without a basis is not rejected:
the finding's evidence still stands, the cost counts as unpresented, and
the presumption for its severity decides.

### 5. A ruling records what decided it

Each `judgement.json` item gains `benefit`, `cost` and
`switching_condition`: the presented benefit and cost that decided it, and
what would have to be presented for another ruling to win. "If
circumstances change" is not a switching condition. `reason` stays.

### 6. Left out

- The round limit. It is the owner's rule and stays. This decision changes how
  each finding is disposed of; whether it also makes rounds converge is
  what its measures (Consequences) test.
- `defer` on timing (in the change, but cheaper later). `defer` keeps its
  scope meaning: deferred work records only a gap outside the issue.
- Reviewer confidence. The judge weighs the evidence, not the reviewer's
  confidence in it.
- The judge reading recorded decisions. It still reads none (ADR-007).

## Consequences

- A proven finding whose case for fixing is not met is ruled `waive` and
  costs no repair.
- Findings grow by four fields; reviewers spend more per finding, and some
  weakly evidenced findings will not be emitted.
- The judge's ruling depends on cost and benefit as reviewers present
  them. The bands' anchors and the required basis let a misplaced band be
  seen and rejected; the switching condition shows which presented claim a
  ruling rests on.
- The judge now decides one kind of trade-off itself, from presented
  claims only; a wrong call there costs a repair or leaves a defect, where
  before it cost an advisor call or the owner's time.
- Whether this works is measured against a baseline, the current judge, on
  comparable changes: total cost per round (review and judge tokens and
  time, and repair effort); new `fix` rulings per round at blocker and
  major; findings introduced by fixes; defects later traced to waived or
  rejected findings; and stability: reordering or rewording findings
  leaves rulings unchanged, while changing a presented cost, consequence
  or severity moves them predictably. The waive rate alone says nothing
  about whether a round paid.
- Success is less repair and review cost at the same or better discovery of
  findings that later prove consequential. Fewer findings or rounds alone
  is not success: both can be gamed.

## Alternatives considered

- **Keep the round limit only:** rejected; it stops review at an arbitrary
  point and can drop the finding that mattered.
- **The judge validates findings itself:** rejected; it doubles the
  reviewer's work, invites context rot, and breaks the jury model.
- **A benefit/cost ratio or multiplied scores:** rejected; ratios mislead
  rankings, ordinal scores have no meaningful products, and an LLM invents
  the numbers.
- **`reject` for valid but not worth fixing:** rejected; it merges "the
  reviewer was wrong" with "the reviewer was right, but it is not worth
  it", and hides reviewer quality.
- **All cost-benefit questions go to `owner` and the advisor:** rejected;
  each stops the work or costs a call for a disposition the presented case
  already settles.
- **The judge estimates fix cost when the reviewer omits it:** rejected;
  the judge supplies no facts. An unsupported cost counts as unpresented.
- **Severity as presented, highest source wins:** rejected; one inflated
  duplicate would bar a waiver the evidence allows.
