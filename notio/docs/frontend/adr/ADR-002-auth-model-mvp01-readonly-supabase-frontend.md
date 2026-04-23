---
title: ADR-002 Auth Model for mvp_01 Read-Only Supabase Frontend
status: Accepted
date: 2026-04-23
---

# ADR-002: Auth Model for mvp_01 Read-Only Supabase Frontend

## Status

Accepted

## Related ADRs

- **Frontend ADR-001** — architectural shape (direct, read-only) that this auth boundary sits inside. ADR-001 sets the shape; ADR-002 is the canonical source for the auth/security model it refers to.
- **Frontend ADR-003** — product scope; pins the concrete sign-in method (magic link / OTP email) that this ADR leaves open.
- **Frontend ADR-004** — read-model contract; names the table and columns this boundary protects.
- **Frontend ADR-005** — single-user data model; pins the concrete authorization rule that this ADR leaves open ("any authenticated session reads everything; no per-row ownership").
- **Frontend ADR-006** — platform, hosting, and repo layout; names the `VITE_*` env-var mechanism that injects the publishable/anon key for this boundary without ever exposing the service-role key.

## Context

`mvp_01` defines a minimal frontend with the following constraints:

- direct frontend access to Supabase
- one-table browse capability
- no create, update, or delete
- thin client preferred
- no backend-for-frontend in this slice

The remaining architectural question is how access to the browsed data is controlled.

Because the frontend connects directly to Supabase, the chosen auth model must fit that boundary and remain proportionate to the narrow scope of `mvp_01`.

## Decision

The frontend will use **Supabase Auth** and access the table as an **authenticated client**.

Every read MUST be made under a Supabase Auth session belonging to a real signed-in user. Supabase anonymous sign-in sessions are out of scope for `mvp_01` and MUST NOT be used.

Access to the browse table will be controlled by **Row Level Security** policies scoped to the Supabase `authenticated` role. The concrete policy body is pinned by ADR-005 (single-user data model): the RLS predicate is the coarsest authenticated-read rule, with no per-row ownership check.

The frontend will not use:

- anonymous public table access
- Supabase anonymous sign-in sessions
- custom backend-issued sessions
- a separate application-owned session layer for `mvp_01`

## Rationale

This decision preserves the thin-client architecture while avoiding openly readable data.

It is selected because it gives the minimum viable control model that fits direct frontend access:

- compatible with direct frontend -> Supabase architecture
- no additional backend required for session issuance
- native fit with RLS-based access control
- simpler than introducing an application-owned auth boundary for a browse-only MVP

For this slice, custom server-managed sessions would add a responsibility that does not justify itself yet.

Public anonymous reads are rejected because they make the table effectively open to anyone who can reach the client configuration.

## Architectural Shape

The auth boundary for `mvp_01` is:

- frontend authenticates user with Supabase Auth
- Supabase issues the client session
- frontend reads the table as an authenticated user
- RLS determines whether the authenticated user may read rows

This keeps auth and data access within one architectural boundary rather than splitting them across a custom application backend and Supabase.

Session lifecycle (storage, refresh, sign-out) is owned by the Supabase client SDK. The application MUST NOT persist the access token outside the SDK's own storage and MUST NOT forward it to any other system.

## Security Model

This section is the canonical security model for the `mvp_01` frontend; ADR-001 defers to it.

The frontend uses:

- the Supabase **publishable (anon) API key** — the only Supabase key permitted in the client bundle
- a Supabase Auth session belonging to a signed-in user
- RLS policies scoped to the Supabase `authenticated` role for read authorization

The frontend MUST NEVER use privileged server credentials. In particular, the Supabase service-role key MUST NOT be present in the client bundle, build environment, or any configuration reachable from the client.

Privileged access, ingestion, enrichment, or administrative operations remain outside the frontend and outside this ADR.

## Alternatives Considered

### 1. Supabase Auth + RLS

Chosen.

Pros:

- native fit for direct Supabase frontend architecture
- minimal additional infrastructure
- avoids public read access
- keeps enforcement in the database boundary

Cons:

- frontend remains coupled to Supabase auth model
- future migration to application-owned auth would require change

### 2. Anonymous public read access

Rejected.

Pros:

- simplest setup
- fastest possible browse implementation

Cons:

- data becomes effectively public
- no meaningful per-user access control
- poor fit unless the product intentionally exposes public content

### 3. Custom backend-managed auth/session layer

Rejected for `mvp_01`.

Pros:

- maximum control over auth boundary
- hides Supabase auth details from the frontend
- easier place for future cross-system session ownership

Cons:

- requires an additional backend responsibility
- adds complexity disproportionate to browse-only MVP
- conflicts with the selected thin-client direction

## Consequences

### Positive

- read access is not public
- frontend remains thin
- auth and authorization align with the chosen direct Supabase architecture
- the MVP avoids introducing a BFF only to solve session issuance

### Negative

- the frontend is intentionally tied to Supabase Auth for this slice
- future migration to an application-owned auth model would require refactoring
- the product must accept Supabase as both auth and read-data boundary for `mvp_01`

## Enforcement

These rules make the decision drift-resistant. Each must be verifiable by review or CI:

- RLS MUST be enabled on every table the frontend can reach via the publishable key. A CI check (Supabase advisor lint, migration review, or equivalent) MUST fail otherwise.
- No RLS policy MUST grant read to the `anon` role on a frontend-reachable table without an ADR amendment.
- The frontend bundle and its build environment MUST NOT contain the Supabase service-role key; a secret-scan / grep gate MUST fail the build otherwise.
- The frontend MUST NOT call Supabase anonymous sign-in APIs; a lint or review check flags use of `signInAnonymously` (or equivalent).
- PR review checklist item: "reads run under an authenticated Supabase session; no service-role or privileged key touched by the client."

## Non-Goals

This ADR does not define:

- UI of the sign-in flow (the method itself is decided in ADR-003)
- multi-tenant rules
- admin access patterns
- write permissions
- backend auth model for non-frontend services
- capture-side authentication

## Review Trigger

Revisit this ADR if any of the following become true:

- the product requires application-owned sessions
- auth must be shared across multiple non-Supabase backends
- the frontend must access privileged server-owned logic
- the data becomes intentionally public
- the product moves beyond simple read-only browse
