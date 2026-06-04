---
date: 2026-06-03
model: claude-opus-4-8
description: "Upward orphan check for Agonara Corpus/Curator — every ADR-010 and ADR-009 decision checked for an upstream intent parent"
skill: traceability-review
skill_version: "0.9.0"
scope: "upward orphan check — agonara (ADR → intent), Corpus Storage + Curator Workspace"
mechanism: upward-trace-matrix
suppression_rules: [derived-decision, carried-shape, cross-cutting-system-parent, multi-parent]
inputs:
  adrs:
    - adr-010-corpus-storage-and-curator-acceptance-boundary.md (accepted)
    - adr-009-program-shell-and-initial-curator-participation.md (accepted)
  intents:
    - intent_learning_program_app.md (0.3.0)
    - curator_user_stories.md (0.3.0)
    - student_user_stories.md (0.3.1)
    - admin_user_stories.md (0.2.1)
  map:
    - module_responsibility_map.md (0.4.3)
---

# Upward Orphan Check — Agonara (Corpus Storage + Curator Workspace)

## Summary

Decision rows: 63 (32 from ADR-010, 31 from ADR-009).

- ADR-010: 9 Decision sentences (lines 46–62) + 23 Rules/Invariants bullets (lines 66–88) = 32 rows.
- ADR-009: 9 Decision sentences (lines 40–56) + 22 Rules/Invariants bullets (lines 60–81) = 31 rows.

Verdict breakdown:

- traced: 24
- derived: 35
- carried-shape: 4
- ORPHAN: 0

Finding total: 0 ORPHAN rows.

Verdict: Every decision, rule, and invariant in ADR-010 and ADR-009 traces back to an accepted intent capability (chiefly INT-01, CUR-01..CUR-13, STU-11..STU-17, ADM-08..ADM-15) or is a legitimate technical/architectural derivation of one of those traced decisions — no unrequested user-observable scope was found.

## Upward trace matrix

### ADR-010 — Decision (lines 46–62)

| ADR decision | adr file:line | Upstream intent (or derivation parent) | Verdict |
|---|---|---|---|
| Model accepted Program corpus as a Corpus Storage responsibility separate from Curator Workspace | adr-010:46 | INT-01 intent_learning_program_app.md:114 ("keep draft suggestions separate, accept only reviewed content"); CUR-06 curator_user_stories.md:63 (keep accepted separate from drafts) | traced |
| Corpus Storage owns accepted corpus records (topics, concepts, definitions, principles, material refs, source metadata, accepted assessment items, accepted criteria) | adr-010:48 | INT-02 intent:55, CUR-02 curator_user_stories.md:31, CUR-03:39, CUR-04:47, CUR-05:55, CUR-07:73 | traced |
| Preserve stable identifiers and stable accepted revisions for changes affecting student navigation/assessment/feedback/progress | adr-010:50 | CUR-10 curator_user_stories.md:97 ("evolve without rewriting the student's personal state"); INT-07 intent:120 (evidence behind state) | traced |
| Curator Workspace owns research intake, candidate topics/concepts/materials/checks, draft criteria, LLM suggestions, gap analysis, review state before acceptance | adr-010:52 | CUR-07 curator_user_stories.md:73, CUR-08:81, CUR-09:89, CUR-11:107, CUR-13:123 | traced |
| Candidate/draft/LLM material MUST NOT be visible as accepted corpus until explicit acceptance by effective Program Curator | adr-010:54 | INT-01 intent:154 (LLM suggestions not content until accepted); CUR-12 curator_user_stories.md:115; CUR-06:63 | traced |
| Acceptance is the boundary crossing; decision MUST be attributable to Identity, scoped to Program, authorized through effective Program Curator, connected to candidate/source/rationale | adr-010:56 | CUR-12 curator_user_stories.md:115 (explicit curator action); derivation parent adr-010:54 (acceptance boundary) | traced |
| Student Workspace reads accepted corpus and records student-specific state separately | adr-010:58 | INT-07 intent:120 ("without mutating the shared program corpus"); STU-15 student_user_stories.md:144, STU-16:152, STU-17:160 | traced |
| Student Workspace MUST NOT mutate accepted corpus, own revisions, or turn personal state into accepted content | adr-010:60 | INT-07 intent:120; student_user_stories.md:226 (corpus/state separation boundary) | traced |
| Admin authority remains operational recovery; MUST NOT accept corpus or replace curator responsibility | adr-010:62 | admin_user_stories.md:187 (Admin does not replace curator ownership); intent:43 (admin not a learning role) | traced |

