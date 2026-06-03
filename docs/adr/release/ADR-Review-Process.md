# ADR Review Process --- Release Architecture

## 1. Executive Summary

This document defines how ADRs within the release architecture must be
reviewed.

The objective of review is to validate architectural intent, conceptual
integrity, boundary clarity, and cross-ADR consistency.

Review is not a mechanical validation of implementation detail. Intent
and coherence have higher value than low-level determinism.

This process applies only to ADRs within the release mechanics domain.

------------------------------------------------------------------------

## 2. Review Philosophy

ADR review validates:

-   The necessity of the decision.
-   The clarity of the decision boundary.
-   Internal logical coherence.
-   Consistency with the ADR forest.
-   Awareness of consequences and tradeoffs.

ADR review does NOT:

-   Rewrite implementation details.
-   Introduce adjacent policy domains.
-   Re-open previously settled architectural tradeoffs without explicit
    justification.
-   Demand over-specification where intent is sufficient.

------------------------------------------------------------------------

## 3. Review Dimensions

Each ADR MUST be evaluated across the following five dimensions.

### I. Intent Integrity

Reviewer MUST verify:

-   The Executive Summary reflects the actual decision.
-   The decision solves a real architectural tension.
-   The rationale is understandable by a senior engineer.

Red flags:

-   Summary and decision sections diverge.
-   Document reads like operational scripting instead of architecture.

------------------------------------------------------------------------

### II. Boundary Clarity

Reviewer MUST verify:

-   Scope is explicitly defined.
-   Non-Goals are sufficient to prevent drift.
-   No adjacent policy is implicitly introduced.

Red flags:

-   Ambiguous language ("may", "typically", "often") where precision is
    required.
-   Scope creep into unrelated domains (e.g., changelog enforcement).

------------------------------------------------------------------------

### III. Cross-ADR Consistency

Reviewer MUST verify alignment with related ADRs, including but not
limited to:

-   Tagging contract alignment with release detection logic.
-   Version policy alignment with release gating rules.
-   Discovery policy alignment with basename uniqueness invariant.

Red flags:

-   Terminology drift across documents.
-   Assumptions in one ADR not guaranteed by another.

------------------------------------------------------------------------

### IV. Decision Stability

Reviewer MUST evaluate:

-   What future change would invalidate this decision?
-   Whether such change would require amendment or new ADR.
-   Whether tradeoffs are explicitly accepted.

Red flags:

-   Hidden dependencies on unstated policies.
-   Decisions that collapse under minor foreseeable evolution.

------------------------------------------------------------------------

### V. Mechanism Feasibility

Reviewer MUST verify, for every mechanism or invariant the ADR asserts as a
guarantee:

-   A concrete command, doc, or code reference shows the mechanism is
    achievable on the target system as described.
-   Capability claims about a platform or tool (e.g., "native X supports Y")
    are backed by a cited source, not assumed.
-   Where the capability is version-dependent, the cited evidence is dated or
    version-pinned, and the asserted API is confirmed to exist at that version.

Red flags:

-   A capability claim with no command/doc/code showing it holds on the target
    system.
-   Mechanism described in aspirational terms the target system has not been
    shown to support.

This dimension checks that the asserted mechanism *can exist* as described; it
does not require implementation detail (see §5).

------------------------------------------------------------------------

## 4. Required Review Summary Block

Every ADR review PR MUST include a structured review summary containing:

1.  Restatement of the decision:
    -   "I understand this ADR to decide that ..."
2.  Primary risk or concern:
    -   "The main structural risk I see is ..."
3.  Optional consistency observation:
    -   "Potential cross-ADR inconsistency: ..."

If the reviewer cannot restate the decision accurately, the ADR is
considered unclear.

------------------------------------------------------------------------

## 5. Review Constraints

-   Review MUST remain within the defined scope of release mechanics.
-   Review MUST NOT introduce unrelated architectural domains.
-   Review MUST NOT require implementation-level instructions beyond
    architectural necessity.
-   Review SHOULD prioritize conceptual integrity over verbosity.

------------------------------------------------------------------------

## 6. Non-Goals

This process does not define:

-   General repository review guidelines.
-   Coding standards.
-   Security review practices.
-   Deployment validation procedures.

This document applies strictly to ADR review within the release
architecture domain.
