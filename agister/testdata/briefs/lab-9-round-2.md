# LAB-9: round 2 review fixes

The review (run 20261001T073141Z-687089) of this branch ruled these fixes. Make each as
written; change nothing else.

- **Preserve numeric tool inputs before comparing repeated calls.** 
  Preserve numbers when decoding tool inputs in both the codex and claudecode 
  adapters, without changing the existing usage decoding. Add regression 
  tests for both adapters in which two distinct large-integer inputs are not 
  treated as repeated calls.
- **Prove tool notifications arrive during the turn, in order.** Record an 
  ordered trace of callbacks and events in the runtimetest conformance 
  harness. Assert that ToolStarted arrives before the matching result event, 
  and that ToolFinished arrives before the turn completes. Run this for both 
  adapters and for the logging decorator.
- **Register watcher cleanup before assertions in 
  TestTheWatcherReportsToTheSinkItDeclares.** Right after WatchTurn, register 
  a t.Cleanup that calls watch.End and then timers.released.

Tests are committed and deterministic: injected clock or timer, no
wall-time waits beyond a hang guard, no mutation or revert checks. Use the
quiet test commands from `agister/AGENTS.md`; report each with its exit
code and final line, and list every file you changed.
