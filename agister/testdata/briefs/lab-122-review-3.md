# LAB-122 review round 3: fixes

## Goal

`agister/testdata/briefs/lab-122-goal.md`

## Covers

- Done when 3, as the fix items below require.

## Acts on

The judgement of `code_review` workflow run `20261007T150114Z-622956`
(base `a19c8aa1~1`), its two `fix` items, as written:

1. **Agent creation refused for an unknown settings field omits the hint** (5#1). In CreateAgent (agister/internal/app/definitions.go:277), convert the runtime-mapping InvalidError into the existing InputError, carrying its unknown problems in InputError.Unknown so the CLI's existing renderer prints the newer-binary hint. Add a CLI regression test in agister/cmd/agister/newer_settings_test.go that writes a runtime mapping with an unknown field into temporary settings, runs `agister agent create`, and asserts the hint.
2. **JSON check tests do not assert that the hint is absent** (2#1). In the existing JSON case of TestCheckHintsAtANewerBinary (agister/internal/cli/cli_test.go, around line 525), add an assertion that stderr is empty for a check that has an unknown problem.

## Constraints

- Keep the owner's decisions in the goal: shape-first, and no hint line
  on `check --json`.

## Open

None.
