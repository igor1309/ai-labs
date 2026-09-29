---
date: 2026-09-29
author: Igor Malyarov
model: claude-opus-5-5
name: Code review — tests
version: 0.0.1
type: prompt
---

Review the tests for whether they prove the behaviour they claim, and fail
fast and reliably when it breaks. Leave tests that already do this alone.

Definition of done:

* Each changed behaviour has a test that fails when the behaviour is
  reverted. Name any fix or guard with no such test.
* A test asserts the outcome, not the implementation's incidental steps.
  Weak assertions (only "no error", only a length) are findings.
* A test asserts at the level the change claims. A change about what a
  record, report or log says is not proven by a test one layer below it.
* An existing assertion weakened, removed or widened in the same change is
  a finding unless the change says why. A reverted fix still fails a
  loosened test, so revert checks do not catch this.
* A wait is not a finding by itself. Yielding to a loop's next tick, or
  polling for an event that surely comes, is fine. Judge each wait by what
  it waits for, how long, on which clock, and what it hides:
  * **Its expiry decides the result.** A sleep that must outlast some
    logic, a timer that must fire before (or must not fire before)
    something else, a negative check ("did not happen within N ms"). Mark
    it **flaky** when machine load could flip it. A deadline may only
    guard a hang; a test that reports a timeout as a finding about the
    product ("no response", "no report arrived") is a finding.
  * **It uses the wall clock where the code takes an injected one.** The
    test should drive the clock it controls, not wait for real time to
    pass.
  * **It hides a missing synchronization.** A wait that papers over the
    product having no way to say "done" (no event, hook or result to wait
    on) points at the product, not only the test. Say which.
  * **It is long.** No test timeout, bound, poll deadline or test-process
    lifetime exceeds 1 minute. Longer waits bury real bugs: a hang reads
    as slowness, nobody waits for it, and the feedback loop becomes too
    long to use. Report each one with its value.
  A wait none of these apply to is fine; leave it alone.
* Tests clean up what they start (processes, temp dirs, goroutines) on
  every path, failure paths included.
* No state outlives its test: package variables, environment, working
  directory, a shared home or fixture. One test's leftover failing others
  is a finding.
* Stop once the tests prove the change.
