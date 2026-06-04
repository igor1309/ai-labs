---
date: 2026-06-03
model: claude-opus-4-8
description: "ADR x ADR cross-module compatibility review for Agonara: ownership matrix + cross-module contract register over the 16 accepted ADRs against the provisional module responsibility map."
skill: traceability-review
skill_version: "0.3.0"
scope: "ADR × ADR — agonara (cross-module compatibility)"
checks: [double-ownership, boundary-violation, contract-consistency, map-adr-drift]
mechanism: ownership-matrix + contract-register
inputs:
  - "agonara/docs/module_responsibility_map.md (v0.4.3, provisional / pre-ADR map)"
  - "agonara/docs/adr/adr-001-internal-identity-as-agonara-ownership-subject.md (accepted)"
  - "agonara/docs/adr/adr-002-role-authority-scope-model.md (accepted)"
  - "agonara/docs/adr/adr-003-admin-recovery-invariant.md (accepted)"
  - "agonara/docs/adr/adr-004-program-membership-owns-program-participation.md (accepted)"
  - "agonara/docs/adr/adr-005-program-membership-state-and-first-admission-policy.md (accepted)"
  - "agonara/docs/adr/adr-006-program-membership-policy-actor.md (accepted)"
  - "agonara/docs/adr/adr-007-effective-participation-authorization-contract.md (accepted)"
  - "agonara/docs/adr/adr-008-first-slice-authentication-session-and-credential-boundary.md (accepted)"
  - "agonara/docs/adr/adr-009-program-shell-and-initial-curator-participation.md (accepted)"
  - "agonara/docs/adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md (accepted)"
  - "agonara/docs/adr/adr-011-accepted-checks-and-student-assessment-boundary.md (accepted)"
  - "agonara/docs/adr/adr-012-student-workspace-open-answer-attempt-lifecycle.md (accepted)"
  - "agonara/docs/adr/adr-013-student-workspace-open-answer-evaluation-governance.md (accepted)"
  - "agonara/docs/adr/adr-014-student-workspace-open-answer-evaluator-orchestration.md (accepted)"
  - "agonara/docs/adr/adr-015-open-answer-evaluator-worker-provider-boundary.md (accepted)"
  - "agonara/docs/adr/adr-016-quick-check-assessment-boundary.md (accepted)"
---

# ADR × ADR Cross-Module Compatibility Review — Agonara

## Summary

- **Ownership-matrix rows:** 27. Verdicts: `single-owner` 24, `map-adr-drift` 3, `double-ownership` 0.
- **Cross-module contract-register rows:** 9. Verdicts: `consistent` 9, `inconsistent` 0, `boundary-violation` 0.
- **Findings:** 4 total — 0 fail, 4 warning. All four are `map-adr-drift` (the map is marked provisional/pre-ADR at v0.4.3 and predates ADRs 009–016 in its per-module `Owns` columns). No `double-ownership`, no `inconsistent`, no `boundary-violation`.
- **Open questions:** 2 (both deferred to the intent layer or to a future map revision).

One-sentence verdict: The 16 accepted ADRs form a mutually consistent cross-module ownership lattice with cleanly described shared contracts; the only contradictions are stale per-module `Owns` entries in the explicitly-provisional responsibility map, which the map's own front-matter and "Emerging direction" prose already flag as lagging the accepted ADRs.

## Ownership matrix

Each responsibility is drawn from the map's per-module `Owns` columns (map line cited under "Map owner"). The "ADR owner(s)" column cites the ADR line that actually decides ownership. Verdict compares them.

