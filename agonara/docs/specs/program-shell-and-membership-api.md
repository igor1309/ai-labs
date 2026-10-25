---
date: 2026-05-27
model: gpt-5
description: "Spec: Agonara Program shell and membership HTTP API v0.0.1."
version: 0.0.1
status: implemented
type: spec
---

# Program Shell and Membership API

## Goal

Define the public HTTP API and executable acceptance scenarios for Agonara Program shell and Program Membership v0.0.1, owned by the Program shell and Program Membership API boundary.

This spec operationalizes [Program Shell and Membership First Slice](program-shell-and-membership-first-slice.md) and [ADR-009](../adr/adr-009-program-shell-and-initial-curator-participation.md) through the existing session, CSRF, envelope, and redaction conventions from [Identity & Role Management API and CLI](identity-role-management-api-cli.md). It defines HTTP behavior only; it does not add UI, CLI, invitation, corpus editing, curator workspace, or student workspace behavior.

## Implementation status

Implemented by [Program Shell and Membership HTTP API Implementation Plan](../plans/implemented/program-shell-and-membership-api.md).

### Implementation Evidence

- HTTP route adapters, session/CSRF handling, pagination, response shaping, and status mapping: [server.js](../../src/server.js)
- Delegated Program shell and membership command/query boundary: [program.js](../../src/program.js)
- Focused HTTP route, session, CSRF, pagination, redaction, and out-of-scope coverage: [http-api-programs.test.js](../../tests/http-api-programs.test.js), [http-api-program-student-memberships.test.js](../../tests/http-api-program-student-memberships.test.js), [http-api-program-membership-control.test.js](../../tests/http-api-program-membership-control.test.js), [http-api-program-participation.test.js](../../tests/http-api-program-participation.test.js), [http-api-program-events.test.js](../../tests/http-api-program-events.test.js)
- End-to-end executable acceptance coverage: [executable-acceptance.test.js](../../tests/executable-acceptance.test.js)

The implemented API exposes Program shell list/create/detail routes, Student membership self-join/leave/rejoin routes, current-session membership reads, effective-participation reads, and scoped Program/Program Membership event reads over the existing Identity session, CSRF, envelope, pagination, and redaction conventions. It delegates policy to the implemented Program command/query boundary. This status note is scoped to the base Program shell and membership API slice; later invitation, participant-management, and recovery routes are owned by [Program Membership Invitations and Recovery](program-membership-invitations-and-recovery.md).

## Public interface

### Shared result envelope

#### Successful HTTP Operations

```ts
type AcceptedResult<T> = {
  status: "accepted";
  value: T;
};
```

#### Rejected HTTP Operations

```ts
type RejectedResult = {
  status: "rejected";
  reason: ApiRejectionReason;
};
```

#### Fault HTTP Operations

```ts
type FaultResult = {
  status: "fault";
  reason: "internal_error";
};
```

`ApiRejectionReason` includes the Program rejection reasons from [Program Shell and Membership First Slice](program-shell-and-membership-first-slice.md) plus session and CSRF reasons from [Identity & Role Management API and CLI](identity-role-management-api-cli.md):

```ts
type ApiRejectionReason =
  | "identity_not_found"
  | "identity_disabled"
  | "program_not_found"
  | "validation_failed"
  | "membership_missing"
  | "membership_left"
  | "membership_removed"
  | "unsupported_participation_kind"
  | "admin_or_curator_required"
  | "program_creation_incomplete"
  | "session_not_found"
  | "session_expired"
  | "session_revoked"
  | "csrf_required"
  | "csrf_invalid";

type ProgramEventRejectionReason =
  | "identity_not_found"
  | "identity_disabled"
  | "program_not_found"
  | "validation_failed"
  | "membership_missing"
  | "membership_left"
  | "membership_removed"
  | "unsupported_participation_kind"
  | "admin_or_curator_required"
  | "program_creation_incomplete";
```

Fault responses do not include secrets, password hashes, session identifiers, CSRF tokens, cookie headers, authorization headers, stack traces, SQL text, or infrastructure details.

### Shared API shapes

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

type ProgramCreated = {
  program: ProgramShellSummary;
  initialCuratorMembership: ProgramMembershipSummary;
};

type EffectiveParticipationSummary = {
  identityId: string;
  programId: string;
  participationKind: "student" | "program_curator";
  allowed: boolean;
  reason?:
    | "identity_not_active"
    | "program_not_accepting_participation"
    | "membership_missing"
    | "membership_left"
    | "membership_removed"
    | "unsupported_participation_kind";
};

