# LAB-228 step 2: the code_review run 20261012T203633Z-f103e5 ruled two items to fix

## Goal

`testdata/briefs/lab-228-goal.md`

## Covers

- 5: behaviour, the binding plans in particular, stays as it is, and a test fails if it changes.

## Acts on

From the judgement of code_review run 20261012T203633Z-f103e5, both ruled fix:

1. **Remove migration history from test comments** (4#1, major). In `internal/domain/settings/bindings_test.go`, remove the history clause at lines 47–48 ("the case that had one bind a process without an agent is gone with the process's agent"), and the equivalent clauses at lines 139–140, 172–173 and 210–211. Keep the current ADR-based explanations. A comment says why the code is as it is now; it does not say what was changed.
2. **The Versions test does not assert sorted order across several prefixes** (2#1, minor). Extend `internal/domain/enforce/versions_test.go` with a table of offers whose primitives list several verified prefixes, in different declaration orders. Assert the complete sorted result of `Versions`, including a case where declaration order differs from sorted order, such as `["2.", "1."]`.

## Constraints

- Change nothing else.
- Do not commit.

## Open

None.
