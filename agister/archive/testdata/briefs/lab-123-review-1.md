# LAB-123 review round 1: fixes

## Goal

`agister/testdata/briefs/lab-123-goal.md`

## Covers

- Done when 1, 3 and 4, as the fix items below require.

## Acts on

The judgement of `code_review` workflow run `20261007T211031Z-931f60`
(base `origin/trunk`), its six `fix` items, as written:

1. **Unrelated background cleanup can use up a writer's recovery deadline** (1#1, 3#1). Coordinate in-flight recovery by run ID instead of one instance-wide turn. Keep a short critical section for lock probing and adoption, keep same-run exclusion and caller cancellation, and keep legacy checkout protection intact. Add a deterministic test that holds cleanup of run A while a holder recovers run B, and keep the same-run waiting test.
2. **No test proves synchronous recovery of a run abandoned before its runtime is recorded** (2#1). Add a normal t.TempDir test in hold_reap_test.go. It abandons an unfinished writer with empty Effects, then asks for another writer hold without running the background reaper. Assert admission, the terminal lost/abandoned record, and both reap events.
3. **Missing LAB-123 notes on the synchronous-reap departure and the surfaces left unchanged** (1#2, 5#3). Add a LAB-123 entry to agister/docs/settings-architecture/notes.md. It should name the synchronous-reap exception to ADR-001 invariant 11 and say how it relates to ADR-025 rule 4 and ADR-022. It should also say which done-gate surfaces (settings-architecture, Pages) needed no change and why. Leave the ADRs unedited.
4. **New ReapRun unit tests run against the real 30-second deadline** (2#2). Give the new single-run unit tests an explicit, test-controlled ReapContext. For the deadline assertion, use a fake context with a supplied deadline instead of time.Until.
5. **Blocked-reaper tests do not release or join their goroutines on failure paths** (2#3). Before starting the goroutines, register cleanup that does an idempotent release and joins through a separate completion channel. Do this in both reap_test.go and hold_reap_test.go.
6. **Adoption appends EFFECTS_REAPED onto a torn event tail, so the event cannot be read** (3#2). Under the acquired owner lock, have filesystem adoption repair an incomplete final event before appending, keeping all complete events. Cover it with a regular t.TempDir test in fsruns_test.go that contains the torn input.

## Constraints

- Items 5#1 and 5#2 of the same judgement are with the owner: leave the
  behaviour they ask about as it is.

## Open

None.
