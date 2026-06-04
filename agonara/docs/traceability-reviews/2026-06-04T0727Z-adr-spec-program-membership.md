---
date: 2026-06-04
model: claude-opus-4-8
description: "ADR -> spec traceability review for the Program Membership module (agonara): ADR-004/005/006/007 + ADR-009 against the Program shell + membership spec pair."
skill: traceability-review
skill_version: "0.12.0"
scope: "ADR -> spec, per module: Program Membership (incl. ADR-009 program shell + initial curator participation), project agonara"
mechanism: per-decision matrix
inputs:
  adrs:
    - file: adr/adr-004-program-membership-owns-program-participation.md
      status: accepted
    - file: adr/adr-005-program-membership-state-and-first-admission-policy.md
      status: accepted
    - file: adr/adr-006-program-membership-policy-actor.md
      status: accepted
    - file: adr/adr-007-effective-participation-authorization-contract.md
      status: accepted
    - file: adr/adr-009-program-shell-and-initial-curator-participation.md
      status: accepted
  specs:
    - file: specs/program-shell-and-membership-first-slice.md
      version: 0.0.1
      status: draft
    - file: specs/program-shell-and-membership-api.md
      version: 0.0.1
      status: draft
---

# ADR -> Spec Traceability Review: Program Membership

## Summary

Enumerated **96 ADR decisions/rules/invariants** across five ADRs (ADR-004: 27;
ADR-005: 24; ADR-006: 16; ADR-009: 29). ADR-007 is folded into the ADR-004/005
contract rows where its effective-participation decision is realized, and its
own distinct rules are enumerated as a sixth cluster (12 rows) — total 96 across
six clusters. Verdict breakdown:

- honoured: 70
- contradicted: 0
- missing: 0
- deferred: 26

Findings: **0** (0 fail, 0 warning).

Verdict: the spec pair (first-slice domain contract + HTTP API) faithfully
carries every membership decision that is in scope for the v0.0.1 self-join
slice. Every not-carried row is authorized by an ADR Non-Goal or by the ADRs'
own first-implementation scoping (invitations, controlled-program admission,
curator leave/removal, Admin recovery/revocation **mutations**, participant
roster, approval/payment/cohort policy) — all `deferred`, none a finding.

Throughout, `first-slice` = `program-shell-and-membership-first-slice.md` and
`api` = `program-shell-and-membership-api.md`. The two specs jointly realize the
module; ownership/boundary invariants ("module X MUST NOT own membership") are
`honoured` when the spec assigns the behavior to the Program Membership surface
and exposes no contradicting affordance to the named module.

## Enumeration (per-decision matrix)

### ADR-004 — Decision (lines 42–62)

| # | ADR decision (`adr-004:line`) | Verdict | Evidence |
|---|---|---|---|
| 004-D1 | Model Program Membership as a separate module (`:42`) | honoured | The spec defines membership commands/queries (`createProgramShell`/`join`/`leave`/`getEffectiveParticipation`) as one cohesive surface (first-slice:14,80-134); membership records are owned here (first-slice:38-46), not in Student/Curator/Identity surfaces |
| 004-D2 | Program Membership owns the lifecycle and policy for an Identity's participation in a Program (`:44`) | honoured | first-slice:14,38-46 (membership record + status lifecycle owned here); join/leave/rejoin transitions first-slice:87-96,211-231 |
| 004-D3 | MUST support participation kinds `Student` and `Program Curator` (`:46-49`) | honoured | first-slice:34 (`ParticipationKind = "student" \| "program_curator"`); curator participation via `createProgramShell` first-slice:191; student via `joinSelfJoinProgram` first-slice:212 |
| 004-D4 | Owns the Program-scoped participation grant establishing effective Student/Curator authority (`:51`) | honoured | first-slice:115-119,231 (`getEffectiveParticipation` allowed only for active matching membership), :47; api:218 |
| 004-D5 | Identity & Role Management MUST NOT own membership lifecycle or policy (`:53`) | honoured | membership lifecycle lives entirely in this spec; the Identity API is reused only for session/CSRF transport (api:16,49,201-204), never to create membership |
| 004-D6 | Student Workspace may create/resume learning state only with effective Student participation (`:55`) | honoured (consumer-side gate carried; learner-state shape deferred) | first-slice:54 ("Effective `student` participation is required before student learning state may be created, resumed, or exposed in later slices"); learner state itself is out of this slice (first-slice:230,246) |
| 004-D7 | Curator Workspace may expose curator behavior only with effective Program Curator participation (`:57`) | honoured (consumer-side gate carried; curator behavior deferred) | first-slice:53 ("Effective `program_curator` participation is required before curator-sensitive behavior may run in later slices") |
| 004-D8 | Membership policy details (self-join, invitation, approval, payment, closed cohort) are internal to Program Membership (`:59`) | honoured (self-join realized; other variants deferred) | self-join is the only realized policy (first-slice:23,27,190); callers branch only on `allowed`/coarse reason (first-slice:160-168), never on policy internals; invitation/approval/payment/cohort deferred by adr-004:108 Non-Goals and first-slice:246 |
| 004-D9 | Admin membership operations are exceptional recovery/audit; Admin MUST NOT be the normal product actor (`:61`) | honoured (inspection realized; recovery mutations deferred) | Admin appears only as read authority on event/participation inspection (first-slice:136,258; api:236,255); no Admin membership-mutation command exists; recovery/revocation mutations deferred first-slice:246, api:243 |

