# LAB-122 review round 1: fixes

## Goal

`agister/testdata/briefs/lab-122-goal.md`

## Covers

- Done when 1 to 4, as the fix items below require.

## Acts on

The judgement of `code_review` workflow run `20261007T133639Z-3a35ad`
(base `a19c8aa1~1`), its six `fix` items, as written:

1. **Unknown prompt argument names (e.g. `future: enabled`) are reported without the newer-binary hint** (3#1). In promptArgs, record unrecognised argument names with p.unknown instead of p.add. Keep ordinary validation for recognised arguments. Add a temporary-settings CLI regression that covers both check and run.
2. **Install validation drops the Unknown marker, so a refused install prints no hint** (3#2). Keep the unknown count or report in install's validation error. Have the CLI print the shared hint while keeping the install context, the existing wording and the exit code. Add a temporary-settings CLI regression.
3. **No test covers a refusal with more than one unknown problem** (2#1). Extend the CLI test in newer_settings_test.go with a process that has two unknown fields (for example `forms: [goal, step]` and `context: {lines: 3}`), and assert the two-problem hint and `result.error.unknown == 2`.
4. **Caller skill forbids dropping the field, which contradicts the adoption rule in AGENTS.md** (4#1). Remove the added remediation sentence from agister/skills/agister/SKILL.md and keep the description of the hint.
5. **Caller skill treats the hint as proof the settings are newer, though a misspelt source gets the same hint** (5#2). Rewrite the diagnostic paragraph in SKILL.md so it keeps the uncertainty: the settings may need a newer binary, or the field or source may be misspelt.
6. **Required note on why docs/settings-architecture/ and pages/ need no change is missing** (5#3). Add a LAB-122 entry to agister/docs/settings-architecture/notes.md saying which of docs/settings-architecture/ and pages/ needed no change, and why.

## Constraints

- Item 5#1 (whether a known input argument with a non-scalar value gets
  the hint) is open: keep today's behaviour, its tests and its
  documentation.

## Open

None.
