# ADR-000 --- Release Architecture Overview

## 1. Executive Summary

This document defines the release architecture for the monorepo.
Releases are independent per unit, trunk-only, semver-based, and
tag-driven. Canonical version metadata is enforced per unit type. All
release behavior is deterministic and CI-validated.

This ADR defines the system-level model and references child ADRs for
details.

## 2. Context

The repository contains multiple independently releasable units (apps,
packages, infra). Release mechanics must be deterministic,
automation-friendly, and resistant to accidental drift. The system must
avoid implicit coupling between units.

## 3. Decision

The repository uses independent release units. Releases are triggered
only on push to `trunk`. Each unit owns its version and release
lifecycle. Release detection is tag-based and version-gated.

## 4. Rules / Invariants

-   Releases MUST occur only on push to `trunk`.
-   Each release unit MUST have a canonical version source.
-   Versioning MUST follow semver.
-   Tags MUST follow the defined tag contract (see ADR-003).
-   Basenames MUST be globally unique across units.
-   Release detection MUST use last matching tag as base (see ADR-004).
-   Discovery MUST follow configured scope rules (see ADR-005).

## 5. Consequences

-   Units evolve independently.
-   No release branches are supported.
-   CI enforces invariants strictly.
-   Deterministic, idempotent releases.

## 6. Non-Goals

-   Changelog enforcement
-   Commit conventions
-   Signing / SBOM policy
-   Deployment strategy
