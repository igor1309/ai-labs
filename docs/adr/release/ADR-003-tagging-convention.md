---
date: 2026-04-24
model: gpt-5
description: "Release tag naming convention and explicit configured basename amendment"
---

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

## Amendment: Explicit Configured Basenames

For release units discovered through `release-units.config.toml`,
`<basename>` is the explicit basename recorded in `release-units.toml`.

The basename MAY differ from the unit root leaf directory when needed to
keep nested release units globally unambiguous.

The basename MUST differ from the unit root leaf directory when a nested
unit's leaf name would be ambiguous in repo-wide release history, such
as `notio/backend` and `notio/frontend`.

This amendment supersedes the leaf-directory basename rule for units
with an explicit configured basename.

Rules:

-   A configured release unit MUST have exactly one basename.
-   The basename MUST be globally unique.
-   The basename MUST NOT contain underscores (`_`).
-   Tags MUST use the configured basename: `<basename>_v<version>`.
-   Tag lookup MUST use the configured basename, not the filesystem leaf
    directory.

## 4. Rules / Invariants

-   Tag MUST follow `<basename>_v<version>`.
-   For units without an explicit configured basename, `<basename>` MUST
    equal the leaf directory name of the unit root path.
-   For units with an explicit configured basename, the configured
    basename is authoritative.
-   Basenames MUST be globally unique across all release units.
-   A basename previously used by a removed or renamed unit SHOULD NOT
    be reused by a new unit. (Not currently enforced; enforceable
    tracking deferred until multiple release units exist.)
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
