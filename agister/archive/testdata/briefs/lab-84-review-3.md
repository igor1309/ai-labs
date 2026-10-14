# LAB-84 review round 3: fixes

## Goal

`agister/testdata/briefs/lab-84-goal.md`

## Covers

- Done when 2, as the fix items below require.

## Acts on

The judgement of `code_review` workflow run `20261007T201459Z-87c2e8`
(base `origin/trunk`), its two `fix` items, as written:

1. **Restore follows a linked skills parent and deletes its target outside home** (3#1). Reject a linked skills/ container too, before Current or Remove accesses the skill (extend skillFolderLinked in fsdefs.go). Extend the existing temporary-directory linked-folder regression test in skills_test.go to assert that an external SKILL.md and its folder survive.
2. **New FIFO regression test leaves its worker blocked when the hang guard fails** (2#1). Register cleanup in the new FIFO test that releases the blocked FIFO open and waits for the worker before the fixture is removed. The reviewer also asks to use the same cleanup helper in the existing FIFO test at line 188; that part is stated, not traced.

## Open

None.
