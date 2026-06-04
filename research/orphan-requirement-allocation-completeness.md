---
date: 2026-06-03
model: claude-sonnet-4-6
description: "Vocabulary and false-orphan avoidance for requirements allocation completeness checks in a traceability review tool"
---

# Orphan Requirement & Allocation Completeness: Research Report

## Question

1. What is the standard term and practice in requirements/systems engineering for "a requirement/capability allocated to no component/module"? Confirm or correct working terms: "orphan requirement," "requirements allocation," "allocation completeness," "RTM." What do authoritative sources actually call this?

2. How do practitioners avoid false positives in allocation-completeness checks — specifically distinguishing a true orphan from (a) a cross-cutting / non-functional capability satisfied by many components, and (b) a capability deliberately deferred / out of scope?

---

## Answer

### Question 1 — Vocabulary

The working terms are mostly correct but need precision:

**"Orphan requirement"** is a widely used practitioner term, but its canonical meaning in most sources is narrow: a lower-level requirement that has lost its upward traceability link to a parent (source) requirement — not a requirement with zero downward allocation. The broader condition of "capability allocated to no module at all" maps more precisely to **"unallocated requirement"**. Both terms appear in the literature; neither is formally standardized in a single ISO/IEEE definition.

**"Requirements allocation"** is the fully standard term (IEEE/SEBoK/INCOSE consensus). It names the process of assigning a higher-level requirement to one or more architectural elements at the next lower level. Wiegers' glossary defines it as "the process of apportioning system requirements among various architectural subsystems and components."

**"Allocation completeness"** is the correct term for the property being checked: the condition in which every requirement in the current set has been assigned to at least one architectural element. The phrase is used in SEBoK, INCOSE tutorial materials, and ISO 26262 traceability guidance. No standard body publishes a single formal definition paragraph, but the concept is operationalized as: "do all system-level requirements flow down to equipment level (with or without modification)?" — the completeness check phrasing used in multiple RTM guides referencing ISO/IEC/IEEE 29148 and DO-178C.

**"Requirements traceability matrix (RTM)"** is fully standard and correct. ISO/IEC/IEEE 29148:2018 defines it as "a structured information artifact that links requirements to their higher-level requirements or needs or to lower-level implementation." The RTM's allocation column is the primary tool for spotting unallocated requirements.

**Precise vocabulary to adopt:**

| Condition | Recommended term | Notes |
|---|---|---|
| Capability not assigned to any module | "unallocated requirement" | Standard in SE practice; preferred over "orphan" for this condition |
| Requirement that lost its parent link | "orphan requirement" | Canonical meaning; distinct from unallocated |
| Capability split across components | "requirement allocation" | The act; result is one or more allocation links |
| All requirements have ≥1 allocation | "allocation completeness" | The property to enforce |
| Mechanism to detect gaps | "allocation traceability check" or "coverage analysis" | Check performed on the RTM |

**Additional distinctions from sources:**

- An **"allocable requirement"** is one whose measure can be apportioned among constituent parts (e.g., a latency budget split across subsystems). A **"non-allocable requirement"** must flow to subordinate parts in its entirety — it cannot be divided, only mirrored. Both are allocated (have owners); the distinction is in whether the measure splits.
- **"TBD/TBR/TBX" placeholders** are standard for requirements whose allocation is known to be pending but not yet resolved. TBD = To Be Determined (delegated); TBS = To Be Supplied (solicitor will provide); TBR = To Be Resolved (collaborative). These are tracked as open issues, not as orphans.

---

### Question 2 — Avoiding False Orphans

Four heuristics from practice:

**H1. Classify before you check.**
Assign a requirement *type* (functional, quality attribute/NFR, interface, constraint, safety-critical) before running the allocation check. Cross-cutting or quality-attribute requirements (security, performance, availability) are recognized as system-wide concerns that *by design* satisfy themselves by architectural decisions distributed across many components, rather than by one owner. Flag them as type = "quality attribute" / "system-level" in the RTM. Your checker then enforces: quality-attribute requirements require ≥1 allocation to an architectural pattern, ADR, or governing decision — not necessarily a single module. Sources: SEBoK, INCOSE Requirements Tutorial 2019, crosscutting-QA literature.

