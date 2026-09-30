# Findings from running Agister against real runtimes

- **Claude Code's Bash cannot be fenced.** With Bash exposed for `git diff`
  only, the agent ran `git show` without a permission denial: Claude Code
  auto-approves its read-only commands once Bash exists. The Claude mapping
  declares Bash as granting everything, so a policy that denies command
  execution gets file tools only.
- **Codex emits non-terminal errors.** Reconnects and transport fallbacks
  arrive as `error` events mid-turn; only `turn.completed` or `turn.failed`
  decide a turn.
- **Codex sandboxes read outside the workspace.** Its mapping declares
  `host.read`, which is never granted, and it is not yet verified against a
  live Codex, so it ships opt-in (`examples/codex/`) and `check` refuses it.
- **Claude Code rejects draft 2020-12 schemas** passed with `--json-schema`,
  so example schemas declare no `$schema`. `agister check` still accepts
  one: on 2026-09-29 a project schema with the draft 2020-12 `$schema`
  passed `check` and the call failed at the runtime's start (1.7s, no
  cost).
- **Schemas were compiled only after the agent ran.** A broken schema cost a
  full call before failing. They are now compiled before the call and by
  `agister check`.
- **Workspaces were released after the run finished** (a deferred release),
  so a finished run could still have a live checkout. Found by the race
  detector through a spy test; the release now happens before the record
  is finished.

- **Continuation forks.** `--resume <earlier> --fork-session --session-id
  <new>` resumes the earlier conversation in a new session and leaves the
  earlier one unchanged; a resumed session is found from another working
  directory.
  Superseded 2026-09-30: continuation now resumes in place, by the ID the
  runtime reported, because Codex can neither preset an ID nor fork in
  `exec`; `--resume <id>` alone keeps the session ID (2.1.285). See
  [session resume observations](../../research/agister/research/session-resume-observations.md).
- **The cost limit overshoots.** `--max-budget-usd 0.0001` ended the turn
  with `error_max_budget_usd`, having spent $0.0010.
- **Usage excludes cached input.** Claude's `input_tokens` counts only
  uncached input; cache reads and writes are reported separately and kept
  apart in the node result.

- **Glob is confined like Read and Grep.** With only Glob exposed under
  `--restricted`, absolute, `..` and `~` paths, an absolute pattern and a
  path through a symlink leaving the workspace were refused; `**/*`,
  `../outside/*` and `linked/**/*` listed nothing outside the workspace,
  and a symlinked file pointing outside was not listed (2.1.284).

Verified live against Claude Code 2.1.283 (Glob: 2.1.284). Codex is covered by protocol
fixtures only.
