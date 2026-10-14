# LAB-45 branch review round 1 fixes

Review rulings (code_review run 20261001T230414Z-29d221). Make each fix as
its action says, with its tests.

## 1. Pi edit and write are newly marked verified but only declare repository.write, though they can write host paths (major)

Action: In both agister/examples/pi/runtimes/pi.yaml and .agister/runtimes/pi.yaml, declare the host grants the tools actually reach: host.write for both, plus host.read for edit. Add a test using temporary settings that proves a call requiring repository writes is refused when host.write is withheld.

Why: The reviewer ran a probe against installed Pi 0.85.1. Through injected filesystem operations, both tools recorded writes to /tmp outside the checkout, and edit also reads its target. The trace shows the enforcer checks only declared grants (enforce.go:32, :55). So once host.write is withheld, select:any still grants edit and write, and pi.go:163 passes them to --tools. This change marked these entries verified, so it introduced the gap. That breaks ADR-001 rule 4.

## 2. A signal-killed or timed-out OpenCode process is reported as completed after a stop event (major)

Action: In the OpenCode reconciler, send timeout, cancellation and signal-exit evidence through WithoutTerminal before accepting completion. Add reducer/reconciliation tests through the existing Evidence seam, covering a stop event followed by a timeout or signal exit.

Why: The reviewer gives a concrete sequence: step_finish with reason 'stop' and text '{}', then a timeout and SIGTERM, then Reconcile receives TimedOut=true, Exit.Signal set and Exit.Code nil. Each step is traced. opencode.go:416 sets code to zero by default, so line 420 skips WithoutTerminal, and calls.go:800/614 record the call as completed. The adapter is new in this change. The fix reuses the existing WithoutTerminal path rather than adding a new mechanism.

## 3. The OpenCode adapter advertises ToolCalls:true, but its stream only reports calls once they finish (major)

Action: Make Identity advertise ToolCalls:false until timely tool starts are established. Add a regression test that the OpenCode adapter refuses a call with a stale.tool_command limit. The reviewer's other option, splitting completion observations from timely-start capability, is a larger design change and not needed to close this defect.

Why: The trace ties the port contract (ports.go:31, calls reported 'as they start and finish') to the candidate's own README:56. The README admits the stream reports calls only once ended. Identity still returns ToolCalls:true (opencode.go:144), so resolve.go:206 accepts command-duration limits. opencode.go:361 then emits Started and Finished together, and stale.go:125/136 arms and immediately disarms the timer. In the reviewer's case, an 11-minute bash run under a 10-minute stale.tool_command limit is never stopped. This breaks ADR-001 rule 5 and was introduced by the change.

## 4. The Pi write-tool settings test does not prove edit and write are granted (major)

Action: Run the temporary process with a short timeout. Assert that its recorded plan and the Pi --tools argument name edit, write and bash. This extends the existing read-tool plan assertion at pi_settings_test.go:67.

Why: The trace shows bash is also verified and grants repository.write (pi.yaml:24, :31). Permissions are unioned across primitives (enforce.go:63), and the test only checks aggregate requirements (pi_settings_test.go:222, :224). So bash alone satisfies both subtests, and the test passes whether or not edit and write are enabled. The change added the edit/write verification, and the test is meant to cover it.

## 5. The new implement_pi and implement_pi_glm process tests run with production timeouts (major)

Action: Add implement_pi and implement_pi_glm to testTimeouts with short caller timeouts. Shorten the verification timeout in the temporary test fixture, leaving the production settings unchanged.

Why: The trace is concrete. testTimeouts holds only advisor (repo_settings_test.go:39), and --timeout is added only for names in that map (:128). Both new policies inherit 45m/21m/15m, and both processes keep a 5m verification timeout (fixVerify replaces only the command). The CLI runs with context.Background(). So a regression in either newly added process can stall the suite for minutes, which breaks the one-minute test bound. The change added these processes.

Do not call a real model provider. Run the full check from `agister/`
(its AGENTS.md) and `node --test pages/tests/*.test.js`. Report each
command with its exit code and final line, and list every file you
changed.
