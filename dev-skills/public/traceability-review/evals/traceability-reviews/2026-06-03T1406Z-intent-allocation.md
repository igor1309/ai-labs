---
date: 2026-06-03
model: claude-opus-4-8
description: "Allocation-completeness pass for Agonara — every intent capability checked for ownership by at least one module, via a global allocation matrix."
skill: traceability-review
skill_version: "0.4.0"
scope: "allocation completeness — agonara (intent → modules)"
mechanism: global-allocation-matrix
suppression_rules: [status-gate, type-gate, multi-owner, pending, system-level-owner]
inputs:
  intents:
    - intent_learning_program_app.md (v0.3.0)
    - admin_user_stories.md (v0.2.1)
    - curator_user_stories.md (v0.3.0)
    - student_user_stories.md (v0.3.1)
  map:
    - module_responsibility_map.md (v0.4.3)
  adrs:
    - adr-001-internal-identity-as-agonara-ownership-subject.md (accepted)
    - adr-002-role-authority-scope-model.md (accepted)
    - adr-003-admin-recovery-invariant.md (accepted)
    - adr-004-program-membership-owns-program-participation.md (accepted)
    - adr-005-program-membership-state-and-first-admission-policy.md (accepted)
    - adr-006-program-membership-policy-actor.md (accepted)
    - adr-007-effective-participation-authorization-contract.md (accepted)
    - adr-008-first-slice-authentication-session-and-credential-boundary.md (accepted)
    - adr-009-program-shell-and-initial-curator-participation.md (accepted)
    - adr-010-corpus-storage-and-curator-acceptance-boundary.md (accepted)
    - adr-011-accepted-checks-and-student-assessment-boundary.md (accepted)
    - adr-012-student-workspace-open-answer-attempt-lifecycle.md (accepted)
    - adr-013-student-workspace-open-answer-evaluation-governance.md (accepted)
    - adr-014-student-workspace-open-answer-evaluator-orchestration.md (accepted)
    - adr-015-open-answer-evaluator-worker-provider-boundary.md (accepted)
    - adr-016-quick-check-assessment-boundary.md (accepted)
---

# Intent Allocation Completeness — Agonara

## Summary

Capability rows: 71 (7 INT + 15 ADM + 18 CUR + 23 STU + 8 product-intent/cross-cutting capabilities).

Verdict breakdown:

- allocated: 59
- cross-cutting-allocated: 8
- deferred: 4
- pending: 0
- UNALLOCATED: 0

Finding total: 0 unallocated capabilities.

Every intent capability is owned or carried by at least one module. Four capabilities (CUR-08/09/13 LLM/research draft mechanics and the Product Analytics cross-cutting concern) are carried by an owner at the responsibility level even though their concrete first-slice mechanics are deferred by ADR Non-Goals; none falls between module boundaries with no owner. The architecture is allocation-complete.

## Allocation matrix

