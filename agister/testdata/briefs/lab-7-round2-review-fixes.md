# LAB-7 round-2 review fixes (judge 20260930T104718Z-dc2ef0)

Fix each item as the judge ruled; the rulings are final. Use the module's quiet test commands from `agister/AGENTS.md`; report each with its exit code and final line, and list every file you changed.

## 1. Resuming an already-continued run subtracts the requested run's old total, so turns in between are charged again (major)

Both reviewers give the same concrete sequence, which ADR-001:227 explicitly allows: A, then B continues A, then C continues A again. Both trace it: calls.go:458 reads only run A, calls.go:474 uses A's stored total as the baseline, and session.go:53 subtracts it. That records $2 instead of $1 (and 5.875 instead of 1.125 in the second example). calls.go:406 and verify.go:229 show the wrong figure is recorded as the call's cost and deducted from the repair budget. Review 2 also shows the new test (calls_test.go:390) does only one continuation, and the existing end-to-end test that does re-continue (main_test.go:778) never checks cost. Both mark this as introduced by the change.

**Action:** Get the session's actual pre-turn totals through the runtime/session boundary. If that baseline isn't available, record the turn's cost as unknown. Add a normal three-call test with rising cumulative totals where the third call continues the first, and assert the third call's own cost.

## 2. Calls depends on the concrete Verifier and its private fields instead of a verification interface (major)

The trace shows the dependency at each step: NewCalls takes a concrete *Verifier (calls.go:149), builds the unexported loop from Verifier's private fields (calls.go:425), and reads loop.verified directly (calls.go:432). Verifier itself has no method of its own (verify.go:21, 54). There is a concrete use today: the Calls test harness has to build the real Verifier (calls_test.go:129) and can't substitute verification. The change introduced this.

**Action:** Give Verifier a narrow verification method that returns the verified identity and the fault. Move building the loop into verify.go, and inject the verifier into Calls through an interface that Calls defines.

## 3. The 20-second elapsed check can't stop a hang, because a blocked Run never returns to reach it (major)

The case is the exact regression the test exists to catch: the timeout handler fails to kill the process group. The trace shows what happens then. The command now blocks forever (command_test.go:117). runCommand is called synchronously (line 129). The watcher selects only once (command.go:96), and Run waits for the command to exit (command.go:107). The elapsed check (line 134) and the group-kill cleanup (line 45) only run after Run returns. So instead of failing, the test hangs, and the 20-second check never runs. runtimetest.go:169/175 has the same problem. The change swapped the old self-ending sleeps for these blocking commands.

**Action:** From the started callback, register a watchdog that kills the process group within a bound under a minute, records a failure, and lets the runner and cleanup finish. Apply the same protection to the runtime conformance timeout test.

## 4. The timeout subtest can fail on a correct kill if bash hasn't written its group file yet (minor)

Concrete sequence: bash gets no CPU before the 300 ms timer fires (command.go:94). The runner kills it correctly and reports TimedOut, but echo $$ > group never ran (command_test.go:117). groupOf then requires that file (line 138) and fails the test after a ten-second poll (line 104). The parent already receives the group through the started callback (command.go:62), so the file isn't needed. The change introduced this.

**Action:** In the timeout subtest, take the process group from the started callback instead of requiring the timed command to write it to a file.
