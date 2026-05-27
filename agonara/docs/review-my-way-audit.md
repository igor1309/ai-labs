---
date: 2026-05-27
description: "My Way audit of agonara docs — fails and warns with suggested fixes."
---

# Agonara Docs — My Way Audit

Review of all documents on the `agonara` branch against the My Way
mandatory structures (phases 00–05, variants). Each finding is tagged
**FAIL** (must fix before the artifact can be treated as accepted) or
**WARN** (should fix, but not blocking).

---

## 1. `intent_learning_program_app_v0.1.0.md` — Product Intent

**My Way phase:** 00 — Product Intent

### FAILs

| # | Finding | Rule violated | Suggested fix |
|---|---------|---------------|---------------|
| F1 | Missing `date` in front matter. | FM requires `date`, `model`, `description`. | Add `date: 2026-05-26` (or actual creation date). |
| F2 | No `## Product outcome` section. The doc opens with `## Problem` — valuable context, but the framework requires a concise user-outcome statement. | Structure: `## Product outcome` mandatory. | Add a `## Product outcome` section (1–3 sentences) above or after Problem. Problem can stay as supporting context. |
| F3 | User stories are not in standard form. The `## User Needs` subsection uses narrative paragraphs ("Куратор хочет…", "Студент хочет…") rather than `As a <type>, I want <goal>, so that <outcome>`. | Stories must be "recognizable form" with As/want/so-that. | Rewrite each need as a proper user story, or (better) merge the separate curator and student story docs into this document and reference them from here. |
| F4 | Stories lack stable identifiers. | Each story needs a stable identifier. | Assign IDs (e.g., `INT-01`, `INT-02`, …). |
| F5 | Stories lack per-story acceptance signals. The `## Success` section provides aggregate criteria but nothing per story. | Each story needs an acceptance signal. | Add an `## Acceptance signals` section mapping each story ID to its signal, or add inline signals per story. |
| F6 | No `## Acceptance signals` section. | Structure: mandatory section. | Create it (see F5). |

### WARNs

| # | Finding | Suggested fix |
|---|---------|---------------|
| W1 | Section naming diverges from template: `Roles` vs `Actors`, `User Needs` vs `User stories`, `Intent` vs `Product outcome`. | Rename sections to match the mandatory structure names. |
| W2 | No `## Open product questions` section. | Add it — even if empty, make the absence of open questions explicit. |
| W3 | No `## Downstream traceability` section. | Add it once downstream artifacts exist. Acceptable to defer if no downstream artifacts yet, but the section header should be present with a note. |
| W4 | No `## Change review` section. | Add the section as a placeholder. |
| W5 | Document is in Russian, but curator and student stories are separate English-language docs. Language mixing is not a framework violation, but traceability between the intent doc and the story docs should be explicit. | Add cross-references or merge stories into this document. |

---

## 2. `agonara_curator_user_stories_v0.1.0.md` — Curator Stories

**My Way phase:** Part of 00 — Product Intent (user stories belong inside or are referenced from the Product Intent doc)

### FAILs

| # | Finding | Rule violated | Suggested fix |
|---|---------|---------------|---------------|
| F1 | Missing `date` in front matter. | FM requires `date`. | Add `date`. |
| F2 | Stories lack stable identifiers. | Product Intent structure requires each story to have a stable identifier. | Add IDs (e.g., `CUR-01`, `CUR-02`, …). |
| F3 | Stories lack acceptance signals. | Each story needs an acceptance signal. | Add acceptance criteria per story or in a summary table. |
| F4 | Stories lack status. | Each story should have a status (accepted/proposed/deferred). | Add status field per story or mark all as "accepted" if that is the intent. |

### WARNs

| # | Finding | Suggested fix |
|---|---------|---------------|
| W1 | Standalone stories doc with no explicit link from the Product Intent doc. | The intent doc should reference this doc in a `## User stories` section or in `## Downstream traceability`. |

---

## 3. `agonara_student_user_stories_v0.1.0.md` — Student Stories

**My Way phase:** Part of 00 — Product Intent

### FAILs

Same pattern as curator stories:

| # | Finding | Rule violated | Suggested fix |
|---|---------|---------------|---------------|
| F1 | Missing `date` in front matter. | FM requires `date`. | Add `date`. |
| F2 | Stories lack stable identifiers. | Stable identifier required. | Add IDs (e.g., `STU-01`, `STU-02`, …). |
| F3 | Stories lack acceptance signals. | Acceptance signal required per story. | Add acceptance criteria per story. |
| F4 | Stories lack status. | Status required. | Add status per story. |

### WARNs

| # | Finding | Suggested fix |
|---|---------|---------------|
| W1 | Standalone stories doc, no explicit link from Product Intent. | Same as curator stories — add cross-reference. |

---

## 4. `agonara_module_responsibility_map_v0.2.2.md` — Module Responsibility Map

**My Way phase:** This document makes architectural commitments (module boundaries, ownership rules, embedded behavior assignments) but does not follow any standard My Way artifact template. It is closest to one or more ADRs.

### FAILs

