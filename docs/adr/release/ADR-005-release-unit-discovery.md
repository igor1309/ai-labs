# ADR-005 --- Release Unit Discovery & Validation

## 1. Executive Summary

Release units are discovered via config-driven generator.

## 2. Context

Implicit auto-discovery creates drift and accidental releases.

## 3. Decision

Use `release-units.config.toml` as discovery boundary. Generate
committed `release-units.toml`.

## 4. Rules / Invariants

-   Discovery MUST be limited to configured prefixes.
-   Generator output MUST be committed.
-   CI MUST fail if manifest drifts.
-   Each unit MUST contain exactly one canonical metadata file.

## 5. Consequences

-   Controlled evolution.
-   Transparent unit registry.

## 6. Non-Goals

-   Fully dynamic discovery