### ADR-010 — Rules / Invariants (lines 66–88)

| ADR decision | adr file:line | Upstream intent (or derivation parent) | Verdict |
|---|---|---|---|
| Corpus Storage owns accepted Program corpus | adr-010:66 | INT-01 intent:114; module_responsibility_map.md:68 | traced |
| Curator Workspace owns candidate/draft curation state before acceptance | adr-010:67 | CUR-06 curator_user_stories.md:63; CUR-08:81 | traced |
| Student Workspace owns learner state; MUST NOT own accepted corpus | adr-010:68 | INT-07 intent:120; student_user_stories.md:226 | traced |
| Program Membership owns Program Curator participation / effective checks used to authorize acceptance | adr-010:69 | derivation parent adr-010:56 (acceptance authorized through curator participation); CUR-12 curator_user_stories.md:115 | derived |
| Identity & Role Management owns identities/credentials/Admin; MUST NOT own corpus or acceptance decisions | adr-010:70 | admin_user_stories.md:187; derivation parent adr-010:62 | derived |
| Accepted corpus MUST be scoped to a stable Program shell | adr-010:71 | derivation parent adr-009:40 (Program shell exists) serving INT-01 intent:114 | derived |
| Candidate material MUST be scoped to the Program it may affect before acceptance | adr-010:72 | derivation parent adr-010:54 (acceptance boundary); CUR-08 curator_user_stories.md:81 | derived |
| LLM output MUST remain candidate material until accepted by effective Program Curator | adr-010:73 | INT-01 intent:154; CUR-12 curator_user_stories.md:115 | traced |
| External source extraction MUST create candidate material/source metadata before accepted corpus | adr-010:74 | CUR-08 curator_user_stories.md:81 (extracted candidates remain drafts until accepted); CUR-07:73 | traced |
| Accepted topics/concepts/definitions/principles/material refs/source metadata/assessment items/criteria MUST live in Corpus Storage | adr-010:75 | CUR-02 curator_user_stories.md:31, CUR-04:47, CUR-05:55; INT-02 intent:55 | traced |
| Research notes/extracted candidates/drafts/LLM suggestions/proposed criteria/gaps/review state MUST live outside accepted corpus until acceptance | adr-010:76 | CUR-06 curator_user_stories.md:63; CUR-09:89; CUR-12:115 | traced |
| Acceptance MUST be an explicit action | adr-010:77 | CUR-12 curator_user_stories.md:121 (acceptance is explicit curator action); INT-01 intent:114 | traced |
| Acceptance MUST be authorized through effective Program Curator participation | adr-010:78 | derivation parent adr-010:56; CUR-01 curator_user_stories.md:23 | derived |
| Acceptance MUST be attributable to the acting Identity | adr-010:79 | derivation parent adr-010:56 (attribution requirement); ADM-15 admin_user_stories.md:171 (attribution for diagnosis) | derived |
| Acceptance MUST preserve provenance to source/candidate/draft/LLM suggestion/rationale | adr-010:80 | CUR-13 curator_user_stories.md:123 (see why a suggestion was proposed); CUR-07:73 | traced |
| Acceptance MUST create/update via stable accepted revision, not silent overwrite | adr-010:81 | CUR-10 curator_user_stories.md:97 (evolve without rewriting student state); derivation parent adr-010:50 | traced |
| Accepted revisions referenced by student attempts/feedback/evidence MUST remain addressable | adr-010:82 | INT-07 intent:120 (evidence behind state); STU-17 student_user_stories.md:160; derivation parent adr-010:50 | derived |
| Student state MUST reference accepted corpus rather than copy ownership of it | adr-010:83 | INT-07 intent:120; student_user_stories.md:226 (separation); derivation parent adr-010:58 | derived |
| Updating accepted corpus MUST NOT erase/rewrite existing student learning history | adr-010:84 | CUR-10 curator_user_stories.md:103 ("do not erase or overwrite existing student attempts, progress, or learning history") | traced |
| Draft rejection MUST NOT delete accepted corpus | adr-010:85 | derivation parent adr-010:54 (draft/accepted separation); CUR-12 curator_user_stories.md:115 | derived |
| Candidate deletion/cleanup MUST NOT remove accepted revisions or student references | adr-010:86 | derivation parent adr-010:84 (protect student history); CUR-10 curator_user_stories.md:103 | derived |
| Admin recovery MAY repair corpus/acceptance in later ADR flow but MUST preserve attribution and MUST NOT be ordinary acceptance path | adr-010:87 | ADM-13 admin_user_stories.md:151 (exceptional recovery preserving attribution); ADM-14:161; admin_user_stories.md:189 | traced |
| Later ADRs MAY define schemas/permissions/ingestion/storage/LLM workflows/APIs/UI/migration only if they preserve Corpus Storage / Curator Workspace ownership | adr-010:88 | derivation parent adr-010:46 (boundary preservation clause; extension-point guard, no new capability) | derived |

