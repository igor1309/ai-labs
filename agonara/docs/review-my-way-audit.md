---
date: 2026-05-27
description: "My Way audit of agonara docs — fails and warns with suggested fixes."
---

# Agonara Docs — My Way Audit

Review of all documents on the `agonara` branch against the My Way
mandatory structures. The project is in early exploration — documents
are classified at the highest phase they credibly occupy (Product Intent
or Pre-ADR), not aspirationally upward.

Each finding is tagged **FAIL** (must fix before the artifact can be
treated as accepted at its phase) or **WARN** (should fix, not blocking).

---

## 1. `intent_learning_program_app_v0.1.0.md` — Product Intent

**My Way phase:** 00 — Product Intent

### FAILs

| # | Finding | Rule violated | Suggested fix |
|---|---------|---------------|---------------|
| F1 | Missing `date` in front matter. | FM requires `date`, `model`, `description`. | Add `date: 2026-05-26` (or actual creation date). |
| F2 | No `## Product outcome` section. The doc opens with `## Problem` — valuable context, but the framework requires a concise user-outcome statement. | Structure: `## Product outcome` mandatory. | Add a `## Product outcome` section (1–3 sentences) above or after Problem. Problem can stay as supporting context. |
| F3 | User stories are not in standard form. The `## User Needs` subsection uses narrative paragraphs ("Куратор хочет…", "Студент хочет…") rather than `As a <type>, I want <goal>, so that <outcome>`. | Stories must be in "recognizable form" with As/want/so-that. | Rewrite each need as a proper user story, or (better) point this section at the separate curator/student story docs which already use standard form. |
| F4 | Stories lack stable identifiers. | Each story needs a stable identifier. | Assign IDs (e.g., `INT-01`, `INT-02`, …). |
| F5 | Stories lack per-story acceptance signals. The `## Success` section provides aggregate criteria but nothing per story. | Each story needs an acceptance signal. | Add an `## Acceptance signals` section mapping each story ID to its signal, or add inline signals per story. |
| F6 | No `## Acceptance signals` section. | Structure: mandatory section. | Create it (see F5). |

### WARNs

| # | Finding | Suggested fix |
|---|---------|---------------|
| W1 | Section naming diverges from template: `Roles` vs `Actors`, `User Needs` vs `User stories`, `Intent` vs `Product outcome`. | Rename sections to match the mandatory structure names. |
| W2 | No `## Open product questions` section. | Add it — even if empty, make the absence of open questions explicit. |
| W3 | No `## Downstream traceability` section. | Acceptable to defer if no downstream artifacts yet, but the section header should be present with a note. |
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

**My Way phase:** 02 — Pre-ADR. The document explores module boundaries and ownership but the four-module split is not yet a committed ADR. Treating it as Pre-ADR is the honest classification.

### FAILs

| # | Finding | Rule violated | Suggested fix |
|---|---------|---------------|---------------|
| F1 | Missing `date` in front matter. | FM requires `date`. | Add `date`. |
| F2 | No `## Context` section. The `## Purpose` disclaimer says what the doc is not, but does not explain what problem or tension drives the module decomposition. | Pre-ADR requires `## Context`. | Add context: what product/design tension makes module boundaries matter at this stage? What constraints are known? |
| F3 | No `## Options considered`. The four-module split is presented as the only option. Pre-ADR requires at least two candidate directions with tradeoffs. | Pre-ADR requires `## Options considered` with ≥ 2 options. | Add at least one alternative decomposition (e.g., fewer modules, different module cuts, monolith-first) and explain tradeoffs. |
| F4 | No `## Emerging direction`. The doc presents the map as settled rather than provisional. | Pre-ADR requires `## Emerging direction` (explicitly provisional). | Add an emerging-direction section that names the four-module split as the current best candidate and says why, while marking it as provisional. |
| F5 | No `## Open questions`. | Pre-ADR requires `## Open questions` — items that must resolve before ADR. | Add open questions (e.g., "Is the Corpus Storage / Curator Workspace boundary in the right place?", "Should Assessment be its own module rather than embedded in Student Workspace?"). |

### WARNs

| # | Finding | Suggested fix |
|---|---------|---------------|
| W1 | The doc presents boundary commitments in a flat assertive tone that reads as settled architecture. If it is genuinely Pre-ADR, the language should signal provisionality — otherwise readers will treat the map as decided. | Mark unstable boundaries explicitly. Add a preamble noting this is exploratory and subject to change before ADR. |
| W2 | Cross-cutting responsibilities (Logging, Observability, Backup/Restore, Product Analytics) are listed without noting whether they are provisional or settled. | Mark each as provisional or note they need their own Pre-ADR/ADR treatment. |
| W3 | No product intent traceability. The module split affects which user stories each module serves, but this is implicit. | Add a sentence per module linking it to the stories it enables, or a traceability note referencing the Product Intent. |

