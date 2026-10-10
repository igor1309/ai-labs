---
name: agister
description: Drive Agister from outside - find out which processes and workflows the settings in use define and what each takes, run one in your worktree, continue a run, read a run's record and what it left in the worktree, and prepare a repository's `.agister/`. Use when asked to "use agister", to run work through Agister, to read what a run produced, or to set up `.agister/` in a repository.
---

# Agister: the caller's guide

Agister (`agister`, on PATH) runs agent calls and workflows of them. The
binary defines none of them: processes, workflows, their params, agents
and permissions are settings. Home's settings are in `<home>`: the
directory `--home` selects, else `$AGISTER_HOME`, else `~/.agister/` by
default. Settings compose by field across home, the
worktree root's `.agister/` and the nearest project `.agister/` below
that root, selected from the launch directory or `--dir`. Maps merge by
key at every depth; lists and scalars replace whole, and `[]` means none.
A partial sets only what it changes. Prompts, skills and schemas are taken
whole from the nearest layer that holds them. Each run is recorded in
`<home>/runs/<run-id>/`.
`agister --help` is authoritative, so check it before you rely on a
command or a flag. The `README.md` of the Agister source has the details.

## Find out what the settings provide

Names differ from one home to another and from one repository to another.
Do not assume a process, a workflow, a param or a default: ask, in the
repository you will run in.

- `agister process list`, `agister workflow list` and `agister agent list`
  show what the composed settings define. An entry that is broken or
  blocked, or that uses a document that is, says so. A list leaves out a
  verify document that is missing: `agister check` and `agister process
  show <process>` report it.
- `agister process show <process>` shows one process as a call would see
  it: its params, each required or with its default; the inputs made from
  them, each with its source, such as a file or a git revision; its
  output, text or JSON under a schema it names; the permissions it asks
  for and the tools its agent gets on its runtime; its limits; its
  verification, if it has one; the layer files each document it uses comes from,
  nearest first, its schema's among them; each composed document's leaf
  fields with their layers; its `prompt` and `guidance`; warnings;
  and, when a call would be refused now, the reason. With `--agent <agent>` it shows
  the process as that agent would run it.
- `agister workflow show <workflow>` shows the workflow's params and their
  defaults, its fan-out nodes and its join, and for each node its process
  and what the node receives.
- `agister check` verifies the composed settings. It exits 0 when they
  have no problem and 64 when they have one, prints each problem with what
  it refuses, and prints warnings. `agister check --tree` shows what
  defines what, with each document's layer files, nearest first, and under
  each but the farthest the fields it gave (`(none)` when it gave none).
  A prompt taken whole marks the farther files `(replaced)`.
- `agister check`, `agister process list`, `agister process show`, `agister
  workflow list` and `agister workflow show` take `--dir <dir>` to read the layers a call launched there uses.
  Outside a git worktree only home is read. A second project `.agister/`
  between the nearest one and the root, a project `blocks.yaml` or an
  invalid `layer.yaml` makes that layer invalid: `check` names its path
  and reason, and commands launched under it are refused.
- A problem that names a field, a field's shape, an adapter, an input
  source or a schema version this binary does not know adds a last line:
  `<n> problem(s) name something this binary does not know; the settings
  may need one newer than agister <version>`. `agister check` prints it,
  and so does every call those settings refuse and an install they
  refuse. The line does not prove the settings are newer: they may need
  a newer binary, such as a branch's own `.agister/` that uses a field
  the installed binary predates, or the field or source may be misspelt.
  This binary cannot tell the two apart.

## Verification

A process may have a verification: a command that Agister runs once the
agent's turn has completed with valid output, in the call's worktree, at
the revision with the agent's changes, its build output and ignored files
included. It runs with your authority, not the agent's permissions, and
it runs code the agent wrote. A failing command goes back to the agent for
a repair in the same session, for at most the attempts the verification
allows. A command that goes silent for the `stale.no_output` limit is
ended, and is a failed attempt like a failing one; a command that times
out ends the run instead. A command that changes the content fails, and
the captured patch must rebuild the content that passed. The run
completes only when the command passes. A pass proves the worktree,
ignored files included, not the changes alone: a check that must prove
them alone runs elsewhere, such as in CI.

