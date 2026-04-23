---
title: ADR-001 Frontend Architecture for mvp_01 Browse Client
status: Accepted
date: 2026-04-23
---

# ADR-001: Frontend Architecture for mvp_01 Browse Client

## Status

Accepted

## Related ADRs

- **Frontend ADR-002** — auth model and security boundary for this client.
- **Frontend ADR-005** — single-user data model for `mvp_01` (pins the authorization rule and the no-ownership data model).
- **Frontend ADR-004** — read-model contract (names the concrete table and public columns consumed by this client).
- **Capture ADR-003** (`../../adr/adr-003-supabase-backed-storage-implementation.md`) — the write side that owns the Supabase project this frontend reads from.

## Context

The product needs a minimal frontend for `mvp_01`.

Scope of this slice:

- one Supabase-backed table
- browse only
- no create, update, or delete
- thin client preferred
- low implementation and operational complexity for the first version

The question is specifically about **frontend architecture**, not implementation detail.

The capture/write side is defined in capture ADR-003 (`../../adr/adr-003-supabase-backed-storage-implementation.md`); this ADR covers only the read-side consumer of the same Supabase project.

## Decision

The frontend will be a **direct read-only client to Supabase** using the official client library.

The architecture is:

- frontend application
- direct connection to Supabase for reads
- Supabase Row Level Security governs access (see ADR-002 for the auth model)
- no backend-for-frontend for this slice
- no write capability in the frontend

Read-only means the client MUST NOT call any Supabase mutating method (`insert`, `update`, `upsert`, `delete`, or `rpc` with side effects). RLS policies for the browse table MUST deny write to the role used by the client.

The frontend is a **read-side browse client**: the browsed table row IS the read model, and the client MUST NOT own a separate domain model on top of it.

## Rationale

This option is selected because it best matches the constraints of `mvp_01`:

- simplest architecture
- thinnest client-server path
- lowest delivery overhead
- no redundant server layer for a read-only browse use case
- aligned with the goal of validating the product slice before adding more infrastructure

For a single-table, read-only MVP, a BFF would mostly add surface area, hosting, failure modes, and maintenance burden without providing proportional value.

## Architectural Shape

The frontend should be organized around one feature: **browse items**.

At the architectural level, the client consists of:

- UI layer for browsing the table
- read-side data access layer using Supabase
- feature-level state for loading, loaded, empty, and failed states

The frontend should treat the table as a **read model** for browsing.

Supabase access MUST be reached through a feature-owned read protocol (e.g. `BrowseItemsReader`) defined alongside its only consumer; the Supabase implementation is wired at the composition root. No Supabase symbol is imported by UI code. This preserves the single realistic escape hatch identified below (a later move to BFF) without changing UI.

The architecture explicitly excludes:

- mutation flows
- offline support
- realtime subscriptions
- a client-owned domain model on top of the browsed row
- custom backend aggregation
- cross-feature abstraction intended for future unimplemented cases

## Security Model

The frontend uses the Supabase **publishable (anon) API key** — no other Supabase key is permitted in the client bundle or its build-time environment; service-role or any privileged key MUST NOT be present.

Access control is enforced through Supabase RLS policies. The full auth/authorization boundary (identity, session, role) is defined in ADR-002; this ADR does not duplicate it.

This ADR assumes that direct frontend reads are acceptable for the data exposure model of `mvp_01`.

If later requirements introduce stricter secrecy, private server-side enrichment, cross-table composition, or non-trivial authorization rules, this decision should be revisited.

## Alternatives Considered

### 1. Frontend -> Supabase direct read access

Chosen.

Pros:

- minimal architecture
- fast to deliver
- fewer moving parts
- no extra backend to design, deploy, and maintain

Cons:

- frontend is coupled directly to Supabase as a runtime dependency
- some future policy or aggregation needs may force a later architectural change

### 2. Frontend -> Backend/BFF -> Supabase

Rejected for `mvp_01`.

Pros:

- stronger server-controlled boundary
- easier place for future aggregation, transformation, and custom auth logic
- hides Supabase details from the frontend

Cons:

- additional service to build and operate
- unnecessary complexity for browse-only MVP
- slower path to first usable version

## Consequences

### Positive

- `mvp_01` remains small and focused
- frontend work can proceed independently as a read-only browse client
- operational footprint stays minimal
- architecture matches the actual scope of the MVP

### Negative

- a later move to BFF may require refactoring if requirements expand
- direct dependency on Supabase is accepted for this slice
- architectural flexibility is intentionally traded for speed and simplicity

## Enforcement

These rules make the decision drift-resistant. Each must be verifiable by review or CI:

- The frontend package MUST NOT import any Supabase SDK symbol outside the single read-data module that implements the feature-owned read protocol. (The concrete SDK package or module name depends on the chosen platform and will be pinned by the platform ADR; e.g. `@supabase/supabase-js` on web/JS, `Supabase` on Swift.)
- The frontend bundle and its build environment MUST NOT contain the Supabase service-role key; a secret-scan / grep gate MUST fail the build otherwise.
- A unit or integration test MUST assert the Supabase client is constructed with the publishable (anon) key only.
- PR review checklist item: "no mutating Supabase calls (`insert`/`update`/`upsert`/`delete`/side-effecting `rpc`) introduced."
- Any deviation (new server layer, mutation, cross-table composition) requires an ADR amendment before merge.

## Non-Goals

This ADR does not define:

- exact table schema
- UI design
- pagination mechanics
- filtering behavior
- concrete library wrappers beyond the decision to use the official Supabase client
- future edit flows
- capture-side or write-side architecture

## Review Trigger

Revisit this ADR if any of the following become true:

- the frontend must perform writes
- the frontend must combine multiple sources or tables
- authorization logic exceeds practical RLS-only control
- sensitive logic must be hidden from the client
- the product requires server-owned query composition
