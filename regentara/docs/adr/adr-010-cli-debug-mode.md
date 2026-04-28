---
title: "ADR: CLI Debug Mode"
date: 2026-04-28
model: gpt-5
description: "Draft decision for a compact live Regentara CLI debug mode on stderr."
status: draft
product: Regentara
scope: CLI runtime visibility
---

# ADR: CLI Debug Mode

## Executive Summary

Regentara should provide a compact `--debug` CLI mode for live human-readable progress while a run is executing.

Debug output goes to stderr so stdout remains reserved for the final CLI result.

The mode is intentionally shallow: it shows settings resolution, route selection, agent lifecycle, policy decisions, and terminal status, but does not print full prompts, schemas, provider stdout/stderr, environment variables, or secrets.

Scope: CLI observability for a currently running Regentara process. Out of scope: trace archives, watch commands, UI dashboards, provider streaming, and changes to `events.jsonl`.

## Context

Regentara already writes per-run progress to `events.jsonl`, but that surface is indirect while a command is still running. A user needs to know what Regentara is doing now: which settings were selected, which agent is running, which provider/model tier was resolved, whether a provider call ended, what policy decided, and why a run failed.

Two heavier alternatives are useful but should not be the first step:

- A full trace mode that writes prompts, schemas, command arguments, and provider diagnostics to the run directory.
- A `regentara watch latest|<run-id>` command that follows an existing run's event log.

Both are perspective work. The immediate problem is live operator feedback during one CLI invocation.

## Decision

Regentara will add a CLI `--debug` flag.

When `--debug` is present, the CLI prints compact live progress lines to stderr. Stdout remains reserved for the final CLI result.

Debug output should include:

- selected `agents.yaml`, `models.yaml`, and `policy.yaml` paths after resolution.
- run ID and run directory after run creation.
- agent start and end events.
- agent ID, configured provider, configured model tier, concrete model, runner, and reasoning effort when available.
- task file on Producer start.
- provider runner/session references when available.
- policy decisions.
- terminal status and failure reason.

The existing `events.jsonl` behavior remains unchanged.

## Rules / Invariants

- `--debug` MUST write to stderr, not stdout.
- `--debug` MUST NOT change orchestration behavior or routing decisions.
- `--debug` MUST NOT change the `events.jsonl` schema.
- `--debug` MUST NOT print full prompts.
- `--debug` MUST NOT print full JSON Schemas.
- `--debug` MUST NOT print full provider stdout or stderr.
- `--debug` MUST NOT print environment variables, credentials, auth state, or provider secrets.
- `--debug` MUST identify selected settings paths when those paths are known.
- `--debug` MUST identify the run ID and run directory when a run is created.
- `--debug` MUST identify the provider/model tier and concrete runner selection for each agent call.
- `--debug` SHOULD be deterministic enough for focused tests.

## Consequences

### Positive

- Users can see what Regentara is doing during long-running provider calls.
- Startup and routing problems become easier to diagnose without opening run files manually.
- stdout remains usable by scripts that consume the final CLI result.
- The feature can reuse the existing orchestration lifecycle and event concepts.

### Negative

- The CLI gains another output mode that tests must cover.
- Debug output must be curated carefully to avoid leaking sensitive task or provider data.
- The line format may become user-visible and therefore harder to change casually.

## Non-Goals

This ADR does not decide:

- full trace archives.
- `regentara watch`.
- provider streaming or token-level output.
- terminal UI, curses UI, web UI, or dashboards.
- prompt/schema redaction rules beyond "do not print them in `--debug`."
- changes to provider CLI adapters beyond exposing existing references to debug output.
- changes to `events.jsonl` or run metadata schemas.