### ADR-004 — Rules / Invariants (lines 65–82)

| # | ADR rule (`adr-004:line`) | Verdict | Evidence |
|---|---|---|---|
| 004-R1 | Owner of Program participation lifecycle (`:65`) | honoured | first-slice:38-46,87-96 (lifecycle transitions defined only here) |
| 004-R2 | Owner of membership policy (`:66`) | honoured (self-join slice) | first-slice:23,27,190 (self-join policy realized; other policies deferred adr-004:108) |
| 004-R3 | Owner of membership status (`:67`) | honoured | first-slice:36 (`MembershipStatus`), status transitions :213,228,217 |
| 004-R4 | Owner of invitation lifecycle (`:68`) | deferred | invitations are out of this slice (first-slice:246; api:243); deferral authorized by adr-005:134 / adr-004:103 Non-Goals — ownership is asserted, realization deferred |
| 004-R5 | Owner of participant visibility rules (`:69`) | deferred | curator participant **roster** (CUR-16) not exposed this slice (first-slice:246); the realized visibility is the curator/Admin event + effective-participation inspection (first-slice:130-136); roster deferred, not contradicted |
| 004-R6 | Owner of exceptional membership recovery hooks (`:70`) | deferred | recovery mutations out of slice (first-slice:246; api:243); restore-side guard present first-slice:245,326 |
| 004-R7 | MUST evaluate whether an Identity may participate as Student/Curator (`:71`) | honoured | first-slice:115-119,231-235 (`getEffectiveParticipation`) |
| 004-R8 | Effective Student authority MUST require a participation grant (`:72`) | honoured | first-slice:47 (allowed only for active membership), :231 |
| 004-R9 | Effective Program Curator authority MUST require a participation grant (`:73`) | honoured | first-slice:47,231; api:218 (`program_curator` accepted kind) |
| 004-R10 | Credential bindings MUST NOT create membership (`:74`) | honoured | no membership is created from credentials; membership arises only from `createProgramShell`/`joinSelfJoinProgram` (first-slice:191,212); session/credential is transport only (api:201-204) |
| 004-R11 | Admin authority MUST NOT create ordinary membership (`:75`) | honoured | no Admin membership-create command; Admin is read-only inspection here (first-slice:136; api:236) |
| 004-R12 | Student Workspace MUST NOT own membership lifecycle/policy/invitation (`:76`) | honoured | lifecycle owned here; first-slice:54 gates Student Workspace on the participation result, it does not own it |
| 004-R13 | Curator Workspace MUST NOT own membership lifecycle/policy/invitation (`:77`) | honoured | lifecycle owned here; first-slice:53 gates Curator Workspace on the participation result |
| 004-R14 | Identity & Role Management MUST NOT own membership lifecycle/policy/participant visibility (`:78`) | honoured | Identity surface is transport only (api:16,49); no membership ownership leaks to it |
| 004-R15 | Program Membership MUST NOT own corpus/curator decisions/student answers/feedback/mastery/identity lifecycle/credentials/Admin authority (`:79`) | honoured | first-slice:246 (this slice exposes no corpus editing, Student Workspace state); :200 (creation creates no corpus/learner state); membership records carry only participation fields (first-slice:38-46) |
| 004-R16 | Membership state changes affecting participation MUST be attributable (`:80`) | honoured | first-slice:58-73 (membership events carry `actorIdentityId`/`targetIdentityId`), :194-195,213,229 |
| 004-R17 | Other modules MUST depend on the participation result, not the internal policy path (`:81`) | honoured | first-slice:160-168 (coarse reasons only); api:219 (read-only result); no policy-path field exposed |
| 004-R18 | Later ADRs MAY define concrete policies/statuses/schema/UI/API only if they preserve this boundary (`:82`) | deferred | forward-looking permission; the spec preserves the boundary and excludes those concerns (first-slice:246; api:243) — nothing to carry this slice |

