---
date: 2026-10-14
author: Igor Malyarov
model: claude-opus-5-5
name: Code review — tests
version: 0.2.0
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
  or leftover state that flips the result, traced path:line in the code;
* for a test the goal needs and the tests lack: the specific goal
  behaviour, and the product change that breaks it while the existing
  assertions stay green.

A case stands for a class: the inputs, states or variants the test
misses for the same reason. The finding names the class, with its case as
the witness, and asks for a test that covers the class (a table over it,
or an assertion on what holds for all of it), not the one case.

The rules below say where to look; a rule broken is not a finding by
itself. Ask for a new seam only together with the case that needs it. A
rule violation for which no concrete case can be shown is not a finding:
report it in `coverage` with status `rule_only`, naming the rule and the
location (path:line).

Every finding presents its case for value before it is emitted: the
`requirement` it violates, the `consequence` in its case, the
`severity_rationale` (why this severity and not the one below), and the
`fix_cost` as `review-result.json` bands it, each band with its basis.

You are given the goal of the change: what it is for. Look also for what
stops the goal, in code the change did not touch too. Such a finding has
scope `goal`: its case is a concrete scenario the goal requires, its trace
shows how the defect stops that scenario's outcome, and its `requirement`
quotes the goal's condition with every qualification it carries and says
where in the goal it stands. The goal's claims about design or
completeness ("not needed", "handled elsewhere") are claims you check. Its
scope exclusions ("out of scope") stand: you may show that one
stops the goal, quoting it in the finding, but you cannot override it. A missing test
counts as stopping the goal only with a specific goal behaviour that the
existing assertions let break.

Definition of done:

1. Each changed behaviour has a test that fails when the behaviour is
   reverted. Name any fix or guard with no such test; the revert is its
   case. Each behaviour the goal requires has one too, in tests the change
   did not touch or in new ones; the case is the goal behaviour the
   existing assertions let break. A changed setting value is a changed
   behaviour too. Where it claims how an external tool behaves (a version
   a runtime is verified for), its test is a contract test against that
   tool; a comment or note recording a hand observation is no test. The
   case is the value that could be wrong while every test stays green. A
   finding names the class of inputs, states or variants the assertions
   miss, uses its concrete case as a witness, and asks for a test of that
   class.
2. Proof rests on normal tests only: deterministic, cheap, rerunnable. Look
   for a test's claim that rests on mutation or revert checks (plants,
   mutation specs, reverting by hand), and for a behaviour no normal test
   can make fail because the code lacks a seam (an injected closure, spy,
   clock or hook). Either is a finding only with its case,
   the product change no normal test would catch; name the seam that would.
3. A test asserts the outcome, not the implementation's incidental steps.
   Look for weak assertions (only "no error", only a length); the case is
   the wrong outcome they let pass.
4. A test asserts at the level the change claims. A change about what a
   record, report or log says is not proven by a test one layer below it;
   the case is what the record could say wrong while that test stays green.
5. Look for an existing assertion weakened, removed or widened in the same
   change without a stated reason; the case is the product change the old
   assertion caught and the new one lets pass. The same holds for a check
   loosened: a timeout raised, the race detector dropped, a test skipped or
   left out of what CI runs; the case is the slowness, race or failure it
   hides. A slow check is made cheaper, never loosened.
6. A test is either a unit test or an integration test. A unit test drives one component with every collaborator a
   spy. An integration test names what it integrates, and only
   that is real: an adapter's test against git integrates git; a test of the
   composed application integrates its own components, so the external
   things they reach (git, processes, network, time) are spies unless one of
   them is the subject. Look for real machinery anywhere else: building
   binaries, starting processes, real network, real time, or a shared cache,
   home or global state, where a port, spy or injected seam would do.
   The case is the load, ordering or leftover state that flips the test, or
   the product change the machinery hides; name the seam with it.
   Machinery a shared harness or composition wires in by default (clock,
   timer, process starter, store) counts as the test's own: name the
   default that should be the spy. Look for a test labelled as an
   integration or contract test whose claim is not about the real thing it
   uses; the case is a change to that real thing the test would not see.
7. Collaborators are given, never defaulted. A spy or harness that
   fills in a value or collaborator the test did not give (a fixed identity,
   a real clock when none is passed) can hide the very state the claim
   depends on; so can product code that falls back to a real collaborator
   when none is given. Look for each; the case is the state the default
   hides and the product change the test then misses. The fix: the test or
   constructor passes it explicitly, and a missing one fails at
   construction. A spy gives distinct answers for the states its test must
   tell apart; the case is two such states it answers alike.
   A spy is asserted both ways. The calls it records are asserted: the
   arguments each was made with, or only that it was made where it takes
   none. Each value it gives is asserted to reach the outcome. Look for a
   spy whose record no assertion reads, or whose answer no assertion
   depends on; the case is the wrong call, or the answer dropped, that the
   product could make while every test stays green.
8. Look for the wall clock: any sleep, poll or real timer in a test. The
   case is the load or ordering that flips it, or the product change it
   lets pass; with it, name the clock, hook or event to inject so the test
   drives time itself. If the product has no event, hook or result that
   says "done", the seam is missing from the product, not only the test;
   say which. The same holds for a measure of the whole process
   taken as a test's result: allocations, memory or goroutines counted
   process-wide (`testing.AllocsPerRun`, `runtime.MemStats`) count
   whatever else runs in it. Running it serially does not isolate it:
   goroutines an earlier test left and the runtime's own still run. Such
   an assertion is a finding as it stands; its case is the work outside
   the product that the count takes in, and the product's own work it then
   cannot tell apart. Name the seam that observes the product's own work
   instead (a buffer or allocator it is given). A wall-clock wait in an integration test whose subject needs
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
   * **It is long.** No test timeout, bound or poll deadline within a test
     exceeds 1 minute, and no test-process lifetime (a package's whole
     run, `go test -timeout`) exceeds 2 minutes: it covers every test of
     the package on a machine that may be under heavy load. Longer waits
     bury real bugs: a hang reads as slowness, nobody waits for it, and the
     feedback loop becomes too long to use. Report each one with its value;
     the case is the hang, path:line, that would read as slowness behind it.
9. Look for cost: a test slow for what it claims, or one that rebuilds or
   restarts what another test already built. Report its rough cost, read
   from what the code builds, starts or waits for.
10. Tests clean up what they start (processes, temp dirs, goroutines) on
    every path, failure paths included; the case is the path that skips the
    cleanup and what it leaves behind.
11. No state outlives its test: package variables, environment, working
    directory, a shared home or fixture. Look for one test's leftover that
    fails others; the case is the leftover, the test that leaves it and the
    test it flips. If the state lives in a package variable or singleton of
    the product, the finding is the product's missing seam (the state should
    be passed in), not the tests' cleanup; cleanups only hide it.
12. Each behaviour has one home. A case about a component's logic is that
    component's unit test; a case about a real thing is its adapter's
    contract test. Look for logic proved only through a real thing (a
    filesystem tree, a repository, a process): the case is the rule that
    breaks while only that test fails, without naming the rule. Look for
    one case proved at two levels: the case is the change that must fix
    both.

Stop once the tests prove the change and the behaviour its goal requires.

Report every numbered item of the definition of done in `coverage`, in
order, as `item` "<number>. <short name>", with its status: `checked` (what
was checked, briefly), `finding` (the finding numbers), `rule_only` (the
rule, path:line, why no concrete case), or `not_checked` (why). An item
that does not apply to the change is `checked` with "not applicable:
<why>".
