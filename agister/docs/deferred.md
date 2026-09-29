# Deferred work

Known gaps accepted for the CLI stage. Each has a trigger: do it then, not
before.

## 1. Scripts cannot run through Agister

- **Gap:** Agister runs only agent calls (ADR-001 rule 1). The node result
  is shaped for future command and check nodes too (rule 6), and routing
  belongs to a future workflow layer, but neither exists. A deterministic
  check (gofmt, vet, the test suite, revert checks) cannot run through
  Agister, leave evidence in a run record, or hand its result to the next
  step, such as a judge. Wrapping a script in an agent call to run it would
  waste a model turn and make a deterministic result depend on a model.
- **Evidence:** dogfooding on 2026-09-29: reviewers and a judge ran through
  Agister, but verifying the fixes they asked for (the tests pass, every
  revert-check mutation is caught) had to run outside it. There it went
  wrong in the ways a command node would prevent. `revert-check.py`
  mutates files in place, in the tree the builder, the verifier and the
  committer share; a run killed mid-mutation (a killed Python process runs
  no `finally`) left `Kill(-group, 0)` in `processes.go`. The builder then
  reported the suite green and 58/58 caught, about a tree state no one
  could name, while leaving that file out of its list of changes; a commit
  made meanwhile escaped a mutation only by staging paths explicitly; and
  the candidate for the next review round would have carried it. What was
  missing: a checkout of its own, a pinned revision, an effect owned and
  undone on every exit (ADR-001 rule 12), and a recorded result instead of
  a narrated one.
- **Access:** running tests needs to execute commands and to write inside
  its checkout (the Go build cache; revert checks mutate files). No agent
  runtime can be granted that today: Codex read-only cannot run `go test`,
  Claude Code's Bash cannot be fenced, and write confinement (Claude Code
  `Edit` and `Write`, Codex `workspace-write`) is unverified (item 3). A
  command run by Agister itself would be bounded by what Agister owns (the
  checkout, the process group, the timeout), not by a runtime's
  primitives.
- **Open:** a new node type (command) the core runs beside agent calls, or
  a workflow step that runs commands; the output contract (exit code, JSON
  on stdout validated against a schema); how a policy states what a
  command may do; and how a later process reads that result as input (no
  input source reads another run's output today).
- **Direction (2026-09-29):** runs tied to one agent call look reasonable
  as hooks on that call's own checkout. A pre-hook prepares or gates (a
  build cache, gofmt, vet). A post-hook verifies, normalises or delivers
  what the agent left: the tests and revert checks on an implementer's
  changes, gofmt over them, committing them (item 7). The post-hook is
  necessary: without it an implementer's work is verified by hand, outside
  any record. A standalone command node (no agent) is not proved yet.
  Without an agent, a pinned checkout, owned effects and a record are what
  a script with its own worktree already gives (`revert-check.py --rev`).
  What only a node gives needs pieces that do not exist: one result
  consumed by several calls (a hand-off) or a gate that stops a whole
  round (a workflow).
- **Trigger:** now, first: test scripts are the first candidate, before a
  dogfooding round needs a tester again.
- **Done when:** a test script runs through Agister on a pinned candidate,
  ends in a recorded node result with its evidence, and another process can
  take that result as input.

## 2. Effects outlive a killed Agister process (partly done)

- **Gap:** ADR-001 rule 12 (every effect owned and cleaned up). If the CLI
  process is killed with SIGKILL during a call, the runtime's process group
  keeps running and the candidate checkout stays on disk and in
  `git worktree list` until something reaps them. SIGINT, SIGTERM and
  SIGHUP are handled cleanly.
- **Evidence:** reproduced 2026-09-28 with the fake runtime (hang scenario):
  after `kill -9` of `agister run`, the runtime process and the worktree
  remained.
