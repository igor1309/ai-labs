---
date: 2026-10-14
model: claude-opus-5-5
description: "ADR-009: pages: a read-only local viewer of settings, runs and the skills a runtime loads"
---

# ADR-009: Pages

- **Status:** Proposed
- **Date:** 2026-10-14
- **Scope:** what pages shows, what it reads, and what it never does
- **Decision type:** Architecture

## Context

The owner looks at settings, runs and the skills an agent works with in a
browser on the same machine. None of it needs a call, and none of it may
change one.

## Decision

`pages` is a viewer. It reads settings files and run records directly
(ADR-001, rule 6), and the skill files a runtime loads, and serves what it
shows on this machine only. It changes nothing.

## Rules

### 1. Pages only reads

Pages starts, cancels and continues no call, and writes no setting, run
or other file.

### 2. Pages serves this machine only

It answers on the loopback address, to requests addressed to this
machine.

### 3. Runs are shown as recorded

A run is shown from its record. A record whose call ended without
finishing it is shown as lost, never as running (ADR-001, invariant 7).

### 4. An agent's skills are the ones its runtime loads

For an agent, pages shows the skills its runtime loads in the repository
and in home, each with the folder it comes from. Agister does not choose
them, and pages assigns none. What a runtime loads from elsewhere is not
shown, and pages says so. Skills seen in runs are shown apart, as
observed.

## Consequences

- Looking at Agister costs no call and risks no run.
- Pages changes with the two file formats it reads; its tests fail when
  either changes (ADR-001, rule 6).

## Open

- **Pages and layering** stays ADR-001's open point, and the skill folders
  each runtime loads join it: pages repeats what settings and the runtime
  wrappers know.
