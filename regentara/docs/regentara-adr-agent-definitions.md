---
title: "ADR: Agent Definitions via Schema-Validated YAML Settings"
date: 2026-04-25
status: accepted
product: Regentara
scope: agent definitions
---

# ADR: Agent Definitions via Schema-Validated YAML Settings

## Status

Accepted

## Context

Regentara needs a deterministic way to define agents without hardcoding every agent role, prompt, model, and output contract in application code.

Agent definitions must be:

- editable by the user
- portable across machines and repositories
- safe to load before execution
- verifiable against an explicit schema
- predictable when both global and repository-local settings exist

The first supported settings format is YAML.

TOML is explicitly out of scope for this ADR.

## Decision

Regentara will define agents declaratively through a schema-validated YAML settings file.

The canonical file is:

```text
agents.yaml
```

Regentara will look for agent settings in the following locations:

```text
./.regentara/agents.yaml
~/.regentara/agents.yaml
```

Repository-local settings win over global settings.

If `./.regentara/agents.yaml` exists, it fully replaces `~/.regentara/agents.yaml`.

Regentara will not merge local and global agent settings.

## Settings Format

Agent settings are expressed in YAML.

Minimal shape:

```yaml
agents:
  reviewer:
    name: Reviewer
    model: xxx
    prompt: xxx
    output:
      format: json
      schema: xxx
```

The `agents` key contains named agent definitions.

The key under `agents` is the stable agent identifier used by Regentara internally and by commands.

Each agent must define its expected output as JSON.

The `output` field must point to or embed a JSON Schema definition.

Regentara must validate the agent settings file structurally at startup, including the presence and shape of this output schema reference or inline schema.

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

## Required Agent Fields

Each agent definition must include:

| Field | Required | Meaning |
|---|---:|---|
| `name` | yes | Human-readable agent name |
| `model` | yes | Model identifier selected for this agent |
| `prompt` | yes | Prompt definition, validated as either an inline prompt or a supported prompt reference |
| `output` | yes | JSON output contract, defined by a supported JSON Schema reference or inline schema |

The exact schema belongs to the implementation spec.

This ADR requires that such a schema exists and that Regentara validates agent settings against it before command execution.

## Validation

Regentara must validate the selected `agents.yaml` against the agent schema during command startup, before any command execution or agent work begins.

If validation fails, Regentara must fail immediately.

Regentara must not execute with invalid, partially loaded, or partially understood agent settings.

## Runtime Output Validation

Regentara must validate each agent runtime output against the JSON Schema declared in that agent definition.

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

Reason: the presence of a repository-local file expresses local intent. Falling back to global settings would silently execute a different agent definition than the repository requested.

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
- Agent definitions can be versioned inside repositories.
- Repository-specific workflows can override global defaults.
- Startup validation prevents broken settings from reaching execution.
- YAML supports nested structures and multiline prompt-related settings cleanly.

### Negative

- YAML requires strict schema validation because malformed structure can be easy to miss.
- No merging means local configs may need to duplicate global defaults.
- Install/update scripts must avoid overwriting user configuration.

## Non-Decisions

This ADR does not decide:

- the full final schema
- whether prompts are inline strings, file references, or both
- the exact model registry format
- output destination semantics beyond the required JSON output contract
- retry, repair, or recovery behavior after runtime output validation failure
- future support for `agents.d/*.yaml`
- future migration tooling
- TOML support

## Implementation Notes

The implementation should keep the following boundaries clear:

- settings discovery
- YAML parsing
- schema validation
- agent registry construction
- command execution

Command execution must depend on validated agent definitions only.

No command should parse or interpret raw YAML directly.
