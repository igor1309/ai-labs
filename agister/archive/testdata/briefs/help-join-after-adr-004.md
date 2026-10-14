# `agister --help` describes the join as ADR-004 does

`agister --help` says, for `run <workflow>`: "fan-out nodes run
concurrently, the join only after all of them completed". Since ADR-004
(`agister/docs/adr/004-join-on-completed-nodes.md`) the join runs once every
fan-out node has ended, if at least one completed. Correct the help text
(`agister/internal/cli`), and let a test assert the new wording if the help
text is tested there. Change nothing else.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
