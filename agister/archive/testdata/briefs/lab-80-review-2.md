# LAB-80 review round 2: fixes

## Goal

`agister/testdata/briefs/lab-80-goal.md`

## Covers

- Done when 1 to 5, as the fix items below require.

## Acts on

The judgement of `code_review` workflow run `20261007T165254Z-e9f685`
(base `9c11c9d1~1`), its three `fix` items, as written:

1. **Observation failure disables timeout and cancellation while the child is still running** (1#1, 2#1, 3#1, 4#1, 5#1). On the Exited-error path in Runtime.Run, Commands.Run and Runtime.Version, SIGKILL the still-reserved group under the signal/reap lock before disabling signals and starting the reap. Keep the observation error so the cleanup is still classified as unknown. Add a deterministic test in exit_order_test.go covering all three callers: Exited fails while the child is still alive, and Wait returns only after a signal.
2. **Linux stat-read errors are treated as process disappearance, so failed discovery classifies as no leftovers** (3#3, 4#2). Skip only read errors that show the process has disappeared, and propagate any other error so Signal reports cleanup unknown. Add a proc-root or read seam and a regular regression test that uses a temporary proc fixture with a denied stat read.
3. **Cleanup-event tests do not assert the group and error payload** (2#2). Add a Sink that records payloads, and in exit_order_test.go assert the process group and the observation or signalling error in the emitted cleanup events.

## Constraints

- Item 3#2/5#2 (how Linux classifies a descendant that becomes a zombie
  after the kill) is the owner's and open: do not change the Linux
  snapshot classification beyond item 2.
- gokit depends on the standard library only (ADR-019).

## Open

None.
