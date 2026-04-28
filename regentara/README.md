# Regentara

Regentara is an MVP workflow runner that orchestrates provider CLI agents through a Producer, Reviewer, review policy, and optional Remediator loop.

## Boundaries

- Regentara invokes provider CLIs as subprocesses; it does not call provider APIs directly.
- Regentara does not manage credentials, authentication state, sessions, worktrees, branches, commits, pull requests, builds, tests, formatting, dependency installation, sandboxing, permissions, cleanup, retries, or subprocess timeouts.
- Runtime settings are read from `.regentara/agents.yaml` and `.regentara/models.yaml` in the invocation working directory before falling back to `~/.regentara/`.
- Production composition requires an injected `ReviewFixPolicy`; Regentara does not ship a default policy implementation.

## CLI

```bash
regentara --task "implement the accepted task"
```

Run Regentara from the target workspace. Provider CLIs run in the Regentara invocation working directory; the run directory is reserved for Regentara-owned artifacts and diagnostics.

## MVP Status

The package scaffold is present so behavior can be added behind compiling module boundaries.
Built-in provider CLI runners use native structured-output modes and pass only validated semantic JSON to the orchestration loop.

## Settings

`agents.yaml` must define exactly `producer`, `reviewer`, and `remediator` under an `agents` mapping. Each agent must include `model`, `prompt`, and `output`.

Supported prompt references are:

- `regentara://prompts/producer`
- `regentara://prompts/reviewer`
- `regentara://prompts/remediator`

Supported output schemas are inline JSON Schema objects under `output.schema` or built-in schema references under `output.schemaRef`:

- `regentara://schemas/producer-output` requires `artifact`
- `regentara://schemas/reviewer-output` requires `verdict`
- `regentara://schemas/remediator-output` requires `task`
