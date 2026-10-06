# LAB-110, step 1: ADR-025, a fresh attempt with a handoff

Write one new ADR, `agister/docs/adr/025-a-stale-call-is-retried-fresh-with-a-handoff.md`
(rename it if a better title fits the ADR naming), and add it to the ADR
list in `agister/README.md`. Write no code and change no settings in this
step: the code follows in a second run, after the ADR is reviewed.

## The issue (LAB-110)

`retry.max_attempts` is composed and recorded but nothing consumes it.
When a call ends stale after ADR-024's single resume, or its context is
polluted by a long loop, the only way on is a new call made by hand.
ADR-002 rule 4 and ADR-024 keep a fresh-context retry out of the node:
it is an outer step, and it needs a handoff, not a replayed transcript.

Done when the ADR is accepted and, in the code step, a test shows a call
that ended stale retried once in a fresh session with the handoff, and a
deterministic failure not retried.

Prior art, for the Context (ADR-002 and ADR-024 already cite it; say it
in this ADR's own words): SWE-agent's retry agent and Anthropic's harness
for long-running work restart with a fresh context and a handoff, outside
the stuck step; none replays the transcript. Supervision practice
(Erlang/OTP, AWS, Google SRE): bound the restarts, retry only faults that
may pass, never a deterministic one.

## What the ADR decides

Read the code before you write, and where a point below does not fit it,
decide the nearest thing that does and say so in the ADR.

1. **Who retries.** A step above the call, in the application layer, not
   the node and not the CLI: it starts a call, reads the finished run's
   record, and may start another call. `agister run <process>` and a
   workflow's nodes both start ordinary calls, so both get it. The node
   (ADR-001, ADR-002) is unchanged: it never learns it was a retry apart
   from its prompt and its record's link.
2. **Each attempt is its own run**, an ordinary call in a **fresh
   session**: no resume, so a fresh-only agent can be retried. Its record
   names the run it retries and its attempt number; the earlier run's
   record is not edited. The caller gets the last attempt's result and
   run ID; a workflow node records the last attempt's run. Events say
   that a retry started, or why none did.
3. **Which ends are retried.** Only a call that a staleness limit ended
   (ADR-024 rule 10: the limit's own status and class, with the stale
   record on the run): `no_event`, `tool_command`,
   `repeated_tool_calls`, whether or not a recovery turn ran first.
   Nothing else is retried: not a refusal or invalid settings, not
   `auth`, `rate_limited`, `invalid_output`, a cost limit reached, a
   failed verification, the call's own timeout, a cancellation, a lost
   run, or a `no_output` verification run that no repair followed (the
   same command would hang again). Say for each group why: a
   deterministic failure fails again, and the others need something a
   fresh context does not give (a backoff, a credential, the owner).
4. **Never the same thing twice.** When the retry ends at the same limit
   on the same thing (ADR-024 rule 3's identity: the same tool and input
   digest; for `no_event`, the limit itself), no further attempt starts,
   even when attempts are left.
5. **The handoff is assembled from the records, not written by a
   model.** The new attempt gets the same resolved inputs as the first
   (the same revision identity and values, not resolved again), and a
   handoff the core assembles:
   - `retry.instruction`, a setting like `verify.instruction` and
     `stale.recover.instruction` (ADR-001 rule 2);
   - why the earlier attempt ended: its status and class, its stale
     record, and its recovery records (what limit each followed and its
     outcome);
   - that the earlier attempt's changes are in the checkout, and which
     paths they touch.
   No transcript, no model-written summary: say why (a summary is a
   model's claim; the records are facts, and a replayed transcript
   brings the pollution back).
6. **The changes so far are carried.** For a call with a checkout of its
   own, the earlier attempt's `changes.patch` is applied, uncommitted, to
   the new attempt's checkout, by the mechanism a continuation uses
   (ADR-013), so the last attempt's patch is cumulative from the
   revision. A patch that cannot be carried means no retry.
7. **What is not retried by kind of call.** A call that continues a
   session (`--continue`): the caller asked for that session. An
   in-place call (ADR-022): the worktree is the caller's and holds the
   failed attempt's changes, so a fresh call would be refused. Decide
   both this way unless the code shows a clean way; say what the caller
   does instead.
8. **Settings.** `retry.max_attempts` composes exactly as today (the
   service ceiling, policy, process may only narrow; the first attempt
   is attempt 1; unset is 1, so nothing changes for settings that do not
   ask). An effective value above 1 needs `retry.instruction`: without
   it the settings are invalid and `check` says so; a process's
   instruction replaces its policy's.
9. **Limits.** Each attempt is a call under the call's own effective
   limits (timeout, cost, staleness, verification attempts, resumes),
   each recorded on its own run. The worst case is therefore
   `max_attempts` times the call's limits; say so under Negative. A
   cancellation of the caller stops the step: no attempt starts after
   it.
10. **No status or class is added.** The result is the last attempt's.
11. **Deferred or rejected, with the reason for each**: retrying
    `rate_limited` (needs a backoff and a clock, another decision);
    retrying `context_overflow` (the prompt itself may not fit: without
    a record that separates a long loop from a too-large input it is a
    deterministic failure); a model-written handoff summary; a retry
    inside the node (ADR-002 rule 4); a retry node in the workflow
    graph (ADR-003 has fan-out and a join only); a budget shared across
    attempts.

Say exactly which sentences of earlier ADRs this one amends, if any (the
ADR-024 alternative "the workflow layer, which does not yet act on
`retry.max_attempts`", ADR-002 rule 5's "call attempts").

## Constraints

- Read ADR-001, ADR-002, ADR-003, ADR-013, ADR-022 and ADR-024 first,
  and write in their form: header fields, Context, Decision drivers,
  Decision with a diagram, numbered Rules, amendments, Consequences,
  Alternatives considered, Explicit non-decisions. ADRs reference only
  earlier ADRs.
- Plain, short sentences, as the existing ADRs.
- Do not link the issue tracker as the source of truth.

List every file you changed.
