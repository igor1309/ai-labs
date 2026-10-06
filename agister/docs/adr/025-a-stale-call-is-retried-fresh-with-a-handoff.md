# ADR-025: A stale call is retried fresh, with a handoff

- **Status:** Proposed
- **Date:** 2026-10-06
- **Scope:** what follows when a staleness limit ends a call whose
  settings allow another attempt
- **Decision type:** Architecture
- **Amends:** [ADR-001](001-agister-cli-architecture.md) rules 2, 6 and
  12; [ADR-002](002-verify-and-bounded-repair.md) rule 5;
  [ADR-003](003-fan-out-and-join-workflow.md) rules 2, 3, 5 and 6;
  [ADR-012](012-a-checkout-runs-its-setup.md) rule 4;
  [ADR-024](024-a-stale-call-is-resumed-once.md), the alternative it
  deferred
- **Relates to:** [ADR-013](013-a-continuation-carries-the-earlier-runs-changes.md)
  rules 2 to 5; [ADR-022](022-a-call-may-work-in-the-callers-worktree.md)
  rules 4, 7 and 8

## Context

`retry.max_attempts` is a limit a policy sets and a process may narrow,
under the service's `max_attempts`. It is composed, recorded with the
call's other limits and shown by `process show`. Nothing acts on it. The
service's ceiling is 1 unless its settings say more, and every setting
shipped says 1.

A call that stops moving is ended at a staleness limit. ADR-024 gave it
a small budget of recovery turns: its session is resumed with the
evidence of what went stale. When the same limit is reached again on the
same thing, or no resume is left, the call ends with the limit's status
and class. Its work is kept as a patch. Going on takes a new call, made
by hand: someone reads the record, says in a new brief what happened,
and applies the patch.

Another turn in the same session does not help in two cases:

- The session cannot be resumed. A fresh-only agent has no recovery
  turns at all (ADR-024 rule 6).
- The session is the problem. After a long loop its context holds the
  loop, and every further turn reads it again.

ADR-002 rule 4, as ADR-024 amended it, keeps the answer out of the node:
"A fresh-context attempt is not part of the node; it is an outer step's
job." ADR-024 deferred that step.

Other harnesses that restart a stuck agent do it the same way. SWE-agent's
retry agent runs each attempt as a new agent with a new context, from a
loop outside the attempts. Anthropic's harness for long-running work
starts each session with an empty context and has it read what the last
one left: the state of the repository and its notes. In both, the restart
is a step outside the stuck one, and what crosses it is a handoff. None
replays the transcript.

Supervision practice sets the bounds. An Erlang/OTP supervisor restarts a
child a bounded number of times and then gives up. AWS's and Google SRE's
retry guidance says the same of requests: cap the retries, and retry
only a fault that may pass the next time. A deterministic failure is
never retried: it fails again and costs twice.

## Decision drivers

- A call that ended stale should cost one more attempt, not the node,
  where a fresh context may pass.
- The node stays as it is (ADR-002 rule 4): one session, and further
  turns only by resuming it.
- An attempt is an ordinary call: a run, limits and a record of its own.
  No second kind of run.
- What the new attempt is told is facts from the records. No model's
  claim and no transcript.
- Work the earlier attempt did is neither lost nor done again.
- Retry is bounded: a small cap that only narrows (ADR-001 rule 3), only
  ends that a fresh context may pass, and never the same end twice.
- The same result shape for every node (ADR-001 rule 6): no status or
  class of its own.
- A call whose settings do not ask for a retry runs exactly as today.
- Whether a retry works must be answerable from the records.

## Decision

A call that a staleness limit ended may be followed by **another
attempt**: a new, ordinary call of the same process, in a fresh session,
with the same resolved inputs. A step above the call starts it. The new
attempt gets the earlier attempt's changes in its checkout and a
**handoff** in its prompt, which the core assembles from the earlier
runs' records. The attempts are bounded by `retry.max_attempts`, and
nothing but a stale end is retried.

```text
caller ──► attempt 1: a call, its own run ──ended──► the step reads its record
                                                        │
  completed, or ended any other way than stale ─────────┼──► this attempt's result
  stale, and no attempt may follow:                     │
    none is left, the same end as before, a continued   │
    or in-place call, changes that cannot be carried,   │
    a cancelled caller ─────────────────────────────────┼──► this attempt's result
                                                        │
                                                        ▼ stale, and one may
      attempt n+1: a new run, a fresh session, the same inputs,
      the earlier changes applied, the handoff in its prompt
                                                        │
                                                      ended ──► the step reads its record …
```

