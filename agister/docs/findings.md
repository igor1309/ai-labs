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
- **Codex workspace-write, observed on codex-cli 0.159.2** (2026-09-30, a
  scratch repository): writing in the workspace and under `/tmp` worked;
  writing elsewhere in the home directory, `git commit` (`.git` stays
  read-only) and network were refused. Its mapping grants
  `repository.write` and `host.write`, not `repository.history.write`.
- **Pi's read tools reach both the repository and the host.** Pi 0.85.1
  under `pi/1`, checked live through Agister on 2026-10-01 with agent
  `pi-minimax`, model `opencode-go/minimax-m3`, process `ask_pi` and policy
  `read-only`, in a throwaway Agister home with `read`, `grep`, `find` and
  `ls` marked verified for the check:
  - Run `20261001T141844Z-77906d` completed ($0.0040, 23.7 s). The plan
    granted `[read grep find ls]` and withheld `repository.diff`,
    `repository.history.read` and `process.execute`. `read` read
    `agister/internal/adapters/runtime/pi/pi.go` in the checkout and
    `/etc/hosts` outside it. The record holds runtime `pi`, contract
    `pi/1`, version `0.85.1`, the profile's model, the reported session
    and the cost with source `runtime`.
  - Run `20261001T141916Z-879ab7` completed ($0.0017, 11.2 s). `ls`
    listed `/etc/ssh` and `agister/examples/pi`; `find` found `hosts`
    under `/etc`; `grep` matched in `/etc/hosts` and under
    `agister/internal/adapters/runtime`.
  Each of the four tools read or searched the repository and the host,
  as the mapping declares; they are now verified for `0.85.` in
  `examples/pi/runtimes/pi.yaml`.
  - Run `20261001T153224Z-96ad8f` completed ($0.0044, 20.9 s), process
    `write_pi`, policy allowing everything, with `edit`, `write` and
    `bash` also marked verified. `write` created a file and `edit`
    changed one in the checkout; both are in the run's `changes.patch`.
    `bash` ran in the checkout (`pwd`, `git status`) and wrote
    `/tmp/agister-pi-bashcheck` outside it.
  `edit` and `write` write the repository and `bash` reaches everything,
  as the mapping declares; they are now verified for `0.85.` as well.
- **MiniMax M3 on Pi did not finish LAB-45 in two 45-minute runs.**
  Process `implement_pi`, agent `pi-implementer-m3` (Pi 0.85.1, model
  `opencode-go/minimax-m3`, effort `high`), brief
  `testdata/briefs/lab-45-opencode-runtime.md`, on 2026-10-01:
  - Run `20261001T153433Z-59b597` timed out ($1.2166, 415k in / 75k out
    tokens). It wrote the adapter, a fake binary and unit tests (about
    1,160 lines) with three tests failing, left a built binary in the
    checkout, and did not reach the wiring, settings test or examples.
    The provider timed out at least once ("Request timed out.").
  - Agister refused `--continue` of that run before any checkout, as
    designed: Pi resumes only in the directory it ran in.
  - A fresh run `20261001T162155Z-d44714` on the committed partial work,
    with a short brief of what was left, timed out too ($0.5547, 200k in
    / 119k out tokens). It fixed the three tests (all runtime adapter
    tests passed) and touched nothing else that was left. Provider
    timeouts again.
  The work was discarded; LAB-45 went to another model.
- **GLM-5.3 on Pi ran into the OpenCode Go usage limit twice on LAB-45.**
  Process `implement_pi_glm`, agent `pi-implementer-glm-53` (Pi 0.85.1,
  model `opencode-go/glm-5.3`, effort `high`), the same brief and
  45-minute limit, on 2026-10-01:
  - Run `20261001T170918Z-310efe` failed `rate_limited` after 24m6s
    ($2.5615, 185k in / 52k out tokens): `429 GoUsageLimitError`. It
    read the code and built a fake model server outside the checkout to
    probe OpenCode; it wrote nothing in the checkout, so no patch.
  - Run `20261001T192109Z-2228ea`, started when the rolling limit
    cleared, failed the same way after 18m48s ($3.0066, 170k in / 54k
    out tokens), leaving a first draft of the adapter and `Spec.Env` in
    the supervisor (547 added lines), no tests.
  One rolling window of the Go plan holds about $3 of GLM-5.3, less than
  this task needs. Agister classified both as `rate_limited` and kept
  the second run's patch.
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
- **Without `--restricted`, the file tools reach the host.** Claude Code
  2.1.285 under claude-code/3 (`--permission-mode dontAsk`, the tool in
  `--tools` and `--allowedTools`, 2026-09-30, a scratch directory): Read,
  Grep and Glob each read or listed a file in another temporary directory,
  with no permission denial. Their mapping declares `host.read`, which is
  never granted, so the shipped mapping grants a Claude call no file tool.
  The same turn loaded the directory's `AGENTS.md` and offered Skill, which
  used a project skill.

Verified live against Claude Code 2.1.283 (Glob: 2.1.284). Codex is covered by protocol
fixtures only.
