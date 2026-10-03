# ADR-017: Tests fake at seams, not with real machinery or the wall clock

- **Status:** Proposed
- **Date:** 2026-10-02
- **Scope:** Agister's own tests: which of them may build binaries, start
  processes or wait on real time; the product seams the others fake
  through; fixture builds; parallelism
- **Decision type:** Architecture
- **Amends:** none

## Context

Agister's tests pull three ways at once.

- **Integration fidelity.** The logic most worth proving sits where the
  pieces meet: the composition root, each runtime adapter's parsing, the
  supervisor's timeout, termination and leftover handling, a call's
  cleanup. A test that fakes above that logic, at the core's own ports,
  is fast but no longer proves it.
- **Repeated setup cost.** Building a binary, starting a process or
  standing up a repository is paid by every test that does it, on every
  run, and costs more the busier the machine is. Machinery each test sets
  up for itself multiplies that cost by the number of tests.
- **Outcomes that depend on the scheduler.** A test that waits on the
  wall clock, through a sleep, a poll, a real timer or a timeout that ends
  a call, passes or fails by how the scheduler ran its goroutines and
  processes. A wait sized for a quiet machine runs out on a busy one, and
  one sized for a busy machine is paid on every run. Running tests in
  parallel lowers the total time but raises the load, so such outcomes
  flip more often.

Real machinery buys fidelity at the price of cost and of outcomes the
scheduler decides; faking above the adapters buys speed at the price of
fidelity. What resolves the tension is faking below the logic worth
proving, at the process, the clock and the moment work progresses or
ends. Those are seams the product has to offer; a test cannot add them
by itself. Real machinery stays where it is the claim: an adapter against
a real process, git, the filesystem or the kernel.

In `cmd/agister`, 113 of 121 tests carry a contract-test marker and set
up a real git repository, though most claims are about settings,
installs, prompts, verify loops, workflows or wiring, not git. The marker
has become a blanket exemption.

The product already has some of the seams this needs. The core takes its
clocks (`CallClock`, `ReapClock`, `SetupClock`, `VerifyClock`), the
stale watch takes a `CallTimer`, and the reaper takes `ReapContext`.
`supervisor.Commands` takes a `Timer`. Each runtime adapter reaches its
process through a transport over a supervisor interface, which
`runtimetest.Runs` and `supervisorStandIn` already stand in for.
`BackgroundReaper.Wait` says when a reap is done, and `pages` takes its
`Listen`. The verify loop's harness (`verify_loop_test.go`) already runs
the core with an in-process runtime (`scripted`) and a manual clock.

What is missing: the composition root hard-codes the real supervisor,
`system.Clock`, `system.Timer` and the git adapters. The supervisor's own
timeout, kill grace and stdout grace use the wall clock. `Runs.Observe`
and the git lock retry poll on real timers; `Observe` polls even a run
this process is writing, though the process knows when it appends an
event. Nothing says that a
call hosted in this process has finished. And the fakes exist only as
programs to build.

`Observe` streams a run's events while the run is going (ADR-001 rule
15), and callers act on them mid-run: a caller may cancel a hanging call
once its `PROCESS_STARTED` event arrives. `Calls.Submit` returns before
that event is appended. Whatever replaces the poll must still deliver
each event as it is appended, not only once the run has finished.

## Decision drivers

- A test proves its claim deterministically: no outcome rests on how fast
  the machine is.
- Real machinery appears only where it is the claim, and the test says so.
- What the product needs for a test to drive it is a seam in the product,
  not a trick in the test.
- A fake runtime is one program, built for contract tests and run in-process
  for the rest, so the contract tests prove the protocol the other tests
  rely on.

## Decision

Real processes, builds, network and the wall clock are kept only in
contract tests, whose claim is about the real thing and whose doc comment
says so. Every other test fakes in-process through product seams: a
process starter, injected clocks and timers, a notification that a
run's events were appended, hooks that say "done", and in `cmd/agister`
an in-memory fake of the git-backed ports.
Fixture builds happen once per test binary, and tests that share no state
run in parallel.

## Rules

### 1. A contract test says what real thing it is about

A test may build, start a process, use the network, or wait on real time
only when its claim is about that real thing: an adapter against a real
process, git, the filesystem or the kernel. Its doc comment has a line
`Contract test: <the real thing it is about>`. A test that needs a real
repository only because the code it drives does is not about git, and
fakes it. In its waits, a timer
may only guard a hang, unless the work never ends by itself (the hang
scenario). No bound exceeds a minute. Where the OS gives no event, as
when a group that is not this process's child ends, a bounded poll is
allowed.