### ADR-009 — Decision (lines 40–56)

| ADR decision | adr file:line | Upstream intent (or derivation parent) | Verdict |
|---|---|---|---|
| Model a minimal accepted Program shell before accepted topics/concepts/materials/checks/criteria/learner state required | adr-009:40 | CUR-01 curator_user_stories.md:23 (create a program); derivation parent — stable Program scope needed for INT-01 intent:114 | carried-shape |
| Program shell is the accepted Program record providing stable identifier + operator-visible metadata to distinguish Programs; not a draft/workspace/learner/membership record | adr-009:42 | CUR-01 curator_user_stories.md:29 (create a program, attach source set); derivation parent adr-009:40 | carried-shape |
| Corpus Storage MUST own the accepted Program shell and its stable identifier | adr-009:44 | module_responsibility_map.md:68; derivation parent adr-009:40 | derived |
| First Program creation flow MUST allow any active Identity to request creation when validation passes | adr-009:46 | CUR-01 curator_user_stories.md:23 (curator creates a program); intent:35 (curator assembles program) | carried-shape |
| Program creation MUST create shell and request Program Membership to establish active Program Curator participation for acting Identity | adr-009:48 | CUR-01 curator_user_stories.md:23; derivation parent adr-009:46 | derived |
| Initial Program Curator authority MUST be Program Membership participation, not Admin grant/credential/session claim/owner field | adr-009:50 | module_responsibility_map.md:93 (Program Curator owns curator decisions; participation governed by membership); derivation parent adr-009:48 | derived |
| First Program creation flow MUST initialize Student admission policy as self-join | adr-009:52 | STU-18 student_user_stories.md:170 (join a self-join program) | carried-shape |
| Program creation MUST be attributable to acting Identity through creation event + initial membership state-change event | adr-009:54 | ADM-15 admin_user_stories.md:171 (membership changes logged with attribution); derivation parent adr-009:48 | derived |
| Admin MAY inspect/recover Program and membership state later but MUST NOT be required for ordinary creation nor create ordinary curator participation | adr-009:56 | ADM-12 admin_user_stories.md:141, ADM-13:151; admin_user_stories.md:189 (Admin not normal flow) | traced |

### ADR-009 — Rules / Invariants (lines 60–81)

