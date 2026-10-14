# LAB-121 review round 2: fixes

## Goal

`agister/testdata/briefs/lab-121-goal.md`

## Covers

- Done when 1 to 6, as the fix items below require.

## Acts on

The judgement of `code_review` workflow run `20261007T131002Z-475e55`
(base `87c901a4`), its four `fix` items, as written:

1. **Reject export destinations inside the run store's source run directories** (3#1). Before staging, reject a destination that overlaps a source run directory, with filesystem aliases resolved. Configure the filesystem destination adapter with the run store's location and update the wiring to match. Add a TempDir regression test that exports into the source run's directory, asserts the refusal, and asserts the source is unchanged.
2. **The differing-copy test only proves length comparison; same-length content changes are unprotected** (2#1). Extend the existing differing-copy test with a same-length content change, for example `A\n` against `B\n` in events.jsonl. Assert that the copy is refused, the differing file is named, and the destination bytes are unchanged.
3. **Cancellation during the last run's copy is swallowed and the export reports success** (3#2). Check cancellation before publishing a copy and before returning kept. When returning the context error, keep any results already committed. Add a deterministic cancellation callback to the existing fake stage and a regression test.
4. **No exporter test proves completed results are kept on cancellation** (2#2). Add an exporter test that wraps the existing ExportStage collaborator to cancel after the first run's Commit. Assert that r1's completed result is returned with the cancellation error, that no remaining copies exist, and that reads are released.

## Constraints

- Abandoned runs keep being copied as they were left (the goal's
  Decisions); keep that behaviour, its test and its documentation.
- Items 3#3 and 1#1 were waived: do not change Commit's publication
  mechanism or the type `ExportRead.Record` returns.

## Open

None.
