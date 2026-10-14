# LAB-9: round 1 review fixes

The review (run 20261001T071615Z-6185ba) of this branch ruled these fixes. Make each as
written; change nothing else.

- **A recovered turn panic leaves its watcher alive.** Defer end 
  immediately after creating the context and defer watch.end after 
  constructing the watcher. Add a test with a panicking runner that then 
  advances the injected timer and asserts no later event is appended and all 
  waits are released.
- **An expired quiet timer can kill a command with recent output.** 
  Revalidate recent output before declaring staleness, preferably with a 
  synchronized last-output timestamp. Add an injected-timer test that makes 
  both channels ready before the watcher resumes.
- **Liveness tests assert before the watcher processes delivered timers.** 
  Add a timer-processing acknowledgement or equivalent scheduler seam, and 
  drain each advanced tick before checking outcomes or ending the turn, in 
  both the live-turn and tool-command tests.
- **Conformance test skips rather than asserts the new ToolCalls 
  capability.** Add explicit ToolCalls assertions for both adapters, or make 
  expected capabilities part of the conformance subject.
- **Blocked-turn stale tests leave the call running on failure.** Pass 
  testing.T into staleHarness and register an independent 
  release/cancel-and-join cleanup before submission; cover the explicit 
  ctx.Done wait at stale_test.go:193 as well.
- **Turn watcher depends on Calls' concrete sink instead of its own 
  interface.** Declare a watcher-owned interface with Event, Raw and 
  ProcessStarted and use it in the field and constructor. Keep the injected 
  clock/timer seams and test the watcher with a local recording spy.
- **Widened app.EventSink forces tool reporting onto the supervisor.** 
  Declare a supervisor-owned interface with Event, ProcessStarted and Raw and 
  use it in Run and serialSink. Existing runtime sinks satisfy it 
  structurally; keep lookupSink's intentional Raw suppression and the 
  existing supervisor tests.
- **policy.Effective exposes the definition parser's Stale type.** Add a 
  policy-owned staleness result type, translate the definition fields during 
  composition, and update boundary translations to consume it. Keep the 
  existing unset, narrowing and timeout tests.
- **Bounded tool evidence and its digest are not actually asserted.** Add a 
  normal repeated-call test with oversized multibyte input, asserting the 
  exact bounded record input, valid UTF-8, and the expected whole-input 
  digest.

Tests are committed and deterministic: injected clock or timer, no
wall-time waits beyond a hang guard, no mutation or revert checks. Use the
quiet test commands from `agister/AGENTS.md`; report each with its exit
code and final line, and list every file you changed.
