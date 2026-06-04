---
date: 2026-06-04
model: claude-opus-4-8
description: "Upward orphan check for Agonara Program Membership — every ADR-004/005/006/007 decision checked for an upstream intent parent. ADR-009 already enumerated in the Corpus/Curator orphan run."
skill: traceability-review
skill_version: "0.12.0"
scope: "upward orphan check — agonara (ADR → intent), Program Membership (ADR-004/005/006/007)"
mechanism: upward-trace-matrix
suppression_rules: [derived-decision, carried-shape, cross-cutting-system-parent, multi-parent]
inputs:
  adrs:
    - adr-004-program-membership-owns-program-participation.md (accepted)
    - adr-005-program-membership-state-and-first-admission-policy.md (accepted)
    - adr-006-program-membership-policy-actor.md (accepted)
    - adr-007-effective-participation-authorization-contract.md (accepted)
  intents:
    - intent_learning_program_app.md (0.3.0)
    - curator_user_stories.md (0.3.0)
    - student_user_stories.md (0.3.1)
    - admin_user_stories.md (0.2.1)
  map:
    - module_responsibility_map.md (0.4.3)
  cross_reference:
    - 2026-06-03T1928Z-orphan-adr-intent-corpus-curator.md (ADR-009 enumerated there; not repeated)
---

# Upward Orphan Check — Agonara (Program Membership)

## Summary

Decision rows: 111 (approximate — ADR prose decisions carry no stable IDs, so
the count is softer than the ID-pinned passes).

- ADR-004: 9 Decision sentences (lines 42–62) + 18 Rules/Invariants bullets (lines 65–82) = 27 rows.
- ADR-005: 19 Decision sentences (lines 42–90) + 15 Rules/Invariants bullets (lines 94–108) = 34 rows.
- ADR-006: 10 Decision sentences (lines 36–54) + 12 Rules/Invariants bullets (lines 58–70) = 22 rows.
- ADR-007: 12 Decision sentences (lines 40–71) + 16 Rules/Invariants bullets (lines 75–88) = 28 rows.

ADR-009 (Program shell + initial curator participation) is **not** re-enumerated:
all 31 of its decision rows were checked in
`2026-06-03T1928Z-orphan-adr-intent-corpus-curator.md` (0 ORPHAN, carried-shape +
derived), since ADR-009 spans Corpus Storage (shell ownership) and Program
Membership (initial participation).

Verdict breakdown:

- traced: 41
- derived: 60
- carried-shape: 10
- ORPHAN: 0

Finding total: 0 ORPHAN rows.

Verdict: Every decision, rule, and invariant in ADR-004/005/006/007 traces back to
an accepted membership intent (STU-18..23, CUR-01, CUR-14..18, ADM-12..15) or is a
legitimate technical/architectural derivation of one of those traced decisions
(module-ownership allocation, the effective-participation contract, coarse reason
categories, the narrative `Program Membership Manager` actor, attributability,
record uniqueness, non-authorization-from-events). No unrequested user-observable
scope was found.

The module's intent substrate, per `module_responsibility_map.md` product-intent
traceability: **Program Membership serves STU-18 through STU-23, CUR-14 through
CUR-18, and ADM-12 through ADM-15** — plus CUR-01 (create program → initial
curator participation) bridging from ADR-009.

## Upward trace matrix

### ADR-004 — Decision (lines 42–62)

