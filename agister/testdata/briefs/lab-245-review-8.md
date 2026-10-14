# LAB-245 review 8: an unrelated statement does not reset result tracking

## Goal

`testdata/briefs/lab-245-goal.md`

## Covers

- 5: `TestTheParserDeclaresNoneOfTheDocumentVocabulary` fails for a straight-line forwarder of an unchanged `ValidName` result.

## Acts on

Code review run `20261013T130040Z-aeb13b`, 2#1 (minor, fix): a local `const` declaration clears the tracked results, so a forwarder with a `const` before or after the tracked assignment escapes.

## Constraints

- Fix the class, not the `const` case alone. In the straight-line analysis, a statement that writes no tracked name (a `const` or `var` declaration of other names, an expression statement, an assignment to an untracked name, an empty statement) keeps the tracked results. A statement that writes a tracked name updates or invalidates it, as today. A statement the bounded analysis does not follow (control flow, loops and the others D-21 excludes) stays as today.
- Extend the composed guard's fixture table with these unrelated statements before and after the tracked assignment, for local and named returns. Keep the clean and changed-result cases passing.
- Stay inside D-21's bounds. Do not commit.

## Open

None.
