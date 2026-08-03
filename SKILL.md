---
name: adversarial-cycle
description: Multi-agent execution engine that takes a committed brief to green, committed code — an orchestrator resolves a skill-owned runtime profile, launches a Planner, one Implementer per step, a cold Reviewer, and an independent review, holds cycle state in a committed tracker, and ends in done or stopped.
author: Igor Malyarov
---

# adversarial cycle

This skill owns a runtime-neutral process. A selected skill-owned execution
profile supplies the concrete runtime, model, effort, launcher, and independent
review values; this procedure owns lifecycle, evidence, decisions, and state.
The caller must dispatch it with a committed brief path and its source oracle.

## workflow

- The caller hands over a committed brief and its source oracle. Review the
  brief against that oracle before any launch. A brief that omits an acceptance
  claim or misreads the source returns `stopped` for the caller to revise and
  relaunch as a linked cycle; this skill does not repair it.
- Before the first role launch, detect the host, resolve one profile with
  `scripts/resolve-runtime-profile.py`, and retain the canonical execution
  manifest plus its profile path and digest in the tracker.
- For every Planner, Implementer, Reviewer, escalation, or independent-review
  launch, pass the same manifest, the role, the artifact-specific prompt, and
  the orchestrator's `review_round_spent` value to
  `scripts/launch-runtime-agent.py`.
- The launcher returns a canonical result. On `accepted`, retain
  `runtime_task_or_agent_id` for watch and follow-up operations through
  `scripts/runtime-lifecycle.py`. Use its `status` operation while a launch is
  active, `follow-up` for owner-routed continuation, and `cancel` when a
  recorded process must be stopped. On `rejected`, record the exact adapter
  error, requested role/model/effort, result, and review-round value, then
  enter the existing `stopped` transition. Do not issue another launch or
  select a replacement.
- Open the cycle tracker and commit it after every decision, so a relaunched
  orchestrator resumes without re-deriving state.
- Resolve the plan according to the committed brief and run a review of the
  plan against the brief and its sources.
- Per plan step, launch exactly one Implementer, then review the step. An
  interrupted Implementer must not leave more than one step of unverified
  tree.
- Launch a fresh cold Reviewer for every review. The Reviewer is read-only and
  returns the independent-review findings contract; the orchestrator judges
  each finding and routes accepted fixes to the owner.
- Move to the next step only when the current step is clean: its green commit,
  review record, independent audit, and evidence satisfy the plan.
- If implementation disproves the plan, return it to the Planner for a revised
  committed plan. Mark every invalidated step reopened or superseded in the
  tracker and preserve prior commits; do not silently redesign.
- On any stop or escalation, freeze the worktree and preserve history. Report
  the last green step commit, current HEAD, dirty diff, and unresolved
  findings.

## tracker

The cycle tracker is distinct from the plan's per-step DoD table and is owned
by this skill. It is committed beside the brief and records:

- Pointers: task, branch, worktree, brief path, and plan path.
- The selected profile path and digest, canonical execution manifest, and each
  canonical launch result for every artifact.
- Per-artifact state: plan `drafted → committed → reviewer-clean →
  independent-clean`; step `pending → implementing → green-committed →
  reviewer-clean → independent-clean`.
- The last SHA, review-record path, independent-audit path, open fails/warns,
  and the accepted runtime identifier used for watch/follow-up operations.
- A stateful fix-round count per artifact. Increment and commit the round
  before dispatching a fix; a dispatched-but-interrupted round is spent.
- The current next action and the terminal state once reached.

The tracker records decisions as they happen; it appends later rounds rather
than overwriting earlier failure evidence.

## done

The cycle ends in exactly one of two tracker states:

- **done** — every plan step has its own green commit, no step is skipped or
  folded into another, the plan and every step have a committed review record
  and independent audit, no fail or warning is open, code and run-document
  worktrees are clean, the brief and gotchas are committed, and the receipt is
  committed.
