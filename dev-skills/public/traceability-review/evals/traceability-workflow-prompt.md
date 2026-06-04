---
date: 2026-06-04
model: claude-opus-4-8
description: "Prompts that drive the traceability-review skill as a dynamic workflow — one module (slice) per run. Versioned artifact."
---

# Traceability Review — Dynamic Workflow Prompts

## Purpose

How to run the `traceability-review` skill as a dynamic workflow. Dynamic workflows
are scripts Claude writes from a prompt and the runtime executes — the human never
hand-authors the JavaScript — so the durable, versioned artifact is the prompt.

**One module (slice) per run.** A workflow run shares a single session token budget.
Running a whole multi-module project in one run (e.g. Agonara: five modules, three
passes each, a ~10k-line test file) exceeds that budget and will not complete — the
wall we hit. So slicing happens **across runs**: enumerate the modules once, then fire
one run per module.

## Step 1 — slice plan (a plain ask, not a workflow)

The modules come from the project's **module responsibility map** — the ownership
substrate named in the skill's topology precondition. This is a single cheap read,
no fan-out:

```
Read the module responsibility map under <PROJECT_ROOT> and list each module with its
ADRs, specs, and test files — the traceability-review slice plan. Don't run any passes.
```

## Step 2 — run one module as a workflow

Fire this once per module from the slice plan:

```
ultracode: Run the traceability-review skill as a workflow over the <MODULE> module of <PROJECT_ROOT>.
One slice agent reads <MODULE>'s ADRs, specs, and intents once and greps ALL test titles (names only, never bodies, never run tests), labeling each in/out of scope.
Then fan out the skill's passes (ADR→spec, spec↔tests, orphan) working only from that slice; each returns structured JSON (rows, findings, open questions), no prose.
A final agent reduces the pass outputs into the module's umbrella ledger.
```

## Notes

- **Skill by name.** Reference `traceability-review`; its `references/` (incl.
  `pass-notes.md`) load with the skill — don't enumerate or path them.
- **Why per-slice runs.** The token budget is per run; one module per run keeps each
  run completable and lets you read its cost before firing the next.
- **How scope is decided.** Not magic — Step 1 reads the module responsibility map to
  enumerate modules; the module-decomposed ADR/spec/test layout locates each module's
  files. The caller picks which module each run covers.
- **Read-once / grep all titles.** The slice agent reads the module's inputs once and
  greps *all* test titles, labeling scope — so shared/cross-cutting tests stay visible
  (else shared-transport clauses false-flag as untested).
- **Structured JSON.** Pass agents return schema-validated rows/findings/open-questions,
  not prose — reliable reduce, clean output.
- **Output location.** When run for real, the skill writes findings to
  `<project>/docs/traceability-reviews/` (its contract — unchanged). Dev/eval runs
  against Agonara must **not** be committed into the project; keep any frozen reference
  copies under this `evals/` directory.
