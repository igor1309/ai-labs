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
progress and `events.jsonl`, which also keeps each branch taken, each
pass's state and why a repeat stopped.
Use `agister check` to validate settings and `agister inspect` to see them.
See the [caller's guide](skills/agister/SKILL.md).