A process that declares a verification pins its revision and needs a
clean worktree (`workspace.revision` and `workspace.clean: true`, see
below).

The process holds the command itself, or names a verify document:
`verify:<name>` is `verifies/<name>.yaml`, composed by field from the
selected layers. A project fills `verifies/repo.yaml` in its own layer
for `implement`; the command runs from the worktree root, so name the
project in it (`cd agister && …`). `agister process show <process>` names
the layer files and shows the command. If no layer fills the document,
`check` warns, `show` gives the refusal with the paths it looked in, and
`implement` is refused before its first turn. Other processes still run.
Supply the document; do not route around the refusal.

## What a repository provides

- `.agister/`: its own partial documents, laid out like home's. The same
  kind and filename compose across the selected layers. For a process
  that names a verify document, a repository or project supplies its own: one
  shell command that passes in a clean worktree at the revision, with
  what you prepared there. Each YAML file holds exactly one YAML
  document: one with a second, after a `---`, is a settings problem
  (`must hold exactly one YAML document`), not a second document. Split
  it into one file per document.
- A settings document carries no comments. What it is for is its name
  and fields; why it is so belongs in its commit's message, and a choice
  that must hold belongs in a test. No ADR or issue references, no
  history, no restating what composition does.
- A process says what it needs of the worktree under `workspace`, each
  field optional:
  - `revision`, the input that resolves to a revision: a call is refused
    before any turn unless HEAD is at it. Agister does not move HEAD.
  - `clean: true`: a fresh call is refused unless the worktree's content
    is HEAD's. A process that writes, such as an implementer, declares it.
    A reviewer does not need it.
- `.agister/blocks.yaml`, optional: the processes, workflows, agents and
  runtimes of home that this repository blocks. A project layer holds no
  `blocks.yaml`; blocks are the repository's alone.
- A process has one required `prompt` name and a `guidance` list, empty
  when absent or `[]`. Each name resolves in the nearest layer that has
  it; a missing name refuses the call. The agent receives its values,
  then input `prompt`, then `guidance.<name>` in list order, recorded with
  their digests. `{source: prompt}` and `optional` are refused.
- `layer.yaml`, repository or project only, names additional prompt folders:
  `schema: agister.layer/v1alpha1` and `prompts: [prompts]`. Paths are
  relative to the directory holding `.agister/`, inside it, and must
  exist. A layer's `.agister/prompts/<name>.md` comes first, then the
  listed folders in order. Only names a process gives are read there;
  unrelated library files are neither checked nor shown as unused.
- `AGENTS.md`: the agent's runtime loads it in the worktree. Guidance a
  node must follow belongs in that node's `prompt` or `guidance`, resolved
  and recorded by Agister, never a pointer in `AGENTS.md` or a skill.

Agister makes no checkout, copy or setup: you prepare the worktree, its
build output and bindings, before you call. `agister check` warns about a
`workspace.yaml`, a process's `workspace.setup` and a verification's
`where`: they are obsolete and ignored. A process's `workspace.checkout`
is a problem: it is now `workspace.revision`.

`agister init` installs example settings in `<home>`. It lists each file
first, writes only after you type yes, and keeps a file that exists. The
answer is read from stdin, so a caller without a terminal pipes it
(`echo yes | agister --home <dir> init`); on any other answer, or at EOF,
it cancels: it writes nothing and exits 64. To read the examples without
touching home, run `agister --home <dir> init` with a scratch directory.
They include a process that pins its revision, needs a clean worktree and
names a verification, and the verify document it names. Start from that
document: copy it into the repository's `.agister/verifies/` and replace
its command.

