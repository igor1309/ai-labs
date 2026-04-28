---
title: "ADR: Adoption of the Repo-Level CLI Settings Convention for Regentara"
date: 2026-04-27
model: Claude Opus 4.7
description: "Regentara adopts the repo-level CLI settings convention; supersedes-in-part ADR-001 and ADR-002 on discovery, install behavior, and closed catalog whitelists."
status: accepted
product: Regentara
scope: settings convention adoption
---

# ADR: Adoption of the Repo-Level CLI Settings Convention for Regentara

## Executive Summary

Regentara adopts the repo-level `cli-settings-convention.md` ADR as binding. This ADR records that adoption, names the sections of ADR-001 and ADR-002 that are superseded-in-part, and decides — for Regentara specifically — which existing closed sets are structural and which are catalog under the new convention.

Scope: convention adoption, supersession map, structural-vs-catalog classification for Regentara's existing closed sets, and the concrete shape of first-run bootstrap for Regentara. Out of scope: the tactical action plan that closes the resulting violations, spec edits to `mvp-workflow-runner.md`, source edits, and tests.

## Status

Accepted

## Context

The repo-level ADR `docs/adr/cli-settings-convention.md` defines a shared settings convention for every CLI tool in this repository: discovery precedence, first-run bootstrap, a structural-vs-catalog split for code-vs-config, and a single named settings-error class per tool.

That ADR explicitly enumerates Regentara as having pre-existing violations:

- `regentara/src/settings/model-routing.js`: closed `REQUIRED_ROUTE_KEYS` and `SUPPORTED_COMBINATIONS`.
- `regentara/src/settings/agent-settings.js`: closed `SUPPORTED_PROMPT_REFS`.
- `regentara`: no first-run bootstrap; missing settings produces a hard error without writing an example template.

The repo-level ADR also notes that `SUPPORTED_SCHEMA_REFS` is structural and stays in code, because the orchestrator reads field names from the schema by identity.

Regentara's existing ADR-001 (`agent-settings`) and ADR-002 (`model-routing`) predate the repo-level convention and conflict with it in identifiable places. Resolving those conflicts is itself a Regentara-scoped architectural decision and requires its own durable record.

## Decision

Regentara adopts `docs/adr/cli-settings-convention.md` as binding. Where ADR-001 and ADR-002 conflict with the repo-level convention, the repo-level convention wins, and the conflicting sections are superseded-in-part by this ADR.

Regentara classifies its existing closed sets as follows:

- **Structural** (stays in code, closed inventory permitted):
  - Agent identifiers `producer`, `reviewer`, `remediator`. The Orchestrator references these by identity; renaming requires a code change to the workflow consumer. They satisfy the structural test in the repo-level ADR.
  - Output schema references (`SUPPORTED_SCHEMA_REFS`). The Orchestrator reads field names by identity, as already noted in the repo-level ADR.
- **Catalog** (moves to configuration; closed whitelists removed):
  - Model route keys (currently `sonnet`, `opus`, `gpt`, `codex`).
  - Provider names (currently `anthropic`, `openai`).
  - Runner names (currently `claude-code`, `codex`).
  - Provider/runner combinations (currently `anthropic/claude-code`, `openai/codex`).
  - Prompt references (currently `regentara://prompts/<agent>`).

Regentara confirms `StartupValidationFailure` as the single named settings-error class required by the repo-level convention.

## Supersession Map

This ADR supersedes-in-part the following sections of prior Regentara ADRs:

### ADR-001 (Agent Settings)

- §"Installation Behavior" — superseded. The install script no longer owns first-run defaults. First-run bootstrap is performed by the runtime tool per the repo-level convention: write `agents.yaml.example` to the home location and exit non-zero. The install script must not write `agents.yaml`.
- §"Validation" — superseded with respect to the closed `SUPPORTED_PROMPT_REFS` whitelist. Prompt references are catalog values; the validator must accept any prompt reference shape the consumer accepts and must not reject on a closed list. The remaining validation rules (presence of required Regentara agent identifiers, presence of required fields, output-schema-reference shape) are unchanged.
- §"Agent Inventory" — unchanged. The closed agent identifier inventory remains structural for the reasons stated above.

### ADR-002 (Model Routing)

- §"MVP Coverage Requirement" — superseded. `models.yaml` no longer needs to define a fixed set of route keys (`sonnet`, `opus`, `gpt`, `codex`). The MVP requirement becomes: every route key referenced by the selected workflow's agent settings must resolve in `models.yaml`. Route keys not referenced by the workflow do not need to be present.
- §"Validation" — superseded with respect to the closed route-key inventory, the closed provider list, the closed runner list, and the closed provider/runner combination set. Validation must reject only what is structurally invalid (missing required fields, malformed entries, references not resolvable in catalog by the workflow). Validation must not reject on a closed catalog whitelist.
- §"CLI Execution Boundary" — unchanged with respect to the table of MVP-supported provider/runner pairs as illustrative defaults. Those pairs remain the built-in defaults but must not be enforced as a closed set.

ADR-003, ADR-004, ADR-005, and ADR-006 are unaffected.

## First-Run Bootstrap for Regentara

When Regentara is invoked and neither `agents.yaml` nor `models.yaml` is present at either discovery location, Regentara must perform the bootstrap defined by the repo-level convention. The Regentara-specific shape is:

- Bootstrap files: `agents.yaml.example` and `models.yaml.example`.
- Bootstrap location: `~/.regentara/`.
- Bootstrap is per-file: a missing `agents.yaml` triggers `agents.yaml.example` independently of `models.yaml`, and vice versa. An existing `*.example` must not be overwritten.
- After writing any missing example, Regentara exits non-zero and surfaces a `StartupValidationFailure` whose message names the missing settings file and points the user to the example.
- Bootstrap runs from the runtime tool, not the install script.

Bootstrap must not create `agents.yaml` or `models.yaml` directly; only the `*.example` templates.

## Non-Goals

This ADR does not decide:

- the tactical action plan that closes the resulting violations.
- the exact spec edits to `regentara/docs/specs/mvp-workflow-runner.md`.
- the exact source edits to `regentara/src/settings/agent-settings.js` and `regentara/src/settings/model-routing.js`.
- new tests, removed tests, or test reordering.
- whether `producer`, `reviewer`, or `remediator` will ever become catalog. They are structural for now.
- whether Regentara will support TOML, XDG paths, or per-agent files. Those non-goals from ADR-001 and ADR-002 remain in force.
- credential, secret, or session-handling concerns. Those remain owned by ADR-002 and the underlying provider CLIs.
