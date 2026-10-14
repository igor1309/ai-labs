# LAB-18: a reaped continuation leaves the session-cost baseline unknown

A review finding, never ruled on; line numbers are from when it was raised
and may have moved. Confirm it in the code before fixing; if it does not
hold, say so and change nothing.

`LatestTotals` (`agister/internal/domain/run/session.go`) skips a finished
record with no saved turn, treating it as a refusal that never reached the
runtime. Reaping produces that same shape for a run whose runtime process
started but whose host died before the returned turn was saved
(`app/calls.go` records the process start before the turn; `app/reap.go`
finishes the record as abandoned with no turn). So:

A records a cumulative session cost of $1. B continues A and adds $1, but
its host dies before saving the turn and B is reaped. C continues A and
adds $1 more; the provider reports $3 cumulative. Agister uses A's $1 as
the baseline and reports C's own cost as $2 instead of unknown.

Tell a refusal before the runtime started apart from a run that started a
runtime process and has no saved totals; the latter leaves the baseline,
and so the next continuation's own cost, unknown. Use what the record
already holds (e.g. the recorded process) rather than a new field, unless
that cannot tell them apart.

Prove it with regular tests on the domain function and, where the app
wires it, through the existing app seams.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