Then run `agister check` in the repository, and `agister process show
<process>` for each process you will run, to see that it resolves and
verifies with the repository's command. Commit `AGENTS.md` and
`.agister/`: a process that needs a clean worktree refuses an untracked
file git does not ignore.

## Install home's settings

`agister install <dir>` installs a folder laid out like the settings into
`<home>`, document by document. It shows what it would create, replace,
with a diff, and leave unchanged, and the documents only home has, which
it keeps. It checks the result on a staged copy, then asks: after yes,
and only if home's settings are still as shown, it backs up what it
replaces under `<home>/backups/<stamp>/` and writes. It prints the
command that undoes it, `agister install --restore <stamp>`, which asks
too; the last five backups are kept. Both run on settings that fail
`agister check`.

A skill the settings give an agent, `skills/<name>/SKILL.md`, is
installed as any other document: planned, diffed, checked, backed up and
restored. A skill folder holding anything beside its `SKILL.md`, or whose
`SKILL.md` is not a regular file, refuses the install, naming the skill
and those files. Files that are not settings, a file directly under
`skills/` and `blocks.yaml` or `layer.yaml` among them, are listed and not installed; a
symbolic link in the folder refuses it. Restore removes a skill its
install created, with its folder when that is then empty.

In the repository that holds Agister's source, home's settings have one
source in git, `agister/home/` (ADR-027). Change a document of home
there and install the folder: a difference between home and the folder
then shows in the install's plan, as a replace with its diff or as a
document only home has.

## Run

```sh
agister run <process> --param <param>=<value> --json
agister run <workflow> --param <param>=<value> --json
agister run <process> --dir <worktree> --param <param>=<value> --json
```

- Every call works in your worktree: the root of the git worktree that
  holds the launch directory, or the one `--dir` names, with that
  directory's selected layers. A workflow's nodes work there too. Agister makes no
  checkout or copy of it; to keep work apart, make a worktree and call
  Agister there.
- Give every required param, and each other one whose default is not what
  you mean. A default is a setting, and may name a ref that this
  repository lacks.
- A revision param resolves in the worktree root, whether you pass it or
  leave it to its default; a file param's path is relative to the launch
  directory.
- A process that pins a revision works on the one HEAD is at. Check out
  what you want worked on, then pass `HEAD` or that commit.
- A process that needs a clean worktree works from HEAD's content: commit
  or stash first.
- `--json` prints the result when the run ends: its `run_id`, status,
  output, cost and the absolute path of each artifact. Without it, only
  the output is printed: JSON whenever the run has one, text only when the
  run completed. Progress goes to stderr either way.
- For a process, `--agent <agent>` runs it with another agent of the
  settings, and `--timeout <d>` and `--max-cost <usd>` set the call's
  limits. A workflow takes params, `--goal`, `--answers` and `--dir` only:
  each node is a run of its own, with its own process's agent and limits.
- Interrupting `agister run` cancels the run.
- Runs cost money. Do not loop runs unattended.

A call is a writer when its plan grants a permission the service lists as
writing, or its process declares a verification; otherwise it is a reader.
Readers share the worktree, so reviews of it run together; a writer holds
it alone, for the whole call.

A call is refused before any turn, with exit 3 and the reason, when:

- a document it uses has a settings problem, or is blocked: the reason
  names each, its path, its problems and how the call reaches it. A
  problem this binary does not know adds the line above after the run's
  summary, and the record's `result.error.unknown` counts such problems.
- its runtime's version is verified for no primitive and the adapter's
  probe of it failed (`probing it failed`), with what the probe found. A
  first call on a new Codex version spends about 20 seconds probing it
  (ADR-029). Do not edit `verified` to get past this: the sandbox did
  not hold, or the probe proved nothing; report the outcomes.
- it cannot take its hold (`is in use`): a writer holds the worktree, or,
  for a writer, any other call holds it. A call is refused, not queued.
