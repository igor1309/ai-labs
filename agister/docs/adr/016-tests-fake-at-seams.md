# ADR-016: Tests fake at seams, not with real machinery or the wall clock

- **Status:** Proposed
- **Date:** 2026-10-02
- **Scope:** Agister's own tests: which of them may build binaries, start
  processes or wait on real time; the product seams the others fake
  through; fixture builds; parallelism; the time `cmd/agister` takes in CI
- **Decision type:** Architecture
- **Amends:** none

## Context

The tests reviewer's prompt (`prompts/code-review-tests.md` v0.0.4, LAB-58)
makes three things findings by default: real machinery standing in for a
fake (building binaries, starting processes, real network, real time, a
shared cache, home or global state), the wall clock (any sleep, poll or
real timer), and cost. Its one exception is a test whose claim is about
that machinery itself, and such a test must say so.

Agister's tests break these rules widely:

- **Builds.** Each runtime adapter's tests, the logging decorator's and
  `cmd/agister`'s compile the fake runtimes with `go build`
  (`runtimetest.Binary`: `fakeclaude`, `fakecodex`, `fakepi`,
  `fakeopencode`, each over `fakeoutput`). `cmd/agister` also builds
  itself four times, once per test: `TestBinaryNamesItsBuild`, the two
  build-and-kill tests in `reap_test.go`, and
  `TestNextCallReapsAKilledWorkflowsNodes`. The fakes' temp directories
  are never removed.
- **Processes.** `cmd/agister`'s end-to-end tests run the fakes as real
  runtime processes, some found on a `PATH` set with `t.Setenv`, beside a
  `ccusage` shell script. The reap tests start the built CLI and SIGKILL
  it. The verify loop's tests run real `bash` commands, and wait for their
  groups to die.
- **The wall clock.** `cmd/agister`'s `eventually` polls every 50 ms for up
  to 15 s (23 calls across `reap_test.go`, `workflow_test.go`,
  `wiring_test.go` and `verify_loop_test.go`), and the verify loop's
  `wait` polls through `Runs.Observe` every 10 ms. The supervisor's tests
  poll for groups with `time.Sleep`. Timeouts of 300 ms and 1 s end
  end-to-end calls on real timers. Nearly every package guards its waits
  with a `time.After` of 5 s to 1 min. `internal/adapters/git`'s serial
  tests already order their workers with gates; their timers only guard a
  hang.
- **No parallelism.** No test calls `t.Parallel()`.
- **Cost.** Under CI's `go test -race` with coverage, `cmd/agister` took 54
  to 59 s against a 1-minute limit. LAB-51 pushed it over, and CI's
  `-timeout` was raised to 3 minutes (`agister/docs/deferred.md` item 8).
  The slowest tests there are the reap tests (5 to 6 s each),
  `TestRepositoryProcessesRunOnFakeRuntimes` and the example-settings
  tests.

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
`system.Clock` and `system.Timer`. The supervisor's own timeout, kill grace
and stdout grace use the wall clock. `Runs.Observe` and the git lock retry
poll on real timers. Nothing says that a call hosted in this process has
finished. And the fakes exist only as programs to build.

## Decision drivers

- A test proves its claim deterministically: no outcome rests on how fast
  the machine is.
- Real machinery appears only where it is the claim, and the test says so.
- What the product needs for a test to drive it is a seam in the product,
  not a trick in the test.
- A fake runtime is one program, built for contract tests and run in-process
  for the rest, so the contract tests prove the protocol the other tests
  rely on.
- The suite stays green after every stage.

## Decision

Real processes, builds, network and the wall clock are kept only in
contract tests, whose claim is about the real thing and whose doc comment
says so. Every other test fakes in-process through product seams: a
process starter, injected clocks and timers, and hooks that say "done".
Fixture builds happen once per test binary, tests that share no state run
in parallel, and `cmd/agister` runs well under a minute in CI.

## Rules

### 1. A contract test says what real thing it is about

A test may build, start a process, use the network, or wait on real time
only when its claim is about that real thing: an adapter against a real
process, git, the filesystem or the kernel. Its doc comment has a line
`Contract test: <the real thing it is about>`. Its waits follow the
prompt's rules: a timer may only guard a hang, unless the work never ends
by itself (the hang scenario). No bound exceeds a minute. Where the OS gives
no event, as when a group that is not this process's child ends, a
bounded poll is allowed.

Every other test starts no process, builds nothing, listens on no socket
and starts no timer. A hang there is caught by the test binary's
`-timeout`, which names the running test. Rule 6 sets that limit to 1
minute, so no hang waits longer.

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
- `cmd/agister`'s end-to-end files: `main_test.go`,
  `broken_document_test.go`, `named_verify_test.go`, `prompts_test.go`,
  `setup_test.go`, `repo_settings_test.go`, `opencode_settings_test.go`,
  `pi_settings_test.go`, `workflow_test.go` and `wiring_test.go`. These
  are contract tests of the composition (ADR-001 rule 14) against real git
  repositories and the filesystem, and they keep those. They stop running
  runtimes as processes: the composition gets the in-process starter
  (seam 1), so no fake is built, `PATH` is not set and no `ccusage`
  script is written. A turn's timeout runs on the manual clock (seam 2).
  Calls are awaited on `Hosted.Done` (seam 3), not by `eventually`, and
  the minute guards in `wiring_test.go` go.

Replaced by in-process fakes:

- `cmd/agister/reap_test.go`, `TestNextCallReapsAKilledRunsVerifyCommand`;
  `cmd/agister/workflow_test.go`, `TestNextCallReapsAKilledWorkflowsNodes`:
  in-process calls block in the in-process fake (seam 1), and their runs
  are abandoned as a kill would leave them (seam 4). The next call reaps
  them. The real group kill they relied on is the supervisor's contract
  (`processes_test.go`). `TestCleanupRunCancelsAndDrainsABlockedCall`
  blocks in an in-process command; `TestEndRecordedEndsEveryRecordedEffect`
  stays as the test of the helper the kept SIGKILL test uses.