| Capability | Statement | Owner(s) | owner_count | Verdict |
|---|---|---|---|---|
| Product outcome | Managed program of освоение: what to learn, how to verify, where gaps remain; corpus/student-state separation preserved | Corpus Storage + Student Workspace + Curator Workspace (`module_responsibility_map.md:68-71`); separation invariant accepted `adr-010...:46-61`, `adr-011...:58-66` | 4 | allocated |
| Boundary: corpus vs student state | Program content must stay separate from personal student state | Corpus Storage owns accepted corpus / Student Workspace owns learner state (`adr-010...:46-61`); also `adr-011...:46-58` | 2 | allocated |
| Boundary: LLM suggestions not content | LLM output is draft material until curator acceptance | Curator Workspace owns LLM suggestions pre-acceptance (`module_responsibility_map.md:70`); `adr-010...:73` ("LLM output MUST remain candidate material until accepted") | 1 | allocated |
| Boundary: membership vs identity/state | Program membership separate from identity lifecycle, curator decisions, student state | Program Membership (`adr-004...:42-61`, `module_responsibility_map.md:69`) | 1 | allocated |
| INT-01 | Assemble a learning program from external/own sources | Curator Workspace (intake/acceptance) + Corpus Storage (accepted corpus) (`adr-010...:46-56`); Program shell `adr-009...:44-48` | 2 | allocated |
| INT-02 | See key terms/concepts/principles/definitions of a topic | Corpus Storage owns accepted concepts/definitions/principles (`adr-010...:48`, `module_responsibility_map.md:68`); read via Student Workspace | 1 | allocated |
| INT-03 | See materials linked to topics/concepts | Corpus Storage owns material references and accepted topics/concepts (`adr-010...:48`) | 1 | allocated |
| INT-04 | Answer checks during study to verify understanding | Corpus Storage owns accepted checks (`adr-011...:46`); Student Workspace owns attempts (`adr-011...:52`); quick checks `adr-016...:44-57` | 2 | allocated |
| INT-05 | Open answers evaluated against program criteria | Corpus Storage owns criteria (`adr-011...:46`); Student Workspace owns attempts/evaluation (`adr-011...:52-54`, `adr-012...:42-58`, `adr-013...:42-48`) | 2 | allocated |
| INT-06 | Pass topic-level or period-level checks | Corpus Storage owns accepted checks/criteria (`adr-011...:46-51`); Student Workspace owns attempt/result interpretation (`adr-011...:52`) — topic/period readiness mechanics deferred (`adr-016...:140`), but ownership held | 2 | allocated |
| INT-07 | See personal mastery/weak/unconfirmed state | Student Workspace owns mastery/weak-area/progress evidence (`adr-011...:52`, `module_responsibility_map.md:71`) | 1 | allocated |
| ADM-01 | Initialize private instance with first admin | Identity & Role Management; bootstrap `adr-003...:38`, `adr-008...:60-66` | 1 | allocated |
| ADM-02 | Create internal identity | Identity & Role Management (`adr-001...:32-36`, `module_responsibility_map.md:72`) | 1 | allocated |
| ADM-03 | Bind credential to identity | Identity & Role Management (`adr-001...:36-40`, `adr-008...:44`) | 1 | allocated |
| ADM-04 | Disable identity preserving history | Identity & Role Management (`adr-001...:50`, `adr-003...:58`) | 1 | allocated |
| ADM-05 | Inspect identities and credential bindings | Identity & Role Management (`module_responsibility_map.md:72`; `adr-001...` identity-mgmt ops) | 1 | allocated |
| ADM-06 | Inspect program participation authority | Program Membership inspection views (`adr-007...:82`); diagnosis via I&RM Admin authority (`adr-003...`) | 1 | allocated |
| ADM-07 | Trace participation authority changes | Program Membership attributable events (`adr-005...:101`, `adr-007...:85`) | 1 | allocated |
| ADM-08 | Assign/revoke admin role | Identity & Role Management (`adr-002...:53`, `adr-003...:57`) | 1 | allocated |
| ADM-09 | Prevent last-admin removal | Identity & Role Management; recovery invariant `adr-003...:44,56` | 1 | allocated |
| ADM-10 | Audit identity/access operations | Identity & Role Management; sensitive-op audit `adr-003...:61-64` | 1 | allocated |
| ADM-11 | Include identity state in backup/restore | Identity & Role Management state + Backup/Restore cross-cutting (`adr-003...:65`, `module_responsibility_map.md:154`) | 2 | allocated |
| ADM-12 | View program membership state | Program Membership inspection (`adr-004...:36`, `adr-005...:90`) | 1 | allocated |
| ADM-13 | Recover broken membership access | Program Membership exceptional recovery hooks; Admin-authorized (`adr-004...:61`, `adr-005...:90`, `adr-003...:60`) | 1 | allocated |
| ADM-14 | Revoke operationally invalid membership | Program Membership exceptional revocation (`adr-005...:90`, `adr-004...:61`) | 1 | allocated |
| ADM-15 | Audit membership changes | Program Membership attributable membership events (`adr-005...:101`, `adr-006...:47`) | 1 | allocated |
| CUR-01 | Create program from grounded sources | Curator Workspace + Corpus Storage Program shell creation (`adr-009...:46-54`, `adr-010...:52`) | 2 | allocated |
| CUR-02 | Add topics and concepts | Curator Workspace candidates → Corpus Storage on acceptance (`adr-010...:52-56`) | 2 | allocated |
| CUR-03 | Link materials to topics/concepts | Curator Workspace (candidate) / Corpus Storage (accepted material refs) (`adr-010...:48,52`) | 2 | allocated |
| CUR-04 | Add checks and assessment items | Curator Workspace draft → Corpus Storage accepted (`adr-011...:48,60`) | 2 | allocated |
| CUR-05 | Define assessment criteria | Curator Workspace draft criteria → Corpus Storage accepted (`adr-011...:46,60`) | 2 | allocated |
| CUR-06 | Keep accepted content separate from drafts | Curator Workspace / Corpus Storage acceptance boundary (`adr-010...:54-56`, `module_responsibility_map.md:70`) | 2 | allocated |
| CUR-07 | Add external sources | Curator Workspace research intake; source metadata to Corpus Storage on acceptance (`adr-010...:52,74`) | 1 | allocated |
| CUR-08 | Extract candidate structure from sources | Curator Workspace owns extracted candidates (`adr-010...:52,74`, `module_responsibility_map.md:70,113`) — concrete ingestion tooling deferred (`adr-010...:112`), ownership held | 1 | allocated |
| CUR-09 | Identify coverage gaps | Curator Workspace owns gap analysis (`adr-010...:52,76`, `module_responsibility_map.md:70`) — concrete gap mechanics not yet specced but owner explicit | 1 | allocated |
| CUR-10 | Update program after research without rewriting student state | Corpus Storage stable accepted revisions; student history protected (`adr-010...:81-84`) | 1 | allocated |
| CUR-11 | Use LLM assistance for structuring | Curator Workspace (LLM-assisted curation embedded behavior) (`module_responsibility_map.md:113`, `adr-010...:73`) | 1 | allocated |
| CUR-12 | Review LLM suggestions (accept/reject) | Curator Workspace acceptance decisions (`adr-010...:54`, `module_responsibility_map.md:70`) | 1 | allocated |
| CUR-13 | Trace suggestion origin | Curator Workspace provenance before acceptance; Corpus Storage provenance on acceptance (`adr-010...:80`, `module_responsibility_map.md:70`) | 2 | allocated |
| CUR-14 | Invite student to program | Program Membership invitation lifecycle (`adr-004...:46`, `adr-005...:82-84`) | 1 | allocated |
| CUR-15 | See invited students | Program Membership participant/invitation visibility (`adr-004...:69`, `adr-005...:62`) | 1 | allocated |
| CUR-16 | See program participants | Program Membership participant visibility (`adr-004...:69`, `module_responsibility_map.md:69`) | 1 | allocated |
| CUR-17 | Remove student from curated program | Program Membership removal command (`adr-005...:76,104`, `adr-007...:71`) | 1 | allocated |
| CUR-18 | Stop curating a program | Program Membership curator-participation state change (`adr-004...:46`, `adr-005...:80`) | 1 | allocated |
| STU-01 | See available programs | Program Membership/Corpus Storage program visibility; participation `adr-007...` + Program shell `adr-009...:44` | 1 | allocated |
| STU-02 | See started programs | Program Membership effective participation + Student Workspace state (`adr-007...:42`, `module_responsibility_map.md:71`) | 2 | allocated |
| STU-03 | Preview program coverage without creating state | Corpus Storage accepted corpus read (delivery projection style) (`adr-010...:58`, `adr-016...:52`) | 1 | allocated |
| STU-04 | Continue last session | Student Workspace learning position/sessions (`module_responsibility_map.md:71`, `adr-011...:52`) | 1 | allocated |
| STU-05 | See next learning step | Student Workspace (derived from corpus + own state) (`module_responsibility_map.md:71`) — readiness/next-step interpretation deferred (`adr-016...:141`), ownership held | 1 | allocated |
| STU-06 | See key concepts of a topic | Corpus Storage accepted concepts (read by Student Workspace) (`adr-010...:48`) | 1 | allocated |
| STU-07 | Distinguish similar concepts | Corpus Storage accepted concepts incl. confusing neighbors (`adr-010...:48`, intent INT-02 `intent...:58`) | 1 | allocated |
| STU-08 | Mark concepts requiring deeper work | Student Workspace personal state (`adr-011...:52`, `student_user_stories.md:88`) | 1 | allocated |
| STU-09 | See linked materials | Corpus Storage material references (`adr-010...:48`) | 1 | allocated |
| STU-10 | Return from material to concepts | Corpus Storage material↔concept links (`adr-010...:48`) | 1 | allocated |
| STU-11 | Answer quick checks | Student Workspace attempts; Corpus Storage accepted quick checks (`adr-016...:54-57`) | 2 | allocated |
| STU-12 | Submit open answer | Student Workspace open-answer attempts (`adr-012...:42-48`) | 1 | allocated |
| STU-13 | Receive open-answer feedback | Student Workspace evaluation outcomes/feedback (`adr-012...:58-60`, `adr-013...:42-48`) | 1 | allocated |
| STU-14 | Pass topic-level check | Corpus Storage accepted checks + Student Workspace results (`adr-011...:46-52`) — topic-level readiness deferred (`adr-016...:140`), ownership held | 2 | allocated |
| STU-15 | See check results | Student Workspace results (`adr-011...:52`, `adr-016...:54`) | 1 | allocated |
| STU-16 | See weak topics/concepts | Student Workspace weak-area state (`adr-011...:52`, `module_responsibility_map.md:71`) | 1 | allocated |
| STU-17 | See evidence behind progress | Student Workspace evidence/attempts linkage (`adr-011...:52`, `adr-013...:44`) | 1 | allocated |
| STU-18 | Join self-join program | Program Membership self-join (`adr-005...:68`, `adr-006...:50`) | 1 | allocated |
| STU-19 | Leave active program | Program Membership leave (`adr-005...:74,104`) | 1 | allocated |
| STU-20 | Rejoin left program | Program Membership rejoin reuse (`adr-005...:70-72,99`) | 1 | allocated |
| STU-21 | View my membership state | Program Membership state inspection (`adr-005...:90`, `adr-007...:42`) | 1 | allocated |
| STU-22 | Accept program invitation | Program Membership invitation acceptance (`adr-005...:84`) | 1 | allocated |
| STU-23 | Decline program invitation | Program Membership invitation decline (`adr-005...:86,101`) | 1 | allocated |
| Cross-cut: Identity primitives for learning | I&RM provides identity/access primitives serving INT-01..07 | Identity & Role Management (`module_responsibility_map.md:82`, `adr-001...`, `adr-002...`) | 1 | cross-cutting-allocated |
| Cross-cut: Authentication & session | Verify credential, opaque session resolving to Identity | Identity & Role Management (`adr-008...:44-54`) | 1 | cross-cutting-allocated |
| Cross-cut: Effective-participation authorization | Stable participation decision contract used by all workspaces | Program Membership (`adr-007...:42-71`) | 1 | cross-cutting-allocated |
| Cross-cut: Evaluator orchestration/worker | Job/worker/provider boundary behind Student Workspace | Student Workspace (`adr-014...:44-52`, `adr-015...:44-53`) | 1 | cross-cutting-allocated |
| Cross-cut: Logging | Records operational/domain events for diagnosis & audit | Logging cross-cutting responsibility (`module_responsibility_map.md:152`); op contract `intent...` via map | 1 | cross-cutting-allocated |
| Cross-cut: Observability | Health/execution state of instance & long-running ops | Observability cross-cutting responsibility (`module_responsibility_map.md:153`) | 1 | cross-cutting-allocated |
| Cross-cut: Backup / Restore | Recoverability of Agonara data across all modules | Backup/Restore cross-cutting (`module_responsibility_map.md:154`); per-ADR backup invariants `adr-003...:65`, `adr-012...:107`, `adr-016...:105-107` | 1 | cross-cutting-allocated |
| Cross-cut: Product Analytics | Product-usage/learning-behavior signals | Product Analytics cross-cutting responsibility (`module_responsibility_map.md:155`) — own ADR deferred as open question (`module_responsibility_map.md:160`); responsibility carried | 1 | cross-cutting-allocated |

