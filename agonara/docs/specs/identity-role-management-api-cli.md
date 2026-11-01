---
date: 2026-05-27
model: gpt-5.5-thinking
description: "API, CLI, and executable acceptance spec for Agonara Identity & Role Management v0.0.1."
version: 0.0.1
status: implemented
type: spec
---

# Identity & Role Management API and CLI

## Goal

Define the public HTTP API, operator CLI, and executable acceptance scenarios for Agonara Identity & Role Management v0.0.1, owned by Identity & Role Management.

Request correlation, operational logging, health, diagnostics, and shared redaction behavior are specified in [Operational Cross-Cutting First Slice](operational-cross-cutting-first-slice.md).

## Implementation status

Implemented by [Identity and Operations First-Slice Implementation Plan](../plans/implemented/identity-and-operations-first-slice.md).

### Implementation Evidence

- HTTP route adapters, session-cookie handling, CSRF handling, rate limiting, status mapping, pagination, and redaction: [server.js](../../src/server.js)
- Operator CLI bootstrap/status commands, stdin JSON handling, envelopes, and exit-code behavior: [cli.js](../../src/cli.js)
- Delegated Identity command/query boundary: [identity.js](../../src/identity.js)
- Focused HTTP API coverage for bootstrap, login, sessions, Admin routes, audit events, rate limiting, CSRF, cookies, and redaction: [http-api-identity-session.test.js](../../tests/http-api-identity-session.test.js)
- Focused CLI coverage for bootstrap status, bootstrap admin, stdin JSON, rejected output, usage errors, and secret-free arguments: [cli.test.js](../../tests/cli.test.js)
- End-to-end executable acceptance coverage across CLI bootstrap, HTTP login/session/logout, Admin operations, CSRF, audit reads, last-Admin protection, rate limiting, and redaction: [executable-acceptance-identity-programs.test.js](../../tests/executable-acceptance-identity-programs.test.js) and [executable-acceptance-curation-operations.test.js](../../tests/executable-acceptance-curation-operations.test.js)

The implemented API/CLI surface exposes Identity bootstrap status, first-Admin bootstrap, login/session/logout, Admin-only identity and credential operations, Admin authority mutation, operational-access inspection, and paginated audit reads using the shared accepted/rejected/fault envelope. It preserves the transport boundary by keeping session identifiers out of JSON responses, requiring CSRF on session-backed mutations, reading bootstrap secrets/passwords through stdin for CLI bootstrap, and leaving operational health/diagnostics details to [Operational Cross-Cutting First Slice](operational-cross-cutting-first-slice.md).

## Public interface

### Shared result envelope

#### Successful HTTP and CLI Operations

```ts
type AcceptedResult<T> = {
  status: "accepted";
  value: T;
};
```

#### Rejected HTTP and CLI Operations

```ts
type RejectedResult = {
  status: "rejected";
  reason: ApiRejectionReason;
};
```

`ApiRejectionReason` includes the domain rejection reasons from [Identity & Role Management First Slice](identity-role-management-first-slice.md) plus:

```ts
type ApiOnlyRejectionReason =
  | "csrf_required"
  | "csrf_invalid"
  | "rate_limited";
```

#### Fault HTTP Operations

```ts
type FaultResult = {
  status: "fault";
  reason: "internal_error";
};
```

Fault responses do not include secrets, password hashes, session identifiers, stack traces, SQL text, or infrastructure details.

### Shared API shapes

```ts
type IdentitySummary = {
  identityId: string;
  displayName: string;
  state: "active" | "disabled";
  isAdmin: boolean;
};

type SessionSummary = {
  identity: IdentitySummary;
  expiresAt: string;
  csrfToken: string;
};

type BootstrapStatus = {
  available: boolean;
};

type AuditEventSummary = {
  auditEventId: string;
  eventType: string;
  actorIdentityId?: string;
  targetIdentityId?: string;
  targetCredentialId?: string;
  occurredAt: string;
  outcome: "accepted" | "rejected";
  reason?: string;
};

type AuditEventList = {
  auditEvents: AuditEventSummary[];
  nextCursor?: string;
};
```

