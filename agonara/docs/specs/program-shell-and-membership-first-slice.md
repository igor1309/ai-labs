---
date: 2026-05-27
model: gpt-5
description: "Spec: Agonara Program shell creation and Program Membership v0.0.1 contract."
version: 0.0.1
status: draft
type: spec
---

# Program Shell and Membership First Slice

## Goal

Define the Agonara v0.0.1 backend contract for creating minimal Program shells, establishing initial Program Curator participation, allowing Student self-join participation, and answering effective participation decisions.

This spec operationalizes [ADR-009](../adr/adr-009-program-shell-and-initial-curator-participation.md) and the Program Membership decisions in [ADR-004](../adr/adr-004-program-membership-owns-program-participation.md) through [ADR-007](../adr/adr-007-effective-participation-authorization-contract.md).

## Public interface

### Logical records

```ts
type ProgramAdmissionPolicy = "self_join";

type ProgramShell = {
  id: ProgramId;
  title: string;
  description?: string;
  admissionPolicy: ProgramAdmissionPolicy;
  createdByIdentityId: IdentityId;
  createdAt: Instant;
};

type ParticipationKind = "student" | "program_curator";

type MembershipStatus = "active" | "left" | "removed";

type ProgramMembership = {
  id: ProgramMembershipId;
  programId: ProgramId;
  identityId: IdentityId;
  participationKind: ParticipationKind;
  status: MembershipStatus;
  createdAt: Instant;
  updatedAt: Instant;
};

type ProgramEvent = {
  id: ProgramEventId;
  eventType: "program_created";
  actorIdentityId: IdentityId;
  programId: ProgramId;
  occurredAt: Instant;
  outcome: "accepted" | "rejected";
  reason?: ProgramRejectionReason;
};

type ProgramMembershipEvent = {
  id: ProgramMembershipEventId;
  eventType:
    | "initial_curator_membership_created"
    | "student_membership_joined"
    | "student_membership_left"
    | "student_membership_rejoined";
  actorIdentityId: IdentityId;
  targetIdentityId: IdentityId;
  programId: ProgramId;
  participationKind: ParticipationKind;
  resultingStatus?: MembershipStatus;
  occurredAt: Instant;
  outcome: "accepted" | "rejected";
  reason?: ProgramRejectionReason;
};
```

`ProgramId`, `ProgramMembershipId`, `ProgramEventId`, and `ProgramMembershipEventId` are opaque stable identifiers.

### Commands

```ts
createProgramShell(input: {
  actingIdentityId: IdentityId;
  title: string;
  description?: string;
}) -> CreateProgramShellResult

joinSelfJoinProgram(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
}) -> JoinSelfJoinProgramResult

leaveStudentProgram(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
}) -> LeaveStudentProgramResult
```

Each command result is either:

- `{ status: "accepted"; value: ... }`
- `{ status: "rejected"; reason: ProgramRejectionReason }`

### Queries

```ts
listProgramShells(input: {
  actingIdentityId: IdentityId;
}) -> ListProgramShellsResult

getProgramShell(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
}) -> GetProgramShellResult

getEffectiveParticipation(input: {
  identityId: IdentityId;
  programId: ProgramId;
  participationKind: ParticipationKind;
}) -> EffectiveParticipationResult

listMyProgramMemberships(input: {
  actingIdentityId: IdentityId;
}) -> ListMyProgramMembershipsResult

listProgramEvents(input: {
  actingIdentityId: IdentityId;
  programId?: ProgramId;
}) -> ListProgramEventsResult

listProgramMembershipEvents(input: {
  actingIdentityId: IdentityId;
  programId?: ProgramId;
}) -> ListProgramMembershipEventsResult
```

`listProgramEvents` and `listProgramMembershipEvents` require effective `Program Curator` participation for each returned Program or effective `Admin` authority. Admin inspection remains read-only in this slice.

### Result shapes

```ts
type ProgramShellSummary = {
  programId: string;
  title: string;
  description?: string;
  admissionPolicy: "self_join";
  createdByIdentityId: string;
  createdAt: string;
};

type ProgramMembershipSummary = {
  programId: string;
  identityId: string;
  participationKind: "student" | "program_curator";
  status: "active" | "left" | "removed";
  updatedAt: string;
};

type EffectiveParticipation = {
  allowed: boolean;
  reason?:
    | "identity_not_active"
    | "program_not_accepting_participation"
    | "membership_missing"
    | "membership_left"
    | "membership_removed"
    | "policy_not_satisfied"
    | "unsupported_participation_kind";
};

type ProgramRejectionReason =
  | "identity_not_found"
  | "identity_disabled"
  | "program_not_found"
  | "validation_failed"
  | "membership_missing"
  | "membership_removed"
  | "unsupported_participation_kind"
  | "admin_or_curator_required"
  | "program_creation_incomplete";
```