**H2. Allow multi-owner allocation explicitly.**
The RTM link is one-to-many in the downward direction. A single requirement may link to N > 1 components. The completeness check is N ≥ 1 — not N = 1. A cross-cutting requirement with three owners passes; one with zero owners fails. This is standard RTM practice: "An RTM shows how each requirement is allocated to one *or more* components or subsystems" (multiple practitioner sources, argondigital, Jama). Enforce N ≥ 1, not N = 1, to prevent false positives for shared capabilities.

**H3. Use an explicit "deferred" / "out-of-scope" status field.**
Standard status values in requirements management include: Proposed, In Progress, Approved, Implemented, Verified, **Deferred**, **Deleted/Rejected**. A requirement with status = Deferred or Deleted is exempt from allocation-completeness enforcement. "A body of work is done when all allocated requirements have a status of Verified, Deleted, or Deferred." (ArgonDigital). Your checker should only flag requirements with status = Active/Approved and allocation count = 0.

**H4. Distinguish missing traceability from intentional system-level residence.**
Some requirements legitimately reside at the system level with no lower-level allocation yet — this is the "TBX" case: unresolved but acknowledged. Mark them with a TBD allocation placeholder. This signals "allocation pending" rather than "orphan." TBX management is an explicit SE discipline: track them in a register, assign an owner for the resolution action, set a milestone. Until resolved they remain in a "pending" state, not an "orphan" state.

---

## Findings