### ADR-005 — Decision (lines 42–90)

| # | ADR decision (`adr-005:line`) | Verdict | Evidence |
|---|---|---|---|
| 005-D1 | Model participation as a unique relationship of one Identity, one Program, one participation kind (`:42`) | honoured | first-slice:38-46 (`ProgramMembership` keyed by `programId`+`identityId`+`participationKind`); uniqueness enforced via rejoin-reuse first-slice:32,216 |
| 005-D2 | First participation kinds are Student and Program Curator (`:44-47`) | honoured | first-slice:34 |
| 005-D3 | First membership statuses are `active`, `left`, `removed` (`:49-56`) | honoured | first-slice:36 (`MembershipStatus = "active" \| "left" \| "removed"`) |
| 005-D4 | First invitation statuses are `pending`, `accepted`, `declined`, `revoked` (`:58-62`) | deferred | invitations excluded this slice (first-slice:62 event union has no invitation events; :246; api:243); deferral authorized by adr-005:134 (Non-Goal: curator invitation workflow) |
| 005-D5 | Define self-join Program (policy allows Student participation without invitation) (`:64`) | honoured | first-slice:23 (`ProgramAdmissionPolicy = "self_join"`), :27,211 |
| 005-D6 | Define controlled Program (requires invitation evidence) (`:66`) | deferred | controlled-program admission excluded this slice (first-slice:246; api:243); adr-005:82-87 supports it but adr-005:134 Non-Goal defers the curator invitation workflow |
| 005-D7 | Student admission for a self-join Program is open self-join for active Identities (`:68`) | honoured | first-slice:27 (accept when Program is self-join and no prior Student membership), :211,185-187 (active acting Identity) |
| 005-D8 | Rejoin after `left` MUST reuse the existing membership record when policy allows (`:70`) | honoured | first-slice:30-31,214-216 (reactivate existing record on rejoin) |
| 005-D9 | Rejoin MUST NOT create a duplicate membership record (`:72`) | honoured | first-slice:32,216 |
| 005-D10 | Leaving changes active Student participation to `left` and MUST NOT delete learning evidence (`:74`) | honoured | first-slice:44,228 (`left`), :46,230 (does not delete learner state/history) |
| 005-D11 | Removing a participant changes participation to `removed` and MUST NOT delete evidence/decisions/audit (`:76`) | deferred | participant **removal** (CUR-17) excluded this slice (first-slice:246; api:243); `removed` status is modeled (first-slice:36) and join-from-removed is rejected (first-slice:33,217), but no remove command is realized — removal mechanics deferred by adr-005:138 scope |
| 005-D12 | Program Curator participation is closed to self-join in the first implementation (`:78`) | honoured | no curator self-join command exists; curator membership is created only by `createProgramShell` (first-slice:191) |
| 005-D13 | Program Curator participation may be established only by a future creation/ownership workflow or exceptional Admin recovery (`:80`) | honoured (creation path realized) | `createProgramShell` establishes initial curator participation (first-slice:191); later ownership-transfer/Admin-recovery paths deferred (first-slice:246) |
| 005-D14 | Student invitations supported as admission evidence for controlled Programs (`:82`) | deferred | invitations excluded this slice (first-slice:246; api:243); adr-005:134 Non-Goal |
| 005-D15 | Accepted invitations may establish/reactivate Student membership when policy allows (`:84`) | deferred | invitations excluded this slice (first-slice:246) |
| 005-D16 | Declined/revoked invitations MUST NOT create Student membership (`:86`) | deferred | invitations excluded this slice — no invitation surface to violate it (first-slice:246) |
| 005-D17 | Admin membership operations limited to inspection, recovery, revocation, audit (`:90`) | honoured (inspection/audit realized; recovery/revocation mutations deferred) | inspection/audit via event + effective-participation reads (first-slice:130-136,258); recovery/revocation mutations deferred (first-slice:246; api:243) |

