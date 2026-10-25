---
date: 2026-06-04
model: gpt-5
description: "Spec: Agonara Program Membership invitations, participant management, and exceptional recovery."
version: 0.0.1
status: implemented
type: spec
---

# Program Membership Invitations and Recovery

## Goal

Define the Program Membership contract for Student invitations, participant visibility, Student removal, curator leave, and exceptional Admin recovery or revocation while preserving Program Membership as the sole owner of Program participation lifecycle.

## Implementation status

Implemented in the Program Membership Invitations and Recovery plan:

- Plan archive: [Program Membership Invitations and Recovery Implementation Plan](../plans/implemented/program-membership-invitations-and-recovery.md)
- Storage and backup/restore coverage: [storage.test.js](../../tests/storage.test.js), [backup-restore.test.js](../../tests/backup-restore.test.js)
- Program Membership domain coverage: [program.test.js](../../tests/program.test.js)
- HTTP and executable acceptance coverage: [http-api-program-membership-control.test.js](../../tests/http-api-program-membership-control.test.js), [executable-acceptance.test.js](../../tests/executable-acceptance.test.js)
- Browser coverage: [program-membership-invitations-and-recovery.playwright.js](../../tests/program-membership-invitations-and-recovery.playwright.js)
- Runtime surfaces: [Program domain service](../../src/program.js), [HTTP adapter](../../src/server.js), [`/learn` product UI](../../src/learn-ui.js), [`/admin` operations UI](../../src/admin-ui.js), [Storage backup/restore](../../src/storage.js)

The implemented first slice supports the Student-targeted invitation lifecycle, Student self-join rejection for invitation-only Programs, participant listing, Student removal, curator leave with last-curator protection, Admin-only exceptional recovery/revocation with required reasons, membership event inspection, backup/restore preservation, and role-separated `/learn` and `/admin` workflows. It does not implement payment, cohorts, organizations, external email delivery, notifications, invitation expiry, ownership transfer, curator invitations, resource-level permissions, recommendation ranking, analytics, LLM/provider calls, or Admin as a normal Program participation operator.

## Public interface

This spec extends [Program Shell and Membership First Slice](program-shell-and-membership-first-slice.md) and [Program Shell and Membership API](program-shell-and-membership-api.md). It operationalizes [ADR-004](../adr/adr-004-program-membership-owns-program-participation.md), [ADR-005](../adr/adr-005-program-membership-state-and-first-admission-policy.md), [ADR-006](../adr/adr-006-program-membership-policy-actor.md), and [ADR-007](../adr/adr-007-effective-participation-authorization-contract.md).

### Shared kinds

```ts
type ProgramAdmissionPolicy = "self_join" | "invitation_only";

type ParticipationKind = "student" | "program_curator";

type MembershipStatus = "active" | "left" | "removed";

type ProgramInvitationStatus = "pending" | "accepted" | "declined" | "revoked";

type ProgramMembershipPolicyPath =
  | "self_join"
  | "curator_invitation"
  | "curator_removal"
  | "curator_leave"
  | "admin_exceptional_recovery"
  | "admin_exceptional_revocation";
```

### Logical records

```ts
type ProgramInvitation = {
  invitationId: ProgramInvitationId;
  programId: ProgramId;
  targetIdentityId: IdentityId;
  participationKind: "student";
  status: ProgramInvitationStatus;
  invitedByIdentityId: IdentityId;
  createdAt: Instant;
  updatedAt: Instant;
  statusChangedByIdentityId?: IdentityId;
  statusChangedAt?: Instant;
};

type ProgramParticipantSummary = {
  programId: ProgramId;
  identityId: IdentityId;
  participationKind: ParticipationKind;
  status: MembershipStatus;
  updatedAt: Instant;
};

type ProgramInvitationSummary = {
  invitationId: ProgramInvitationId;
  programId: ProgramId;
  targetIdentityId: IdentityId;
  participationKind: "student";
  status: ProgramInvitationStatus;
  invitedByIdentityId: IdentityId;
  createdAt: Instant;
  updatedAt: Instant;
};

type ProgramMembershipEvent = {
  id: ProgramMembershipEventId;
  eventType:
    | "program_admission_policy_changed"
    | "student_invitation_created"
    | "student_invitation_accepted"
    | "student_invitation_declined"
    | "student_invitation_revoked"
    | "student_membership_removed"
    | "curator_membership_left"
    | "membership_exceptionally_recovered"
    | "membership_exceptionally_revoked";
  actorIdentityId: IdentityId;
  targetIdentityId: IdentityId;
  programId: ProgramId;
  participationKind: ParticipationKind;
  policyPath: ProgramMembershipPolicyPath;
  resultingStatus?: MembershipStatus;
  invitationStatus?: ProgramInvitationStatus;
  occurredAt: Instant;
  outcome: "accepted" | "rejected";
  reason?: ProgramMembershipRejectionReason;
};
```

