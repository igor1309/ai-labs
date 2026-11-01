# Round 2 review fixes: wall time still decides two verify-loop tests

Two rulings from the review of this branch, both in
`agister/cmd/agister/verify_loop_test.go`; confirm each before fixing.

- **`TestVerifyCallTimeoutBoundsTheLoop` gives real Git preparation only
  one second.** The clock is advanced before the copy is prepared, so the
  1s the call has left is spent partly in real Git; a slow machine can
  change the outcome. Move the clock advance into a hook that runs after
  copy preparation, or inject deterministic preparation, so wall time in
  Git cannot decide the result. Keep the assertion that exactly one
  command request was made, with the call's remaining time.
- **The cancellation test still races the command's real 20-second
  timeout.** Add an injectable command timer and leave it unfired in this
  test, so only cancellation can end the command. Keep a separate bounded
  guard so a hang still fails the test.

Add seams where the code lacks them; no test may depend on timing to pass.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
