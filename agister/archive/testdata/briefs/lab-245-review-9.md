# LAB-245 review 9: the app and adapters guard's fixtures prove each detector

## Goal

`testdata/briefs/lab-245-goal.md`

## Covers

- 2 and 3: no forwarder of `document.ValidName` exists in `app` or the adapters.

## Acts on

Code review run `20261013T131759Z-ad7bb8`, 2#1 (minor, fix): the composed `app` and adapters guard has no composed-fixture proof. If a detector's call were dropped from it, its standalone tests would still pass.

## Constraints

- Do for the `app` and adapters guard what round 7 did for the parser guard. If the guard is not already a function that takes a directory, extract it into one. Add a table of `t.TempDir` fixtures, one per detector (a declared forwarder, a directly returned call, an unchanged local result, an unchanged named result, a function value), each in an `app`-like package and in an adapter subpackage. Assert each finding through the composed guard. Add clean cases that pass.
- Change no detector and no D-21 bound.
- Do not commit.

## Open

None.