Invitation records are separate from membership records. An accepted invitation is admission evidence, not authority by itself. Effective participation still depends on an active membership.

### Commands

```ts
setProgramAdmissionPolicy(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  admissionPolicy: ProgramAdmissionPolicy;
}) -> SetProgramAdmissionPolicyResult

createProgramInvitation(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  targetIdentityId: IdentityId;
  participationKind: "student";
}) -> CreateProgramInvitationResult

acceptProgramInvitation(input: {
  actingIdentityId: IdentityId;
  invitationId: ProgramInvitationId;
}) -> AcceptProgramInvitationResult

declineProgramInvitation(input: {
  actingIdentityId: IdentityId;
  invitationId: ProgramInvitationId;
}) -> DeclineProgramInvitationResult

revokeProgramInvitation(input: {
  actingIdentityId: IdentityId;
  invitationId: ProgramInvitationId;
}) -> RevokeProgramInvitationResult

removeProgramParticipant(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  targetIdentityId: IdentityId;
  participationKind: "student";
}) -> RemoveProgramParticipantResult

leaveCuratorProgram(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
}) -> LeaveCuratorProgramResult

recoverProgramMembership(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  targetIdentityId: IdentityId;
  participationKind: ParticipationKind;
  recoveryReason: string;
}) -> RecoverProgramMembershipResult

revokeProgramMembership(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  targetIdentityId: IdentityId;
  participationKind: ParticipationKind;
  revocationReason: string;
}) -> RevokeProgramMembershipResult
```

### Queries

```ts
listProgramInvitations(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  status?: ProgramInvitationStatus;
}) -> ListProgramInvitationsResult

listMyProgramInvitations(input: {
  actingIdentityId: IdentityId;
  status?: ProgramInvitationStatus;
}) -> ListMyProgramInvitationsResult

listProgramParticipants(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  participationKind?: ParticipationKind;
  status?: MembershipStatus;
}) -> ListProgramParticipantsResult
```

### HTTP endpoints

| Method | Path | Auth | Accepted response |
|---|---|---|---|
| `PATCH` | `/programs/{programId}/admission-policy` | Program Curator session and CSRF header | `AcceptedResult<{ program: ProgramShellSummary }>` |
| `POST` | `/programs/{programId}/invitations` | Program Curator session and CSRF header | `AcceptedResult<{ invitation: ProgramInvitationSummary }>` |
| `GET` | `/programs/{programId}/invitations?status={status}` | Program Curator session | `AcceptedResult<{ invitations: ProgramInvitationSummary[] }>` |
| `GET` | `/program-invitations/me?status={status}` | Student session | `AcceptedResult<{ invitations: ProgramInvitationSummary[] }>` |
| `POST` | `/program-invitations/{invitationId}/acceptance` | Target Student session and CSRF header | `AcceptedResult<{ invitation: ProgramInvitationSummary; membership: ProgramMembershipSummary }>` |
| `POST` | `/program-invitations/{invitationId}/decline` | Target Student session and CSRF header | `AcceptedResult<{ invitation: ProgramInvitationSummary }>` |
| `POST` | `/program-invitations/{invitationId}/revocation` | Program Curator session and CSRF header | `AcceptedResult<{ invitation: ProgramInvitationSummary }>` |
| `GET` | `/programs/{programId}/participants?participationKind={kind}&status={status}` | Program Curator or Admin session | `AcceptedResult<{ participants: ProgramParticipantSummary[] }>` |
| `DELETE` | `/programs/{programId}/participants/student/{identityId}` | Program Curator session and CSRF header | `AcceptedResult<{ membership: ProgramMembershipSummary }>` |
| `DELETE` | `/programs/{programId}/curator-membership` | Program Curator session and CSRF header | `AcceptedResult<{ membership: ProgramMembershipSummary }>` |
| `POST` | `/admin/program-memberships/recovery` | Admin session and CSRF header | `AcceptedResult<{ membership: ProgramMembershipSummary }>` |
| `POST` | `/admin/program-memberships/revocation` | Admin session and CSRF header | `AcceptedResult<{ membership: ProgramMembershipSummary }>` |

