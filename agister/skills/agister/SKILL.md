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
at capacity retries its session after 30 seconds, one minute and three
minutes. Once all four capacity turns are spent, the same process and
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

Run a named workflow with `agister run <workflow> --param <name>=<value>`;
run one process with `agister run --process <name> --agent <name>` and its
params. `--continue <run-id>` resumes a one-call run on its answering
agent when its worktree is as recorded. `--reuse <run-id>` takes matching
completed calls. Read records under home's `runs/<run-id>/`; use
`agister runs export <run-id> --to <directory>` to export a run.

For design constraints read [ADR-001](../../docs/adr/001-agister-architecture.md)
and the [run implementation](../../docs/run-implementation.md).
