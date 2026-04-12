---
title: Minor Feature Addition — Mandatory Structure
date: 2026-04-12
author: Igor Malyarov
version: 0.0.1
format: structure
---

# Minor Feature Addition — Mandatory Structure

## Front-matter

```yaml
---
date: YYYY-MM-DD
model: <model used>
description: "Minor feature: <one-line capability summary>"
---
```

## Sections

### `# Minor Feature: Short Capability Title`

Name the capability being added, not the component it lives in.

### `## Goal`

One to three sentences. What is being added and why now. Reference the existing ADR or spec the change fits within.

### `## Behavior delta`

What changes relative to current behavior. Explicit before/after where it helps. This is the load-bearing section — vague deltas defeat the purpose of this path.

### `## Out of scope`

What is intentionally left unchanged, especially adjacent behaviors a reader might expect to be touched. This section guards against scope creep.

### `## Affected area`

The module(s), file(s), and contract(s) the change touches. Note any contracts that are read but not modified.

### `## Architectural fit`

A short statement that the change does not require:

- a new module boundary
- a new protocol or contract owner
- a new dependency direction
- contradiction of any existing ADR

If any of these is true, this is no longer a minor feature addition — escalate to the full pre-coding sequence.

### `## Implementation slices`

Ordered steps for delivery. Each slice should be small enough to test and commit independently.

### `## Validation`

How correctness will be checked: tests added or updated, manual checks if any, and how the existing test suite confirms unchanged behavior.

### `## Done criteria`

What "added" means — typically: behavior delta implemented, validation green, no architectural drift, no out-of-scope changes.
