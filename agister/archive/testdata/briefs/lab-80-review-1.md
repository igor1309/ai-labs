# LAB-80 review round 1: fixes

## Goal

`agister/testdata/briefs/lab-80-goal.md`

## Covers

- Done when 1 to 5, as the fix items below and the goal's new decisions
  require.

## Acts on

The judgement of `code_review` workflow run `20261007T161405Z-2873b3`
(base `9c11c9d1~1`), its five `fix` items, as written:

1. **If exit observation fails, watchers can still signal the group after the leader is reaped (Runtime.Run, Commands.Run, Version)** (1#1, 2#1, 3#1, 4#1, 5#1). In Runtime.Run, Commands.Run and Runtime.Version, when Exited fails: do any final cleanup while the leader is still unreaped, then disable watcher signals under the shared signal/reap lock before calling Wait. Add a deterministic fake-process test whose Wait pauses after reaping. Fire the injected timer or cancel during that pause, wait for the watcher to finish (through the timer's stop callback), and assert that no signal follows.
2. **Process-table enumeration gates the group SIGKILL, so a failed or inconsistent scan skips cleanup** (1#2, 3#2, 5#2). Send the group SIGKILL while the unreaped leader still reserves the group ID, whatever the scan returns. Keep enumeration only for classification, and report a failed or uncertain scan as unknown, not as no-leftovers. Add an injected discovery/enumeration seam, with tests that assert the kill is attempted when discovery fails and when membership changes during the scan.
3. **Version turns off its timeout and cancel kill before killing descendants, so a descendant holding stderr hangs it** (3#3). In Version's successful-observation block, kill the remaining group under the mutex before disabling signals and reaping. Add a regression test with a descendant that holds the stderr pipe, using the existing Process seam.
4. **New Exec contract tests' cleanup signals the saved group ID after the test has reaped its leader** (2#2). Replace the fixture's cleanup with process-owned cleanup that disarms group signalling before reaping. Keep kill-and-reap cleanup for failures that happen before that point. Add a deterministic lifecycle test with an injected signal operation.
5. **The no-leftovers contract test depends on a real 30-second wall-clock timer** (2#3). Pass Exec and a manual timer to Runtime explicitly in this test. Leave the test process's deadline as the hang guard.
6. **The owner's decisions on items 5#3 and 5#4** (the goal's
   Decisions). `Commands.Run` keeps killing before reaping without
   reporting the result: leave `CommandResult` as it is. Keep
   `LEFTOVER_CLEANUP_UNKNOWN`, and add it to the process events
   `agister runs watch` prints (`agister/internal/cli/cli.go`), with a
   test.

## Constraints

- gokit depends on the standard library only (ADR-019).

## Open

None.
