# ADR-002: Verification and bounded same-session repair

- **Status:** Accepted
- **Date:** 2026-09-30
- **Scope:** agent calls whose process declares a verification command
- **Decision type:** Architecture
- **Amends:** [ADR-001](001-agister-cli-architecture.md) rule 1

## Context

An implementer's claim that its work is done is not evidence. Today the
tests and revert checks on an implementer's changes run outside Agister, by
hand, in a tree no record names (dogfooding, 2026-09-29). Without
repair, a failing check can only end the node, and giving the failure back
to the implementer would take a retry node and a workflow layer that do not
exist.

Prior art converges on one shape: a check after the agent's turn, its bounded output
sent back into the same conversation, with a small hard cap (Aider 3, CrewAI
3, Instructor and Pydantic-AI configurable). A fresh-context attempt, where
one exists, is an outer step (the-furnace, X15, SWE-agent). At the cap,
CrewAI raises and Aider stops quietly.

## Decision drivers

- A node must not complete on the agent's claim alone: a declared check
  has to pass first, on the exact content the node delivers.
- No retry node and no workflow layer for the common case of fixing a
  failing test.
- The same result shape for every node (ADR-001 rule 6).
- A FAIL is final for the tree state it ran on; never rerun a check until it
  passes.
- Every effect owned and bounded (ADR-001 rule 11), including a check that
  hangs or never ends; limits only narrow (ADR-001 rule 3), across all turns.
- Context growth stays small: repair is a few turns inside one step, not
  reuse across steps (Verger lesson L5).

## Decision

A process may declare **one verification command**. After a turn whose output
is contract-valid, Agister runs the command in the call's own checkout. If the
command fails and attempts remain, Agister continues the **same conversation**
in the **same checkout** with the failure, validates the repair turn, and runs
the command again. The node completes only when the latest run passes on the
content that is then captured.

