# LAB-123: a writer whose owner died no longer blocks its worktree

## Intent

Multica LAB-123, with the exploration comment of 2026-10-07. A writer run
whose `agister` process was killed (SIGKILL, after or before
ABORT_REQUESTED) is left unfinished. The next writer call into the same
worktree is refused by `Holder.writers` (`agister/internal/app/hold.go`),
which refuses any run with `FinishedAt == nil` and never asks whether the
run's owner is alive. The reaper decides by the owner lock
(`fsruns.Store.Adopt`), but it runs in the background after `Submit`
returns and nothing waits for it, so a refused call exits before it
finishes. The worktree stays blocked until some longer call's reap
finishes the run.

## Done when

1. A writer call that meets an unfinished run in an overlapping
   directory, whose owner lock is free, reaps that run before deciding:
   it adopts the run and ends its effects with the reaper's per-run step
   (one implementation, not a copy), so the run gets its terminal
   `lost/abandoned` result and `EFFECTS_REAPED` event in its record, and
   the call is then admitted. The call's own events say it reaped the
   run.
2. The call is still refused when the run's owner holds the lock (the
   owner may still write), and when the reap leaves a process not known
   to have ended, with today's reasons.
3. Tests with `t.TempDir()` homes show each case:
   - a run abandoned as a SIGKILLed owner leaves it (`Store.Abandon`, after
     ABORT_REQUESTED), then a writer call into the same worktree is
     admitted, and the abandoned run's record carries the terminal
     result;
   - an owned unfinished run still refuses;
   - a reap that leaves its process refuses.
4. The done gates: the caller skill (`agister/skills/agister/SKILL.md`),
   `agister/README.md`, `agister/docs/settings-architecture/` and
   `agister/pages/` say the same where they describe a refused writer or
   reaping. ADR-025 rule 4 and ADR-022 are read: if the change departs
   from a rule, say so in the notes instead of editing the ADR. Say in
   the notes which surfaces needed no change and why.

## Out of scope

- Surviving a SIGKILL of the `agister` process itself, or making an
  abort finish faster for a slow runtime.
- Waiting for the background reap before the process exits.

## Sources

- Multica LAB-123 and its exploration comment; ADR-022, ADR-025.
- `agister/internal/app/hold.go`, `reap.go`, `background.go`;
  `agister/internal/adapters/fsruns/fsruns.go`.

## Decisions

- 2026-10-07, owner: take the fix direction of the exploration comment.

## Open

None.
