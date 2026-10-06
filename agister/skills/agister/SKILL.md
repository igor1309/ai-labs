---
name: agister
description: Drive Agister from outside - find out which processes and workflows the settings in use define and what each takes, run one, continue a run, read a run's record, apply a run's patch, and prepare a repository's `.agister/`. Use when asked to "use agister", to run work through Agister, to read or apply what a run produced, or to set up `.agister/` in a repository.
---

# Agister: the caller's guide

Agister (`agister`, on PATH) runs agent calls and workflows of them. The
binary defines none of them: processes, workflows, their params, agents
and permissions are settings. Home's settings are in `<home>`: the
directory `--home` selects, else `$AGISTER_HOME`, else `~/.agister/` by
default. The `.agister/` of the repository you launch from takes priority
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
agent's turn has completed with valid output, on a clean copy of the
checkout with the agent's changes applied. It runs with your authority,
not the agent's permissions, and it runs code the agent wrote. A failing
command goes back to the agent for a repair in the same session, for at
most the attempts the verification allows; a command that times out ends
the run instead. The run completes only when the command passes.

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
  shell command that passes on a clean checkout and needs nothing
  untracked.
- `.agister/workspace.yaml`, optional: a setup command that prepares a
  fresh checkout, for each process with a checkout and no setup of its
  own. It may only make files git ignores.
- `.agister/blocks.yaml`, optional: the processes, workflows and agents of
  home that this repository blocks.
- `AGENTS.md`: the agent's runtime loads it in the checkout. Put the
  testing command and the repository's hard rules there.

`agister init` installs example settings in `<home>`. It lists each file
first, writes only after you type yes, and keeps a file that exists. To
read the examples without touching home, run `agister --home <dir> init`
with a scratch directory. They include a process that works in a checkout
and names a verification, and the verify document it names. Start from
that document: copy it into the repository's `.agister/verifies/` and
replace its command.

Then run `agister check` in the repository, and `agister process show
<process>` for each process you will run, to see that it resolves and
verifies with the repository's command. Commit `AGENTS.md`, because a
checkout holds only tracked files, and `.agister/` with it.

## Run

```sh
agister run <process> --param <param>=<value> --json
agister run <workflow> --param <param>=<value> --json
```

- Give every required param, and each other one whose default is not what
  you mean. A default is a setting, and may name a ref that this
  repository lacks.
- Launch from the repository the run is about. A revision param resolves
  in the directory you launch from, whether you pass it or leave it to
  its default, and a file param's path is read relative to that directory.
  Pin revisions: pass the commit instead of relying on a default.
- A process may work in a fresh checkout of a revision. The checkout holds
  only the files git tracks at that revision, so commit what the call
  relies on before you launch.
- `--json` prints the result when the run ends: its `run_id`, status,
  output, cost and the absolute path of each artifact. Without it, only
  the output is printed: JSON whenever the run has one, text only when the
  run completed. Progress goes to stderr either way.
- For a process, `--agent <agent>` runs it with another agent of the
  settings, and `--timeout <d>` and `--max-cost <usd>` set the call's
  limits. A workflow takes params only: each node is a run of its own,
  with its own process's agent and limits.
- Interrupting `agister run` cancels the run.
- Runs cost money. Do not loop runs unattended.

## Read the result

- `agister runs list` lists the runs: ID, process or workflow, agent and
  status.
- `agister runs show <run-id>` prints the run's record as JSON. That
  includes its `request`, the `definitions` and `inputs` it ran with, its
  `attempts` when it has a verification, and its `result` (`status`,
  `error`, `output` or `text`, `cost`, `timing`, `artifacts`). An
  attempt's `run.passed` says whether its verification command passed. A
  stopped attempt has `stopped`, which says why verification ended there,
  and may have no `run`.
- A workflow's record lists its nodes under `workflow.nodes`, each with
  the ID of its own `run`. Its `result` carries the join's output. For a
  fan-out node's output, show that node's run.
- `agister runs watch <run-id>` follows a run. Stopping a watch leaves the
  run going.
- The run's directory holds `record.json` and, once the run has written
  them, `events.jsonl` (its events, in order), `provider.jsonl` (the
  runtime's raw output) and `artifacts/`.

## Apply a run's changes

A run of a process with a checkout keeps what the call changed there as
one patch from the revision, which its result lists under `artifacts`:
`<home>/runs/<run-id>/artifacts/changes.patch` (`~/.agister/runs/...` by
default). A run that changed nothing records the event `NO_CHANGES` and
has no patch. A patch that could not be kept is recorded as the event
`ARTIFACT_FAILED`; without a verification, the run may still complete
without it.

```sh
git apply <home>/runs/<run-id>/artifacts/changes.patch
```

Apply it on the revision the run worked on. Then run the repository's
testing command yourself, and commit.

## Continue a run

```sh
agister run <process> --continue <run-id> --param <param>=<value>
```

`--continue` resumes the session of a finished run, by the same agent,
when the agent and its runtime allow it. Pass the params again. For a
process with a checkout, launch from the same repository and pin the same
revision. The session's latest run's `changes.patch` is carried into the
new checkout, uncommitted, whichever run of the session you name; a patch
from another repository or revision is refused. A run that kept no patch
carries nothing. The new run's patch is again cumulative from the
revision, so apply only the latest one. A workflow cannot be continued.

## Exit codes

0 completed, 1 failed, 2 interrupted, 3 refused, 4 lost, 64 usage or
invalid settings, 70 internal error, 130 stopped watching.

Exit 0 says the run completed, and, for a process with a verification,
that it passed. What a completed run's output means is yours to read.

## Rules

- Never weaken, skip or delete a check to make verification pass.
- Running Agister in a repository applies that repository's `.agister/`,
  including the commands its agents run. Review settings you did not write.
- Do not edit `<home>` by hand to fix one repository. Use the
  repository's `.agister/`. For a change to home, use
  `agister install <dir>`, which shows a diff, asks before it writes and
  backs up what it replaces.