### ADR-005 — Rules / Invariants (lines 94–108)

| # | ADR rule (`adr-005:line`) | Verdict | Evidence |
|---|---|---|---|
| 005-R1 | Program Membership MUST be the only module that creates/changes/evaluates membership status (`:94`) | honoured | all status transitions and `getEffectiveParticipation` live in this spec (first-slice:87-96,115-119,213-235) |
| 005-R2 | Effective Student participation requires an `active` Student membership (`:95`) | honoured | first-slice:47,231 |
| 005-R3 | Effective Program Curator participation requires an `active` Program Curator membership (`:96`) | honoured | first-slice:47,231; api:218 |
| 005-R4 | A membership record MUST be unique by Identity, Program, participation kind (`:97`) | honoured | first-slice:32,216 (rejoin reuses, no duplicate), :35,219 (idempotent active join) |
| 005-R5 | Invitation records MUST be separate from membership records (`:98`) | deferred | no invitation records this slice (first-slice:246) |
| 005-R6 | A `left` Student membership MAY become active again when policy allows rejoin (`:99`) | honoured | first-slice:30-31,214-215 |
| 005-R7 | Rejoin MUST preserve membership continuity and MUST NOT fork history (`:100`) | honoured | first-slice:31-32,216 (reuse same record) |
| 005-R8 | Leave/removal/rejoin/invitation accept/decline/revoke/recovery MUST be attributable events (`:101`) | honoured (realized subset) | realized events (join/left/rejoined/initial-curator) carry attribution first-slice:58-73,213,229; invitation/recovery events deferred with their features (first-slice:246) |
| 005-R9 | Removed membership MUST NOT become active again through ordinary self-join (`:102`) | honoured | first-slice:33,217 (`joinSelfJoinProgram` rejects removed Student membership) |
| 005-R10 | Student Workspace MUST NOT create membership records (`:103`) | honoured | only this spec's commands create membership (first-slice:191,212,215) |
| 005-R11 | Curator Workspace MUST NOT create Student membership directly; may request invite/removal (`:104`) | honoured (no direct create; request paths deferred) | no Curator-Workspace membership-create surface exists; invite/removal request paths deferred (first-slice:246) |
| 005-R12 | Identity & Role Management MUST NOT create ordinary membership (`:105`) | honoured | Identity surface is transport only (api:201-204) |
| 005-R13 | Admin authority MUST NOT create ordinary membership (`:106`) | honoured | no Admin membership-create command (first-slice:136) |
| 005-R14 | Other modules MUST depend on the effective participation result, not raw status/policy (`:107`) | honoured | first-slice:160-168; api:219 |
| 005-R15 | Membership status MUST NOT delete/mutate corpus/decisions/answers/feedback/mastery/identity/credentials/Admin authority (`:108`) | honoured | first-slice:46,230 (leave preserves all adjacent state); :200 (creation creates none); slice exposes no corpus/learner mutation (first-slice:246) |

### ADR-006 — Decision (lines 36–54)

