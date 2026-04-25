---
title: "ADR: Run Artifact Storage and Mutation Policy"
date: 2026-04-25
model: gpt-5.5-thinking
description: "Regentara run artifact storage location, run ID format, and authored-artifact mutation policy for the MVP."
status: accepted
product: Regentara
scope: run artifacts
---

# ADR: Run Artifact Storage and Mutation Policy

## Executive Summary

Regentara stores run artifacts under a per-run directory at `~/.regentara/runs/<run-id>/`. The run ID combines a UTC run-start timestamp with an 8-character lowercase alphanumeric random suffix. Authored artifacts are immutable after creation; Regentara must not mutate authored artifacts to record execution progress. Run metadata may be updated as run state changes. Canonical artifact taxonomy, file naming, internal layout, schemas, progress-recording mechanism, and retention are intentionally deferred.

## Status

Accepted

## Context

Regentara runs produce artifacts.

Those artifacts may include inputs, outputs, decisions, progress evidence, execution evidence, and human-readable notes.

The artifact model must support inspection and later analysis without prematurely locking Regentara’s workflow taxonomy, iteration layout, file naming, or progress-recording mechanism.

For the MVP, Regentara should define only the storage and mutation invariants that are needed to keep run artifacts understandable and safe.

A Regentara run is not bound to a single repository or working directory. The same run may be invoked from different cwds, against worktrees that are later removed, or with no project context at all. Run history must remain inspectable across these conditions.

For the MVP, Regentara targets Unix-like systems (macOS, Linux). Behavior on non-Unix platforms is a non-decision.

## Decision

Regentara will store run artifacts under a global run directory.

The storage root is:

```text
~/.regentara/runs/<run-id>/
```

The run ID is created when the Regentara run starts.

The run ID must match:

```text
^[0-9]{8}T[0-9]{6}Z-[a-z0-9]{8}$
```

Example:

```text
20260425T132530Z-a7f3k9m2
```

The timestamp segment must represent the run start time in UTC using compact basic format:

```text
YYYYMMDDTHHMMSSZ
```

The suffix segment must be exactly 8 lowercase alphanumeric characters (`a-z`, `0-9`) generated from at least 40 bits of randomness.

The random suffix prevents collisions when multiple runs start close together.

### Rejected Alternative: Project-Local Storage

A project-local root such as `<cwd>/.regentara/runs/` was rejected because cwd may be ephemeral (worktrees), runs may span multiple working directories, and repository-local cleanup would unintentionally erase run history.

## Artifact Format Policy

Human-readable artifacts may be stored as Markdown.

Machine-readable artifacts may be stored as JSON or JSONL.

This ADR does not require every artifact to have both human-readable and machine-readable forms.

## Mutation Policy

### Artifact Categories

This ADR distinguishes three categories of files inside a run directory:

- **Authored artifact** — a deliberate output produced by an agent, the user, or Regentara itself that records a decision, result, or evidence (e.g., task description, implementation result, review verdict, fix plan, final report).
- **Run metadata** — small, structured state describing the run itself (e.g., run ID, start time, end time, status, exit code).
- **Execution progress** — transient state that records ongoing execution events between authored artifacts.

The mutation rules below apply to these categories distinctly.

Authored artifacts are immutable after creation.

Regentara must not rely on mutating authored artifacts to record execution progress.

Progress recording is a separate concern from authored artifact content.

The exact progress-recording mechanism is deferred because it must account for possible concurrent writes from provider CLIs, sub-agents, or internal runner machinery.

Run metadata is the only mutable state defined by this ADR. Allowed mutations are limited to:

- recording the run end time
- updating run status (e.g., `running` → `succeeded` / `failed`)
- recording the final exit code

The concrete metadata file (name, schema, format) is a non-decision.

## Verification

Implementation must include tests that verify:

- run IDs use the UTC timestamp format and suffix grammar defined by this ADR
- authored artifact creation rejects overwrite or rewrite attempts
- execution progress is not recorded by mutating authored artifacts
- run metadata status updates remain allowed for the limited fields defined above

## Failure Interaction

Artifact preservation under runtime failure is governed by `adr-005-failure-policy.md` (Artifact Preservation). This ADR adds no new failure-handling rules; it only defines where preserved artifacts live and which of them are immutable.

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
- behavior on non-Unix platforms (path resolution, permissions, separators)
- run metadata file name, schema, and format

## Implementation Notes

The implementation should keep the following concepts separate:

- run identity
- run storage root
- authored artifacts
- run metadata
- execution progress
- provider CLI references

The first implementation may choose simple file names and layout as implementation details, but those choices are not locked by this ADR.