| # | Responsibility | Map owner (file:line) | ADR owner(s) (file:line) | Verdict |
|---|---|---|---|---|
| 1 | Internal identities | Identity & Role Management (map:72) | ADR-001 (adr-001:32, 44) | single-owner |
| 2 | Credential bindings | Identity & Role Management (map:72) | ADR-001 (adr-001:36); ADR-008 (adr-008:44) | single-owner |
| 3 | Admin role / authority | Identity & Role Management (map:72) | ADR-002 (adr-002:53, 67); ADR-003 (adr-003:38) | single-owner |
| 4 | Role vocabulary / role invariants | Identity & Role Management (map:72) | ADR-002 (adr-002:44–60); ADR-006 (adr-006:42) | single-owner |
| 5 | Role-management operations | Identity & Role Management (map:72) | ADR-002 (adr-002:42); ADR-003 (adr-003:57–58) | single-owner |
| 6 | Access recovery | Identity & Role Management (map:72) | ADR-003 (adr-003:38, 44, 60) | single-owner |
| 7 | Effective participation decisions | Program Membership (map:69, 134) | ADR-004 (adr-004:71); ADR-007 (adr-007:40, 75) | single-owner |
| 8 | Program membership lifecycle | Program Membership (map:69, 131) | ADR-004 (adr-004:44, 65); ADR-005 (adr-005:94) | single-owner |
| 9 | Join/leave/rejoin behavior | Program Membership (map:69) | ADR-005 (adr-005:68–86) | single-owner |
| 10 | Invitation lifecycle | Program Membership (map:69, 132) | ADR-004 (adr-004:68); ADR-005 (adr-005:82–88) | single-owner |
| 11 | Membership status | Program Membership (map:69) | ADR-005 (adr-005:49–63, 94) | single-owner |
| 12 | Membership policy | Program Membership (map:69) | ADR-004 (adr-004:66); ADR-005 (adr-005:88); ADR-006 (adr-006:50) | single-owner |
| 13 | Participant visibility rules | Program Membership (map:69, 133) | ADR-004 (adr-004:69) | single-owner |
| 14 | Exceptional membership recovery hooks | Program Membership (map:69) | ADR-004 (adr-004:70); ADR-003 (adr-003:60); ADR-005 (adr-005:90) | single-owner |
| 15 | Programs (accepted Program shell) | Corpus Storage (map:68, 124) | ADR-009 (adr-009:44, 63) | **map-adr-drift** |
| 16 | Topics / concepts / definitions / principles | Corpus Storage (map:68, 124) | ADR-010 (adr-010:48, 75) | single-owner |
| 17 | Accepted assessment items / criteria | Corpus Storage (map:68, 125) | ADR-010 (adr-010:48); ADR-011 (adr-011:46, 73) | single-owner |
| 18 | Accepted open-answer check revisions | Corpus Storage (subsumed under "accepted assessment items", map:68) | ADR-011 (adr-011:46); ADR-012 (adr-012:75) | single-owner |
| 19 | Accepted quick-check revisions / options / answer keys | Corpus Storage (subsumed under "accepted assessment items", map:68) | ADR-016 (adr-016:46, 76) | **map-adr-drift** |
| 20 | Student-facing delivery projection (answer-key exclusion) | (not in map) | ADR-016 (adr-016:52, 88) | **map-adr-drift** |
| 21 | Material storage references / copies, source metadata | Corpus Storage (map:68, 126) | ADR-010 (adr-010:48, 75) | single-owner |
| 22 | Research sources / candidate content / drafts / LLM suggestions | Curator Workspace (map:70, 127–128) | ADR-010 (adr-010:52, 67) | single-owner |
| 23 | Curator acceptance decisions | Curator Workspace / "Identity acting as Program Curator" (map:70, 129) | ADR-010 (adr-010:54, 56); ADR-011 (adr-011:48) | single-owner |
| 24 | Student attempts / submitted answers / selected answers | Student Workspace (map:71, 135) | ADR-011 (adr-011:52); ADR-012 (adr-012:72); ADR-016 (adr-016:54) | single-owner |
| 25 | Evaluation results / feedback / evidence | Student Workspace (map:71, 135) | ADR-011 (adr-011:52); ADR-013 (adr-013:44, 72) | single-owner |
| 26 | Open-answer evaluator jobs / orchestration lifecycle | (not in map) | ADR-014 (adr-014:44, 72–77) | **map-adr-drift** |
| 27 | Mastery / weak-area / review / progress state | Student Workspace (map:71, 136) | ADR-011 (adr-011:52, 82); ADR-013 (adr-013:103) | single-owner |

