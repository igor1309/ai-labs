# ADR-006 --- Docker Image Tagging Policy

## 1. Executive Summary

Docker-producing release units publish two tags per image: semver and
git SHA, ensuring traceability and safe rollback.

## 2. Context

Rollback and traceability require immutable references. This policy
applies only to release units that produce Docker images.

## 3. Decision

For each Docker-producing release unit, publish two tags per image:

-   `<version>`
-   `<git-sha>`

The git tag `<basename>_v<version>` remains the canonical release
reference.

## 4. Rules / Invariants

-   This policy MUST apply only to release units that produce Docker
    images.
-   Image version MUST match canonical semver defined by the unit.
-   Git tag MUST correspond to `<basename>_v<version>`.
-   Image MUST be pushed with SHA tag.
-   Image MUST be pushed with version tag.

## 5. Consequences

-   Safe rollback.
-   Human-readable release references.
-   Applicability is explicitly scoped to Docker-producing units.

## 6. Non-Goals

-   Multi-arch build policy.
-   Container registry selection policy.
