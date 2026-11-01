# LAB-120 review round 3: fixes

## Goal

`agister/testdata/briefs/lab-120-goal.md`

## Covers

- Done when 2 and 5, as the fix items below require.

## Acts on

The judgement of `code_review` workflow run `20261007T122511Z-0f3cea`
(base `e89d9eeb`), its two `fix` items, as written:

1. **notes.md wrongly says the Pages tests use their own fixtures, not
   this repository's settings** (3#1, 4#1). In
   `agister/docs/settings-architecture/notes.md` around lines 49-50,
   replace the fixture-only clause. Say instead that the existing Pages
   test 'the settings in .agister load without errors' loads this
   repository's actual settings, so it picks up the added process and node
   automatically, and that Pages needs no change because it renders the
   configured nodes dynamically.
2. **No test fails if the intent process's candidate-revision pin is
   removed** (2#1). Add a normal settings test in
   `agister/cmd/agister/repo_settings_test.go`. Using the existing fake git
   and runtime harness, run the configured intent process with HEAD at a
   different fake commit from the requested candidate, and assert that the
   call is refused before the runtime starts.

## Constraints

- Do not edit `prompts/code-review-intent.md` or any other prompt.

## Open

None.