(Rows 19 and 20 share one root drift item — the map's "accepted assessment items" column predates ADR-016 — but are listed separately because they name two distinct responsibilities, one of which, the delivery projection, the map does not enumerate at all. They are counted as part of the four findings under Finding F-2 / F-3.)

## Cross-module contract register

Each row is a contract one module provides and another consumes. "Provider" cites the ADR + line that defines the contract; "Consumer(s)" cite the ADR + line that depends on it. Verdict checks that provider and every consumer describe the same operation, semantics, and direction.

| # | Contract | Provider (file:line) | Consumer(s) (file:line) | Verdict |
|---|---|---|---|---|
| C1 | Effective participation decision (read-only; allowed/denied per Identity×Program×kind) | Program Membership — ADR-007 (adr-007:40–88) | Student Workspace ADR-007:79 / ADR-011:62 / ADR-012:81; Curator Workspace ADR-007:80 / ADR-010:56,78; Admin diagnosis ADR-007:82 | consistent |
| C2 | Identity-as-ownership-subject (domain records reference internal `Identity`, never credential/session) | Identity & Role Mgmt — ADR-001 (adr-001:32–40) | ADR-002:23–24; ADR-004:51; ADR-007:24,76; ADR-009:67; ADR-010:56,79; ADR-012:44,77; ADR-013:52,81 | consistent |
| C3 | Role authority scope (Student/Curator Program-scoped, Admin instance-scoped; credential ≠ role) | Identity & Role Mgmt — ADR-002 (adr-002:42–60) | ADR-004:18,53; ADR-008:46,69; ADR-009:56,70; ADR-006:60 | consistent |
| C4 | Last-effective-Admin recovery invariant + bootstrap | Identity & Role Mgmt — ADR-003 (adr-003:38–66) | ADR-008:56–69,85–89 (bootstrap path implements invariant); ADR-004:61 (Admin not normal membership actor) | consistent |
| C5 | Program Membership establishes initial Curator participation on Program creation | Program Membership (consumer of request) — ADR-005 (adr-005:80) / ADR-004 (adr-004:51) | Corpus Storage / Program creation flow — ADR-009 (adr-009:48,69,75) | consistent |
| C6 | Curator-acceptance boundary (candidate→accepted corpus crossing; authorized via effective Curator) | Corpus Storage — ADR-010 (adr-010:54–56, 77–80) | Curator Workspace ADR-010:52; checks/criteria ADR-011:48,64; quick checks ADR-016:50 | consistent |
| C7 | Accepted revision references (attempts/evaluations reference accepted revisions, never copy/mutate) | Corpus Storage — ADR-010 (adr-010:51,81–82); ADR-011 (adr-011:79–81) | Student Workspace ADR-012:78–79,88; ADR-013:76–78; ADR-014:80; ADR-016:93 | consistent |
| C8 | Evaluator job / worker / provider boundary (workers act through Student Workspace job, never own final state) | Student Workspace — ADR-014 (adr-014:44–53, 72–77) | Workers/providers ADR-015:44–54,78–94; governance ADR-013:46,97 | consistent |
| C9 | Reviewer / Admin / Curator authority isolation from evaluation authoring | Student Workspace — ADR-013 (adr-013:58,94–95) | ADR-014:101–103; ADR-015:110–112; ADR-016:70–72 | consistent |

## Findings

All findings are `map-adr-drift` warnings. The map's front-matter (`module_responsibility_map.md:6`, `version: 0.4.3`) and Purpose/Context sections (`module_responsibility_map.md:15`: "It is a Pre-ADR responsibility map. The boundaries below are exploratory and may change before a formal ADR accepts module ownership.") already declare the map subordinate to accepted ADRs, so these are unacknowledged-in-the-table mismatches rather than hard contradictions. They warrant a map revision so the per-module `Owns` columns name the now-accepted ownerships.

### F-1 (warning) — map-adr-drift: accepted `Program` shell ownership absent from Corpus Storage `Owns`

- **Verdict:** warning (map-adr-drift). Matrix row 15.
- **Map side:** `module_responsibility_map.md:68` — Corpus Storage `Owns` lists "Programs, topics, concepts, definitions, principles, accepted assessment items, …". "Programs" appears but the map does not distinguish the **accepted Program shell** as a stable scope key, and `module_responsibility_map.md:32` (in the Emerging-direction prose) still says the map "treats the Corpus Storage / Curator Workspace boundary as provisional until a Program creation decision exists" — language the map repeats only in prose, not in the table.
- **ADR side:** ADR-009 `adr-009-program-shell-and-initial-curator-participation.md:44` — "Corpus Storage MUST own the accepted Program shell and its stable Program identifier." and `adr-009:63–64`: "Corpus Storage owns the accepted Program shell. / Curator Workspace MUST NOT be the owner of the accepted Program shell."
- **Why it is a problem:** the map's `Key Boundary` for Corpus Storage (`module_responsibility_map.md:68`) and the Emerging-direction note (`module_responsibility_map.md:32`) still frame the Program-creation/shell boundary as open, while ADR-009 has accepted it. A reader using only the table cannot tell that the Program shell (not just full corpus) is settled Corpus Storage ownership.
- **Fix:** update the Corpus Storage `Owns` cell to name "accepted Program shell + stable Program identifier" explicitly and remove the "provisional until a Program creation decision exists" qualifier in `module_responsibility_map.md:32`, citing ADR-009.

### F-2 (warning) — map-adr-drift: accepted quick-check corpus (revisions, options, answer keys) not enumerated

- **Verdict:** warning (map-adr-drift). Matrix row 19.
- **Map side:** `module_responsibility_map.md:68` — Corpus Storage `Owns` lists "accepted assessment items, assessment criteria" but does not name quick-check **answer keys** or **answer options** as a distinct owned responsibility; `module_responsibility_map.md:125` (Candidate ownership rules) lists only "Accepted Checks and Assessment Criteria → Corpus Storage".
- **ADR side:** ADR-016 `adr-016-quick-check-assessment-boundary.md:46,76` — "Corpus Storage MUST own accepted quick-check entities and stable accepted quick-check revisions." and "Corpus Storage owns accepted quick-check entities, revisions, answer options, and answer keys."
- **Why it is a problem:** answer keys carry a secrecy obligation (`adr-016:52,58,89`) that the generic "accepted assessment items" map entry does not capture. The map does not signal that Corpus Storage owns a class of content (answer keys) that must never reach student-facing reads.
- **Fix:** add quick-check revisions, answer options, and answer keys to the Corpus Storage `Owns` cell (or note that "accepted assessment items" subsumes them and carries an answer-key secrecy boundary), citing ADR-016.

### F-3 (warning) — map-adr-drift: student-facing delivery projection responsibility unmapped

- **Verdict:** warning (map-adr-drift). Matrix row 20.
- **Map side:** no row. `module_responsibility_map.md:68,71` — neither Corpus Storage `Owns` nor Student Workspace `Owns` names a "delivery projection" that exposes answerable options while withholding answer keys.
- **ADR side:** ADR-016 `adr-016:52` — "Corpus Storage MUST expose a student-facing delivery projection that includes the accepted quick-check revision identifier, prompt, and answerable options while excluding the answer key." and `adr-016:88–89` (delivery-projection rules).
- **Why it is a problem:** this is a Corpus-Storage-owned, cross-module-facing capability (it is what Student Workspace reads instead of raw accepted revisions). It is decided by an accepted ADR but invisible in the map, so a future module touching student reads has no map entry telling it the projection is Corpus Storage's responsibility.
- **Fix:** add a Corpus Storage responsibility/`Owns` entry for the student-facing delivery projection (answer-key exclusion), citing ADR-016:52.

### F-4 (warning) — map-adr-drift: evaluator job/worker orchestration ownership unmapped

- **Verdict:** warning (map-adr-drift). Matrix row 26.
- **Map side:** `module_responsibility_map.md:71` Student Workspace `Owns` lists learner state ("answers, attempts, assessment feedback, evidence, mastery state, …") and `module_responsibility_map.md:111` (Embedded Behaviors) puts "Assessment execution" in Student Workspace, but neither names **evaluator job identity, lease/lock state, retry eligibility, cancellation, timeout recovery** as owned orchestration state.
- **ADR side:** ADR-014 `adr-014:44` — "Agonara MUST model open-answer evaluator orchestration as Student Workspace-owned evaluator jobs." and `adr-014:72–77` (Student Workspace owns job identity, lifecycle state, retry eligibility, cancellation, timeout recovery, final acceptance). ADR-015 `adr-015:78–80` reinforces (workers/providers are execution agents, not owners).
- **Why it is a problem:** orchestration ownership (jobs, leases, worker/provider boundary) is a substantial accepted responsibility with explicit Admin/Curator exclusion rules (`adr-014:102–103`), yet the map's Student Workspace cell describes only learner-state data, not the job-orchestration boundary. A reader cannot see from the map that worker/provider execution is governed Student Workspace state.
- **Fix:** extend the Student Workspace `Owns` cell (and the Embedded Behaviors "Assessment execution" row) to include evaluator-job orchestration ownership and the worker/provider execution boundary, citing ADR-014 and ADR-015.

## Open questions

- **(resolving layer: intent → ADR / map revision)** Several accepted responsibilities (Program shell, quick-check answer keys, delivery projection, evaluator orchestration) are settled in ADRs but unmapped. Whether the map should be revised now or after the next intent-driven slice is a map-governance decision, not an ADR×ADR contradiction. Tagged for the map maintainer / intent→ADR pass.
- **(resolving layer: intent layer — out of scope here)** Seam coverage (capabilities owned by no module) cannot be evaluated at this layer because it needs the intents. No ADR×ADR evidence of an orphaned cross-module capability surfaced, but absence here is not proof of full seam coverage; the intent layer owns that check.

## Inspected

Confirmed read in full:

- `agonara/docs/module_responsibility_map.md` (v0.4.3, provisional pre-ADR map) — all per-module `Owns` / `Does Not Own` / `Key Boundary` rows, candidate ownership rules, embedded behaviors, cross-cutting table.
- ADR-001 (accepted) — internal Identity ownership subject.
- ADR-002 (accepted) — role authority scope model.
- ADR-003 (accepted) — admin recovery invariant.
- ADR-004 (accepted) — Program Membership owns participation.
- ADR-005 (accepted) — membership state and first admission policy.
- ADR-006 (accepted) — Program Membership policy actor.
- ADR-007 (accepted) — effective participation authorization contract.
- ADR-008 (accepted) — first-slice authentication/session/credential boundary.
- ADR-009 (accepted) — Program shell and initial curator participation.
- ADR-010 (accepted) — Corpus Storage and curator acceptance boundary.
- ADR-011 (accepted) — accepted checks and student assessment boundary.
- ADR-012 (accepted) — open-answer attempt lifecycle.
- ADR-013 (accepted) — open-answer evaluation governance.
- ADR-014 (accepted) — open-answer evaluator orchestration.
- ADR-015 (accepted) — evaluator worker/provider boundary.
- ADR-016 (accepted) — quick-check assessment boundary.

No intents, specs, plans, code, tests, or prior review outputs were read.
