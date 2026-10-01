# The implement cost-cap removals are proved by tests

The branch removed `max_cost_usd` from the shipped
`agister/examples/settings/policies/implement.yaml` and the repository's
`.agister/policies/implement.yaml`. Review (run 20261001T061748Z-a50deb)
ruled one fix: neither removal is proved by a test.

- Add a shipped `implement` case to the uncapped-call table
  (`TestShippedProcessesRunOnARuntimeWithoutACostLimit` in
  `agister/internal/app/calls_test.go`) asserting nil effective and runtime
  cost limits.
- Assert no effective cost limit for the repository's implement run, in
  `agister/cmd/agister/repo_settings_test.go`, as `TestTheJudgeHasNoCostLimit`
  does for the judge.

Tests only; no production or settings change. Use the quiet test commands
from `agister/AGENTS.md`; report each with its exit code and final line,
and list every file you changed.
