# Agister CLI

Runs agent calls, and workflows of them, whose agents, processes,
permissions and output contracts are settings, not code. The decisions are
in [docs/adr/](docs/adr/); start with
[ADR-001](docs/adr/001-agister-cli-architecture.md).

## Build and try

```bash
cd agister
go build -o bin/agister ./cmd/agister
bin/agister --help          # every command and option
bin/agister init            # example settings into ~/.agister
bin/agister install .agister # a repository's settings into ~/.agister
bin/agister check           # validate the settings
bin/agister run ask --param question="What does cmd/agister do?"
bin/agister runs show <run-id>
bin/agister pages           # a page of what the settings can run
```

Agister's generic code (the process supervisor, the manual clock, the
in-process fakes and the test-discipline check) is the `gokit` module next
to it, [../gokit](../gokit/README.md), which `go.mod` points at with a
`replace`: build from a checkout of the repository.

`agister pages` serves a local page that shows the workflows and processes
a repository's settings can run and what they are made of:
[pages/README.md](pages/README.md).

## Settings

Global settings live in `~/.agister/` (`$AGISTER_HOME` or `--home`); a
repository's own `.agister/` takes priority, document by document. Commands
check the composed settings before use. A problem refuses only what uses
the document it is in: a call whose process, agent, runtime mapping,
policy, schema, prompt, skill or named verification is broken is refused
before its first turn and recorded, and a workflow with such a node is
refused before any node runs; everything else keeps running. Only broken
service settings, a file or a skill's folder whose name is not a name, a
settings directory that cannot be listed, or a workflow named like a
process stop every command except `init`, `install`, `check`, cancelling a
run and following an admitted run.
`check` reports every problem and says what each refuses. When a problem
names a field, a field's shape, an adapter, an input source or a schema
version this binary does not know, the check adds a line saying the
settings may need a newer binary, and `agister --version` names the binary
that is running. A field's shape this binary does not know is a list or a
mapping where it reads a scalar, such as a field of an input value. A call
or a workflow refused for such a problem prints the same line after its
summary, and its record's `result.error.unknown` counts the problems; an
install refused for such a problem prints it after the problems. A known
field with a wrong value adds no such line. Runs are
recorded under `~/.agister/runs/<id>/`.

Listings and shows display refused items. An agent selected with `--agent`
is checked in place of the process's default agent. A write is refused if
it adds a problem; existing document problems do not stop it.

`agister init` installs the example settings. `agister install <dir>`
installs a folder laid out like the settings, such as a repository's
`.agister/`, into home, document by document
([ADR-016](docs/adr/016-settings-are-installed-into-home-with-a-backup.md)).
It shows what it would create, replace (with a diff), leave unchanged and
keep (documents only home has), checks the result on a staged copy, and
writes only after you type yes, and only if home's settings are still as
shown. It backs up what it replaces under `~/.agister/backups/<stamp>/`
first, and prints the command that undoes it, `agister install --restore
<stamp>`. The last five backups are kept. Files that are not settings are
listed and not installed; a symbolic link in the folder refuses it. Like
`init`, both work on settings that fail check.

A process declares its verification command inline, or names a document
that holds it: `verify: verify:repo` is `verifies/repo.yaml`, found like any
other document, the repository's before the global one. So a process shared
by every repository carries no command, and each repository states its own
once. A process whose named verification exists in neither place is not a
problem of the settings: `check` warns, and only calls of that process are
refused ([ADR-010](docs/adr/010-a-process-names-its-verification.md)).