## Rules

### 1. The retry is a step above the call

The step is in the application layer, where a call is started. It starts
a call, waits for it to end, reads the run's record, and may start
another call.

- It is not part of the node. The node's turns, repair and recovery are
  unchanged (ADR-002 rule 4). A call never learns that it is a retry,
  apart from its prompt and its record's link (rule 2).
- It is not the CLI. The CLI depends only on the client contract and
  reads no record (ADR-001 rule 15).
- It is not a node of a workflow. The workflow keeps its one shape
  (ADR-003).

Every ordinary call starts through it: `agister run <process>`, and each
node of a workflow, the join included, since each node is an ordinary
call of its process (ADR-003 rule 2).

### 2. Each attempt is an ordinary call with a run of its own

- **A new run.** Each attempt has its own run ID, record, events,
  limits, workspace and artifacts, and owns its effects (ADR-001
  rule 11).
- **A fresh session.** No session is resumed and none is named. The
  agent's session mode and the runtime's resume feature are not asked,
  so a fresh-only agent is retried.
- **The same request.** The process, the caller's agent and its
  narrowing overrides, and the directory it was launched from are
  attempt 1's. Each attempt is resolved from the settings as they were
  read when the caller submitted, as a workflow's nodes are. Its
  definitions and limits are therefore attempt 1's.
- **A link.** The record of an attempt after the first names the run it
  retries, its attempt number, counted from 1 over the step, and the
  SHA-256 digest of the handoff it was given (rule 5). Attempt 1's
  record has no link. An earlier run's record is not edited, as a
  continued run's is not (ADR-001 rule 12).
- **In a workflow**, every attempt's run names its workflow run and its
  node (ADR-003 rule 6).

The caller gets the last attempt's result and run ID. `agister run`
prints that result and exits by its status. A workflow node's status,
output and run are its last attempt's: the workflow's record names that
run, and the earlier attempts are reached from it by the links.

### 3. Only a stale end is retried

An attempt is retried only when a staleness limit is what ended its
call: `no_event`, `tool_command` or `repeated_tool_calls`, whether or
not recovery turns ran first.

The step makes the test a recovery turn is decided by (ADR-024 rule 1),
on the record: the run's latest turn carries a stale record, and the
call ended with that limit's own end (ADR-024 rule 10), not with an end
the turn reported itself. The class alone does not say it. `timeout` is
also the call's own timeout, and `budget_exhausted` is also a spent cost
limit and a failed verification.

Nothing else is retried. The reasons are two: a deterministic failure
fails again, and the others need something a fresh context does not
give.

| How the call ended | Why it is not retried |
|---|---|
| refused, invalid settings included | deterministic: the same call is refused again |
| `invalid_output` | the agent ended its turn itself; the next attempt would get the same prompt and contract, and no fact it lacked |
| a failed verification: the last attempt failed, or no progress | a failure is final for the content it ran on (ADR-002 rule 6), and the retry would carry that content; repair had the attempts the process allows |
| a `no_output` verification run that no repair followed | the carried content would make the same command hang again |
| the cost limit was reached | it needs more budget, which is the owner's to give |
| the call's own timeout | it was slow, not stuck; it needs more time, which is the owner's to give |
| `rate_limited` | it needs a wait: a backoff and a clock |
| `auth` | it needs a credential |
| cancelled | someone asked it to stop |
| lost: no result, killed, abandoned | the record cannot say what the run did or left, and a process of it may still run |
| any other class | not a stuck context: nothing says a fresh one would pass |

### 4. Never the same end twice

When an attempt ends at the same limit on the same thing as an earlier
attempt of the step, no further attempt starts, even when attempts are
left. The thing is ADR-024 rule 3's:

- for `repeated_tool_calls` and `tool_command`, the same tool and the
  same input, by the digest of the whole input;
- for `no_event`, the limit itself.

The handoff told the new attempt exactly that fact. An attempt that ends
there again shows that the fact did not help. Telling it once more is a
nudge without new facts (ADR-024 rule 3).

