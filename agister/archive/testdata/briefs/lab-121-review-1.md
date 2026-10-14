# LAB-121 review round 1: fixes

## Goal

`agister/testdata/briefs/lab-121-goal.md`

## Covers

- Done when 1 to 6, as the fix items below require.

## Acts on

The judgement of `code_review` workflow run `20261007T125021Z-5b8557`
(base `87c901a4`), its seven `fix` items, as written:

1. **Export holds no stable read of the run, so recovery can rewrite record.json during the copy** (1#1, 3#2). Add a stable-read handle owned by the consumer and backed by the store's ownership lock. Use its record and files throughout planning, comparison and copying, and release it on every path. Add a deterministic regression test under t.TempDir() that runs export alongside adoption and recovery.
2. **Get can pair a finished state with an older record, so a workflow export leaves out its join and skips its artifact check** (3#1, 4#1, 5#1). In Exporter.plan, re-read the record when the state is finished but record.FinishedAt is nil, before accepting it into the plan. Add a regression test through the existing ExportRuns.Get seam in which completion happens between the record read and the status check.
3. **Digest-mismatch tests cannot tell hashing the source apart from reading back the copy** (2#1). Add an option to the fake stage that corrupts destination bytes while the source still matches the recorded digest. Assert that export fails, names the artifact, and commits no copy.
4. **Repeat-export tests never add or remove a file, so the file-set guards are untested** (2#2). Add repeat cases with an extra file and with a missing file. Assert refusal, the named path, and that the destination is unchanged.
5. **No test makes Close fail, so ignoring the sync error would go unnoticed** (2#3). Add an explicitly configured close failure after successful writes. Assert that export fails and names the file, that the stage is discarded, and that export continues with the next run.
6. **Cancellation throws away the results of runs already exported and exits as an internal failure** (3#4). Print the completed results before handling the cancellation and return the interrupted exit code. Add a CLI regression test that returns completed results together with context.Canceled.
7. **The traversal test opens a neighbouring file that does not exist, so it passes even without the IsLocal guard** (2#4). Create the neighbouring run's record in the fixture first and keep the assertion that opening it through traversal is refused.

## Constraints

- Item 5#2 (whether an abandoned run is refused) is the owner's and open:
  keep today's behaviour for abandoned runs, its test and its
  documentation as they are.

## Open

None.
