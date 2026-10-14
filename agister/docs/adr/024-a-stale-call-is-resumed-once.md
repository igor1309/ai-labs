# ADR-024: A stale call is resumed once, with the evidence

- **Status:** Accepted
- **Amended by:** [ADR-025](025-a-call-works-where-it-is-called.md)
- **Date:** 2026-10-06
- **Scope:** what follows when a staleness limit ends an agent turn or a
  verification run
- **Decision type:** Architecture
- **Amends:** [ADR-002](002-verify-and-bounded-repair.md) rules 3, 4, 5
  and 8

## Context

A policy may set staleness limits, and a process may narrow them. They end
a call before its timeout because it stopped moving, not because it is
slow:

| Limit | What went stale | Status and class today |
|---|---|---|
| `stale.no_event` | an agent turn without a runtime event for the limit | interrupted, timeout |
| `stale.tool_command` | one command a tool of the agent ran for the limit | interrupted, timeout |
| `stale.repeated_tool_calls` | the same tool call, the limit's number of times in a row | failed, budget exhausted |
| `stale.no_output` | a verification run without output for the limit | interrupted, timeout |

Agister ends the turn's or the run's process group, records the limit
reached with what went stale and when, and ends the call. Every limit ends
the call, whatever caused it. The work the turn did is kept as a patch,
but the node fails. Going on takes a new call, made by hand.

The causes differ. A repeated call is the agent's loop. A hung command is
often a command that waits for input or never ends. A turn without events
is as often the provider or the network as the agent. A verification run
without output may be a test the agent's change made hang.

Other harnesses react to a stuck agent in one of three ways:

- **Nudge once, then stop.** OpenHands sends one message on a streak of
  failing actions and then marks the agent stuck. CrewAI sends one "give
  your final answer" message at its cap. Aider reflects at most three
  times.
- **Only stop.** LangGraph and AutoGen end at a limit.
- **Start again with a fresh context, outside the stuck step.** SWE-agent's
  retry agent and Anthropic's harness for long-running work restart with a
  handoff. None restarts with a fresh context inside the stuck step.

Two things bound what a nudge can do. A repeated loop indicates no
progress: a turn that makes the same call again and again is not moving
towards its result, and more of the same turn does not change that. And
a bare nudge adds no facts: telling an agent that it seems stuck gives it
nothing it lacks. What it lacks is a fact from outside its own reasoning,
such as what was repeated or what hung.

