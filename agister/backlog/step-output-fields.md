---
date: 2026-10-15
model: claude-opus-5-5
description: "Backlog: resolve checks a step's output field against its process's schema; left out of the first cut of resolve"
---

# A step's output fields

Resolve checks that `steps.<name>.outputs` reads an item that has ended,
and a child workflow's `outputs.<field>` against the outputs it gives.
It does not check a step's `outputs.<field>`: a schema reaches resolve as
its problems alone, so `steps.judge.outputs.verdikt` resolves, and the
run fails where the step's output has no `verdikt`. ADR-011, rule 6,
asks for bindings checked before execution.

Left out of the first cut of resolve, for core first (2026-10-15).

## What is open

- **What resolve is given of a schema.** Its top-level fields, or the
  paths a reference may take, from the composition, which reads the
  JSON Schema; resolve reads no schema language.
- **How deep.** A field of a field, an item of an array, a field one of
  several alternatives gives.
- **A step with no schema.** Its output is text; a field of it is a
  problem, or is not checked.

## When

When a misspelt output field costs a run.

## Where it lands

`settings/resolve`: the source's process gives what its schema allows;
`bindings.feature` gains the refusal.