Every other test starts no process, builds nothing, listens on no socket
and starts no timer. A hang there is caught by the test binary's
`-timeout`, which names the running test.

`internal/archtest` enforces the marker. A top-level test that calls, in
its body or through its package's own test helpers, `os/exec`,
`runtimetest.Binary` or `Build`, `time.Sleep`, `time.After`,
`time.AfterFunc`, `time.NewTimer` or `net.Listen`, and has no
`Contract test:` line, fails it.

### 2. The current test files, classified

Kept as contract tests, marked as rule 1 has it:

- `internal/adapters/git/git_test.go`: the git adapter against real git
  and the filesystem.
- `internal/adapters/git/serial_test.go`: the worktree coordinator's lock
  files, across this process and re-executed test binaries
  (`TestHelperProcess`). Its gates stay; its `hangGuard` only guards.
  `TestTheDefaultCleanupContextHasADeadlineOfOneMinute` reads the
  deadline from the injected clock (rule 3, seam 2), not between two
  readings of `time.Now`.
- `internal/adapters/runtime/supervisor/supervisor_test.go`,
  `processes_test.go`, `command_test.go`: the supervisor against real
  process groups, tokens and pipes. Timeouts that decide an outcome are on
  the supervisor's timer (seam 2), as `command_test.go`'s already are.
  The command's group comes from its `started` report, not from polling a
  file the command writes. Waiting for a group to end stays a bounded
  poll.
- `internal/composition/runtime/{claudecode,codex,opencode,pi}/*_test.go`:
  each adapter's `runtimetest.Conformance` run, against its built fake over
  the real supervisor. Their `Watchdog` stays as a guard. Their other tests
  are replaced (below).
- `internal/composition/runtime/imports_test.go` and
  `internal/archtest/architecture_test.go`: the module's real import graph
  from `go list`. `imports_test.go` asks once for all five packages, not
  once per package.
- `deploy/deploy_test.go`: the install scripts under the real `/bin/sh`.
- `cmd/agister/signals_test.go`: the OS signals `shutdown` is wired to. It
  stays serial: signals are process-wide.
- `cmd/agister/version_test.go`, `TestBinaryNamesItsBuild`: the build
  information a built binary carries. It uses the package's one shared
  build (rule 4).
- `cmd/agister/reap_test.go`, `TestNextCallReapsWhatAKilledRunLeftBehind`:
  the one test of a real SIGKILL. The kernel releases the killed CLI's
  owner lock, its runtime's group outlives it, and the next call ends
  both. It uses the shared build. Its waits on the other process stay
  bounded polls; waits in this process use seam 3.
- `cmd/agister` tests whose claim is that the composition's adapters
  work together on a real repository (ADR-001 rule 14). They keep real
  git, through the real git-backed adapters (seam 5), and the marker:
  - `main_test.go`, `TestWorkspaceChangesAreKept`: the agent's changes
    kept as a patch, the repository untouched;
  - `verify_loop_test.go`, `TestVerifyCaptureReproducesThePassingContent`
    and `TestVerifyChecksWhatThePatchDelivers`: the patch, applied to a
    clean copy of the base, rebuilds what passed; ignored and binary files
    as git treats them;
  - `setup_test.go`, `TestACheckoutHookThatChangesATrackedFileFailsTheSetup`:
    a real post-checkout hook;
  - `reap_test.go`, `TestNextCallReapsAKilledRunsVerifyCommand`: the reap
    discards a real checkout and clean copy;
  - `wiring_test.go`, `TestBuiltWorkspaceAdaptersShareTheWorktreeCoordinator`
    and `TestTheProcessWorktreeCoordinatorLocksUnderTheHome`: the worktree
    coordinator across the composition;
  - the SIGKILL test above, whose built CLI runs the real composition.

Run over the fake of the git-backed ports (seam 5), and lose the marker:

- Every `cmd/agister` test not named above, in `main_test.go`,
  `broken_document_test.go`, `named_verify_test.go`, `prompts_test.go`,
  `setup_test.go`, `install_test.go`, `repo_settings_test.go`,
  `opencode_settings_test.go`, `pi_settings_test.go`, `workflow_test.go`,
  `verify_loop_test.go`, `reap_test.go` and `wiring_test.go`. Their claims
  are settings, installs, prompts, verify loops, workflows or wiring. A
  test whose claim is another real thing (a real shell, the kernel's
  flock) keeps a marker that names that thing, not git. None sets up a
  repository or runs `git`. Every `cmd/agister` test, real git or not,
  stops running runtimes as processes: the composition gets the in-process
  starter (seam 1), so no fake is built, `PATH` is not set and no
  `ccusage` script is written. A turn's timeout runs on the manual clock
  (seam 2). Calls are awaited on `Hosted.Done` and their events observed
  as they are appended (seam 3), not by `eventually`, and the minute
  guards in `wiring_test.go` go.

