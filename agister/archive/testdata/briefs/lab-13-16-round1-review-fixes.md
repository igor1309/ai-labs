# LAB-13 and LAB-16, round 1 review fixes

Review of 7ddd6990 (the Codex cost lookup stays within the turn), code_review
run 20260930T200310Z-c2530d. Act on each ruling as written; where a ruling's
premise does not hold in the code, say so and change nothing for it.

## 1. No test proves CCUsage enforces the remaining timeout (fix, major)

Add a normal test in which the real CCUsage runs work that never exits by itself, with a short remaining budget and a separate hang guard. Assert that the lookup is ended by the timeout, the cost is unknown, and the completed turn outcome is unchanged.

## 2. The cost lookup depends on Calls' full EventSink, including Raw, which it never uses (fix, minor)

Declare a contract owned by the lookup with only Event and ProcessStarted, and adapt it to the supervisor with a no-op Raw. Keep the injectable Sessions and clock seams.

## 3. The already-cancelled guard before the cost lookup has no regression test (fix, minor)

Add a test driven by events that cancels on the runtime's TURN_COMPLETED event and installs a Sessions spy. Assert zero lookup calls, an unknown cost, and the completed runtime outcome.

## 4. The cancellation test's FIFO reader is never released when the fake runtime fails to start (fix, minor)

Give the reader an endpoint that can be closed or cancelled explicitly, and wait for it to finish (join it) during cleanup.

No test may depend on timing to pass; a hang guard only stops a broken test.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
