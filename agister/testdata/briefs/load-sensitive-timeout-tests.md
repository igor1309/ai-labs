# Timeout tests that machine load can flip

Tests only; no product change. Work in the Go module `agister/`.

`prompts/code-review-tests.md` (0.0.3): a wait whose expiry decides the
result is flaky when machine load could flip it; that includes an
assertion on elapsed wall time and a timeout test whose command could end
on its own. A timeout test is deterministic only when the work never ends
by itself, so the timer is its only way out; a deadline may only guard a
hang.

Sites:

- `cmd/agister/verify_loop_test.go` `TestVerifyRunTimeout`: `sleep 30`
  with a 1s verify timeout, and `elapsed > 6*time.Second` decides the
  result. The elapsed window includes the turn, git work and capture, so
  load can flip it.
- The other timeout and cancellation tests in `cmd/agister/verify_loop_test.go`
  and `internal/adapters/runtime/supervisor/command_test.go` that run
  `sleep 30`: the command could end by itself.

Change each so the command never ends on its own (it blocks until
killed), the verdict rests on the recorded outcome (timed out, cancelled,
the group killed, the message), and any elapsed check is a hang guard
only, well under a minute, and says so in a comment. Keep what each test
proves; do not weaken an assertion. Find any other test in the module with
the same shape (grep `time.Since`, `sleep `, `time.After`, `time.Sleep`)
and fix it the same way, or list it in your report with why it is fine.

Run the module's quiet test commands from `agister/AGENTS.md`, report each
with its exit code and final line, and list every file you changed.
