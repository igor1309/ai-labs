---
title: "ADR: Nexum Backend Auth Architecture"
date: 2026-04-05
model: opus-4.6
version: 0.1.0
status: accepted
type: adr
amends:
  - nexum-backend-adr-v0_3_0.md
references:
  - nexum-backend-adr-v0_3_0.md
  - nexum-frontend-auth-adr-v0_1_0.md
  - nexum-openapi-v1.yml
---

# ADR: Nexum Backend Auth Architecture

## Context

The backend ADR (`nexum-backend-adr-v0_3_0.md`) mentions auth verification as part of routing — "handles request parsing, auth verification, and response serialization" — but does not define the auth component as a dependency with a clear contract. Every other async boundary in the backend has a named protocol or pure function with a defined surface. Auth verification does not.

This ADR introduces the backend auth component and amends the backend ADR accordingly.

## Auth Verifier

The auth verifier is an async function dependency of the router:

```
async (token) → Identity | Rejection
```

It receives the Bearer token from the inbound request, verifies it, and returns either a validated identity or a rejection. The router calls it before dispatching to any use case. On rejection, the router returns 401 using the uniform error envelope. Use cases never run without a verified identity.

The verifier is async. Today's implementation (JWT signature and expiry check) is pure compute with no I/O. The async contract avoids closing the door if verification ever requires an external call.

### Identity

`Identity` carries the `sub` claim from the JWT. The router does not check it against an allowed-user list. Any valid JWT issued by the configured auth provider is sufficient to access all endpoints.

Single-user enforcement is a deployment concern: only one account exists in the auth provider. The application does not enforce it. If Nexum ever moves to multi-user, `Identity.sub` is already available for authorization checks.

## Provider Independence

The auth verifier's contract is provider-agnostic. It takes a token string and returns a result. It does not name a specific auth provider, JWT library, or secret source.

The concrete implementation — algorithm, secret source, claims checked — is a composition root decision. The verifier contract has no knowledge of these details. This is consistent with the frontend auth ADR, which keeps the frontend at Bearer-token level, and with the supersession note, which explicitly removed Supabase Auth as a normative cross-system assumption.

The concrete `AuthVerifier` for v1 uses HS256 with a secret read from the `JWT_SECRET` environment variable and verifies the `exp` claim. This is a composition root detail, not a contract detail.

## Amendment to Backend ADR

### Router dependencies revised

The backend ADR defines the router as `Router(addRepo, getRepos, editNote)`. This is amended. The router depends on the auth verifier in addition to the use cases:

```
Router(authVerifier, addRepo, getRepos, editNote)
```

The router calls `authVerifier` on every inbound request before dispatching to a use case. Auth verification is not middleware magic or an implicit framework feature — it is an explicit dependency of the router, injected at the composition root.

The router was further amended to add the `Login` use case and the `POST /auth/login` route, which bypasses `authVerifier`. The current authoritative composition root is in `nexum-backend-adr-v0_3_0.md`.

## Key Principles

All principles from the backend ADR apply. Additionally:

- **Auth is an explicit dependency, not an implicit concern.** The router receives the auth verifier as an injected dependency with a defined contract. It is not hidden in middleware, framework configuration, or ambient state.
- **Provider-agnostic contract.** The verifier takes a token and returns identity or rejection. The concrete provider is a composition root decision.
- **Async by contract.** The verifier is async even when today's implementation is pure compute. This avoids a contract change if verification ever requires I/O.