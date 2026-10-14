# LAB-117 review round 3: fix

## Goal

`agister/testdata/briefs/lab-117-goal.md` (Done when 2, the owner's
refusal exception, and Done when 5).

## Answers

The judgement of `code_review` workflow run `20261007T091444Z-3e53e4`
(base `c6e5c14d`, candidate `1146dff3`), its one `fix` item, as written.

## Acts on

1. **Test long-param preservation when artifact storage fails.** Action:
   Add or extend one test in `agister/internal/app/inputs_evidence_test.go`.
   It supplies a long goal through `source: param` and makes
   `input-goal.txt` fail through the existing `recorderSpy.artifactErr`
   seam. It asserts three things: the recorded `request.params` keeps the
   literal, the input has no artifact, and `ARTIFACT_FAILED` reports the
   failure. The test must fail if `recordParams`
   (`agister/internal/app/calls.go`) replaces every long param with its
   digest regardless of whether an artifact matches.

## Constraints

Change nothing else. No production code change.

## Open

None.