Supervision practice agrees (Erlang/OTP supervisors, AWS's and Google
SRE's retry guidance): bound the restarts, then escalate; retry only
faults that may pass, and with a small cap.

Agister's adapters run each turn as a one-shot process, so no channel
reaches into a running turn. What a call can do is end the turn and
resume its session with a message. ADR-002 rule 4 already has that
mechanism, for repair.

## Decision drivers

- A stuck turn should cost one message, not the node, where a message can
  help.
- A recovery message carries facts the agent does not have: what was
  repeated, what hung, for how long. A bare "you seem stuck" is not sent.
- Recovery is bounded: a small budget per call, and never the same
  evidence twice.
- One mechanism for a call's further turns (ADR-002 rule 4), no second
  path into a session.
- Limits only narrow (ADR-001 rule 3), and every limit covers the whole
  call (ADR-002 rule 5).
- The same result shape for every node (ADR-001 rule 6): no status or
  class of its own.
- A call whose settings do not ask for recovery runs exactly as today.
- Whether recovery works must be answerable from the records.

## Decision

A turn that Agister ended at a staleness limit may be followed by a
**recovery turn**: Agister resumes the call's own session, in the same
workspace, with a message that carries the evidence of what went stale.
A call has a small budget of such resumes, shared by every limit, and
none by default. The same evidence is never sent twice: a limit reached
again on the same thing ends the call, with the class it has today.

A verification run without output no longer ends the call outright. It
is a failed attempt, which a repair turn may fix.

```text
turn ──ended at a staleness limit──► a resume, a session, time and cost left?
                                       │
                                       ├─ no ──► that limit's status and class
                                       │
                                       ▼ yes
                 recovery turn (resumes the session, same workspace)
                                       │
       valid ──────────────────────────┼──► the call goes on (verify, completed)
       the same limit, the same thing ─┼──► that limit's status and class
       another limit ──────────────────┼──► recovered if a resume is left,
                                       │    else that limit's status and class
       any other end ──────────────────┴──► that turn's status and class
```

## Rules

### 1. A recovery turn follows a turn that a staleness limit ended

A turn is stale when a staleness limit is what ended it. A turn that
reported its own end before Agister ended it keeps that end (ADR-001
rule 6) and is not recovered.

A stale turn is followed by a recovery turn only when all of these hold:

- a resume is left in the call's budget (rule 5);
- the stale turn reported a session (rule 6);
- its process group has ended (ADR-001 rule 11), so a hung command no
  longer runs;
- the call is not cancelled, and time and cost are left (rule 7);
- the evidence was not sent before (rule 3).

Otherwise the call ends as it does today, with the limit's status and
class, and an event says why no recovery turn started. A recovery that
does not start spends no resume.

The budget is the call's, whichever turn went stale: the first turn, a
repair turn or a recovery turn. The workspace keeps what the stale turn
left; nothing is reset.

A recovery turn that ends validly is the call's latest turn. Its output
is the call's, and what follows is what follows any valid turn:
verification where the process declares it, or completion. When it stood
in for a repair turn, the verification loop goes on with its next run.
It is not a verification attempt.

### 2. Each limit has its evidence and its end

| Limit | The evidence Agister appends | Reached again on the same thing |
|---|---|---|
| `repeated_tool_calls` | the repeated call (tool and bounded input), how many times in a row, and the last result the runtime reported for it, if any | failed, budget exhausted |
| `tool_command` | the command, and how long it ran before Agister ended it | interrupted, timeout |
| `no_event` | that the turn was interrupted after the limit without an event | interrupted, timeout |

What the agent should do about it is the instruction's to say (rule 4):
take a different approach after a repeated call; not run a hung command
again unchanged, but bound it, make it non-interactive or skip it;
continue after a turn without events.

A turn without events is never treated as the agent's fault. Its message
says that the turn was interrupted and asks the agent to continue; it
makes no claim about what the agent did.

A stale verification run (`no_output`) takes no recovery turn. Rule 8
covers it.

### 3. The same evidence is never sent twice

A limit is recovered once per call for the same thing. The thing is:

- for `repeated_tool_calls`, the call: the same tool and the same input,
  by the SHA-256 digest of the whole input;
- for `tool_command`, the command: the same tool and input, likewise;
- for `no_event`, the limit itself.

A limit reached again on the same thing ends the call with that limit's
status and class, even when resumes are left. Sending the evidence again
would be a nudge without new facts.

A different limit, or the same limit on another call or command, is new
evidence. It is recovered if a resume is left. If the budget is spent,
the call ends with the status and class of the limit just reached, not
of the one recovered earlier.

Staleness is detected as before. A recovery turn is watched as any turn,
and its counts start from zero: a repeated call is reached again when it
is made the limit's number of times in a row in the recovery turn.

### 4. The message is the instruction and the evidence

`stale.recover.instruction` is what the agent is told. It is a setting,
like `verify.instruction` (ADR-001 rule 2, ADR-002 rule 1). The core
assembles the message from it and the evidence of rule 2, which names the
limit. The core adds no advice of its own. One instruction serves every
limit, so it says what to do for each.

### 5. The budget is a setting that only narrows

```yaml
stale:
  repeated_tool_calls: 5
  recover:
    max_resumes: 1
    instruction: >-
      Agister ended your previous turn at a staleness limit; the evidence
      follows. After a repeated call, take a different approach. Do not
      run a hung command again unchanged: bound it, make it
      non-interactive or skip it. After an interrupted turn, continue.
```

- **max_resumes:** how many recovery turns a call may take, over all its
  turns and all limits. Unset is 0: no recovery, as today.
- A policy sets it, and a process may only lower it, down to 0. A process
  value above its policy's, or above 0 where the policy sets none, is
  invalid, never clamped (ADR-001 rule 3). The caller has no override.
- An effective `max_resumes` above 0 needs an instruction: without one
  the settings are invalid, and `check` says so. The process's
  instruction, where it gives one, replaces the policy's: it is text, not
  a limit.
- The effective budget is recorded with the call's other limits.

### 6. Recovery needs a session to resume

A recovery turn resumes the session as a repair turn does (ADR-002
rule 4, amended below): by the session ID the runtime reported, with no
preset ID and no fork. For a continued call that is the session it
continued.

A call whose effective `max_resumes` is above 0 is refused before its
first turn (ADR-001 rule 7) when its agent's sessions may not be
continued or its adapter cannot resume, as a `verify.max_attempts` above
1 is. A process whose agent is fresh-only must lower `max_resumes` to 0.

A stale turn that reported no session cannot be resumed: nothing says
which session holds it. The call ends as today, with the limit's status
and class.

### 7. Every limit covers the recovery turn

- **Time:** a recovery turn runs under what is left of the call's
  timeout. With none left, it does not start.
- **Cost:** it receives what is left of the call's cost limit, as a
  repair turn does (ADR-002 rule 5). A killed turn may report no cost.
  If an earlier turn's cost is unknown while a cost limit is in effect,
  no recovery turn starts, as no repair turn does.
- **Staleness:** the call's staleness limits apply to it as to any turn.
- **Attempts:** resumes are a limit of their own. A recovery turn spends
  no verification attempt (`verify.max_attempts`) and no call attempt
  (`retry.max_attempts`).

### 8. A verification run without output is a failed attempt

A run that Agister ended at `stale.no_output` is a failed run of its
attempt. A repair turn may follow it under ADR-002's own conditions:
attempts left, a session, time and an enforceable cost, and a failure
that differs from the previous run's. The repair message is
`verify.instruction` with the command, how the run ended (no output for
the limit, then ended by Agister) and its bounded output, as for any
failed run.

- ADR-002 rule 6 holds: a run never repeats on content already checked.
- When no repair may follow such a run, the call ends as today:
  interrupted, timeout. A process with `verify.max_attempts` 1 therefore
  behaves as today.
- It spends verification attempts, not resumes, and does not depend on
  `stale.recover`: the attempts are a limit the process already declared.
- A run in the caller's worktree (ADR-022 rule 6) may have changed it
  before it was ended. Its content is named after the run as after any
  run, so what the command left is recorded on the run and is not taken
  for the repair turn's change.

### 9. Each recovery is a record

The run records each recovery turn as a record of its own:

- its number in the call;
- the stale turn it follows, with that turn's stale record: the limit,
  what went stale and when;
- the SHA-256 digest of the message sent;
- the session it resumed and the session the turn reported. They must
  match; a different one fails as a contract violation, as in ADR-002
  rule 4;
- the turn's usage, cost and timing;
- its outcome: completed (the turn ended validly), the same limit again,
  a different limit, or another failure.

The outcome is the recovery turn's, not the call's: a call may still fail
verification after a completed recovery. A call does not complete before
its recoveries are recorded. These records are what later tells whether
recovery works, per limit and per runtime.

### 10. No status or class is added

| What happened | Status | Failure class |
|---|---|---|
| a stale turn, and no recovery turn started | the limit's own | the limit's own |
| the same limit again on the same thing | the limit's own | the limit's own |
| another limit, and no resume left | that limit's own | that limit's own |
| a recovery turn failed, was lost or returned invalid output | that turn's own | that turn's own |
| a recovery turn reported a different session | as for a repair turn that does (ADR-002 rule 4) | the same |
| a `no_output` run that no repair follows | interrupted | timeout |

A limit's own status and class are those of the Context table. No field
of the node result exists only for recovery.

## Amendments to ADR-002

Rule 4 becomes:

> **4. Repair and stale recovery resume the call's own session in place**
>
> A call takes a further turn in one way only: it resumes its own
> session. A repair turn, after a failed verification run, and a recovery
> turn, after a turn that a staleness limit ended, both resume
> the provider session of the call's first turn, in the same checkout, by
> the session ID the runtime reported: the same resume mechanism as
> continuation (ADR-001 rules 5 and 12), with no preset ID and no fork.
> The node therefore has one session, and every turn appends to it. The
> evidence records the session each turn reported; a repair or recovery
> turn that reports a different session fails as a contract violation.
> This is not a continuation between calls: the call reads only its own
> state.
>
> It needs an agent whose sessions may be continued and an adapter that
> supports resume; otherwise a `verify` with `max_attempts` above 1, or
> an effective `stale.recover.max_resumes` above 0, refuses the call
> before the first turn (ADR-001 rule 7). A turn that reports no session
> cannot be repaired, and the node ends as budget exhausted; a stale turn
> that reports no session cannot be recovered, and the node ends with its
> staleness limit's status and class. A fresh-context attempt is not part
> of the node; it is an outer step's job.

Three more of its rules change in one point each. The rule in brackets
is this ADR's:

- ADR-002 rule 3: a turn that a staleness limit ended does not end the
  node when a recovery turn follows it; verification runs after a valid
  recovery turn as after any valid turn (rule 1).
- ADR-002 rule 5: the call's time and cost cover recovery turns as they
  cover repair turns; resumes are a limit of their own, apart from
  verification attempts and call attempts (rule 7).
- ADR-002 rule 8: a run ended at `stale.no_output` is a failed run; the
  call ends as interrupted, timeout only when no repair follows it
  (rule 8).

## Consequences

### Positive

- A repeated call, a hung command or a dropped turn can cost one message
  where it cost the node.
- Recovery reuses the resume mechanism: no new path into a session, and a
  resumed session can reuse the provider's prompt cache.
- The extra cost is bounded per call by a budget that only narrows, and
  by the call's own time and cost.
- A hung test is repaired like a failing one.
- The recovery records show, per limit and runtime, how often a resume
  ends validly.

### Negative

- A loop mostly means failure. Many recovery turns will end at the same
  limit, and each of them is paid for.
- A session resumed after its turn was killed holds a tool call without
  a result. Whether a runtime resumes it cleanly is the adapter's to
  prove; a resume that fails is recorded as another failure.
- A killed turn often reports no cost, so a call under a cost limit is
  recovered only where the runtime reports the cost of a turn it did not
  finish.
- The evidence of a repeated call needs its last result, which adapters
  do not report to the core today.
- A hang that is not the code's, such as a flaky test, goes to the agent
  as if it were (as in ADR-002).
- A policy with `max_resumes` above 0 refuses the processes whose agent
  is fresh-only until each lowers it to 0.
- Context grows by the recovery turn.

## Alternatives considered

- **Every limit ends the call:** kept as the default, rejected as the
  only behaviour. A turn that one fact could unblock fails the node.
- **A message without evidence** ("you seem stuck, try again"): rejected.
  It gives the model nothing it lacks.
- **Sending the same evidence again while resumes are left:** rejected,
  for the same reason.
- **A budget per limit:** rejected. One shared budget bounds what a call
  may spend on recovery, whatever goes stale.
- **A status or failure class for recovery:** rejected. It would give
  staleness a result shape of its own (ADR-001 rule 6).
- **Steering inside the running turn** (Claude Code's `--input-format
  stream-json`, the Codex app server's `turn/steer`): deferred. It is a
  runtime feature that changes how adapters run a turn. The recovery
  records decide whether it is worth that.
- **A fresh-context retry with a handoff summary:** deferred. It is an
  outer step (ADR-002 rule 4), for the workflow layer, which does not yet
  act on `retry.max_attempts`: the limit is only recorded.
- **Escalation to the advisor** (ADR-007): rejected. A stuck run is not a
  build question. Ending with a clear class lets a workflow route it to
  the owner.
- **A circuit breaker across calls**, such as stopping calls of a runtime
  that keeps going `no_event`: deferred. Calls are independent (ADR-001
  rule 12), and no record yet shows the need.
- **Changing how staleness is detected:** out of scope. The limits and
  what reaches them are unchanged.

## Explicit non-decisions

The recovery record's field names and its outcome's values; the exact
form of the evidence in the message and the size its quoted input and
result are bounded to; whether the message repeats the stale turn's own
prompt where the session may not hold it; a service ceiling on
`max_resumes`; how `check` and `process show` display the budget; any
action on the recovery records, such as turning recovery off for a
runtime.
