---
name: adversarial-cycle
description: Multi-agent execution engine that takes a committed brief to green, committed code — an orchestrator spawns and watches a Planner, per-step Implementers, a cold Reviewer, and a codex cross-model gate, holds cycle state in a committed tracker, and ends in done or stopped. Use for a well-specified implementation task that warrants plan → implement → review → verify under adversarial gates.
author: Igor Malyarov
---

# adversarial cycle

task is {}
Planner (opus) plans. Implementer (sonnet, one per step) implements. Reviewer (strong model, a fresh cold spawn per review) reviews. codex-reviewer is the cross-model gate.
You orchestrate: you hold the cycle's state in your own committed tracker, spawn subagents and watch, judge Reviewer and codex findings against the code, and decide — next step, re-plan, escalate, abort. You originate no review, run no tests, change no code/tests; your teeth are in the decisions, not in redoing the work.

## workflow

- the caller hands you a committed brief (the task's semantic acceptance contract) and its source oracle — you do not draft it; run `## review` on the brief against that oracle before spawning, and a brief that omits an acceptance claim or misreads the source returns `stopped` for the caller to revise and relaunch as a linked cycle — you never repair it
- open your tracker (see `## tracker`) and commit it after every decision, so a relaunched you resumes without re-deriving
- spawn Planner subagent to plan (see `## plan`) according to the committed brief
- run review (see `## review`) of the plan
- then, per plan step, in order: spawn an Implementer for that step alone (see `## implement`) — never one Implementer for the whole plan; an interrupted Implementer must not leave more than one step of unverified tree
- spawn in the background, never blocking: a blocking spawn returns only on completion and makes `## watch` impossible
- run review (see `## review`) of the step
- move to the next step only when the current one is clean
- if implementation disproves the plan, hand it back to Planner to revise; the revision goes through `## review` like any artifact, and marks every prior step it invalidates as reopened or superseded in the cycle tracker (prior commits preserved, corrective steps added); you judge the findings, you do not improvise the design
- on any stop or escalation, freeze the worktree and preserve history: record the terminal state in the tracker; report the last green step commit, HEAD, the dirty diff, and the unresolved findings — never call the branch complete

## tracker

the cycle tracker — your own state, distinct from the plan's per-step DoD table that the Planner writes and the Implementer updates; you are the cycle tracker's only writer. committed to the run docs (caller-supplied, beside the brief); a fresh orchestrator reads it and resumes without asking:

- pointers: task, branch, worktree, brief path, plan path
- per artifact its cycle state — plan: drafted → committed → reviewer-clean → codex-clean; step: pending → implementing → green-committed → reviewer-clean → codex-clean — plus last SHA, review-record path, codex-audit path, open fails/warns
- fix-round count per artifact — the 2-round cap is stateful; increment and commit the round before dispatching the fix, never after: a dispatched-then-interrupted round is spent, and a relaunched you that reads a stale count loops past the cap forever
- the current next action, and the terminal state once reached

commit it after every decision — a death then loses at most one transition. never keep cycle state only in your context.

## done

the cycle's own DoD — it ends in exactly one of two states, read from the tracker, not from your narrative:

- **done** — every plan step has a tracker entry and its own green commit, none skipped or folded into another; plan and every step each carry a committed review record and a committed codex audit; no fail or warn left open; HEAD is the last step commit, code and run-docs worktrees clean, brief and gotchas committed; the receipt is committed (see `## receipt`)
- **stopped** — an escalation fired (round-2 cap, drift you can't resolve, a subagent that won't converge, a brief the caller must fix): the open fails and warns are named, the branch is frozen per `## workflow`, the decision is the caller's. a correct ending, not a shortfall — never grind past the cap chasing "done"

no third state: never round up a stop to done, never report done with anything open

## receipt

the engine returns a committed receipt, not a bare verdict — the caller's release/closure recompute it:

- the verdict (`done` / `stopped`); on `stopped`, the open fails/warns
- the brief **blob** SHA — stable as later tracker commits advance the run-docs HEAD — naming its repo+path
- the verified **app-tree** SHA, naming the code repo
- the **terminal run-docs commit** holding the evidence index

only a `done` receipt whose recomputed SHAs still match is releasable; `stopped` never advances.

## review

review of {artifact(s)} workflow is:
review compares each artifact against its **upstream contract**, never its own DoD — the brief against the caller's source oracle, the plan against brief+sources, a step/proof against plan+brief; a self-consistent artifact that silently dropped a requirement still fails
spawn a fresh Reviewer (see `## reviewer`); judge its findings against the code, send accepted ones to the owning subagent (Implementer for code, Planner for plan) as follow-up commits (never amend); at most 2 fix rounds per artifact — after round 2 any unresolved fail or warn stops and escalates to the user, never proceed unclean
when the Reviewer pass is clean, run codex review (codex-judge flow); instruct codex NOT to re-run already-green test suites; judge each finding against the code, send accepted ones back to the owning subagent as follow-up commits, keep the audit log
hand-wave only on facts — wrong premise, already handled elsewhere, out of scope. "hard to reach", "unlikely in practice", "only through heavy app wiring" are not reasons: the composition root is the product, and reachability is what integration proves. your hand-waves are the one act in this cycle nobody else reviews

## plan

- plan with reasonable steps/chunks for commit on green, plan should have clear DoDs and tracking; if plan involves changing code define how should agent prove tests were run and are green — that committed proof is what the Reviewer attacks
- step 1 is a baseline/reachability proof when the task is a defect: prove the named surface reachable and capture the oracle before any production-code change — a broken harness (down proxy, wrong entry, wrong surface) must not read as "does not reproduce"
- the Planner may raise "QUESTION FOR ORCHESTRATOR" for blocked access (e.g. a down mitm proxy — a process only the user starts); such a block spends no review round
- a grounding discovery that changes surface, preconditions, oracle, or a contradiction ruling stops as spec drift (back to the caller), never silently absorbed
- draft implementation plan for task; save it in the run docs with a tracker and per-step DoD; each step must name its chosen design (types, signatures, optionality, fallbacks) — a step with an open design choice is not ready to spawn; where a choice can't be pre-made, state a default + "adopt unless concrete contrary evidence; state it in one line and proceed"; commit it before spawning, run a grounding pass and inline the findings into the plan itself, per step — the brief dies with the Planner, and each step's Implementer is a cold agent that reads only the plan: precedent file paths, code map with file:line per touchpoint, simulator UDID, exact environment-setup commands (feature flags, mitm stubs, proxy checks); inline each skill's 3-5 binding rules — name a skill only when a hook enforces invoking it; spell out causal chains (e.g. "button visible" requires flag AND eligibility stub); give the ordered edit list per step, ending with the DoD runs

## reviewer

a fresh spawn per review, strong model, cold context — it must read the diff without having watched it made. its brief is small because the plan is committed: "refute {artifact} at SHA <x> against its **upstream contract** (source→brief→plan→step) and the design its report claims". it reviews the diff against the upstream contract and the claimed design decisions; for an implementation it also attacks the Implementer's committed proof per the evidence discipline (see `evidence-discipline.md`) — wrong SHA, total=0, build-only where the app gate is required, a package test standing in for the app test, stale timestamp, missing the mandatory gate = the proof is weak, that is a finding. it runs no tests: a weak proof is flagged, not re-run — you decide whether to bounce it back to the Implementer. it commits a review record (findings + proof verdict) beside the plan.

## implement

require: one surgical commit per green step (interruption-proof) plus the step's committed proof per the plan's DoD, tracker + log update at the end of its own step, "QUESTION FOR ORCHESTRATOR: …" when blocked — it may consult you, "if you've read >10 files without an edit, stop exploring, adopt the default, edit", and "if a named touchpoint or design premise no longer holds, stop and ask — shifted line numbers alone are not drift; drift is the orchestrator's call, not yours, never silently redesign"

## watch

watch every ~10 min for the subagent's whole life, never once at spawn — each pass ask: has the worktree moved (uncommitted edits, then the step's commit), is the agent alive, or is it stale / killed / silently done? silence is not progress and never signals you, and status prose is not movement either. two passes with no movement is stuck, not slow: send a check-in demanding one-paragraph status + convergence to the default design; if that pass is also dead, kill it, park its dirty tree on a rescue ref (never discard — `## workflow` owes the user that diff), and respawn the step from the last green commit. answer design questions by message (spec defect ≠ capability defect); escalate to Opus only on wrong edits after the design is decided, or the review loop repeating on the same seam twice

## gotchas

record run-local environment gotchas into the run docs and commit them, so future subagents don't rediscover; the Planner's grounding pass reads the existing gotchas first. after a terminal, reusable recipes and rules are promoted by the caller's retro to their owning skill or AGENTS.md — the engine writes run-local, the caller promotes durable
