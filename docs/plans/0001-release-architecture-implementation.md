# Implementation Plan: Release Architecture (ADR-000 through ADR-006)

## Purpose

Bring the repository from its current state to full compliance with the
Release Architecture defined by ADR-000 through ADR-006.

The current state: no release tags, no discovery configuration, no unit
manifest, and a single Oracle-specific release workflow that assumes a
global `v*` tag namespace tied to root `package.json`.

The target state: independent, per-unit release lifecycle with
config-driven discovery, automated detection, deterministic tagging, and
Docker image tagging for applicable units.

------------------------------------------------------------------------

## Execution Lock

Worktree required: yes
Expected worktree: `worktrees/release-arch`
Expected branch: `codex/release-arch`
Preflight check: [ ] done

------------------------------------------------------------------------

## Scope Guardrails

The following are **explicitly excluded** from this plan per ADR-000
Non-Goals and planner requirements §9:

-   Changelog enforcement.
-   Commit convention enforcement.
-   SBOM or signing policy.
-   Release notes automation.
-   Global release train introduction.
-   Discovery beyond configured scopes.

------------------------------------------------------------------------

## ADR Traceability Matrix

| ADR   | Invariant                                              | Phase |
| ----- | ------------------------------------------------------ | ----- |
| 005   | Discovery limited to configured prefixes               | 1     |
| 005   | Generator output committed as manifest                 | 1     |
| 005   | CI fails if manifest drifts                            | 1     |
| 005   | Each unit has exactly one canonical metadata file       | 1     |
| 002   | Node units use `package.json`                          | 1     |
| 002   | Non-Node units use `release.toml`                      | 1     |
| 002   | Unit MUST NOT contain both                             | 1     |
| 002   | Version follows semver                                 | 1     |
| 003   | Basenames globally unique                              | 1     |
| 003   | Basenames MUST NOT contain underscores                 | 1     |
| 003   | Basename equals leaf directory name of unit root path  | 1     |
| 004   | Base commit is last matching tag for unit               | 2     |
| 004   | No tag → base is initial repository commit             | 2     |
| 004   | Release only if path changed AND version changed       | 2     |
| 004   | Detection is idempotent                                | 2     |
| 001   | Version bump is explicit release intent signal         | 2     |
| 003   | Tag format `<basename>_v<version>`                     | 3     |
| 003   | Tag lookup uses glob `<basename>_v*`                   | 3     |
| 001   | Releases trigger only on push to `trunk`               | 3     |
| 001   | Release branches MUST NOT be used                      | 3     |
| 000   | Releases are tag-driven                                | 3     |
| 002   | Canonical version must change for release              | 3     |
| 006   | Docker-producing units publish `<version>` image tag   | 4     |
| 006   | Docker-producing units publish `<git-sha>` image tag   | 4     |
| 006   | Image version matches canonical semver                 | 4     |
| 006   | Policy applies only to Docker-producing units          | 4     |
| 006   | Git tag corresponds to `<basename>_v<version>`         | 4     |
| 000   | Deterministic, idempotent releases                     | 5     |
| 000   | CI enforces invariants strictly                        | 5     |

------------------------------------------------------------------------

## Phase 1 — Unit Discovery & Structural Validation

### ADR traceability

ADR-005 (discovery, manifest, drift), ADR-002 (canonical metadata,
mutual exclusion, semver), ADR-003 (basename uniqueness, no underscores,
leaf-name rule).

### Invariants established

After this phase the following hold and are enforced by automated
checks:

1.  A committed configuration file defines the set of directory prefixes
    eligible for release-unit discovery.
2.  A committed manifest (`release-units.toml`) lists every discovered
    unit with its root path, basename, canonical metadata type
    (`package.json` or `release.toml`), and current version.
3.  The manifest is the output of a deterministic generator that reads
    the configuration and scans the repository.
4.  Each listed unit contains exactly one canonical metadata file.
5.  No unit contains both `package.json` (as release metadata) and
    `release.toml`.
6.  Every basename equals the leaf directory name of its unit root path.
7.  All basenames are globally unique across units.
8.  No basename contains an underscore.
9.  Every canonical version is valid semver.

### Acceptance criteria (observable outcomes)

-   CI fails when a basename collision is introduced.
-   CI fails when a unit contains both `package.json` and
    `release.toml`.
-   CI fails when the committed manifest diverges from regenerated
    output.
