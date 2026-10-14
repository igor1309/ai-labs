# LAB-245 review 5: an unchanged ValidName result is not forwarded through a local

## Goal

`testdata/briefs/lab-245-goal.md`

## Covers

- 2 and 5: no wrapper forwards `document.ValidName`, including one that returns its unchanged result through a local or a named result.

## Acts on

Code review run `20261013T113406Z-249c47`, 2#1, 3#1 and 5#1 (minor, fix), as decided by D-21 (advisor run `20261013T113814Z-b7db45`). Read D-21 in `docs/decisions.md`; its follow-ups are this step's instructions.

## Constraints

- Round 4's brief wrongly replaced the round-2 wrapper analysis. Do as D-21 says: restore bounded, function-local analysis of straight-line forwarding (declarations, assignments, copies and named results; explicit and bare returns; function declarations and literals) in `definition`, `app` and the adapter subpackages.
- Stop where D-21 stops: no control-flow joins, loops, pointer or field tracking, interprocedural analysis, or claims of semantic equivalence.
- Add `TestUnchangedValidNameResultsAreRejected` with `t.TempDir` fixtures, including the passing cases D-21 names. Keep `TestReturnedValidNameCallsAreFound` and `TestValidNameFunctionValuesAreRejected` passing.
- The guard's doc comment states this boundary, not that the rules exhaust the goal.
- Do not edit `docs/decisions.md`.
- Do not commit.

## Open

None.