Replaced by in-process fakes:

- `cmd/agister/reap_test.go`, `TestNextCallReapsAKilledRunsVerifyCommand`;
  `cmd/agister/workflow_test.go`, `TestNextCallReapsAKilledWorkflowsNodes`:
  in-process calls block in the in-process fake (seam 1), and their runs
  are abandoned as a kill would leave them (seam 4). The next call reaps
  them; the first keeps real git (above), the second runs over the git
  fake (seam 5). The real group kill they relied on is the supervisor's
  contract (`processes_test.go`).
  `TestCleanupRunCancelsAndDrainsABlockedCall` blocks in an in-process
  command; `TestEndRecordedEndsEveryRecordedEffect`
  stays as the test of the helper the kept SIGKILL test uses.
- `cmd/agister/verify_loop_test.go`: verify and setup commands whose claim
  is the loop run as in-process `VerifyCommands` and `SetupCommands` fakes
  (its existing `seams`), on the manual clock and, but for the two tests
  kept above, over the git fake (seam 5). `wait` uses
  `Hosted.Done`. `TestVerifyCancellationKillsTheCommandGroup` and the stale
  test stop waiting for a real group: that the group is killed is
  `command_test.go`'s contract, and here the fake sees its context
  cancelled.
- The other tests in `internal/composition/runtime/{claudecode,codex,opencode,pi}/*_test.go`
  (sessions, resume, `ccusage`, tool calls, stale output) and
  `internal/composition/runtime/lookup_test.go`: on the in-process
  starter, timeouts on the manual clock; `codex_test.go`'s `guarded` timer
  and its 100 ms poll go.
- `internal/adapters/logging/logging_test.go`: the decorator's claim is
  not the process; it runs `Conformance` over the in-process starter, with
  the starter and the manual clock in `Conformance`'s `Subject`.
- `internal/app/continuation_test.go`: the core's part runs over spies;
  the real-git part (a patch carried into another worktree) is the git
  adapter's, where `TestApplyCarriesAPatchIntoACheckout` covers it.
- `internal/app/background_test.go`, `calls_test.go`, `setup_test.go`,
  `spies_test.go`, `workflow_test.go` and `internal/cli/cli_test.go`:
  already in-process. Their `time.After` guards go (rule 1).
- `pages/serve_test.go`: `Main` is served over an in-memory listener
  through its existing `Listen` seam, not loopback TCP, and its guards go.

### 3. The seams the product gains

Each seam is declared at the boundary of the component that requires it
(ADR-001 rule 13), and only the composition root wires the real one
(rule 14). `cmd/agister`'s `composition`, which already carries the
worktree coordinator for tests, also carries the starter, the clock, the
timer, the run store and the git-backed adapters. `process()` fills in
the real ones.

1. **The process starter.** Owner: `supervisor`. It declares a `Starter`
   that starts a spec and returns the started process: its stdin, stdout
   and stderr, its group and token for the reference, signalling the group,
   and waiting for its exit. The default is today's code: `exec` in its
   own process group, `PATH` lookup, the token from `ps`.
   `supervisor.Runtime` (turns and `Version`) and `supervisor.Commands`
   start through it, so their timeout, termination, leftover and stderr
   logic runs in every test. `runtimecomposition.New<Runtime>` take the
   supervisor they wire instead of building `supervisor.Runtime{}`
   themselves.

   `supervisor.Runtime` and `supervisor.Commands` share the one `Starter`
   and its `Process` on purpose. They are one component, the supervisor,
   which declares the seam once at its own boundary; ADR-001 rule 13
   forbids an interface shared between components, not within one.

   Owner: `runtimetest`. `runtimetest.InProcess` is a starter that runs a
   fake runtime in a goroutine over pipes. It picks the fake by command
   name or path, and takes the environment from the spec, not the process.
   Each fake becomes a function in an importable package,
   `Main(ctx, args, env, stdin, stdout, stderr) int`, with a thin `main`
   kept for the contract builds. Signalling the group cancels its context,
   so the hang scenario blocks until it is ended instead of sleeping for
   an hour. The starter reports each fake's start and its scenario's
   points (started, blocked) on a channel the test holds.

   It replaces `runtimetest.Binary` outside contract tests, the bin
   directories of symlinked fakes, `t.Setenv("PATH", …)` and the
   `ccusage` script.