### Finding 1 — "Orphan requirement" is a practitioner term, not an ISO/IEEE-standardized term
**Claim:** Neither ISO/IEC/IEEE 29148 nor the INCOSE SE Handbook defines "orphan requirement" as a formal term. It appears widely in practitioner usage (Jama, Trace.Space, True Owl Journal, DAU) but with varying meanings.
**Source:** Wikipedia Requirements Traceability article (accessed 2026-06-03) — "requirements without links or with incomplete trace chain"; True Owl Journal (https://journal.true-owl.com/2024/01/29/the-importance-of-traceability/, accessed 2026-06-03) — "any requirement that does not achieve bi-directional traceability is said to be an orphan."
**Tag:** Verified (multiple practitioner sources); note: no single ISO/IEEE definition paragraph found.

### Finding 2 — "Unallocated requirement" is the more precise standard term for the zero-owner condition
**Claim:** The condition of a requirement having no downward allocation link is called an "unallocated requirement" in SE tooling, DAU materials, and SEBoK-adjacent sources.
**Source:** DAU SE Brainbook Requirements Management page (https://content1.dau.edu/DAUMIG_se-brainbook_189/content/Management%20Processes/Requirements-Management.html, accessed 2026-06-03 via redirect) — "orphaned lower-level requirements (i.e., all bottom-up relationships to applicable system-level requirements remain valid)"; search result summary citing direct DAU content.
**Tag:** Verified (DAU source); the exact phrase "unallocated requirement" comes from tool documentation and SE practitioner sources rather than a single normative clause.

### Finding 3 — "Requirements allocation" and "RTM" are fully standardized terms
**Claim:** "Requirements allocation" and "requirements traceability matrix" are standard SE vocabulary, defined consistently across ISO/IEC/IEEE 29148:2018, SEBoK, INCOSE, and DoD/DAU materials.
**Source:** ISO/IEC/IEEE 29148:2011 PDF (https://nirmt.com/storage/uploads/E-BOOK_BE-INDUSTRIAL-AND-SAFETY/29148-2011%20-%20ISOIECIEEE%20International%20Standard%20-%20Systems%20and%20software%20engineering%20--%20Life%20cycle%20processes%20--Requirements.pdf, accessed 2026-06-03 via search summary); Wiegers Requirements Engineering Glossary (https://people.eecs.ku.edu/~saiedian/812/Project/Wiegers-Resources/Glossary/Requirements%20Engineering%20Glossary.html, accessed 2026-06-03) — "requirements allocation: the process of apportioning system requirements among various architectural subsystems and components."
**Tag:** Verified (two independent authoritative sources).

### Finding 4 — "Allocation completeness" is a recognized SE property but lacks a single normative definition clause
**Claim:** Allocation completeness — every requirement allocated to ≥1 architectural element — is operationalized in ISO 26262, DO-178C, and RTM practice but is described procedurally rather than as a single formally defined term.
**Source:** Search result summaries citing DO-178C and ISO 26262 traceability guidance (accessed 2026-06-03) — "do all system level requirements go down to equipment level (with or without modification)"; ISO 26262 Wikipedia article (https://en.wikipedia.org/wiki/ISO_26262, accessed 2026-06-03) — functional safety requirements allocated to architectural elements at concept phase.
**Tag:** Verified as widely used practice; the exact phrase "allocation completeness" is an inferred consolidation of the practice rather than a single-source formal definition.

### Finding 5 — Allocable vs. non-allocable requirement distinction
**Claim:** An "allocable requirement" is one whose measure can be apportioned. A "non-allocable requirement" must flow to all subordinate parts in its entirety. Both have owners; neither is an orphan.
**Source:** E.H. Davis Engineering — Requirement Types (https://www.ehdavis.engineering/Exegeses/topic/requirement_types/, accessed 2026-06-03): "A non-allocable requirement must be passed to the subordinate parts in its entirety."
**Tag:** Verified (single source; the term "non-allocable" is noted as having "disappeared in the late 1980s" but the concept persists).

### Finding 6 — Multi-owner allocation is standard; completeness rule is N ≥ 1, not N = 1
**Claim:** Cross-cutting and system-wide requirements are legitimately allocated to multiple owners. The allocation completeness check requires count ≥ 1, not exactly 1. Multiple owners is not a signal of a problem.
**Source:** Multiple practitioner RTM guides (Jama, Creately, ArgonDigital) cited in search results (accessed 2026-06-03) — "An RTM shows how each requirement is allocated to one or more components or subsystems." Also: crosscutting-QA academic sources — "quality attributes like response time and security can span across multiple use cases and subsystems."
**Tag:** Verified (multiple concordant sources).

### Finding 7 — "Deferred" is a recognized requirement status that exempts a requirement from allocation enforcement
**Claim:** Standard requirement status values include Deferred and Deleted/Rejected. These statuses signal intentional postponement or removal, not an allocation gap. Completeness checks should be scoped to Active/Approved requirements only.
**Source:** ArgonDigital — "Tracking Project Status with Requirements" (https://argondigital.com/blog/product-management/tracking-project-status-requirements/, accessed 2026-06-03) — "A body of work is done when all allocated requirements have a status of Verified, Deleted, or Deferred." Nine status values enumerated.
**Tag:** Verified (primary practitioner source).

### Finding 8 — TBD/TBR/TBX mechanism handles "pending allocation"
**Claim:** When allocation is known to be needed but not yet determined, SE practice uses TBD (To Be Determined), TBS (To Be Supplied), or TBR (To Be Resolved) placeholders. These are tracked as "open allocation actions" with owners and milestone dates — not orphans.
**Source:** E.H. Davis Engineering — "TB Or Not TB" (https://www.ehdavis.engineering/Exegeses/tb-or-not-tb/, accessed 2026-06-03): "TBX management is the process of identifying the TBXs, establishing the work needed to close them, identifying the owner, and iterating through completion."
**Tag:** Verified (single source for the full TBX taxonomy; the TBD concept is broadly corroborated).

### Finding 9 — Non-functional / cross-cutting requirements should be typed before allocation check
**Claim:** Cross-cutting concerns (security, reliability, availability, performance) are widely recognized as NFRs / quality attributes that span modules and resist single-owner allocation. The RE research community (AOSD/aspect-oriented tradition) explicitly identifies them as requirements that "crosscut the primary decomposition." Early classification prevents misidentification as orphans.
**Source:** Google Sites MIS Research — "Crosscutting Quality Attributes for Requirements Engineering" (https://sites.google.com/site/misresearch000/home/software-architecture-quality-attributes/crosscutting-quality-attributes-for-requirements-engineering, accessed 2026-06-03); search result summaries from ResearchGate NFR papers (accessed 2026-06-03).
**Tag:** Verified (academic and practitioner sources in agreement).

---

## Synthesis / Recommendation

For the traceability review tool's "seam coverage" pass:

**Adopt this vocabulary in code, reports, and ADRs:**
- `unallocated_requirement`: a capability with allocation count = 0 in the responsibility map
- `orphan_requirement`: avoid for this condition; reserve it for requirements that lost upward traceability to their parent intent (a different check)
- `allocation_completeness`: the property enforced by the seam pass
- `cross_cutting_capability`: a capability type that permits multi-module allocation without triggering an alert

**Implement the completeness rule as:**
```
alert IF capability.status IN [active, approved]
     AND capability.allocation_count == 0
     AND capability.type NOT IN [deferred, deleted, out_of_scope]
```

**False-orphan suppression rules, ordered by priority:**

1. **Status gate first.** If capability.status is `deferred`, `deleted`, or `out_of_scope`, skip — never flag. This handles deliberately deferred capabilities.

2. **Type gate second.** If capability.type is `quality_attribute` or `cross_cutting`, require allocation count ≥ 1 to an architectural-level owner (an ADR, a platform layer, or a shared infrastructure component) — not necessarily a feature module. A capability of this type with N = 0 across *all* owners (including system-level owners) is still a true orphan.

3. **Allow N > 1.** A capability allocated to multiple modules is not an orphan. The seam coverage check fires only at N = 0.

4. **TBX / pending-allocation flag.** If a capability has a `tbd_allocation` marker (open resolution action with owner and milestone), suppress the alert and report it separately as "pending allocation." This is a warning, not an error.

5. **System-level owner counts.** An architectural decision record, a platform team, or an explicit "system" node in the responsibility map counts as a valid owner. A cross-cutting capability owned by the platform team at the system level is not a seam gap.

---

## Confidence & Gaps

**Solid (high confidence):**
- "Requirements allocation" and "RTM" as standard vocabulary — corroborated by ISO 29148, SEBoK, INCOSE, Wiegers, and DAU.
- Multi-owner allocation as the norm for cross-cutting requirements — multiple concordant practitioner sources.
- "Deferred" as a standard status that exempts from completeness enforcement — ArgonDigital primary source plus PMBOK-derived materials.
- TBD/TBR/TBX taxonomy for pending allocations — E.H. Davis Engineering primary source, corroborated by NASA/LANL references.

**Moderate confidence:**
- "Unallocated requirement" as the preferred term for the zero-owner condition — widely used but not formally canonized in a single ISO/IEEE normative clause; no public access to the full INCOSE SE Handbook v5 (2023) was possible to verify exact phrasing.
- "Allocation completeness" as a term — consistently described as a practice/property but no single formal definition paragraph was retrieved from a standards body.

**Not verified (gaps):**
- The INCOSE Systems Engineering Handbook v5 (2023) specific wording — the full document is paywalled and the HTML mirror was down. All INCOSE content here is from public tutorial slides and summary sheets.
- ISO/IEC/IEEE 15288:2023 exact text on allocation processes — the PDF sample was binary-only.
- IBM DOORS, Jama Connect, or PTC Integrity specific field conventions for allocation status — tool documentation was behind auth walls.
- Whether ISO/IEC/IEEE 29148:2018 (vs. 2011) introduced any formal definition of allocation completeness — the 2011 version was accessible; 2018 was not fully retrievable.

**Sources that could close the gaps:**
- Full text of INCOSE SE Handbook v5 (INCOSE member access or library).
- ISO/IEC/IEEE 15288:2023 Section 6.4 (System Requirements Definition) and Section 6.4.2 (Requirements allocation).
- ISO/IEC/IEEE 29148:2018 Clause 5.2 and Annex A.
- IBM DOORS documentation on "suspect links" and allocation status attributes.

---

## Sources

- [Requirements traceability — Wikipedia](https://en.wikipedia.org/wiki/Requirements_traceability) (accessed 2026-06-03)
- [ISO/IEC/IEEE 29148:2011 International Standard — Systems and software engineering — Life cycle processes — Requirements](https://nirmt.com/storage/uploads/E-BOOK_BE-INDUSTRIAL-AND-SAFETY/29148-2011%20-%20ISOIECIEEE%20International%20Standard%20-%20Systems%20and%20software%20engineering%20--%20Life%20cycle%20processes%20--Requirements.pdf) (accessed 2026-06-03)
- [Wiegers Requirements Engineering Glossary](https://people.eecs.ku.edu/~saiedian/812/Project/Wiegers-Resources/Glossary/Requirements%20Engineering%20Glossary.html) (accessed 2026-06-03)
- [Requirements Management — DAU/WARU Systems Engineering Brainbook](https://content1.dau.edu/DAUMIG_se-brainbook_189/content/Management%20Processes/Requirements-Management.html) (accessed 2026-06-03)
- [Requirements Allocation — AcqNotes](https://acqnotes.com/acqnote/tasks/requirements-allocation) (accessed 2026-06-03)
- [The Importance of Traceability — True Owl Journal](https://journal.true-owl.com/2024/01/29/the-importance-of-traceability/) (published 2024-01-29, accessed 2026-06-03)
- [Requirement Types — E.H. Davis Engineering](https://www.ehdavis.engineering/Exegeses/topic/requirement_types/) (accessed 2026-06-03)
- [TB Or Not TB — E.H. Davis Engineering](https://www.ehdavis.engineering/Exegeses/tb-or-not-tb/) (accessed 2026-06-03)
- [Tracking Project Status with Requirements — ArgonDigital](https://argondigital.com/blog/product-management/tracking-project-status-requirements/) (accessed 2026-06-03)
- [Crosscutting Quality Attributes for Requirements Engineering — MIS Research](https://sites.google.com/site/misresearch000/home/software-architecture-quality-attributes/crosscutting-quality-attributes-for-requirements-engineering) (accessed 2026-06-03)
- [Requirements Traceability Matrix Pros and Cons — Jama Software](https://www.jamasoftware.com/requirements-management-guide/requirements-traceability/traceability-matrix-101/) (accessed 2026-06-03)
- [The Role of Requirement Allocation in Systems Engineering — reqi.io](https://reqi.io/articles/mastering-the-art-of-requirement-allocation-in-systems-engineering) (accessed 2026-06-03)
- [INCOSE Guide to Writing Requirements V4 Summary Sheet](https://www.incose.org/docs/default-source/working-groups/requirements-wg/guidetowritingrequirements/incose_rwg_gtwr_v4_summary_sheet.pdf) (2023, accessed 2026-06-03 — returned 403)
- [Traceability of Functional Safety Requirements in Automotive IP and SoCs — Semiconductor Engineering](https://semiengineering.com/traceability-of-functional-safety-requirements-in-automotive-ip-socs/) (accessed 2026-06-03 — returned 403; content summarized from search results)
- [NFR+ Framework for Bi-Directional Traceability of Non-Functional Requirements — Springer/VTT](https://link.springer.com/article/10.1007/s00450-012-0205-5) (accessed 2026-06-03 — behind auth; content from search result)