- the worktree overlaps a directory another writer's run worked in and
  may still write in: its owner still runs it (`has not finished`), or it
  left a process that Agister cannot end. It ends the ones it can: a run
  whose owner was killed is finished as `lost` by the call that meets it
  (`WORKTREE_RUN_REAPED`), which is then admitted. A process that only
  reads that run's state, as `agister runs` or Pages does, delays this
  for a moment; one exporting it keeps it unfinished, and the call
  refused (`it is being read`), until the export is done.
- the worktree overlaps a directory a run made before ADR-025 left on
  record, which Agister may still remove (`is not the caller's to
  lend`): a checkout, a clean copy, or the directory made to hold one.
- the process pins a revision, needs a clean worktree or declares a
  verification, and the directory is in no git worktree.
- HEAD is not the revision the process pins. Check out that commit.
- the process needs a clean worktree, and the worktree is not clean: a
  staged change, a dirty submodule, an untracked file git does not
  ignore, or a tracked file that differs from HEAD, even one marked
  `assume-unchanged`. Ignored files are allowed.

A directory overlaps the worktree when it is the worktree, lies inside it
or contains it.

## Give a brief in its form

An input read from a file may name the forms its text must have, such as
a goal or a step brief. `agister process show <process>` and `agister
workflow show <workflow>` list them on the input, as `brief <- file (form
goal, step)`. The form is a settings document, `briefs/<name>.yaml`, composed from
the project, repository and home layers. `process show` names the
file each form comes from among its sources, and `agister check --tree`
shows each form under what names it. Copy the form's `template`, fill
each part, and leave out a part that is not required when it does not
apply.

A call is refused before it starts, with exit 3, unless the text has one
of its forms. The reason names the input, each form and each wrong part:

- a required part is missing, empty or given twice. A part is its
  heading line, exactly as the form gives it, and what follows up to the
  next heading of its level or above; a heading in fenced code is no
  part's.
- a part does not read as the form says: Open reads `None.` and nothing
  else.
- a part that refers to a file, such as a step brief's Goal, names none
  in back quotes, or its first back-quoted path, read relative to the
  directory you call from, does not exist.

Agister checks the structure, never the meaning. Fix the text and call
again; do not drop the form from the settings to get past the refusal.

## Read the result

- `agister runs list` lists the runs: ID, process or workflow, agent and
  status.
- `agister runs show <run-id>` prints the run's record as JSON. That
  includes its `request`, the selected `layers`, the `definitions` (each
  layer file with its digest and the fields it gave) and `inputs` it ran
  with, its
  `in_place`, the worktree it worked in, its `links` when it was given
  `--goal` or `--answers` (see below), its `attempts` when it has a
  verification, its `recoveries` when a stale turn was resumed, its
  `trail` when the runtime reported one, and its `result` (`status`,
  `error`, `output` or `text`, `cost`, `timing`, `artifacts`). An
  attempt's `run.passed` says whether its verification command passed. A
  stopped attempt has `stopped`, which says why verification ended there,
  and may have no `run`.
- Each of the record's `inputs` has its `identity`: a commit, a digest,
  or a short literal itself. A text value of up to 2000 bytes is there as
  its `value`. A longer one is not: its `artifact` names the file that
  holds exactly what the agent received, `artifacts/input-<name>.txt` in
  the run's directory (`artifacts/input.<n>.txt`, `<n>` its place among
  the `inputs` from 0, when its name is shared, in any case, holds
  anything but letters, digits, `-` and `_`, or runs over 64
  characters), with its `digest` and `bytes`, and a long literal, such
  as the goal a workflow passes to its nodes as a param, is recorded by
  its `sha256:` digest, as its `identity` and, once an input's artifact
  keeps its text, in `request.params`; a run refused before that keeps
  the param's text there. A text that could not be kept is the event
  `ARTIFACT_FAILED`. A run recorded before inputs were kept has no
  `artifact`.
