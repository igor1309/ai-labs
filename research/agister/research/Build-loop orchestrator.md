# The build-loop orchestrator, v2

A design for building software through subagents, based on Verger M1–M7 (*Verger orchestration lessons*, cited as L-numbers). v2 takes in the findings of *Build-loop orchestrator — review* (cited as R1–R7).

## Concise

The orchestrator is a script, not an agent. It is a state machine over the tracker, and it calls models only where judgment is needed. Scripts decide every verdict, gates enforce every rule, and all state lives in the repo.

**Roles**
- **Driver (script):** picks the next row, spawns a builder, runs `accept`, and routes reviews, findings and questions. It holds no memory beyond the repo, so it cannot drift.
- **Builder:** a fresh agent for every step, with a generated brief. It reports only the SHA, the gate line, the plant table and any spec friction.
- **Gates:** deterministic, in throwaway worktrees. They record verdicts in a ledger keyed by SHA and enforce the rules a brief states.
- **Reviewer:** another model family, commits only, no steer. Queued and capped.
- **Judge:** a fresh agent for each review. Only a test can reject a finding.
- **Coherence reviewer:** reads a whole module at each milestone boundary.
- **Planner and advisor:** turn open questions and spec friction into rulings and rows.
- **Owner:** decides through the inbox only.

**Invariants**
- Steps stay small, and are split in the tracker, never in a brief.
- A rule that matters has a gate check. The brief only explains.
- State is committed before each builder starts, so the driver can resume anywhere.
- Nothing blocks the build: not a decision, a review or a quota.
- Every wait is bounded. Liveness comes from processes and heartbeats, never from an agent's own account.
- Loop health is measured from the ledger, and every threshold is a calibration tuned by those metrics.
- A milestone is done when its gate and its coherence review pass.

## Detailed

### Principles

1. **Code over prose.** Most of the failures in v1 were an LLM orchestrator drifting (L1, L10, L20, L22). What it actually does is a state machine, so v2 makes it one (R1). Models do only what needs judgment.
2. **Enforce, don't instruct.** A rule that exists only in a brief gets gamed (L41). Gates enforce, and briefs explain (R2).
3. **Small steps, fresh agents, repo as memory** (L3, L5, L23).
4. **Local correctness is not global coherence.** Small steps need a counterweight at a larger scale (R3).

### State layout

- **Specs:** contracts, scenarios, the ADR and the D-numbered decision register.
- **Plan:** one file per milestone, each with a gate. **Steps:** one file per row.
- **`tracker.tsv`:** the source of truth. Only scripts write it, one writer at a time.
- **Ledger:** verdicts keyed by SHA, with timings. It is also the source for metrics.
- **Queues:** reviews, spec friction, module tags.
- **`INBOX.md`:** open owner decisions and holds (L26).

### The driver

The driver is an idempotent loop. Each pass reads the tracker, ledger, queues and inbox holds, and takes the next legal action:

1. Commit the next row as `in progress`. Generate the brief, refusing if a module tag is missing (L7). Reset a throwaway worktree, refusing if the last merge was never accepted (L11).
2. Spawn a builder in an explicit write-enabled permission mode (L2). Wait with a bound, and check the heartbeat and `pgrep` (L19, L20).
3. Run `gate` and `plants`, then `accept`, which merges on a clean ledger entry and re-runs nothing (L8, L13).
4. Enqueue the commits for review, and file any reported friction.
5. Dispatch reviews and judges up to the caps. Only a review that exited 0 goes to a judge (L29, L31).

Every decision is read from committed state, so a crash or compaction loses nothing (L23). On a usage limit it resumes once. On a second hit it stops spawning and leaves rows `in progress` (L27).

Anything the driver cannot decide becomes an **exception**: a finding reported false, a change in spec behavior, a failure the gates can't classify. An exception goes to the judge or advisor, or to the inbox as a decision. The driver never improvises.

### Rules as gate checks

Each brief rule is paired with a check where one is possible (R2):

| Brief rule | Gate check |
|---|---|
| Write tests first | Commit order: test files before code |
| Don't re-run until green | The ledger shows attempts per SHA |
| No check evasion | Static scan for split strings and disabled checks |
| No git surgery | `start` owns branch refs; builder rebases are rejected |
| Plants only on copies | Worktree must be clean after `plants` |

The brief has a size budget. A rule is retired from the brief once a gate enforces it, and only its one-line rationale stays. A new violation adds a check first and prose second.

### Verdicts

Verdicts run under a machine-wide lock after a clean baseline, with timeouts scaled from it (L14). Kills are timed from the first failing test and bounded; plants must compile (L15, L16). A disagreeing re-run means fixing the threshold (L15). Environment failures retry once without consuming the attempt (L17). Scripts are tested against real tool output (L12).

### Spec friction

A wall must cite missing spec text (L42), but builders also find specs that are awkward or wrong, and v1 had no way to report that (R4). v2 lets a builder finish the step as specified and report friction as one line naming the spec section, the problem and a suggestion. Friction goes to the planner queue. The advisor rules on it, and a ruling becomes a spec edit plus rows. The build never waits for it.

### Reviews and coherence

- **Per commit:** the cross-family reviewer gets no steer, and static reviews are labelled static (L28). A judge turns each finding into a row unless it is covered, out of scope or a duplicate, and a suspected false finding becomes "test first" (L29). Spec-behavior doc changes are reviewed before they are committed (L32).
- **Per milestone:** a coherence reviewer reads each touched module whole, looking for duplicated logic, sibling copies of fixed bugs (L44), boundary drift and missing abstractions. Its findings go through the same judge (R3).

### Metrics

A `metrics` script reads the ledger and tracker (R5):
- cycle time per step and the share of steps that pass on the first attempt;
- findings per reviewed step, and the share later proven false;
- defects found after a merge, by source;
- hang and flake counts;
- the share of rows spent on loop tooling versus the product.

Each metric has a trigger:
- First-pass rate drops: split steps further.
- False-finding rate is high: review the judge rules (L30).
- Loop share rises above its budget: freeze new loop features until product work catches up (R6).

### Calibrations

Every number in this design is a calibration from Verger (R7), not a law: 7 scenarios and 10 cases per step, 5 concurrent reviews and judges, timeouts at 3× baseline with a 20 s floor, a wake-up at half the time box. Each lives in one config file and is tuned from the metrics.

### The owner

- Advisor rulings are provisional and recorded as D-numbers, and they never block (L33).
- Decisions are batched, each with a recommended pick. Work continues marked `PENDING` (L35).
- Defects become rows, never questions (L34).
- What only the owner can do comes as a complete `!` line with its rollback, preflight-checked and staged under `/tmp`. `sudo` goes in a separate Terminal (L37, L38).

### Environment

External binaries are pinned by path, version and hash. Re-pins run as a pipeline that checks new background processes and defaults (L45, L46). A flake is a defect: its own step, rates measured before and after, and a search for sibling bugs (L43, L44).