### Rejection reasons

```ts
type ProgramMembershipRejectionReason =
  | "identity_not_found"
  | "identity_disabled"
  | "target_identity_not_found"
  | "target_identity_disabled"
  | "program_not_found"
  | "validation_failed"
  | "admin_required"
  | "admin_or_curator_required"
  | "participation_required"
  | "unsupported_participation_kind"
  | "invitation_not_found"
  | "invitation_not_pending"
  | "invitation_conflict"
  | "policy_not_satisfied"
  | "membership_missing"
  | "membership_left"
  | "membership_removed"
  | "membership_already_active"
  | "last_curator_required";
```

## Behavior rules

1. All commands require an active acting internal Identity.
2. Commands reject disabled acting Identities with `identity_disabled`.
3. Commands reject missing acting Identities with `identity_not_found`.
4. Program-scoped commands reject unknown Programs with `program_not_found`.
5. Program Curator commands require effective `program_curator` participation for the Program.
6. Admin exceptional commands require effective Admin authority and must not be callable through Program Curator authority alone.
7. `setProgramAdmissionPolicy` accepts only `self_join` or `invitation_only`.
8. `setProgramAdmissionPolicy` decides only the Program's Student admission policy between open self-join and controlled invitation admission.
9. `setProgramAdmissionPolicy` does not create Program Curator self-join, curator invitations, ownership transfer, resource-level permissions, payment, cohorts, organization behavior, or future policy variants.
10. Changing admission policy does not create, remove, recover, or rewrite existing memberships or invitations.
11. `joinSelfJoinProgram` must reject `invitation_only` Programs with `policy_not_satisfied`.
12. `createProgramInvitation` creates only Student invitations.
13. `createProgramInvitation` rejects `program_curator` or unsupported participation kinds with `unsupported_participation_kind`.
14. `createProgramInvitation` rejects disabled or missing target Identities with `target_identity_disabled` or `target_identity_not_found`.
15. `createProgramInvitation` rejects target Identities that already have active Student membership with `membership_already_active`.
16. `createProgramInvitation` rejects target Identities that have removed Student membership with `membership_removed`.
17. `createProgramInvitation` rejects when another pending Student invitation exists for the same Program and target Identity with `invitation_conflict`.
18. Accepted invitation creation records a pending invitation and an accepted `student_invitation_created` membership event.
19. Invitation creation does not create Student membership, Student Workspace records, learner state, accepted Program corpus, or assessment attempts.
20. Curators may list invitations for Programs where they have effective Program Curator participation.
21. Students may list only invitations targeted at their own Identity.
22. Invitation lists must not expose invitations outside the caller's Program Curator or target-Student scope.
23. Admins do not become normal invitation operators; Admin invitation inspection must use read-only participant or event views.
24. `acceptProgramInvitation` requires the acting Identity to match the invitation target.
25. Non-target invitation acceptance receives `invitation_not_found`, not the private invitation detail.
26. `acceptProgramInvitation` accepts only pending invitations.
27. Accepting a pending invitation marks the invitation `accepted`.
28. Accepting a pending invitation creates an active Student membership when no Student membership exists.
29. Accepting a pending invitation reactivates an existing left Student membership.
30. Accepting a pending invitation returns the existing active Student membership if the target became active before acceptance.
31. Accepting a pending invitation rejects removed Student membership with `membership_removed`; ordinary invitation acceptance must not recover removed membership.
32. Accepted invitation acceptance creates an accepted `student_invitation_accepted` event and, when membership changes, a Student membership event with `policyPath: "curator_invitation"`.
33. Invitation acceptance does not create learner state; Student Workspace state may resume only through Student Workspace after effective Student participation is allowed.
34. `declineProgramInvitation` requires the acting Identity to match the invitation target.
35. Non-target invitation decline receives `invitation_not_found`.
36. `declineProgramInvitation` accepts only pending invitations.
37. Declining an invitation marks it `declined`, creates an accepted `student_invitation_declined` event, and must not create membership or learner state.
38. `revokeProgramInvitation` requires effective Program Curator participation for the invitation Program.
39. `revokeProgramInvitation` accepts only pending invitations.
40. Revoking an invitation marks it `revoked`, creates an accepted `student_invitation_revoked` event, and must not create or remove membership.
41. `listProgramParticipants` returns membership summaries only and must not expose Student Workspace progress, attempts, weak areas, answers, feedback, evaluator evidence, or readiness attempts.
42. Program Curators may list participants only for Programs where they have effective Program Curator participation.
43. Admins may list participants for diagnosis, but this read does not grant or change membership.
44. `removeProgramParticipant` is a Program Curator command for Student participation only.
45. `removeProgramParticipant` rejects attempts to remove Program Curator participation with `unsupported_participation_kind`.
46. Removing an active or left Student membership changes it to `removed`.
47. Removing a missing Student membership rejects with `membership_missing`.
48. Removing an already removed Student membership rejects with `membership_removed`.
49. Student removal creates an accepted `student_membership_removed` event with `policyPath: "curator_removal"`.
50. Student removal does not delete Program corpus, Student Workspace state, learner-state evidence, attempts, evaluations, or prior membership events.
51. `leaveCuratorProgram` changes the acting Identity's active Program Curator membership to `left`.
52. `leaveCuratorProgram` rejects if the Program would have no active Program Curator after the leave with `last_curator_required`.
53. `leaveCuratorProgram` rejects missing, left, or removed Program Curator memberships with the corresponding membership reason.
54. Curator leave creates an accepted `curator_membership_left` event and must not mutate accepted corpus content.
55. `recoverProgramMembership` is an Admin exceptional command, not an ordinary invitation or curator operation.
56. `recoverProgramMembership` requires non-empty `recoveryReason`; blank or malformed reasons reject with `validation_failed`.
57. `recoverProgramMembership` may create or reactivate Student or Program Curator membership for an active target Identity when operational recovery is required.
58. `recoverProgramMembership` changes the resulting membership to `active`.
59. `recoverProgramMembership` creates an accepted `membership_exceptionally_recovered` event with `policyPath: "admin_exceptional_recovery"`.
60. `revokeProgramMembership` is an Admin exceptional command, not ordinary participant management.
61. `revokeProgramMembership` requires non-empty `revocationReason`; blank or malformed reasons reject with `validation_failed`.
62. `revokeProgramMembership` changes an existing Student or Program Curator membership to `removed`.
63. `revokeProgramMembership` rejects missing memberships with `membership_missing`.
64. `revokeProgramMembership` rejects if revoking Program Curator participation would leave a Program with no active Program Curator with `last_curator_required`.
65. `revokeProgramMembership` creates an accepted `membership_exceptionally_revoked` event with `policyPath: "admin_exceptional_revocation"`.
66. Admin exceptional recovery and revocation must be visible in membership events so they are distinguishable from ordinary Program Membership policy execution.
67. Rejected membership mutations create rejected membership events when the acting Identity and Program are known.
68. Membership event responses must include actor Identity, target Identity, Program, participation kind, policy path, outcome, and resulting membership or invitation status when applicable.
69. Effective participation returns `allowed: true` only for active membership and must not treat pending or accepted invitations as authority without active membership.
70. Effective participation decisions remain read-only and must not change invitations or memberships.
71. Backup and restore preserve Program admission policy, invitations, membership records, and membership events.
72. Restore rejects duplicate active invitation identifiers, duplicate pending invitation scopes, duplicate membership uniqueness scopes, invitations pointing at missing Programs or Identities, and membership records that would leave a Program without an active Program Curator.
73. All HTTP mutation endpoints require session resolution before CSRF validation.
74. HTTP responses must not expose password hashes, plaintext passwords, bootstrap secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.
75. This slice does not implement payment, cohorts, organizations, external email delivery, notification delivery, invitation expiry, ownership transfer, role-assignment primitives, accepted corpus mutation, Student Workspace learning-state mutation, recommendations, analytics, or LLM/provider behavior.

