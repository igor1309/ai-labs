# ADR-002: Verification and bounded same-session repair

- **Status:** Accepted
- **Date:** 2026-09-30
- **Scope:** agent calls whose process declares a verification command
- **Decision type:** Architecture
- **Amends:** [ADR-001](001-agister-cli-architecture.md) rule 1

## Context

An implementer's claim that its work is done is not evidence. Today the
tests and revert checks on an implementer's changes run outside Agister, by
hand, in a tree no record names ([deferred item 1](../deferred.md)). Without
repair, a failing check can only end the node, and giving the failure back
to the implementer would take a retry node and a workflow layer that do not
exist.

Multica LAB-7 first proposed a "post-hook". That name was a mental
reference, never a design choice: what the process declares is its
verification, not a general lifecycle hook.

Prior art ([verify and repair: prior art](../../../research/agister/research/verify-repair-prior-art.md))
converges on one shape: a deterministic check after the agent's turn, its
bounded output sent back into the same session, with a small hard cap
(Aider, CrewAI, OpenHands: 3). A fresh-context attempt, where one exists, is
an outer step (the-furnace, X15, SWE-agent). No system found completes the
work only when the latest check passes; Aider stops quietly at its cap.

## Decision drivers

- A node must not complete on the agent's claim alone: a declared check
  has to pass first.
- No retry node and no workflow layer for the common case of fixing a
  failing test.
- The same result shape for every node (ADR-001 rule 6).
- A FAIL is final for the tree state it ran on; never rerun a check until it
  passes (Verger lessons L120, L121).
- Every effect owned and bounded (ADR-001 rule 11), including a check that
  hangs or never ends.
- Context growth stays small: repair is a few turns inside one step, not
  reuse across steps (Verger lesson L5).

## Decision

A process may declare **one verification command**. After a turn whose output
is contract-valid, Agister runs the command in the call's checkout. If the
command fails and attempts remain, Agister resumes the **same session** in
the **same checkout** with the failure, validates the repair turn, and runs
the command again. The node completes only when the latest verification
passes.

```text
turn ──valid──► verify ──pass──► completed
                  │
                fail, attempts left, checkout changed, failure changed
                  │
                  ▼
     repair turn (same session, same checkout) ──valid──► verify …

fail at the bound, no progress, verify timeout, cancellation,
or a failed or invalid turn ───► failed (existing failure classes)
```

## Rules

### 1. Verification is declared, never chosen by the agent

`verify` belongs to the process, beside its output contract:

- **command:** one Bash command, fixed when the call is resolved and recorded
  with the definition's digest. Editing settings during the call does not
  change it.
- **timeout:** required, per run of the command. There is no default. A
  `verify` without a timeout is invalid, and `check` says so.
- **max_attempts:** required, at least 1. The first run is attempt 1.
- **instruction:** what the agent is told when a run fails. Like every
  instruction, it is a setting (ADR-001 rule 2); the core only assembles it
  with the command, exit status and bounded output.

The command is operator infrastructure. It is not an agent permission, and
the agent cannot select, extend or skip it.

### 2. Verification runs only after a valid turn

It runs after a turn whose output validates against the contract, in the
call's own checkout, before artifacts are captured and before the checkout
is released. It never runs when the call is refused, or when a turn fails,
is interrupted, is lost or returns invalid output: that turn's own status and
class end the node.

### 3. Repair continues the call's own session

A repair turn resumes the session of the call's earlier turn in the same
checkout. This is not a continuation in the sense of ADR-001 rule 12: the
call reads only its own state. It needs an agent that allows continuing its
sessions and an adapter that supports it; otherwise a `verify` with
`max_attempts` above 1 refuses the call before the first turn (ADR-001
rule 7). A fresh-context attempt is not part of the node; it is an outer
step's job ([deferred item 13](../deferred.md)).

### 4. The command is bounded twice

Each run is bounded by `verify.timeout`. The call's effective timeout bounds
the whole loop: every turn and every run. A `verify.timeout` longer than the
call's effective timeout is invalid. When either fires, Agister kills the
command's whole process group. Both limits compose under ADR-001 rule 3:
they may only narrow, never widen, the layers above.