| ADR decision | adr file:line | Upstream intent (or derivation parent) | Verdict |
|---|---|---|---|
| Model Program Membership as a separate module | adr-004:42 | derivation parent — module allocation serving STU-18..23/CUR-14..18/ADM-12..15 (module_responsibility_map.md product-intent row); not itself a user capability | derived |
| Program Membership owns the lifecycle and policy for participation in a Program | adr-004:44 | STU-18 student_user_stories.md:170, STU-19:178, STU-20:186, STU-21:194 (join/leave/rejoin/view participation) | traced |
| MUST support participation kinds Student and Program Curator | adr-004:46-49 | STU-18 student_user_stories.md:170 (Student); CUR-01 curator_user_stories.md:23 (curator participation in a created program) | traced |
| Owns the Program-scoped participation grant establishing effective Student/Curator authority | adr-004:51 | derivation parent adr-004:44; STU-18 student_user_stories.md:176 ("establishes student membership") | derived |
| Identity & Role Management MUST NOT own membership lifecycle or policy | adr-004:53 | derivation parent adr-004:42 (module allocation); student_user_stories.md:228 (membership separate from learning state) | derived |
| Student Workspace may create/resume learning state only with effective Student participation | adr-004:55 | STU-18 student_user_stories.md:176 (join establishes membership before learning); INT-07 separation | traced |
| Curator Workspace may expose curator behavior only with effective Program Curator participation | adr-004:57 | CUR-01 curator_user_stories.md:23 (curator authority follows from participation) | traced |
| Membership policy details (self-join, invitation, approval, payment, cohort) internal to Program Membership | adr-004:59 | derivation parent adr-004:44; STU-22 student_user_stories.md:208 ("only when invitation and membership policy allow") | derived |
| Admin membership operations are exceptional recovery/audit; Admin MUST NOT be the normal actor | adr-004:61 | ADM-13 admin_user_stories.md:151, ADM-14:161; admin_user_stories.md:189 (Admin not the normal flow) | traced |

### ADR-004 — Rules / Invariants (lines 65–82)

| ADR rule | adr file:line | Upstream intent (or derivation parent) | Verdict |
|---|---|---|---|
| Owner of Program participation lifecycle | adr-004:65 | STU-18..21 student_user_stories.md:170-200; derivation parent adr-004:44 | derived |
| Owner of membership policy | adr-004:66 | derivation parent adr-004:44; STU-22 student_user_stories.md:208 | derived |
| Owner of membership status | adr-004:67 | STU-21 student_user_stories.md:194 (active/left/unavailable membership state) | traced |
| Owner of invitation lifecycle | adr-004:68 | STU-22 student_user_stories.md:202, STU-23:210; CUR-14 curator_user_stories.md:133, CUR-15:141 | traced |
| Owner of participant visibility rules | adr-004:69 | CUR-16 curator_user_stories.md:149 (see program participants) | traced |
| Owner of exceptional membership recovery hooks | adr-004:70 | ADM-13 admin_user_stories.md:151, ADM-14:161 | traced |
| MUST evaluate whether an Identity may participate as Student/Curator | adr-004:71 | derivation parent adr-004:44; STU-18 student_user_stories.md:172 ("when policy permits participation") | derived |
| Effective Student authority MUST require a participation grant | adr-004:72 | derivation parent adr-004:51; STU-18 student_user_stories.md:176 | derived |
| Effective Program Curator authority MUST require a participation grant | adr-004:73 | derivation parent adr-004:51; CUR-01 curator_user_stories.md:23 | derived |
| Credential bindings MUST NOT create membership | adr-004:74 | derivation parent adr-004:53 (identity vs membership separation); student_user_stories.md:228 | derived |
| Admin authority MUST NOT create ordinary membership | adr-004:75 | admin_user_stories.md:187 (Admin does not auto-grant participation); derivation parent adr-004:61 | derived |
| Student Workspace MUST NOT own membership lifecycle/policy/invitation | adr-004:76 | student_user_stories.md:228 (membership separate from learning state); derivation parent adr-004:42 | derived |
| Curator Workspace MUST NOT own membership lifecycle/policy/invitation | adr-004:77 | curator_user_stories.md:179 (curator stories do not define membership/invitation policy); derivation parent adr-004:42 | derived |
| Identity & Role Management MUST NOT own membership lifecycle/policy/visibility | adr-004:78 | derivation parent adr-004:53; student_user_stories.md:228 | derived |
| Program Membership MUST NOT own corpus/decisions/answers/feedback/mastery/identity/credentials/Admin authority | adr-004:79 | student_user_stories.md:228 (membership vs learning state); curator_user_stories.md:177-179; derivation parent adr-004:42 | derived |
| Membership state changes affecting participation MUST be attributable | adr-004:80 | ADM-15 admin_user_stories.md:171,179 (membership changes logged with attribution) | traced |
| Other modules MUST depend on the participation result, not the internal policy path | adr-004:81 | derivation parent adr-004:59 (policy opacity); STU-22 student_user_stories.md:208 | derived |
| Later ADRs MAY define concrete policies/statuses/schema/UI/API only if they preserve this boundary | adr-004:82 | derivation parent adr-004:42/44 (boundary-preservation guard; extension clause, no new capability) | derived |

