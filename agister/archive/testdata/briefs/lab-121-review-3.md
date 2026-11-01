# LAB-121 review round 3: fixes

## Goal

`agister/testdata/briefs/lab-121-goal.md`

## Covers

- Done when 1 to 6, as the fix items below require.

## Acts on

The judgement of `code_review` workflow run `20261007T132418Z-3af25c`
(base `87c901a4`), its five `fix` items, as written:

1. **Join the runtime watcher before releasing the run for export** (3#1). Make supervisor.Runtime.Run join its timeout/cancellation watcher before it returns runtime evidence. Add a deterministic regression test that uses the existing fake process, timer and callback collaborators, and keep those seams.
2. **Repeat-export tests do not prove artifact verification of an existing copy** (2#1). Add a normal test where the source and the existing destination hold identical artifact bytes that both disagree with the recorded digest. Assert a failure that names the artifact and an unchanged destination.
3. **No test proves that the filesystem adapter actually syncs staged files** (2#2). Give synced a narrow injected file collaborator (Sync/Close), and add adapter unit tests for a Sync failure: the error propagates and the file is still closed on that path.
4. **Ownership tests leave held locks behind on assertion failures** (2#3). Register read.Release immediately after a successful Hold, before checking its state or taking another read. Register letGo immediately after a successful Create/Adopt in the new tests that currently rely on reaching Finish.
5. **The skill says recovery waits for an export, but recovery skips the held run** (4#1). Replace the sentence with wording that says recovery skips a held run until a later reap.

## Constraints

- Item 5#1 (whether an export keeps empty directories) is open: keep
  today's file-content behaviour, its tests and its documentation.
- Abandoned runs keep being copied as they were left (the goal's
  Decisions).
- Items 3#3 and 1#1 of round 2 were waived: do not change Commit's
  publication mechanism or the type `ExportRead.Record` returns.

## Open

None.