type ProgramEventSummary = {
  programEventId: string;
  eventType: "program_created";
  actorIdentityId: string;
  programId?: string;
  occurredAt: string;
  outcome: "accepted" | "rejected";
  reason?: ProgramEventRejectionReason;
};

type ProgramMembershipEventSummary = {
  programMembershipEventId: string;
  eventType:
    | "initial_curator_membership_created"
    | "student_membership_joined"
    | "student_membership_left"
    | "student_membership_rejoined";
  actorIdentityId: string;
  targetIdentityId: string;
  programId: string;
  participationKind: "student" | "program_curator";
  resultingStatus?: "active" | "left" | "removed";
  occurredAt: string;
  outcome: "accepted" | "rejected";
  reason?: ProgramEventRejectionReason;
};

type ProgramEventList = {
  events: ProgramEventSummary[];
  nextCursor?: string;
};

type ProgramMembershipEventList = {
  events: ProgramMembershipEventSummary[];
  nextCursor?: string;
};
```

### HTTP session transport

The Program HTTP API authenticates browser clients with the existing server-managed `agonara_session` cookie.

State-changing HTTP requests require `X-Agonara-CSRF: <csrfToken>` from the active session. Read-only `GET` requests do not require a CSRF header.

The Program API never returns the session identifier or CSRF token. Clients obtain CSRF tokens through the Identity session API.

### HTTP endpoints

| Method | Path | Auth | Accepted response | Rejected status mapping |
|---|---|---|---|---|
| `GET` | `/programs` | session cookie | `AcceptedResult<{ programs: ProgramShellSummary[] }>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled` |
| `POST` | `/programs` | session cookie and CSRF header | `AcceptedResult<ProgramCreated>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 csrf_required`, `403 csrf_invalid`, `409 program_creation_incomplete` |
| `GET` | `/programs/{programId}` | session cookie | `AcceptedResult<ProgramShellSummary>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `404 program_not_found` |
| `GET` | `/programs/{programId}/participation/{participationKind}?identityId={identityId}` | session cookie | `AcceptedResult<EffectiveParticipationSummary>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_or_curator_required`, `404 program_not_found` |
| `GET` | `/program-memberships/me` | session cookie | `AcceptedResult<{ memberships: ProgramMembershipSummary[] }>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled` |
| `POST` | `/programs/{programId}/student-membership` | session cookie and CSRF header | `AcceptedResult<{ membership: ProgramMembershipSummary }>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 csrf_required`, `403 csrf_invalid`, `404 program_not_found`, `409 membership_removed` |
| `DELETE` | `/programs/{programId}/student-membership` | session cookie and CSRF header | `AcceptedResult<{ membership: ProgramMembershipSummary }>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 csrf_required`, `403 csrf_invalid`, `404 program_not_found`, `409 membership_missing`, `409 membership_left`, `409 membership_removed` |
| `GET` | `/programs/{programId}/events?limit={limit}&cursor={cursor}` | Admin or Program Curator session | `AcceptedResult<ProgramEventList>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_or_curator_required`, `404 program_not_found` |
| `GET` | `/programs/{programId}/membership-events?limit={limit}&cursor={cursor}` | Admin or Program Curator session | `AcceptedResult<ProgramMembershipEventList>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_or_curator_required`, `404 program_not_found` |

### Request Bodies

```ts
type CreateProgramRequest = {
  title: string;
  description?: string;
};

type ProgramEventQuery = {
  limit?: number;
  cursor?: string;
};
```

`identityId` on the effective participation route is optional. When absent, the route checks effective participation for the resolved session Identity.

## Behavior rules

