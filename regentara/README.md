# Regentara

Regentara is an MVP workflow runner that orchestrates provider CLI agents through a Producer, Reviewer, review policy, and optional Remediator loop.

## Boundaries

- Regentara invokes provider CLIs as subprocesses; it does not call provider APIs directly.
- Regentara does not manage credentials, authentication state, sessions, worktrees, branches, commits, pull requests, builds, tests, formatting, dependency installation, sandboxing, permissions, cleanup, retries, or subprocess timeouts.
- Runtime settings are read from `.regentara/agents.yaml` and `.regentara/models.yaml` in the invocation working directory before falling back to `~/.regentara/`.

## MVP Status

The package scaffold is present so behavior can be added behind compiling module boundaries.
