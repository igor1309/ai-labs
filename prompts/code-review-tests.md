---
date: 2026-10-05
author: Igor Malyarov
model: claude-opus-5-5
name: Code review — tests
version: 0.1.0
type: prompt
---

Review the tests for whether they prove the behaviour they claim, and fail
fast and reliably when it breaks. Leave tests that already do this alone.

You do not run tests, vet or builds: every claim rests on the code, diff
and history you read. A test is shown flaky or falsely passing by a case
traced in the code, never by a run.

Every finding names its concrete case, one of:

* a specific product change the tests would still pass: what to remove or
  alter (path:line), and which assertions stay green;
* for timing, ordering or shared state: the interleaving, load condition
  or leftover state that flips the result, traced path:line in the code.

The rules below say where to look; a rule broken is not a finding by
itself. Ask for a new seam only together with the case that needs it. A
rule violation for which no concrete case can be shown is not a finding:
report it in `coverage` with status `rule_only`, naming the rule and the
location (path:line).

Definition of done:

* Each changed behaviour has a test that fails when the behaviour is
  reverted. Name any fix or guard with no such test; the revert is its
  case.
* Proof rests on normal tests only: deterministic, cheap, rerunnable. Look
  for a test's claim that rests on mutation or revert checks (plants,
  mutation specs, reverting by hand), and for a behaviour no normal test
  can make fail because the code lacks a seam (an injected closure, spy,
  clock or hook). Either is a finding only with its case,
  the product change no normal test would catch; name the seam that would.
* A test asserts the outcome, not the implementation's incidental steps.
  Look for weak assertions (only "no error", only a length); the case is
  the wrong outcome they let pass.
* A test asserts at the level the change claims. A change about what a
  record, report or log says is not proven by a test one layer below it;
  the case is what the record could say wrong while that test stays green.
* Look for an existing assertion weakened, removed or widened in the same
  change without a stated reason; the case is the product change the old
  assertion caught and the new one lets pass.
* A test is either a unit test or an integration test. A unit test drives one component with every collaborator a
  spy, stub or fake. An integration test names what it integrates, and only
  that is real: an adapter's test against git integrates git; a test of the
  composed application integrates its own components, so the external
  things they reach (git, processes, network, time) are fakes unless one of
  them is the subject. Look for real machinery anywhere else: building
  binaries, starting processes, real network, real time, or a shared cache,
  home or global state, where a port, spy, stub or injected seam would do.
  The case is the load, ordering or leftover state that flips the test, or
  the product change the machinery hides; name the seam with it.
  Machinery a shared harness or composition wires in by default (clock,
  timer, process starter, store) counts as the test's own: name the
  default that should be the fake. Look for a test labelled as an
  integration or contract test whose claim is not about the real thing it
  uses; the case is a change to that real thing the test would not see.
* Collaborators are given, never defaulted. A fake, spy or harness that
  fills in a value or collaborator the test did not give (a fixed identity,
  a real clock when none is passed) can hide the very state the claim
  depends on; so can product code that falls back to a real collaborator
  when none is given. Look for each; the case is the state the default
  hides and the product change the test then misses. The fix: the test or
  constructor passes it explicitly, and a missing one fails at
  construction. A fake gives distinct answers for the states its test must
  tell apart; the case is two such states it answers alike.
* Look for the wall clock: any sleep, poll or real timer in a test. The
  case is the load or ordering that flips it, or the product change it
  lets pass; with it, name the clock, hook or event to inject so the test
  drives time itself. If the product has no event, hook or result that
  says "done", the seam is missing from the product, not only the test;
  say which. A wall-clock wait in an integration test whose subject needs
  it follows these rules:
  * **Its expiry decides the result.** A sleep that must outlast some
    logic, a timer that must fire before (or must not fire before)
    something else, a negative check ("did not happen within N ms"), an
    assertion on elapsed wall time ("finished within N s"), or a timeout
    test whose command could end on its own. Mark it **flaky** when you
    trace the load condition that flips it, path:line. A timeout test is
    deterministic only when the work never ends by itself, so the timer is
    its only way out.
  * **A deadline may only guard a hang.** Look for a test that reports a
    timeout as a fact about the product ("no response", "no report
    arrived"); the case is the slow but correct run it fails.
  * **It is long.** No test timeout, bound, poll deadline or test-process
    lifetime exceeds 1 minute. Longer waits bury real bugs: a hang reads
    as slowness, nobody waits for it, and the feedback loop becomes too
    long to use. Report each one with its value; the case is the hang,
    path:line, that would read as slowness behind it.
* Look for cost: a test slow for what it claims, or one that rebuilds or
  restarts what another test already built. Report its rough cost, read
  from what the code builds, starts or waits for.
* Tests clean up what they start (processes, temp dirs, goroutines) on
  every path, failure paths included; the case is the path that skips the
  cleanup and what it leaves behind.
* No state outlives its test: package variables, environment, working
  directory, a shared home or fixture. Look for one test's leftover that
  fails others; the case is the leftover, the test that leaves it and the
  test it flips. If the state lives in a package variable or singleton of
  the product, the finding is the product's missing seam (the state should
  be passed in), not the tests' cleanup; cleanups only hide it.
* Stop once the tests prove the change.
