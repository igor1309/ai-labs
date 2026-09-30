# Deferred work

Known gaps accepted for the CLI stage. Each has a trigger: do it then, not
before.

## 1. Effects of a killed CLI wait for the next call

- **Gap:** after `agister run` is killed with SIGKILL, its runtime process
  group and checkout stay until the next submitted call reaps them.
- **Trigger:** the service (ADR-001 rule 16).
- **Done when:** the service reaps on start and periodically.

## 2. Permission mappings carry no verification evidence

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

## 3. Failure classes seen only in field names

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

## 4. The cost limit is the runtime's, and soft

- **Gap:** Claude Code checks `--max-budget-usd` between model requests, so
  a call can overshoot: live, a $0.0001 limit ended at $0.0010. The
  overshoot is recorded (the result's cost), not prevented. Runtimes that
  cannot limit cost (Codex) are refused whenever a limit applies.
- **Why deferred:** one call's overshoot is bounded by one model request.
- **Trigger:** budgets across calls (workflow budgets), or an overshoot that
  matters.
- **Done when:** Agister tracks spend per budget across calls and stops
  submitting once it is spent.

## 5. `resources` and `artifacts.retain` are refused

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

## 6. No provenance is recorded

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

## 7. The project layer is chosen per process, not per call

- **Gap:** the composition root picks one project layer from the process's
  working directory, while each call carries its own `Cwd`.
- **Why deferred:** the CLI serves one working directory per process, so
  the two always agree today.
- **Trigger:** the service (ADR-001 rule 16), or any client that submits
  calls from more than one working directory.
- **Done when:** definitions resolve per call from the call's working
  directory, with a test that two calls from different repositories see
  their own settings.

## 8. A call's only life-cycle limit is its overall timeout

- **Gap:** while a call runs, Agister tracks it by one wall-clock cap
  (the policy's `timeout`) and the runtime's soft cost limit (item 4).
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

## 9. The repository's own `.agister` processes are not tested

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

## 10. The resolution types are package-private

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

## 11. No test proves the reaper is wired to the supervisor's processes

- **Gap:** `TestBuiltClientReapsAbandonedRunsWhenACallIsSubmitted` asserts
  the supervisor's own `ParseRef` error among the reap's errors, but no
  mutation shows that `main.go` wires `supervisor.Processes`: swapping it
  for a nil-embedded double panics the test binary instead of failing a
  test, so `revert-check.py` cannot count it.
- **Evidence:** the round-2 implementer on 2026-09-29 dropped that mutation;
  the remaining one only removes the error in `processes.go`.
- **Trigger:** a change to the reaper's wiring in `main.go`.
- **Done when:** a mutation replacing `supervisor.Processes{}` in `main.go`
  with a well-formed double fails a test cleanly.

## 12. No fresh-context attempt after verification is exhausted

- **Gap:** ADR-002 repairs in the call's own session and fails the node when
  its attempts run out or it makes no progress. An agent anchored on a wrong
  approach does not get a clean start with the evidence of the failed one;
  that needs an outer step, and no workflow layer exists.
- **Evidence:** prior art separates the tiers: the-furnace's in-session
  correction budget from its fresh-container phase attempts, X15's
  `fixAttempts` from `runAttempts`
  ([prior art](../../research/agister/research/verify-repair-prior-art.md)).
- **Open:** where the outer attempt lives (a workflow step, or a process
  policy); what it receives (the failed checkout, its diff, the last run's
  output, or only the task); its own budget, apart from call and
  verification attempts.
- **Trigger:** the first node that fails verification where a fresh attempt
  would plausibly have passed.
- **Done when:** a node that exhausts verification can be retried once in a
  fresh session with the failed attempt's evidence, under a budget of its
  own, and the record links both attempts.

## 13. Verification cannot tell a flake or a weakened check

- **Gap:** ADR-002 sends every failing run to the agent, and the agent can
  edit what the command reads (tests, `Makefile`, test data). A flaky
  failure costs a repair turn on noise; a repair that deletes or weakens a
  test passes. Changed paths are recorded, not refused.
- **Evidence:** ImpossibleBench (arXiv 2510.20270) finds frontier models
  cheat on impossible tasks often, Claude models mostly by editing tests.
  Verger lessons #9 and L120: a flake is its own row, never rerun until
  green.
- **Open:** paths a repair turn may not change, as a setting; running the
  command against a pinned copy of the checks; how a failure outside the
  change is recognised without rerunning it.
- **Trigger:** the first repair turn spent on a flake, or the first repair
  that passed by changing a check.
- **Done when:** a process can declare paths its repair turns may not
  change, and a turn that changes one ends the node with that evidence.

## 14. Verification lends the operator's authority to agent-written code

- **Gap:** ADR-002's verification command runs with Agister's own authority,
  not the agent's permissions, and what it runs (tests, `Makefile` targets,
  build scripts) can be code the agent wrote in the same checkout. A repair
  turn can therefore reach, through the command, what its permissions
  withhold: writing outside the checkout, the network, Agister's state
  (ADR-001 rule 9).
- **Evidence:** review round 1 of ADR-002 (2026-09-30), Codex Sol 6 high.
  The Codex read-only sandbox refuses writes for the agent itself
  (`.agister/runtimes/codex.yaml`), but nothing confines the command.
- **Open:** running the command under an OS confinement Agister owns (a
  sandbox profile, a container, another user); which permissions a
  confined command has, stated in Agister's vocabulary; refusing `verify`
  where the confinement cannot be enforced.
- **Trigger:** before verification runs unattended, or for an agent whose
  output is not reviewed by a human before it lands.
- **Done when:** the command runs confined to its checkout, a test shows a
  command that writes outside it or reads Agister's state is refused, and
  `check` reports the confinement a `verify` runs under.

## 15. Nothing stops two continuations of one session at once

- **Gap:** a continuation resumes a provider session in place (ADR-001
  rule 12). Two calls continuing runs of the same session at the same time
  both append to it, as two `claude --resume` in two terminals would; the
  runtimes do not prevent it either.
- **Evidence:** the session-resume change (2026-09-30). A scan of run
  records for a later run in the chain was built and removed: it needed
  complete, readable records and a proof that a failed continuation
  touched nothing, and it covered one state directory only.
- **Trigger:** anything that continues runs automatically, such as a
  workflow.
- **Done when:** concurrent continuations of one session are prevented by
  an owned lock on the session, with a test.
