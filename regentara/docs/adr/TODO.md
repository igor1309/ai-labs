---
date: 2026-04-25
model: gpt-5.5-thinking
---


Missing/next ADRs:

1. ~~**Artifact Model**~~ — accepted as `regentara-adr-run-artifact-storage-and-mutation-policy.md` (canonical files, naming, location, mutation rules).

2. ~~**CLI Execution Boundary**~~ — accepted as `adr-003-cli-execution-boundary.md` (Regentara invokes Claude Code/Codex as headless subprocesses; owns orchestration, not credentials or provider sessions).

3. ~~**Model Tier & Routing**~~ — superseded by `adr-002-model-routing.md` (semantic route keys: `sonnet`, `opus`, `gpt`, `codex`; `models.yaml`; OpenAI→Codex, Anthropic→Claude Code). Tiered `mid`/`high` naming was rejected in favor of behavior-aware keys.

4. **Session & Trace Model** — Regentara session ID, links to Codex/Claude Code sessions, persisted references.

5. **Observability** — what Regentara logs: command, agent, provider CLI, model tier, artifact paths, exit status, duration, references.

6. **Settings Topology** — relationship between `agents.yaml`, possible `models.yaml`, secrets exclusion, local/global precedence consistency.

7. **Review Contract** — verdict schema, authority of reviewer, required evidence, handoff to fixer.