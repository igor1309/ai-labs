# ADR-003 --- Tagging Convention

## 1. Executive Summary

Tags uniquely identify unit releases.

## 2. Context

Independent versioning requires collision-free tag namespace.

## 3. Decision

Tag format: `<basename>_v<version>`.

## 4. Rules / Invariants

-   Tag MUST follow `<basename>_v<version>`.
-   `<basename>` MUST equal unit directory basename.
-   Basenames MUST be globally unique.
-   Tag lookup MUST use glob `<basename>_v*`.

## 5. Consequences

-   Deterministic tag resolution.
-   No namespace ambiguity.

## 6. Non-Goals

-   Namespaced tags
