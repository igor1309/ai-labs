# LAB-250 review 2: every form that declares a name is checked

## Goal

`testdata/briefs/lab-250-goal.md`

## Covers

- 6: the guard fails if `definition` declares any of the five names.

## Acts on

Code review run `20261013T181426Z-34b39e`, 2#1 and 3#1 (minor, fix): a moved name declared by `for PromptInput := range ...` escapes, because the visitor checks `ast.AssignStmt` but not `ast.RangeStmt`.

## Constraints

- Fix the class, not the range case alone. Check the name in every form that declares an identifier in Go: `const`, `var` and `type` specs; function and method names, receivers, parameters and results (also in function literals); `:=` assignments, including in `if`, `switch`, `for` and `select` clauses; `range` with `:=` (key and value); the type-switch binding; labels. Prefer `go/types` `Info.Defs` if it type-checks the fixtures without network or module access. Otherwise enumerate these AST forms in one helper, with a comment listing them.
- Add `t.TempDir` fixtures through the composed guard: one per form, using the moved names, plus a `range` that only assigns (`=`) and stays clean.
- Stay inside the goal's bounds for the value check: no tracking through further copies, no literal comparison.
- Do not commit.

## Open

None.
