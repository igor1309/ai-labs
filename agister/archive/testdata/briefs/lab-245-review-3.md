# LAB-245 review 3: ValidName is only ever called, never taken as a value

## Goal

`testdata/briefs/lab-245-goal.md`

## Covers

- 2, 3 and 5: callers name `document.ValidName` directly. The guard enforces that as a source-level rule rather than chasing each forwarder shape.

## Acts on

Code review run `20261013T084251Z-c55b10`, 2#1 to 5#1 (minor, fix): the guard misses calls through local function aliases. This step follows the advisor's decision in run `20261013T085438Z-14995d`. It does not track aliases, copies, reassignment, captured function values or fields one by one. Instead, it rejects every use of the imported `document.ValidName` as a function value in `internal/domain/definition` and `internal/app`. Only a direct call is allowed. That closes every route to an alias at once. The guard claims that source-level rule, not exhaustive semantic detection.

- In `internal/archtest/formats_test.go`, reject taking the imported `document.ValidName` as a function value in `definition` and `app`. Preserve import identity: any import name, and a shadowed or unrelated `ValidName` selector is not flagged. Allow parenthesized direct calls. Keep the existing wrapper detection.
- Add a committed `TestValidNameFunctionValuesAreRejected`, proved on `t.TempDir()` fixtures in both packages. Cover an initialized alias and a separately assigned one, a copy, a reassignment, and function literals. Show that a direct call, an unrelated selector and a shadowed selector pass.
- Keep `TestAVocabularyNameTheParserDeclaresIsFound`, `TestAValidNameForwarderInAppIsFound`, `TestTheParserDeclaresNoneOfTheDocumentVocabulary` and `TestAppDeclaresNoValidNameForwarder` proving their existing cases.

## Constraints

- Test code only.
- Do not commit.

## Open

None.
