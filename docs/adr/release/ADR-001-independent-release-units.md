# ADR-001 --- Independent Release Units & Trunk Policy

## 1. Executive Summary

Each release unit is versioned and released independently. Releases
occur only from `trunk`.

## 2. Context

Multiple products exist within a single repository. Coupled release
trains introduce unnecessary blocking and coordination risk.

## 3. Decision

Adopt independent versioning per unit. Adopt trunk-only release policy.

## 4. Rules / Invariants

-   Each release unit MUST have its own version.
-   Releases MUST trigger only on push to `trunk`.
-   Release branches MUST NOT be used.
-   A version bump MUST be the explicit signal of release intent.

## 5. Consequences

-   Parallel evolution is enabled.
-   No global version exists.
-   Release isolation is guaranteed.

## 6. Non-Goals

-   Global release train versioning
