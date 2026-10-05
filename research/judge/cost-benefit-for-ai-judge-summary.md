---
date: 2026-10-05
source: cost-benefit-for-ai-judge-discussion.md
grounded_in:
  - prompts/code-review-judge.md (v0.2.0)
  - prompts/code-review-adversarial.md, -tests.md, -architecture.md, -clarity.md, -adr.md
  - .agister/processes/review_judge.yaml
  - .agister/schemas/review-result.json, judgement.json
---

# Cost-benefit for AI Judge: Summary

Each section states what the discussion proposed, then **Here:** what our
prompts and schemas already do.

## Problem

A reviewer can keep producing valid findings, so review → fix → review may
never end. A fixed round limit is arbitrary and may cut off an important
late finding. A judge that triages each finding helps, but its judgment
calls are hard to explain. The proposal: make the judge weigh cost against
benefit.

**Here:** AGENTS.md caps the loop at 2 review rounds: the arbitrary limit the
discussion wants to replace.

## Roles

The reviewer owns the case; the judge owns the disposition. Like a jury, the
judge weighs only the presented finding, its evidence, consequence and
remediation argument. It does not re-investigate: that doubles cost and
invites context rot. The burden of proof lies on the reviewer. (The first
answer had the judge validate findings and was rejected for this reason.)

**Here:** already in place. The judge has no tools and never sees the code
(`review_judge.yaml`: the reviews are "all you have"). It adds no findings,
fills no gap in a reviewer's evidence, and a rejection names the
`missing_evidence`.

## Judge decision rule

Discussion:

- Use net decision value, not a benefit/cost ratio (OMB Circular A-4,
  HM Treasury Green Book): pick the verdict with the lowest expected total
  cost. ACCEPT fixes now; DEFER waits because waiting is worth more (real
  options); REJECT keeps the current state.
- Costs: remediation, verification, change/regression exposure, consequence
  of leaving it, future debt interest, opportunity cost. Past spending is
  sunk.
- The judge weighs these as claims in the review record; it invents no
  economics.
- Uncertainty is handled with switching values: what would have to be true
  for another verdict to win.
- Burden of proof may vary by finding class (ALARP analogue).
- No numeric scores to multiply; semantic bands with anchored meanings.

**Here:** the judge rules on evidence and scope, not economics:

| Ruling | Today's test | Discussion's test |
|---|---|---|
| fix | evidence holds, change introduced or left it | fixing now has the best net value |
| defer | evidence holds, gap lies outside the change | value exists, waiting is worth more |
| owner | evidence holds, action is a trade-off | (no counterpart) |
| reject | evidence insufficient | unsupported, or valid but not worth fixing |

- A valid finding is never rejected today: "valid but not worth it" goes to
  **owner**. That keeps REJECT unambiguous, as the discussion's first answer
  advised.
- DEFER already carries a trigger: `judgement.json` asks for "gap, trigger,
  done when".
- One class-specific burden exists: the judge is "most demanding of a
  finding that asks for a new guard, check or mechanism".
- Severity (blocker/major/minor/nit) is defined in `review-result.json`; the
  judge weighs evidence, not the label, and a merged item takes its highest
  source severity.
- No finding presents a fix cost, so the judge has no cost side to weigh
  without inventing it.

## Decision record

```text
VERDICT: ACCEPT | DEFER | REJECT
DECISIVE BENEFIT:     value gained / loss avoided
DECISIVE COST:        resources, opportunity cost, change exposure
UNCERTAINTY:          presented assumptions that move the decision
SWITCHING CONDITION:  what would make another verdict win
REASON:               why this verdict has the best expected value
```

When later findings consistently land on the DEFER/REJECT side, more
fixing loses its economic case: a stopping rule without a fixed round limit.

**Here:** `judgement.json` items carry `ruling`, `reason`, `action` and
`missing_evidence`. No benefit, cost or switching condition.

## Reviewer definition of done

Argument quality leaks upstream; decision authority stays with the judge.

- **Specialist DoD**: what each reviewer examines.
- **Shared finding contract**: claim, classification, violated requirement,
  evidence, consequence, mechanism, scope, confidence, classification
  rationale, suggested remediation.
- Invariant: evidence → violated requirement → consequence → classification.
- Classification is an argued claim; a judge may grant it and still defer.

**Here:** specialist DoDs exist in every reviewer prompt. The shared contract
is `review-result.json`, and covers part of it:

| Contract field | Present as |
|---|---|
| claim, remediation | `title`, `detail` ("what is wrong, why it matters and the smallest fix") |
| evidence, mechanism | `evidence.case` (concrete, no "could"), `evidence.trace` (path:line steps) |
| scope | `evidence.introduced_by_change` |
| classification | `severity` |
| violated requirement | prose only: architecture's "Invariant", clarity's recorded decision |
| consequence | prose inside `detail`; architecture's "Impact" |
| classification rationale | absent |
| confidence | absent, by design: the judge ignores reviewer confidence |
| fix cost | absent (tests reviewer reports test cost as a finding, not a fix cost) |

## Risks and observations

- **Judge**: conservatism, acceptance bias, invented economics, eloquence
  over substance, severity anchoring, unstable verdicts, DEFER as dumping
  ground, local optimisation, shallower reasoning late in a batch, reviewer
  capture. Boilerplate switching conditions signal no real boundary.
- **Reviewer**: post-hoc rationalisation, inflated consequences,
  preferences as requirements, severity inflation, verbose compliance,
  suppression of valuable weakly evidenced findings, homogenised
  specialists, weak causal links.
- **Interaction**: the two calibrate to each other's artifacts, or escalate
  elaboration until cost rises and quality falls. Measure the pipeline.
- **Observe**: baseline vs treatment on comparable changes: findings per
  review, severity and ruling distributions, effort per fixed finding,
  findings introduced by fixes, repeat findings, new fix rulings per round,
  tokens/time, churn, later defects traced to rejected/deferred findings,
  fixes later judged unnecessary. Derived: yield, and marginal review value
  per round.
- **Stability tests**: irrelevant perturbations (order, wording, reviewer
  label, batch position and size) should not move a ruling; relevant ones
  (effort, exposure, frequency, consequence, evidence) should move it
  predictably.

**Here:** the baseline is the current `code_review` workflow with judge
v0.2.0. Its rulings are already structured JSON, so distributions and
per-round counts can be taken from run artifacts.

**Here:** two of the discussion's risks are already guarded: the case and
trace fields and the "could/might" rule limit inflated consequences, and
the judge's instruction to weigh evidence, not labels, limits severity
anchoring.

## Success criterion

Not fewer findings, fewer rounds, or more fixes/rejects: all can be gamed.
Success is lower remediation churn and review cost while preserving or
improving discovery of findings that later prove consequential. Cleaner
rationales at the same total cost improve explainability, not decision
quality.

## Open decisions

The discussion's ideas reach our system at two points; both are the
owner's call.

1. **Does the judge get an economic leg?** Today trade-offs go to `owner`.
   Cost-benefit would let the judge decide some of them itself: fix, defer
   on timing (not only scope), or a reject for accepted risk, kept distinct
   from insufficient evidence. Its cost is a larger decision record
   (benefit, cost, switching condition).
2. **Does the review schema gain the missing contract fields?** Violated
   requirement, consequence, severity rationale and fix cost. Without a
   presented fix cost, decision 1 cannot work: the judge may not supply it.
