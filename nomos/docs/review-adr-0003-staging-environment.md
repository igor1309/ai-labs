---
date: 2026-02-28
model: got-5.2
review_type: structural + architectural
scope: ADR-0003
verdict: solid direction, but contains normative overreach and some isolation ambiguities
---

# Review: ADR-0003 – Staging Environment

## Executive Summary

ADR-0003 correctly identifies the core problem: stub endpoints are not a staging environment and cannot serve as a production gate.

The direction (dedicated staging + real vendor integration + promotion gate) is architecturally sound.

However, the document currently:

- Mixes **policy requirements** with **cost/topology preferences**
- Overreaches in a few normative statements
- Leaves some isolation guarantees underspecified
- Introduces minor operational coupling risks

No fundamental architectural flaw detected.

---

# 1. Structural Review

## 1.1 Scope Clarity

✔ Clear problem statement  
✔ Clear decision intent  
✔ Clear relation to ADR-0001 and ADR-0002  

⚠ Minor issue:
The ADR occasionally shifts from “introduce staging” to “how exactly to host it”. Those are related but distinct concerns.

Recommendation:
Keep:
- **Isolation invariants**
- **Promotion gate**
Separate from:
- VPS topology examples

---

## 1.2 Normative Language Discipline

The ADR sometimes encodes *preferences* as MUST-level requirements.

Examples:

- Preference for separate VPS framed as strong recommendation.
- Some operational patterns described in a way that implies they are mandatory design decisions rather than implementation options.

Guideline:
- Use MUST only for safety/isolation invariants.
- Use MAY/RECOMMENDED for cost/topology patterns.

---

# 2. Architectural Review

## 2.1 Core Decision: Dedicated Staging

✔ Correct.
✔ Necessary for:
- Real vendor streaming validation
- Safeguard validation
- Budget enforcement testing
- Release gate

No objection.

---

## 2.2 Artifact Immutability

✔ Correct requirement:
Same image digest promoted from staging to production.

This is critical and properly identified.

No change required.

---

## 2.3 Isolation Model

This is the most important architectural area.

### What is correct:

- Separate secrets
- Separate persistence
- Separate env files
- Separate Compose project

### What is underspecified:

The ADR says staging must not reach production persistence.

It does not explicitly state:

- Network-level isolation mechanism
- Explicit prohibition of shared credentials
- Clear rule about cross-environment DNS resolution

If staging and production share a VPS (allowed scenario):

Risks:
- Accidental volume mount reuse
- Secret file path collision
- Misconfigured Caddy routing
- Port binding mistakes
- Shared SQLite file path by typo

The ADR should clarify isolation invariants without prescribing infrastructure cost.

Required invariants (conceptually correct, even if not yet explicit enough):

- No shared volume names
- No shared env file
- No shared vendor keys
- No shared database file path
- No shared container names

These are architectural safety requirements, not cost decisions.

---

## 2.4 Vendor Integration Policy

Strong section.

✔ Correct:
- Staging must use sandbox vendor credentials
- Must not reuse production API keys
- Must use separate budgets

This is a hard requirement and correctly positioned as such.

No issue here.

---

## 2.5 Stub Policy

Correctly limited to:
- Local development
- e2e environments

Not used in staging or prod.

This is coherent with the overall safety model.

---

## 2.6 Release Pipeline

Sequential staging → prod is correct.

Strong elements:

- Blocking staging gate
- Real vendor call in staging
- Streaming validation
- Safeguard validation

Architecturally sound.

Potential improvement (not required, just observation):

The ADR does not specify timeout thresholds or error budget expectations. That is acceptable for this level; implementation detail.

---

## 2.7 Same-VPS Scenario

Architecturally allowed.

The risk is not budget-based. The risk is:

- Resource contention (CPU/RAM spike)
- Disk IO contention
- Accidental misconfiguration
- Blast radius overlap

The ADR should:
- Allow same-VPS deployment
- Document risks clearly
- Not express preference as doctrine

Current tone slightly leans toward preference framing.

That is stylistic, not architectural failure.

---

# 3. Risk Surface Analysis

| Risk | Severity | Covered? |
|------|----------|----------|
| Staging uses prod vendor keys | Critical | Covered |
| Staging writes to prod DB | Critical | Covered in principle |
| Artifact drift between staging/prod | Critical | Covered |
| Shared VPS resource starvation | Medium | Mentioned |
| Secret reuse | High | Covered |
| Cross-env DNS misroute | Medium | Implicit only |

No catastrophic design flaw detected.

---

# 4. What Is Strong

- Clear motivation
- Correct separation of stub vs staging
- Correct immutability model
- Proper gate sequencing
- Vendor sandbox requirement
- Digest-based deployment

---

# 5. What Is Weak

1. Slight normative overreach into cost/topology preference.
2. Isolation invariants could be expressed more as architecture contracts and less as hosting advice.
3. Some operational implementation details mixed into decision-level ADR.

None of these invalidate the design.

---

# 6. Final Verdict

Architecturally correct direction.

Isolation model is conceptually sound.
Promotion gate is correctly designed.
Vendor separation is properly enforced.

Main adjustment needed is tone discipline:
- Separate architectural invariants from hosting preference.
- Avoid encoding cost decisions as design principles.

No rewrite required for correctness.
Only refinement for clarity and normative precision.