# LAB-43, step 1: ADR-023, recovery after a staleness limit

Write one new ADR, `agister/docs/adr/023-a-stale-call-is-resumed-once.md`
(rename it if a better title fits the ADR naming), and add it to the ADR
list in `agister/README.md`. Write no code and change no settings in this
step: the code follows in a second run, after the ADR is reviewed.

The issue calls it "ADR-008"; that number is taken. It is ADR-023.

## Context

LAB-9 made Agister end a call at a staleness limit
(`agister/internal/app/stale.go`, `internal/domain/run/stale.go`,
`internal/domain/definition/limits.go`, and `no_output` in
`internal/app/verify.go`). Today every staleness limit ends the turn.
LAB-41 researched what should follow and recommends a small per-kind
ladder: **resume once with an evidence-bearing recovery message, then
end.** A fresh-context retry stays an outer step, as ADR-002 says.

What the research found, for the ADR's context and drivers:

- Prior art nudges once, then stops: OpenHands nudges once on an
  action-error streak, then sets `STUCK`; Aider reflects at most 3 times;
  CrewAI sends one "final answer" nudge at the cap; LangGraph and AutoGen
  only end. Nobody ships an automatic fresh-context retry inside the stuck
  node; where one exists (SWE-agent `RetryAgent`, Anthropic's long-running
  harness) it is an outer layer with a handoff.
- A loop mostly means failure (SWE-smith: a repetitive run of 10 or more
  corresponds to an 89% failure probability), and "you seem stuck" alone
  does not help (Huang et al., *LLMs Cannot Self-Correct Reasoning Yet*):
  a recovery message must carry new external evidence.
- Agister's adapters run one-shot `claude -p` and `codex exec`, so there
  is no live channel into a session. Interrupt and resume is Agister's
  practical nudge: it reuses ADR-002's resume mechanism (the same session
  ID, checked), is cheap on the prompt cache, and the kill already ends a
  hung tool.
- Supervision practice (Erlang/OTP, AWS, Google SRE): bound restarts, then
  escalate; retry only transient faults, with a small cap.

## What the ADR decides

1. **The ladder**, one resume budget per call, shared across kinds:
   - `repeated_tool_calls`: end the turn, then resume with a message that
     quotes the repeated call, its count and its last result, and asks for
     a different approach. If the same call (same input SHA-256) repeats
     again, end with `budget_exhausted`.
   - `tool_command`: end the turn, then resume with a message that names
     the command, how long it ran, and the instruction not to run it again
     unchanged (bound it, make it non-interactive, or skip it). If the same
     command hangs again, end with `timeout`.
   - `no_event`: end the turn, then resume once with "your previous turn
     was interrupted; continue." A second `no_event` ends with `timeout`.
     It is never treated as the agent's fault and never retried with a
     fresh context.
   - `no_output` (verification): stop ending verification outright. Count
     the run as a failed attempt that a repair turn may fix, with the
     output tail and "no output for X" as its evidence, while
     `verify.max_attempts` remain. Never rerun the same content (ADR-002
     rule 6). This one spends verification attempts, not the resume
     budget.
2. **Settings** (ADR-001 rule 3: limits only narrow).
   `stale.recover.max_resumes`: unset or 0 by default, which keeps today's
   behaviour (end). A policy sets the ceiling and a process may only lower
   it; widening is invalid, never clamped. `stale.recover.instruction`:
   the text the agent is told, a setting like `verify.instruction`;
   Agister appends the stale evidence to it. A process whose effective
   `max_resumes` is above 0 refuses the call before the first turn when
   the agent's sessions may not be continued or the adapter cannot resume,
   as `verify.max_attempts` above 1 does today.
3. **Amendment to ADR-002 rule 4**: one mechanism, resuming the call's own
   session, serves both repair and stale recovery. Say exactly how the
   rule reads after the amendment. Every limit still covers the whole call
   (ADR-002 rule 5): the recovery turn runs under the remaining time and
   cost.
4. **Evidence**: each recovery is its own record. It names the stale
   record that caused it, the recovery message's digest, the resumed
   session (which must match; a different one fails as a contract
   violation, as in ADR-002 rule 4), what that turn cost, and its outcome:
   completed, the same limit again, a different limit, or another failure.
   These records are what later tells whether recovery works.
5. **No new status or failure class.** The classes are the ones a stale
   end has today.
6. **Deferred, with the reason for each** (alternatives considered):
   - live in-session steering (Claude Code `--input-format stream-json`,
     Codex app-server `turn/steer`): a later runtime feature, decided on
     the recovery evidence;
   - a fresh-context retry with a handoff summary: an outer step, a
     separate issue once the workflow layer consumes `retry.max_attempts`,
     which today is recorded only;
   - escalation to the advisor (ADR-007): a stuck run is not a build
     question; ending with a clear class lets the workflow route it to the
     owner;
   - cross-call circuit breakers, such as one runtime repeatedly going
     `no_event`;
   - any change to LAB-9's detection rules.

Where the points above leave a case open, decide it in the ADR and say
so: what "a different limit" does when the budget is spent (it ends, with
that limit's class); what a stale turn that reported no session does (it
cannot be resumed and ends as today); whether a stale repair turn may be
recovered (the budget is the call's, whichever turn went stale).

## Constraints

- Read ADR-001, ADR-002 and the newest ADRs first, and write in their
  form: header fields, Context, Decision drivers, Decision, numbered
  Rules, the amendment section. ADRs reference only earlier ADRs.
- Plain, short sentences, as the existing ADRs.
- The ADR records LAB-41's research in its own words; do not link the
  issue tracker as its source of truth.

List every file you changed.
