# Build-loop orchestrator: a review

A review of the approach described in *Build-loop orchestrator*. L-numbers refer to *Verger orchestration lessons*.

My overall take: the core is right. The weak points are where it still depends on an LLM following prose rules, and where nobody owns coherence across steps.

## What's strong

- **It puts trust in the right places.** Verdicts come from deterministic scripts and a ledger keyed by SHA. Builders never judge their own work. This is the most important choice in the design, and the lessons show why: every self-verification failure (L8) was an agent grading its own homework.
- **Only a test can reject a finding.** It stops an agent from dismissing a real bug on a confident hunch, and the exitlock and QK-fix results show it separating real findings from false ones.
- **Reviews come from a different model family with no steer.** Findings that Claude-written gates missed were caught by Codex. Correlated blind spots between builder and reviewer are the real risk, and this addresses them directly.
- **State lives in the repo.** The loop survived four usage-limit cutoffs and several compactions. Most agent setups lose everything at that point.
- **Small steps.** The data is clear: 50+ minutes and stalls before the split, 2–6 minutes and first-pass gates after.
- **It protects the owner's attention.** The inbox, batched decisions with recommended picks, and nothing blocking the build together treat the human as the scarcest resource. That's correct.

## Where I'd push back

**1. The orchestrator is still an LLM, and most of the failures were its failures.** L1, L10, L20 and L22 are all the orchestrator drifting, inventing, relaying agent claims or doing the work itself, and the fix each time was more prose. Look at what's left of its job: pick the next row, spawn, run `accept`, route the review, route the question. That's a state machine. I'd make the orchestrator a script and call models only where judgment is needed (builder, judge, advisor, planner). You can't drift if there's no agent to drift. Right now the design spends effort fighting the model's nature with rules it has repeatedly broken.

**2. Brief rules only grow.** Every violation adds a line to the brief (L41), and nothing ever removes one. That's how the context problem comes back slowly. Where possible, turn a brief rule into a gate check: detect a split string, detect gate re-runs from the ledger, detect code committed before tests from commit order. The brief should explain; the gate should enforce. A rule that exists only in the brief will be gamed again.

**3. Nobody owns coherence across steps.** 193 small steps optimize local correctness. Design erosion shows up between steps. The failed-spawn lock bug existing in three copies (L44) is exactly that symptom, and it came from a review, not from any role responsible for it. Per-commit reviews won't catch it. I'd add a periodic whole-module review at milestone boundaries, looking for duplication, boundary drift and abstractions that should exist but don't.

**4. Everything rests on the specs being right, and the path from spec to build is one-way.** Builders can't push back ("a wall must cite the spec"). That's right for discipline, but it means design quality lives entirely in the specs and the advisor. Builders often discover that a spec is awkward or wrong. There should be a cheap, legitimate way to record "spec friction" as a row for the planner, separate from a wall.

**5. The loop has anecdotes, not metrics.** The ledger already holds the raw data. I'd track at least:
- cycle time per step;
- the share of steps that pass on the first attempt;
- findings per reviewed step, and the share later proven false;
- bugs found after a merge.

11 of 11 findings becoming rows could mean an excellent reviewer or a judge that approves everything; without the false-finding rate you can't tell which. Metrics would also make split decisions data-driven rather than reactive.

**6. The meta-software is becoming a product.** `dev/` now has about 10 scripts, each with a test suite, and they get their own Codex reviews and their own bugs (DEV-fix.18, .20, .26a). That's justified so far, but I'd watch the ratio: when loop work regularly crowds out product rows, stop adding features to the loop.

**7. It isn't proven outside Verger.** Everything was learned on one project, one owner and one pair of models. The principles transfer. The specific numbers (7 scenarios, 5 concurrent reviews, 3× baseline) are Verger calibrations and should be presented that way.

## In short

It's a sound design that learned the right lessons the hard way. The next step isn't more rules. It's turning the rules into code: script the orchestrator, move brief rules into gates, and measure the loop from the ledger. Then add the one role it lacks, a periodic owner of cross-step coherence.
