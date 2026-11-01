# LAB-37: the repository's policies set stale limits

LAB-9 lets a policy declare `stale` limits (`no_event`, `no_output`,
`tool_command`, `repeated_tool_calls`; see `agister/internal/domain/policy`
and `definition/limits.go`). No policy sets them, so a hung implement or
review run still ends only at its timeout. Set them in the repository's
own `.agister/policies` (not the shipped examples).

## Observed (2026-09-30 to 2026-10-01, `~/.agister/runs`)

The longest gap between two consecutive events of one run, per process
(n runs; p50 / p90 / max, seconds). The gap includes verification and
long tool commands, so it overstates silence within an agent turn:

- implement: n=72, 47 / 102 / 604
- implement_codex: n=2, max 158
- adversarial_review_codex: n=32, 37 / 84 / 282
- architecture_review_codex: n=39, 27 / 67 / 86
- tests_review_codex: n=38, 47 / 100 / 172
- clarity_review_codex: n=32, 21 / 47 / 59
- adr_review_codex: n=6, max 79
- advisor: n=3, max 10
- review_judge: n=43, 17 / 36 / 42

## Choose limits

- Generous: at least 2x the observed max, so no live run so far would have
  ended early; each well under its policy's timeout.
- `no_output` only where the verification command prints while it runs:
  the repository's verify command is quiet until it ends, so either leave
  `no_output` unset or set it above the command's whole duration; say
  which and why.
- `tool_command` only on policies whose agents run commands, above the
  longest legitimate command (the full check with `-race` takes a few
  minutes).
- `repeated_tool_calls` where a loop is plausible (implement, reviews).
- Policies on runtimes that do not report tool calls cannot use
  `tool_command` or `repeated_tool_calls` (refused before any effect):
  check each agent's runtime.
- A comment beside each block says what it is based on, in one line.

## Tests

The repository-settings test (`agister/cmd/agister/repo_settings_test.go`)
asserts the effective stale limits recorded for the processes that get
them. `agister check` passes; `agister process show <name>` prints them.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
