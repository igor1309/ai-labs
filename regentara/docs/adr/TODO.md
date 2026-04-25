---
date: 2026-04-25
model: gpt-5.5-thinking
---


Missing/next ADRs:

1. **Artifact Model** — canonical files for task, implementation result, review, fix plan, final report; naming, location, immutability/mutation rules.

2. **CLI Execution Boundary** — Regentara invokes Claude Code/Codex as headless subprocesses; owns orchestration, not credentials or provider sessions.

3. **Model Tier & Routing** — `mid`/`high` tiers, provider mapping, `models.yaml`, OpenAI→Codex, Anthropic→Claude Code.

4. **Failure Policy** — MVP fail-fast, no Regentara retries; classify subprocess failure, invalid output, timeout, cancellation.

5. **Session & Trace Model** — Regentara session ID, links to Codex/Claude Code sessions, persisted references.

6. **Observability** — what Regentara logs: command, agent, provider CLI, model tier, artifact paths, exit status, duration, references.

7. **Settings Topology** — relationship between `agents.yaml`, possible `models.yaml`, secrets exclusion, local/global precedence consistency.

8. **Review Contract** — verdict schema, authority of reviewer, required evidence, handoff to fixer.