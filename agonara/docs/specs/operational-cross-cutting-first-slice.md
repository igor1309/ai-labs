---
date: 2026-05-27
model: gpt-5.5-thinking
description: "Operational cross-cutting spec for Agonara v0.0.1."
version: 0.0.1
status: implemented
type: spec
---

# Operational Cross-Cutting First Slice

## Goal

Define the minimum operational logging, request correlation, health, diagnostics, redaction, and audit-boundary contract for Agonara v0.0.1, owned by the application platform boundary.

## Implementation status

Implemented by [Identity and Operations First-Slice Implementation Plan](../plans/implemented/identity-and-operations-first-slice.md), with deployed-version health response extension specified by [Operations Health Version](operations-health-version.md).

### Implementation Evidence

- HTTP request correlation, health, diagnostics, fault response, completion logging, and redaction boundary: [server.js](../../src/server.js)
- Backend-initiated backup/restore operational logging: [identity.js](../../src/identity.js)
- Focused HTTP operational coverage for request IDs, health, diagnostics, fault redaction, completion logs, rejected logs, and sensitive-value redaction: [http-api-logging.test.js](../../tests/http-api-logging.test.js), [http-api-server.test.js](../../tests/http-api-server.test.js), [http-api-assessment-validation.test.js](../../tests/http-api-assessment-validation.test.js)
- Backup/restore operational log coverage: [backup-restore.test.js](../../tests/backup-restore.test.js)
- CLI diagnostic redaction and usage-error coverage: [cli.test.js](../../tests/cli.test.js)
- End-to-end acceptance coverage for Admin-only diagnostics and request correlation: [executable-acceptance.test.js](../../tests/executable-acceptance.test.js)

The implemented operational slice provides request ID generation/propagation, structured completion logs for accepted/rejected/faulted HTTP requests, generic redacted fault responses, unauthenticated health, Admin-only diagnostics, and backup/restore operational log events. The shipped health response also includes a `version` field from the later accepted health-version extension, while preserving the operational boundary against secrets, dependency topology, authorization state, product analytics, learner progress, and curator decisions.

## Public interface

### Request correlation

HTTP clients may send `X-Request-ID`. Every HTTP response returns `X-Request-ID`.

`X-Request-ID` is valid only when it is `1` to `128` characters long and contains only ASCII letters, ASCII digits, `.`, `_`, `-`, or `:`.

### Operational health endpoints

| Method | Path | Auth | Accepted response | Rejected status mapping |
|---|---|---|---|---|
| `GET` | `/operations/health` | none | `OperationalHealth` | n/a |
| `GET` | `/operations/diagnostics` | Admin session | `OperationalDiagnostics` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_required` |

```ts
type OperationalHealth = {
  status: "ok" | "degraded" | "unavailable";
  version: string;
  checkedAt: string;
  requestId: string;
};

type OperationalDiagnostics = {
  status: "ok" | "degraded" | "unavailable";
  generatedAt: string;
  requestId: string;
  checks: OperationalCheck[];
};

type OperationalCheck = {
  name: "database" | "storage" | "identity" | "backup" | "background_jobs";
  status: "ok" | "degraded" | "unavailable";
  observedAt: string;
  reason?: "not_configured" | "unreachable" | "degraded" | "stale" | "faulted";
};
```

`/operations/health` is safe for load balancers and uptime checks. `/operations/diagnostics` is for authenticated Admin diagnosis.

### Operational log event

Operational logs use this structured event shape.

```ts
type ComponentName =
  | "identity-role-management"
  | "program-membership"
  | "corpus-storage"
  | "curator-workspace"
  | "student-workspace"
  | "operations"
  | "backup-restore";