1. Every Program API endpoint requires a valid active HTTP session.
2. Program API session resolution uses the existing Identity session contract before invoking Program commands or queries.
3. Session resolution rejects missing, unknown, expired, and revoked sessions with the same `401` status and reason as the Identity API.
4. Session resolution rejects disabled Identities with `403 identity_disabled`.
5. State-changing Program API endpoints reject missing sessions with `401 session_not_found` before CSRF validation.
6. State-changing Program API endpoints reject missing or invalid CSRF tokens before applying Program domain changes.
7. State-changing Program API endpoints do not create or rotate sessions.
8. `GET /programs` maps to `listProgramShells` for the resolved session Identity.
9. `POST /programs` maps to `createProgramShell` for the resolved session Identity.
10. `POST /programs` accepts only JSON objects matching `CreateProgramRequest`.
11. `POST /programs` rejects malformed JSON, non-object JSON, missing bodies, or bodies that cannot be parsed as JSON with `400 validation_failed`.
12. `POST /programs` rejects missing, empty, whitespace-only, non-string, or malformed `title` values with `400 validation_failed`.
13. `POST /programs` rejects malformed `description` values with `400 validation_failed`.
14. Accepted `POST /programs` returns the created Program shell and the initial active `program_curator` membership.
15. Accepted `POST /programs` does not grant Admin authority or Student participation.
16. `GET /programs/{programId}` maps to `getProgramShell` for the resolved session Identity.
17. Routes containing `{programId}` reject unknown Program identifiers with `404 program_not_found` before returning Program-scoped data.
18. `GET /programs/{programId}/participation/{participationKind}` accepts only `student` and `program_curator` participation kinds.
19. Effective participation checks are read-only and must not create, reactivate, leave, remove, or recover membership state.
20. When `identityId` is absent on the effective participation route, the API checks the resolved session Identity.
21. When `identityId` differs from the resolved session Identity, the caller must be an effective Admin or an active Program Curator for the Program.
22. Authorized effective participation checks for unknown target Identities return `allowed: false` with `reason: "identity_not_active"`.
23. Authorized effective participation checks may return `allowed: false` with `reason: "program_not_accepting_participation"` only for a known Program that is unavailable for participation decisions; unknown Program identifiers still reject with `404 program_not_found`.
24. `GET /program-memberships/me` maps to `listMyProgramMemberships` for the resolved session Identity.
25. `GET /program-memberships/me` returns only memberships whose `identityId` matches the resolved session Identity.
26. `POST /programs/{programId}/student-membership` maps to `joinSelfJoinProgram` for the resolved session Identity.
27. Accepted first join returns the active Student membership.
28. Rejoining a left Student membership returns the reactivated Student membership.
29. Joining while already active returns the existing active Student membership and remains idempotent.
30. Joining a removed Student membership rejects with `409 membership_removed`.
31. `DELETE /programs/{programId}/student-membership` maps to `leaveStudentProgram` for the resolved session Identity.
32. Accepted leave returns the Student membership in `left` status.
33. Leaving missing, already-left, or removed Student membership rejects with `409` and the corresponding membership reason.
34. Event endpoints expose scoped domain event records, not operational logs.
35. Event endpoint `reason` fields include only Program domain rejection reasons, never session, CSRF, cookie, transport, or fault reasons.
36. Event endpoints require effective Admin authority or active Program Curator participation for the requested Program.
37. Event endpoints do not expose unscoped all-Program event queries in this API slice.
38. Event endpoints accept `limit` values from `1` through `100`, default to `50`, and reject invalid limits with `400 validation_failed`.
39. Event endpoint cursors are opaque strings returned by the API; malformed, unknown, or expired cursors reject with `400 validation_failed`.
40. Event endpoint cursors must not encode secrets, SQL text, filesystem paths, stack traces, session identifiers, CSRF tokens, cookie headers, or authorization headers.
41. Program API responses never include password hashes, plaintext passwords, bootstrap secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, or infrastructure details.
42. Program API fault responses map unexpected failures to `500` with `FaultResult`.
43. This API slice does not expose invitation creation, invitation acceptance, invitation decline, invitation revocation, Program archival, Program deletion, Program ownership transfer, Program policy changes, controlled Program admission, curator leave, curator removal, Admin exceptional recovery mutations, accepted corpus editing, Student Workspace state, UI, or CLI commands.

## Product intent traceability

| Story | Behavior covered |
|---|---|
| CUR-01 - Create program from grounded sources | `POST /programs` exposes minimal Program shell creation and initial curator participation before later source and corpus behavior. |
| STU-01 - See available programs | `GET /programs` exposes Program shells visible to the session Identity. |
| STU-18 - Join self-join program | `POST /programs/{programId}/student-membership` exposes Student self-join. |
| STU-19 - Leave active program | `DELETE /programs/{programId}/student-membership` exposes Student leave without deleting Program history. |
| STU-20 - Rejoin left program | `POST /programs/{programId}/student-membership` reactivates a left Student membership. |
| STU-21 - View my program membership state | `GET /program-memberships/me` returns the session Identity's Program memberships. |
| ADM-12 - View program membership state | Effective participation and event routes provide read-only inspection when the caller is an Admin or effective Program Curator. |
| ADM-15 - Audit membership changes | Program Membership event routes expose scoped membership-change event records with authorization and redaction rules. |

## Tests (required)

### HTTP Session and CSRF