- An input read from a file (`source: file`) also has `cache_path`, a
  disposable working copy of its bytes,
  `<home>/cache/<sha256 hex>/<the file's base name>`
  (`~/.agister/cache/...` by default). The folder is named by the bytes'
  digest, so the copy never changes; pass that path as a file param and
  the run reads the same bytes and records the same digest. The cache may
  be removed at any time: the run's own copy, its `value` or `artifact`,
  is the source. A copy that could not be written is the event
  `CACHE_FAILED`, and the input has no `cache_path`; the run goes on.
- A policy's `stale` limits end an agent turn that stopped moving, before
  its timeout. With `stale.recover`, a budget of `max_resumes` and an
  `instruction`, Agister then resumes the turn's session with what went
  stale instead of ending the call, and each such turn is one of the
  record's `recoveries`, with what went `stale` and its own `outcome`.
  That needs an agent and a runtime that resume: any other call with a
  budget is refused before its first turn.
- The record's `trail` is what the runtime reported the agent did on the
  way, over every turn of the call: `touched`, the paths its tool calls
  wrote, in order, each once with the `tool` of its first write, and
  `denied`, each tool call the runtime refused for want of a permission,
  with its `tool` and bounded `input`. A path is as the runtime gave it,
  neither resolved nor judged, and nothing is blocked by it. Read the
  trail to see what the agent reached for, such as a path outside its
  worktree or a denied call it then worked around; the patch says only
  what the call left. A turn that a staleness limit ended, or that was
  killed, keeps what it reported before it ended. Claude Code reports
  both, Codex the paths of its file changes only, OpenCode and Pi
  neither; a file a shell command wrote is not among the paths. The
  run's events hold the same in stream order: `TOUCHED` (`path`, `tool`,
  `tool_use_id`) and `PERMISSION_DENIED` (`tool`, `input`).
- A workflow's record lists its nodes under `workflow.nodes`, each with
  the ID of its own `run`. Its `result` carries the join's output. For a
  fan-out node's output, show that node's run.
- `agister runs watch <run-id>` follows a run, and prints a line for each
  path touched and each call denied. Stopping a watch leaves the run
  going.