-   CI fails when a basename contains an underscore.
-   CI fails when a canonical version is not valid semver.
-   CI fails when a unit directory lacks a canonical metadata file.
-   Generator produces identical output on repeated runs (deterministic).

### Edge cases addressed

-   **First release of a unit**: unit appears in manifest with its
    current version; no tag exists yet. This is a valid state — Phase 2
    handles detection for tagless units.
-   **Basename collision attempt**: generator or CI validation rejects
    the configuration.

### Phase completion criteria

-   All acceptance criteria pass in CI.
-   Commit boundary.

------------------------------------------------------------------------

## Phase 2 — Release Detection

### ADR traceability

ADR-004 (detection algorithm, idempotency, first-release base), ADR-001
(version bump as intent signal), ADR-003 (tag lookup glob).

### Invariants established

After this phase the following hold and are enforced by automated
checks:

1.  For each unit in the manifest, the system determines whether a
    release should occur by comparing the current state against a base.
2.  The base for a unit is the commit pointed to by the last tag
    matching `<basename>_v*`.
3.  If no matching tag exists, the base is the initial commit of the
    repository.
4.  A release is signaled if and only if **both** conditions are true:
    -   At least one file under the unit root path changed since base.
    -   The canonical version changed since base.
5.  Detection produces identical output when run multiple times against
    the same repository state (idempotent).

### Acceptance criteria (observable outcomes)

-   **Path change without version change**: no release detected.
-   **Version change without path change**: no release detected.
-   **Both path and version changed**: release detected.
-   **First release (no prior tag)**: uses initial commit as base;
    release detected when version and path differ from initial state.
-   **Idempotent rerun**: detection output is identical across
    consecutive runs.
-   **Multiple units**: detection evaluates each unit independently;
    releasing one unit does not trigger release of another.

### Edge cases addressed

-   **First release of a unit**: no matching tag → comparison base is
    the initial repository commit. If the unit's path contains changes
    (it will, since the unit was added after initial commit) and the
    version is set, a release is detected.
-   **Version change without path change**: a version bump in the
    metadata file without any other file changes under the unit root
    does not trigger release (the metadata file itself is under the unit
    root, so this scenario means only the metadata file changed — the
    executor must define whether the metadata file counts as a "path
    change." Per ADR-004, files under unit root includes the metadata
    file, so a version bump alone _does_ constitute a file change. The
    invariant therefore becomes: version change without path change is
    only possible if the metadata file lives outside the unit root,
    which the architecture prohibits. Detection correctly triggers).
-   **Path change without version change**: files changed but version
    unchanged → no release. This is the guard against accidental
    releases.

### Phase completion criteria

-   All acceptance criteria pass in CI.
-   Commit boundary.

------------------------------------------------------------------------

## Phase 3 — Tag Creation & Trunk Enforcement

### ADR traceability

ADR-003 (tag format, basename-version binding), ADR-001 (trunk-only
releases, no release branches), ADR-000 (tag-driven releases), ADR-002
(canonical version must change).

### Dependency

Phases 1 and 2 invariants are prerequisites. Detection must be proven
correct before tags are created.

### Invariants established

After this phase the following hold and are enforced by automated
checks:

1.  For each detected release, a git tag `<basename>_v<version>` is
    created.
2.  The basename in the tag matches the leaf directory name of the unit
    root path.
3.  The version in the tag matches the canonical version from the unit's
    metadata file.
4.  Tags are created only on `trunk`.
5.  Attempting to create a release tag from a non-trunk ref is rejected.
6.  No tag is created if detection did not signal a release.
7.  The existing `v*` tag namespace (used by the legacy Oracle release
    workflow) is migrated or coexists without conflict — the executor
    must ensure the transition does not break existing tag references.

### Acceptance criteria (observable outcomes)

-   Every created tag matches `<basename>_v<version>` format.
-   Tag basename equals the leaf directory name of the unit root.
-   Tag version equals the canonical version from the unit metadata.
-   Release from a non-trunk branch is rejected.
-   No spurious tags are created (detection-gated).
-   Legacy `v*` tags are not broken or orphaned by the transition.

### Edge cases addressed

-   **Unit rename**: if a unit's directory is renamed, the basename
    changes. The old `<old-basename>_v*` tags remain as historical
    artifacts. The renamed unit starts fresh with no matching tag,
    triggering first-release behavior from Phase 2.
