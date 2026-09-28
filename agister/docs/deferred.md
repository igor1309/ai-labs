# Deferred work

Known gaps accepted for the CLI stage. Each has a trigger: do it then, not
before.

## 1. Effects outlive a killed Agister process

- **Gap:** ADR-001 rule 11 (every effect owned and cleaned up). If the CLI
  process is killed with SIGKILL during a call, the runtime's process group
  keeps running and the candidate checkout stays on disk and in
  `git worktree list`. The run correctly reads as lost (`abandoned`), but nothing reaps
  its effects. SIGINT and SIGTERM are handled cleanly.
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
