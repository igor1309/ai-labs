# Deferred work

Known gaps accepted for the CLI stage. Each has a trigger: do it then, not
before.

## 1. Effects outlive a killed Agister process

- **Gap:** ADR-001 rule 11 (every effect owned and cleaned up). If the CLI
  process is killed with SIGKILL during a call, the runtime's process group
  keeps running and the candidate checkout stays on disk and in
  `git worktree list`. The run correctly reads as lost (`abandoned`), but nothing reaps
  its effects. SIGINT, SIGTERM and SIGHUP are handled cleanly.
- **Evidence:** reproduced 2026-09-28 with the fake runtime (hang scenario):
  after `kill -9` of `agister run`, the runtime process and the worktree
  remained.
- **Why deferred:** reaping needs a persistent owner. A real Claude turn
  ends on its own, so what is left is a temporary checkout.
- **Trigger:** the service (ADR-001 rule 16), or earlier if leftover
  checkouts become a nuisance.
- **Done when:** runs record their process group and checkout path as
  soon as they exist; reading a lost run (or service start) kills the
  recorded group, removes the checkout and runs `git worktree prune`; a test
  kills the owner and asserts both are gone.

## 2. Permission mappings carry no verification evidence

- **Gap:** ADR-001 rule 4 trusts a mapping only once verified against the
  real runtime. `verified_versions` is a label typed by hand; nothing
  records what was checked.
- **Verified so far (live, Claude Code 2.1.283):** Bash cannot be fenced by
  prefix rules; `Read` and `Grep` outside the working directory are
  refused, including through symlinks in the workspace; a project
  `CLAUDE.md` is not applied under `--restricted`.
- **Unverified:** `Edit`, `Write` and `NotebookEdit` confinement; `WebFetch`
  and `WebSearch` granting only `network`; `Glob` confinement; everything
  about Codex (see `examples/codex/`).
- **Why deferred:** every shipped policy is read-only and grants no network,
  so no unverified primitive is ever granted.
- **Trigger:** the first policy that allows `repository.write` or `network`,
  or enabling Codex.
- **Done when:** an opt-in live suite (build tag, real CLIs) exercises each
  primitive of a shipped mapping and asserts nothing outside its declared
  grants happened; each mapping lists that evidence (suite run, date,
  runtime version) next to `verified_versions`.

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

## 5. `resources` and `artifacts.retain` are accepted but not enforced

- **Gap:** policies and processes may declare `resources` and
  `artifacts.retain` (the research `static-review` policy does). They are
  parsed and validated, and then ignored: no call reserves a resource or
  retains an artifact because of them.
- **Why deferred:** both describe a service with shared resources and
  artifact retention; the CLI stage has neither. The research policy keeps
  parsing as written.
- **Trigger:** the service (ADR-001 rule 16), or the first caller that
  relies on either field.
- **Done when:** each field has an effect a test observes, or is rejected.

## 6. No provenance is recorded

- **Gap:** constraints on a revision's writer read
  `<home>/provenance/<revision>.json`, but nothing writes it: Agister keeps
  an agent's changes as a patch artifact and never commits them. Every
  writer is therefore unknown, so `on_unknown: pass` always passes (the
  shipped `static-review`) and `on_unknown: fail` always refuses.
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

## 8. The settings gate and the use case read settings separately

- **Gap:** `app.Gated` checks the settings, then the use case reads them
  again from disk; `Submit` resolves them later still, in the call's own
  goroutine. A settings edit landing in between is used unchecked. Writes
  have a similar window: `fsdefs.Store.Write` compares the expected digest,
  then renames the new file over it, so an edit landing between those two
  steps is lost.
- **Why deferred:** each window is a few milliseconds on a single user's
  machine, and resolution still refuses a definition that does not parse.
  The window the user can actually hit, between being shown a plan and
  typing yes, is closed: the write carries the approved digests and the
  store refuses a file that changed.
- **Trigger:** the service (ADR-001 rule 16), where other clients edit
  settings while calls run.
- **Done when:** each operation loads one immutable settings snapshot,
  checks it and hands that same snapshot to the use case (for a call,
  before its run is recorded); writes are serialized under a lock. Tests
  change the settings between the check and the use and assert that the
  checked snapshot is the one used.
