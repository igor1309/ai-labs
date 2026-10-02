# Supervisor seam review round 2 fix

Review ruling (code_review run 20261002T050917Z-4eea6b). Make the fix as
its action says, with its test.

## 1. The production Codex transport's forwarding of the remaining lookup timeout is untested (major)

Action: Add an injected supervisor execution closure to the production codexTransport translator. Add a normal test asserting that the Spec it forwards carries the remaining lookup budget, not the full turn timeout. Alternatively, drive the production translator with a ccusage lookup that cannot finish on its own and assert the timeout error.

Why: The trace is concrete and step by step. main.go:146 wires codexTransport into the Codex runner, and codex.go:151 puts the remaining budget into the Spec. transports.go:41 (new in this change) translates that budget into supervisor.Spec.Timeout. However, codex_test.go:492 builds the lookup with the test-only supervised{} translator, and the CLI's ccusage fixture (repo_settings_test.go:284) exits immediately, so it cannot observe the timeout. The reviewer names a mutation that would go unnoticed: forwarding the full turn timeout instead of the remaining budget. The change introduced this translation, so the gap is the change's own. A normal test cannot make this fail today, which is a missing seam.

Run the full check from `agister/` (its AGENTS.md) and `node --test
pages/tests/*.test.js` from `agister/`. Report each command with its exit
code and final line, and list every file you changed.
