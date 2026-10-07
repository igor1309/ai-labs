# LAB-120 review round 1: fixes

## Goal

`agister/testdata/briefs/lab-120-goal.md`

## Covers

- Done when 2 and 5, as the fix items below require.

## Acts on

The judgement of `code_review` workflow run `20261007T121337Z-2c6d04`
(base `e89d9eeb`, candidate `56a04cb0`), its two `fix` items, as written:

1. **Assert the intent process's required output schema independently**
   (2#1). Extend the existing test in
   `agister/cmd/agister/repo_settings_test.go` so it asserts that the
   parsed intent process declares JSON output with schema `review-result`
   and `require_valid` enabled.
2. **Notes omit the required explanation of unchanged done gates** (5#1).
   Add a short entry to `agister/docs/settings-architecture/notes.md`. It
   records that the caller skill (`SKILL.md`), the README and Pages needed
   no change, and why: the caller skill discovers workflows from settings,
   the README does not list the reviews, and Pages renders the configured
   fan-out nodes dynamically.

## Constraints

- Do not edit `prompts/code-review-intent.md` or any other prompt.

## Open

None.
