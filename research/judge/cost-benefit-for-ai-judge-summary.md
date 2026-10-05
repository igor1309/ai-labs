---
date: 2026-10-05
source: cost-benefit-for-ai-judge-discussion.md
---

# Cost-benefit for AI Judge: Summary

## Problem

A reviewer can keep producing valid findings, so review → fix → review may
never end. A fixed round limit is arbitrary and may cut off an important
late finding. A judge that triages each finding (ACCEPT, DEFER, REJECT) helps,
but its judgment calls are hard to explain. The proposal: make the judge
weigh cost against benefit.

## Roles

The reviewer owns the case; the judge owns the disposition. Like a jury, the
judge weighs only the presented finding, its evidence, consequence and
remediation argument. It does not re-investigate or re-validate the
reviewer's work: that doubles cost and invites context rot. The burden of
proof lies on the reviewer. (The first answer had the judge validate
findings and was rejected for this reason.)

## Judge decision rule

- Use net decision value, not a benefit/cost ratio (OMB Circular A-4,
  HM Treasury Green Book): pick the verdict with the lowest expected total
  cost.
  - **ACCEPT**: spend effort fixing now.
  - **DEFER**: the fix has value, but waiting is worth more (real options),
    e.g. the code is being replaced, or the risk applies only past a load
    threshold. DEFER carries a trigger.
  - **REJECT**: accept the current state and spend nothing.
- Costs counted: remediation, verification, change/regression exposure,
  consequence of leaving it, future debt interest, opportunity cost. Past
  review and fix spending is sunk and stays out.
- Weigh these as claims in the review record; the judge invents no
  economics.
- Handle uncertainty with switching values: say what would have to be true
  for another verdict to win, not invented probabilities.
- Burden of proof may vary by finding class (ALARP analogue): accept unless
  cost is grossly disproportionate for critical classes; reject unless
  benefit is shown for speculative improvements.
- No numeric scores to multiply; use semantic bands with anchored meanings
  (consequence, exposure, remediation cost, change risk, time sensitivity,
  evidence strength).

## Decision record

```text
VERDICT: ACCEPT | DEFER | REJECT
DECISIVE BENEFIT:     value gained / loss avoided
DECISIVE COST:        resources, opportunity cost, change exposure
UNCERTAINTY:          presented assumptions that move the decision
SWITCHING CONDITION:  what would make another verdict win
REASON:               why this verdict has the best expected value
```

The switching condition exposes the judgment boundary, so a verdict can be
inspected without redoing the review. When later findings consistently land
on the DEFER/REJECT side, more fixing loses its economic case: a stopping
rule without a fixed round limit.

## Reviewer definition of done

Argument quality leaks upstream; decision authority stays with the judge.

- **Specialist DoD**: what each reviewer examines (architecture, testing,
  security, ...).
- **Shared finding contract**: claim, classification, violated requirement,
  evidence, consequence, mechanism, scope, confidence, classification
  rationale, suggested remediation.
- Invariant: emit a finding only with a causal chain evidence → violated
  requirement → consequence → classification.
- FAILURE vs WARNING is itself an argued claim. A judge may accept that a
  finding is a FAILURE under the reviewer's policy and still DEFER it.

## Risks and observations

- **Judge failure modes**: conservatism (concrete cost beats uncertain
  benefit), acceptance bias, invented economics, eloquence over substance,
  severity anchoring, unstable verdicts, DEFER as dumping ground, local
  optimisation, shallower reasoning late in a long batch, reviewer capture.
  Boilerplate switching conditions ("if circumstances change") signal no
  real boundary.
- **Reviewer failure modes**: post-hoc rationalisation, inflated
  consequences, preferences laundered as requirements, FAILURE inflation,
  verbose compliance, suppression of weakly evidenced but valuable findings,
  homogenised specialists, weak causal links. WARNING may need a lower
  evidence bar than FAILURE.
- **Interaction**: reviewer and judge calibrate to each other's artifacts,
  or escalate elaboration until cost grows and quality drops. Measure the
  whole pipeline.
- **Observe**: baseline vs treatment on comparable tasks. Findings per
  review, FAILURE/WARNING and verdict distributions, effort per accepted
  finding, findings introduced by fixes, repeat findings, new accepted
  findings per round, tokens/time, churn, later defects traced to
  rejected/deferred findings, accepted findings later judged unnecessary.
  Derived: yield, and marginal review value per round.
- **Stability tests**: irrelevant perturbations (order, wording, reviewer
  label, batch position, batch size) should not move the verdict; relevant
  ones (effort, exposure, frequency, consequence, evidence) should move it
  predictably. Test the reviewer with controlled defect pairs and harmless
  smells.

## Success criterion

Not fewer findings, fewer rounds, or more ACCEPTs/REJECTs: all can be
gamed. Success is lower remediation churn and review cost while preserving
or improving discovery of findings that later prove consequential. Cleaner
rationales at the same total cost improve explainability, not decision
quality.

## Open questions

- Which finding classes get which burden of proof?
- What evidence bar should WARNING have relative to FAILURE?
- How are DEFER triggers recorded and fired?
- How is the first experiment's baseline chosen?