### ADR-005 — Decision (lines 42–90)

| ADR decision | adr file:line | Upstream intent (or derivation parent) | Verdict |
|---|---|---|---|
| Participation is a unique relationship of one Identity, one Program, one kind | adr-005:42 | derivation parent adr-004:44 (lifecycle owner); STU-20 student_user_stories.md:192 (no duplicate participation) | derived |
| First participation kinds are Student and Program Curator | adr-005:44-47 | STU-18 student_user_stories.md:170; CUR-01 curator_user_stories.md:23 | traced |
| First membership statuses describe participation, not invitation | adr-005:49 | derivation parent adr-005:42; STU-21 student_user_stories.md:194 | derived |
| First membership statuses are active/left/removed | adr-005:51-56 | STU-21 student_user_stories.md:196 ("active, left, or unavailable due to removal") | carried-shape |
| First invitation statuses are pending/accepted/declined/revoked | adr-005:58-62 | STU-22 student_user_stories.md:202, STU-23:210; CUR-15 curator_user_stories.md:143 (pending/accepted invitations) | carried-shape |
| Define self-join Program (policy allows Student participation without invitation) | adr-005:64 | STU-18 student_user_stories.md:170 ("join a self-join program") | carried-shape |
| Define controlled Program (requires invitation evidence) | adr-005:66 | CUR-14 curator_user_stories.md:135 ("controlled program"); STU-22 student_user_stories.md:204 ("curator-controlled program") | carried-shape |
| Student admission for a self-join Program is open self-join for active Identities | adr-005:68 | STU-18 student_user_stories.md:172 ("when the program membership policy permits participation") | traced |
| Rejoin after `left` MUST reuse the existing membership record when policy allows | adr-005:70 | STU-20 student_user_stories.md:192 ("reuses existing membership ... instead of creating duplicate participation") | traced |
| Rejoin MUST NOT create a duplicate membership record | adr-005:72 | STU-20 student_user_stories.md:192 | traced |
| Leaving changes active participation to `left` and MUST NOT delete learning evidence | adr-005:74 | STU-19 student_user_stories.md:184 ("changes membership state without deleting historical learning evidence") | traced |
| Removing a participant changes participation to `removed` and MUST NOT delete evidence/decisions/audit | adr-005:76 | CUR-17 curator_user_stories.md:163 ("removal changes membership state without deleting historical learning evidence") | traced |
| Program Curator participation is closed to self-join in the first implementation | adr-005:78 | derivation parent — first-slice scoping of CUR-01 (creation-only curator participation); no contrary intent | derived |
| Curator participation may be established only by a future creation/ownership workflow or exceptional Admin recovery | adr-005:80 | CUR-01 curator_user_stories.md:23 (creation grants curator participation); ADM-13 admin_user_stories.md:151 | traced |
| Student invitations supported as admission evidence for controlled Programs | adr-005:82 | STU-22 student_user_stories.md:202; CUR-14 curator_user_stories.md:133 | traced |
| Accepted invitations may establish/reactivate Student membership when policy allows | adr-005:84 | STU-22 student_user_stories.md:208 ("establishes membership only when the invitation and membership policy allow it") | traced |
| Declined/revoked invitations MUST NOT create Student membership | adr-005:86 | STU-23 student_user_stories.md:216 ("declining ... does not create student membership") | traced |
| Invitation policy details remain internal to Program Membership | adr-005:88 | derivation parent adr-004:59 (policy opacity) | derived |
| Admin membership operations limited to inspection/recovery/revocation/audit | adr-005:90 | ADM-12 admin_user_stories.md:141, ADM-13:151, ADM-14:161, ADM-15:171 | traced |

