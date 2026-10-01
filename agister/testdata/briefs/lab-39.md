# LAB-39: a failed implement run records its changed files as structured output

## Context

When an implement run's own verification fails (e.g. `budget_exhausted`, observed run 20261001T070919Z-2b38be), its record has `result.output: null`; `files_changed`, the summary and the checks survive only as JSON text in `result.text`. The orchestrator's handoff check (`scripts/handoff-check.py --claimed`) reads `result.output.files_changed`, so it reported every changed file as unclaimed.

## Acceptance

- A failed implement run whose agent produced a valid final output records it as `result.output`, with the failure still the run's status and class.
- A test with a verification that fails asserts both.

## How

Tests are committed and deterministic; no mutation or revert checks. Use
the quiet test commands from `agister/AGENTS.md`; report each with its exit
code and final line, and list every file you changed.