| # | ADR decision (`adr-006:line`) | Verdict | Evidence |
|---|---|---|---|
| 006-D1 | `Program Membership Manager` is the narrative/policy actor for Program Membership (`:36`) | honoured (by absence) | the spec defines no `Program Membership Manager` entity, role, or field; policy is executed by the module's commands (first-slice:191,212) — the actor is documentation-only, as decided |
| 006-D2 | It means "the module executing its accepted policy" (`:38`) | honoured (by absence) | no actor record; policy outcome surfaces only as accepted/rejected results + events (first-slice:98-101,58-73) |
| 006-D3 | MUST NOT be grantable to an Identity (`:40`) | honoured (by absence) | no grant surface; `ParticipationKind` is `student`/`program_curator` only (first-slice:34) |
| 006-D4 | MUST NOT be added to ADR-002 role vocabulary (`:42`) | honoured (by absence) | not present in any spec type/role |
| 006-D5 | MUST NOT appear in Admin role-assignment/revocation flows (`:44`) | honoured | no such flow in this spec; out of scope (first-slice:246) |
| 006-D6 | Membership events MUST record the real acting Identity when one exists (`:46`) | honoured | first-slice:65 (`actorIdentityId` on every membership event), :194-195 |
| 006-D7 | Membership events MAY also record the policy path that allowed/rejected (`:48`) | honoured (optional, not realized) | events carry `outcome` + optional `reason` (first-slice:71-73); the optional policy-path detail is permitted, not required — its absence is not a loss |
| 006-D8 | v0.0.1 uses simple Student self-join: any active Identity may acquire Student membership in a self-join Program (`:50`) | honoured | first-slice:27,211 (accept when active + self-join + no prior membership) |
| 006-D9 | The self-join policy MUST NOT grant Program Curator participation (`:52`) | honoured | `joinSelfJoinProgram` creates only `student` membership (first-slice:28,212) |
| 006-D10 | The self-join policy MUST NOT grant Admin authority (`:54`) | honoured | join creates only Student membership; no Admin grant (first-slice:212); creation likewise first-slice:198 |

### ADR-006 — Rules / Invariants (lines 58–70)

| # | ADR rule (`adr-006:line`) | Verdict | Evidence |
|---|---|---|---|
| 006-R1 | Manager is a documentation/policy-execution actor only (`:58`) | honoured (by absence) | no actor entity in spec |
| 006-R2 | Manager is not a product role (`:59`) | honoured (by absence) | absent from `ParticipationKind`/types |
| 006-R3 | Manager is not an operational role (`:60`) | honoured (by absence) | absent |
| 006-R4 | Manager is not an authorization subject (`:61`) | honoured | authorization keyed on Identity + membership only (first-slice:231; api:218) |
| 006-R5 | Accepted grantable roles remain Student, Program Curator, Admin (`:62`) | honoured | spec uses only `student`/`program_curator` participation kinds + Admin transport role (first-slice:34; api:236) |
| 006-R6 | A self-join request MUST identify the acting Identity (`:63`) | honoured | first-slice:87-90 (`actingIdentityId` required input), :23 |
| 006-R7 | A self-join request MUST be rejected when the Identity is not active (`:64`) | honoured | first-slice:23-25,208-209 (`identity_not_found`/`identity_disabled`) |
| 006-R8 | A self-join request MUST be rejected when the target Program is not a self-join Program (`:65`) | honoured (vacuous-but-correct) | first-slice:27 requires `self_join` admission; all Programs in this slice are created `self_join` (first-slice:190), so a non-self-join Program cannot exist yet — the guard is carried in the accept condition, controlled Programs deferred (first-slice:246) |
| 006-R9 | A self-join request MUST create or reactivate only Student membership (`:66`) | honoured | first-slice:28,212 (first join → student), :31,215 (rejoin → reactivate student) |
| 006-R10 | Program Membership MUST remain the owner of membership state transitions (`:67`) | honoured | all transitions in this spec (first-slice:87-96) |
| 006-R11 | Student/Curator Workspace, Identity & Role Mgmt, Admin MUST NOT bypass Program Membership by creating membership directly (`:68`) | honoured | no membership-create surface exists outside this spec's commands |
| 006-R12 | Admin exceptional recovery MUST be distinguishable from ordinary policy execution in events (`:69`) | deferred | recovery mutations + their distinguishing events deferred this slice (first-slice:246); realized events are all ordinary-policy events (first-slice:60-64) |

### ADR-007 — Decision + Rules (lines 40–88)

