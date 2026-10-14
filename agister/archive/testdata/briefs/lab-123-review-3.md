# LAB-123 review round 3: fixes

## Goal

`agister/testdata/briefs/lab-123-goal.md`

## Covers

- Done when 3, as the fix items below require.

## Acts on

The judgement of `code_review` workflow run `20261007T213927Z-21fb29`
(base `origin/trunk`), its two `fix` items, as written:

1. **The simulated killed owner still runs its background reaper** (2#1). In the first composition of the reap_test.go integration test, disable the Decorate wrapper so the simulated killed owner's Submit starts no background recovery, as the second composition already does.
2. **Cancellation coverage exercises the run wait but not the turn wait** (2#2). Add a deterministic test in reap_test.go. Using the existing probingAdopter, OnWaiting and started cleanup helper, keep the probing adopter's scan blocked, cancel ReapRun through OnWaiting, and assert that it returns cancelled before the scan is released.

## Constraints

- Item 1#1 of the same judgement is with the owner: leave adoption's
  lock handling as it is.

## Open

None.