- The run's directory holds `record.json` and, once the run has written
  them, `events.jsonl` (its events, in order), `provider.jsonl` (the
  runtime's raw output) and `artifacts/`.

## What a run leaves

A run's changes are in the worktree it worked in, uncommitted. There is
nothing to apply: run the repository's testing command yourself, and
commit. A failed, timed-out or interrupted call leaves its changes there
too, for you to keep or discard: nothing is reset, cleaned or removed.
When the process pins a revision, an agent that commits in the worktree
fails the call (`WORKTREE_COMMITTED`), and its commit stays; without a
pinned revision, a commit is not detected.

A run of a process that pins a revision also keeps what it changed as
one patch from the revision, the evidence of its changes, which its
result lists under `artifacts`:
`<home>/runs/<run-id>/artifacts/changes.patch` (`~/.agister/runs/...` by
default). **Do not apply it**: the changes are already in the worktree. A
run that changed nothing records the event `NO_CHANGES` and has no patch.
A patch that could not be kept is recorded as the event
`ARTIFACT_FAILED`; without a verification, the run may still complete
without it.

## Continue a run

```sh
agister run <process> --continue <run-id> --param <param>=<value>
```

`--continue` resumes the session of a finished run, by the same agent,
when the agent and its runtime allow it, in the same worktree. Pass the
params again and launch from that worktree, or name it with `--dir`.
Whichever run of the session you name, it resumes after the session's
latest run, and applies nothing: that run's changes are already in the
worktree. It is refused unless the latest run worked in the same
worktree, repository and revision, HEAD is still at the revision, the
worktree holds exactly what that run left there, and its `changes.patch`
is as recorded. So is a latest run whose capture failed, and one that
worked in a checkout before ADR-025. A latest run that pinned no revision
is continued without the content check. A workflow cannot be continued.

## Link a run to its goal and judgement

```sh
agister run <process> --goal <run-id>[:<input>] --param <param>=<value>
agister run <process> --answers <run-id> --param <param>=<value>
```

Name what a run is for; Agister finds nothing by searching runs. Either
option, or both, works for a process or a workflow, and is recorded under
the record's `links`; a run given neither has no `links`.

- `--goal <run-id>[:<input>]` names the goal the run serves: that run's
  input, `goal` when you name none. `links.goal` records the `run`, the
  `input`, its `digest` and, when the input's bytes are an artifact of
  that run, its `artifact`, all read from that run's record. It is
  refused, exit 3, when the run does not exist, has no such input, or
  keeps the input's bytes nowhere, neither as its `value` nor as an
  `artifact`.
- `--answers <run-id>` names the run whose judgement this one answers,
  such as a review round's fix run naming the judge's run.
  `links.judgement` records its `run`. It is refused when the run does not
  exist or did not complete.

## Export runs for audit

```sh
agister runs export <run-id>... --to <dir>
```

The run store is one host's, and a run's brief and goal live only there.
To keep runs as audit material, export them to a durable directory you
name. Each run's directory is copied byte for byte to `<dir>/<run-id>/`:
`record.json`, `events.jsonl`, `provider.jsonl` and `artifacts/`, not its
`owner.lock`. A workflow run brings each node's run its
`workflow.nodes` name, to `<dir>/<node-run-id>/`. Nothing is selected,
rewritten or summarized. A run a `links.goal` or `links.judgement` names
is not brought: export it by its ID.

- It is refused, exit 3, before it writes anything, when `--to` is
  missing, does not exist, is not a directory or is in the run store (the
  store's directory, a run's, or one in them, through a link too), or a
  run does not exist or is still running, a workflow's node run
  included. An abandoned run is copied as it was left. A finished run is
  refused while another process is recovering what it left; export it
  once that is done.
- Each run is held from the start until it is copied: no process writes
  it meanwhile, so its record and events are copied as they stood
  together. Recovery waits for a held run about a second, then skips
  it; a later reap, or the next writer call that meets it, recovers it.
- A copy is written beside its place and renamed into it once complete,
  so an interrupted export leaves only a `<run-id>.partial-*` directory,
  which no export takes for a copy; remove it.
- Each artifact the record names is read back from the copy and checked
  against the recorded digest. One that does not match fails that run,
  exit 1, naming the file, and its copy is not put in place.
- Exporting again to the same place keeps an identical copy as it is. A
  copy that differs is never overwritten: that run is refused, exit 3,
  naming the file that differs; the other runs are still exported.
- It prints a line per run: `copied` with its files and bytes, `kept`,
  `REFUSED` or `FAILED` with the reason. Interrupted, it prints the runs
  it finished and exits 2; a run it had not finished has no copy.

## Exit codes

0 completed, 1 failed, 2 interrupted, 3 refused, 4 lost, 64 usage or
invalid settings, 70 internal error, 130 stopped watching.

Exit 0 says the run completed, and, for a process with a verification,
that it passed. What a completed run's output means is yours to read.

## Rules

- Never weaken, skip or delete a check to make verification pass.
- A call is cooperation, not confinement. Agister checks the worktree
  before and after the call, but does not confine the agent to it: its
  permissions may still let it write ignored files, `.git` or other
  worktrees, and the patch holds none of those. Do not change the
  worktree while a writer works in it.
- Running Agister in a repository applies that repository's `.agister/`,
  including the commands its agents run. Review settings you did not write.
- Do not edit `<home>` by hand to fix one repository. Use the
  repository's `.agister/`. For a change to home, use
  `agister install <dir>`, which shows a diff, asks before it writes and
  backs up what it replaces. It reads the answer from stdin too
  (`echo yes | agister install <dir>`), and on any other answer, or at
  EOF, it cancels: it writes nothing and exits 64. Where home has a
  source folder in git, change the document there and install that
  folder (above).
