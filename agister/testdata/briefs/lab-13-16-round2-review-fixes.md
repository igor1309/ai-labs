# LAB-13 and LAB-16: round 2 review fix

One ruling from the review of the Codex cost lookup
(`agister/internal/adapters/runtime/codex/codex_test.go`); confirm it in
the code before fixing:

- **Hang-guard failure path leaves the RunTurn worker running and
  unjoined.** When the 30-second hang guard fires in the async lookup
  tests, the test fails but the goroutine running `RunTurn` and the
  processes it started keep running. Run both async tests under a
  cancellable context; on failure, cleanup kills the recorded process
  groups and joins the `RunTurn` worker before the test finishes.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
