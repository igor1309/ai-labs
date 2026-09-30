# LAB-14: a failed readiness wait still ends the command it started

A review finding on `agister/cmd/agister/reap_test.go`, never ruled on;
line numbers are from when it was raised and may have moved. Confirm it
in the code before fixing; if it does not hold, say so and change nothing.

The test's cleanup kills the verification command only through a local
group variable, which is set after the readiness wait succeeds. The
supervisor records the command's group before its token lookup
(`internal/adapters/runtime/supervisor/command.go`), so when readiness
fails first (the group is recorded, the token lookup fails, the poll
expires), cleanup kills the CLI and removes checkouts but leaves the
command, `tail -f /dev/null` from `verify_loop_test.go`, running forever.

Cleanup must rescan the records and kill every recorded runtime and
command group on its own, whatever point the test reached. Look for other
tests in `cmd/agister` whose cleanup has the same gap and fix them the
same way.

Prove it with a regular test through a seam (e.g. a cleanup helper that
is given recorded groups and a kill spy), not by planting a broken run.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
