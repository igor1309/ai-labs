# LAB-245 review 2: the guard follows a forwarder's result, and app has a guard of its own

## Goal

`testdata/briefs/lab-245-goal.md`

## Covers

- 3 and 5: neither the parser nor `app` forwards to `ValidName`, under any name or shape.

## Acts on

Code review run `20261013T082500Z-fc61e8`:

- 1#1, 2#1, 3#2, 5#1 (minor, fix): the guard misses a wrapper that stores `document.ValidName`'s result in a local or named result and returns it unchanged. Extend the wrapper detection to follow an unchanged local or named result into the return. Add function and function-literal cases to the existing `t.TempDir` fixtures, keeping the cases that allow ordinary direct use.
- 2#2 (minor, fix): nothing stops `app` from growing a forwarding helper again. Add an architecture test that rejects a forwarding declaration of `document.ValidName` in `internal/app`, helper or variable, under any name, reusing the existing detection helper. Prove it with `t.TempDir` fixtures.

The judgement's major finding (3#1, 4#1, 5#2, "restore the documentation") is not acted on. The branch was cut before LAB-242 (PR #990) moved behaviour into `docs/reference/`, so the review's diff against the newer trunk showed those files as reverted. Merging `origin/trunk` into the branch resolved it.

## Constraints

- Test code only.
- Do not commit.

## Open

None.
