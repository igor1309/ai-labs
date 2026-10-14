# LAB-118 review round 1: fixes

## Goal

`agister/testdata/briefs/lab-118-goal.md` (Done when 1 and 6).

## Answers

The judgement of `code_review` workflow run `20261007T094727Z-af0caf`
(base `22ed021f`, candidate `c3d8a99f`), its three `fix` items, as written.

## Acts on

1. **File names fall out of step with inputs when a collection or prompt
   comes before a file input** (major). Action: In `resolveValues`, keep
   one file-name entry for every input, so a collection or prompt input
   adds an empty one. Add regression tests in `working_copies_test.go`
   where a collection, and separately a resolved prompt, comes before a
   file input. Assert the copied bytes, that the file input carries
   `cache_path`, and that the collection or prompt input has none.
2. **The fscache reuse test checks file identity but not that the file was
   left unwritten.** Action: Before the second `Keep`, set a fixed past
   modification time on the copy and assert it is unchanged afterwards,
   keeping the existing identity and content checks.
3. **No CLI test checks the new `CACHE_FAILED` warning.** Action: Add a
   CLI test in `cli_test.go` whose `clientSpy` supplies a `CACHE_FAILED`
   event. Assert that the warning shows the input, file name and error,
   and that the run still exits as completed.

## Constraints

Change nothing else.

## Open

None.
