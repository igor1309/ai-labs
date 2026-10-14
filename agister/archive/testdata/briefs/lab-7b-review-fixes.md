# LAB-7 slice B: review fixes

Your slice B work is committed (a61011b5). Apply the following in this
checkout of the current branch head.

## Rulings of the review judge (run 20260930T091108Z-be1d5b), as written

1. **A passing repair that reports an empty session is accepted** (major). Reject a repair that reports no session before running verification again. Add the regression case to the session cases in verify_loop_test.go: first turn sess-1 with failing content, then a repair with passing content and an empty session.

2. **The verification loop depends on concrete Calls and its private fields** (major). Replace the Calls pointer in verification with contracts that verification owns: content (Identity/Changes), command running, and clock. Supply them through local composition so Calls no longer carries CallCommands just for verification.

3. **End-to-end verify test races a real two-second deadline** (minor). Drive the injected clock to set the remaining budget deterministically. Keep a real deadline only as a hang guard.

4. **Command-group test leaks its child when the kill assertion fails** (minor). From the started callback, before any assertion runs, register a cleanup that does not depend on the production runner. It should kill the process group and reap or wait for it.

5. **No test for failed attempt writes before completion or repair** (minor). Use the recorder's updateErr hook to fail the attempt update in two places: on a passing attempt, and on a failed attempt before repair. Assert failed/internal with no completion and no further repair turn. Add mutations that ignore each error.

6. **No test for the spent-cost-budget guard that blocks repair** (minor). Add exact-limit and over-limit cases: a $5 limit, a first turn reporting $5 or more, and failing verification with attempts left. Assert failed/budget_exhausted and no repair turn. Add a revert mutation that disables the guard.

## Found in verification (the orchestrator's own finding)

7. **The content identity drops tracked files that match .gitignore** (major).
   It starts from an empty temporary index and runs `git add --all`, which
   skips ignored paths even when they are tracked. This repository tracks 16
   such files (`git ls-files -ci --exclude-standard`), so every capture,
   including read-only review checkouts, records them as deleted:
   run 20260930T090524Z-448b19's `changes.patch` is 5.9 MB of such
   deletions. Seed the temporary index from the pinned revision before
   adding the checkout's content, so tracked files stay tracked whatever
   the ignore rules say, and untracked ignored files stay out. Add a
   regression test with a tracked, ignored file that is unchanged, and one
   that is modified, and a mutation for it.

## Owner decision

8. The prompt package may depend on the run package's evidence types
   (`run.Input`, `run.Output`). Record this stance in the prompt
   package's doc comment. No other change.

Add a mutation for each new test to `agister/testdata/revert-checks/verify-loop.spec`.
Agister runs the verification command, including every revert-check spec,
after your turn. List every file you changed. Do not commit.