### 5. No rerun without progress

A run never repeats on the same tree state. Before each run after the first,
Agister compares the checkout's content identity and the failure with the
previous attempt. If the repair turn left the checkout unchanged, or the run
fails with the same exit status and the same output, the loop ends as failed,
and the remaining attempts are forfeited. The evidence says why.

### 6. The result shape does not change

A node with `verify` ends in the same node result as any other (ADR-001
rule 6). Completed means contract-valid output **and** a passing latest run.
The output is the latest turn's. Usage and cost cover every turn; timing
covers the whole loop. Failures use the existing closed set of classes:

| What happened | Failure class |
|---|---|
| a run exceeded `verify.timeout`, or the call's timeout fired | timeout |
| the call was cancelled | cancelled |
| a repair turn failed or returned invalid output | that turn's own class |
| the last attempt failed | budget exhausted |
| no progress (rule 5) | budget exhausted |

No field, status or class exists only for verification.

### 7. Every attempt is evidence

Each turn is paired with the run that follows it. For each run the evidence
records the command, working directory, exit status, timing, bounded output
(head and tail, with the full size), the session, the attempt number, and
the paths the preceding turn changed. The core records changed paths
without knowing which are tests (ADR-001 rule 1). Artifacts are captured
whether the loop passes or fails.

### 8. The run is owned by the call

The command's process group is an effect of the call (ADR-001 rule 11): it is
bounded, killed on cancellation, and cleaned up on every exit path, including
the reap after a killed CLI.

## Amendment to ADR-001

Rule 1 becomes: the core performs agent calls and runs the verification
command a process declares; nothing more specific. This does not add a
command node. A command that runs without an agent, or whose result another
process takes as input, stays open in [deferred item 1](../deferred.md).

## Consequences

### Positive

- An implementer's work is verified inside the record, on the exact checkout
  it produced, and a failing check cannot complete the node.
- The common repair (a failing test) needs no retry node and no workflow.
- Workflows keep routing on one result shape.
- Agent session reuse gets its first bounded consumer.

### Negative

- The agent can edit what the command reads: tests, `Makefile`, test data.
  Changed paths are recorded but not refused
  ([deferred item 14](../deferred.md)).
- A flaky failure goes to the agent as if it were real
  ([deferred item 14](../deferred.md)).
- Context grows with each attempt; the bound keeps it small but does not
  remove it.
- The core now runs one kind of command besides agent calls.

## Alternatives considered

- **A verification that only fails the node:** rejected. Repair would need a
  retry node, and the common case would need a workflow.
- **A separate retry node or graph loop:** rejected for this case. It is the
  complexity this decision removes; a fresh-context attempt stays an outer
  step.
- **A runtime stop hook** (Claude Code Stop hook, Codex Stop hook): rejected.
  It lives in the runtime, often in the agent's own workspace
  (blast-furnace writes `.codex/hooks.json` there), differs per runtime,
  leaves no evidence in Agister and has its own loop failures.
- **A fresh context for every repair:** rejected as the default. It loses the
  diagnosis and costs a full restatement; it belongs to the outer step when
  same-session repair is exhausted.
- **Rerunning the command until it passes, or once on failure to filter
  flakes:** rejected (Verger lessons L120, L121).
- **A failure class of its own:** rejected. It would give verification a
  result shape of its own.

## Explicit non-decisions

The exact settings syntax; the size of the bounded output; how the checkout's
content identity is computed; the command's environment; whether a failing
check in a future standalone check node needs a class all nodes share (if
`budget exhausted` does not fit it, the answer is one shared class, never a
verification-only one); pre-turn commands; more than one command.

## Source basis

- [Verify and repair: prior art](../../../research/agister/research/verify-repair-prior-art.md)
- [Agister orchestrator](../../../research/agister/research/verger/orchestrator.md)
- [Verger lessons](../../../research/agister/research/verger/lessons/)
- Multica LAB-7 and its discussion (2026-09-29)
