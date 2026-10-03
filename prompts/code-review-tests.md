---
date: 2026-10-03
author: Igor Malyarov
model: claude-opus-5-5
name: Code review — tests
version: 0.0.6
type: prompt
---

Review the tests for whether they prove the behaviour they claim, and fail
fast and reliably when it breaks. Leave tests that already do this alone.

Definition of done:

* Each changed behaviour has a test that fails when the behaviour is
  reverted. Name any fix or guard with no such test.
* Proof rests on normal tests only: deterministic, cheap, rerunnable. A
  test's claim that rests on mutation or revert checks (plants, mutation
  specs, reverting by hand) is a finding. So is a behaviour no normal test
  can make fail: the code lacks a seam (an injected closure, spy, clock or
  hook); name it.
* A test asserts the outcome, not the implementation's incidental steps.
  Weak assertions (only "no error", only a length) are findings.
* A test asserts at the level the change claims. A change about what a
  record, report or log says is not proven by a test one layer below it.
* An existing assertion weakened, removed or widened in the same change is
  a finding unless the change says why.
* A test is either a unit test or an integration test. A unit test drives one component with every collaborator a
  spy, stub or fake. An integration test names what it integrates, and only
  that is real: an adapter's test against git integrates git; a test of the
  composed application integrates its own components, so the external
  things they reach (git, processes, network, time) are fakes unless one of
  them is the subject. Real machinery anywhere else is a finding: building
  binaries, starting processes, real network, real time, or a shared cache,
  home or global state, where a port, spy, stub or injected seam would do.
  Name the seam. Machinery a shared harness or composition wires in by
  default (clock, timer, process starter, store) counts as the test's own:
  name the default that should be the fake. A test labelled as an
  integration or contract test whose claim is not about the real thing it
  uses is a finding.
* Collaborators are given, never defaulted. A fake, spy or harness that
  fills in a value or collaborator the test did not give (a fixed identity,
  a real clock when none is passed) can hide the very state the claim
  depends on; so can product code that falls back to a real collaborator
  when none is given. Each is a finding: the test or constructor passes it
  explicitly, and a missing one fails at construction. A fake gives
  distinct answers for the states its test must tell apart.
* The wall clock is a finding: any sleep, poll or real timer in a test.
  Name the clock, hook or event to inject so the test drives time itself.
  If the product has no event, hook or result that says "done", the seam
  is missing from the product, not only the test; say which. A wall-clock
  wait in an integration test whose subject needs it follows these rules:
  * **Its expiry decides the result.** A sleep that must outlast some
    logic, a timer that must fire before (or must not fire before)
    something else, a negative check ("did not happen within N ms"), an
    assertion on elapsed wall time ("finished within N s"), or a timeout
    test whose command could end on its own. Mark it **flaky** when
    machine load could flip it. A timeout test is deterministic only when
    the work never ends by itself, so the timer is its only way out.
  * **A deadline may only guard a hang.** A test that reports a timeout as
    a finding about the product ("no response", "no report arrived") is a
    finding.
  * **It is long.** No test timeout, bound, poll deadline or test-process
    lifetime exceeds 1 minute. Longer waits bury real bugs: a hang reads
    as slowness, nobody waits for it, and the feedback loop becomes too
    long to use. Report each one with its value.
* Cost is a finding: a test slow for what it claims, or one that rebuilds
  or restarts what another test already built. Report its rough cost.
* Tests clean up what they start (processes, temp dirs, goroutines) on
  every path, failure paths included.
* No state outlives its test: package variables, environment, working
  directory, a shared home or fixture. One test's leftover failing others
  is a finding. If the state lives in a package variable or singleton of
  the product, the finding is the product's missing seam (the state should
  be passed in), not the tests' cleanup; cleanups only hide it.
* Stop once the tests prove the change.
