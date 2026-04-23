---
title: ADR-002 Auth Model for mvp_01 Read-Only Supabase Frontend
status: Accepted
date: 2026-04-23
---

# ADR-002: Auth Model for mvp_01 Read-Only Supabase Frontend

## Status

Accepted

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

Access to the browse table will be controlled by **Row Level Security** policies scoped to authenticated access.

The frontend will not use:

- anonymous public table access
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

## Security Model

The frontend uses:

- Supabase publishable client configuration
- authenticated user session
- RLS policies for read authorization

The frontend must never use privileged server credentials.

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

## Non-Goals

This ADR does not define:

- exact sign-in method
- UI of the sign-in flow
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