- **Done (2026-09-29):** a run records its checkout as soon as it exists and
  its process as soon as the runtime starts, as an opaque reference only
  the runtime adapter reads (the supervisor's is the process group, then
  the group with the leader's start time as a token: `pgid:<group>[:<token>]`);
  the core, the record and the reap event carry no group numbers of their
  own. Recording is part of the lifecycle contract: a checkout that cannot
  be recorded is released and the call refused before the runtime starts
  (failed, internal); a process that cannot be recorded makes
  `EventSink.ProcessStarted` fail, the supervisor kills the group it just
  started (`PROCESS_RECORD_FAILED`) and the turn fails saying so. Records of schema v1alpha2 carry no effects, so the reaper never lists
  them and what such a run left is not reaped (pre-release records that
  held a group and token read with an empty reference and are left, with an
  error). Submitting a call starts a reap beside it, in the
  background: `app.Reaper` adopts each abandoned run that recorded effects
  (taking its owner lock, so one process does it), kills the group, removes
  the checkout, prunes worktrees, appends `EFFECTS_REAPED` and finishes the
  run as lost (`abandoned`). The call knows nothing of it and is never
  delayed by it; the composition root wraps the client (`ReapOnSubmit`),
  and at most one reap runs at a time in a process. A step that fails is
  recorded and does not stop the call or the rest. Tests: app
  (spies), git, process, run store, and an end-to-end kill of a real
  `agister run`.
- **Residual gap:** effects are reaped only after the next call is
  submitted (and not while settings fail the gate: a refused Submit starts
  no reap), not when the run is read or at service start; until then they
  stay. The reap is not awaited: a CLI that exits before it ends leaves the
  run it was reaping adopted but unfinished, and the next reap does it
  again (killing a gone group and removing a gone checkout succeed). A
  Submit that arrives while a reap is running starts no further pass, so a
  run abandoned after that reap's scan waits for a later call; this matters
  for a long-lived client (trigger: the service; then a pending flag reruns
  once after the active reap). A group
  whose leader is alive with a different or unknown token is left alone
  (the ID may be reused) and the event says so; the run is then finished
  anyway, so that leftover is not retried. A kill between creating the
  checkout (or starting the runtime) and recording it leaves it
  unrecorded; only a failed record is handled. Reaping is
  bounded (30s by default): runs not reached stay for the next call, and a
  checkout that a running run records as its own is skipped and the event
  says so. The token check and the kill are not atomic (macOS has no
  pidfd), so a PID reused with the same start second and command between
  them could be hit. The token includes the command name, so a runtime
  wrapper that execs another program after start makes its group
  unidentifiable; it is then left alive (the safe direction) and the run is
  finished without retry. A failed or timed-out reap step is not retried:
  the run is finished once, by design, and making cleanup retryable is
  future work. A tampered run record can point at a checkout-shaped
  directory Agister did not create; that is outside the single-user threat
  model, since whoever can write run records controls Agister's home.
  A reap reports failing to list abandoned runs, to append
  `EFFECTS_REAPED` or to finish a run, but not failing to adopt one or to
  read its record: `fsruns` returns the expected refusals (owned,
  finished, not found) and real I/O errors alike, and `List` and
  `Abandoned` skip records they cannot read. Such a run stays unreaped
  with nothing logged (trigger: the next change to the reaper or `fsruns`,
  or such a run seen left behind; then `fsruns` returns sentinels for the
  expected refusals and the reap reports the rest).
  The error sink is optional: `BackgroundReaper` drops a reap's error when
  its `Report` is nil. The one composition root sets it and a test pins
  that (trigger: a second place that builds a `BackgroundReaper`, such as
  the service; then a constructor requires the sink, or a logging decorator
  supplies it at the composition root).
- **Trigger for the rest:** the service (ADR-001 rule 16), or earlier if
  leftovers between calls become a nuisance.
- **Done when (rest):** the service reaps on start and periodically, and
  reads of a lost run may report what was left.

## 3. Permission mappings carry no verification evidence

- **Gap:** ADR-001 rule 4 trusts a mapping only once verified against the
  real runtime. Each primitive lists the versions it was verified against
  (`verified`), and a plan uses only primitives verified for the installed
  version; but the list is typed by hand, and nothing records what was
  checked. The shipped lists also extrapolate: `"2.1."` vouches for every
  2.1 patch, though `Read` and `Grep` were checked on 2.1.283 and `Glob` on
  2.1.284. Pinning exact patches would refuse every call after each Claude
  Code update until someone re-checked by hand; the live refusals all name
  one `--restricted` check, which suggests one mechanism across the file
  tools, but that is inference, not evidence.
- **Verified so far (live, Claude Code 2.1.283):** Bash cannot be fenced by
  prefix rules; `Read` and `Grep` outside the working directory are
  refused, including through symlinks in the workspace; a project
  `CLAUDE.md` is not applied under `--restricted`. On 2.1.284, `Glob` is
  confined the same way: an absolute, `..` or `~` path, an absolute
  pattern, and a path through a symlink that leaves the workspace are
  refused; `**/*` and `../` or `linked/` patterns list nothing outside it,
  and a symlinked file pointing outside is not listed.
- **Unverified:** `Edit`, `Write` and `NotebookEdit` confinement; `WebFetch`
  and `WebSearch` granting only `network`; everything about Codex (see
  `examples/codex/`).
- **Why deferred:** an unverified primitive is never granted, so the gap is
  one of evidence, not of exposure. Until 2026-09-29 a single
  `verified_versions` list vouched for the whole mapping, and `select: any`
  granted the then unverified `Glob` to every read-only policy; such a list
  is now refused.
- **Trigger:** the first policy that allows `repository.write` or `network`,
  or enabling Codex.
- **Done when:** an opt-in live suite (build tag, real CLIs) exercises each
  primitive of a shipped mapping and asserts nothing outside its declared
  grants happened; each mapping lists that evidence (suite run, date,
  runtime version) next to its `verified` versions.

## 4. Failure classes seen only in field names

- **Gap:** ADR-001 rule 6 lets workflows route on a failure class. Only
  `budget_exhausted` (Claude `error_max_budget_usd`) and the transport
  classes (timeout, cancelled, no result, runtime unavailable) have been
  observed. Claude's `rate_limited`, `auth` and `context_overflow` follow
  `api_error_status` and message text; every Codex class follows message
  text. A misread class falls back to `runtime_error`, which is safe for
  routing but hides a retryable failure.
- **Why deferred:** these failures cannot be provoked on demand here (the
  environment's proxy authenticates every request).
- **Trigger:** the first real occurrence, or a workflow that retries on a
  class.
- **Done when:** each class has a fixture copied from real runtime output.

## 5. The cost limit is the runtime's, and soft

- **Gap:** Claude Code checks `--max-budget-usd` between model requests, so
  a call can overshoot: live, a $0.0001 limit ended at $0.0010. The
  overshoot is recorded (the result's cost), not prevented. Runtimes that
  cannot limit cost (Codex) are refused whenever a limit applies.
- **Why deferred:** one call's overshoot is bounded by one model request.
- **Trigger:** budgets across calls (workflow budgets), or an overshoot that
  matters.
- **Done when:** Agister tracks spend per budget across calls and stops
  submitting once it is spent.

## 6. `resources` and `artifacts.retain` are refused

- **Gap:** the research `static-review` policy declares `resources` and
  `artifacts.retain`, but Agister cannot reserve a resource or retain an
  artifact. Until 2026-09-29 both were parsed and then ignored; a policy or
  process that declares either is now refused, so the research policy
  parses only without them.
- **Why deferred:** both describe a service with shared resources and
  artifact retention; the CLI stage has neither.
- **Trigger:** the service (ADR-001 rule 16), or the first caller that
  needs either field.
- **Done when:** each field is accepted again with an effect a test
  observes.

## 7. No provenance is recorded

- **Gap:** constraints on a revision's writer read
  `<home>/provenance/<revision>.json`, but nothing writes it: Agister keeps
  an agent's changes as a patch artifact and never commits them. Every
  writer is therefore unknown, so `on_unknown: pass` always passes and
  `on_unknown: fail` always refuses. The shipped policies carry no such
  constraint (a test keeps it so): one that always passes would look like
  a guard against self-review and be none.
- **Why deferred:** there is no revision Agister produced to record.
- **Trigger:** the first time Agister commits an agent's changes, or a
  workflow that must refuse self-review on evidence rather than trust.
- **Done when:** committing an agent's changes records its agent, model
  family and run for the new commit, and a test shows a same-family
  reviewer refused for it.

## 8. The project layer is chosen per process, not per call

- **Gap:** the composition root picks one project layer from the process's
  working directory, while each call carries its own `Cwd`.
- **Why deferred:** the CLI serves one working directory per process, so
  the two always agree today.
- **Trigger:** the service (ADR-001 rule 16), or any client that submits
  calls from more than one working directory.
- **Done when:** definitions resolve per call from the call's working
  directory, with a test that two calls from different repositories see
  their own settings.

## 9. A call's only life-cycle limit is its overall timeout

- **Gap:** while a call runs, Agister tracks it by one wall-clock cap
  (the policy's `timeout`) and the runtime's soft cost limit (item 5).
  Nothing tells a slow call from a stuck one: a runtime that emits no event
  for a long time, a single tool command that hangs (a `go test` with no
  timeout of its own), an agent repeating the same failing step, and a turn
  waiting out a rate limit all look alike until the cap fires. A cap long
  enough for honest work (45 minutes for an implementer) is then the only
  thing that ends a hang, and the time is lost.
- **Evidence:** dogfooding on 2026-09-29: the `implement` policy needs
  `timeout: 45m` for a batch a Sonnet subagent took about 17 minutes to do.
  During the Opus run the runtime reported `RATE_LIMITED` with
  `allowed_warning`; nothing in the run says whether a later silence is
  that wait or a hang. `agister runs show` on the running Sonnet call
  printed the raw record: no status, no last event, no time since it;
  only `runs watch` (the event stream) showed what it was doing.
- **Open:** which signals Agister owns or can read: the time since the last
  runtime event (an idle limit), the duration of the current tool call
  (a per-command limit, where the runtime reports tool start and end), the
  runtime's own rate-limit and retry events, repetition of identical tool
  calls, and the process group's CPU use as liveness. For each: how a policy
  declares it, which failure class it ends in (a hang is not a timeout of
  honest work), what the run record shows while the call is running
  (a readable progress state, not only the event log), and which of them
  diagnose without deciding (ADR-001 rule 13).
- **Trigger:** calls that run unattended for longer than a review, such as
  implementers, or the service.
- **Done when:** a policy can bound a call by more than its overall
  timeout; a stuck call (no event, or a hung tool command) ends early in a
  class of its own, with tests using an injected clock; and a running
  call's record says what it is doing and since when.

## 10. The repository's own `.agister` processes are not tested

- **Gap:** no test runs or checks the review, judge and implement
  processes in the repository's `.agister/`. `main_test.go` builds
  temporary settings trees only. `agister check` passing is the only
  evidence, and `check` has missed a failure that only a run shows (the
  `$schema` case in `findings.md`).
- **Evidence:** review round 2 on 2026-09-29 (tests#2) noted that
  `implement.yaml` has no execution test, though it ran for real several
  times that day.
- **Trigger:** a repository `.agister` process that passes `check` but fails
  at run time, or a test that checks the repository's own settings.
- **Done when:** a test composes the repository's `.agister` and runs each
  process against a fake runtime, `implement` included.

## 11. The resolution types are package-private

- **Gap:** `Calls` and `Inspection` each declare their own resolver
  interface, but its result and arguments (`resolution`, `overrides`) are
  unexported. Only a double inside `internal/app` can stand in for the
  resolver; a use case cannot be tested from another package against a
  resolver of its own.
- **Evidence:** the architecture audit's review round 2 on 2026-09-29
  (architecture#1). The judge fixed the concrete `*Resolver` dependency and
  deferred exporting the types.
- **Trigger:** a test or a component outside `internal/app` that needs to
  substitute resolution.
- **Done when:** each consumer's resolver interface uses result and
  argument types that consumer owns, and a resolver adapter translates
  into them.