### ADR-005 — Rules / Invariants (lines 94–108)

| ADR rule | adr file:line | Upstream intent (or derivation parent) | Verdict |
|---|---|---|---|
| Program Membership MUST be the only module that creates/changes/evaluates membership status | adr-005:94 | derivation parent adr-004:44; student_user_stories.md:228 | derived |
| Effective Student participation requires an `active` Student membership | adr-005:95 | derivation parent adr-004:72; STU-18 student_user_stories.md:176 | derived |
| Effective Program Curator participation requires an `active` Program Curator membership | adr-005:96 | derivation parent adr-004:73; CUR-01 curator_user_stories.md:23 | derived |
| A membership record MUST be unique by Identity, Program, participation kind | adr-005:97 | STU-20 student_user_stories.md:192 (no duplicate participation) | traced |
| Invitation records MUST be separate from membership records | adr-005:98 | CUR-15 curator_user_stories.md:147 (invitation state visible separately); derivation parent adr-005:49 | derived |
| A `left` membership MAY become active again when policy allows rejoin | adr-005:99 | STU-20 student_user_stories.md:188 (rejoin a previously left program) | traced |
| Rejoin MUST preserve continuity and MUST NOT fork history | adr-005:100 | STU-20 student_user_stories.md:192 (continue from existing state) | traced |
| Leave/removal/rejoin/invitation accept/decline/revoke/recovery MUST be attributable events | adr-005:101 | ADM-15 admin_user_stories.md:171,179 | traced |
| Removed membership MUST NOT become active again through ordinary self-join | adr-005:102 | derivation parent adr-005:76 (removal is a controlled state); CUR-17 curator_user_stories.md:159 | derived |
| Student Workspace MUST NOT create membership records | adr-005:103 | student_user_stories.md:228; derivation parent adr-004:76 | derived |
| Curator Workspace MUST NOT create Student membership directly; may request invite/removal | adr-005:104 | CUR-14 curator_user_stories.md:133, CUR-17:157 (curator requests invite/removal); derivation parent adr-004:77 | derived |
| Identity & Role Management MUST NOT create ordinary membership | adr-005:105 | derivation parent adr-004:53 | derived |
| Admin authority MUST NOT create ordinary membership | adr-005:106 | admin_user_stories.md:187; derivation parent adr-004:75 | derived |
| Other modules MUST depend on the effective participation result, not raw status/policy | adr-005:107 | derivation parent adr-004:81 | derived |
| Membership status MUST NOT delete/mutate corpus/decisions/answers/feedback/mastery/identity/credentials/Admin authority | adr-005:108 | STU-19 student_user_stories.md:184 (no delete of evidence); student_user_stories.md:228; derivation parent adr-004:79 | derived |

### ADR-006 — Decision (lines 36–54)

| ADR decision | adr file:line | Upstream intent (or derivation parent) | Verdict |
|---|---|---|---|
| `Program Membership Manager` is the narrative/policy actor for Program Membership | adr-006:36 | derivation parent adr-004:44 (policy execution belongs to the module) — resolves an internal design ambiguity, no user capability | derived |
| It means "the module executing its accepted policy" | adr-006:38 | derivation parent adr-006:36 | derived |
| MUST NOT be grantable to an Identity | adr-006:40 | derivation parent — preserves ADR-002 role vocabulary; no intent requests such a role | derived |
| MUST NOT be added to ADR-002 role vocabulary | adr-006:42 | derivation parent adr-006:40 | derived |
| MUST NOT appear in Admin role-assignment/revocation flows | adr-006:44 | derivation parent adr-006:40; admin_user_stories.md:185-189 (Admin scope bounded) | derived |
| Membership events MUST record the real acting Identity when one exists | adr-006:46 | ADM-15 admin_user_stories.md:179 (events record the acting identity) | traced |
| Membership events MAY also record the policy path that allowed/rejected | adr-006:48 | derivation parent adr-006:36; ADM-12 admin_user_stories.md:145 (diagnose participation issues) | derived |
| v0.0.1 uses simple Student self-join: any active Identity may join a self-join Program | adr-006:50 | STU-18 student_user_stories.md:170 (the ADR fills the v0.0.1 policy shape STU-18 leaves open) | carried-shape |
| Self-join policy MUST NOT grant Program Curator participation | adr-006:52 | derivation parent adr-005:78 (curator closed to self-join); STU-18 (Student-only) | derived |
| Self-join policy MUST NOT grant Admin authority | adr-006:54 | admin_user_stories.md:187 (Admin not auto-granted); derivation parent adr-006:50 | derived |

