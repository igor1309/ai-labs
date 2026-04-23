---
title: ADR-003 mvp_01 Product Scope for Read-Only Browse Frontend
status: Accepted
date: 2026-04-23
---

# ADR-003: mvp_01 Product Scope for Read-Only Browse Frontend

## Status

Accepted

## Context

Two prior decisions are already locked:

- the frontend is a direct read-only client to Supabase
- authentication is handled with Supabase Auth and enforced through RLS

Before moving to spec, the remaining product-scope decisions for `mvp_01` must be frozen so that the spec, implementation plan, and test surface stay narrow and do not drift.

This ADR defines the functional scope of the first frontend slice.

## Decision

`mvp_01` is a **single-user, read-only browse frontend** with the following scope:

- frontend connects directly to Supabase
- authentication uses Supabase Auth
- sign-in method is magic link / OTP email
- access is limited to the authenticated user
- frontend reads the existing table as-is
- browse is list-only
- default ordering is newest first
- pagination uses a **Load more** interaction
- initial page size is **50**
- no search
- no filters
- manual refresh is supported
- auth UI is included in scope

The frontend state model for `mvp_01` is:

- `loading`
- `refreshing`
- `loaded`
- `empty`
- `failed`
- `unauthorized`

Session expiration is handled as `unauthorized` rather than as a separate state.

## Rationale

This scope is selected to keep `mvp_01` strictly focused on the smallest useful browse client while still being usable as a real product slice.

The chosen boundary is intentionally narrow:

- enough functionality to authenticate and browse data
- enough interaction to refresh and continue loading more rows
- no additional surface that would expand implementation, state, or testing disproportionately

This avoids premature scope growth in areas such as search, filters, detail views, editing, or realtime behavior.

## Functional Shape

The frontend provides two product capabilities only:

1. authenticate the user
2. browse the table in a list view

Browse behavior is limited to:

- initial list load
- manual refresh
- loading additional rows
- handling empty, failed, and unauthorized conditions

No other read interaction is part of `mvp_01`.

## Alternatives Considered

### 1. Broader browse MVP with detail view

Rejected.

Pros:

- more complete read experience
- more room for row-level presentation

Cons:

- adds navigation and additional screen contract
- increases scope without being necessary for first validation

### 2. Browse MVP with search and/or filters

Rejected.

Pros:

- higher utility for larger datasets
- more precise retrieval

Cons:

- adds query-state complexity
- expands state space and test surface
- not required for the first usable slice

### 3. No auth UI in MVP

Rejected.

Pros:

- narrower visible product surface

Cons:

- pushes credential/session handling complexity elsewhere
- makes the client less self-contained as a real product slice

## Consequences

### Positive

- scope is tightly controlled before spec
- implementation remains aligned with the MVP intent
- test surface stays small and explicit
- the first frontend slice is usable end to end

### Negative

- the first version is intentionally limited
- users cannot inspect row details beyond list presentation
- larger datasets may eventually need search or filters
- future broadening will require explicit follow-up decisions

## Out of Scope

The following are out of scope for `mvp_01`:

- create
- update
- delete
- detail screen
- search
- filters
- realtime updates
- offline behavior
- multi-table composition
- admin features
- separate session-expired state

## Review Trigger

Revisit this ADR if any of the following become true:

- the product needs row detail view
- the dataset becomes impractical to browse without search or filters
- the frontend must support writes
- the product expands beyond single-user access
- the existing table shape stops being suitable for direct frontend consumption