2. **Clocks and timers.** Owners: each component that waits, with the
   existing shapes: `Now() time.Time` and
   `func(time.Duration) (<-chan time.Time, func())`, as
   `system.Clock` and `system.Timer` are. They are added where real time is
   still read directly:
   - `supervisor.Runtime`: the turn's timeout, the kill grace and the
     stdout grace;
   - `supervisor.Commands`: its stdout grace (its timeout and stale
     waits are on `Timer` already);
   - `app.Runs`: `Observe`'s poll of a run in another process (a run
     this process writes is woken by seam 3's notification instead);
   - `git.Worktrees`: the retry on a held lock file, and the default
     cleanup deadline;
   - `logging.Runner`: a turn's wall time.

   Owner: `internal/adapters/system/systemtest`. One manual clock with
   `Now`, `Timer` and `Advance`. It reports each timer as it is started,
   so a test advances time only once the code has started the timer it
   means, without polling. It replaces the tests' own `manualClock`,
   `quietTimers` and fixed timer stubs, the 300 ms and 1 s timeouts that
   end calls in `cmd/agister` and the adapters' tests, and
   `KillGrace: 200 * time.Millisecond`.

3. **Hooks that say "appended" and "done".** Two signals, one for
   progress and one for completion.

   *Events appended.* Owner: `app`, beside `RunsReader`, implemented by
   `fsruns`. The run store signals in this process whenever a handle it
   created appends an event, finishes, or is abandoned (seam 4). What its
   handles have appended is a value the store is given (`fsruns.Appends`),
   not a package variable: the composition root builds one and gives it to
   every run store it builds, so they share its notifications, and a test
   builds its own. A store given none signals nothing. Asked for a run
   and the last sequence number its caller has seen, the store
   returns a channel closed once the run has a later event or its handle
   has finished or been abandoned; the channel is closed already if that
   is true when asked, so an event appended between a read and the ask is
   not missed. A handle releases its owner lock before its signal; a run
   another handle adopts in between wakes whoever waited on the first, and
   is then the adopter's to signal. For a run whose handle this process
   does not hold, the store says it has no notification. `Runs.Observe`
   reads and delivers the run's events as today; while a run this process
   writes is still
   running, it waits on that channel or its context, never on a timer,
   and reads again. A run in another process is polled on the injected
   timer (seam 2). So every event, `PROCESS_STARTED` included, reaches
   `Observe`'s callback as soon as it is appended, and a cancel issued
   there acts while the run is still going. Tests that wait for an event
   observe it this way; it replaces `eventually` on a run's events.

   *Done.* Owner: `app`. `Hosted.Done(id)` returns a channel closed once
   a call hosted in this process has finished: its execution has ended,
   its cleanup (ending its processes, releasing its workspace) has been
   attempted, and any cleanup failure is recorded on its run. Done does
   not promise that cleanup succeeded: a release that fails leaves its
   checkout on the finished run for a later reap, as ADR-008 rule 6
   allows. Done is the completion signal only: nothing streams from it,
   and `Observe` does not wait on it. It replaces `eventually` on a run's
   state, `cancelAndWait`'s poll and the verify harness's polling `wait`.

   Hooks the product already has are used as they are:
   `BackgroundReaper.Wait` for a reap, `Sink.ProcessStarted` and a
   command's `started` report for a process on record, and
   `runtimetest.InProcess`'s reports for a fake's progress.

4. **An abandoned run, in process.** Owner: `fsruns`. A run this process
   created can be abandoned: its owner lock is released without
   finishing, as the kernel releases it for a killed owner, and its handle
   refuses every later write. Abandoning signals seam 3's notification,
   so an `Observe` of the run wakes and reads it as abandoned. The test reaches the store through the
   composition. It replaces building the CLI and SIGKILLing it for every
   reap scenario but rule 2's one.

5. **The git-backed ports, in `cmd/agister`.** Owners: `app`, whose
   ports they are, and `cmd/agister`'s `composition`, which is given what
   `wire` and `process` build from `internal/adapters/git` today, as it
   is given the starter (seam 1) and the clock (seam 2): the calls'
   workspaces (`app.CallWorkspaces`: root, repository identity,
   checkouts), the verifier's clean copies (`app.VerifyCopies`), the
   reaper's discard (`app.CheckoutDiscarder`), the content namer and
   differ (`app.CallChanges`, which also serves `app.SetupContent` and
   `app.VerifyContent`) and the `git.*` input providers
   (`app.InputProvider`). `project` finds the repository root
   through the given workspaces, not `git.Workspaces{}`. `process()`
   builds the real ones over its worktree coordinator, as today.

   Owner: `internal/adapters/git/gittest`. A fake that implements those
   ports over trees it records, and only as far as the non-git
   `cmd/agister` tests need. A test records a repository's revisions as
   file trees. Root, identity and sameness come from the recorded
   repository; a checkout or clean copy is a temp directory holding a
   revision's tree, removed by its release or discard; an identity names a
   directory's files; `Changes` returns a patch between two recorded
   contents, and `Apply` applies one it made. The git inputs resolve from
   the recorded revisions. It runs no `git` and knows no ignore rules,
   hooks, binary files or lock files: tests whose claim needs them keep
   real git (rule 2).

