# Requirements for Implementation Plan Creation

## 1. Purpose

This document defines mandatory requirements for a planner tasked with
creating an implementation plan for any initiative governed by an
approved ADR set.

It governs how the plan must be structured, not how implementation must
be executed.

This specification is normative and binding for the planner.

------------------------------------------------------------------------

## 2. Core Obligation

The planner MUST produce an implementation plan that:

-   Preserves all governing ADR invariants without reinterpretation.
-   Is phase-based and sequential.
-   Is invariant-driven, not step-driven.
-   Defines observable acceptance criteria.
-   Enables intelligent execution without micromanagement.

------------------------------------------------------------------------

## 3. ADR Traceability

The implementation plan MUST:

-   Explicitly identify the governing ADR set in scope.
-   Map each planned capability to a specific ADR requirement.
-   Introduce no functionality outside ADR scope.
-   Avoid implicit architectural changes.

If a capability cannot be traced to an ADR, it MUST NOT appear in the
plan.

------------------------------------------------------------------------

## 4. Phase Structure Requirements

The plan MUST be structured into discrete, ordered phases such that:

-   Each phase leaves the repository in a valid, CI-passing state.
-   Each phase concludes with a commit boundary.
-   Later phases depend only on invariants established and verified
    earlier.
-   No irreversible action (e.g., tagging, publishing, migration,
    provisioning) is enabled before validation and detection logic are
    proven correct.

The planner MUST explicitly define phase completion criteria.

------------------------------------------------------------------------

## 5. Acceptance Criteria Discipline

For each phase, the planner MUST define:

-   Observable system behaviors.
-   Invariants enforced by automated checks.
-   Failure conditions that manifest deterministically in CI.

Acceptance criteria MUST describe outcomes, not implementation steps.

Example (acceptable): - "CI fails when invariant X is violated."

Example (not acceptable): - "Write a script to check invariant X."

------------------------------------------------------------------------

## 6. Automated Verification Requirement

The plan MUST require that:

-   Each phase introduces or extends automated verification.
-   Phase completion depends on passing automated checks.
-   Manual validation alone is insufficient.

------------------------------------------------------------------------

## 7. Sequential Commit Discipline

The planner MUST require:

-   A commit after each completed phase.
-   CI passing before advancing to the next phase.
-   No bundling of multiple logical phases into a single commit.

This requirement is mandatory to preserve structural integrity during
evolution.

------------------------------------------------------------------------

## 8. Edge Case Coverage

The plan MUST explicitly address system behavior for foreseeable edge
cases relevant to the governed ADR set.

The plan MUST define expected behavior, not implementation mechanics.

------------------------------------------------------------------------

## 9. Scope Guardrails

The planner MUST explicitly exclude from the implementation plan:

-   Policy domains not defined by the governing ADR set.
-   Adjacent architectural expansions.
-   Unapproved feature introductions.

------------------------------------------------------------------------

## 10. Completion Definition

The plan MUST define observable completion criteria, including:

-   All governing ADR invariants enforceable via CI.
-   At least one representative end-to-end lifecycle validated (if
    applicable).
-   Idempotent rerun behavior where relevant.
-   No manual intervention required for standard operation (unless
    ADR-defined).

------------------------------------------------------------------------

## 11. Executor Freedom Boundary

The planner MUST NOT prescribe:

-   CI vendor or structure.
-   Scripting language.
-   Workflow layout beyond ADR-mandated artifacts.
-   Procedural command sequences.

The plan MUST define *what* must hold, not *how* it must be implemented.

------------------------------------------------------------------------

This document governs the quality and structure of implementation plans.
It does not govern execution details or specific architectural domains.
