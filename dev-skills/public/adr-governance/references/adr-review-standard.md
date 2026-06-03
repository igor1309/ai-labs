# ADR Review Standard

## 1. Executive Summary

This document defines the standard for reviewing Architecture Decision
Records (ADRs) within this repository.

ADR review validates architectural decisions for clarity, necessity,
internal coherence, and long-term stability. The purpose is to protect
conceptual integrity of the system, not to audit implementation detail.

This standard applies to all ADRs regardless of domain.

------------------------------------------------------------------------

## 2. Review Objectives

ADR review exists to ensure that:

-   The decision is necessary and justified.
-   The scope of the decision is clearly bounded.
-   The decision is internally coherent.
-   The decision does not contradict existing ADRs.
-   The consequences and tradeoffs are explicitly acknowledged.

Review is architectural validation, not procedural enforcement.

------------------------------------------------------------------------

## 3. Review Dimensions

Each ADR MUST be evaluated across the following five dimensions.

### I. Intent Integrity

Reviewer MUST verify:

-   The Executive Summary accurately reflects the actual decision.
-   The decision addresses a real architectural tension.
-   The rationale is comprehensible to a senior engineer without
    additional context.

Red flags:

-   Executive summary and decision sections diverge.
-   Document describes implementation steps instead of architectural
    position.
-   Rationale is missing or superficial.

------------------------------------------------------------------------

### II. Boundary Clarity

Reviewer MUST verify:

-   Scope is explicitly defined.
-   Non-Goals prevent scope creep.
-   The ADR does not implicitly expand into adjacent domains.

Red flags:

-   Ambiguous language where precision is required.
-   Undefined assumptions.
-   Hidden policy introduced under decision text.

------------------------------------------------------------------------

### III. Cross-ADR Consistency

Reviewer MUST verify alignment with the existing ADR set, including:

-   Terminology consistency.
-   Assumption compatibility.
-   Absence of logical contradiction.

Red flags:

-   Reliance on guarantees not defined elsewhere.
-   Silent modification of previously accepted invariants.
-   Terminology drift.

------------------------------------------------------------------------

### IV. Decision Stability

Reviewer MUST evaluate:

-   What foreseeable evolution would invalidate the decision.
-   Whether such evolution would require amendment or new ADR.
-   Whether accepted tradeoffs are explicit.

Red flags:

-   Fragility under predictable growth scenarios.
-   Hidden dependency on temporary conditions.
-   Lack of stated consequences.

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
-   Version floor stated without confirming the asserted API exists at that
    version.

This dimension checks that the asserted mechanism *can exist* as described; it
does not require implementation detail (see §7).

------------------------------------------------------------------------

## 4. Required Review Summary Block

Every ADR review PR MUST include a structured review summary containing:

1.  Restatement of the decision:
    -   "I understand this ADR to decide that ..."
2.  Primary structural risk:
    -   "The main structural risk I see is ..."
3.  Cross-ADR consistency note (if applicable):
    -   "Potential inconsistency with ADR-XXX: ..."

If the reviewer cannot accurately restate the decision, the ADR is
considered insufficiently clear.

------------------------------------------------------------------------

## 5. Review Outcomes

Review may result in one of the following outcomes:

-   **Accepted** --- Decision is coherent and bounded.
-   **Accepted with clarifications** --- Minor wording or boundary
    refinements required.
-   **Rework required** --- Structural ambiguity or inconsistency
    present.
-   **Rejected** --- Decision lacks necessity or violates architectural
    integrity.

A decision MUST NOT be marked **Accepted** while any mechanism or invariant it
asserts lacks cited evidence of feasibility (Dimension V). Until such evidence
is provided, the outcome is **Rework required**.

Outcome MUST be explicitly stated in the PR discussion.

------------------------------------------------------------------------

## 6. Amendment Policy

If an accepted ADR requires modification:

-   The original ADR MUST NOT be silently edited to alter intent.
-   Amendments MUST be documented via:
    -   A new ADR referencing the original, or
    -   An explicit amendment section with revision history.
-   Review MUST re-apply this standard.

------------------------------------------------------------------------

## 7. Review Constraints

-   Review MUST remain within the scope of the ADR under evaluation.
-   Review MUST NOT introduce unrelated architectural domains.
-   Review MUST NOT demand implementation detail beyond architectural
    necessity.
-   Review SHOULD prioritize conceptual integrity over verbosity.

------------------------------------------------------------------------

## 8. Non-Goals

This document does not define:

-   Coding standards.
-   Security review procedures.
-   Deployment validation processes.
-   Repository-wide contribution policies.

This document governs ADR review only.
