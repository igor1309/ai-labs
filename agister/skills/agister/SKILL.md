---
name: agister
description: Drive Agister from outside - find out which processes and workflows the settings in use define and what each takes, run one in your worktree, continue a run, read a run's record and what it left in the worktree, and prepare a repository's `.agister/`. Use when asked to "use agister", to run work through Agister, to read what a run produced, or to set up `.agister/` in a repository.
---

# Agister: the caller's guide

Agister (`agister`, on PATH) runs agent calls and workflows of them. The
binary defines none of them: processes, workflows, their params, agents
and permissions are settings. Home's settings are in `<home>`: the
directory `--home` selects, else `$AGISTER_HOME`, else `~/.agister/` by
default. The `.agister/` of the repository you run in takes priority
over them, document by document. Each run is recorded in
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
  verification, if it has one; the file each document it uses comes from,
  home's or the repository's, its schema's among them; warnings; and, when
  a call would be refused now, the reason. With `--agent <agent>` it shows
  the process as that agent would run it.
- `agister workflow show <workflow>` shows the workflow's params and their
  defaults, its fan-out nodes and its join, and for each node its process
  and what the node receives.
- `agister check` verifies the composed settings. It exits 0 when they
  have no problem and 64 when they have one, prints each problem with what
  it refuses, and prints warnings. `agister check --tree` shows what
  defines what, and in which file.

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
`verify:<name>` is `verifies/<name>.yaml`, the repository's
`.agister/verifies/<name>.yaml` before home's. `agister process show
<process>` names the document, and shows its command and the file it comes
from. When neither place has the document, `agister check` warns, `show`
gives the refusal with both paths it looked in, and a call of that process
is refused before its first turn. Other processes still run. Supply the
document; do not route around the refusal.

## What a repository provides

- `.agister/`: its own documents, laid out like home's. Each replaces
  home's document of the same kind and name, whole. For a process that
  names a verify document, this is where the repository puts its own: one
  shell command that passes in a clean worktree at the revision, with
  what you prepared there.
- A process says what it needs of the worktree under `workspace`, each
  field optional:
  - `revision`, the input that resolves to a revision: a call is refused
    before any turn unless HEAD is at it. Agister does not move HEAD.
  - `clean: true`: a fresh call is refused unless the worktree's content
    is HEAD's. A process that writes, such as an implementer, declares it.
    A reviewer does not need it.
- `.agister/blocks.yaml`, optional: the processes, workflows and agents of
  home that this repository blocks.
- `AGENTS.md`: the agent's runtime loads it in the worktree. Put the
  testing command and the repository's hard rules there.

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

## Run

```sh
agister run <process> --param <param>=<value> --json
agister run <workflow> --param <param>=<value> --json
agister run <process> --dir <worktree> --param <param>=<value> --json
```

- Every call works in your worktree: the root of the git worktree that
  holds the directory you launch from, or the one `--dir` names, with that
  worktree's settings. A workflow's nodes work there too. Agister makes no
  checkout or copy of it; to keep work apart, make a worktree and call
  Agister there.
- Give every required param, and each other one whose default is not what
  you mean. A default is a setting, and may name a ref that this
  repository lacks.
- A revision param resolves in that directory, whether you pass it or
  leave it to its default, and a file param's path is read relative to
  it.
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
  limits. A workflow takes params and `--dir` only: each node is a run of
  its own, with its own process's agent and limits.
- Interrupting `agister run` cancels the run.
- Runs cost money. Do not loop runs unattended.

A call is a writer when its plan grants a permission the service lists as
writing, or its process declares a verification; otherwise it is a reader.
Readers share the worktree, so reviews of it run together; a writer holds
it alone, for the whole call.

A call is refused before any turn, with exit 3 and the reason, when:

- it cannot take its hold (`is in use`): a writer holds the worktree, or,
  for a writer, any other call holds it. A call is refused, not queued.
- the worktree overlaps a directory another writer's run worked in and
  may still write in: the run has not finished, or left a process that
  Agister cannot end. It ends the ones it can.
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

## Read the result

- `agister runs list` lists the runs: ID, process or workflow, agent and
  status.
- `agister runs show <run-id>` prints the run's record as JSON. That
  includes its `request`, the `definitions` and `inputs` it ran with, its
  `in_place`, the worktree it worked in, its `attempts` when it has a
  verification, its `recoveries` when a stale turn was resumed, its
  `trail` when the runtime reported one, and its `result` (`status`,
  `error`, `output` or `text`, `cost`, `timing`, `artifacts`). An
  attempt's `run.passed` says whether its verification command passed. A
  stopped attempt has `stopped`, which says why verification ended there,
  and may have no `run`.
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
  EOF, it cancels: it writes nothing and exits 64.