| # | Finding | Rule violated | Suggested fix |
|---|---------|---------------|---------------|
| F1 | Missing `date` in front matter. | FM requires `date`. | Add `date`. |
| F2 | Artifact type is ambiguous. The document makes firm boundary commitments (not exploratory), so it reads as a committed architectural decision — yet it is not an ADR, Pre-ADR, or Spec. | My Way requires each artifact to fit a recognized phase. | Either (a) restructure as one or more ADRs (e.g., "ADR: Agonara uses four bounded modules with single-owner responsibility"), or (b) treat it as a Pre-ADR if the module split is still provisional and add `## Options considered`, `## Emerging direction`, `## Open questions`. |
| F3 | No alternatives considered. The four-module split is presented as settled without showing what other decompositions were evaluated. | ADR requires rejected alternatives; Pre-ADR requires `## Options considered`. | Add rationale for why this decomposition was chosen over alternatives (monolith, different module cuts, etc.). |
| F4 | No `## Consequences` or `## Non-goals` (ADR criteria). | ADR mandatory sections. | Add both sections if treating as ADR. |
| F5 | No `## Context` section explaining what problem/tension drives the module split. | ADR/Pre-ADR require `## Context`. | Add context explaining why module boundaries matter at this stage. |

### WARNs

| # | Finding | Suggested fix |
|---|---------|---------------|
| W1 | The `## Purpose` disclaimer ("not a workflow map, dependency map…") is useful but no positive framing of where this artifact sits in the phase sequence. | Add a sentence placing it in the My Way progression (e.g., "This is the architectural decision behind module boundaries, to be formalized as ADR-NNN"). |
| W2 | Cross-cutting responsibilities (Logging, Observability, Backup/Restore, Product Analytics) are listed but have no ADR treatment — they may warrant their own ADR or at least explicit design-decision status. | Note which cross-cutting concerns are committed decisions vs. provisional. |
| W3 | No product intent traceability. The module split affects which user stories each module serves, but this is implicit. | Add a traceability note linking modules to the user stories they enable. |

---

## 5. `agonara_identity_role_management_first_slice_v0.1.1.md` — First Slice

**My Way phase:** The document itself says "module-design level." In My Way terms it is closest to a **Spec** (phase 04) — it defines capabilities, authorization principles, consistency rules, and slice boundaries for the first implementable module.

### FAILs

| # | Finding | Rule violated | Suggested fix |
|---|---------|---------------|---------------|
| F1 | No `## Public interface` section. The doc lists capabilities in a table but never defines function signatures, input/output shapes, or typed descriptions. | Spec requires `## Public interface`. | Add a public interface section — at minimum, list the operations with their inputs, outputs, and error cases. |
| F2 | No `## Tests (required)` section. | Spec requires enumerated test cases mapping to behavior rules. | Add test cases covering each capability and authorization rule. |
| F3 | No `## Done criteria` section. | Spec requires `## Done criteria`. | Add done criteria (e.g., "all capabilities implemented, authorization rules enforced, tests pass, backup/restore verified"). |
| F4 | Behavior rules are spread across `## Authorization Principles`, `## Consistency Rules`, and `## Identity Lifecycle` but are not numbered or grouped as testable rules. | Spec requires numbered/grouped `## Behavior rules`, each concrete and testable. | Consolidate into a `## Behavior rules` section with numbered rules. Authorization principles and consistency rules can become subsections within it. |

### WARNs

| # | Finding | Suggested fix |
|---|---------|---------------|
| W1 | Title uses "First Slice" rather than `Spec: Identity & Role Management (v0.1.1)`. | Rename to follow Spec title convention. |
| W2 | No `## Product intent traceability`. The slice operationalizes intent stories (admin control, identity management) but does not link to them explicitly. | Add a traceability table mapping capabilities to intent/story IDs. |
| W3 | No ADR traceability. The doc references the Responsibility Map and Deployment Decision but does not formally trace which ADR decisions it operationalizes. | Add ADR references. |
| W4 | The `## Design Decisions` section (Identity Source, Product Roles, Operational Role) arguably contains ADR-level commitments that should be recorded as ADRs rather than embedded in a spec. | Consider extracting into a dedicated ADR (e.g., "ADR: Agonara separates identity from credentials and roles"). |

---

## 6. `agonara-deployment-decision.md` — Deployment Decision

**My Way phase:** 03 — ADR

### FAILs

