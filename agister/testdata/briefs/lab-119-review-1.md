# LAB-119 review round 1: fixes

## Goal

`agister/testdata/briefs/lab-119-goal.md`

## Covers

- Done when 3, 4 and 7, as the fix items below require.

## Acts on

The judgement of `code_review` workflow run `20261007T111941Z-98f33a`
(base `d6ead815`, candidate `4a7ca7d1`), its five `fix` items, as written:

1. **Prove reference checking through the composed CLI** (2#1). Add
   regular tests in `agister/cmd/agister/briefs_test.go` that use
   temporary settings and brief files with the existing fake git and
   runtime seams. They should prove through the CLI composition that an
   existing reference succeeds and that a missing reference produces a
   contract refusal. Leave the held-back repository wiring untouched.
2. **Do not close a code fence with a four-space-indented marker** (3#1).
   In `sections`, apply the same three-space indentation limit to closing
   fences that opening fences already use. Add a committed regression in
   `briefs_test.go` asserting that the parts inside the fence are reported
   missing.
3. **Test workflow form annotations in the displayed view** (2#2). Add a
   `ShowWorkflow` case in `agister/internal/app/briefs_test.go` with a
   formed file input, asserting that the form annotation appears.
4. **Give the overriding brief different content** (2#3). Give the
   project brief fixture in `agister/pages/tests/config.test.js` a
   distinct purpose and parts, and assert those project values.
5. **Preserve parent section boundaries across declared subheadings**
   (3#2). Revise `sections` so that each section ends at the next heading
   of its level or above while declared child sections are still
   collected. Add nested-heading regressions in `briefs_test.go`.

## Constraints

- Do not edit `agister/AGENTS.md`, or the clause at
  `agister/skills/agister/SKILL.md:203` about dropping a form: both are
  owner items.
- Do not edit `.agister/processes/implement.yaml` or
  `.agister/workflows/code_review.yaml`; that wiring lands last.

## Open

None.
