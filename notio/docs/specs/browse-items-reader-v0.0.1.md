---
title: Browse Items Reader
date: 2026-04-23
model: claude-opus-4-7
description: "Defines the read-side protocol the mvp_01 frontend uses to page through captured_items."
version: 0.0.1
status: draft
type: spec
---

# Browse Items Reader

## Goal

Read one page of `captured_items` rows at a time from Supabase, in browse order, for the mvp_01 frontend. Owned by the `browse` feature module at `notio/frontend/src/browse/`.

## Public interface

### Types

```ts
export type CapturedItem = {
  id: string;                     // uuid
  kind: string;                   // known values: "link" | "note" (see ADR-004)
  sourceType: string | null;      // known values: "github_repo" | "web_page" | null
  capturedAt: string;             // ISO 8601 timestamp
  url: string | null;
  note: string | null;
  enrichment: string;             // known values: "full" | "partial" | "failed" | "none"
  capturedTitle: string | null;
  capturedDescription: string | null;
};

export type PageCursor = {
  capturedAt: string;             // ISO 8601; copied from the last item of the previous page
  id: string;                     // uuid;     copied from the last item of the previous page
};

export type Page = {
  items: CapturedItem[];          // 0..PAGE_SIZE items
  nextCursor: PageCursor | null;  // null iff no more rows
};

export const PAGE_SIZE = 50;      // per ADR-003

export class UnauthorizedError extends Error {}
export class ReaderError extends Error {}
```

### Protocol

```ts
export interface BrowseItemsReader {
  fetchFirstPage(): Promise<Page>;
  fetchAfter(cursor: PageCursor): Promise<Page>;
}
```

## Behavior rules

1. **Page size.** `fetchFirstPage()` and `fetchAfter()` each return at most `PAGE_SIZE` items (50).
2. **Ordering.** Returned items are ordered by `capturedAt DESC`, tiebreak `id DESC` (per ADR-004).
3. **Cursor semantics.** `fetchAfter(cursor)` returns items that are strictly older than `cursor` under the ordering in rule 2. Formally: a row `r` is included iff `(r.capturedAt, r.id) < (cursor.capturedAt, cursor.id)` lexicographically descending.
4. **`nextCursor`.** If the returned page contains fewer than `PAGE_SIZE` items, `nextCursor` is `null`. Otherwise `nextCursor` is `{ capturedAt, id }` of the last item in the page.
5. **Column set.** Requests select exactly the 9 columns of ADR-004; `SELECT *` is forbidden.
6. **Unknown enum values.** String values in `kind`, `sourceType`, `enrichment` that are not in the known set are returned verbatim — the reader MUST NOT filter, remap, or reject them.
7. **Null handling.** `sourceType`, `url`, `note`, `capturedTitle`, `capturedDescription` may be `null`; other fields are always present.
8. **Authentication errors.** If Supabase responds with 401 or the current session is absent, the reader throws `UnauthorizedError`. A caller maps this to the `unauthorized` state (ADR-003).
9. **Other failures.** Network errors, 5xx responses, RLS-denied reads, and schema-shape mismatches throw `ReaderError`. A caller maps this to the `failed` state (ADR-003).
10. **No mutation.** The reader MUST NOT call `insert`, `update`, `upsert`, `delete`, or side-effecting `rpc` (per ADR-001 §Enforcement).
11. **No retries.** The reader does not retry transparently; the caller decides.

## Tests (required)

Tests run against the Supabase-backed implementation using a seeded local or test-project fixture; list is the minimum set.

Page shape:

- `fetchFirstPage` returns up to 50 items
- `fetchFirstPage` orders items `capturedAt DESC`
- `fetchFirstPage` breaks ties by `id DESC`
- `fetchAfter(cursor)` returns items strictly older than `cursor` under the declared ordering
- `fetchAfter(cursor)` with no older rows returns `items: []` and `nextCursor: null`

Cursor semantics:

- `nextCursor` is `null` when the returned page has fewer than 50 items
- `nextCursor` is `{ capturedAt, id }` of the last returned item when the page has exactly 50 items
- chaining: `fetchAfter(firstPage.nextCursor!)` returns the next 50 items contiguously, with no overlap and no gap

Shape fidelity:

- unknown `kind` value is returned verbatim as a string
- unknown `sourceType` value is returned verbatim as a string
- unknown `enrichment` value is returned verbatim as a string
- `sourceType` is `null` for note-kind rows
- `url` is `null` for note-kind rows
- `capturedTitle`, `capturedDescription` may be `null` on any row
- `capturedAt` is returned as an ISO 8601 string

Errors:

- `fetchFirstPage` throws `UnauthorizedError` when the Supabase session is missing
- `fetchFirstPage` throws `UnauthorizedError` on a 401 response
- `fetchFirstPage` throws `ReaderError` on a 5xx response
- `fetchFirstPage` throws `ReaderError` on a network failure
- `fetchAfter` throws `UnauthorizedError` and `ReaderError` under the same conditions as `fetchFirstPage`

Query shape (asserted at the SDK boundary, e.g. by inspecting the built query):

- the Supabase query selects exactly: `id, kind, source_type, captured_at, url, note, enrichment, captured_title, captured_description`
- the Supabase query never uses `*`
- the Supabase query never issues an `insert`, `update`, `upsert`, `delete`, or `rpc` call

## Done criteria

- `CapturedItem`, `PageCursor`, `Page`, `PAGE_SIZE`, `UnauthorizedError`, `ReaderError`, and `BrowseItemsReader` exported from `notio/frontend/src/browse/BrowseItemsReader.ts`.
- `SupabaseBrowseItemsReader` in `notio/frontend/src/browse/SupabaseBrowseItemsReader.ts` implements `BrowseItemsReader` and is the only file in the frontend that imports `@supabase/supabase-js` (per ADR-001 §Enforcement, ADR-006).
- All tests above pass against the Supabase-backed implementation.
- `SELECT *` appears in zero lines of the `browse` feature module (review / grep gate).
