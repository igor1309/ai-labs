# LAB-43: Agister: recover a stale call — resume once with evidence, then end

The issue as filed, then what changed since. The ADR the issue calls ADR-008 is ADR-024: 008 and 023 were taken. The owner confirmed that a silent verification run is a failed attempt whenever `verify.max_attempts` allows a repair, not gated on `stale.recover`. Deferred, as separate issues: LAB-107 (deny a repeated tool call through hooks), LAB-108 (touched paths and denials as evidence), LAB-109 (path and command scope through the tool gate), LAB-110 (fresh-context retry with a handoff).

## Context

LAB-41 researched what Agister should do once LAB-9 finds a call stale. Today every staleness limit ends the turn. The research recommends a small per-kind escalation ladder: **resume once with an evidence-bearing recovery message, then end.** A fresh-context retry stays an outer step, as ADR-002 already says. The full findings and sources are in LAB-41's result comment.

## Scope

1. **ADR-008: recovery after a staleness limit.** Record the ladder below, why live in-session steering is deferred, and why fresh-context retry stays outside the node. It amends ADR-002 rule 4 so that one mechanism, resuming the call's own session, serves both repair and stale recovery.
2. **Settings** (ADR-001 rule 3: limits only narrow). Add `stale.recover.max_resumes`. It is unset or 0 by default, which keeps today's behaviour (end). A policy sets the ceiling and a process may only lower it. Add `stale.recover.instruction`, the text the agent is told, as a setting like `verify.instruction`; Agister appends the stale evidence to it. A process that declares `max_resumes > 0` refuses the call when the agent's sessions may not be continued or the adapter cannot resume, as `verify.max_attempts` does today.
3. **Ladder** (one resume budget per call, shared across kinds):
   - `repeated_tool_calls`: end the turn, then resume with a message that quotes the repeated call, its count and its last result, and asks for a different approach. If the same call (same input SHA-256) repeats again, end with `budget_exhausted`.
   - `tool_command`: end the turn, then resume with a message that names the command, how long it ran, and the instruction not to run it again unchanged (bound it, make it non-interactive, or skip it). If the same command hangs again, end with `timeout`.
   - `no_event`: end the turn, then resume once with "your previous turn was interrupted; continue." A second `no_event` ends with `timeout`. It is never treated as the agent's fault and never retried with a fresh context.
   - `no_output` (verification): stop ending verification outright. Count the run as a failed attempt that a repair turn may fix, with the output tail and "no output for X" as its evidence, while `verify.max_attempts` remain. Never rerun the same content.
4. **Evidence**: each recovery is its own record. It names the stale record that caused it, the recovery message's digest, the resumed session (which must match), what that turn cost, and its outcome. The outcome is one of: completed, the same limit again, a different limit, or another failure. These records are what later tells us whether recovery works.
5. **Tests**: one per kind for each of these cases: resume used, the same staleness again ends the call, `max_resumes: 0` ends as today, a process widening the ceiling is rejected, and an adapter without resume is refused.

## Non-goals

- Live in-session steering: Claude Code `--input-format stream-json` or the Codex app-server `turn/steer`. This would be a later runtime feature, decided on the recovery evidence.
- Fresh-context retry with a handoff summary. It is an outer step: a separate issue once the workflow layer consumes `retry.max_attempts`, which today is recorded only.
- Escalation to the advisor (ADR-007). A stuck run is not a build question. Ending with a clear class lets the workflow route it to the owner.
- Cross-call circuit breakers, e.g. one runtime repeatedly going `no_event`.
- Any change to LAB-9's detection rules.