type OperationalLogEvent = {
  occurredAt: string;
  severity: "info" | "warning" | "error";
  component: ComponentName;
  operation: string;
  requestId: string;
  actorIdentityId?: string;
  targetIdentityId?: string;
  auditEventId?: string;
  outcome?: "accepted" | "rejected" | "fault";
  reason?: string;
  durationMs?: number;
  errorKind?: "validation" | "authentication" | "authorization" | "rate_limit" | "dependency" | "unexpected";
};
```

Operational logs are diagnostic records. They are not product state, audit records, authorization state, learning state, or product analytics.

### Redacted fields

These values must not appear in operational logs, health responses, diagnostics responses, HTTP fault responses, or CLI diagnostics.

- plaintext passwords;
- password hashes;
- bootstrap secrets;
- session identifiers;
- CSRF tokens;
- cookie headers;
- authorization headers;
- raw request bodies for authentication, credential-binding, or bootstrap operations;
- infrastructure secrets, database URLs, API keys, and filesystem paths containing secrets.

## Behavior rules

1. Every HTTP request receives a request ID before application behavior is evaluated.
2. If a request supplies a valid `X-Request-ID`, the response uses that value.
3. If a request omits `X-Request-ID`, the response uses a generated request ID.
4. If a request supplies an invalid `X-Request-ID`, the response uses a generated request ID.
5. Every operational log event emitted during request handling includes the active request ID.
6. Backend-initiated work that is not handling an HTTP request receives a generated request ID before the work emits operational logs.
7. Every HTTP fault response uses the same request ID as the corresponding operational log event.
8. HTTP fault responses expose only the generic external fault shape defined by the API spec that produced the response.
9. Accepted, rejected, and faulted Identity & Role Management HTTP operations emit at least one completion log event.
10. Completion log events for operations that create audit events include the created `auditEventId`.
11. Completion log events for rejected authorization, authentication, CSRF, validation, and rate-limit decisions include the rejection reason and must not include submitted secrets.
12. Operational log events may include internal Identity identifiers needed for diagnosis, but must not grant or imply authority.
13. Operational logs must not be used as the source of authorization, role, membership, learner-progress, or curator-decision state.
14. Audit events remain the queryable security and domain-change record; operational logs remain the diagnostic record.
15. `/operations/health` does not require authentication and returns only aggregate status, deployed version, timestamp, and request ID.
16. `/operations/health` must not disclose dependency names, deployment topology, configured secrets, or database details.
17. `/operations/diagnostics` requires an active Admin session.
18. `/operations/diagnostics` returns only coarse check names, statuses, timestamps, and coarse `reason` values from `OperationalCheck`.
19. `/operations/diagnostics` must not disclose configured secrets, database URLs, raw exception messages, SQL text, stack traces, provider API keys, or filesystem paths containing secrets.
20. Backup and restore operations emit operational log events for start, accepted completion, rejected completion, and faulted completion.
21. Operational logs are not required to be included in product data backup unless a later backup/restore spec explicitly makes them part of an operator archive.
22. Product analytics events are out of scope for v0.0.1 and must not be inferred from operational logs.
23. CLI diagnostics follow the same request correlation and redaction rules when a CLI command calls an Agonara backend.

## Tests (required)

### Request Correlation

1. An HTTP request without `X-Request-ID` receives an `X-Request-ID` response header.
2. An HTTP request with a valid `X-Request-ID` receives the same value in the response header.
3. An HTTP request with an invalid `X-Request-ID` receives a generated value in the response header.
4. Valid request IDs accept only ASCII letters, ASCII digits, `.`, `_`, `-`, and `:`, and reject empty values and values longer than `128` characters.
5. Operational log events emitted during a request include the active request ID.
6. Backend-initiated work emits operational log events with a generated request ID.
7. Fault responses and fault log events share the same request ID.

### Redaction

8. Authentication, bootstrap, and credential-binding logs do not include plaintext passwords.
9. Authentication, bootstrap, and credential-binding logs do not include password hashes.
10. Bootstrap logs and diagnostics do not include bootstrap secrets.
11. HTTP logs, diagnostics, and fault responses do not include session identifiers, CSRF tokens, cookie headers, authorization headers, database URLs, API keys, SQL text, stack traces, or raw sensitive request bodies.
12. CLI diagnostics for backend-backed commands do not include bootstrap secrets, passwords, session identifiers, CSRF tokens, or raw sensitive stdin.

### Logging

13. Accepted Identity & Role Management HTTP operations emit completion log events.
14. Rejected Identity & Role Management HTTP operations emit completion log events with rejection reason.
15. Faulted Identity & Role Management HTTP operations emit completion log events with `errorKind: "unexpected"` or `errorKind: "dependency"`.
16. Operations that create audit events include `auditEventId` in the corresponding completion log event.
17. Rejected authentication, authorization, CSRF, validation, and rate-limit decisions log the reason without submitted secrets.
18. Backup and restore start, accepted completion, rejected completion, and faulted completion emit operational log events.
19. Operational log events use component names from `ComponentName`.

### Health and Diagnostics

20. `GET /operations/health` succeeds without authentication and returns only `status`, `version`, `checkedAt`, and `requestId`.
21. `GET /operations/health` does not disclose dependency names or deployment topology.
22. `GET /operations/diagnostics` rejects unauthenticated and non-Admin sessions with the mapped status and reason.
23. `GET /operations/diagnostics` accepts an Admin session and returns `OperationalDiagnostics`.
24. `GET /operations/diagnostics` returns only `OperationalCheck.reason` values from the allowed coarse reason union.
25. `GET /operations/diagnostics` redacts secrets, raw exception messages, SQL text, stack traces, provider API keys, and secret-bearing filesystem paths.

### Boundary

26. Operational logs are not read as authorization, role, membership, learner-progress, or curator-decision state.
27. Product analytics events are not emitted from v0.0.1 operational logging.

## Done criteria

- HTTP request handling implements request ID generation, propagation, response headers, and operational log correlation.
- Operational logs use the structured `OperationalLogEvent` shape for accepted, rejected, and faulted first-slice operations.
- Health and diagnostics endpoints implement the response shapes, authentication boundary, and redaction rules defined above.
- Redaction tests cover authentication, bootstrap, credential binding, faults, diagnostics, and CLI diagnostics.
- Executable acceptance scenarios prove request correlation, redacted faults, Admin-only diagnostics, and the audit/log boundary.
