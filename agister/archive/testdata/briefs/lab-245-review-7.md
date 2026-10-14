# LAB-245 review 7: the named parser guard's fixture proves each detector

## Goal

`testdata/briefs/lab-245-goal.md`

## Covers

- 5: `TestTheParserDeclaresNoneOfTheDocumentVocabulary` fails if the parser declares `ValidName` or a forwarder to it, with its `t.TempDir` fixture proof.

## Acts on

Code review run `20261013T125011Z-a7630a`, 2#1 (minor, fix): the composed guard's fixture proves only the function-value connection. If another detector's call were dropped from the guard, its standalone tests would still pass.

## Constraints

- Turn the named guard's fixture proof into a table of `t.TempDir` fixtures, one per detector: a vocabulary declaration, a directly returned call, an unchanged local result, an unchanged named result, and a function value. Each case asserts a finding through the composed guard function, not through the individual detector. Keep one clean fixture that passes.
- Change no detector and no D-21 bound. This is a test-only change.
- Do not commit.

## Open

None.