A policy may set staleness limits under `stale`, and a process may only
narrow them: `no_event`, `tool_command` and `repeated_tool_calls` for an
agent turn, `no_output` for a verification run. A call that reaches one
ends before its timeout, and its record names the limit and what went
stale, unless the settings give it resumes to recover with
([ADR-024](docs/adr/024-a-stale-call-is-resumed-once.md)):
`stale.recover.max_resumes`, which a policy sets and a process may only
lower, down to 0, and `stale.recover.instruction`, which a budget above 0
needs. Unset, the budget is 0, and every limit ends the call. With a
budget, an agent turn that Agister ended at a limit is followed by a
recovery turn: the call's session is resumed, in the same worktree, with
the instruction and the evidence of what went stale. Each recovery turn
spends one resume. The same limit reached again on the same thing ends
the call with that limit's status and class, even with resumes left, and
so does any limit once none is left. A call with a budget is refused
before its first turn unless its agent's sessions may be continued and
its runtime can resume one, and `process show` prints the budget
(`recovery resumes N`).

A verification run ended at `no_output` is a failed attempt, whatever
`stale.recover` says: a repair turn follows it as it follows a failing
run, while an attempt is left of `verify.max_attempts`. With one attempt,
the call ends as interrupted, as before.

The run's record lists its recovery turns under `recoveries`, each with
its `number`, the turn it `follows` and what went `stale` there, the
digest of the message, the session it `resumed` and the one it reported,
its usage, cost and timing, and its `outcome`: `completed`, `same_limit`,
`different_limit` or `failed`, with the `error`. The events are
`RECOVERY_STARTED`, `RECOVERY_FINISHED` and, with the reason,
`RECOVERY_NOT_STARTED`; a repeated call's `STALE` event carries the last
`result` the runtime reported for it, if any.

The run's record holds what the runtime reported the agent did on the way
under `trail`, over every turn of the call, the repair and recovery turns
too: `touched`, the paths its tool calls wrote, in order, each with the
`tool` of its first write and kept once, and `denied`, each tool call the
runtime refused for want of a permission, with its `tool` and bounded
`input`. The events are `TOUCHED`, one per path a tool call writes, with
the `path`, the `tool` and the call's `tool_use_id`, recorded when the
call starts, and `PERMISSION_DENIED`, one per denial, with the `tool` and
the `input`; `runs watch` prints a line for each. A path is as the runtime
gave it: Agister neither resolves nor judges it, and blocks nothing by
it. The trail is evidence of what the agent reached for, where the patch
is what the call left: a turn that a staleness limit ended, or that was
killed, keeps what it reported before it ended. Claude Code reports the
paths of its `Edit`, `Write`, `MultiEdit` and `NotebookEdit` calls, and
its denials; Codex the paths of its file changes, and no denial, for its
stream has none. A file a shell command wrote is not among them. OpenCode
and Pi report neither, and a record with nothing reported has no `trail`.

The run's record lists the `inputs` it was given, each with its
`identity`: a commit, a digest, or a short literal itself. A text value
of up to 2000 bytes is in the record as its `value`. A longer one is kept
with the run, beside `changes.patch`, as
`~/.agister/runs/<id>/artifacts/input-<name>.txt`, exactly the bytes the
agent received; an input whose name another input shares, in any case,
or holds anything but letters, digits, `-` and `_`, or runs over 64
characters, is kept as `input.<n>.txt` instead, `<n>` its place among
the record's `inputs`, from 0. The input names it under `artifact`, with
its `digest` and `bytes`; a long literal, such as the goal a workflow
passes to each node as a param, is recorded by its `sha256:` digest, as
its `identity` and, once an input's artifact keeps its text, in the
request's `params`; a run refused before that keeps the param's text
there. An input's text that could not be kept is recorded as the event
`ARTIFACT_FAILED`, and the input keeps its identity only. A record made before inputs were kept has no
`artifact`.

An input read from a file also has a disposable working copy,
`~/.agister/cache/<sha256 hex>/<the file's base name>`, which the input
names under `cache_path`. The folder is named by the bytes' digest, so a
copy is never overwritten with other bytes, and one that already holds
them is left as it is; a later run given that path reads the same bytes
and records the same digest. The cache may be removed at any time: the
run's own copy is the source. A copy that could not be written is the
event `CACHE_FAILED`; the input has no `cache_path`, and the run goes on.

