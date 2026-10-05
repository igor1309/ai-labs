# ADR draft: The judge weighs the presented cost and benefit of a fix

- **Status:** Proposed
- **Date:** 2026-10-05
- **Scope:** how the review judge disposes of a finding whose evidence
  holds, and what a review finding must present for it to do so
- **Decision type:** Process
- **Relates to:** [ADR-003](../../agister/docs/adr/003-fan-out-and-join-workflow.md),
  [ADR-007](../../agister/docs/adr/007-an-advisor-decides-open-questions.md)
- **Source:** [cost-benefit-for-ai-judge-discussion.md](cost-benefit-for-ai-judge-discussion.md)

## Context

The judge (`prompts/code-review-judge.md`) rules on evidence and scope
alone. A finding whose evidence holds and that the change introduced or
left is ruled `fix`, however small its benefit and however large its cost.
Each review round can then present further valid findings, each `fix`, so
review and repair do not converge on their own; only a fixed round limit
stops them, and that limit may cut off a late finding that matters.

The judge cannot weigh cost against benefit today, because no finding
presents either: `review-result.json` carries a severity, a concrete case,
a trace and whether the change introduced it. Consequence appears only in
free prose (`detail`; the architecture review's "Impact"), the violated
requirement only in some reviewers' prose, and the cost of the fix
nowhere.

The judge is a jury: it has no tools, never sees the code (ADR-003 rule 4),
rules only on what is presented, adds nothing of its own, and rejects what
the reviewer did not prove. A trade-off between options is not the judge's:
it rules `owner`, and the advisor or the owner settles it (ADR-007).

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
which disposition has the best net value on the presented case, `fix` or
`waive`? Net value is the presented benefit of fixing (the consequence
avoided) minus the presented cost (the fix, its verification, and the risk
the fix itself brings). Effort already spent is sunk and never counts.

### 2. `waive` is a new ruling: proven, and not worth fixing

`waive` means the evidence holds, the change introduced it, and the
presented cost of the fix clearly exceeds its presented benefit. It is
distinct from `reject`, so a waived finding counts in the reviewer's
favour, and from `owner`, which stays the ruling for a choice between
options or one that touches policy (ADR-007 rule 1).

### 3. Severity sets the burden of proof

The presumption depends on the finding's severity, as presented and argued
(rule 4):

| Severity | Presumption | To leave it unfixed |
|---|---|---|
| blocker | fix | never waived |
| major | fix | presented cost grossly disproportionate to benefit → `owner` |
| minor | fix | presented cost exceeds presented benefit → `waive` |
| nit | waive | presented benefit exceeds presented cost → `fix` |

The judge still weighs evidence, not labels: a severity whose rationale
does not hold is ruled at the severity the evidence supports, and the
ruling says so. The existing rule stands that a finding asking for a new
guard, check or mechanism must show the case that needs it.

### 4. A finding presents its case for value

`review-result.json` gains four required fields on each finding:

- `requirement`: the rule, invariant, recorded decision or contract it
  violates, quoted or named.
- `consequence`: what happens if it stays, in the concrete case given.
- `severity_rationale`: why this severity and not the one below it.
- `fix_cost`: the smallest fix's size, what it requires verifying, and
  what it could break, in anchored bands (trivial, small, substantial,
  major; contained, moderate, broad).

Every reviewer keeps its own definition of done; these fields are the
shared contract every finding meets before it is emitted. A finding
emitted without a causal chain from evidence through requirement and
consequence to severity is one the judge rejects.

### 5. A ruling records what decided it

Each `judgement.json` item gains `benefit`, `cost` and
`switching_condition`: the presented benefit and cost that decided it, and
what would have to be presented for another ruling to win. "If
circumstances change" is not a switching condition. `reason` stays.

### 6. Left out

- The round limit. It is the owner's rule (`AGENTS.md`) and stays until
  observed rulings show whether later rounds still produce `fix` rulings
  worth their cost.
- `defer` on timing (in the change, but cheaper later). `defer` keeps its
  scope meaning; `AGENTS.md` records in deferred work only a gap outside
  the issue.
- Reviewer confidence. The judge weighs the evidence, not the reviewer's
  confidence in it.
- The judge reading recorded decisions. It still reads none (ADR-007).

## Consequences

- A valid but low-value finding is ruled `waive` and costs no repair; the
  waive rate per round shows when more review stops paying.
- Findings grow by four fields; reviewers spend more per finding, and some
  weakly evidenced findings will not be emitted.
- The judge's ruling depends on cost and benefit as reviewers present them.
  An inflated consequence or understated fix cost moves rulings; the
  switching condition makes such a dependence visible.
- `waive` decides a small trade-off inside the judge. ADR-007 rejected
  giving the judge recorded decisions to settle trade-offs; this does not:
  the judge weighs only presented claims, and every choice between options
  or touching policy stays `owner`.
- Measures that show whether this works: fix, waive, owner and reject
  rates per round; repair effort per `fix`; findings introduced by fixes;
  defects later traced to waived or rejected findings; and stability:
  reordering or rewording findings leaves rulings unchanged, while changing
  a presented cost, consequence or severity moves them predictably.
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
  the judge supplies no facts. The field is required instead.