## Behavior rules

1. `createProgramShell` requires an active acting internal Identity.
2. `createProgramShell` rejects unknown acting Identities with `identity_not_found`.
3. `createProgramShell` rejects disabled acting Identities with `identity_disabled`.
4. Program shell `title` is required, must contain non-whitespace text, and rejects invalid values with `validation_failed`.
5. Program shell `description` is optional and rejects malformed values with `validation_failed`.
6. Accepted `createProgramShell` creates one Program shell with `admissionPolicy: "self_join"`.
7. Accepted `createProgramShell` creates one active `program_curator` membership for the acting Identity and created Program.
8. The Program shell creation and initial curator membership are atomic from the caller's perspective.
9. If initial curator membership cannot be created, `createProgramShell` rejects with `program_creation_incomplete` and no Program shell remains visible.
10. Accepted `createProgramShell` creates one accepted `program_created` Program event attributed to the acting Identity.
11. Accepted `createProgramShell` creates one accepted `initial_curator_membership_created` Program Membership event attributed to the acting Identity.
12. Program creation does not grant Admin authority.
13. Program creation does not grant Student participation to the creator.
14. Program creation does not create learner state, accepted topics, accepted concepts, accepted materials, checks, criteria, or draft suggestions.
15. `listProgramShells` requires an active acting internal Identity and returns all Program shells visible for self-join or existing participation in this slice.
16. `getProgramShell` requires an active acting internal Identity and rejects unknown Program identifiers with `program_not_found`.
17. `joinSelfJoinProgram` requires an active acting internal Identity.
18. `joinSelfJoinProgram` rejects unknown Program identifiers with `program_not_found`.
19. `joinSelfJoinProgram` accepts when the Program exists, has `self_join` admission policy, and the acting Identity has no Student membership for that Program.
20. Accepted first join creates one active `student` membership for the acting Identity and Program.
21. Accepted first join creates one accepted `student_membership_joined` Program Membership event.
22. `joinSelfJoinProgram` accepts when the acting Identity has a `left` Student membership for the Program.
23. Accepted rejoin reuses the existing Student membership record, changes its status to `active`, and creates one accepted `student_membership_rejoined` Program Membership event.
24. Rejoin must not create a duplicate Student membership for the same Identity and Program.
25. `joinSelfJoinProgram` rejects when the acting Identity has a `removed` Student membership for the Program.
26. `joinSelfJoinProgram` is idempotent for active Student membership and returns the existing active membership without creating a duplicate membership record.
27. `leaveStudentProgram` requires an active acting internal Identity.
28. `leaveStudentProgram` rejects unknown Program identifiers with `program_not_found`.
29. `leaveStudentProgram` rejects missing Student membership with `membership_missing`.
30. `leaveStudentProgram` rejects removed Student membership with `membership_removed`.
31. Accepted leave changes active Student membership to `left`.
32. Accepted leave creates one accepted `student_membership_left` Program Membership event.
33. Leaving Student membership does not delete learner state, Program shell state, Program Curator membership, Program events, or prior Program Membership events.
34. `getEffectiveParticipation` returns `allowed: true` only for active membership matching the requested Identity, Program, and participation kind.
35. `getEffectiveParticipation` returns `identity_not_active` when the Identity is disabled.
36. `getEffectiveParticipation` returns `membership_missing`, `membership_left`, or `membership_removed` for the corresponding membership absence or status.
37. `getEffectiveParticipation` returns `unsupported_participation_kind` for participation kinds outside `student` and `program_curator`.
38. `getEffectiveParticipation` is read-only and must not create, reactivate, leave, remove, or recover membership state.
39. Effective `program_curator` participation is required before curator-sensitive behavior may run in later slices.
40. Effective `student` participation is required before student learning state may be created, resumed, or exposed in later slices.
41. Program events and Program Membership events are queryable domain records, not operational logs.
42. Program events and Program Membership events must not be used as the source of authorization.
43. Event query responses must not expose password hashes, plaintext passwords, bootstrap secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, or infrastructure secrets.
44. Backup/restore scope includes Program shells, Program Membership records, Program events, and Program Membership events.
45. Restore must reject or refuse activation if a Program shell would be restored without at least one active `program_curator` membership.
46. This slice does not expose invitation creation, invitation acceptance, invitation decline, invitation revocation, Program archival, Program deletion, Program ownership transfer, Program policy changes, controlled Program admission, curator leave, curator removal, Admin exceptional recovery mutations, accepted corpus editing, Student Workspace state, UI, or HTTP route names.

## Product intent traceability

