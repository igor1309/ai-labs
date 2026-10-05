---
date: 2026-10-05
author: Igor Malyarov
model: claude-opus-5-5
name: Agent CLI behaviour
version: 0.0.1
type: prompt
---

Applies to a program, in any language, that starts coding-agent CLIs
(Claude Code, Codex, pi, opencode) without a person at the keyboard and
reads what they report: what ends a turn, how errors and limits arrive,
what a permission setting really allows, and where skills come from. Skip
it for code that uses a model API directly.

Each fact below was observed once, on the CLI version and date beside it.
These CLIs change often, so a fact ages: before code relies on one, check
it against the installed version, and keep the version and date with
whatever you observe. "Not recorded" means the observation has no version
or date; "not checked" means nobody looked. Treat both as unknown.

For every CLI

* Decide a turn by the CLI's own terminal report first, then by your
  timeout or cancellation, then by the process exit. Never upgrade a
  failure the CLI reported.
* A restriction can grant more than its name says. Before you rely on one
  to withhold something, try the thing it should refuse, on the version
  you run, and record what happened.
* The CLI reports its session's ID; resume by that ID. Do not choose one.
* A cost the CLI did not report is unknown, not zero.
* A CLI run in a repository loads that repository's skills and
  instruction files as it would for a person working there, unless a flag
  turns that off. What it loads is part of what the agent was told.

Claude Code

What ends a turn, errors and limits

* A result can be an error with `subtype: "success"`. At the session
  limit the result held `subtype: "success"`, `is_error: true`,
  `api_error_status: 429`, `stop_reason: "stop_sequence"` and the text
  "You've hit your session limit · resets 12:30pm (Europe/Moscow)". Read
  `is_error` and the status, not the subtype alone, and keep the text.
  (2026-10-02, version not recorded.)
* The cost limit overshoots: `--max-budget-usd 0.0001` ended the turn with
  `error_max_budget_usd` after $0.0010 was spent. (2.1.283, date not
  recorded.)
* `input_tokens` counts only uncached input; cache reads and writes are
  reported apart. (2.1.283, date not recorded.)
* `--json-schema` rejects a schema that declares draft 2020-12 in
  `$schema`: the call failed at the start, in 1.7 s, at no cost.
  (2026-09-29, version not recorded.)
* `--resume <id>` alone keeps the session ID (2.1.285, 2026-09-30).
  `--resume <earlier> --fork-session --session-id <new>` continues in a
  new session and leaves the earlier one unchanged, and a session is
  found when resumed from another working directory (2.1.283, date not
  recorded).

What the permission settings allow

* Bash cannot be fenced. With Bash exposed for `git diff` only, the agent
  ran `git show` with no permission denial: read-only commands are
  approved once Bash exists. Count Bash as granting everything. (2.1.283,
  date not recorded.)
* Read, Grep and Glob reach the host. With `--permission-mode dontAsk` and
  the tool in `--tools` and `--allowedTools`, each read, matched or listed
  a file in a directory outside the working one, with no denial. (2.1.285,
  2026-09-30; again 2.1.288, 2026-10-03.)
* Write reaches the host: alone, it created a file in the repository and
  one in a sibling directory outside it, with no denial. Edit alone
  refused both: "File has not been read yet. Read it first before writing
  to it." With Read, Edit changed both. (2.1.288, 2026-10-03, with
  `--strict-mcp-config`.)
* Under `--restricted`, Glob is confined as Read and Grep are: absolute,
  `..` and `~` paths, an absolute pattern and a path through a symlink
  that leaves the workspace were refused, and `**/*` listed nothing
  outside it. (2.1.284, date not recorded.)

Skills and instructions

* In `-p` with `--permission-mode dontAsk`, `--tools=Read,Skill` and
  `--strict-mcp-config`, it listed the repository's `.claude/skills`, the
  synced skills under `~/.claude/skills/synced/<id>/<name>/SKILL.md` (as
  `anthropic-skills:<name>`) and a built-in skill. It did not list
  `.agents/skills`. (2.1.287, 2026-10-02.)
* In a linked git worktree of a commit without `.claude/skills`, it
  listed the main checkout's untracked one. (2.1.287, 2026-10-02.)
* With no setting-sources, bare or safe mode flag it offers the Skill tool
  on every turn. A skill with no `name` takes its folder's name.
  (Recorded 2026-10-02 for 2.1.287.)
* Not probed, and loaded from outside those folders: managed-settings
  skills, `.claude/commands/` files, and a `.claude/skills` below the
  repository's root, once it works on files there.
* A turn in a directory loaded that directory's `AGENTS.md` and offered
  Skill, which used a project skill. (2.1.285, 2026-09-30.)

Codex

What ends a turn, errors and limits

* `error` events are not terminal. Reconnects and transport fallbacks
  arrive as `error` events in the middle of a turn; only `turn.completed`
  or `turn.failed` decide it. (`exec --json`; version and date not
  recorded.)
* A prompt over 1,048,576 characters fails with the reason on stderr only,
  `Input exceeds the maximum length of 1048576 characters ...
  input_too_large`, and nothing in the event stream. Keep a tail of
  stderr. (codex-cli 0.159.2, date not recorded.)
* A schema for structured output must list every property in `required`:
  `400 invalid_json_schema: 'required' is required to be supplied and to
  be an array including every key in properties`. The turn fails before
  it starts. (codex-cli 0.160.0, 2026-10-05.)
* `exec` can neither be given a session ID nor fork a session; resume in
  place by the ID it reported. (2026-09-30, version not recorded.)

What the sandbox allows

* Its sandboxes read outside the workspace, and a sandbox always allows
  running commands: a read-only sandbox is not a read-the-repository-only
  one. (Version and date not recorded.)
