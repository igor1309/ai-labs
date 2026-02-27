# ADR-006 --- Docker Image Tagging Policy

## 1. Executive Summary

Docker images use semver and SHA tags.

## 2. Context

Rollback and traceability require immutable references.

## 3. Decision

Publish two tags per image: - `<version>` - `<git-sha>`

## 4. Rules / Invariants

-   Image version MUST match canonical semver.
-   Git tag MUST correspond to `<basename>_v<version>`.
-   Image MUST be pushed with SHA tag.
-   Image MUST be pushed with version tag.

## 5. Consequences

-   Safe rollback.
-   Human-readable releases.

## 6. Non-Goals

-   Multi-arch build policy