## Tests (required)

1. Storage test preserves admission policy, invitations, membership records, and membership events through backup/restore.
2. Storage test rejects malformed restore graphs for duplicate pending invitation scope, missing Program, missing target Identity, duplicate membership scope, and no-active-curator Program state.
3. Domain test changes the Student admission policy and proves self-join rejects invitation-only Programs without changing existing memberships, Program Curator participation, ownership, resource permissions, payment state, cohort state, or organization behavior.
4. Domain test creates, lists, accepts, declines, and revokes Student invitations as effective Program Curator and target Student.
5. Domain test proves invitation creation and decline do not create Student membership or Student Workspace state.
6. Domain test proves invitation acceptance creates or reactivates Student membership and does not duplicate an active membership.
7. Domain test proves invitation acceptance rejects non-target, revoked, declined, accepted, removed-member, disabled-target, cross-Program, and unknown invitation cases.
8. Domain test proves participant listing exposes membership summaries but not Student Workspace progress, attempts, answers, feedback, readiness attempts, or learner-state evidence.
9. Domain test proves Program Curator Student removal changes membership to `removed`, emits attribution, blocks ordinary invitation/self-join reactivation, and preserves Student Workspace records.
10. Domain test proves curator leave succeeds when another active curator remains and rejects the last active curator.
11. Domain test proves Admin exceptional recovery and revocation require Admin authority, non-empty reasons, attribution, and last-curator protection.
12. Boundary test proves Identity & Role Management, Student Workspace, Curator Workspace, Quick Check, readiness, and learner-state commands do not create or mutate Program Membership records directly.
13. HTTP test covers invitation, participant, curator-leave, Admin recovery, Admin revocation, session, CSRF, authorization, status mapping, private non-target invitation errors, and redaction.
14. HTTP executable acceptance test covers curator-controlled invitation, Student acceptance, participant listing, Student removal, Admin exceptional recovery, and event inspection.
15. Browser test covers `/learn` or the chosen product UI for curator invitations, Student invitation decisions, participant visibility, curator leave, and protected-data redaction.
16. Browser or Admin-board test covers exceptional recovery and exceptional revocation as Admin-only operations with attribution.
17. Regression test proves existing self-join, leave, rejoin, membership event, Quick Check, navigation, learner-state, and readiness flows remain unchanged outside the new invitation-only policy behavior.
18. Absence test proves the slice does not add payment, external email delivery, notification delivery, organization/cohort behavior, accepted corpus mutation, Student Workspace mutation, analytics, recommendations, or LLM/provider calls.

## Done criteria

- Program Membership exposes tested commands and HTTP routes for Student invitation lifecycle, participant listing, Student removal, curator leave, and exceptional Admin recovery/revocation.
- Admission policy changes are limited to Student `self_join` versus `invitation_only`; broader policy variants and Program Curator admission remain out of scope.
- Invitation and membership records remain separate, and effective participation depends only on active membership.
- Ordinary Program Curator behavior manages Student invitations and Student removal without gaining Admin recovery authority.
- Admin recovery and revocation are exceptional, reasoned, attributable, and distinguishable from ordinary membership policy execution.
- Membership changes never delete or mutate accepted Program corpus, Student Workspace learning state, assessment attempts, learner-state evidence, readiness attempts, credentials, sessions, or Admin authority.
- Backup/restore preserves and validates admission policy, invitations, memberships, and membership events.
- Product Intent traceability, backlog, README, implementation notes, log, parent plan, and LOC dashboard are updated only after implementation and final gates pass.
