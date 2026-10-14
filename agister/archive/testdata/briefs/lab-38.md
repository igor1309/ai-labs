# LAB-38: worktree changes from two Agister processes take turns

LAB-29 made one process's worktree adds and removes in a repository run one
at a time (`git.Worktrees` in `agister/internal/adapters/git/git.go`). Two
`agister run` processes in one repository still race: a `git worktree add`
can read another's half-written `.git/worktrees/*/commondir` and die
("failed to read …/commondir: Undefined error: 0").

The owner ruled: processes take turns through a lock file under Agister's
own state directory (the home, `config.Home`), one per repository, keyed by
the git common directory. ADR-001 records this as a deliberate exception.

## Build

- `Worktrees` also holds a per-repository lock file under
  `<home>/locks/worktrees/`, named by a digest of the resolved, absolute git
  common directory (the key the in-process lock already uses). It takes the
  file lock after the in-process lock and releases it before; the worktree
  command runs while both are held.
- The file lock is an exclusive advisory lock (`flock`) on that file, taken
  without blocking and retried while the context lasts, so a cancelled
  context ends the wait with its error and nothing runs. The wait between
  attempts is a seam on `Worktrees` (tests make it immediate and count it);
  `Waits` is still told once when a command finds the lock held, whichever
  lock it is.
- The lock directory is created if missing. The lock file stays after use;
  it is empty and holds no state. Nothing is written in the repository or
  its `.git`; no git config, no prune.
- `NewWorktrees` takes the lock directory. The composition root
  (`agister/cmd/agister/main.go`, `wire`) passes `<config.Home>/locks/worktrees`.
  Update every caller and test that builds one.
- ADR-001, section 12 "Calls are independent": add a third deliberate
  exception, stated as a rule, not a story: concurrent calls in one
  repository take turns, through a lock file per repository under Agister's
  state directory, for the git worktree commands that add and remove their
  checkouts; the lock file holds no state and no call reads another's.
  Update the `Worktrees` doc comment to match (it now holds back other
  processes too).

## Tests

- Two `Worktrees` values over one lock directory stand for two processes.
  Their `Git` seams record entry and exit; with commands from both started
  together on one repository (one held until the other is waiting, observed
  through `Waits`), the commands never overlap.
- Two repositories do not share a file lock: a command in one runs while a
  command in the other is held.
- A context cancelled while a command waits on the file lock held by the
  other coordinator ends with the context's error, and its command never runs.
- The wiring test (`agister/cmd/agister/wiring_test.go` or the nearest)
  shows the composition's coordinator uses a lock directory under the home.

Tests are committed and deterministic: no wall-time waits beyond a hang
guard, no mutation or revert checks. Use the quiet test commands from
`agister/AGENTS.md`; report each with its exit code and final line, and list
every file you changed.
