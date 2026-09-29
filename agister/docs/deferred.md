# Deferred work

Known gaps accepted for the CLI stage. Each has a trigger: do it then, not
before.

## 1. Effects outlive a killed Agister process (partly done)

- **Gap:** ADR-001 rule 12 (every effect owned and cleaned up). If the CLI
  process is killed with SIGKILL during a call, the runtime's process group
  keeps running and the candidate checkout stays on disk and in
  `git worktree list` until something reaps them. SIGINT, SIGTERM and
  SIGHUP are handled cleanly.
- **Evidence:** reproduced 2026-09-28 with the fake runtime (hang scenario):
  after `kill -9` of `agister run`, the runtime process and the worktree
  remained.
- **Done (2026-09-29):** a run records its checkout as soon as it exists and
  its process group, with the leader's start time as a token, as soon as the
  runtime starts. When a call starts, it adopts each abandoned run that
  recorded effects (taking its owner lock, so one process does it), kills
  the group, removes the checkout, prunes worktrees, appends
  `EFFECTS_REAPED` and finishes the run as lost (`abandoned`). A step that
  fails is recorded and does not stop the call or the rest. Tests: app
  (spies), git, process, run store, and an end-to-end kill of a real
  `agister run`.
- **Residual gap:** effects are reaped only when the next call starts, not
  when the run is read or at service start; until then they stay. A group
  whose leader is alive with a different or unknown token is left alone
  (the ID may be reused) and the event says so; the run is then finished
  anyway, so that leftover is not retried. A kill between creating the
  checkout and recording it leaves an unrecorded checkout. Reaping is
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
- **Trigger for the rest:** the service (ADR-001 rule 16), or earlier if
  leftovers between calls become a nuisance.
- **Done when (rest):** the service reaps on start and periodically, and
  reads of a lost run may report what was left.

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

## 8. The settings gate and the use case read settings separately (partly done)

- **Done:** each gated operation reads the settings once into an immutable
  snapshot (`app.Snapshot`, errors kept and replayed), builds its client on
  it (`Gated.Build`), checks with that client and runs the operation on the
  same client. `Calls.Submit` takes its snapshot before the run is recorded
  and the call's goroutine resolves only from it. `fsdefs.Store.Write` holds
  an exclusive lock on a file in the store's directory across the digest
  compare, the rename and the exclusive create, so Agister's own writers
  are serialized. Tests: a settings edit after the check does not reach the
  operation; a call resolves from the settings read before its run was
  recorded; the lock is held at each step of a write.
- **Remains:** a lock binds only Agister's own writers. A hand edit (or
  another program's write) landing between the compare and the rename can
  still be lost, so the promise is serialized writes, not that no edit is
  ever lost. The scope checkers that validate a write against global
  settings still read live; a write is protected by its approved digests and
  the serialized store, not by the snapshot.
- **Trigger:** the service (ADR-001 rule 16), where other clients edit
  settings while calls run.
- **Done when (rest):** a writer that cannot be raced by hand edits (for
  example, verifying the digest again after the rename and reporting a lost
  edit), if the service needs it.

## 9. Process timers use real time in tests

- **Gap:** the supervisor's kill-grace and timeout timers (`time.AfterFunc`)
  are real, so their tests (KillGrace 200ms in the claudecode, codex,
  logging and supervisor tests) depend on scheduling.
- **Trigger:** a flaky timer test.
- **Done when:** the supervisor takes an injected clock or timer and those
  tests drive it.