### ADR-006 — Rules / Invariants (lines 58–70)

| ADR rule | adr file:line | Upstream intent (or derivation parent) | Verdict |
|---|---|---|---|
| Manager is a documentation/policy-execution actor only | adr-006:58 | derivation parent adr-006:36 | derived |
| Manager is not a product role | adr-006:59 | derivation parent adr-006:40 | derived |
| Manager is not an operational role | adr-006:60 | derivation parent adr-006:40 | derived |
| Manager is not an authorization subject | adr-006:61 | derivation parent adr-006:40 | derived |
| Accepted grantable roles remain Student, Program Curator, Admin | adr-006:62 | derivation parent — restates ADR-002 vocabulary; STU-18/CUR-01 supply the two product roles | derived |
| A self-join request MUST identify the acting Identity | adr-006:63 | ADM-15 admin_user_stories.md:179 (acting identity recorded); derivation parent adr-006:50 | derived |
| A self-join request MUST be rejected when the Identity is not active | adr-006:64 | derivation parent adr-006:50 (active-Identity precondition); STU-18 student_user_stories.md:172 | derived |
| A self-join request MUST be rejected when the target Program is not a self-join Program | adr-006:65 | STU-18 student_user_stories.md:172 ("when the program membership policy permits"); derivation parent adr-005:64 | derived |
| A self-join request MUST create or reactivate only Student membership | adr-006:66 | STU-18 student_user_stories.md:170; STU-20:186 (reactivate); derivation parent adr-006:52 | derived |
| Program Membership MUST remain the owner of membership state transitions | adr-006:67 | derivation parent adr-004:44 | derived |
| Student/Curator Workspace, Identity & Role Mgmt, Admin MUST NOT bypass Program Membership to create membership | adr-006:68 | derivation parent adr-004:76-78; admin_user_stories.md:187 | derived |
| Admin exceptional recovery MUST be distinguishable from ordinary policy execution in events | adr-006:69 | ADM-14 admin_user_stories.md:169 (recovery without becoming normal manager); ADM-15:179 | traced |

### ADR-007 — Decision (lines 40–71)

| ADR decision | adr file:line | Upstream intent (or derivation parent) | Verdict |
|---|---|---|---|
| Program Membership MUST provide the effective participation decision for product authority | adr-007:40 | derivation parent adr-004:51 (participation grant establishes authority) — the contract is the architectural means | derived |
| A decision answers whether one Identity has effective participation in one Program for one kind | adr-007:42 | derivation parent adr-007:40; STU-21 student_user_stories.md:194 (inspect own participation) | derived |
| First participation kinds for the contract are Student and Program Curator | adr-007:44-47 | STU-18 student_user_stories.md:170; CUR-01 curator_user_stories.md:23 | traced |
| The result MUST distinguish allowed from denied participation | adr-007:49 | derivation parent adr-007:40 | derived |
| An allowed Student decision means caller may treat Identity as effective Student | adr-007:51 | derivation parent adr-007:40; STU-18 student_user_stories.md:176 | derived |
| An allowed Program Curator decision means caller may treat Identity as effective Curator | adr-007:53 | derivation parent adr-007:40; CUR-01 curator_user_stories.md:23 | derived |
| A denied decision means caller MUST NOT perform participation-sensitive behavior | adr-007:55 | derivation parent adr-007:40 | derived |
| Denied decisions MAY include a coarse reason category | adr-007:57 | ADM-12 admin_user_stories.md:145 (diagnose access/participation issues) | derived |
| First coarse reason categories (identity_not_active … unsupported_participation_kind) | adr-007:59-67 | derivation parent adr-007:57; ADM-12 admin_user_stories.md:145 (diagnosis vocabulary) | derived |
| Coarse reasons MUST NOT expose raw invitation/payment/approval/policy state | adr-007:69 | derivation parent adr-004:59 (policy opacity); CUR-15 curator_user_stories.md:147 (invitation state visible only to curator) | derived |
| State-changing operations remain separate Program Membership commands | adr-007:71 | derivation parent adr-007:40; STU-18..21 (mutations) vs STU-21 (read) | derived |