-   **Basename collision attempt**: blocked in Phase 1. If somehow
    reached, tag creation would produce a duplicate tag prefix — this is
    a defense-in-depth concern that Phase 1 validation prevents.

### Phase completion criteria

-   All acceptance criteria pass in CI.
-   Commit boundary.

------------------------------------------------------------------------

## Phase 4 — Docker Image Tagging

### ADR traceability

ADR-006 (all invariants).

### Dependency

Phase 3 invariants are prerequisites. Tag creation must be operational
before image publishing is wired.

### Invariants established

After this phase the following hold and are enforced by automated
checks:

1.  Release units that produce Docker images publish two tags per image:
    -   `<version>` (matching canonical semver).
    -   `<git-sha>` (the commit SHA that the release tag points to).
2.  The git tag `<basename>_v<version>` remains the canonical release
    reference.
3.  Non-Docker-producing units are completely unaffected by this phase.
4.  Image version matches the canonical semver defined by the unit.

### Acceptance criteria (observable outcomes)

-   Docker-producing unit's image is pushed with `<version>` tag.
-   Docker-producing unit's image is pushed with `<git-sha>` tag.
-   Non-Docker unit release does not trigger any image operation.
-   Image `<version>` tag matches the canonical semver from unit
    metadata.
-   Git tag for the release matches `<basename>_v<version>`.

### Applicability

Based on current repository state, `nomos` is the only Docker-producing
unit. The executor must ensure the manifest (Phase 1) captures which
units produce Docker images, so this phase applies conditionally.

### Phase completion criteria

-   All acceptance criteria pass in CI.
-   Commit boundary.

------------------------------------------------------------------------

## Phase 5 — End-to-End Lifecycle Validation & Transition

### ADR traceability

ADR-000 (deterministic, idempotent releases; CI enforces invariants),
ADR-004 (idempotent detection).

### Dependency

All prior phases (1–4) must be complete.

### Invariants established

After this phase the following hold:

1.  At least one unit has completed the full release lifecycle:
    version bump → push to trunk → detection → tag creation →
    (Docker publish if applicable).
2.  Rerunning the release pipeline on the same repository state produces
    no new releases, no new tags, and no new image pushes (idempotent).
3.  Standard releases require no manual intervention.
4.  All ADR invariants (000–006) are enforceable via CI.
5.  The legacy `v*` tag-driven Oracle release workflow is either
    migrated to the new per-unit scheme or explicitly documented as a
    coexistence boundary with a clear migration path.

### Acceptance criteria (observable outcomes)

-   One unit completes the full lifecycle end-to-end with no manual
    steps.
-   Rerunning the pipeline immediately after a release is a no-op.
-   CI enforces every invariant from the traceability matrix.
-   The legacy release workflow does not conflict with the new tag
    namespace.

### Edge cases addressed (full-lifecycle validation)

-   **First release of a unit**: unit has no prior tag; detection uses
    initial commit as base; release is detected; tag is created; Docker
    image is published if applicable.
-   **Unit rename**: old tags remain; renamed unit enters first-release
    path.
-   **Basename collision attempt**: rejected at discovery/validation
    (Phase 1).
-   **Version change without path change**: per Phase 2 analysis, the
    metadata file is under the unit root, so a version-only bump does
    constitute a file change. Detection triggers. This is correct
    behavior — a version bump is the explicit release intent signal
    (ADR-001).
-   **Path change without version change**: no release detected. Safe
    against accidental releases.

### Phase completion criteria

-   All acceptance criteria pass.
-   All ADR invariants verified in CI.
-   Commit boundary.

------------------------------------------------------------------------

## Completion Definition

The implementation is complete when:

1.  All ADR invariants (000–006) are enforceable via automated CI
    checks.
2.  At least one unit has completed the full release lifecycle: version
    bump → push to trunk → detection → tag → (Docker publish if
    applicable).
3.  Rerunning the pipeline on the same state is idempotent (no-op).
4.  No manual intervention is required for standard releases.
5.  The legacy release workflow coexistence or migration is resolved.

------------------------------------------------------------------------

## Executor Freedom

This plan defines **what must hold**, not how it must be implemented.
The executor is free to choose:

-   CI vendor and workflow structure.
-   Scripting language for detection, generation, and validation.
-   Workflow file layout beyond ADR-mandated artifacts.
-   Command sequences and tooling.

The only constraints are the ADR invariants and the phase ordering
(later phases depend on invariants proven in earlier phases).
