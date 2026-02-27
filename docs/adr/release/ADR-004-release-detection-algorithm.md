# ADR-004 --- Release Detection Algorithm

## 1. Executive Summary

Releases are detected via last-tag diff and version change gating.

## 2. Context

Idempotent release behavior requires a stable comparison base and
explicit release intent gating.

## 3. Decision

Use the last matching tag for the unit as the base for comparison.
Release occurs if and only if both path changes and version changes are
present.

For first-ever releases where no matching tag exists, the comparison
base is defined as the initial commit of the repository.

## 4. Rules / Invariants

-   Base commit MUST be the last matching tag for the unit.
-   If no matching tag exists, base MUST be the initial repository
    commit.
-   Release MUST occur only if:
    -   Files under the unit root changed since base.
    -   Canonical version changed since base.
-   Release detection MUST be idempotent.

## 5. Consequences

-   Safe reruns.
-   No accidental releases.
-   First release behavior is deterministic and explicitly defined.

## 6. Non-Goals

-   Content-based change detection.
-   Implicit release inference without version change.
