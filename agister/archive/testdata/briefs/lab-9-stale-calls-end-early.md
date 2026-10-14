# LAB-9: a stale agent turn or verification run ends before its timeout

An agent turn ends early only at the call's timeout, and a verification
run (ADR-002) only at its own. Neither tells slow from stale, so a timeout
long enough for honest work (45 minutes for an implementer, 15+ for a
verification run) is the only thing that ends a hang. Stale means: an
agent that emits nothing; a tool command that hangs; an agent repeating
the same failing step; a script that stops producing output.

## Scope

Staleness checks Agister owns, declared by the policy (limits only narrow,
ADR-001 rule 3):

- time since the last runtime event, for an agent turn;
- time since the last output, for a verification run;
- the duration of the current tool command;
- repeated identical tool calls.

A stale call ends early. Its evidence says what went stale and when; the
status and error class are existing ones (no staleness-only class). The
runtime's process group, or the verification command's, is killed and
cleaned up like any other ending (ADR-001 rule 11).

## Acceptance

- A stale agent turn and a stale verification run each end before their
  timeout, with the cause recorded, in tests using an injected clock.
- A repeated-identical-tool-call case ends the turn, with the repeated
  call recorded.
- `agister check` rejects a staleness limit above the policy's timeout;
  `process show` prints the effective limits.
- A long but live turn (events keep arriving) is not ended early.

## Non-goals

Judging the quality of an agent's work; flake handling; a fresh-context
retry after a stale end.

## Constraints

- Read ADR-001 and ADR-002 first and keep their rules: the core knows no
  runtime's event format (the runtime adapter reports events and tool
  calls through its contract); each component declares the interfaces it
  requires (rule 13); the supervisor already has an injectable timer
  (`supervisor.Commands.Timer`): reuse that idiom for the clock.
- A policy without staleness limits behaves exactly as today. Do not add
  limits to the repository's or the shipped policies in this change,
  except one shipped example that shows the fields, if the schema docs
  need it.
- Tests are committed and deterministic: injected clock, no wall-time
  waits, no mutation or revert checks (root `AGENTS.md`, "Verifying
  fixes").
- If an existing ADR must change to allow this (a new policy field, a new
  evidence field), say so in your notes and make the smallest ADR edit.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