`csrfToken` is an opaque token bound to the server-side session.

### HTTP session transport

The HTTP API authenticates browser clients with a server-managed session cookie named `agonara_session`.

### Cookie Requirements

- the cookie is `HttpOnly`;
- the cookie is `SameSite=Lax`;
- the cookie path is `/`;
- production HTTPS responses set `Secure`;
- JSON response bodies never include the session identifier.

State-changing HTTP requests that use an existing session require `X-Agonara-CSRF: <csrfToken>`. `POST /identity/bootstrap/admin` and `POST /identity/sessions` are exempt because they create the first session for an unauthenticated caller.

### HTTP endpoints

| Method | Path | Auth | Accepted response | Rejected status mapping |
|---|---|---|---|---|
| `GET` | `/identity/bootstrap/status` | none | `AcceptedResult<BootstrapStatus>` | n/a |
| `POST` | `/identity/bootstrap/admin` | bootstrap secret | `AcceptedResult<SessionSummary>` and session cookie | `400 validation_failed`, `401 invalid_bootstrap_secret`, `409 bootstrap_already_completed`, `429 rate_limited` |
| `POST` | `/identity/sessions` | none | `AcceptedResult<SessionSummary>` and session cookie | `400 validation_failed`, `401 invalid_credentials`, `429 rate_limited` |
| `GET` | `/identity/session` | session cookie | `AcceptedResult<SessionSummary>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled` |
| `DELETE` | `/identity/session` | session cookie and CSRF header | `AcceptedResult<{ loggedOut: true }>` and cleared session cookie | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 csrf_required`, `403 csrf_invalid` |
| `GET` | `/identity/identities` | Admin session | `AcceptedResult<{ identities: IdentitySummary[] }>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_required` |
| `POST` | `/identity/identities` | Admin session and CSRF header | `AcceptedResult<IdentitySummary>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_required`, `403 csrf_required`, `403 csrf_invalid` |
| `POST` | `/identity/identities/{identityId}/local-password` | Admin session and CSRF header | `AcceptedResult<{ credentialBound: true }>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_required`, `403 csrf_required`, `403 csrf_invalid`, `404 identity_not_found`, `409 login_already_bound`, `409 identity_already_has_credential` |
| `POST` | `/identity/identities/{identityId}/disable` | Admin session and CSRF header | `AcceptedResult<IdentitySummary>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_required`, `403 csrf_required`, `403 csrf_invalid`, `404 identity_not_found`, `409 last_admin_removal` |
| `POST` | `/identity/identities/{identityId}/admin` | Admin session and CSRF header | `AcceptedResult<IdentitySummary>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_required`, `403 csrf_required`, `403 csrf_invalid`, `404 identity_not_found` |
| `DELETE` | `/identity/identities/{identityId}/admin` | Admin session and CSRF header | `AcceptedResult<IdentitySummary>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_required`, `403 csrf_required`, `403 csrf_invalid`, `404 identity_not_found`, `409 last_admin_removal` |
| `GET` | `/identity/identities/{identityId}/operational-access` | Admin session | `AcceptedResult<{ identity: IdentitySummary; effectiveAdmin: boolean }>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_required`, `404 identity_not_found` |
| `GET` | `/identity/audit-events?limit={limit}&cursor={cursor}` | Admin session | `AcceptedResult<AuditEventList>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_required` |

### Request Bodies

```ts
type BootstrapAdminRequest = {
  bootstrapSecret: string;
  displayName: string;
  login: string;
  password: string;
};

type LoginRequest = {
  login: string;
  password: string;
};

type CreateIdentityRequest = {
  displayName: string;
};

type BindLocalPasswordRequest = {
  login: string;
  password: string;
};

type ListAuditEventsQuery = {
  limit?: number;
  cursor?: string;
};

