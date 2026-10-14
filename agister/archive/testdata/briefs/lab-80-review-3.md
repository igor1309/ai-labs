# LAB-80 review round 3: fixes

## Goal

`agister/testdata/briefs/lab-80-goal.md`

## Covers

- Done when 1 and 2, as the fix items below require.

## Acts on

The judgement of `code_review` workflow run `20261007T172023Z-809a09`
(base `9c11c9d1~1`), its two `fix` items, as written:

1. **Test observation-error propagation through the real leader.Exited adapter** (2#1). Add a leader-level regression test in leader_internal_test.go whose observer returns a sentinel error. Assert that Exited preserves the error, does not reap, and leaves Signal on the unobserved branch. Use the existing observe, kill, others and reap callbacks.
2. **Keep an ESRCH observation error separate from the cleanup kill's ESRCH** (3#1). Keep the observation error separate in Runtime.Run's classification and always report it as LEFTOVER_CLEANUP_UNKNOWN. Apply the ESRCH exemption only to the classified Signal result. Extend the existing unobserved-process test with plain and wrapped ESRCH observation errors.

## Constraints

- The Linux code stays dropped (the goal's Decisions).
- gokit depends on the standard library only (ADR-019).

## Open

None.
