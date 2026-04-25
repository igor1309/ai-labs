---
date: 2026-04-25
model: gpt-5.5-thinking
description: "Backlog of missing or follow-up Regentara architecture decision records."
---

# Regentara ADR Backlog

## Missing/Next ADRs

1. **Session & Trace Model** — Regentara session ID, links to Codex/Claude Code sessions, persisted references.

2. **Observability** — what Regentara logs: command, agent, provider CLI, model tier, artifact paths, exit status, duration, references.

3. **Settings Topology** — relationship between `agents.yaml` and `models.yaml`, secrets exclusion, local/global precedence consistency.

4. **Review Contract** — verdict schema, authority of reviewer, required evidence, handoff to fixer.

5. **Process Control** — subprocess timeouts, signal forwarding, graceful termination, force-kill behavior, process groups, and cleanup.