A different limit, or the same limit on another call or command, is a
new end. It may be retried while attempts are left. A step therefore
retries `no_event` once at most.

### 5. The handoff is assembled from the records

The new attempt's prompt is the process's own, with attempt 1's inputs,
and before them the handoff.

**The inputs are attempt 1's resolved values** (ADR-001 rule 8): a
revision is its commit identity, content is the content with attempt 1's
digest, and a join's collection is the same collection. Nothing is
resolved again, so a branch that moved or a file edited since does not
reach the retry. A run's record keeps a large value by its digest only.
The step therefore keeps attempt 1's resolved values while it runs and
gives them to each attempt; it does not read them back from the record.
Each attempt's record names the same identities.

**The handoff** is assembled by the core, in this order:

- `retry.instruction`: what the agent is told. It is a setting, like
  `verify.instruction` and `stale.recover.instruction` (ADR-001 rule 2).
- Why each earlier attempt of the step ended, in order: its run and
  attempt number; its status and class; the stale record that ended it,
  as the evidence of ADR-024 rule 2; and its recovery records, each with
  the limit it followed, what went stale there and its outcome.
- Where the work is (rule 6). For a call with a checkout of its own:
  that this is a new checkout of the same revision, that the earlier
  directory is gone, which run's changes are applied here, uncommitted,
  and the paths they touch; or that the earlier attempt left no changes.
  For a call without a checkout: that it works in the directory the
  earlier attempt worked in, and that Agister has no record of what was
  changed there.

The facts are Agister's words, because only Agister knows them (as in
ADR-013 rule 4). The core adds no advice of its own (as in ADR-024
rule 4): what to do with the facts is the instruction's to say.

No transcript and no model-written summary cross the step. A summary is
a model's claim about its own work: an agent stuck in a loop describes a
loop it did not see as one, and nothing checks what it says. The records
are facts Agister measured. A replayed transcript is the polluted
context again, by another road.

### 6. The earlier changes are carried

For a call with a checkout of its own, the `changes.patch` of the
attempt before is applied to the new attempt's checkout, uncommitted,
before its first turn. The mechanism is a continuation's (ADR-013):

- the patch read must match the digest its run recorded;
- it goes only onto the same revision in the same repository (ADR-013
  rule 2), which holds because the inputs are attempt 1's;
- it is checked to apply before the setup runs and applied after it
  (ADR-013 rule 3), so the setup still sees the revision's content
  (ADR-012 rule 4);
- the new attempt's own patch stays cumulative from the revision
  (ADR-013 rule 5). The last attempt's patch alone delivers everything
  the step's attempts did, and verification on a clean copy is
  unchanged.

A retry never silently starts clean:

- An attempt whose changes could not be captured is not retried. Its
  record has no patch, and its events say that the capture failed.
- An attempt whose patch cannot be read, or does not match its digest,
  is not retried.
- A patch that passes both and still does not apply refuses the new
  attempt before any turn, as it refuses a continuation. Only a checkout
  can tell, and the new attempt is the one that has it. That refusal is
  then the step's result, and the stale end stays on the run it names.

An attempt that left no changes carries nothing, and the handoff says
so. A call without a checkout has no patch: it works in the repository
itself, where whatever the earlier attempt changed still is.

### 7. A continued call and an in-place call are not retried

- **A call that continues a session** (`--continue`). The caller asked
  for that session, and a fresh one would drop it. The caller continues
  the run again, which carries its changes (ADR-013), or starts a fresh
  call.
- **An in-place call** (ADR-022). The worktree is the caller's, and it
  holds the attempt's changes (ADR-022 rule 7). A fresh in-place call
  starts only from the revision exactly (ADR-022 rule 4), so it would be
  refused, and resetting the worktree is not Agister's to do. The caller
  continues the run in place (ADR-022 rule 8), or discards the changes
  and runs again.

Neither is refused for it. The call runs as today, and an event says
why no retry started (rule 10).

### 8. The settings: an attempt cap that only narrows, and an instruction

```yaml
retry:
  max_attempts: 2
  instruction: >-
    An earlier attempt at this task was ended at a staleness limit; what
    ended it follows. Its changes, if any, are in this checkout,
    uncommitted. Read them before you go on, keep what is right and
    finish the task. Do not repeat what went stale.
```

