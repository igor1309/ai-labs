---
title: "ADR: Run Artifact Storage and Mutation Policy"
date: 2026-04-25
model:got-5.5.-thinking
status: accepted
product: Regentara
scope: run artifacts
---

# ADR: Run Artifact Storage and Mutation Policy

## Status

Accepted

## Context

Regentara runs produce artifacts.

Those artifacts may include inputs, outputs, decisions, progress evidence, execution evidence, and human-readable notes.

The artifact model must support inspection and later analysis without prematurely locking Regentara’s workflow taxonomy, iteration layout, file naming, or progress-recording mechanism.

For the MVP, Regentara should define only the storage and mutation invariants that are needed to keep run artifacts understandable and safe.

## Decision

Regentara will store run artifacts under a global run directory.

The storage root is:

```text
~/.regentara/runs/<run-id>/
```

The run ID is created when the Regentara run starts.

The run ID must use:

```text
<run-start-timestamp>-<short-random-suffix>
```

Example:

```text
20260425T132530Z-a7f3
```

The timestamp represents the run start time.

The short random suffix prevents collisions when multiple runs start close together.

## Artifact Format Policy

Human-readable artifacts may be stored as Markdown.

Machine-readable artifacts may be stored as JSON or JSONL.

This ADR does not require every artifact to have both human-readable and machine-readable forms.

## Mutation Policy

Authored artifacts are immutable after creation.

Regentara must not rely on mutating authored artifacts to record execution progress.

Progress recording is a separate concern from authored artifact content.

The exact progress-recording mechanism is deferred because it must account for possible concurrent writes from provider CLIs, sub-agents, or internal runner machinery.

Run metadata may be updated as the run state changes.

## Failure Interaction

If a runtime failure occurs after a run has started, Regentara must preserve artifacts that were already created before the failure.

Regentara must not fabricate missing artifacts.

This follows the MVP failure policy ADR.

## Consequences

### Positive

- Run artifacts have a stable global storage location.
- Run IDs are readable and collision-resistant enough for MVP usage.
- Authored artifacts remain stable for inspection and later analysis.
- Execution progress cannot silently rewrite task, result, review, or plan content.
- The ADR avoids prematurely locking workflow-specific artifact taxonomy.

### Negative

- Global storage means repository-local cleanup does not remove run history.
- Exact artifact names and internal layout remain unresolved.
- Progress recording remains intentionally undecided.
- Consumers cannot yet rely on a final artifact taxonomy or file layout.

## Non-Decisions

This ADR does not decide:

- canonical artifact kinds
- workflow-specific artifact taxonomy
- exact artifact filenames
- internal run directory layout
- iteration folder layout
- artifact schemas
- whether artifacts need sidecar metadata
- progress ledger format
- append-only versus mutable progress state
- concurrency and race-handling strategy for progress writes
- write ownership between Regentara and provider CLIs
- file locking or atomic write strategy
- retention policy
- archival policy
- export format

## Implementation Notes

The implementation should keep the following concepts separate:

- run identity
- run storage root
- authored artifacts
- run metadata
- execution progress
- provider CLI references

The first implementation may choose simple file names and layout as implementation details, but those choices are not locked by this ADR.
