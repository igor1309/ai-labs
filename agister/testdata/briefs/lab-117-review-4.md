# LAB-117 review round 4: fix

## Goal

`agister/testdata/briefs/lab-117-goal.md` (Done when 2, the owner's
refusal exception, and Done when 5).

## Answers

The judgement of `code_review` workflow run `20261007T092346Z-7a2d12`
(base `c6e5c14d`, candidate `91153a7f`), its one `fix` item, as written.

## Acts on

1. **Prove that an unrelated artifact cannot authorize param redaction.**
   Action: In `TestALongParamWhoseArtifactFailsKeepsItsText`
   (`agister/internal/app/inputs_evidence_test.go`), use a different long
   brief and assert that its artifact was stored. Keep the assertions that
   the failed goal keeps its literal request param, has no artifact, and
   reports `ARTIFACT_FAILED`. The test must fail if `recordParams`
   (`agister/internal/app/calls.go`) redacts a long param when any input
   has an artifact, without comparing that artifact's digest to the param's.

## Constraints

Change nothing else. No production code change.

## Open

None.