type BootstrapAdminStdin = {
  bootstrapSecret: string;
  password: string;
};
```

### Operator CLI

The first CLI surface is `agonara identity`.

All commands support `--json`. JSON output uses the shared result envelope on stdout. Diagnostics and usage errors go to stderr.

| Command | Input | Accepted output | Rejected output |
|---|---|---|---|
| `agonara identity bootstrap-status --json` | none | `AcceptedResult<BootstrapStatus>` | n/a |
| `agonara identity bootstrap-admin --display-name <name> --login <login> --stdin-json --json` | `BootstrapAdminStdin` from stdin | `AcceptedResult<SessionSummary>` | `RejectedResult` |

### CLI Exit Codes

- `0` for accepted operations;
- `2` for rejected domain or API rules;
- `1` for command usage errors or runtime faults.

The CLI never accepts bootstrap secrets or passwords as command-line argument values.

## Behavior rules

1. `GET /identity/bootstrap/status` returns `available: true` only while first-Admin bootstrap can still be attempted.
2. `POST /identity/bootstrap/admin` maps to `bootstrapFirstAdmin` and follows the same validation, rejection, audit, and last-Admin initialization rules.
3. `POST /identity/bootstrap/admin` sets `agonara_session` only for accepted bootstrap.
4. `POST /identity/bootstrap/admin` never returns or persists the bootstrap secret as an Identity, credential, session, role, or audit actor.
5. `POST /identity/sessions` maps to `login`.
6. `POST /identity/sessions` sets `agonara_session` only for accepted login.
7. `POST /identity/sessions` returns `invalid_credentials` for invalid credentials and disabled Identities so login does not disclose account state.
8. `POST /identity/bootstrap/admin` and `POST /identity/sessions` reject repeated failed attempts with `rate_limited`.
9. `GET /identity/session` maps to `resolveSession` and returns a fresh CSRF token for the active session.
10. `DELETE /identity/session` maps to `logout`, revokes the current session, and clears `agonara_session` on accepted logout.
11. Admin HTTP endpoints reject callers without an active session whose resolved Identity has effective Admin authority.
12. State-changing Admin HTTP endpoints reject missing or invalid CSRF tokens before applying domain changes.
13. HTTP validation rejects missing, empty, or malformed required input with `validation_failed`.
14. HTTP paths containing `{identityId}` reject unknown Identity identifiers with `identity_not_found`.
15. `GET /identity/audit-events` returns `AuditEventSummary` records and paginates responses with `limit` and `cursor`.
16. `GET /identity/audit-events` rejects invalid limits, negative limits, and limits greater than `100` with `validation_failed`.
17. HTTP responses never include password hashes, plaintext passwords, bootstrap secrets, session identifiers, disabled session state, or audit `targetSessionId` values.
18. The API does not expose Student, Program Curator, Program Membership, content, progress, or assessment authority.
19. `agonara identity bootstrap-admin` maps to the same bootstrap contract as `POST /identity/bootstrap/admin`.
20. `agonara identity bootstrap-admin` reads `BootstrapAdminStdin` from stdin and never requires bootstrap secret or password values in process arguments.
21. CLI rejected operations produce `RejectedResult` on stdout and exit with code `2`.
22. CLI usage errors produce diagnostics on stderr and exit with code `1`.

## Tests (required)

### HTTP Bootstrap and Login

1. `GET /identity/bootstrap/status` returns `available: true` before first Admin exists.
2. `POST /identity/bootstrap/admin` accepts a valid bootstrap secret and returns `SessionSummary`.
3. Accepted bootstrap sets `agonara_session` with required cookie attributes.
4. Accepted bootstrap response does not include the bootstrap secret, password, password hash, or session identifier.
5. `POST /identity/bootstrap/admin` rejects a wrong bootstrap secret with `401 invalid_bootstrap_secret`.
6. `POST /identity/bootstrap/admin` rejects after first Admin exists with `409 bootstrap_already_completed`.
7. `GET /identity/bootstrap/status` returns `available: false` after first Admin exists.
8. `POST /identity/sessions` accepts valid credentials and returns `SessionSummary`.
9. Accepted login sets `agonara_session` with required cookie attributes.
10. Accepted login response does not include the password, password hash, or session identifier.
11. `POST /identity/sessions` rejects invalid credentials with `401 invalid_credentials`.
12. `POST /identity/sessions` rejects disabled-Identity credentials with `401 invalid_credentials`.
13. Repeated failed bootstrap and login attempts reject with `429 rate_limited`.

### HTTP Session and CSRF

14. `GET /identity/session` accepts a valid session cookie and returns `SessionSummary`.
15. `GET /identity/session` rejects missing, unknown, expired, revoked, and disabled-Identity sessions with the mapped status and reason.
16. `DELETE /identity/session` rejects a valid session cookie without CSRF header with `403 csrf_required`.
17. `DELETE /identity/session` accepts a valid session cookie and matching CSRF header, then clears the session cookie.
18. A logged-out session cannot resolve through `GET /identity/session`.

### HTTP Admin Operations

19. Admin endpoints reject a valid non-Admin session with `403 admin_required`.
20. `POST /identity/identities` accepts an Admin session with matching CSRF header.
21. `POST /identity/identities` rejects missing CSRF with `403 csrf_required`.
22. `POST /identity/identities/{identityId}/local-password` accepts an Admin session with matching CSRF header.
23. Credential binding response does not include the plaintext password or password hash.
24. Credential binding rejects duplicate login with `409 login_already_bound`.
25. Credential binding rejects a second local password credential for the same Identity with `409 identity_already_has_credential`.
26. `POST /identity/identities/{identityId}/disable` rejects last-Admin removal with `409 last_admin_removal`.
27. `DELETE /identity/identities/{identityId}/admin` rejects last-Admin removal with `409 last_admin_removal`.
28. `GET /identity/identities/{identityId}/operational-access` returns effective Admin state and no product role state.
29. `GET /identity/audit-events` rejects non-Admin sessions with `403 admin_required`.
30. `GET /identity/audit-events` returns paginated `AuditEventSummary` records.
31. `GET /identity/audit-events` rejects invalid limits and limits greater than `100` with `400 validation_failed`.
32. Audit event responses do not include session identifiers or `targetSessionId`.

### CLI

33. `agonara identity bootstrap-status --json` returns `AcceptedResult<BootstrapStatus>` and exits `0`.
34. `agonara identity bootstrap-admin --display-name <name> --login <login> --stdin-json --json` accepts valid `BootstrapAdminStdin`, returns `SessionSummary`, and exits `0`.
35. CLI bootstrap with a wrong secret returns `RejectedResult` with `invalid_bootstrap_secret` on stdout and exits `2`.
36. CLI bootstrap without required stdin input writes usage diagnostics to stderr and exits `1`.
37. CLI help and process arguments do not require bootstrap secrets or passwords as argument values.

### Executable Acceptance

38. A clean instance can be bootstrapped through the CLI, logged into through HTTP, and inspected through `GET /identity/session`.
39. A clean instance can be bootstrapped through HTTP, then rejects a second CLI bootstrap attempt.
40. An Admin can create a second Identity, bind a local password credential, log in as that Identity, and observe Admin endpoints rejecting that non-Admin session.
41. An Admin can grant and revoke Admin authority for a second Identity while last-Admin protection remains enforced.
42. State-changing HTTP requests fail without a valid CSRF token and succeed with the current token from `SessionSummary`.
43. No executable acceptance response exposes a bootstrap secret, plaintext password, password hash, or session identifier in JSON.

## Done criteria

- The HTTP API implements the endpoints, result envelopes, session cookie behavior, CSRF behavior, and status mappings defined above.
- The `agonara identity` CLI implements the bootstrap commands, JSON envelopes, stdin JSON secret handling, and exit codes defined above.
- Executable acceptance scenarios cover bootstrap, login, session resolution, logout, Admin authorization, credential binding, audit-event listing, last-Admin protection, rate limiting, CSRF enforcement, and sensitive-value redaction.
- Request correlation, operational logging, health, diagnostics, and shared redaction behavior match [Operational Cross-Cutting First Slice](operational-cross-cutting-first-slice.md).
- All tests required by this spec and [Identity & Role Management First Slice](identity-role-management-first-slice.md) pass.
