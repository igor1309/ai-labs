# Caller skill: review round 2 fixes (LAB-65, code_review run 20261006T062639Z-6ae9d0)

The judge ruled two items `fix`. Do both. Do not change anything else; in
particular leave the command table and the parser's flag registrations
as they are (item 2#2 is with the owner).

## 1. major: the caller-skill guard skips the command when a global flag comes before it

Judge's action, unedited:

> In caller_skill_test.go, parse and skip global flag-value pairs before calling `cli.Lookup`. Add a regression case with a leading global flag followed by an unsupported command (for example `agister --home /tmp launch`) that the guard must reject.

## 2. minor: SKILL.md hardcodes ~/.agister for run records and patches

Judge's action, unedited:

> Update the run-path wording and the `git apply` example in agister/skills/agister/SKILL.md to use the selected home, stating `~/.agister` as the default.

Done when the repository's verify command passes. List every file you
changed.