- **max_attempts** composes exactly as today. The service's
  `max_attempts` is the ceiling. A policy sets it within that, and a
  process may only lower its policy's; where the policy sets none, the
  ceiling bounds the process's. A value that widens is invalid, never
  clamped (ADR-001 rule 3). The caller has no override. The first
  attempt is attempt 1, and unset is 1: nothing changes for settings
  that do not ask.
- **instruction** is new, in a policy and in a process. An effective
  `max_attempts` above 1 needs one: without it the settings are invalid,
  and `check` says so. The process's instruction, where it gives one,
  replaces the policy's: it is text, not a limit.
- The effective cap is recorded with the call's other limits, as today,
  and the instruction with it.

Nothing is refused before the first turn for a retry. Unlike recovery
(ADR-024 rule 6), it needs no feature of the agent or the runtime.

### 9. Each attempt runs under the call's own limits

Each attempt is a call under the call's effective limits, and each
starts with them whole: its timeout, its cost limit, its staleness
limits, its verification attempts (`verify.max_attempts`) and its
recovery resumes (`stale.recover.max_resumes`). Each is recorded on its
own run. Nothing is shared between attempts, and no attempt receives
what another left.

A cancellation stops the step: no attempt starts after it.

- Cancelling the run the caller submitted stops the step, whichever
  attempt is running: that attempt is cancelled, and none follows.
- Cancelling a later attempt's own run ends that attempt as cancelled.
  A cancelled call is not retried (rule 3), so the step ends too.
- A workflow's cancellation reaches its nodes' attempts as it reaches
  its nodes. Starting an attempt is serialized with it, as starting a
  node is (ADR-003 rule 6).

### 10. The step's decision is an event

When an attempt did not complete and the effective `max_attempts` is
above 1, the step says what it decided: that a retry started, with the
next attempt's run and number, or that none did, with the reason. With
`max_attempts` 1 no event is added.

The decision is the last event of the attempt that ended, after the
call's own last event and before the run is finished. A finished run
takes no event, and a caller follows a run by the ID it submitted. So
this is where a follower learns whether another attempt follows, and
which run to follow next. `agister run` follows the step to its last
attempt.

It is the only thing the step writes to an attempt's run. The record is
the call's.

The next attempt's run is recorded before the event names it. A run that
cannot be recorded means no retry, and the event says so. In a workflow,
the workflow's run has an event for each attempt's run as it starts, as
it has for a node's run today.

### 11. No status or class is added

| What happened | The step's result |
|---|---|
| an attempt completed, or ended any other way than stale | that attempt's |
| an attempt ended stale, and no attempt followed | that attempt's: the limit's own status and class |
| a later attempt ended | that attempt's, whatever it is |
| the new attempt was refused before any turn | that refusal |

The result is always one attempt's own, unchanged. No field of the node
result exists only for a retry: the link is on the run's record.

## Amendments to earlier ADRs

- ADR-001 rule 2: besides what the process defines, a retried call's
  prompt carries the handoff (rule 5). Its instruction is a setting; the
  rest states only facts from the earlier runs' records.
- ADR-001 rule 6: "so a workflow can tell a retryable failure from a
  final one" holds for the record, not for the class alone. What is
  retried is read from the run's stale record with its class (rule 3).
- ADR-001 rule 12 adds a deliberate exception: the step that retries a
  call reads the runs of its own earlier attempts, which are their
  records, their events and their `changes.patch`. The call it starts
  reads none of them.
- ADR-002 rule 5: "call attempts (`retry.max_attempts`)" are the
  attempts of this ADR's step. "Every limit covers the whole call" means
  one attempt: time, cost and verification attempts start whole in each
  (rule 9).
- ADR-002 rule 4, as ADR-024 amended it, is not changed: "A
  fresh-context attempt is not part of the node; it is an outer step's
  job." This ADR is that step.
- ADR-003 rule 2: a node is one ordinary call of its process, or, after
  a stale end, up to `retry.max_attempts` of them, each with the same
  resolved values.
- ADR-003 rule 3: a node has ended when its last attempt has, and the
  workflow's record names that attempt's run and outcome.
- ADR-003 rule 5: usage and cost sum every attempt's of every node, and
  are unknown if any is.
- ADR-003 rule 6: no attempt starts once the workflow is cancelled;
  cancellation and starting an attempt are serialized.