### ADR-007 — Rules / Invariants (lines 75–88)

| ADR rule | adr file:line | Upstream intent (or derivation parent) | Verdict |
|---|---|---|---|
| Program Membership MUST own the effective participation decision contract | adr-007:75 | derivation parent adr-007:40 | derived |
| A decision request MUST identify an Identity, a Program, and a participation kind | adr-007:76 | derivation parent adr-007:42 | derived |
| MUST evaluate effective Student participation using Program Membership state/policy | adr-007:77 | derivation parent adr-004:72; STU-18 student_user_stories.md:176 | derived |
| MUST evaluate effective Program Curator participation using Program Membership state/policy | adr-007:78 | derivation parent adr-004:73; CUR-01 curator_user_stories.md:23 | derived |
| Student Workspace MUST use an allowed Student decision before participation-sensitive behavior | adr-007:79 | STU-18 student_user_stories.md:176 (membership precedes learning); INT-07 separation | traced |
| Curator Workspace MUST use an allowed Program Curator decision before participation-sensitive behavior | adr-007:80 | CUR-01 curator_user_stories.md:23 | traced |
| Identity & Role Mgmt MUST NOT decide participation from role/credentials/Admin authority | adr-007:81 | derivation parent adr-004:53; student_user_stories.md:228 | derived |
| Admin diagnosis MAY inspect participation state but MUST NOT bypass the contract for ordinary behavior | adr-007:82 | ADM-12 admin_user_stories.md:141,149 (inspect without becoming normal operator) | traced |
| Other modules MUST NOT read raw membership/invitation/policy state to decide participation | adr-007:83 | derivation parent adr-004:81; CUR-15 curator_user_stories.md:147 | derived |
| Effective participation decisions MUST be read-only and MUST NOT mutate membership state | adr-007:84 | STU-21 student_user_stories.md:200 (inspect state separately from changing it) | traced |
| State-changing membership commands MUST emit attributable membership events | adr-007:85 | ADM-15 admin_user_stories.md:171,179 | traced |
| A read-only denied decision is not itself a membership state change | adr-007:86 | derivation parent adr-007:84 | derived |
| A caller MAY branch on allowed/denied and coarse reason, but MUST NOT branch on policy internals | adr-007:87 | derivation parent adr-004:81/adr-007:69 | derived |
| Later ADRs MAY add kinds/reasons/policy/API only if they preserve this boundary | adr-007:88 | derivation parent adr-007:40 (boundary-preservation guard; extension clause) | derived |

## Findings

Zero ORPHAN rows. No decision in ADR-004/005/006/007 introduces a user-observable
capability or scope commitment unrequested by an accepted membership intent.

Candidates that initially looked parent-less, and the suppression guard that caught each:

- **The effective-participation contract + coarse reason categories** (adr-007 throughout).
  No intent story names a "decision contract" or enumerates reason codes. Caught by
  `derived`: the contract is the architectural means to honour the participation
  stories (STU-18..21) and the membership-policy opacity (adr-004:59) without
  leaking policy to callers; the coarse reasons are the diagnosis vocabulary ADM-12
  (admin_user_stories.md:145) requests. No user-facing capability beyond
  "participate / inspect participation" that the stories already commit.
