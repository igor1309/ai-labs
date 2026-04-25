---
title: "ADR: CLI Execution Boundary"
date: 2026-04-25
status: accepted
product: Regentara
scope: cli execution
---

# ADR: CLI Execution Boundary

## Status

Accepted

## Context

Regentara orchestrates agent work by delegating execution to existing provider CLIs.

For the MVP, Regentara should stay focused on orchestration, routing, validation, and artifact coordination.

Regentara should not become a project workspace manager, Git automation layer, build runner, test runner, formatter, credential manager, or provider API client.

## Decision

Regentara will invoke supported provider CLIs as headless subprocesses.

For the MVP, the supported provider CLI mapping is:

| Provider | Runner |
|---|---|
| `openai` | Codex CLI |
| `anthropic` | Claude Code CLI |

Direct provider APIs are out of scope.

Regentara does not manage provider credentials or provider sessions.

Credentials, authentication state, provider accounts, and provider CLI sessions remain owned by the provider CLIs and the user environment.

## Startup Validation

Regentara must validate that every provider CLI required by the selected workflow and model routing settings is available before workflow execution starts.

If a required CLI is unavailable, Regentara must fail during startup validation.

Startup validation failure is a pre-run failure and must not create a Regentara run.

If a provider CLI is available but rejects authentication or session state during execution, Regentara treats that as a runtime failure.

## Input Boundary

Regentara passes prepared execution input to the provider CLI.

Execution input may include:

- prepared prompt or task text
- references to relevant artifacts
- references to relevant files

Regentara does not require provider CLIs to receive all context in one specific form.

Exact stdin, argument, file-reference, or prompt-wrapper mechanics are implementation details.

## Capture Boundary

Regentara captures the execution result at the boundary it owns.

Regentara should capture:

- provider CLI exit status
- stdout/stderr summary or references
- runner references when available
- provider CLI session references when available

Regentara does not need to persist full provider CLI logs in this ADR.

Detailed observability, trace schema, and session reference model are deferred.

## Working Directory Boundary

Regentara runs the provider CLI from the working directory selected for the Regentara invocation.

For MVP, Regentara does not create or select a separate managed workspace.

Regentara does not create, clean up, or manage worktrees.

Regentara does not own workspace preparation or repository lifecycle management.

## Workspace Operations Out of Scope

The following operations are out of scope for Regentara:

- worktree creation
- worktree cleanup
- branch management
- commits
- pull request creation
- repository cleanup

Git operations are performed by agents through provider CLIs.

## Project Execution Boundary

Regentara does not directly run build, test, or format commands.

This is not only an MVP limitation.

Execution of project work belongs to agents running through provider CLIs.

If a workflow requires build, test, format, verification, or repository modification, the relevant agent performs that work through its provider CLI.

## Sandboxing and Permissions

Regentara does not enforce its own sandboxing or permission layer around provider CLIs in this ADR.

Sandboxing, tool permissions, filesystem access, network access, and approval behavior are owned by the provider CLI configuration and the user environment.

## Failure Interaction

If a provider CLI subprocess exits with a non-zero status, Regentara treats that as a runtime failure.

If a provider CLI authentication or session error occurs during execution, Regentara treats that as a runtime failure.

Failure handling follows the MVP fail-fast failure policy ADR.

## Consequences

### Positive

- Regentara stays focused on orchestration instead of duplicating provider CLI capabilities.
- Credentials and provider sessions remain in the systems users already configure.
- Workspace and Git responsibilities remain with agents.
- Build, test, and format execution remain part of agent work, not orchestrator work.
- Direct provider API complexity is avoided in the MVP.

### Negative

- Regentara depends on external CLIs being installed and usable.
- Regentara has limited control over provider CLI internals.
- Sandboxing and permissions depend on provider CLI configuration and user environment.
- Detailed process-control behavior remains undecided.
- Workspace lifecycle automation is intentionally excluded.

## Non-Decisions

This ADR does not decide:

- direct provider API support
- CLI installation or upgrade management
- provider credential storage
- provider authentication flows
- provider session management
- detailed stdin/stdout/stderr mechanics
- full log persistence
- observability schema
- session trace model
- subprocess timeout behavior
- cancellation mechanics
- signal forwarding
- graceful termination
- force-kill behavior
- process-group handling
- worktree creation or cleanup
- branch management
- commit creation
- pull request creation
- repository cleanup
- build command execution
- test command execution
- format command execution
- dependency installation
- sandboxing or permission policy

## Implementation Notes

The implementation should keep the following boundaries clear:

- model routing selects provider, runner, and concrete model
- CLI execution invokes the selected runner
- provider CLIs own credentials and sessions
- agents perform project work
- Regentara observes exit status and boundary-level references
- failure policy decides how Regentara reacts to failed execution

Regentara should not infer successful execution from partial files, logs, or side effects if the provider CLI exits unsuccessfully.