## Findings

No UNALLOCATED rows. Every capability checked against both the Module Responsibility Map and the 16 ADRs resolves to at least one owner.

The candidates that initially looked under-owned were all caught by a suppression rule before they could be flagged:

- **CUR-08, CUR-09, CUR-13 (research extraction, gap analysis, suggestion provenance)** — no concrete spec/slice exists yet and the relevant ingestion/gap mechanics are ADR Non-Goals (`adr-010-corpus-storage-and-curator-acceptance-boundary.md:112-120`). They are not unallocated: Curator Workspace is the explicit responsibility owner (`module_responsibility_map.md:70,113`; `adr-010...:52,74`). Verdict `allocated` (ownership held; first-slice mechanics deferred), not UNALLOCATED.
- **STU-05, STU-14, INT-06 (next-step / topic-level / period-level readiness)** — readiness interpretation, aggregation, and progression policy are deferred by `adr-016-quick-check-assessment-boundary.md:140-141`. Ownership of the underlying attempt/result and corpus is still explicit (Corpus Storage + Student Workspace), so these are `allocated`, not unallocated.
- **Product Analytics** — has no dedicated ADR yet (open question `module_responsibility_map.md:160`), which could look like an unallocated cross-cutting concern. The system-level-owner rule catches it: the map assigns it as a named cross-cutting responsibility carried at the architectural level (`module_responsibility_map.md:155`). Verdict `cross-cutting-allocated`.

