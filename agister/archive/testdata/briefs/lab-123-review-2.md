# LAB-123 review round 2: fixes

## Goal

`agister/testdata/briefs/lab-123-goal.md`

## Covers

- Done when 1 and 3, as the fix items below require.

## Acts on

The judgement of `code_review` workflow run `20261007T212720Z-0cbbf7`
(base `origin/trunk`), its four `fix` items, as written:

1. **Torn-tail repair deletes a complete final event that lacks a newline and reuses its sequence number** (3#1). Preserve a valid final event and append its missing newline; truncate only an incomplete event. Extend the temp-directory adoption test in fsruns_test.go to verify preservation, continued numbering, and observation after the previously delivered sequence.
2. **ReapRun persistence failures (Append/Finish) are not tested** (2#1). Add ReapRun cases using the existing failing-handle spy (adopterSpy.failing with recorderSpy.appendErr/finishErr) for both persistence failures and assert that the error reaches the caller.
3. **The coordination guard between the abandoned-run scan and adoption has no regression test** (2#2). Add a deterministic adopter fake that holds a temporary probe during Abandoned and reports ErrRunOwned if Adopt overlaps it; verify that ReapRun waits and then recovers the run (the existing OnWaiting hook can drive the wait).
4. **The composition test still uses the real 30-second recovery deadline** (2#3). Set the shared reaper's existing ReapContext seam to a test-controlled context in this test before Submit.

## Open

None.
