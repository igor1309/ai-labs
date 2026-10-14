# LAB-119 review round 3: fixes

## Goal

`agister/testdata/briefs/lab-119-goal.md`

## Covers

- Done when 1, 3, 5 and 7, as the fix items below require.

## Acts on

The judgement of `code_review` workflow run `20261007T114500Z-09ecc3`
(base `d6ead815`, candidate `4eabb18f`), its `fix` items 1#1, 1#2, 3#2,
2#1, 2#2 and 3#3, as written (3#1, the repository wiring, is the change's
last commit and not this run's):

1. **Retain resolved brief evidence before structural refusal** (1#1).
   Keep the resolved brief and its digest when the structural check
   refuses, so they are recorded before the run finishes. Add process and
   workflow regression tests asserting that the evidence is kept and no
   runtime starts.
2. **Do not treat a broken project brief override as absent** (1#2).
   Apply the existing broken-link distinction to brief files and folders
   in `fsdefs.go`. Add temporary-directory regression tests for both cases
   in `fsdefs_test.go`.
3. **Reject duplicate form keys instead of discarding earlier contracts**
   (3#2). Reject repeated form keys in `parseInputs`, following the
   existing declared/unique validation pattern. Add process and workflow
   parser regressions in `briefs_test.go`.
4. **Workflow-to-brief report links lack a regression test** (2#1).
   Extend the checker test in `agister/internal/app/briefs_test.go` with a
   workflow that names a brief. Assert the workflow's `Uses` and the
   brief's `UsedBy`.
5. **The unresolved-form refusal guard is not exercised** (2#2). Add a
   normal case using the existing `standInForms` seam that omits a named
   form. Assert the exact contract refusal and zero runner calls.
6. **Distinguish inline backtick spans from opening fences** (3#3). In
   `fenceMarker`, reject a backtick-fence opener whose remaining text
   contains backticks. Add a domain regression with a valid brief whose
   preamble contains such a line.

## Constraints

- Do not edit `agister/AGENTS.md`, or the clause at
  `agister/skills/agister/SKILL.md:203` about dropping a form: an owner
  item.
- Do not edit `.agister/processes/implement.yaml` or
  `.agister/workflows/code_review.yaml`; that wiring lands last.

## Open

None.