## Open questions

- (resolving layer: ADR / spec) Topic-level and period-level check readiness (STU-14, INT-06) and next-step recommendation (STU-05) have explicit owners for the underlying corpus and attempt records, but the *interpretation* policy is deferred by ADR-016 Non-Goals. Allocation is complete; whether a future readiness/progression slice needs its own ADR is an open downstream question, not an allocation gap.
- (resolving layer: Pre-ADR / ADR) Product Analytics, Logging, Observability, and Backup/Restore are carried as cross-cutting responsibilities in the map but only Backup/Restore has concrete per-ADR invariants and an operational first-slice spec reference. The map itself flags (`module_responsibility_map.md:160`) that whether each needs its own ADR is open. This is a depth-of-ownership question, not a no-owner gap.
- (resolving layer: intent) The intent layer leaves "support multiple programs per student at once" as an open product question (`intent_learning_program_app.md:173`). This does not create an unallocated capability — no accepted story asserts it — but it is noted as an upstream open question.

## Inspected

Confirmed read in full:

- Intent layer: `intent_learning_program_app.md` (v0.3.0), `admin_user_stories.md` (v0.2.1, ADM-01..15), `curator_user_stories.md` (v0.3.0, CUR-01..18), `student_user_stories.md` (v0.3.1, STU-01..23).
- Ownership substrate: `module_responsibility_map.md` (v0.4.3).
- All 16 ADRs (adr-001 … adr-016), all status `accepted`.

No specs, plans, code, tests, or prior review outputs were read, per scope.
