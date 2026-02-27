# ADR-004 --- Release Detection Algorithm

## 1. Executive Summary

Releases are detected via last-tag diff and version change gating.

## 2. Context

Idempotent release behavior requires stable comparison base.

## 3. Decision

Use last matching tag as base for diff. Release iff path changed and
version changed.

## 4. Rules / Invariants

-   Base commit MUST be last matching tag for unit.
-   Release MUST occur only if:
    -   Files under unit root changed since base.
    -   Canonical version changed since base.
-   Release detection MUST be idempotent.

## 5. Consequences

-   Safe reruns.
-   No accidental releases.

## 6. Non-Goals

-   Content-based change detection
