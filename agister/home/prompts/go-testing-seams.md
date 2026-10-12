---
date: 2026-10-12
author: Igor Malyarov
model: claude-opus-5-5
name: Go — testing seams
version: 0.0.2
type: prompt
---

Applies to Go: code that waits, starts processes or reaches anything
outside itself (git, the network, the filesystem, the kernel), and every
Go test. Skip it for anything else.

Write the code so that a test drives it deterministically: the test
decides when time passes, what a process prints and when work is done. A
test whose result rests on how fast the machine is proves nothing, and
flips under parallel load.

The seam is in the product

* What a test needs to drive the code is a seam the product offers, not a
  trick in the test: the clock (`Now() time.Time`), the timer
  (`func(time.Duration) (fired <-chan time.Time, stop func())`), whatever
  starts a process, the store, the listener. The component that waits or
  starts something takes it as a dependency.
* Fake below the logic worth proving. Timeout, termination, parsing and
  cleanup logic runs in every test when the fake is the process and the
  clock under it. A fake above that logic is fast and no longer proves it.
* Collaborators are given, never defaulted. A constructor that falls back
  to the wall clock or a real process when given none lets a test run on
  the real thing without saying so, and hides the state the claim depends
  on. A missing collaborator fails at construction; only the composition
  root names the real ones. The same holds for a fake, spy or harness: it
  fills in nothing the test did not give, no fixed identity and no real
  clock.
* Background work says when it is done: a channel closed on completion, a
  `Wait`, a "started" report, a notification that something was appended.
  A test that would have to poll for a state shows that the product lacks
  the event. Add the event to the product, and deliver it so that one
  raised between a read and the wait is not missed.

Time

* Tests use a manual clock: `Now`, `Timer` and `Advance`, where time moves
  only when the test advances it. The clock also tells the test when the
  code has started a timer of a given wait, by a call that blocks until
  then. The test waits for the timer it means, then advances past it. No
  sleep, no poll.
* The order matters: a clock advanced before the code has started its
  timer leaves that timer waiting for ever. A timer the code never starts
  is a hang, which the test binary's `-timeout` reports with the test's
  name.
* A timeout test is deterministic only when the work never ends by itself:
  the fake blocks until it is ended, so the timer is its only way out.
* Nothing is decided by a real wait: no sleep that must outlast some
  logic, no "did not happen within N ms", no assertion on elapsed time.
* `testing/synctest` does not replace the injected timer where the code
  does file, pipe or process I/O: its time moves only when every goroutine
  is blocked on the bubble's own channels.

Fakes

* A fake of an external program is one function of the process it runs
  as: its context, directory, arguments, environment, stdin, stdout,
  stderr and a hook to report a point it reached, returning its exit code.
  A thin `main` builds it as a binary for the contract tests; every other
  test runs the same function in a goroutine over a pipe, through the seam
  that starts processes. So the contract tests prove the protocol the
  in-process tests rely on.
* Run in process, the fake takes its environment from the command, never
  from the test process. A signal to its group cancels its context, so a
  "hangs" scenario blocks until it is ended instead of sleeping. It
  reports its points ("started", "blocked") on a channel the test holds.
* A fake gives distinct answers for the states its test must tell apart.

Real machinery only where it is the claim

* A test builds a binary, starts a process, listens on a socket, uses the
  network or waits on real time only when its claim is about that real
  thing: an adapter against a real process, git, the filesystem or the
  kernel. Its doc comment says so in a line `Contract test: <the real
  thing it is about>`. A test that needs a real repository only because
  the code it drives does is not about git: fake it.
* Every other test starts no process, builds nothing, listens on no socket
  and starts no timer. A unit test drives one component with every
  collaborator a spy, stub or fake. An integration test names what it
  integrates, and only that is real.
* A contract test's build is made once per test binary, not per test, and
  removed when the tests end (`TestMain`).
* Keep the marker by a test over the test files' syntax: a test that uses
  `os/exec`, a real timer, `context.WithTimeout`, `net.Listen` or
  `httptest.NewServer`, directly or through its package's helpers, and
  has no `Contract test:` line fails it.

Deadlines

* A deadline only guards a hang. It is never a fact about the product: a
  test that reports "no response arrived" at its deadline fails the slow
  but correct run.
* No timeout, bound or poll deadline in a test exceeds one minute, and the
  test binary runs with `-timeout 1m`. A longer wait makes a hang read as
  slowness, and nobody waits for it.
* A test that is not a contract test carries no guard of its own: the
  binary's `-timeout` names the test that hangs. A contract test may poll,
  bounded, only where the OS gives no event, as when a process group that
  is not its child ends.

Parallel by default

* A top-level test or subtest that shares no state with another calls
  `t.Parallel()` first. One that must run alone says why in a doc comment
  line starting `Serial:` (process-wide signals, `t.Setenv`, the working
  directory). The same syntax test fails a test with neither.
* Serial does not isolate a measure of the whole process
  (`testing.AllocsPerRun`, `runtime.MemStats`, goroutine counts):
  goroutines an earlier test left and the runtime's own still run. Observe
  the product's own work through a seam it is given (a buffer, an
  allocator).
* No state outlives its test: package variables, environment, working
  directory, a shared home or cache. Shared helpers keep their state per
  test or behind a lock. State in a package variable of the product is the
  product's missing seam: pass it in, do not clean it up.
* A test ends what it starts (processes, goroutines, directories) on every
  path, failures included: `t.Cleanup` and `t.TempDir()`.

What a test proves

* Each changed behaviour has a test that fails when the behaviour is
  reverted. It asserts the outcome, not the incidental steps, and more
  than "no error" or a length.
* A test covers the class of cases a behaviour has (a table over it, or
  an assertion on what holds for all of it), not one example of it.
* It asserts at the level the change claims: a change to what a record,
  report or log says is proven on that record, not one layer below it.
* An existing assertion is not weakened, widened or removed without the
  reason stated beside it.
* Prove a fix with a regular, committed test: put the bad input in
  `t.TempDir()` and assert the expected failure. No mutation specs, no
  revert checks, no reverting by hand, no broken files planted to run the
  binary on: they are slow, load the machine, never run again and prove
  nothing a normal test cannot.
* A behaviour no normal test can make fail means the code lacks a seam.
  Add the seam.
* A test costs what its claim needs: it does not rebuild or restart what
  another test already built. Stop once the tests prove the change.

Running tests

* Quiet, never `-v`: one line per package, details only for failures.
  `go test -count=1 -timeout 1m ./<pkg>/...` for what you touched, `-run
  <Test>` to narrow.
* Add `-race` for every package with goroutines or shared state: a spy
  test under the race detector finds the ordering bug a plain run passes.
* Before you finish: `test -z "$(gofmt -l .)" && go vet ./... && go test
  -count=1 -timeout 1m ./...`.
* The checks pass on what you deliver. A pass that rests on an ignored
  file or a build output left in your working tree is not a pass.