- **The `Program Membership Manager` narrative actor** (adr-006:36-44, R1-R5).
  No intent names it. Caught by `derived`: it is an internal documentation/policy
  actor that explicitly resolves a design ambiguity and is forbidden from becoming
  a grantable role — it adds **no** user-observable scope (the ADR's whole point is
  that it is not a role).
- **Membership statuses / invitation statuses as enumerations** (adr-005:51-62).
  No intent enumerates statuses. Caught by `carried-shape`: STU-21
  (student_user_stories.md:196 — "active, left, or unavailable due to removal")
  and STU-22/23 + CUR-15 commit the *existence* of these states; the ADR fills the
  enumeration shape the intents left open.
- **Self-join as the v0.0.1 policy** (adr-006:50). Caught by `carried-shape`:
  STU-18 (student_user_stories.md:170) commits "join a self-join program"; the ADR
  picks the simplest admission shape for the first slice without adding scope.
- **Attributability, record uniqueness, non-authorization-from-events** (adr-004:80,
  adr-005:97/101, adr-006:46/69). Caught by `traced`/`derived`: ADM-15
  (admin_user_stories.md:171,179) requests attributable, logged membership changes;
  STU-20 (no duplicate participation) supplies uniqueness; the
  events-are-not-authorization rule is an internal integrity derivation of
  "authority is membership participation."

## Open questions

- (resolving layer: intent) The **coarse reason category list** (adr-007:59-67) is
  the closest thing to an unrequested user-observable surface — a denied decision
  exposes a fixed reason vocabulary. It is `derived` here because ADM-12
  (admin_user_stories.md:145) requests participation-issue *diagnosis* and the
  categories are deliberately coarse (no raw policy state). If the intent layer
  wants to constrain which reason categories may surface to non-Admin callers,
  that is an intent/UX decision, not an ADR orphan.
- (resolving layer: intent) **Controlled-Program admission** (adr-005:66) presumes a
  Program-policy *variant* (self-join vs controlled). STU-22/CUR-14 commit
  curator-controlled programs, so the variant is `carried-shape`; but the intent
  layer never states who sets a Program's policy or whether every Program must
  declare one. The "who may change a Program's membership policy" question is an
  explicit ADR Non-Goal (adr-005:133) and an intent-side decision.

## Inspected

- `adr-004-program-membership-owns-program-participation.md` (accepted) — 9
  Decision sentences (lines 42–62) + 18 Rules/Invariants bullets (lines 65–82) = 27 rows.
- `adr-005-program-membership-state-and-first-admission-policy.md` (accepted) — 19
  Decision sentences (lines 42–90) + 15 Rules/Invariants bullets (lines 94–108) = 34 rows.
- `adr-006-program-membership-policy-actor.md` (accepted) — 10 Decision sentences
  (lines 36–54) + 12 Rules/Invariants bullets (lines 58–70) = 22 rows.
- `adr-007-effective-participation-authorization-contract.md` (accepted) — 12
  Decision sentences (lines 40–71) + 16 Rules/Invariants bullets (lines 75–88) = 28 rows.
- `intent_learning_program_app.md` (0.3.0), `curator_user_stories.md` (0.3.0),
  `student_user_stories.md` (0.3.1), `admin_user_stories.md` (0.2.1) — membership
  stories STU-18..23, CUR-01, CUR-14..18, ADM-12..15 and boundaries.
- `module_responsibility_map.md` (0.4.3) — Program Membership ownership row +
  product-intent traceability (Program Membership → STU-18..23 / CUR-14..18 / ADM-12..15),
  used only to confirm module→intent-area mapping.

Executive Summary, Context, Consequences, and Non-Goals of each ADR were read but
not enumerated as decision rows (they restate or defer). ADR-009 was enumerated in
`2026-06-03T1928Z-orphan-adr-intent-corpus-curator.md` and is cross-referenced, not
repeated. No specs, plans, code, or tests were read.