A prompt the settings fix, such as a reviewer's instructions, is a document
too: `prompts/review.md`, the whole file its text, no header. A process
gives it to its agent as an input, `{source: prompt, name: review}`; the
name is literal, never interpolated. It is found like any other document,
so a repository replaces one prompt with `.agister/prompts/review.md`
without copying the processes that use it. A process naming a prompt that
exists in neither place is a problem of the settings
([ADR-014](docs/adr/014-prompts-are-settings.md)). With `optional: true`
the input is optional: when neither place has the prompt, the call goes
ahead without that input, and its record lists the input and the prompt
as absent; anything at the prompt's path that cannot be read, such as a
directory, is a broken prompt that refuses the call
([ADR-019](docs/adr/019-a-prompt-may-be-optional.md)). This repository's
`implement` processes name `go-testing-seams` and `go-architecture` this
way, and its `.agister/prompts/` supplies both as copies of the ones in
`prompts/`, which a test keeps identical. A
text the caller
names stays a `source: file` input, read relative to the caller's
directory.

This repository's review workflows, `code_review` and `adr_review`, take
a required `goal`: the file that says what the change is for, its issue
or brief. Every review node receives its text and the judge does not; a
finding's scope is `change`, `goal` or `outside`, and the judge rules a
`goal` finding as it rules a `change` one
([ADR-023](docs/adr/023-reviewers-know-the-goal.md)).

A brief's form is a document too: `briefs/<name>.yaml`, schema
`agister.brief/v1alpha1`. Its `parts` are in order, each a Markdown
`heading` line such as `"## Intent"`, `required: true` or `false`, and
optionally `reads`, the exact text the part must hold, as `None.` for
Open, and `reference: file`, for a part whose first back-quoted path,
relative to the caller's directory, must exist; its `template` is the
text a caller copies, whose headings are the parts', each once and in
order. A `source: file` input may name the forms its text must have, with
literal names: `{source: file, path: "${param.brief}", form: [goal,
step]}`. A call whose text has none of them is refused before it starts,
exit code 3, naming the input, each form and each wrong part: a required
part missing, given twice or empty, a part that does not read as defined,
or a reference that names no file or one that does not exist. An input
without `form` is not checked. Agister checks the structure, never the
meaning. The forms are read with the call and recorded among its
definitions, and `process show` and `workflow show` give each input's
forms. `check` reports a form that exists in neither layer as a problem
of the process or workflow that names it, and a broken form as a problem
of its own; `check --tree` shows each form under what names it
([ADR-026](docs/adr/026-the-brief-is-a-runs-input-contract.md) rules 3 to
5 and 8). The example settings ship `goal` (Intent, Done when, Out of
scope and Open required; Expected behaviour, Sources and Decisions when
they apply) and `step` (Goal, a reference to the goal file, Covers and
Open required; Acts on and Constraints when they apply), and this
repository's `implement` takes a `goal` or a `step` as its brief and
`code_review` a `goal` as its goal.

A skill the settings give an agent is a document too:
`skills/<name>/SKILL.md`, a folder holding that one file. Its front matter
names it, `name` equal to the folder's, and describes it, `description` not
empty; the rest of the file is the runtime's to read. An agent names its
skills with `skills = ["review"]`, a process with `skills: [review]`; a
name is literal, never interpolated, and named once in a list. A call gets
its process's skills, then its agent's, each once; with `--agent` the
process's stay and the agent's are the named agent's. Each is read with the
call and recorded among its definitions with its digest, and `process show`
lists them, the process's and the agent's, with the layer each comes from.
A skill is found like any other document, so a repository replaces one,
whole, with `.agister/skills/review/SKILL.md`. `check` reports a name that
exists in neither place as a problem of the agent or the process that
names it, and a broken skill as a problem of its own: a folder holding
anything beside its `SKILL.md`, a `SKILL.md` that is not a regular file, or
front matter that does not name and describe it. Either refuses only the
calls that depend on it, and `check --tree` shows each skill under what
names it. `install` does not install skills: a folder's `skills/` is
listed as not settings, so a document it installs can name only a skill
home already has.

