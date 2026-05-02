---
date: 2026-04-27
model: Claude Opus 4.7
description: "Settings convention for CLI tools in this repo: discovery, first-run bootstrap, structural-vs-catalog split, and consistent error reporting."
---

# CLI Settings Convention

## 1. Executive Summary

CLI tools in this repository share a settings convention covering discovery
path, first-run bootstrap, the code-vs-config split, and settings-error
reporting. File format, schema, and credential model remain per-tool. Scope
is settings only.

## 2. Context

The repo hosts multiple CLI tools (`regentara`, `session-digest`, with more
expected). Each invented its own settings approach. Two recurring problems:

- Discovery is inconsistent: some tools support per-project overrides,
  others are home-only.
- Catalog values (provider lists, base URLs, route names) are hardcoded in
  source, requiring code edits to add or change them.

Rejected: a single shared settings file or shared parser. With only two
tools today and intrinsically different config shapes (flat credentials vs.
nested workflow graph), that abstraction is premature and would force the
wrong format onto at least one tool.

## 3. Decision

Every CLI tool in this repo follows a shared settings convention: standard
discovery precedence, first-run bootstrap, an explicit structural-vs-catalog
split, and a consistent settings-error class.

File format, schema, and credential handling remain per-tool decisions.

## 4. Rules / Invariants

### Discovery

- A CLI tool MUST resolve settings from `<cwd>/.<tool>/` first, then
  `~/.<tool>/`. The first existing source wins.
- A CLI tool MUST NOT be home-only or cwd-only.

### First-run bootstrap

- On first run with no settings present, a CLI tool MUST write a `*.example`
  template at the home location and exit non-zero with an error pointing the
  user at the example.
- The bootstrap MUST be idempotent: an existing example MUST NOT be
  overwritten.

### Structural vs. catalog values

- **Structural invariants** — values whose change would require a code
  change to a consumer — MUST live in code.
- **Catalog values** — names, URLs, or lists that the engine forwards
  without semantic dependency — MUST live in configuration.
- Closed whitelists of catalog values MUST NOT be used. Built-in defaults
  are allowed; closed sets are not.
- The test for classification: if changing a value requires editing a
  consumer of the setting, it is structural; otherwise it is a catalog
  value.

### Errors

- A CLI tool MUST surface settings failures via a single, named error class
  per tool (e.g., `StartupValidationFailure`) carrying a human-readable
  message that names the offending setting.

## 5. Consequences

- Adding a provider, runner, or route in any CLI tool becomes a config
  change rather than a code change.
- Per-project settings overrides become uniformly available.
- First-run UX becomes uniform across tools.

### Known violations

The following are pre-existing violations of this ADR. Each will be closed
via a per-tool tactical action plan:

- `regentara/src/settings/model-routing.js`: closed `REQUIRED_ROUTE_KEYS`
  and `SUPPORTED_COMBINATIONS` block adding routes or runners via config.
- `regentara/src/settings/agent-settings.js`: closed `SUPPORTED_PROMPT_REFS`
  blocks user-supplied prompts. (`SUPPORTED_SCHEMA_REFS` is structural —
  the orchestrator reads field names by identity — and stays in code.)
- `regentara`: no first-run bootstrap; absent settings emit a hard error
  without writing an example template.
- `session-digest/src/config.ts`: hardcoded `openRouterBaseURL`,
  `nvidiaBaseURL`, and provider precedence.
- `session-digest`: home-only discovery; no `<cwd>/.session-digests/`
  override.

## 6. Non-Goals

- Unifying settings file format across tools (dotenv vs. YAML vs. TOML).
- Building a shared settings module or parser.
- Establishing a single repo-wide settings root.
- Logging conventions, exit-code conventions, or any non-settings concern.