- ADR-012 rule 4, as ADR-013 amended it: a retry's carried changes are
  applied after the setup too, before the first turn.
- ADR-024, Alternatives considered, "A fresh-context retry with a
  handoff summary: deferred. It is an outer step (ADR-002 rule 4), for
  the workflow layer, which does not yet act on `retry.max_attempts`:
  the limit is only recorded." It is decided here. The step is above
  every call, a workflow's nodes included, not in the workflow layer
  alone, and the handoff is assembled from the records, not a summary.
- ADR-024 rule 7 is not changed: a recovery turn spends no call attempt.

ADR-013 and ADR-022 are not amended. A retry uses ADR-013 rules 2, 3
and 5 as a continuation does. In place of rule 1's choice of run it
carries the changes of the attempt before, and in place of rule 4's
notice it has the handoff.

## Consequences

### Positive

- A call that ended stale can cost one more attempt where it cost the
  node, with no brief written by hand and no patch applied by hand.
- A fresh-only agent, which has no recovery turns, gets a second
  attempt.
- The new context holds the facts of the stale end and none of the
  loop.
- The node, the workflow's shape and the result shape are unchanged.
- The last attempt's patch is the whole work, from the revision.
- The links and the decision events show, per limit and per runtime, how
  often a fresh attempt completes.

### Negative

- The worst case is `max_attempts` times the call's limits: its
  timeout, its cost limit, its verification attempts and its recovery
  resumes. In a workflow that is multiplied by the nodes, and a retried
  node holds the barrier for as long.
- A fresh context loses the diagnosis the earlier session held, and
  reads the task again in full.
- The carried changes may hold what made the attempt go stale, such as a
  half-written test that hangs. The handoff names the paths; it cannot
  say which change is at fault.
- The setup runs again for each attempt.
- The result's usage and cost are the last attempt's only. What the step
  cost is the sum over the linked runs; no record of a plain call holds
  it.
- A patch that does not apply ends the step as refused, although the
  attempt before it ended stale (rule 6).
- A long call that only ran out of its timeout, a continued call and an
  in-place call are still continued by hand.
- An attempt's events end with an event its call did not write.

## Alternatives considered

- **Every stale end stays final:** kept as the default, rejected as the
  only behaviour. A fresh-only agent has no other way on.
- **A retry inside the node:** rejected. The node has one session and
  takes a further turn only by resuming it (ADR-002 rule 4).
- **A retry in the CLI:** rejected. The CLI reads no record (ADR-001
  rule 15), and a workflow's nodes would get none.
- **A retry node in the workflow graph:** rejected. A workflow has a
  fan-out and a join only (ADR-003), and a plain call would get none.
- **A run of its own for the step**, as a workflow has: rejected. It
  would be a third kind of run for a link that two records already
  carry.
- **A model-written handoff summary:** rejected. It is a claim nothing
  checks (rule 5).
- **Replaying the transcript into the new session:** rejected. It brings
  the pollution back.
- **A retry that starts from the revision alone:** rejected. It loses
  the work, and the agent would do it again.
- **Retrying `rate_limited`:** deferred. It needs a backoff and a clock,
  which is another decision.
- **Retrying `context_overflow`:** deferred. The prompt itself may not
  fit. Without a record that separates a long loop from a too-large
  input it is a deterministic failure.
- **Retrying the call's own timeout:** rejected. The call was slow, not
  stuck, and the same time would run out again.
- **A budget shared across attempts:** deferred. A call's limits are its
  own (ADR-002 rule 5), and an attempt left with a remainder would fail
  for a reason that is not its own. The cap already bounds the total.
- **Retrying an in-place call**, admitted as an in-place continuation is
  (ADR-022 rule 8): deferred. It would be a second way for a fresh
  session to start in a changed worktree (ADR-022 rule 4), the caller is
  there to decide, and no need has been observed.
- **Retrying a continued call in its own session:** rejected. That is a
  recovery turn (ADR-024), which the call has by its own budget.

## Explicit non-decisions

The field names of the link and of the recorded instruction; the
events' names and data; the exact form of the handoff, and the size its
quoted evidence and its list of paths are bounded to; how the step is
given attempt 1's resolved values; how `check` and `process show`
display the cap and the instruction; whether `runs watch` goes on to
the next attempt; a wait between attempts; any action on the retry
records, such as turning retry off for a runtime.
