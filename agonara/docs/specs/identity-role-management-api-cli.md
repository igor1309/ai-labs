---
date: 2026-05-27
model: gpt-5.5-thinking
description: "API, CLI, and executable acceptance spec for Agonara Identity & Role Management v0.0.1."
version: 0.0.1
status: draft
type: spec
---

# Identity & Role Management API and CLI

## Goal

Define the public HTTP API, operator CLI, and executable acceptance scenarios for Agonara Identity & Role Management v0.0.1, owned by Identity & Role Management.

## Public interface

### Shared result envelope

Successful HTTP and CLI operations return:

```ts
type AcceptedResult<T> = {
  status: "accepted";
  value: T;
};
```

Rejected HTTP and CLI operations return:

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
  | "csrf_invalid";
```

HTTP `5xx` responses return a generic fault envelope that does not include secrets, password hashes, session identifiers, stack traces, SQL text, or infrastructure details.

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
```

`csrfToken` is an opaque token bound to the server-side session.

### HTTP session transport

The HTTP API authenticates browser clients with a server-managed session cookie named `agonara_session`.

Cookie requirements:

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
| `POST` | `/identity/bootstrap/admin` | bootstrap secret | `AcceptedResult<SessionSummary>` and session cookie | `400 validation_failed`, `401 invalid_bootstrap_secret`, `409 bootstrap_already_completed` |
| `POST` | `/identity/sessions` | none | `AcceptedResult<SessionSummary>` and session cookie | `400 validation_failed`, `401 invalid_credentials`, `403 identity_disabled` |
| `GET` | `/identity/session` | session cookie | `AcceptedResult<SessionSummary>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled` |
| `DELETE` | `/identity/session` | session cookie and CSRF header | `AcceptedResult<{ loggedOut: true }>` and cleared session cookie | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 csrf_required`, `403 csrf_invalid` |
| `GET` | `/identity/identities` | Admin session | `AcceptedResult<{ identities: IdentitySummary[] }>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_required` |
| `POST` | `/identity/identities` | Admin session and CSRF header | `AcceptedResult<IdentitySummary>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_required`, `403 csrf_required`, `403 csrf_invalid` |
| `POST` | `/identity/identities/{identityId}/local-password` | Admin session and CSRF header | `AcceptedResult<{ credentialBound: true }>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_required`, `403 csrf_required`, `403 csrf_invalid`, `404 identity_not_found`, `409 login_already_bound`, `409 identity_already_has_credential` |
| `POST` | `/identity/identities/{identityId}/disable` | Admin session and CSRF header | `AcceptedResult<IdentitySummary>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_required`, `403 csrf_required`, `403 csrf_invalid`, `404 identity_not_found`, `409 last_admin_removal` |
| `POST` | `/identity/identities/{identityId}/admin` | Admin session and CSRF header | `AcceptedResult<IdentitySummary>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_required`, `403 csrf_required`, `403 csrf_invalid`, `404 identity_not_found` |
| `DELETE` | `/identity/identities/{identityId}/admin` | Admin session and CSRF header | `AcceptedResult<IdentitySummary>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_required`, `403 csrf_required`, `403 csrf_invalid`, `404 identity_not_found`, `409 last_admin_removal` |
| `GET` | `/identity/identities/{identityId}/operational-access` | Admin session | `AcceptedResult<{ identity: IdentitySummary; effectiveAdmin: boolean }>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_required`, `404 identity_not_found` |
| `GET` | `/identity/audit-events` | Admin session | `AcceptedResult<{ auditEvents: unknown[] }>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_required` |

Request bodies:

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
```

### Operator CLI

The first CLI surface is `agonara identity`.

All commands support `--json`. JSON output uses the shared result envelope on stdout. Diagnostics and usage errors go to stderr.

| Command | Input | Accepted output | Rejected output |
|---|---|---|---|
| `agonara identity bootstrap-status --json` | none | `AcceptedResult<BootstrapStatus>` | n/a |
| `agonara identity bootstrap-admin --display-name <name> --login <login> --secret-stdin --password-stdin --json` | bootstrap secret from stdin before password, separated by a newline | `AcceptedResult<SessionSummary>` | `RejectedResult` |