- `cmd/agister/verify_loop_test.go`: verify and setup commands whose claim
  is the loop run as in-process `VerifyCommands` and `SetupCommands` fakes
  (its existing `seams`), on the manual clock. `wait` uses
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
timer and the run store. `process()` fills in the real ones.

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
   - `app.Runs`: `Observe`'s poll of a run in another process;
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

3. **Hooks that say "done".** Owner: `app`. `Hosted.Done(id)` returns a
   channel closed once a call hosted in this process has finished: its
   record finished, its workspace released, its processes ended.
   `Runs.Observe` waits on it for a hosted run instead of polling. It
   replaces `eventually` on a run's state, `cancelAndWait`'s poll and the
   verify harness's polling `wait`. Hooks the product already has are used
   as they are: `BackgroundReaper.Wait` for a reap, `Sink.ProcessStarted`
   and a command's `started` report for a process on record, and
   `runtimetest.InProcess`'s reports for a fake's progress.

4. **An abandoned run, in process.** Owner: `fsruns`. A run this process
   created can be abandoned: its owner lock is released without
   finishing, as the kernel releases it for a killed owner, and its handle
   refuses every later write. The test reaches the store through the
   composition. It replaces building the CLI and SIGKILLing it for every
   reap scenario but rule 2's one.

### 4. Fixture builds are made once per test binary

A contract test's build is made once per test binary, not per test, under
a directory removed when the binary exits. In `cmd/agister` one helper
builds the CLI for `TestBinaryNamesItsBuild` and the SIGKILL test. In
`runtimetest`, `Binary` keeps its per-binary cache, and the package that
uses it removes the directory in `TestMain`. Builds keep the host Go cache
(LAB-51). After seam 1, only the four adapters' contract tests build a
fake, each its own.

### 5. Tests that share no state run in parallel

Every top-level test and subtest that shares no state with another calls
`t.Parallel()` first. A test that must run alone says why in a comment
starting `Serial:` (process-wide signals, `t.Setenv`, the process's
working directory). `internal/archtest` fails a top-level test with
neither. Shared helpers keep their state per test or behind a lock, as
`tempDir` and `runtimetest.Binary` do.

### 6. The goal: `cmd/agister` well under a minute in CI

Under CI's `go test -race` with coverage, `cmd/agister` takes under 20
seconds. CI's `-timeout` goes back from 3 minutes to 1 minute, and the
full check in `agister/AGENTS.md` passes `-timeout 1m` too, so that rule
1's hang guard is a minute everywhere. `agister/docs/deferred.md` item 8
is removed once CI shows it.

### 7. Delivery in stages, each leaving the suite green

1. **Shared builds.** One CLI build per `cmd/agister` test binary for the
   four tests that build it. `runtimetest`'s build directory is removed at
   exit. `imports_test.go` makes one `go list` call. No product change.
2. **Clocks and timers** (seam 2) and `systemtest`'s manual clock. The
   tests that set short real timeouts move to it, and the composition
   carries the clock and timer.
3. **"Done" hooks** (seam 3). `eventually` and the polling waits on
   hosted runs go; `eventually` stays only in the SIGKILL test.
4. **The process starter** (seam 1). The fakes become functions, and
   `runtimetest.InProcess` is added. The composition, `cmd/agister`'s
   end-to-end tests, the logging decorator's and the adapters'
   non-conformance tests move to it. The `PATH` setup and the `ccusage`
   script go.
5. **Reap and verify tests** (seam 4). The abandoned-run seam goes in.
   The verify-command and workflow build-and-kill tests are replaced, and
   the verify loop's commands become in-process.
6. **Marking and parallelism.** The contract tests get their marker, the
   in-process guards go, `t.Parallel()` goes in, and `archtest` checks
   both. CI's and the full check's `-timeout` become 1 minute, and
   deferred item 8 is removed.

Clocks come before the starter because an in-process turn's timeout runs
on the injected timer. The hooks come before the starter because the
tests it moves wait on them. Parallelism comes last because it needs
`t.Setenv("PATH")` and the real timers gone first.

## Consequences

- `cmd/agister` and the adapters' tests no longer depend on machine load:
  no outcome waits on a real timer, and a hang fails within a minute with
  the test's name.
- The in-process fakes are the same code the contract tests build, so
  `Conformance` proves the protocol every in-process test relies on.
- The product gains a starter, timers in five more components, a "done"
  channel on `Hosted` and an abandon on `fsruns`'s handle. Each is wired
  only in the composition root. `Observe` also ends at once for a hosted
  run.
- Real git stays in `cmd/agister` and `internal/adapters/git`; the
  composition's claim is that its adapters work together on a real
  repository.
- What the SIGKILL test proves is left to one test; a reap scenario added
  later fakes the kill (seam 4) unless its claim is the kernel's.
- Stage 1 removes the fakes' build directories, as one of deferred item
  2's minors asks.

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
- **Fake git in `cmd/agister` too.** Rejected: git in a temp repository is
  fast, and that real repositories work is the composition's claim.
- **`testing/synctest` instead of injected timers.** Rejected as the
  mechanism: time advances only when every goroutine in the bubble is
  blocked on the bubble's own channels. File, git and pipe I/O are not,
  and the core already takes its clocks.

## Explicit non-decisions

The exact `Starter` and process interfaces; how `archtest` follows calls
through helpers; whether `internal/app`'s own tests later adopt
`testing/synctest`; the Go version this needs.
