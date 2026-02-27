# ADR-002 --- Canonical Version Metadata Policy

## 1. Executive Summary

Each unit has exactly one canonical version source. Semver is mandatory.

## 2. Context

Mixed ecosystems require a neutral version abstraction while preserving
native tooling compatibility.

## 3. Decision

Node units use `package.json`. Non-Node units use `release.toml`. Mixing
is prohibited.

## 4. Rules / Invariants

-   Node units MUST use `package.json` as canonical version source.
-   Non-Node units MUST use `release.toml`.
-   A unit MUST NOT contain both.
-   Version MUST follow semver.
-   Canonical version MUST change for a release to occur.

## 5. Consequences

-   Uniform release semantics.
-   Ecosystem neutrality preserved.

## 6. Non-Goals

-   Ecosystem-specific publishing rules
