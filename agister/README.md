# Agister

A runner for AI-agent work defined in settings files.

- [Architecture, ADR-001](docs/adr/001-agister-architecture.md)
- [ADRs](docs/adr/)
- [The earlier implementation](archive/README.md), kept unchanged as
  reference; the installed `agister` is this one
  (`scripts/loop/install.sh`)

Settings in `home/` define agents, processes and workflows and compose
with the repository's `.agister/`. An agent may name another with
`fallback = "claude-opus"`: after capacity retries at 30 seconds, one
minute and three minutes, the same work starts fresh on that agent.
Other failures do not fall back; a fallback never chains.

A workflow may set `parallel: {max: 1, steps: [...]}` to run nodes one at
a time. Without `max` all nodes run at once. Failed nodes do not stop the
remaining nodes; the join receives their outcomes in declaration order.
Use `agister check` to validate settings and `agister inspect` to see them.
See the [caller's guide](skills/agister/SKILL.md).