---

## 5. `agonara_identity_role_management_first_slice_v0.1.1.md` — First Slice

**My Way phase:** 02 — Pre-ADR. The document calls itself "module-design level" and defines the first implementable slice, but the project has no accepted ADRs yet. The design decisions it contains (identity source, product roles, authorization model) are Pre-ADR-level explorations that need to pass through ADR before they can ground a spec.

### FAILs

| # | Finding | Rule violated | Suggested fix |
|---|---------|---------------|---------------|
| F1 | No `## Context` section. The doc jumps from Purpose to Slice Goal without stating the problem or tension being explored. | Pre-ADR requires `## Context`. | Add context: why is identity & role management the right first slice? What constraints drive this choice? |
| F2 | No `## Options considered`. Key design decisions (internal identity as ownership subject, program-scoped product roles, instance-scoped admin) are presented without alternatives. | Pre-ADR requires `## Options considered` with ≥ 2 options per decision space. | For each design decision, add at least one alternative (e.g., "credentials as identity", "flat role model", "no admin role — peer admin") with tradeoffs. |
| F3 | No `## Emerging direction` framed as provisional. The document reads as committed design, but without accepted ADRs upstream it is still exploratory. | Pre-ADR requires `## Emerging direction` (provisional). | Reframe current design as the emerging direction, explicitly marked as pre-commitment. |
| F4 | No `## Open questions`. The `## Deferred Decisions` section lists deferred items but does not frame them as questions that must resolve before ADR. | Pre-ADR requires `## Open questions`. | Transform `## Deferred Decisions` into (or supplement with) an `## Open questions` section where each item is framed as a concrete question that blocks ADR. |

### WARNs

| # | Finding | Suggested fix |
|---|---------|---------------|
| W1 | The document contains both Pre-ADR-level decisions (identity model, role model, authorization principles) and spec-level detail (capabilities table, lifecycle states, cross-cutting checks). This mixes phases. | Consider splitting: extract the architectural decisions into a focused Pre-ADR, and keep the capabilities/lifecycle/checks as working notes that will become a Spec after ADRs are accepted. |
| W2 | `## Design Decisions` contains three architectural commitments (Identity Source, Product Roles, Operational Role) that each warrant explicit Pre-ADR treatment with alternatives and tradeoffs. | Give each decision its own options-considered subsection, or split into separate Pre-ADR artifacts. |
| W3 | No product intent traceability. The slice operationalizes intent stories (admin control, identity management) but does not link to them. | Add references to the Product Intent stories this slice serves. |
| W4 | `## Consistency Rules` reads like ADR invariants but no ADR exists yet. | Mark these as candidate invariants for a future ADR, not as established rules. |

---

## 6. `agonara-deployment-decision.md` — Deployment Decision

**My Way phase:** 02 — Pre-ADR. Despite the title saying "Decision," the project has no ADR infrastructure. The document presents a direction without alternatives, context, or consequences — it is best treated as a Pre-ADR that captures an emerging direction.

### FAILs

| # | Finding | Rule violated | Suggested fix |
|---|---------|---------------|---------------|
| F1 | Missing `description` in front matter. | FM requires `description`. | Add `description: "Exploring deployment target for Agonara private instances."` |
| F2 | No `## Context` section. There is no explanation of what problem or constraints drove this direction. | Pre-ADR requires `## Context`. | Add context: why does deployment shape matter now? What constraints (team size, budget, operational skill, privacy) shape the decision space? |
| F3 | No `## Options considered`. The dockerized self-hosted direction is presented without naming what it was chosen over. | Pre-ADR requires `## Options considered` with ≥ 2 options. | Add at least one alternative (SaaS, desktop-local, serverless, managed PaaS) with tradeoffs, product-intent fit, and risks. |
| F4 | No `## Emerging direction` framed as provisional. The `## Decision` section reads as final, but there is no ADR infrastructure to make it a commitment. | Pre-ADR requires `## Emerging direction` (provisional). | Rename `## Decision` to `## Emerging direction` and add a note that this becomes a commitment only after ADR acceptance. |
| F5 | No `## Open questions`. | Pre-ADR requires `## Open questions`. | Add questions that must resolve before ADR (e.g., "Which container registry?", "What managed storage services are acceptable?", "Minimum viable ops requirements for admin?"). |

### WARNs

| # | Finding | Suggested fix |
|---|---------|---------------|
| W1 | No `## Provisional boundaries`. The deployment shape constrains the system (API-first, Docker, network web UI) but these are not framed as provisional boundaries. | Add a `## Provisional boundaries` section listing the boundary implications of this deployment direction. |
| W2 | Very brief — two sections total. Even for a Pre-ADR, more structure would help future reviewers. | Expand with context and options. |

