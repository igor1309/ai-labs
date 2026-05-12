---
title: "ADR: CLI Execution Boundary"
date: 2026-04-25
model: gpt-5.5-thinking
description: "Reinix provider CLI invocation boundary, capture responsibilities, and workspace ownership limits for the MVP."
status: accepted
product: Reinix
scope: cli execution
---

# ADR: CLI Execution Boundary

## Executive Summary

Reinix invokes supported provider CLIs (`claude-code`, `codex`) as headless subprocesses and owns only the invocation boundary: input preparation, exit-status capture, and boundary-level references. Reinix does not manage credentials, workspaces, Git operations, builds, tests, formatting, sandboxing, or direct provider APIs. Startup validation must confirm required CLIs are available before any run is created. Scope: CLI invocation, input/capture boundaries, and working-directory policy for the MVP.

## Status

Accepted

## Context

Reinix orchestrates agent work by delegating execution to existing provider CLIs.

For the MVP, Reinix should stay focused on orchestration, routing, validation, and artifact coordination.

Reinix should not become a project workspace manager, Git automation layer, build runner, test runner, formatter, credential manager, or provider API client.

## Decision

Reinix will invoke supported provider CLIs as headless subprocesses.

For the MVP, the supported provider CLI mapping is:

| Provider | Runner |
|---|---|
| `openai` | `codex` |
| `anthropic` | `claude-code` |

Direct provider APIs are out of scope.

## Rules / Invariants

- Reinix MUST validate that every provider CLI required by the selected workflow and model routing settings is available before workflow execution starts.
- Startup validation failure MUST NOT create a Reinix run.
- Reinix MUST NOT manage provider credentials, authentication state, or provider sessions.
- Reinix MUST NOT infer successful execution from partial files, logs, or side effects if the provider CLI exits with a non-zero status.
- Reinix MUST NOT directly run build, test, or format commands; those belong to agents running through provider CLIs.
- Reinix MUST NOT create, clean up, or manage worktrees, branches, commits, or pull requests.

## Input Boundary

Reinix passes prepared execution input to the provider CLI.

Execution input may include:

- prepared prompt or task text
- references to relevant artifacts
- references to relevant files

Reinix does not require provider CLIs to receive all context in one specific form.

Exact stdin, argument, file-reference, or prompt-wrapper mechanics are implementation details.

## Capture Boundary

Reinix captures the execution result at the boundary it owns.

Reinix should capture:

- provider CLI exit status
- stdout/stderr summary or references
- runner references when available
- provider CLI session references when available

Reinix does not need to persist full provider CLI logs in this ADR.

Detailed observability, trace schema, and session reference model are deferred.

## Working Directory and Workspace Boundary

Reinix runs the provider CLI from the working directory selected for the Reinix invocation.

For MVP, Reinix does not create or select a separate managed workspace.

Git operations are performed by agents through provider CLIs.

## Project Execution Boundary

This is not only an MVP limitation — execution of project work belongs to agents running through provider CLIs.

## Sandboxing and Permissions

Reinix does not enforce its own sandboxing or permission layer around provider CLIs in this ADR.

Sandboxing, tool permissions, filesystem access, network access, and approval behavior are owned by the provider CLI configuration and the user environment.

## Failure Interaction

If a provider CLI subprocess exits with a non-zero status, Reinix treats that as a runtime failure.

If a provider CLI authentication or session error occurs during execution, Reinix treats that as a runtime failure.

Failure handling follows the MVP fail-fast failure policy ADR.

## Consequences

### Positive

- Reinix stays focused on orchestration instead of duplicating provider CLI capabilities.
- Credentials and provider sessions remain in the systems users already configure.
- Workspace and Git responsibilities remain with agents.
- Build, test, and format execution remain part of agent work, not orchestrator work.
- Direct provider API complexity is avoided in the MVP.

### Negative

- Reinix depends on external CLIs being installed and usable.
- Reinix has limited control over provider CLI internals.
- Sandboxing and permissions depend on provider CLI configuration and user environment.
- Detailed process-control behavior remains undecided.
- Workspace lifecycle automation is intentionally excluded.

## Non-Decisions

Subprocess timeout, signal forwarding, graceful termination, force-kill behavior, process-group handling, and cleanup are intentionally deferred to a future dedicated process-control ADR.

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
- Reinix observes exit status and boundary-level references
- failure policy decides how Reinix reacts to failed execution
