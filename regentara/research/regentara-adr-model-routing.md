---
title: "ADR: Model Routing via Regentara-Defined Semantic Route Keys"
date: 2026-04-25
status: accepted
product: Regentara
scope: model routing
---

# ADR: Model Routing via Regentara-Defined Semantic Route Keys

## Status

Accepted

## Context

Regentara orchestrates workflow phases that may need different model behavior.

The workflow should not reference concrete model versions directly. Concrete model versions change over time and should be resolved through settings.

For the MVP, Regentara invokes existing provider CLIs as headless subprocesses:

- OpenAI models run through Codex CLI.
- Anthropic models run through Claude Code CLI.

Regentara does not manage provider credentials.

Credentials, authentication, and provider sessions remain owned by the underlying provider CLIs and the user environment.

## Decision

Regentara will route workflow phases through Regentara-defined semantic model route keys.

The supported MVP route keys are:

```text
sonnet
opus
gpt
gpt-codex
```

These route keys are owned by Regentara.

Users must not introduce arbitrary model route keys through settings.

Workflow phases reference semantic route keys, not concrete model versions.

Example:

```yaml
phaseModels:
  implement: sonnet
  review: gpt
  fix: opus
  codeReview: gpt-codex
```

In this example, `sonnet`, `gpt`, `opus`, and `gpt-codex` are Regentara-defined route keys.

## Model Settings File

Model route keys are resolved through a separate settings file:

```text
models.yaml
```

Regentara will look for model settings in the following locations:

```text
./.regentara/models.yaml
~/.regentara/models.yaml
```

This precedence matches `agents.yaml`.

Repository-local model settings win over global model settings.

If `./.regentara/models.yaml` exists, it fully replaces `~/.regentara/models.yaml`.

Regentara will not merge local and global model settings.

If the local file exists and is invalid, Regentara must fail immediately and must not fall back to the global file.

## Settings Shape

Each model route entry must define:

| Field | Required | Meaning |
|---|---:|---|
| `provider` | yes | Provider family for the model |
| `runner` | yes | CLI runner Regentara invokes |
| `model` | yes | Concrete model identifier passed to the runner |

Illustrative shape:

```yaml
models:
  sonnet:
    provider: anthropic
    runner: claude-code
    model: claude-sonnet-x

  opus:
    provider: anthropic
    runner: claude-code
    model: claude-opus-x

  gpt:
    provider: openai
    runner: codex
    model: gpt-x

  gpt-codex:
    provider: openai
    runner: codex
    model: gpt-x-codex
```

The concrete model identifiers are settings values and may change without changing workflow definitions.

## Validation

Regentara must validate the selected `models.yaml` during command startup, before workflow execution begins.

Validation must reject:

- missing required Regentara route keys
- unknown route keys
- missing required fields
- unsupported provider values
- unsupported runner values
- invalid provider/runner combinations

If validation fails, Regentara must fail immediately.

Regentara must not execute a workflow with invalid, partially loaded, or partially understood model routing settings.

## CLI Execution Boundary

Model routing decides which provider CLI and concrete model Regentara should use.

It does not decide subprocess invocation flags, sandbox settings, working directories, timeout behavior, environment variables, or credentials.

Those are execution concerns and are out of scope for this ADR.

For MVP routing:

| Provider | Runner |
|---|---|
| `openai` | `codex` |
| `anthropic` | `claude-code` |

Regentara invokes these runners as headless subprocesses.

Regentara does not manage provider credentials.

## Consequences

### Positive

- Workflow definitions remain stable when concrete model versions change.
- Regentara keeps ownership of model routing semantics.
- Users can adjust concrete model versions through settings.
- Provider CLI execution remains explicit and inspectable.
- Local repository settings can pin routing for a project without mutating global settings.

### Negative

- No merging means repository-local settings must duplicate all required route mappings.
- Fixed route-key inventory limits user-defined experimentation.
- Model route naming is behavior-aware and provider-aware, not provider-neutral.
- CLI flags and execution options require a separate decision.

## Non-Decisions

This ADR does not decide:

- custom user-defined model route keys
- abstract `mid` / `high` model tiers
- per-route CLI arguments
- runner sandboxing
- timeout behavior
- cancellation behavior
- retry behavior
- credential storage
- fallback between providers or runners
- dynamic model discovery
- model pricing metadata
- model capability metadata
- schema versioning for `models.yaml`

## Implementation Notes

The implementation should keep the following boundaries clear:

- model settings discovery
- YAML parsing
- schema validation
- route-key registry
- provider/runner/model resolution
- subprocess execution

Workflow execution must depend on validated model routing settings only.

No workflow phase should reference a concrete model version directly.
