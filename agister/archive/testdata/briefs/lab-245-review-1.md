# LAB-245 review 1: the guard catches a renamed forwarder

## Goal

`testdata/briefs/lab-245-goal.md`

## Covers

- 5: the architecture guard fails if the parser forwards to `ValidName`, under any name.

## Acts on

Code review run `20261013T072247Z-f4fd28`:

- 1#2, 2#2 (minor, fix): the AST guard in `internal/archtest/formats_test.go` catches a forwarder only under the name `ValidName`. Extend it to catch a renamed forwarding variable or wrapper of `document.ValidName`, exported or unexported, while still allowing direct calls. Extend the committed `t.TempDir` fixture cases to prove that each forwarding form is rejected and that a direct call passes.

The judgement's major finding (1#1 to 5#1, "restore the --review option") is not acted on. The branch was cut before trunk gained `--review` (LAB-246, PR #988), so the review's diff against the newer trunk showed the option as removed. Merging `origin/trunk` into the branch resolved it, and the branch no longer touches `scripts/agister-gate` or the skill.

## Constraints

- Test code only.
- Do not commit.

## Open

None.