- **stopped** — a round cap, drift, unavailable selected runtime/model,
  unresolved review finding, or other declared escalation fired. The tracker
  names open fails/warns and the worktree is frozen for the caller.

There is no third state. Do not round a stop up to done.

## receipt

The engine returns a committed receipt, not a bare verdict. The release or
closure stage recomputes:

- The verdict (`done` or `stopped`) and, for `stopped`, open fails/warns.
- The brief blob SHA naming its repository and path.
- The verified app-tree SHA naming the code repository.
- The terminal run-document commit holding the evidence index.
- The execution-manifest digest and selected profile provenance.

Only a `done` receipt whose recomputed SHAs still match is releasable.

## review

Review compares an artifact against its upstream contract, never only against
its own DoD: brief against source oracle, plan against brief and sources, and
step/proof against plan and brief.

Use a fresh Reviewer for each review. Its brief is small because the upstream
contract and artifact are committed. It reads the diff, attacks the claimed
design, and writes a committed review record without changing the target. It
also attacks the Implementer's committed proof using `evidence-discipline.md`:
wrong SHA, total zero, build-only proof where the app gate is required, a
package check standing in for an app check, stale timestamps, or a missing
mandatory gate are findings.

After a clean Reviewer result, run the read-only independent-review contract
owned by this skill. Record its runtime, concrete model, effort, launcher,
provider, and independence classification. Judge every finding against the
upstream contract and actual code:

- **ACCEPT** means the premise is proven and the owning Planner or Implementer
  receives a surgical follow-up fix.
- **HAND-WAVE** means the premise is wrong, already handled, out of scope, or
  unsupported by the supplied evidence; record the reason.

At most two fix rounds are allowed per artifact. After round two, any open
fail or warning stops the cycle and escalates to the caller.

The standalone `codex-judge` command remains outside this cycle. The cycle
uses only the skill-owned read-only independent-review contract and routes
accepted fixes through the artifact owner so its audit trail remains intact.
Historical `codex-audit` tracker entries are interpreted as independent audits
with `classification = legacy-codex-review`; committed historical keys and
commits are not rewritten.

## plan

- Plan in chunks that can reach a green, self-contained commit. Each step has
  a clear DoD and tracking fields, and names resolved roles rather than
  embedding runtime-specific values.
- For a defect, step one proves the named surface is reachable and captures
  the oracle before production changes. A broken harness must not read as
  "does not reproduce".
- If the failing mechanism has not been observed, treat source explanations as
  hypotheses. Capture the strongest running evidence available; if it
  contradicts the assumed cause, stop for plan revision rather than absorbing
  the drift.
- A Planner may raise `QUESTION FOR ORCHESTRATOR` for blocked access, such as a
  user-owned service that is down. That block spends no review round.
- Every step names its design choices, profile/resource paths, code map,
  environment setup, causal chain, ordered edits, and exact DoD runs. Open
  design choices must have an adopted default and a contrary-evidence rule.

## reviewer

A fresh cold Reviewer is used for each review. It reads the committed diff
against the upstream contract and the claimed design. It does not run tests;
weak proof is a finding for the orchestrator to judge. It writes a committed
review record beside the plan or step.

## implement

Each step requires one surgical green commit and its committed proof. Commit
the moment the step's gates pass. If the session is interrupted, prioritize a
committable green state over further edits. Ask
`QUESTION FOR ORCHESTRATOR: …` when blocked. If a named touchpoint or design
premise no longer holds, stop and report the drift rather than silently
redesigning.

## watch

Watch the whole life of every launch at least every ten minutes. Check whether
the worktree moved, whether a launch result or commit appeared, and whether
the agent is alive, stale, or silently done. Silence is not progress. Two
passes without movement are stuck: demand a short status and convergence to
the committed design; if it remains dead, preserve the dirty tree on a rescue
ref and resume from the last green commit.

## gotchas

Record run-local environment gotchas in the run documents and commit them so a
future cycle does not rediscover them. After a terminal state, promote reusable
recipes to their owning skill or instruction file through the caller's retro.