### 4. Fixture builds are made once per test binary

A contract test's build is made once per test binary, not per test, into
one directory per test binary. In `cmd/agister` one helper builds the CLI
for `TestBinaryNamesItsBuild` and the SIGKILL test. In `runtimetest`,
`Binary` keeps its per-binary cache, and every package that builds
through it removes the directory from its `TestMain`, once its tests
have returned. Removal is attempted once, when the tests finish
normally. A failed removal is reported and fails the run with a nonzero
exit code; a failing run keeps its own code. An abrupt exit (a panic, the
`-timeout` panic, a signal) skips the removal and can leave the directory
behind in the system's temp directory. Builds keep the host Go cache
(LAB-51). After seam 1, only the four adapters' contract tests build a
fake, each its own.

### 5. Tests that share no state run in parallel

Every top-level test and subtest that shares no state with another calls
`t.Parallel()` first. A test that must run alone says why in a comment
starting `Serial:` (process-wide signals, `t.Setenv`, the process's
working directory). `internal/archtest` fails a top-level test with
neither. Shared helpers keep their state per test or behind a lock, as
`tempDir` and `runtimetest.Binary` do.

## Consequences

- `cmd/agister` and the adapters' tests no longer depend on machine load:
  no outcome waits on a real timer, and a hang fails at the test binary's
  `-timeout` with the test's name.
- The in-process fakes are the same code the contract tests build, so
  `Conformance` proves the protocol every in-process test relies on.
- The product gains a starter, timers in five more components, an append
  notification on `fsruns`'s store, a "done" channel on `Hosted`, an
  abandon on `fsruns`'s handle and the git-backed ports given to the
  composition. Each is wired only in the composition root. `Observe`
  delivers each event of a run this process writes as soon as it is
  appended, and ends once the run finishes, with no timer; a run in
  another process is still polled, on the injected timer.
- Real git stays in `internal/adapters/git` and, in `cmd/agister`, only
  in the few tests whose claim is that the composition's adapters work
  together on a real repository (rule 2). Every other `cmd/agister` test
  runs over the git fake, sets up no repository and carries no marker for
  git. What the fake does not model is proved only by those few and by
  the git adapter's own tests.
- What the SIGKILL test proves is left to one test; a reap scenario added
  later fakes the kill (seam 4) unless its claim is the kernel's.
- The fakes' build directories are removed when a test binary's tests
  finish normally, and a failed removal fails the run (rule 4), as one of
  deferred item 2's minors asks. An abrupt exit can still leave a build
  directory behind in the system's temp directory.

## Alternatives considered

- **Raise the limit or split CI's jobs.** Rejected: it hides the cost, and
  real-time waits stay as flaky as they are.
- **Only add `t.Parallel()`.** Rejected: under parallel load the real
  timers and polls flip outcomes more often, not less.
- **Fake at `app.TurnRunner` in `cmd/agister`, as the verify harness
  does.** Rejected for the end-to-end tests: it skips the adapters'
  parsing and the supervisor's timeout and termination logic, which the
  in-process starter keeps. The verify harness keeps it: its claim is
  the loop.
- **Real git in every `cmd/agister` test.** Rejected, reversing this
  ADR's first choice (owner, 2026-10-03). The marker became a blanket
  exemption: most of those tests' claims are not about git (rule 1). A
  repository set up per test is paid on every run and couples claims
  about settings, prompts or verify loops to git. The composition's claim
  on a real repository is kept by the few tests rule 2 names.
- **`testing/synctest` instead of injected timers.** Rejected as the
  mechanism: time advances only when every goroutine in the bubble is
  blocked on the bubble's own channels. File, git and pipe I/O are not,
  and the core already takes its clocks.

## Explicit non-decisions

The exact `Starter` and process interfaces; the exact shape of the
append notification; the git fake's patch format and API; how
`archtest` follows calls through helpers; whether `internal/app`'s own
tests later adopt `testing/synctest`; the Go version this needs.
