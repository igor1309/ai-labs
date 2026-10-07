# LAB-84 review round 2: fixes

## Goal

`agister/testdata/briefs/lab-84-goal.md`

## Covers

- Done when 2 and 3, as the fix items below require.

## Acts on

The judgement of `code_review` workflow run `20261007T200019Z-f5fca8`
(base `origin/trunk`), its three `fix` items, as written:

1. **Restore follows a linked skill folder and deletes its target** (3#1). Reject a symlinked skill folder before removing SKILL.md (a folder Lstat guard in Store.Remove), and add a temporary-directory regression test in the existing fsdefs skill tests asserting that the target file survives.
2. **Restore blocks on a special SKILL.md while holding the write lock** (3#2). Give Store.Current safe skill-file access that rejects special files without waiting, keeping its missing-file behaviour, and cover a FIFO with a committed temporary-directory test alongside the filesystem adapter tests.
3. **Assert the prompt identity for every migrated reviewer** (2#1). Extend the existing recorded-input assertions in agister/cmd/agister/repo_settings_test.go with an explicit process-to-prompt table covering architecture, tests, adversarial, clarity and judge.

## Open

None.