---

## 7. `agonara-implementation-notes_v0.1.0.md` — Implementation Notes

**My Way phase:** 01 — Research (at best). The content is an informal sketch of how identity/auth mapping would work — this is exploratory problem-space thinking, not a committed design.

### FAILs

| # | Finding | Rule violated | Suggested fix |
|---|---------|---------------|---------------|
| F1 | Missing `date` in front matter. | FM requires `date`. | Add `date`. |
| F2 | Missing `description` in front matter. | FM requires `description`. | Add `description`. |
| F3 | No `## Purpose` section. Research requires a 1–3 sentence purpose explaining what question or tension is being explored. | Research requires `## Purpose`. | Add a purpose statement (e.g., "Exploring how external authentication maps to internal Agonara identity and roles"). |

### WARNs

| # | Finding | Suggested fix |
|---|---------|---------------|
| W1 | Not framed as Research. The content is useful exploration of the identity/auth boundary, but it reads as informal notes rather than a structured research artifact. | Reframe as Research with a purpose and (optionally) open questions, or fold the content into the first-slice Pre-ADR as supporting context. |
| W2 | No `## Open questions`. If this is research, the unresolved items should be explicit. | Add open questions (e.g., "Which auth frameworks fit the deployment target?", "How does credential rotation work?"). |
| W3 | Orphaned — not referenced by any other doc. | Add a cross-reference from the first-slice doc. |

---

## 8. `brand/agonara_brand_brief_v0.1.0.md` and `brand/agonara_brand_brief_ru_v0.1.0.md`

**My Way phase:** Not a standard My Way artifact. Brand briefs are supporting material.

### FAILs

None — brand briefs are outside the My Way artifact sequence. The front matter is well-formed (`date`, `model`, `description`, `status: draft`).

### WARNs

| # | Finding | Suggested fix |
|---|---------|---------------|
| W1 | The naming availability assessment references "Naming Availability Standard" — verify that `prompts/naming-availability-standard.md` is the actual standard used. | Confirm cross-reference accuracy. |
| W2 | The EN and RU versions should be kept in sync. Content appears aligned at v0.1.0, but there is no explicit versioning link between them. | Add a note in each that they are parallel translations of the same brief. |

---

## 9. `backlog.md`

### FAILs

None — this is a placeholder note, not a My Way artifact.

### WARNs

| # | Finding | Suggested fix |
|---|---------|---------------|
| W1 | Missing `description` in front matter. | Add `description: "Deferred design decisions — storage."` |
| W2 | Very minimal — may be better as an open question in the module-responsibility Pre-ADR than a standalone file. | Consider folding into the responsibility map's `## Open questions`. |

---

## 10. `template.md`

### WARNs

| # | Finding | Suggested fix |
|---|---------|---------------|
| W1 | Model field has typo: `got-5.5-thinking` instead of `gpt-5.5-thinking`. | Fix the typo. |

---

## Summary

### FAIL counts by document

| Document | Phase | FAILs |
|----------|-------|------:|
| intent doc | Product Intent | 6 |
| curator stories | Product Intent | 4 |
| student stories | Product Intent | 4 |
| module responsibility map | Pre-ADR | 5 |
| first slice | Pre-ADR | 4 |
| deployment decision | Pre-ADR | 5 |
| implementation notes | Research | 3 |
| **Total** | | **31** |

### Top-priority structural fixes

1. **Product Intent layer** (intent doc + both story docs, 14 FAILs combined): The intent doc needs `## Product outcome`, standard story form (or explicit references to the story docs), and `## Acceptance signals`. Both story docs need stable IDs, acceptance signals, and status per story. These are the foundation — everything downstream depends on settled intent.

2. **Pre-ADR layer** (deployment decision + module map + first slice, 14 FAILs combined): All three lack the core Pre-ADR structure: `## Context`, `## Options considered`, `## Emerging direction`, `## Open questions`. The content is substantive but reads as settled decisions rather than explored options. Adding alternatives and open questions would make the exploratory status honest and flag what must resolve before committing to ADRs.

3. **Front matter gaps** (`date` missing from 5 docs, `description` missing from 2): Quick universal fix across all docs.

### Recurring themes

- **Missing front matter fields** (especially `date`) — 5 docs.
- **Stories without identifiers, acceptance signals, or status** — all story-bearing docs.
- **Pre-ADR docs presented as settled decisions** — all three Pre-ADR-level docs lack alternatives, open questions, and provisional framing.
- **No context sections** — 3 of 3 Pre-ADR docs skip the problem/tension statement.
- **Phase mixing** — the first-slice doc mixes Pre-ADR decisions with spec-level detail; the implementation notes mix research with design sketches.
