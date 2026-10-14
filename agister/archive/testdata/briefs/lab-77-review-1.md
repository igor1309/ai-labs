# LAB-77 review round 1: fixes

## Goal

`agister/testdata/briefs/lab-77-goal.md`

## Covers

- Done when 2 and 4, as the fix items below require.

## Acts on

The judgement of `code_review` workflow run `20261007T174040Z-4874cd`
(base `origin/trunk`), its two `fix` items, as written:

1. **The documentation done gate is missing** (5#1). Update the caller skill (agister/skills/agister/SKILL.md), agister/README.md, agister/docs/settings-architecture/ and agister/pages/ wherever they describe settings files, so they state that a YAML settings file must hold exactly one document and that a second document is refused. Add notes saying which surfaces needed no change and why.
2. **Missing test for an empty second YAML document** (2#1). Add a case such as `first + "---\n"` to the existing multi-document table in definition_test.go, asserting the same refusal.

Put the notes in `agister/docs/settings-architecture/notes.md`, as LAB-122
did.

## Open

None.
