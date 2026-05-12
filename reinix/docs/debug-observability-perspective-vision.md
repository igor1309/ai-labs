---
date: 2026-04-28
model: gpt-5
description: "Perspective vision for Reinix trace mode and watch-based observability."
---

# Debug Observability Perspective Vision

## Purpose

This note records perspective observability ideas that should not be bundled into the first CLI debug-mode task.

The near-term decision is ADR-010: compact live `--debug` output on stderr. The ideas below are future extensions.

## Trace Mode

Trace mode should be an explicit opt-in mode for rich diagnostics written to the run directory.

Candidate CLI shape:

```bash
reinix --trace --task-file tasks/example.md
```

or:

```bash
reinix --debug=trace --task-file tasks/example.md
```

Trace mode may record:

- selected settings paths.
- resolved agent routing table: agent ID, provider, model tier, concrete model, runner, and reasoning effort.
- generated prompts per agent.
- JSON Schemas per agent.
- provider command arguments with environment, credentials, and secrets omitted.
- provider stdout/stderr diagnostics as files or references.
- provider runner/session references.
- policy input/output per decision.
- terminal failure reason and status.

Trace mode should prefer files under the run directory over terminal output. It must be explicit because prompts and provider diagnostics may contain sensitive task or repository content.

## Watch Command

A watch command should follow an existing run's event log.

Candidate CLI shape:

```bash
reinix watch latest
```

or:

```bash
reinix watch 20260428T141417Z-boz0l1nw
```

The command may render `events.jsonl` as compact human-readable progress:

- agent start/end.
- provider/model tier selection.
- policy decisions.
- runtime failures.
- final completion status.

This is useful after a run exists or when another process started Reinix. It does not replace `--debug`, because `--debug` helps during startup and the first provider call before a user knows the run ID.

## Boundaries

- Do not make trace mode the default.
- Do not print secrets, provider auth state, or environment variables.
- Do not change orchestration decisions for observability.
- Do not require a watch command before `--debug` is useful.
- Do not add a terminal UI until plain text output proves insufficient.

## Open Questions

- Should trace mode be named `--trace` or `--debug=trace`?
- Should trace output be one JSON file, a directory of files, or both?
- Which prompt and provider-output redaction rules are required before trace mode is safe for routine use?
- Should `reinix watch latest` discover the latest run globally, or should it require an explicit home directory when running outside a project?
