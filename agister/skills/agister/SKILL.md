---
name: agister
description: Run work through Agister, inspect its settings and records, or configure an agent, process or workflow in a repository's .agister directory.
---

# Agister: the caller's guide

Agister runs work defined by settings. A workflow binds processes to
agents; a process defines its inputs, prompt, output and permissions;
an agent selects a runtime and model. Run in the caller's prepared git
worktree: each call holds it as a reader or a writer and leaves its
changes there.

Read `agister --help` for the installed command's syntax. Discover the
composed settings with `agister inspect processes`, `agister inspect
workflows`, `agister inspect agents`, and `agister inspect <kind> <name>`.
Validate changes with `agister check`. Settings compose by field across
home (`$AGISTER_HOME`, else `~/.agister`), the worktree's `.agister/`, and
the nearest project's `.agister/`; lists and scalars replace whole.

An agent may declare `fallback = "claude-opus"` in its TOML file. A call
at capacity is told "Go on." in its session after 30 seconds, one, three
and five minutes. Once all five capacity turns are spent, the same process and
inputs run fresh on the fallback within the remaining limits. Only
capacity falls back; the fallback never follows its own. Check refuses
a missing fallback, itself, or a runtime unable to run the process. The
result names the answering agent in a warning; its record keeps the
primary result and all failed capacity turns as events.

A parallel accepts a list or a map: `parallel: {max: 1, steps: [...]}`
runs nodes one at a time. Any positive `max` bounds concurrency; without
it all nodes run at once. Failures do not stop later nodes. Once all end,
the join receives every outcome in declaration order if any completed.
Home's `code_review` and `adr_review` use `max: 1`.

A `branch` runs the first arm whose `if` holds, else the arm without
one; its outputs are that arm's output mapping. A `repeat` runs its body
at least once, binds `next` over its `state` (names `next` does not bind
keep their value), then stops when `until` holds or after `max` passes;
its outputs are `state`, `stopped` and `passes`. Conditions are
`equals`, `present`, `all`, `any`, `and`, `or` and `not` over params,
inputs, state and earlier outputs; params are text and never equal a
number. A step in a repeat is named `<step>/<pass>` in its record and
progress; `events.jsonl` keeps each branch taken, each pass's state and
why a repeat stopped. A branch or repeat inside a parallel is refused by
check and run alike.

A step may name a `workflow` instead of a process: it runs as a child
run, its params bound from the step's inputs, its steps named
`<step>/<child step>`. Home's `code_review` runs its tests lens this way,
as `tests_debate`: codex-sol-61 drafts the review, claude-opus critiques
it, and a repeat of at most two passes has codex revise in the draft's
own session and claude-opus critique again, until the critique says
`converged`. At least one revision always runs; a first critique that
converges gets the review back unchanged. Only the last review reaches
the judge; the critiques stay in the run's record. A lens without a
critic names its process, as `tests_review`, not a debate.

Run a named workflow with `agister run <workflow> --param <name>=<value>`;
run one process with `agister run --process <name> --agent <name>` and its
params. `--continue <run-id>` resumes a one-call run on its answering
agent when its worktree is as recorded. `--reuse <run-id>` takes matching
completed calls. A run keeps one append-only log, `run.jsonl`, under
home's `runs/<run-id>/`; use `agister runs export <run-id> --to
<directory>` to export a run.

## After you launch

Run `agister run` in the foreground, or in the background with a
completion notice; never launch it and go quiet. Ask what a run is doing
with `agister status <run-id>` (or `--last`, `--json`); `agister runs
list` shows recent runs, newest first. Each run gets one line:

- `running <step> since T` or `waiting on <what> since T`: it is alive.
- `writer stalled since T`: the process lives but its log stopped moving.
- `failed: <class>: <reason>`: it ended without doing the work.
- `lost`: its process is gone without a final line.
- `unknown`: nothing can be told yet, such as a run that has just started.
- `completed`.

Report that line to whoever is waiting, in your own words. When a run
waits longer than your turn, as on a capacity wait or a fallback, leave a
Multica wakeup and a comment on the issue that says what it waits on and
until when, then end the turn instead of going silent. On `failed` or
`lost`, say so at once with the reason; do not launch the run again
before reading it.

For the design read the
[run architecture](../../docs/run-architecture/index.html) and the
[settings architecture](../../docs/settings-architecture/index.html).