Every adapter gives a call its recorded skills on every turn. Claude Code,
Pi and OpenCode give them from a fresh temporary folder outside the
worktree, removed when
the turn ends. Claude Code uses a plugin named `agister` through
`--plugin-dir`, so its skills are `agister:<name>`; Pi passes each skill
folder with `--skill`, in order; OpenCode adds the folder to `skills.paths`
in its inline configuration under `--pure`.

Codex takes skills only from `$CODEX_HOME/skills` and resumes a thread only
with the `CODEX_HOME` it ran in, so a fresh Codex thread whose call names
skills runs with a home of its own under `<home>/codex/homes`, named by its
thread once the turn ends: it links your `auth.json`, `AGENTS.md` and
`AGENTS.override.md` where they exist and each of your skills in
`$CODEX_HOME/skills` (default `~/.codex`) but `.system`, beside the call's
skills; a skill of yours with the name of one of the call's is linked as
`<name>.user`, a folder name no settings skill can take, so both are there.
Such a thread is not in your `~/.codex`, only a turn with its home resumes
it, and it misses your Codex memories and state. A turn that resumes it gets
the call's skills and the links to your files afresh, as your `CODEX_HOME`
holds them then, and the cost lookup reads that home. A Codex run
without skills ran in your own `CODEX_HOME`, so a call that names skills
cannot continue it: it is refused before it holds the worktree, and the
changed settings need a fresh run. A call that names none runs as before
([ADR-021](docs/adr/021-settings-give-an-agent-its-skills.md)).

A repository can also take away what home provides, without copying any
of home's documents: `.agister/blocks.yaml` names the processes,
workflows, agents and runtime mappings it blocks
([ADR-018](docs/adr/018-a-repository-blocks-what-home-allows.md)).

```yaml
schema: agister.blocks/v1alpha1
blocks:
  - ref: agent:codex-implementer-sol-61
    reason: Codex does not implement in this repository
  - ref: process:implement_codex
```

In that repository, every call that depends on a blocked document, through
any chain of uses and with `--agent` too, is refused before its first turn,
naming the block's path and reason; `check` lists each block and what it
refuses, and passes. A `blocks.yaml` that is broken or names a document
that exists nowhere stops every command, as broken service settings do;
`install` and `install --restore` still run. One in home blocks nothing
and is a problem, and `install` does not install one.

Agister is a runner, not a guard: running it in a repository applies that
repository's `.agister/`, including the commands its agents run. Review
settings you did not write.

Every call works in the caller's worktree
([ADR-025](docs/adr/025-a-call-works-where-it-is-called.md)): the root of
the git worktree that holds the directory `agister run` is launched from,
or the one `--dir` names, with that worktree's settings. A workflow's
nodes work there too. Agister makes no checkout or copy, runs no setup
and does not move HEAD: the caller prepares the worktree, and makes one
to keep work apart. A process says what it needs of the worktree:

```yaml
workspace:
  revision: candidate_revision  # the input HEAD must be at
  clean: true                   # a fresh call starts from HEAD's content
```

`revision` names an input that resolves to a revision; a call is refused
before any turn unless HEAD is that revision. `clean: true` refuses a
fresh call unless the worktree's content is HEAD's: a staged change, a
dirty submodule, an untracked file git does not ignore, or a changed
tracked file, even one marked `assume-unchanged`, refuses it. Ignored
files are allowed. Unset, `clean` is `false`. A process that writes, such
as an implementer, declares it; a reviewer does not need it. A process
with a verification must declare both. A call of a process that pins a
revision, needs a clean worktree or has a verification is refused outside
a git worktree.

`workspace.checkout` is now `workspace.revision`, and `check` reports it
as a problem. `workspace.setup`, a verification's `where` and the
`workspace.yaml` document, with its `mode`, `precheck` and `setup`, are
obsolete and ignored, and `check` warns about each. `--workspace` is gone.

A call is a writer when its plan grants a permission the service lists as
`writing`, or its process has a verification, whose command runs with your
authority; otherwise it is a reader. Readers share the worktree, so a
workflow's reviews run together; a writer holds it alone, for the whole
call. A call that cannot take its hold is refused, not queued. It is also
refused before any turn if:

