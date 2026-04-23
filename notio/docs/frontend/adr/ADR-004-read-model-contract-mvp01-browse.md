---
title: ADR-004 Read-Model Contract for mvp_01 Browse
status: Accepted
date: 2026-04-23
---

# ADR-004: Read-Model Contract for mvp_01 Browse

## Status

Accepted

## Related ADRs

- **Frontend ADR-001** — pins "the browsed table row IS the read model"; this ADR names the concrete table and columns.
- **Frontend ADR-003** — product scope; consumes this contract for the browse list.
- **Frontend ADR-005** — single-user data model; explains why this contract needs no ownership column.
- **Frontend ADR-006** — platform, hosting, and repo layout; the chosen stack's Supabase SDK (`@supabase/supabase-js`) issues the explicit-column select pinned here.
- **Capture ADR-003** (`../../adr/adr-003-supabase-backed-storage-implementation.md`) — the write side that owns `captured_items`.

## Context

ADR-001 treats the browsed table row as the read model but does not name which table or which columns. Without a pinned contract, the capture side can silently break the frontend by renaming a column, changing a type, or dropping a field. For a single-user discovery product this is low-impact but still easy to avoid, and pinning the contract costs one short ADR.

The underlying table, owned by the capture side, is `captured_items` (see `notio/supabase/migrations/000_create_captured_items.sql`, `001_add_enrichment_columns.sql`).

## Decision

The `mvp_01` frontend consumes the `captured_items` table directly (no view, no wrapper).

The **public read-model columns** — the only columns the frontend is permitted to select and the only columns the capture side is obligated to keep compatible — are:

| Column                  | Type          | Nullable | Meaning in the read model                                      |
|-------------------------|---------------|----------|----------------------------------------------------------------|
| `id`                    | `uuid`        | no       | stable row identity                                            |
| `kind`                  | `text`        | no       | `"link"` or `"note"`                                           |
| `source_type`           | `text`        | yes      | `"github_repo"` or `"web_page"`, null for notes                |
| `captured_at`           | `timestamptz` | no       | capture time, used for ordering                                |
| `url`                   | `text`        | yes      | present when `kind = "link"`                                   |
| `note`                  | `text`        | yes      | free-form note text                                            |
| `enrichment`            | `text`        | no       | `"full"` / `"partial"` / `"failed"` / `"none"`                 |
| `captured_title`        | `text`        | yes      | enrichment result                                              |
| `captured_description`  | `text`        | yes      | enrichment result                                              |

Rules that make this a contract rather than a description:

- The frontend MUST select the public columns explicitly. `SELECT *` is forbidden.
- Any **semantic-breaking** change to a public column — rename, type change, drop, or a new non-null constraint that excludes historical rows — requires an amendment to this ADR before the migration lands.
- The capture side MAY add new columns to `captured_items` without amending this ADR, provided the new column is not selected by the frontend. Such columns are **non-public** by default.
- New values for enumerated string columns (`kind`, `source_type`, `enrichment`) MUST be added to this ADR in the same change set as the capture-side code that emits them; the frontend MUST handle unknown values gracefully (treat as a safe default rather than crash).
- No client-owned domain model is layered over these columns (per ADR-001). The row IS the read model.

## Rationale

- Pinning the column list gives the capture side a reviewable boundary — a migration PR that touches a public column becomes an ADR PR.
- Selecting columns explicitly prevents accidental exposure of future capture-internal columns (e.g. raw Telegram payload, enrichment failure reasons, debug metadata).
- Allowing additive non-public columns means the capture side is not frozen by this ADR; only the published surface is.
- Treating unknown enum values as a safe default removes a release-ordering constraint between capture and frontend.

## Architectural Shape

- One feature-owned read protocol (per ADR-001) returns a value type whose fields correspond 1:1 with the columns above.
- The Supabase adapter behind that protocol issues `.select("id, kind, source_type, captured_at, url, note, enrichment, captured_title, captured_description")` (or the platform-idiomatic equivalent), never `*`.
- Ordering for browse is by `captured_at DESC` (tiebreak `id DESC`); this is part of the read contract so pagination, when later added, is deterministic.

## Security Model

No change to ADR-002. This ADR only names the columns the publishable-key, authenticated session is allowed to read. RLS policy remains the coarsest authenticated-read on `captured_items` (per ADR-005 §Enforcement).

## Alternatives Considered

### 1. Direct table, explicit columns (chosen)

Pros: simplest; no extra DB object to keep in sync; schema is one source of truth; the ADR is the contract.
Cons: the capture-side migration author must remember the rule; mitigated by the review checklist item below.

### 2. Dedicated Postgres view (e.g. `captured_items_browse`)

Rejected for `mvp_01`.

Pros: database-enforced contract; the view definition IS the contract.
Cons: extra migration object; two places to keep in sync for a single-table, single-user product; value is small until the shape actually needs filtering/transformation.
May be revisited if public and non-public columns diverge meaningfully.

### 3. Supabase RPC (function) wrapping the read

Rejected for `mvp_01`.

Pros: strongest server-side shape control.
Cons: contradicts ADR-001's thin-client direction; adds a function to maintain.

## Consequences

### Positive

- Capture-side schema changes are safe by default — only public-column changes need cross-side coordination.
- The frontend select-list is a single, reviewable string.
- A future migration to a view or BFF is a local change behind the feature-owned read protocol.

### Negative

- Column naming is locked to the capture side's current names; a rename is a coordinated ADR change.
- If the enum columns grow often, ADR amendments will be frequent (acceptable — they are small).

## Enforcement

- PR checklist item on capture-side migration PRs: "does this change a column listed in frontend ADR-004?" If yes, amend the ADR in the same PR.
- Frontend code review rejects `select("*")` against `captured_items`.
- A lightweight test asserts the frontend select-list matches this ADR's column list (e.g. a unit test that reads a constant column-list and compares it to the published list here, updated when the ADR is amended).
- When a new `kind` / `source_type` / `enrichment` value is introduced capture-side, the same PR MUST update this ADR's value list.

## Non-Goals

- defining pagination mechanics (deferred to spec)
- defining filtering or search (deferred to spec)
- defining column-level display rules (spec)
- defining the capture-side representation of non-public columns

## Review Trigger

Revisit this ADR if any of the following become true:

- non-public columns need to leak into the frontend
- the product needs joins across multiple tables
- public and non-public columns diverge enough to justify a DB view
- the read shape must be transformed server-side
