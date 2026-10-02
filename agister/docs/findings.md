# Findings from running Agister against real runtimes

- **Claude Code's Bash cannot be fenced.** With Bash exposed for `git diff`
  only, the agent ran `git show` without a permission denial: Claude Code
  auto-approves its read-only commands once Bash exists. The Claude mapping
  declares Bash as granting everything, so a policy that denies command
  execution gets file tools only.
- **Codex emits non-terminal errors.** Reconnects and transport fallbacks
  arrive as `error` events mid-turn; only `turn.completed` or `turn.failed`
  decide a turn.
- **Claude Code can report an error with subtype `success`.** On
  2026-10-02, run `20261002T055359Z-38363e` ended at the session limit
  with a result containing `subtype: "success"`, `is_error: true`,
  `api_error_status: 429` and `stop_reason: "stop_sequence"`. Its text was
  "You've hit your session limit · resets 12:30pm (Europe/Moscow)".
  The adapter correctly classified it as `rate_limited`, but its message
  said "runtime reported success". It now says "runtime reported an error
  (429)" and keeps the result text; named error subtypes remain in messages.
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
  `examples/pi/runtimes/pi.yaml`. `edit`, `write` and `bash` were not
  checked and remain unverified, so never granted.
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
