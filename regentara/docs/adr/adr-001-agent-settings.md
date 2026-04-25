---
title: "ADR: Agent Settings for Regentara-Defined Agents"
date: 2026-04-25
model: gpt-5.5-thinking
description: "Regentara agent settings format, discovery order, validation, and install behavior for the MVP."
status: accepted
product: Regentara
scope: agent settings
---

# ADR: Agent Settings for Regentara-Defined Agents

## Executive Summary

Regentara configures known agents declaratively through a single schema-validated YAML file, `agents.yaml`, discovered first locally (`./.regentara/`) then globally (`~/.regentara/`) with no merging.

This makes agent behavior inspectable, repository-portable, and verifiable before execution, replacing hardcoded model, prompt, and output choices in application code.

Scope: file format, discovery order, startup validation, runtime output validation, and install behavior for the YAML format. Out of scope: TOML, XDG paths, custom or plugin-defined agents, schema versioning, and secret loading.

## Status

Accepted

## Context

Regentara needs a deterministic way to configure known agents without hardcoding every model, prompt, and output contract in application code.

Agent settings must be:

- editable by the user
- portable across machines and repositories
- safe to load before execution
- verifiable against an explicit schema
- predictable when both global and repository-local settings exist

The first supported settings format is YAML.

TOML is explicitly out of scope for this ADR.

## Decision

Regentara will configure known agents declaratively through a schema-validated YAML settings file.

The canonical file is:

```text
agents.yaml
```

Agent settings are stored in a single `agents.yaml` file.

Regentara defines the supported agent identifiers. The `agents.yaml` file may configure only those known identifiers.

Regentara will look for agent settings in the following locations:

```text
./.regentara/agents.yaml
~/.regentara/agents.yaml
```

This ADR intentionally uses `~/.regentara/agents.yaml` as the global configuration path.

XDG-compatible configuration paths are out of scope for this ADR.

Repository-local settings win over global settings.

If `./.regentara/agents.yaml` exists, it fully replaces `~/.regentara/agents.yaml`.

Regentara will not merge local and global agent settings.

If no `agents.yaml` is found in either location, Regentara must fail immediately at startup.

## Settings Format

Agent settings are expressed in YAML.

Illustrative shape for one configured Regentara-defined agent:

```yaml
agents:
  reviewer:
    model: xxx
    prompt: xxx
    output:
      format: json
      schema: xxx
```

The `agents` key contains settings for Regentara-defined agents.

Each key under `agents` must match a supported agent identifier from Regentara’s agent inventory.

The key is not a free-form user-defined name.

Each agent must define its expected output as JSON.

The `output` field must point to or embed a JSON Schema definition.

Regentara must validate the agent settings file structurally at startup, including the presence and shape of this output schema reference or inline schema.

## Secrets Boundary

Agent settings must not contain secrets.

Provider credentials, API keys, access tokens, and other sensitive values must be supplied through a separate secret mechanism.

Example:

```yaml
agents:
  reviewer:
    name: Reviewer
    model: provider/model
    prompt: prompts/reviewer.md
    output:
      format: json
      schema: schemas/review-output.schema.json
```

In this example, `reviewer` is a Regentara-defined agent identifier.

The settings file customizes the known `reviewer` agent; it does not create a new agent type.

## Agent Inventory

Regentara defines the supported agent inventory.

Users must not introduce arbitrary agent identifiers through `agents.yaml`.

The agent settings schema must reject unknown agent identifiers unless Regentara explicitly supports extension points for custom agents in a later ADR.

Agent settings are intentionally centralized in a single `agents.yaml` file so Regentara can validate the configured agent set as one inventory, reject unknown identifiers, and detect missing required agent settings before execution.

Regentara owns the canonical agent names. The optional `name` field is a display-name override only and does not create, rename, or identify an agent.

## MVP Coverage Requirement

For the MVP, Regentara has exactly one workflow.

The selected `agents.yaml` must define every Regentara-defined agent identifier required by that workflow. This is non-negotiable.

An `agents.yaml` that omits any required agent identifier must be rejected at startup.

## Required Agent Fields

Every Regentara-defined agent required by the executed workflow must be present in `agents.yaml` and must include:

| Field | Required | Meaning |
|---|---:|---|
| `model` | yes | Model identifier selected for this agent |
| `prompt` | yes | Prompt definition, validated as either an inline prompt or a supported prompt reference |
| `output` | yes | JSON output contract, defined by a supported JSON Schema reference or inline schema |
| `name` | no | Optional display-name override for a Regentara-defined agent |

The exact schema belongs to the implementation spec.

This ADR requires that such a schema exists and that Regentara validates agent settings against it before command execution.

## Validation

Regentara must validate the selected `agents.yaml` against the agent schema during command startup, before any command execution or agent work begins.

Validation must reject:

- missing required Regentara agent identifiers
- unknown agent identifiers
- missing required fields
- unsupported prompt reference
- unsupported output schema reference

If validation fails, Regentara must fail immediately.

Regentara must not execute with invalid, partially loaded, or partially understood agent settings.

## Runtime Output Validation

Regentara must parse each agent runtime output as JSON and validate it against the JSON Schema declared for that configured agent.

If runtime output validation fails, Regentara must treat the agent execution as failed.

Regentara must not pass invalid agent output to the next workflow step.

## Local Override Failure Behavior

If both files exist:

```text
./.regentara/agents.yaml
~/.regentara/agents.yaml
```

and the local file is invalid, Regentara must fail immediately.

It must not fall back to the global file.

Reason: the presence of a repository-local file expresses local intent. Falling back to global settings would silently execute a different agent configuration than the repository requested.

## Installation Behavior

The install script must create default agent settings at:

```text
~/.regentara/agents.yaml
```

only when the file is missing.

The install script must not overwrite existing user-modified settings.

On update, existing settings remain untouched unless a separate explicit migration command is introduced.

## Consequences

### Positive

- Agent behavior becomes inspectable and configurable.
- Repository-specific agent settings can be versioned inside repositories.
- Repository-specific workflows can override global defaults.
- Startup validation prevents broken settings from reaching execution.
- YAML supports nested structures and multiline prompt-related settings cleanly.

### Negative

- YAML requires strict schema validation because malformed structure can be easy to miss.
- No merging means local configs must duplicate the full workflow-required agent configuration when repository-local settings are present.
- Install/update scripts must avoid overwriting user configuration.

## Non-Goals

This ADR does not decide:

- the full final schema
- whether prompts are inline strings, file references, or both
- the exact model registry format
- output destination semantics beyond the required JSON output contract
- retry, repair, or recovery behavior after runtime output validation failure
- future support for per-agent files such as `agents/reviewer.yaml`
- future support for `agents.d/*.yaml`
- custom user-defined agents
- plugin-defined agent inventory
- dynamic agent discovery
- schema versioning for `agents.yaml`
- future migration tooling
- TOML support
- the secret-loading mechanism for provider credentials, API keys, and access tokens

Schema versioning is intentionally out of scope for the first version.

Regentara may introduce a top-level `schemaVersion` field once the agent settings schema needs backward compatibility, migration support, or stable external release guarantees.

## Implementation Notes

The implementation should keep the following boundaries clear:

- settings discovery
- YAML parsing
- schema validation
- agent registry construction
- command execution

Command execution must depend on validated agent settings only.

No command should parse or interpret raw YAML directly.
