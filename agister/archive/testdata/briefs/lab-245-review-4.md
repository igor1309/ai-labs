# LAB-245 review 4: the guards reach the adapters and reject any returned ValidName call

## Goal

`testdata/briefs/lab-245-goal.md`

## Covers

- 2 and 5: every caller (the parser, the adapters and `app`) names `document.ValidName` directly, and no wrapper forwards it.

## Acts on

Code review run `20261013T100831Z-cd30e5`:

- 2#1 (minor, fix): the guard's directory scans omit the adapters, so a forwarding helper in an adapter escapes. Extend the existing scans to `internal/adapters`.
- 2#2 and 4#1 (minor, fix): a wrapper with control flow, such as two branches that each return `document.ValidName(name)`, escapes the straight-line wrapper analysis.

## Constraints

- Do not extend the wrapper analysis shape by shape. Replace it with one source rule: outside `internal/domain/document`, in `definition`, `app` and `internal/adapters`, no `return` statement's result is a call to `document.ValidName`. Calls in conditions, assignments to a bool used locally and arguments stay allowed. This rule, and the function-value rule from round 3, are the guard's whole contract. Its doc comment says it is a source rule, not exhaustive semantic detection.
- If an existing non-test function in those packages returns `document.ValidName(...)` and is not a forwarder, say so in the notes and stop rather than rewriting its logic.
- Prove the rule with `t.TempDir` fixtures: an adapter forwarding helper, the two-branch wrapper, a single-line wrapper, and an allowed use, such as an `if !document.ValidName(x)` check, that passes.
- Keep the round-3 function-value fixtures passing.
- Do not commit.

## Open

None.