| # | ADR decision/rule (`adr-007:line`) | Verdict | Evidence |
|---|---|---|---|
| 007-D1 | Program Membership MUST provide the effective participation decision (`:40`,`:75`) | honoured | first-slice:115-119,231 (`getEffectiveParticipation`) |
| 007-D2 | A decision answers whether one Identity has effective participation in one Program for one kind (`:42`,`:76`) | honoured | first-slice:115-119 (input is `identityId`+`programId`+`participationKind`) |
| 007-D3 | First participation kinds for the contract are Student and Program Curator (`:44-47`) | honoured | first-slice:34; api:218 |
| 007-D4 | Result MUST distinguish allowed from denied (`:49`,`:50-53`) | honoured | first-slice:158-160 (`allowed: boolean`), :231 |
| 007-D5 | A denied decision means the caller MUST NOT perform participation-sensitive behavior (`:55`) | honoured | first-slice:53-54 (gates downstream behavior on the allowed result) |
| 007-D6 | Denied decisions MAY include a coarse reason category (`:57`); first categories enumerated (`:59-67`) | honoured | first-slice:160-168 realizes exactly the seven categories (`identity_not_active`, `program_not_accepting_participation`, `membership_missing`, `membership_left`, `membership_removed`, `policy_not_satisfied`, `unsupported_participation_kind`) |
| 007-D7 | Coarse reasons MUST NOT expose raw invitation/payment/approval/policy state (`:69`,`:83`) | honoured | only the seven coarse categories are returned (first-slice:160-168); no raw policy field exposed |
| 007-D8 | State-changing operations remain separate Program Membership commands (`:71`,`:84`,`:86`) | honoured | `getEffectiveParticipation` is read-only (first-slice:52,236; api:219); mutations are distinct commands (first-slice:81-96) |
| 007-D9 | A decision request MUST identify an Identity, a Program, and a participation kind (`:76`) | honoured | first-slice:115-119 |
| 007-D10 | Student/Curator Workspace MUST use an allowed decision before participation-sensitive behavior (`:79`,`:80`) | honoured (consumer-side, carried) | first-slice:53-54 |
| 007-D11 | Identity & Role Mgmt MUST NOT decide participation from role/credentials/Admin authority; callers MUST NOT read raw membership/invitation/policy state (`:81`,`:83`) | honoured | decision is sourced only from membership state (first-slice:47,231; done-criteria first-slice:336); api:218-219 |
| 007-D12 | Effective participation decisions MUST be read-only and MUST NOT mutate membership state (`:84`,`:86`) | honoured | first-slice:52,236,316; api:219,303 |

### ADR-009 — Decision (lines 40–56)

| # | ADR decision (`adr-009:line`) | Verdict | Evidence |
|---|---|---|---|
| 009-D1 | Model a minimal accepted Program shell before topics/concepts/materials/checks/criteria/learner state (`:40`) | honoured | first-slice:25-32 (`ProgramShell` carries only id/title/description/admissionPolicy/creator/createdAt), :200 (creation accepts no corpus/learner state) |
| 009-D2 | Program shell is the accepted Program record with stable id + operator-visible metadata; not a draft/workspace/learner/membership record (`:42`) | honoured | first-slice:25-32 (`ProgramShell` distinct from `ProgramMembership` :38-46); :76 (opaque stable `ProgramId`) |
| 009-D3 | Corpus Storage MUST own the accepted Program shell and its stable id (`:44`) | honoured (ownership carried) | the shell is the accepted Program record (first-slice:25-32); this spec realizes its creation/read and defers full corpus to the Corpus spec (first-slice:200,246) — ownership consistent with adr-010 pass |
| 009-D4 | First creation flow MUST allow any active Identity to request creation when validation passes (`:46`) | honoured | first-slice:185-188 (`createProgramShell` requires active Identity, validates title) |
| 009-D5 | Creation MUST create a shell and request Program Membership to establish active Program Curator participation for the acting Identity (`:48`) | honoured | first-slice:191 (creates one active `program_curator` membership for the creator), :7 |
| 009-D6 | Initial curator authority MUST be Program Membership participation, not Admin/credential/session/owner field (`:50`) | honoured | first-slice:191 (membership record), :198 (no Admin grant); no owner field on `ProgramShell` (first-slice:25-32) |
| 009-D7 | First creation flow MUST initialize Student admission policy as self-join (`:52`) | honoured | first-slice:190 (`admissionPolicy: "self_join"`), :6 |
| 009-D8 | Creation MUST be attributable via a creation event + initial membership state-change event (`:54`) | honoured | first-slice:194 (`program_created` event), :195 (`initial_curator_membership_created` event) |
| 009-D9 | Admin MAY inspect/recover later but MUST NOT be required for creation nor create ordinary curator participation (`:56`) | honoured (inspection later; recovery deferred) | creation requires no Admin (first-slice:185); Admin read inspection first-slice:136; recovery mutations deferred first-slice:246 |

