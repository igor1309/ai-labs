---
title: "ADR: Provider Model Tier Routing"
date: 2026-04-28
model: gpt-5
description: "Regentara agents select provider and model tier separately, while models.yaml maps provider-local tiers to concrete CLI models."
status: accepted
product: Regentara
scope: model routing configuration
---

# ADR: Provider Model Tier Routing

## Executive Summary

Regentara agents will reference model routing as `(provider, model tier)` instead of a single flat route key.

For example, `producer` can use `provider: anthropic` and `model: medium`, while `reviewer` can use `provider: openai` and `model: high`. The selected provider owns its tier mapping in `models.yaml`.

Scope: `agents.yaml`, `models.yaml`, provider CLI routing inputs, and the Codex reasoning-effort pass-through. Out of scope: changing agent identifiers, policy settings, provider credentials, or direct provider API calls.

## Context

ADR-002 started with Regentara-defined route keys such as `sonnet`, `opus`, `gpt`, and `codex`. ADR-007 then relaxed route keys into catalog values, with cross-file validation that every referenced route key must resolve in `models.yaml`.

That flat shape made routine composition awkward. The desired production configuration is provider-switchable by agent while preserving human-readable capability tiers:

- `producer`: `provider: anthropic`, `model: medium`
- `reviewer`: `provider: openai`, `model: high`
- `remediator`: `provider: anthropic`, `model: high`

The flat route-key shape forced names such as `gpt`, `codex`, `sonnet`, or `opus` to carry both provider choice and capability tier. It also made OpenAI reasoning effort feel like another route key instead of tier metadata.

## Decision

`agents.yaml` agent entries must define:

- `provider`: provider catalog key.
- `model`: provider-local tier key.
- `prompt`: prompt reference.
- `output`: output schema reference or inline schema.

`models.yaml` must define a top-level `providers` mapping. Each provider entry must define:

- `runner`: provider CLI adapter key.
- `models`: provider-local tier mapping.

Each provider-local tier must define:

- `model`: concrete model identifier passed to the provider CLI.

A tier may also define optional runner-specific metadata. The current optional metadata is `reasoningEffort`, passed to the Codex runner as `model_reasoning_effort`.

Regentara must fail startup validation when an agent references a provider or provider-local model tier that the selected `models.yaml` does not define.

The old top-level `routes` schema is no longer accepted.

## Rules / Invariants

- Agent identifiers remain exactly `producer`, `reviewer`, and `remediator` for the MVP workflow.
- `agents.yaml` MUST require non-empty string `provider` and `model` fields for every agent.
- `models.yaml` MUST define top-level `providers`.
- A provider entry MUST be a mapping with non-empty string `runner` and a `models` mapping.
- A provider-local model tier MUST be a mapping with non-empty string `model`.
- `reasoningEffort`, when present, MUST be a non-empty string.
- Provider keys, model tier keys, runner keys, and prompt references remain catalog values, not closed whitelists.
- Startup validation MUST resolve every configured agent `(provider, model)` pair before creating a run.
- CLI availability validation MUST check only runners referenced by configured agents.
- The Codex runner MUST receive configured `reasoningEffort`; other runners may ignore metadata they do not support.
- Regentara MUST NOT manage provider credentials, authentication state, or direct provider API calls.

## Consequences

### Positive

- Agent composition reads naturally: provider choice and capability tier are independent configuration fields.
- Users can switch a phase from Anthropic to OpenAI by changing `provider` without renaming capability tiers.
- OpenAI `high` and `medium` can share `gpt-5.5` while differing by `reasoningEffort`.
- Startup errors can name the unresolved provider/tier pair directly.

### Negative

- Existing flat `routes` settings must be migrated.
- ADR-002 and ADR-007 remain historically useful but no longer describe the active `models.yaml` schema.
- Tests and examples must track a two-level mapping instead of single route keys.

## Non-Goals

This ADR does not decide:

- a closed inventory of providers, tiers, runners, or model IDs.
- provider credential storage.
- model pricing, availability, or automatic fallback behavior.
- per-agent retry budgets or review policy behavior.
- a generic metadata schema for all future provider adapters.
- migration tooling for old `routes` files.
