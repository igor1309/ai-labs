# Agister

A runner for AI-agent work defined in settings files.

- [Architecture, ADR-001](docs/adr/001-agister-architecture.md)
- [ADRs](docs/adr/)
- [The earlier implementation](archive/README.md), kept unchanged as
  reference; the installed `agister` is this one
  (`scripts/loop/install.sh`)

Settings in `home/` define agents, processes and workflows and compose
with the repository's `.agister/`. An agent may name another with
`fallback = "claude-opus"`: after capacity retries at 30 seconds, one,
three and five minutes, each telling the session to go on, the same work
starts fresh on that agent.
Other failures do not fall back; a fallback never chains.

A workflow may set `parallel: {max: 1, steps: [...]}` to run nodes one at
a time. Without `max` all nodes run at once. Failed nodes do not stop the
remaining nodes; the join receives their outcomes in declaration order.

A workflow may also `branch` on a condition (`equals`, `present`, `all`,
`any`, `and`, `or`, `not`) over params, inputs and earlier outputs, and
`repeat` a body with explicit `state`, `next`, `until` and `max`: a
failed test step can go back to the builder's session until the tests
pass. A step in a repeat is named `<step>/<pass>` in its record,
progress and `run.jsonl`, which also keeps each branch taken, each
pass's state and why a repeat stopped.
Use `agister check` to validate settings and `agister inspect` to see them.
See the [caller's guide](skills/agister/SKILL.md).
`~/.claude/skills/agister` links to that folder in the main checkout, so
editing the installed skill edits the repo: change it on a branch, or the
trunk checkout is left dirty and `finish-merged-pr.sh` refuses to run.

Each new run keeps one append-only `run.jsonl` under its run folder. Its
versioned lines carry ordered events and the active calls' state, including
capacity, fallback and recovery waits. Tool events keep the name and a short
input digest. The terminal line carries the full result. Readers fold the
log, ignore an unfinished last line and still read older `record.json` runs.
A failed log write fails the run and stops further appends.

`agister status [<run-id>|--last] [--json]` reports active steps, wait reasons
and deadlines, terminal outcomes, or lost and unknown runs. `agister runs list`
lists runs newest first. Each live run keeps a disposable `<run-id>.heartbeat`
in its run folder, updated every second with its process identity and pending
log-write age. A pending write of ten seconds reports a stalled writer; a beat
older than ten seconds reports unknown while its owner is still alive.
Finishing fsyncs the terminal line, stops the ticker and deletes the heartbeat.