1. `GET /programs` rejects a missing session with `401 session_not_found`.
2. `GET /programs` rejects a disabled session Identity with `403 identity_disabled`.
3. `POST /programs` rejects a valid session without CSRF with `403 csrf_required`.
4. `POST /programs/{programId}/student-membership` rejects an invalid CSRF token with `403 csrf_invalid`.
5. Program API responses do not include session identifiers or CSRF tokens.

### Program Shell Routes

6. `GET /programs` accepts a valid active session and returns `ProgramShellSummary` records.
7. `POST /programs` accepts a valid active session with CSRF and returns `ProgramCreated`.
8. Accepted `POST /programs` response includes one Program shell and one initial active `program_curator` membership for the session Identity.
9. Accepted `POST /programs` does not include Admin authority or Student membership.
10. `POST /programs` rejects malformed JSON, non-object JSON, and missing bodies with `400 validation_failed`.
11. `POST /programs` rejects missing, empty, whitespace-only, non-string, and malformed titles with `400 validation_failed`.
12. `POST /programs` rejects malformed descriptions with `400 validation_failed`.
13. `GET /programs/{programId}` returns the requested Program shell for a known Program.
14. `GET /programs/{programId}` rejects an unknown Program with `404 program_not_found`.

### Student Membership Routes

15. `GET /program-memberships/me` returns only memberships for the session Identity.
16. `POST /programs/{programId}/student-membership` creates an active Student membership for first join.
17. Repeating `POST /programs/{programId}/student-membership` for an active Student membership returns the existing active membership without creating a duplicate event.
18. `DELETE /programs/{programId}/student-membership` changes an active Student membership to `left`.
19. Rejoining after leave returns the reactivated Student membership.
20. Leaving a missing Student membership rejects with `409 membership_missing`.
21. Leaving an already-left Student membership rejects with `409 membership_left`.
22. Joining a removed Student membership rejects with `409 membership_removed`.
23. Student membership routes reject unknown Programs with `404 program_not_found`.

### Effective Participation Routes

24. `GET /programs/{programId}/participation/student` checks Student participation for the session Identity when `identityId` is absent.
25. `GET /programs/{programId}/participation/program_curator` checks Program Curator participation for the session Identity when `identityId` is absent.
26. Effective participation checks for another Identity reject non-Admin, non-curator callers with `403 admin_or_curator_required`.
27. Effective participation checks for another Identity accept Admin callers.
28. Effective participation checks for another Identity accept active Program Curator callers for the Program.
29. Effective participation checks for unknown target Identities return `allowed: false` with `reason: "identity_not_active"` after the caller is authorized to inspect that target.
30. Effective participation checks can return `program_not_accepting_participation` only for a known Program that is unavailable for participation decisions.
31. Effective participation checks reject unsupported participation kinds with `400 validation_failed`.
32. Effective participation checks reject unknown Programs with `404 program_not_found`.
33. Effective participation checks are read-only and do not create, reactivate, leave, remove, or recover membership state.

### Event Routes

34. Event routes reject non-Admin, non-curator callers with `403 admin_or_curator_required`.
35. Event routes accept Admin callers for known Programs.
36. Event routes accept active Program Curator callers for their Programs.
37. Event routes reject unknown Programs with `404 program_not_found`.
38. Event routes return only events scoped to the requested Program.
39. Event route `reason` fields include only Program domain rejection reasons, not session, CSRF, cookie, transport, or fault reasons.
40. Event routes default `limit` to `50`.
41. Event routes reject `limit` values below `1`, above `100`, non-numeric values, and malformed cursors with `400 validation_failed`.
42. Event route responses and cursors do not expose password hashes, plaintext passwords, bootstrap secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, or infrastructure details.
43. Unscoped Program event and Program Membership event HTTP routes are not exposed in this slice.

### Executable Acceptance Flow

44. A logged-in Identity creates a Program, receives initial Program Curator membership, lists Programs, joins as Student, lists its memberships, leaves Student membership, rejoins Student membership, checks effective Student and Program Curator participation, and inspects scoped Program and Program Membership events with CSRF enforced on state-changing requests.

## Done criteria

- HTTP routes match the endpoint table and shared result envelope.
- Program API routes use the existing Identity session and CSRF transport contract.
- All behavior rules have executable HTTP acceptance or integration coverage.
- All listed tests pass in the Agonara workspace and the repo-wide Node gates.
- Responses and faults satisfy the redaction rules in this spec and the Identity API spec.
- No Program UI, Admin UI, CLI, invitation, corpus editing, curator workspace, or student workspace behavior is introduced by this API slice.