CLI exit codes:

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
7. `GET /identity/session` maps to `resolveSession` and returns a fresh CSRF token for the active session.
8. `DELETE /identity/session` maps to `logout`, revokes the current session, and clears `agonara_session` on accepted logout.
9. Admin HTTP endpoints reject callers without an active session whose resolved Identity has effective Admin authority.
10. State-changing Admin HTTP endpoints reject missing or invalid CSRF tokens before applying domain changes.
11. HTTP validation rejects missing, empty, or malformed required input with `validation_failed`.
12. HTTP paths containing `{identityId}` reject unknown Identity identifiers with `identity_not_found`.
13. HTTP responses never include password hashes, plaintext passwords, bootstrap secrets, session identifiers, or disabled session state.
14. The API does not expose Student, Program Curator, Program Membership, content, progress, or assessment authority.
15. `agonara identity bootstrap-admin` maps to the same bootstrap contract as `POST /identity/bootstrap/admin`.
16. `agonara identity bootstrap-admin` reads the bootstrap secret and password from stdin and never requires either value in process arguments.
17. CLI rejected operations produce `RejectedResult` on stdout and exit with code `2`.
18. CLI usage errors produce diagnostics on stderr and exit with code `1`.

## Tests (required)

HTTP bootstrap and login:

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

HTTP session and CSRF:

12. `GET /identity/session` accepts a valid session cookie and returns `SessionSummary`.
13. `GET /identity/session` rejects missing, unknown, expired, revoked, and disabled-Identity sessions with the mapped status and reason.
14. `DELETE /identity/session` rejects a valid session cookie without CSRF header with `403 csrf_required`.
15. `DELETE /identity/session` accepts a valid session cookie and matching CSRF header, then clears the session cookie.
16. A logged-out session cannot resolve through `GET /identity/session`.

HTTP Admin operations:

17. Admin endpoints reject a valid non-Admin session with `403 admin_required`.
18. `POST /identity/identities` accepts an Admin session with matching CSRF header.
19. `POST /identity/identities` rejects missing CSRF with `403 csrf_required`.
20. `POST /identity/identities/{identityId}/local-password` accepts an Admin session with matching CSRF header.
21. Credential binding response does not include the plaintext password or password hash.
22. Credential binding rejects duplicate login with `409 login_already_bound`.
23. Credential binding rejects a second local password credential for the same Identity with `409 identity_already_has_credential`.
24. `POST /identity/identities/{identityId}/disable` rejects last-Admin removal with `409 last_admin_removal`.
25. `DELETE /identity/identities/{identityId}/admin` rejects last-Admin removal with `409 last_admin_removal`.
26. `GET /identity/identities/{identityId}/operational-access` returns effective Admin state and no product role state.
27. `GET /identity/audit-events` rejects non-Admin sessions with `403 admin_required`.

CLI:

28. `agonara identity bootstrap-status --json` returns `AcceptedResult<BootstrapStatus>` and exits `0`.
29. `agonara identity bootstrap-admin --display-name <name> --login <login> --secret-stdin --password-stdin --json` accepts valid stdin values, returns `SessionSummary`, and exits `0`.
30. CLI bootstrap with a wrong secret returns `RejectedResult` with `invalid_bootstrap_secret` on stdout and exits `2`.
31. CLI bootstrap without required stdin input writes usage diagnostics to stderr and exits `1`.
32. CLI help and process arguments do not require bootstrap secrets or passwords as argument values.

Executable acceptance:

33. A clean instance can be bootstrapped through the CLI, logged into through HTTP, and inspected through `GET /identity/session`.
34. A clean instance can be bootstrapped through HTTP, then rejects a second CLI bootstrap attempt.
35. An Admin can create a second Identity, bind a local password credential, log in as that Identity, and observe Admin endpoints rejecting that non-Admin session.
36. An Admin can grant and revoke Admin authority for a second Identity while last-Admin protection remains enforced.
37. State-changing HTTP requests fail without a valid CSRF token and succeed with the current token from `SessionSummary`.
38. No executable acceptance response exposes a bootstrap secret, plaintext password, password hash, or session identifier in JSON.

## Done criteria

- The HTTP API implements the endpoints, result envelopes, session cookie behavior, CSRF behavior, and status mappings defined above.
- The `agonara identity` CLI implements the bootstrap commands, JSON envelopes, stdin secret handling, and exit codes defined above.
- Executable acceptance scenarios cover bootstrap, login, session resolution, logout, Admin authorization, credential binding, last-Admin protection, CSRF enforcement, and sensitive-value redaction.
- All tests required by this spec and [Identity & Role Management First Slice](identity-role-management-first-slice.md) pass.