| Story | Behavior covered |
|---|---|
| CUR-01 — Create program from grounded sources | `createProgramShell` establishes a stable Program scope before later source and corpus behavior. |
| STU-01 — See available programs | `listProgramShells` exposes Program shells visible for self-join or existing participation. |
| STU-18 — Join self-join program | `joinSelfJoinProgram` creates active Student membership for self-join Programs. |
| STU-19 — Leave active program | `leaveStudentProgram` changes active Student membership to `left` without deleting historical state. |
| STU-20 — Rejoin left program | `joinSelfJoinProgram` reactivates the existing left Student membership. |
| STU-21 — View my program membership state | `listMyProgramMemberships` exposes the acting Identity's Program memberships. |
| ADM-12 — View program membership state | Event and membership queries provide read-only inspection when the caller is an Admin or effective Program Curator for the Program. |
| ADM-15 — Audit membership changes | Program Membership events record actor, target, Program, participation kind, result, and outcome. |

## Tests (required)

Program shell creation:

1. `createProgramShell` accepts for an active Identity and returns a Program shell with `admissionPolicy: "self_join"`.
2. Accepted Program creation creates active `program_curator` membership for the creator.
3. Accepted Program creation creates accepted Program and Program Membership events attributed to the creator.
4. Program creation does not grant Admin authority.
5. Program creation does not grant Student membership to the creator.
6. Program creation rejects unknown acting Identity with `identity_not_found`.
7. Program creation rejects disabled acting Identity with `identity_disabled`.
8. Program creation rejects empty or whitespace title with `validation_failed`.
9. Program creation failure during initial curator membership leaves no visible orphan Program shell.

Program discovery:

10. `listProgramShells` returns Program shells visible to an active Identity.
11. `listProgramShells` rejects disabled acting Identity with `identity_disabled`.
12. `getProgramShell` returns an existing Program shell for an active Identity.
13. `getProgramShell` rejects unknown Program identifiers with `program_not_found`.

Student membership:

14. `joinSelfJoinProgram` accepts for an active Identity and self-join Program with no prior Student membership.
15. Accepted first join creates active Student membership and a `student_membership_joined` event.
16. `joinSelfJoinProgram` is idempotent for existing active Student membership and does not create a duplicate membership record.
17. `joinSelfJoinProgram` reactivates a left Student membership and emits a `student_membership_rejoined` event.
18. Rejoin reuses the existing membership record.
19. `joinSelfJoinProgram` rejects removed Student membership.
20. `joinSelfJoinProgram` rejects unknown Program identifiers with `program_not_found`.
21. `leaveStudentProgram` changes active Student membership to `left` and emits a `student_membership_left` event.
22. `leaveStudentProgram` rejects missing Student membership with `membership_missing`.
23. `leaveStudentProgram` rejects removed Student membership with `membership_removed`.
24. Leaving Student membership does not delete Program shell, Program Curator membership, learner-state placeholders, or historical events.

Effective participation:

25. `getEffectiveParticipation` returns allowed for active Student membership.
26. `getEffectiveParticipation` returns allowed for active Program Curator membership.
27. `getEffectiveParticipation` returns `membership_missing` when no matching membership exists.
28. `getEffectiveParticipation` returns `membership_left` for left membership.
29. `getEffectiveParticipation` returns `membership_removed` for removed membership.
30. `getEffectiveParticipation` returns `identity_not_active` for disabled Identity.
31. `getEffectiveParticipation` returns `unsupported_participation_kind` for unsupported participation kind.
32. `getEffectiveParticipation` does not mutate membership state.

Events, boundaries, and recovery:

33. Program and Program Membership event queries require Admin authority or effective Program Curator participation for each returned Program.
34. Event query responses do not expose secrets, session identifiers, CSRF tokens, SQL text, stack traces, or infrastructure secrets.
35. Program events and Program Membership events are not used as authorization state.
36. Backup export includes Program shells, Program Membership records, Program events, and Program Membership events.
37. Restore rejects a Program shell without at least one active Program Curator membership.
38. No API or command in this slice creates invitations, changes Program policy, transfers Program ownership, removes Program Curator membership, edits accepted corpus, or creates Student Workspace state.

## Done criteria

- The implementation exposes the command and query surface defined above or a behaviorally equivalent internal service contract.
- Logical records or equivalent persisted state cover Program shells, Program Membership records, Program events, and Program Membership events.
- Program creation and initial Program Curator membership are atomic from the caller's perspective.
- All required tests pass.
- Tests prove Program creation does not grant Admin authority, Student membership, accepted corpus content, draft suggestions, or learner state.
- Tests prove effective participation decisions come from Program Membership state, not credentials, sessions, Admin authority, Program events, or operational logs.
- Backup/restore includes Program shell and membership state and rejects orphan Program shells without active Program Curator participation.