* `workspace-write`: writing in the workspace and under `/tmp` worked;
  writing elsewhere in the home directory, `git commit` (`.git` stays
  read-only) and the network were refused. (codex-cli 0.159.2,
  2026-09-30.)
* Inside the sandbox, process inspection and serving on a local port are
  denied (`/bin/ps: operation not permitted`), so a test suite that does
  either fails there and passes outside. (2026-10-02, version not
  recorded.)

Skills and instructions

* `exec` with `--ignore-user-config --ignore-rules` took its skill roots
  from the repository's `.codex/skills` and `.agents/skills`,
  `~/.codex/skills` with its `.system`, and `~/.agents/skills`. A skill
  that is a symlink to a folder outside was listed. Run from a
  subdirectory, it added that directory's `.agents/skills`. (codex-cli
  0.159.2, 2026-10-02.)
* The repository's `.codex/skills` is loaded though Codex's skills page
  does not name it. (Same probe.)
* `--ignore-user-config` reads no `config.toml`: its `[[skills.config]]`
  switches do not apply and plugin skills are not loaded. `codex debug
  prompt-input`, which does read it, also listed two plugin roots under
  `~/.codex/plugins/cache`; the call's request had none. (Same probe.)
* `~/.codex/skills` is `$CODEX_HOME/skills`. `/etc/codex/skills` is named
  as a root too; not probed.

pi

What ends a turn, errors and limits

* What its event stream ends a turn with is not recorded here. Check it.
* A provider's usage limit arrives as `429 GoUsageLimitError` (OpenCode Go
  plan, model `opencode-go/glm-5.3`). The window is rolling: a run started
  4 h 40 min after the first limit hit it again after 12 minutes. (0.85.1,
  2026-10-01.)
* A provider timeout ("Request timed out.") was seen at least once in a
  run that went on until its own time limit. (0.85.1, model
  `opencode-go/minimax-m3`, 2026-10-01.)
* It resumes a session only in the directory the session ran in. (0.85.1,
  2026-10-01.)

What the tool list allows

* There is no sandbox: the tool list is the whole restriction. `read`,
  `grep`, `find` and `ls` each read or searched both the checkout and the
  host (`/etc/hosts`, `/etc/ssh`). `write` and `edit` wrote in the
  checkout. `bash` ran in the checkout and wrote under `/tmp`: it reaches
  everything. (0.85.1, 2026-10-01.)

Skills and instructions

* With `-p --mode json --no-extensions --no-prompt-templates --no-themes
  --approve --offline --tools read` it loaded the repository's
  `.pi/skills` and `.agents/skills`, a symlinked skill, and
  `~/.agents/skills`; not `.claude/skills` or `.codex/skills`. (0.85.1,
  2026-10-02.)
* `--approve` trusts the project, which is why the project's folders
  load; `--no-skills` turns skills off; with neither `read` nor `bash`
  granted it leaves skills out. (Recorded 2026-10-02 for 0.85.1.)
* `$PI_CODING_AGENT_DIR/skills` (default `~/.pi/agent/skills`) is in its
  documentation and code; not observed. Its settings files can name more
  skill paths and package skills; not probed.
* It does not require a skill's `name` to match its folder.

opencode

All of this is 1.18.33 on 2026-10-01, from `opencode debug` and `opencode
run` with a model that does not exist: no model ran.

What ends a turn, errors and limits

* An unknown model gave an `error` event and exit 1. `run -s <id>` with an
  unknown ID gave `Session not found` and exit 1; with a known one it
  reported the same `sessionID`, from the session's directory and from
  another.
* An agent that is not found is replaced without failing: `agent "x" not
  found. Falling back to default agent`, and the run goes on as the
  default agent, with the default agent's permissions.
* `run` reads stdin as the message, and appends it to a message argument,
  which it quotes when it holds a space. With neither: `You must provide a
  message or a command`.

What the permission settings allow

* Built-in tools: `bash`, `read`, `glob`, `grep`, `edit`, `write`, `task`,
  `webfetch`, `todowrite`, `websearch`, `skill`, `question` (and
  `invalid`). There is no `list`.
* `{"*": "deny", "read": "allow"}` leaves only `read`. `write` is no
  permission: `"write": "allow"` enables nothing, and `"edit": "allow"`
  enables both `edit` and `write` (its documentation adds `apply_patch`).
* Rules keep the order of the config's keys and the last match decides:
  `{"read": "allow", "*": "deny"}` denies `read`. The `tools` option
  becomes permission keys placed before the permission's own.
* Global rules (the config's `permission`, `OPENCODE_PERMISSION`) come
  before the agent's, so they do not widen an agent that denies `*`. An
  agent of the same name in the checkout's `opencode.json` does: its
  `"bash": "allow"` was merged after the inline agent's `"*": "deny"`. So
  give an agent passed inline (`OPENCODE_CONFIG_CONTENT`) a name that is
  random per call.
* Not checked, as no model ran: that a denied tool is refused in a turn,
  that `external_directory` confines the file tools, what a session
  resumed elsewhere works on, and whether `tool_use` is written only for
  a call that has ended.

Skills and instructions

* `opencode debug skill` listed the repository's `.agents/skills` and
  `.claude/skills`, `~/.agents/skills`, `~/.claude/skills` (its synced
  skills), `~/.config/opencode/skills` and built-in skills. (1.18.33,
  2026-10-02.) It listed a checkout's `.opencode/skills` too (2026-10-01).
* That command runs without a call's `--pure` and inline configuration;
  whether those change a skill folder was not checked.

Not recorded for Codex, pi and opencode: which instruction files
(`AGENTS.md` and the like) each loads. Check before you rely on it.