| # | Finding | Rule violated | Suggested fix |
|---|---------|---------------|---------------|
| F1 | Missing `description` in front matter. | FM requires `description`. | Add `description: "Agonara targets dockerized private self-hosted deployment."` |
| F2 | Missing ADR number in title. | ADR title must be `# ADR-NNN — Title`. | Assign a number (e.g., `# ADR-001 — Agonara Deployment Target`). |
| F3 | No `## Executive summary`. | ADR mandatory section. | Add a 2–3 line executive summary. |
| F4 | No `## Context` section. There is no explanation of what problem or constraints drove this decision. | ADR mandatory section. | Add context: why self-hosted? What alternatives were considered? What constraints shaped the choice? |
| F5 | No `## Rules / invariants`. No enforceable MUST/MUST NOT statements. | ADR mandatory section. | Add rules (e.g., "Agonara MUST run as a Docker container", "The backend MUST expose an API before any UI surface", etc.). |
| F6 | No `## Consequences`. | ADR mandatory section. | Add consequences: operational burden on admin, limits on scaling, dependency on Docker, etc. |
| F7 | No `## Non-goals`. | ADR mandatory section. | Add non-goals (e.g., "SaaS multi-tenant hosting is not a goal", "Mobile-native deployment is not a goal"). |
| F8 | No alternatives considered. The `## Rationale` section explains why the chosen option works but never names what it was chosen over. | ADR context should include rejected alternatives. | Add brief mention of alternatives (SaaS, desktop-local, serverless, etc.) and why rejected. |

### WARNs

| # | Finding | Suggested fix |
|---|---------|---------------|
| W1 | Very brief — the entire ADR is 2 sections. Even with all fixes above, consider whether this is better as part of a broader "ADR: Agonara System Shape" that also covers the API-first decision. | Consider merging related architectural decisions into one ADR if they are interdependent. |

---

## 7. `agonara-implementation-notes_v0.1.0.md` — Implementation Notes

**My Way phase:** Does not map to any recognized artifact type.

### FAILs

| # | Finding | Rule violated | Suggested fix |
|---|---------|---------------|---------------|
| F1 | Missing `date` in front matter. | FM requires `date`. | Add `date`. |
| F2 | Missing `description` in front matter. | FM requires `description`. | Add `description`. |
| F3 | Not a recognized My Way artifact. The content (pseudocode flow for identity/auth mapping) belongs either in a Spec (as part of `## Public interface` or `## Behavior rules`) or in an Implementation Plan (as a task description). | My Way requires each document to fit a phase. | Fold the content into the Identity & Role Management spec or remove and reference from an implementation plan. |

### WARNs

| # | Finding | Suggested fix |
|---|---------|---------------|
| W1 | Useful content but orphaned — not referenced by any other doc. | If kept, add a cross-reference from the first-slice doc. |

---

## 8. `brand/agonara_brand_brief_v0.1.0.md` and `brand/agonara_brand_brief_ru_v0.1.0.md`

**My Way phase:** Not a standard My Way artifact. Brand briefs are supporting material.

### FAILs

None — brand briefs are outside the My Way artifact sequence. The front matter is well-formed (`date`, `model`, `description`, `status: draft`).

### WARNs

| # | Finding | Suggested fix |
|---|---------|---------------|
| W1 | Not a My Way artifact, so no phase review applies. However, the naming availability assessment references "Naming Availability Standard" — confirm that prompt (`prompts/naming-availability-standard.md`) is the actual standard used. | Verify cross-reference accuracy. |
| W2 | The EN and RU versions should be kept in sync. Content appears aligned at v0.1.0, but there is no explicit versioning link between them. | Add a note in each that they are parallel translations of the same brief. |

---

## 9. `backlog.md`

### FAILs

None — this is a placeholder note, not a My Way artifact.

### WARNs

| # | Finding | Suggested fix |
|---|---------|---------------|
| W1 | Missing `description` in front matter. | Add `description: "Deferred design decisions — storage."` |
| W2 | Very minimal — may be better as a section in another doc than a standalone file. | Consider folding into the responsibility map or a future ADR's "Deferred Decisions" section. |

---

## 10. `template.md`

### WARNs

| # | Finding | Suggested fix |
|---|---------|---------------|
| W1 | Model field has typo: `got-5.5-thinking` instead of `gpt-5.5-thinking`. | Fix the typo. |

---

## Summary

### FAIL counts by document

| Document | FAILs |
|----------|------:|
| intent (product intent) | 6 |
| curator stories | 4 |
| student stories | 4 |
| module responsibility map | 5 |
| first slice (spec) | 4 |
| deployment decision (ADR) | 8 |
| implementation notes | 3 |
| **Total** | **34** |

### Top-priority structural fixes

1. **Deployment Decision** needs the most work — 8 FAILs, missing nearly every ADR section. Suggested: rewrite as a proper ADR with number, context, alternatives, rules, consequences, non-goals.

2. **Intent doc** needs standard story form, acceptance signals, and outcome section. Consider merging the curator/student story docs into or formally linking from the intent doc.

3. **Module Responsibility Map** needs to declare its artifact type. The content is strong but architecturally committed decisions need ADR treatment.

4. **First Slice** is the most developed doc but needs Spec sections (public interface, tests, done criteria) to be reviewable as a Spec.

5. **Front matter `date` field** is missing from 5 of 11 documents — quick universal fix.

### Recurring themes

- **Missing front matter fields** (especially `date`) — affects 5 docs.
- **Stories without identifiers, acceptance signals, or status** — affects all story-bearing docs.
- **Architectural commitments without ADR format** — affects responsibility map and deployment decision.
- **No test or done-criteria sections** — affects the first-slice spec.
- **Artifact type ambiguity** — the responsibility map and implementation notes don't fit any My Way phase.