```text
turn ──valid──► verify ──pass, checkout unchanged by the run──► completed
                  │
                fail, attempts and budget left
                  │
                  ▼
     repair turn (continues the conversation, same checkout)
                  │
                valid, content never checked before ──► verify …

a turn that fails ──────────────────► that turn's status and class
timeout, cancellation ──────────────► interrupted (timeout, cancelled)
last attempt failed, no progress ───► failed (budget exhausted)
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
the agent cannot select, extend or skip it. What the command runs, however,
can be code the agent wrote (rule 9).

### 2. Verification needs a checkout the call owns

A process with `verify` must declare a pinned checkout
(`workspace.checkout`). A call without one is refused before the first turn
(ADR-001 rule 7): verifying the caller's shared tree would check content
other calls can change and the call does not capture.

### 3. Verification runs only after a valid turn

It runs after a turn whose output validates against the contract, before
artifacts are captured and before the checkout is released. It never runs
when the call is refused, or when a turn fails, is interrupted, is lost or
returns invalid output: that turn's own status and class end the node.

### 4. Repair resumes the call's own session in place

A repair turn resumes the provider session of the call's first turn, in the
same checkout, by the session ID the runtime reported: the same resume
mechanism as continuation (ADR-001 rules 5 and 12), with no preset ID and
no fork. The node therefore has one session, and every turn appends to it.
The evidence records the session each turn reported; a repair turn that
reports a different session fails as a contract violation. This is not a
continuation between calls: the call reads only its own state.

It needs an agent whose sessions may be continued and an adapter that
supports resume; otherwise a `verify` with `max_attempts` above 1 refuses
the call before the first turn (ADR-001 rule 7). A turn that reports no
session cannot be repaired, and the node ends as budget exhausted. A
fresh-context attempt is not part of the node; it is an outer step's job.

### 5. Every limit covers the whole call

- **Time:** each run is bounded by `verify.timeout`; the call's effective
  timeout bounds the whole loop, every turn and every run. A
  `verify.timeout` longer than the call's effective timeout is invalid. When
  either fires, Agister kills the command's whole process group.
- **Cost:** the call's effective cost limit is one budget for all its turns.
  Each repair turn receives only the remainder, computed from the costs the
  earlier turns reported. If an earlier turn's cost is unknown while a cost
  limit is in effect, no repair turn starts, and the node ends as budget
  exhausted.
- **Attempts:** verification attempts are a limit of their own, apart from
  call attempts (`retry.max_attempts`), and compose under ADR-001 rule 3:
  the service sets a ceiling, and a policy, the process and the caller may
  only narrow it. A `verify.max_attempts` above the effective ceiling is
  invalid, never clamped.

### 6. No rerun without progress

A run never repeats on content already checked. Before each run after the
first, Agister computes the checkout's content identity and compares it with
**every** identity checked earlier in the call; a match (the repair turn
changed nothing, or returned to an earlier state) ends the loop without
running. After a failing run, Agister compares its exit status and a digest
of its complete output with the previous run; the same failure ends the
loop. Either way the node fails as budget exhausted, the remaining attempts
are forfeited, and the evidence says why.

### 7. A pass counts only on unchanged content

Agister computes the content identity before and after each run. A run that
changes the checkout's content is a failed run, whatever its exit status,
and the evidence records what it changed. A passing run therefore leaves
exactly the content it checked, and nothing runs between that pass and the
capture of artifacts.

The captured artifacts must reproduce the content that passed: applied to
the pinned base, they rebuild the same content identity. A capture that
omits content (an ignored new file, say), transforms it, or fails prevents
completion.

### 8. The result shape does not change

A node with `verify` ends in the same node result as any other (ADR-001
rule 6), and existing statuses and classes keep their meaning. Completed
means contract-valid output **and** a passing latest run. The output is the
latest turn's. Usage and cost cover every turn; timing covers the whole loop.

| What happened | Status | Failure class |
|---|---|---|
| a run exceeded `verify.timeout`, or the call's timeout fired | interrupted | timeout |
| the call was cancelled | interrupted | cancelled |
| a repair turn failed, was lost or returned invalid output | that turn's own | that turn's own |
| the last attempt failed | failed | budget exhausted |
| no progress (rule 6), or the cost budget cannot be enforced (rule 5) | failed | budget exhausted |

No field, status or class exists only for verification.

### 9. Every attempt is evidence

Each turn is paired with the run that follows it. For each run the evidence
records the command, working directory, exit status, timing, bounded output
(head and tail, with the full size and a digest of the whole), the session,
the attempt number, the content identity checked, and the changes the
preceding turn made, as a diff kept before the next repair turn starts, so
every checked state can be rebuilt. The core records changes without knowing
which files are tests (ADR-001 rule 1). A node completes only after its
attempts' evidence is recorded. Artifacts are captured whether the loop
passes or fails.

### 10. The run is owned by the call

The command's process group is an effect of the call (ADR-001 rule 11): it is
bounded, killed on cancellation, and cleaned up on every exit path, including
the reap after a killed CLI.

The command runs with the operator's authority, not the agent's
permissions, and what it runs can be code the agent wrote: a test, a
`Makefile` target, a build script. Until verification is confined, a
process with `verify` in effect lends that authority to the agent's code,
including access to Agister's state (ADR-001 rule 9). `check` and
`process show` say so.

## Amendment to ADR-001

Rule 1 becomes: the core performs agent calls and runs the verification
command a process declares; nothing more specific. This does not add a
command node.

## Consequences

### Positive

- An implementer's work is verified inside the record, on the exact content
  the node delivers, and a failing check cannot complete the node.
- The common repair (a failing test) needs no retry node and no workflow.
- Workflows keep routing on one result shape.
- Repair and continuation share one mechanism: resuming a reported session
  in place, on both runtimes.

### Negative

- The agent can edit what the command reads: tests, `Makefile`, test data.
  Changes are recorded but not refused.
- A flaky failure goes to the agent as if it were real.
- Until verification is confined, the command lends the operator's
  authority to agent-written code.
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
  same-conversation repair is exhausted.
- **Rerunning the command until it passes, or once on failure to filter
  flakes:** rejected: a failure is final for the content it ran on.
- **A failure class of its own:** rejected. It would give verification a
  result shape of its own.

## Explicit non-decisions

The exact settings syntax, including the attempt ceilings' field names; the
size of the bounded output; how the content identity is computed; the
command's environment; which class a failed evidence write takes, a gap that
predates verification; whether a failing check in a future standalone check
node needs a class all nodes share (if `budget exhausted` does not fit it,
the answer is one shared class, never a verification-only one); pre-turn
commands; more than one command.
