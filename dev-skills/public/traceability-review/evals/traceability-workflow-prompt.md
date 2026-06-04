---
date: 2026-06-04
model: claude-opus-4-8
description: "Self-scoping prompt that drives the traceability-review skill as a dynamic workflow — versioned artifact"
---

# Traceability Review — Dynamic Workflow Prompt

## Purpose

The prompt that turns the `traceability-review` skill into a self-scoping dynamic
workflow. Dynamic workflows are scripts **Claude writes from a prompt** and the
runtime executes; the human never hand-authors the JavaScript. So the durable,
versioned artifact is this prompt — not a script file. The script is generated per
run, and saved (via `s` in `/workflows`) only when a run is good.

The design intent: the orchestrator **evaluates the scope itself** and slices if
large. No project specifics (module names, ADR numbers, file paths) are baked into
the prompt — only `<PROJECT_ROOT>` is supplied at invocation.

## Prompt

```
ultracode: Run the traceability-review skill (dev-skills/public/traceability-review/SKILL.md + references/pass-notes.md) as a workflow over the project at <PROJECT_ROOT>, self-scoping.
First a discovery agent applies the skill's topology precondition to evaluate scope — locate the intent layer, ADRs, module responsibility map, specs, and tests, and emit the module list; if the scope is large, slice by module and run by slice, if small run it whole.
Per slice: one agent reads that module's ADRs/specs/intents once and greps ALL test titles (names only, never bodies, never run tests), labeling each in/out of scope; then fan out the skill's passes (ADR→spec, spec↔tests, orphan) working only from that slice.
A final agent reduces the pass outputs into the umbrella ledger.
Every agent returns structured JSON (rows, findings, open questions), no prose preamble.
Gauge one module's cost before fanning out.
```

## Usage

1. Replace `<PROJECT_ROOT>` with the target project path and run the prompt
   (the `ultracode` keyword, or "run a workflow"). Claude writes the script; review
   the raw script before it runs (View raw script / `Ctrl+G`).
2. To make it reusable: when a run does what you want, open `/workflows`, select the
   run, press `s`, and save to `.claude/workflows/`. It then runs as
   `/traceability-review` and accepts `args` (e.g. the project root) on later runs.

## Design notes

- **Self-scoping** — the discovery agent decides the module slices from the skill's
  topology precondition; slicing is the workflow's job, not the caller's.
- **Read-once-per-slice** — each slice agent reads its module's inputs once and greps
  test titles only; pass agents work from the slice, never re-reading the repo. (For
  spec↔tests, the slice greps *all* titles and labels scope, so shared/cross-cutting
  tests stay visible — otherwise shared-transport clauses false-flag as untested.)
- **Structured JSON output** — agents return schema-validated rows/findings/open
  questions, not freeform markdown, so the reduce is reliable and output stays clean.
