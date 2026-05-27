---
date: 2026-05-27
model: gpt-5.5-thinking
description: "Operational cross-cutting spec for Agonara v0.0.1."
version: 0.0.1
status: draft
type: spec
---

# Operational Cross-Cutting First Slice

## Goal

Define the minimum operational logging, request correlation, health, diagnostics, redaction, and audit-boundary contract for Agonara v0.0.1, owned by the application platform boundary.

## Public interface

### Request correlation

HTTP clients may send `X-Request-ID`. Every HTTP response returns `X-Request-ID`.

`X-Request-ID` is an opaque printable string with a maximum length of `128` characters.

### Operational health endpoints

| Method | Path | Auth | Accepted response |
|---|---|---|---|
| `GET` | `/operations/health` | none | `OperationalHealth` |
| `GET` | `/operations/diagnostics` | Admin session | `OperationalDiagnostics` |

```ts
type OperationalHealth = {
  status: "ok" | "degraded" | "unavailable";
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
  reason?: string;
};
```

`/operations/health` is safe for load balancers and uptime checks. `/operations/diagnostics` is for authenticated Admin diagnosis.

### Operational log event

Operational logs are structured events:

```ts
type OperationalLogEvent = {
  occurredAt: string;
  severity: "info" | "warning" | "error";
  component: string;
  operation: string;
  requestId?: string;
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

The following values must not appear in operational logs, health responses, diagnostics responses, HTTP fault responses, or CLI diagnostics:

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
6. Every HTTP fault response uses the same request ID as the corresponding operational log event.
7. HTTP fault responses expose only the generic external fault shape defined by the API spec that produced the response.
8. Accepted, rejected, and faulted Identity & Role Management HTTP operations emit at least one completion log event.
9. Completion log events for operations that create audit events include the created `auditEventId`.
10. Completion log events for rejected authorization, authentication, CSRF, validation, and rate-limit decisions include the rejection reason and must not include submitted secrets.
11. Operational log events may include internal Identity identifiers needed for diagnosis, but must not grant or imply authority.
12. Operational logs must not be used as the source of authorization, role, membership, learner-progress, or curator-decision state.
13. Audit events remain the queryable security and domain-change record; operational logs remain the diagnostic record.
14. `/operations/health` does not require authentication and returns only aggregate status, timestamp, and request ID.
15. `/operations/health` must not disclose dependency names, deployment topology, configured secrets, or database details.
16. `/operations/diagnostics` requires an active Admin session.
17. `/operations/diagnostics` returns only coarse check names and statuses from `OperationalCheck`.
18. `/operations/diagnostics` must not disclose configured secrets, database URLs, raw exception messages, SQL text, stack traces, provider API keys, or filesystem paths containing secrets.
19. Backup and restore operations emit operational log events for start, accepted completion, rejected completion, and faulted completion.
20. Operational logs are not required to be included in product data backup unless a later backup/restore spec explicitly makes them part of an operator archive.
21. Product analytics events are out of scope for v0.0.1 and must not be inferred from operational logs.
22. CLI diagnostics follow the same request correlation and redaction rules when a CLI command calls an Agonara backend.

## Tests (required)

Request correlation:

1. An HTTP request without `X-Request-ID` receives an `X-Request-ID` response header.
2. An HTTP request with a valid `X-Request-ID` receives the same value in the response header.
3. An HTTP request with an invalid `X-Request-ID` receives a generated value in the response header.
4. Operational log events emitted during a request include the active request ID.
5. Fault responses and fault log events share the same request ID.

Redaction:

6. Authentication, bootstrap, and credential-binding logs do not include plaintext passwords.
7. Authentication, bootstrap, and credential-binding logs do not include password hashes.
8. Bootstrap logs and diagnostics do not include bootstrap secrets.
9. HTTP logs, diagnostics, and fault responses do not include session identifiers, CSRF tokens, cookie headers, authorization headers, database URLs, API keys, SQL text, stack traces, or raw sensitive request bodies.
10. CLI diagnostics for backend-backed commands do not include bootstrap secrets, passwords, session identifiers, CSRF tokens, or raw sensitive stdin.

Logging:

11. Accepted Identity & Role Management HTTP operations emit completion log events.
12. Rejected Identity & Role Management HTTP operations emit completion log events with rejection reason.
13. Faulted Identity & Role Management HTTP operations emit completion log events with `errorKind: "unexpected"` or `errorKind: "dependency"`.
14. Operations that create audit events include `auditEventId` in the corresponding completion log event.
15. Rejected authentication, authorization, CSRF, validation, and rate-limit decisions log the reason without submitted secrets.
16. Backup and restore start, accepted completion, rejected completion, and faulted completion emit operational log events.

Health and diagnostics:

17. `GET /operations/health` succeeds without authentication and returns only `status`, `checkedAt`, and `requestId`.
18. `GET /operations/health` does not disclose dependency names or deployment topology.
19. `GET /operations/diagnostics` rejects unauthenticated and non-Admin sessions.
20. `GET /operations/diagnostics` accepts an Admin session and returns `OperationalDiagnostics`.
21. `GET /operations/diagnostics` redacts secrets, raw exception messages, SQL text, stack traces, provider API keys, and secret-bearing filesystem paths.

Boundary:

22. Operational logs are not read as authorization, role, membership, learner-progress, or curator-decision state.
23. Product analytics events are not emitted from v0.0.1 operational logging.

## Done criteria

- HTTP request handling implements request ID generation, propagation, response headers, and operational log correlation.
- Operational logs use the structured `OperationalLogEvent` shape for accepted, rejected, and faulted first-slice operations.
- Health and diagnostics endpoints implement the response shapes, authentication boundary, and redaction rules defined above.
- Redaction tests cover authentication, bootstrap, credential binding, faults, diagnostics, and CLI diagnostics.
- Executable acceptance scenarios prove request correlation, redacted faults, Admin-only diagnostics, and the audit/log boundary.
