# LAB-13 and LAB-16: the Codex cost lookup stays within the turn

After a Codex turn, `Runner.cost` (`agister/internal/adapters/runtime/codex/codex.go`)
runs `ccusage codex session --json` through `CCUsage`, which gives itself a
fresh one-minute timeout and uses a plain `exec.CommandContext(...).Output()`.
Two review findings, never ruled on; confirm each in the code before fixing:

- **LAB-13:** the lookup runs outside the turn's time budget. The turn's
  timeout is enforced by the supervisor's timer, which does not cancel the
  context `cost` gets, so a turn that timed out still waits up to another
  minute for the lookup, keeping the call and its checkout alive past the
  configured limit.
- **LAB-16:** cancellation kills only the `ccusage` launcher. A descendant
  that keeps stdout open (the installed launcher spawns a child with
  inherited stdio) keeps `Output` waiting past both cancellation and the
  minute, so `RunTurn` does not return and the checkout is not released.

Make the lookup part of the turn: it gets only what is left of the turn's
timeout, and is supervised as the runtime process is (its process group
ended on timeout or cancellation, pipe draining bounded), using the
existing supervisor (`agister/internal/adapters/runtime/supervisor`) rather
than a second mechanism. A lookup that fails, times out or is cancelled
leaves the cost unknown and changes nothing else about the turn.

Regular tests, through seams (a fake `ccusage` or an injected clock/timer,
no real waiting on wall time to pass): a timed-out turn's lookup does not
outlive the turn's timeout; cancelling the call during the lookup returns
promptly even when a child of the lookup keeps stdout open; a failed
lookup leaves the cost unknown; a normal lookup still sets the cost.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