| ADR decision | adr file:line | Upstream intent (or derivation parent) | Verdict |
|---|---|---|---|
| Program is the stable scope key for corpus/membership/Curator Workspace/Student Workspace | adr-009:60 | derivation parent adr-009:40; module_responsibility_map.md:68 | derived |
| A Program shell MUST provide a stable identifier before Program-scoped membership/workspace behavior | adr-009:61 | derivation parent adr-009:40 | derived |
| A Program shell MUST NOT contain accepted topics/concepts/materials/checks/criteria/drafts/learner state by itself | adr-009:62 | derivation parent adr-009:40 (minimal shell); INT-01 intent:114 (separation) | derived |
| Corpus Storage owns the accepted Program shell | adr-009:63 | module_responsibility_map.md:68; derivation parent adr-009:44 | derived |
| Curator Workspace MUST NOT be the owner of the accepted Program shell | adr-009:64 | INT-01 intent:114 (accepted vs draft separation); derivation parent adr-009:44 | derived |
| Program Membership owns initial and later Program Curator participation | adr-009:65 | module_responsibility_map.md:93; derivation parent adr-009:50 | derived |
| Identity & Role Management MUST NOT own Program shells or Program Curator participation | adr-009:66 | module_responsibility_map.md:72; derivation parent adr-009:50 | derived |
| A Program creation request MUST identify an acting internal Identity | adr-009:67 | derivation parent adr-009:46/54 (attribution); CUR-01 curator_user_stories.md:23 | derived |
| A Program creation request MUST be rejected when the acting Identity is not active | adr-009:68 | derivation parent adr-009:46 (active-Identity validation); intent:41 (admin manages identities) | derived |
| Program creation MUST establish active Program Curator participation through Program Membership | adr-009:69 | CUR-01 curator_user_stories.md:23; derivation parent adr-009:48 | derived |
| Program creation MUST NOT grant Admin authority | adr-009:70 | admin_user_stories.md:187 (Admin not auto-granted by learning ops); derivation parent adr-009:50 | derived |
| Program creation MUST NOT grant Student participation to the creator by default | adr-009:71 | derivation parent adr-009:48 (curator-only initial participation); CUR-01 curator_user_stories.md:23 | derived |
| Program creation MUST NOT create learner state | adr-009:72 | INT-01 intent:114 (corpus vs student state separation); derivation parent adr-009:40 | derived |
| Program creation MUST NOT accept topics/concepts/materials/checks/criteria/LLM suggestions by itself | adr-009:73 | INT-01 intent:154 (acceptance is explicit); CUR-12 curator_user_stories.md:121; derivation parent adr-009:40 | traced |
| Program creation MUST initialize self-join Student admission policy for the first product slice | adr-009:74 | STU-18 student_user_stories.md:170 (join a self-join program); derivation parent adr-009:52 | traced |
| Creating shell + establishing initial Curator participation MUST be atomic from caller's perspective | adr-009:75 | derivation parent adr-009:48 (no orphaned shell; integrity of creation+participation) | derived |
| Failed Program creation MUST NOT leave a shell without initial Program Curator participation | adr-009:76 | derivation parent adr-009:75 (atomicity) | derived |
| Initial curator authority MUST be evaluated through effective participation contract before curator-sensitive behavior | adr-009:77 | derivation parent adr-009:50; CUR-01 curator_user_stories.md:23 | derived |
| Program creation MUST emit a creation event attributed to acting Identity | adr-009:78 | ADM-15 admin_user_stories.md:171 (attribution); derivation parent adr-009:54 | derived |
| Initial Program Curator participation MUST emit a membership state-change event attributed to acting Identity | adr-009:79 | ADM-15 admin_user_stories.md:171; derivation parent adr-009:54 | derived |
| Program creation events and membership events are not operational logs and MUST NOT be source of authorization | adr-009:80 | derivation parent adr-009:50 (authority is membership participation, not events) | derived |
| Later ADRs MAY define ownership transfer/archival/controlled creation/invitations/expiry/policy/versioning/schema/UI/APIs/permissions only if they preserve Corpus Storage + Program Membership ownership | adr-009:81 | derivation parent adr-009:44/65 (ownership-preservation guard; extension-point clause, no new capability) | derived |

## Findings

Zero ORPHAN rows. No decision in either ADR introduces a user-observable capability or scope commitment unrequested by an accepted intent story.

Candidates that initially looked parent-less, and the suppression guard that caught each:

