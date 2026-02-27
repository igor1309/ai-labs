# ADR-003 --- Tagging Convention

## 1. Executive Summary

Tags uniquely identify unit releases and provide a collision-free
namespace for independently versioned units.

## 2. Context

Independent versioning requires deterministic tag resolution and a
globally unique namespace across all release units, including nested
unit paths.

## 3. Decision

Tag format: `<basename>_v<version>`.

`<basename>` is defined as the **leaf directory name of the unit root
path**. Example:

-   `apps/api` → basename `api`
-   `oracle/apps/am-i-done-web` → basename `am-i-done-web`

The separator between basename and version is `_v`.

## 4. Rules / Invariants

-   Tag MUST follow `<basename>_v<version>`.
-   `<basename>` MUST equal the leaf directory name of the unit root
    path.
-   Basenames MUST be globally unique across all release units.
-   Basenames MUST NOT contain underscores (`_`).
-   Tag lookup MUST use glob `<basename>_v*`.

## 5. Consequences

-   Deterministic tag resolution.
-   No namespace ambiguity.
-   Parsing ambiguity is eliminated by prohibiting underscores in
    basenames.

## 6. Non-Goals

-   Namespaced tag hierarchies.
-   Multi-separator parsing strategies.
