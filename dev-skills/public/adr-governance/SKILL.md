---
name: adr-governance
author: Igor Malyarov
version: "1.1.0"
description: ADR structure, review standards, and implementation plan requirements
trigger: when creating, reviewing, or implementing Architecture Decision Records
---

# ADR Governance

Architecture Decision Records (ADRs) live in `docs/adr/` organized by domain (e.g., `docs/adr/release/`, `docs/adr/governance/`).

- ADR structure follows the template in `references/adr-structure-template.md` (6-section progressive disclosure: Executive Summary, Context, Decision, Rules/Invariants, Consequences, Non-Goals).
- ADR review follows the standard in `references/adr-review-standard.md` (5 dimensions: Intent Integrity, Boundary Clarity, Cross-ADR Consistency, Decision Stability, Mechanism Feasibility).
- Implementation plans derived from ADRs must include an ADR Traceability Matrix mapping each invariant to its implementation phase.
- Planner requirements for ADR-based plans are defined in `references/implementation-plan-planner-requirements.md`.