- **Stable accepted revisions / addressability** (adr-010:50, :81, :82). No intent story says "keep revisions." Caught by `carried-shape`/`derived`: it is the technical means to honour CUR-10 (curator_user_stories.md:97,103 — "evolve without rewriting the student's personal state" / "do not erase existing student attempts, progress, or learning history") and INT-07 (intent:120 — evidence behind progress). A revision/addressability mechanism necessarily arises from the requirement that corpus evolution must not destroy student evidence.
- **Provenance / attribution on acceptance** (adr-010:56, :79, :80). No story demands "attribution" as a feature per se, but CUR-13 (curator_user_stories.md:123 — see why a suggestion was proposed) requests origin traceability, and ADM-15 (admin_user_stories.md:171) requests attributable changes. Caught by `derived` + `traced`: provenance/identity is a system-level primitive serving these stories plus the acceptance boundary itself.
- **Program shell as a distinct accepted record with operator-visible metadata** (adr-009:40, :42, :46, :52). No intent story names a "Program shell." Caught by `carried-shape`: INT-01/CUR-01 commit the existence of "create a program" (curator_user_stories.md:23,29); the ADR fills in the minimal stable-scope shape the intent left open. Self-join initialization (adr-009:52) directly serves STU-18 (student_user_stories.md:170). No new user-facing capability is added beyond program creation that CUR-01 already requests.
- **Membership-as-authority, atomicity, event emission, non-authorization-from-events** (adr-009:48,50,75,76,78,79,80; adr-010:69). None is intent-visible. Caught by `derived`: each is an internal contract / integrity mechanism that necessarily arises from honouring "creating a program grants the creator curator access" (CUR-01) while keeping participation in Program Membership (module_responsibility_map.md:93) and authority out of Admin (admin_user_stories.md:187).
- **Extension-point preservation clauses** (adr-010:88, adr-009:81). These commit no capability; they constrain future ADRs to preserve the already-traced ownership boundary. Caught by `derived`: pure guard rails over the traced decision, not new scope.

## Open questions

- The atomicity requirement (adr-009:75) and event-emission requirements (adr-009:78,79,54) are internal-integrity derivations with no direct intent parent. They are firmly `derived` here because each chains to CUR-01 + the membership ownership boundary. If a reviewer wants these tied to an explicit stakeholder requirement rather than a derivation, that resolution lives at the intent/curator-story layer. (resolving layer: intent)
- "Operator-visible metadata to distinguish the Program" (adr-009:42) is the closest thing to a borderline user-observable shape commitment. It is treated as `carried-shape` because STU-01/STU-03 (student_user_stories.md:22,38 — list/preview available programs) and CUR-01 already presume Programs are distinguishable. If the intent layer wants to constrain or forbid operator metadata fields, that is an intent-side decision. (resolving layer: intent)

## Inspected

- `adr-010-corpus-storage-and-curator-acceptance-boundary.md` (status: accepted) — enumerated 9 Decision sentences (lines 46–62) and 23 Rules/Invariants bullets (lines 66–88); Executive Summary, Context, Consequences, Non-Goals read but not enumerated as decision rows (they restate or defer).
- `adr-009-program-shell-and-initial-curator-participation.md` (status: accepted) — enumerated 9 Decision sentences (lines 40–56) and 22 Rules/Invariants bullets (lines 60–81); Executive Summary, Context, Consequences, Non-Goals read but not enumerated.
- `intent_learning_program_app.md` (version 0.3.0) — INT-01..INT-07, acceptance signals, product structure, boundaries, ownership.
- `curator_user_stories.md` (version 0.3.0) — CUR-01..CUR-18, acceptance signals, boundaries.
- `student_user_stories.md` (version 0.3.1) — STU-01..STU-23, boundaries.
- `admin_user_stories.md` (version 0.2.1) — ADM-01..ADM-15, boundaries.
- `module_responsibility_map.md` (version 0.4.3) — Corpus Storage / Curator Workspace / Program Membership / Student Workspace / Identity & Role Management ownership rows, product-intent traceability, candidate ownership rules (used only to confirm module→intent area mapping).

No specs, plans, code, or tests were read. No prior review outputs were read.
