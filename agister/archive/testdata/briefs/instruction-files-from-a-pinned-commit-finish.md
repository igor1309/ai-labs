# Finish: instruction files come from a pinned commit (ADR-007)

The checkout holds a partial, unverified implementation of
`agister/testdata/briefs/instruction-files-from-a-pinned-commit.md`,
stopped midway: its last run of `go test ./internal/app/...` failed. That
brief is the task; read it first, and read ADR-006 and ADR-007
(`agister/docs/adr/`).

Judge the partial work against the brief. Keep what is right, fix what is
wrong, and finish what is missing, including every test the brief lists.
Change the approach where it does not meet the brief.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed relative to the
checkout's parent commit.