- the worktree overlaps a directory a writer's run worked in and may
  still write in, because the run has not finished or left a process that
  cannot be ended. Agister ends the ones it can;
- the worktree overlaps a directory that a run made before ADR-025 left on
  record and Agister may still remove: a checkout, a clean copy, or the
  directory made to hold one.

A directory overlaps the worktree when it is the worktree, lies inside it
or contains it. Calls with different `--home` values do not share the
hold.

A verification runs in the worktree, with its build output and ignored
files. A run that changes the content fails, and the captured patch must
rebuild the content that passed. A pass proves the worktree, not the
changes alone: a check that must prove them alone runs elsewhere, such as
in CI.

A call leaves its changes in the worktree, uncommitted, however it ends:
nothing is reset, cleaned or removed. A call whose process pins a revision
captures them at the end as
`~/.agister/runs/<id>/artifacts/changes.patch`, from the revision, with
the content it was taken from (`in_place.content`). The patch is evidence:
nobody applies it, for the changes are already there. A call that changed
nothing records `NO_CHANGES` and has no patch. When the process pins a
revision, an agent that commits in the worktree fails the call, and its
commit stays; without a pinned revision, a commit is not detected.
Agister checks the
worktree before and after the call but does not confine the agent to it;
do not change the worktree while a writer works in it.

`--continue <run-id>` resumes the session in the same worktree, after the
session's latest run, whichever run of the session you name. It applies
nothing: that run's changes are in the worktree. Launch from it and pin
the same revision: a default like `HEAD` resolves in the directory you
launch from. The call is refused unless the latest run worked in the same
worktree, repository and revision, HEAD is at the revision, the
worktree's content is the one that run recorded, and its `changes.patch`
is as recorded. A latest run whose capture failed, or that worked in a
checkout before ADR-025, cannot be continued; one that pinned no revision
is continued without the content check.

A run names the goal it serves and the judgement it answers; nothing is
found by searching runs
([ADR-026](docs/adr/026-the-brief-is-a-runs-input-contract.md) rules 2
and 6). `--goal <run-id>[:<input>]` records `links.goal`: that run's input, `goal` when
none is named, by its `run`, `input` and `digest`, with the `artifact`
that keeps its bytes when there is one, all read from that run's record.
`--answers <run-id>` records `links.judgement`, that run's `run`. A call
is refused before it starts when the goal's run does not exist, has no
such input or keeps its bytes nowhere, neither inline nor as an artifact,
and when the judgement's run does not exist or did not complete. Both
are optional, for a process or a workflow; a run given neither has no
`links`.

Home's prompts are kept in git in `prompts/` at the repository root and
copied into `~/.agister/prompts/` by hand: `install` does not take them
from there, so a changed prompt reaches home only when it is copied
(LAB-84). Settings skills (ADR-021) go into `~/.agister/skills/` by hand
too: `install` lists a folder's `skills/` as not settings (LAB-84).

The caller skill, `skills/agister/SKILL.md` in this folder, is for the
agent that runs Agister, not a settings skill. Install it by linking the
folder into each runtime's home skills folder, from `agister/` in the main
checkout so that the link follows `trunk`:
`ln -s "$PWD/skills/agister" ~/.claude/skills/agister` and
`ln -s "$PWD/skills/agister" ~/.agents/skills/agister` (Codex, Pi and
OpenCode read `~/.agents/skills`, per ADR-011's table). Whether it is
published for others is LAB-85.

`examples/settings/` is what `init` installs; `examples/codex/`,
`examples/pi/` and `examples/opencode/` are opt-in.

## Test

The commands are in [AGENTS.md](AGENTS.md); they check `gokit` too. CI:
`.github/workflows/agister-core.yml`.

Known gaps: backlog issues in the Multica project Agister
([docs/deferred.md](docs/deferred.md)). Ideas:
[backlog/](backlog/README.md).
