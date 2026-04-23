---
title: ADR-003 Single-User Scope for mvp_01 Frontend
status: Accepted
date: 2026-04-23
---

# ADR-003: Single-User Scope for mvp_01 Frontend

## Status

Accepted

## Related ADRs

- **Frontend ADR-001** — architectural shape (direct, read-only Supabase).
- **Frontend ADR-002** — auth boundary (Supabase Auth + RLS on `authenticated`). This ADR constrains the authorization rule that ADR-002 deliberately left open.
- **Frontend ADR-004** — read-model contract for the browsed table.

## Context

Notio is explicitly a **personal capture service**, not a marketable product (`notio/README.md:3`). `mvp_01` exists for simplicity and discovery, and no product requirement calls for user separation, sharing, tenancy, or audit of ownership.

ADR-002 locked the boundary (Supabase Auth + RLS scoped to the `authenticated` role) but intentionally deferred the actual authorization rule — i.e. *which rows which authenticated user may read*. With a personal product, that rule is trivial, and naming it now prevents accidental drift into a multi-user model.

The capture side ingests items through a Telegram webhook (see capture ADR-001 for system boundaries). The frontend could in principle be bridged to the Telegram identity, but doing so for a single-user product would add surface area for no product benefit.

## Decision

The `mvp_01` frontend is a **single-user application**.

Concretely:

- The product has exactly one end user.
- The data model carries **no per-row ownership column** — `captured_items` is treated as a single shared inbox.
- Supabase Auth is used as a **binary gate**: any authenticated session MAY read every row; any request without an authenticated session MUST be denied. There are no per-user rules.
- The frontend Supabase Auth identity is **not coupled** to the Telegram capture identity. No identity-bridging table, no `user_id` mapping, no join between them.
- "Sign-up" is out of scope. Account provisioning is manual (one account, created once, out of band).

## Rationale

- Matches the stated product intent (personal, discovery).
- Keeps the auth boundary that ADR-002 locked while making its authorization rule concrete and minimal.
- Avoids premature multi-tenancy plumbing (user_id columns, per-user RLS predicates, invite flows, onboarding UX) that would have no user.
- Leaves ADR-002's shape intact if the product ever goes multi-user — only the authorization rule would need revising, not the boundary.

## Architectural Shape

- There is exactly one Supabase Auth user for the frontend.
- RLS policy on `captured_items` grants `SELECT` to the `authenticated` role unconditionally (no `user_id = auth.uid()` predicate — there is no `user_id`).
- The capture pipeline remains identity-agnostic on the write side; it does not write a `user_id`, and nothing in this ADR asks it to.
- Sign-in UX may be trivial (one credential pair); a shared sign-in form is sufficient because no other users exist.

## Security Model

Single-user scope does not change ADR-002's security model; it narrows it:

- The Supabase service-role key remains forbidden in the client (ADR-002 §Security Model).
- The publishable (anon) API key remains the only Supabase key in the client bundle.
- RLS remains enabled on `captured_items`; the policy body is the coarsest authenticated-read rule (see Enforcement).
- No `anon`-role read policy is permitted.

## Alternatives Considered

### 1. Single-user, no ownership column (chosen)

Pros: minimal; matches product intent; avoids schema debt; reversible by adding a migration + policy later.
Cons: if the product becomes multi-user, a data migration is needed to back-fill ownership — acceptable because `mvp_01` is explicitly discovery scope.

### 2. Multi-user with per-row ownership (`user_id = auth.uid()`)

Rejected for `mvp_01`.

Pros: future-proof for sharing/tenancy; aligns RLS shape with common Supabase patterns.
Cons: requires a bridge between Telegram capture identity and Supabase Auth identity, a `user_id` column on `captured_items`, back-fill for existing rows, onboarding for additional users, all for zero current product benefit.

### 3. No auth on the frontend (public read)

Rejected.

Pros: simplest possible.
Cons: contradicts ADR-002; exposes the personal inbox publicly.

## Consequences

### Positive

- No identity coupling to the capture side — the two sides remain independently evolvable.
- RLS policy is one line.
- The frontend has no onboarding surface to design.
- The spec-writing phase can proceed without a tenancy model.

### Negative

- If the product ever needs more than one user, a migration + policy rewrite is required (acceptable, called out in the Review Trigger).
- Any feature that would need "whose item is this" (share, assign, audit) is explicitly unavailable without revisiting this ADR.

## Enforcement

These rules make the decision drift-resistant:

- `captured_items` MUST NOT gain a `user_id` (or any ownership-attribution) column without an ADR amendment to this ADR.
- The RLS policy on `captured_items` MUST NOT reference `auth.uid()` while this ADR is in force.
- The frontend MUST NOT implement a sign-up flow, a user-list view, or any per-user filter.
- The frontend MUST NOT read, cache, or forward any Telegram identity from captured rows for authorization purposes (there is no such column to begin with; this rule prevents accidental reintroduction).
- PR review checklist item: "no per-user concept introduced on either side."

## Non-Goals

This ADR does not define:

- exact sign-in method (deferred to spec)
- credential rotation policy
- number of devices the single user may use simultaneously
- any future multi-user design

## Review Trigger

Revisit this ADR if any of the following become true:

- Notio is offered to more than one human user.
- Sharing, assigning, or per-user filtering becomes a product goal.
- The capture side starts attributing rows to a specific identity that the frontend needs to respect.
- Regulatory or privacy requirements demand per-user isolation even for a personal product.