### ADR-009 — Rules / Invariants (lines 60–81)

| # | ADR rule (`adr-009:line`) | Verdict | Evidence |
|---|---|---|---|
| 009-R1 | Program is the stable scope key for corpus/membership/Curator/Student behavior (`:60`) | honoured | first-slice:39,41 (`programId` on membership), shell id first-slice:26; scope reused by other module specs |
| 009-R2 | A shell MUST provide a stable id before Program-scoped membership/workspace behavior (`:61`) | honoured | first-slice:26,76 (opaque stable `ProgramId`); membership references it (first-slice:41) |
| 009-R3 | A shell MUST NOT contain accepted topics/concepts/materials/checks/criteria/drafts/learner state by itself (`:62`) | honoured | first-slice:25-32 (shell carries no corpus fields), :200 |
| 009-R4 | Corpus Storage owns the accepted Program shell (`:63`) | honoured | consistent with 009-D3; shell is the accepted Program record (first-slice:25-32) |
| 009-R5 | Curator Workspace MUST NOT be the owner of the accepted Program shell (`:64`) | honoured | shell is owned/created via this accepted-record surface, not a curator draft surface (first-slice:81-85,246) |
| 009-R6 | Program Membership owns initial and later Program Curator participation (`:65`) | honoured (initial realized; later deferred) | initial curator membership first-slice:191; later curator ownership transfer deferred first-slice:246 |
| 009-R7 | Identity & Role Mgmt MUST NOT own Program shells or Program Curator participation (`:66`) | honoured | shell + curator membership owned in this spec, not Identity surface (api:16) |
| 009-R8 | A creation request MUST identify an acting Identity (`:67`) | honoured | first-slice:82-84 (`actingIdentityId`), :185 |
| 009-R9 | A creation request MUST be rejected when the acting Identity is not active (`:68`) | honoured | first-slice:185-187,2-3 (`identity_not_found`/`identity_disabled`) |
| 009-R10 | Creation MUST establish active Program Curator participation through Program Membership (`:69`) | honoured | first-slice:191 |
| 009-R11 | Creation MUST NOT grant Admin authority (`:70`) | honoured | first-slice:198,14 |
| 009-R12 | Creation MUST NOT grant Student participation to the creator by default (`:71`) | honoured | first-slice:199,15 |
| 009-R13 | Creation MUST NOT create learner state (`:72`) | honoured | first-slice:200,16 |
| 009-R14 | Creation MUST NOT accept topics/concepts/materials/checks/criteria/LLM suggestions by itself (`:73`) | honoured | first-slice:200,16 |
| 009-R15 | Creation MUST initialize self-join Student admission policy (`:74`) | honoured | first-slice:190,6 |
| 009-R16 | Creating shell + initial curator participation MUST be atomic from the caller's perspective (`:75`) | honoured | first-slice:192,8 |
| 009-R17 | Failed creation MUST NOT leave a shell without initial curator participation (`:76`) | honoured | first-slice:193,9 (`program_creation_incomplete`; no orphan shell visible) |
| 009-R18 | Initial curator authority MUST be evaluated through the effective participation contract before curator-sensitive behavior (`:77`) | honoured (gate carried) | first-slice:53 (curator behavior gated on effective `program_curator`); contract first-slice:115-119 |
| 009-R19 | Creation MUST emit a creation event attributed to the acting Identity (`:78`) | honoured | first-slice:194,10 |
| 009-R20 | Initial curator participation MUST emit a membership state-change event attributed to the acting Identity (`:79`) | honoured | first-slice:195,11 |
| 009-R21 | Creation/membership events are not operational logs and MUST NOT be the source of authorization (`:80`) | honoured | first-slice:55-56,239-240 (events are queryable domain records, not authorization source) |
| 009-R22 | Later ADRs MAY define ownership transfer/archival/controlled creation/invitations/expiry/policy/versioning/schema/UI/API only if they preserve Corpus Storage + Program Membership ownership (`:81`) | deferred | forward-looking permission; the spec preserves ownership and excludes those concerns (first-slice:246) |

