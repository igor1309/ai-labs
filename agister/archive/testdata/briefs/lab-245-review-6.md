# LAB-245 review 6: the named parser guard runs the function-value detector

## Goal

`testdata/briefs/lab-245-goal.md`

## Covers

- 5: `TestTheParserDeclaresNoneOfTheDocumentVocabulary` fails if the parser declares a forwarder to `ValidName`.

## Acts on

Code review run `20261013T115203Z-4b57b0`, 5#1 (minor, fix): the named parser guard misses `var check = document.ValidName`. Only the separate function-value test rejects it.

## Constraints

- Call the existing `validNameFunctionValues` detector from `TestTheParserDeclaresNoneOfTheDocumentVocabulary`. Do not add a new detector or change the bounds D-21 set.
- Prove it with that test's `t.TempDir` fixture proof: a fixture with `var check = document.ValidName` in the parser package is rejected by the named guard.
- Do not commit.

## Open

None.
