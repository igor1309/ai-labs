# LAB-250 review 1: inherited const initializers are checked

## Goal

`testdata/briefs/lab-250-goal.md`

## Covers

- 2, 3 and 6: no constant, variable or alias in `definition` or `app` has `input.<Name>` as its value.

## Acts on

Code review run `20261013T164056Z-d2d540`, 1#1, 2#1 and 3#1 (minor, fix): in a `const` group, a spec with no values inherits the previous spec's expression list. The guard checks only explicit `Values` and skips blank identifiers, so a forwarder through an inherited initializer escapes.

## Constraints

- Within each `const` group, keep the last explicit expression list and check it for every spec that inherits it. Check blank identifiers like any other name.
- Add `t.TempDir` fixtures through the composed guard: an inherited initializer and a blank identifier, for the five constants, in both `definition` and `app`, with `input` imported under its own name and under an alias. Keep the clean fixture passing.
- Stay inside the goal's bounds for the guard: no tracking through further copies and no literal comparison.
- Do not commit.

## Open

None.