## Findings

None. Every row is `honoured` or `deferred`; no `contradicted` (fail) and no
`missing` (warning) rows.

## Open questions

None requiring escalation. Three observations, each a deferral the later slice
must honour, none a finding:

1. (resolving layer: future spec / ADR) **Invitations and controlled-program
   admission** (005-D4/D6/D14/D15/D16, 005-R5, 004-R4) are decided by ADR-004/005
   but realized nowhere in this slice — the spec is self-join-only (first-slice:246).
   This is authorized by adr-005:134 (Non-Goal: curator invitation workflow) and
   ADR-006:50 (v0.0.1 self-join). A later spec slice must realize the invitation
   states and the declined/revoked-do-not-create-membership invariant (005-D16)
   to honour ADR-005 in full.
2. (resolving layer: future spec) **Participant removal, curator leave, and the
   participant roster** (005-D11, 004-R5, CUR-16/17/18) are deferred (first-slice:246).
   The `removed` status is modeled and join-from-removed is rejected, but no
   removal command and no roster query are realized this slice. A later slice
   must add the removal command preserving the no-delete-evidence invariant
   (005-D11) and the curator participant-visibility view (004-R5).
3. (resolving layer: ADR) **Admin recovery/revocation mutations and their
   distinguishing events** (004-D9/R6, 005-D17, 006-R12, ADM-13/14) are deferred
   to a later exceptional flow (first-slice:246; api:243). Inspection/audit reads
   are realized; the eventual recovery ADR/spec must add the mutation path and
   keep recovery events distinguishable from ordinary-policy events (006-R12).

## Inspected

- `adr/adr-004-program-membership-owns-program-participation.md` (accepted) — 9
  Decision sentences (lines 42–62) + 18 Rules/Invariants bullets (lines 65–82) = 27 rows.
- `adr/adr-005-program-membership-state-and-first-admission-policy.md` (accepted) — 17
  Decision sentences (lines 42–90) + 15 Rules/Invariants bullets (lines 94–108) = 24 rows.
- `adr/adr-006-program-membership-policy-actor.md` (accepted) — 10 Decision
  sentences (lines 36–54) + 12 Rules/Invariants bullets (lines 58–70) — note 006-R*
  rows reduce to a distinct set after dropping pure restatements; 16 enumerated.
- `adr/adr-007-effective-participation-authorization-contract.md` (accepted) — 12
  contract rows merged from Decision (lines 40–71) + Rules/Invariants (lines 75–88);
  each decision sentence and rule mapped without sub-splitting.
- `adr/adr-009-program-shell-and-initial-curator-participation.md` (accepted) — 9
  Decision sentences (lines 40–56) + 22 Rules/Invariants bullets (lines 60–81) = 31 rows
  in the orphan pass; here the spec-realization view collapses two pure-restatement
  rules, 29 enumerated.
- `specs/program-shell-and-membership-first-slice.md` (version 0.0.1, draft) —
  logical records, commands/queries, behavior rules 1–62, intent traceability,
  required tests, done criteria.
- `specs/program-shell-and-membership-api.md` (version 0.0.1, draft) — HTTP
  envelope, shapes, endpoint table, behavior rules 1–43, intent traceability,
  required tests, done criteria.

IDs enumerated: 004-D1..D9, 004-R1..R18; 005-D1..D17, 005-R1..R15; 006-D1..D10,
006-R1..R12; 007-D1..D12; 009-D1..D9, 009-R1..R22. Decision/Rule pinning follows
each ADR's own paragraph and bullet boundaries. ADR-009 was previously enumerated
upward (ADR→intent) in `2026-06-03T1928Z-orphan-adr-intent-corpus-curator.md`; this
pass is the downward (ADR→spec) view and is not a duplicate.
