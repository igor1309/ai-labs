---
title: Browse View
date: 2026-04-23
model: claude-opus-4-6
description: "Defines the browse view component: state machine, item rendering, pagination, refresh, and exclusions for mvp_01."
version: 0.0.1
status: draft
type: spec
---

# Browse View

## Goal

Svelte component that renders the browse list and manages the page-level state machine for mvp_01. Located at `notio/frontend/src/browse/BrowseView.svelte`. Consumes `BrowseItemsReader` (browse-items-reader spec) and `AuthState` (auth-session spec).

## Public interface

### Dependencies (injected)

```ts
// Component receives these as props or context
reader: BrowseItemsReader;   // from browse-items-reader spec
authState: AuthState;         // reactive, from auth-session spec
onUnauthorized: () => void;   // callback; parent wires to sign-in navigation
```

### State

```ts
export type BrowseStatus =
  | 'loading'
  | 'refreshing'
  | 'loaded'
  | 'empty'
  | 'failed'
  | 'unauthorized';

export type BrowseState =
  | { status: 'loading' }
  | { status: 'loaded'; items: CapturedItem[]; hasMore: boolean; loadMoreError: string | null }
  | { status: 'empty' }
  | { status: 'failed'; message: string }
  | { status: 'unauthorized' }
  | { status: 'refreshing'; items: CapturedItem[] };
```

`BrowseStatus` is a union of string literals matching the ADR-003 state set exactly. A unit test MUST assert the cases equal `{loading, refreshing, loaded, empty, failed, unauthorized}` (per ADR-003 §Enforcement).

## Behavior rules

### Initial load

1. **Waiting for auth.** On mount, if `authState.status` is `checking`, the view enters `{ status: 'loading' }` and does NOT call the reader. It waits for auth to resolve.
2. **Trigger.** When `authState.status` becomes `authenticated` (either on mount or after resolving from `checking`), the view enters `{ status: 'loading' }` and calls `reader.fetchFirstPage()`.
3. **Loaded.** If `fetchFirstPage` returns a page with items, state transitions to `{ status: 'loaded', items, hasMore: nextCursor !== null, loadMoreError: null }`.
4. **Empty.** If `fetchFirstPage` returns a page with zero items, state transitions to `{ status: 'empty' }`.
5. **Failed.** If `fetchFirstPage` throws `ReaderError`, state transitions to `{ status: 'failed', message }`.
6. **Unauthorized from reader.** If `fetchFirstPage` throws `UnauthorizedError`, state transitions to `{ status: 'unauthorized' }` and the view calls `onUnauthorized()`.
7. **Unauthorized from auth.** If `authState.status` is `unauthenticated` (not `checking`) on mount or after resolving from `checking`, the view enters `{ status: 'unauthorized' }` and calls `onUnauthorized()` without calling the reader.

### Refresh

8. **Trigger.** User clicks "Refresh". State transitions to `{ status: 'refreshing', items }` preserving the current items for display. The view calls `reader.fetchFirstPage()`.
9. **Success.** On success, state transitions to `{ status: 'loaded', items, hasMore, loadMoreError: null }` (with items) or `empty` (zero items), replacing the previous item list. The cursor resets.
10. **Failure.** If refresh throws `ReaderError`, state transitions to `{ status: 'failed', message }`.
11. **Unauthorized during refresh.** If refresh throws `UnauthorizedError`, state transitions to `{ status: 'unauthorized' }` and calls `onUnauthorized()`.

### Load more

12. **Trigger.** User clicks "Load more". The view calls `reader.fetchAfter(cursor)` using the cursor from the last loaded page.
13. **Success.** Returned items are appended to the existing list. `hasMore` updates based on `nextCursor`. `loadMoreError` is cleared to `null`.
14. **Failure.** If `fetchAfter` throws `ReaderError`, the existing items remain displayed and `loadMoreError` is set to the error message. The state remains `loaded`.
15. **Unauthorized during load more.** If `fetchAfter` throws `UnauthorizedError`, state transitions to `{ status: 'unauthorized' }` and calls `onUnauthorized()`.
16. **Hidden when exhausted.** The "Load more" button is not rendered when `hasMore` is `false`.
17. **Error cleared on retry.** When "Load more" is clicked again after a failure, `loadMoreError` is cleared before the new request.

### Auth state reactivity

18. **Authenticated → unauthenticated.** If `authState` changes to `unauthenticated` while the view is in any state, the view transitions to `{ status: 'unauthorized' }` and calls `onUnauthorized()`.
19. **Unauthenticated → authenticated.** If `authState` changes to `authenticated` while the view is in `unauthorized`, the view transitions to `{ status: 'loading' }` and calls `reader.fetchFirstPage()`.

### Item rendering

20. **Displayed fields.** Each item shows: `kind`, `capturedAt`, and the available content fields (`url`, `note`, `capturedTitle`, `capturedDescription`).
21. **Metadata indicators.** `sourceType` and `enrichment` are shown as secondary metadata.
22. **Null fields.** Null fields are omitted from display — not rendered as "null", empty string, or placeholder.
23. **Unknown enum values.** Unknown values for `kind`, `sourceType`, and `enrichment` are displayed verbatim. The view MUST NOT crash, filter, or remap them (per browse-items-reader spec rule 6).
24. **Page size.** Uses `PAGE_SIZE` (50) from the browse-items-reader module (per ADR-003).

### Exclusions

25. **No search.** No search input is rendered in any state.
26. **No filter.** No filter controls are rendered in any state.
27. **No detail navigation.** No row click, tap, or keyboard navigation opens a detail view.
28. **No infinite scroll.** No scroll-position listener triggers loading. Pagination is an explicit user action only (per ADR-003 §Enforcement).

## Tests (required)

State machine:

- initial state is `loading` when `authState` is `authenticated`
- initial state is `loading` when `authState` is `checking` (reader not called)
- reader is called only after `authState` resolves to `authenticated`
- persisted session does not trigger `onUnauthorized`
- initial state is `unauthorized` when `authState` is `unauthenticated`
- state transitions to `loaded` when `fetchFirstPage` returns items
- `loaded` state has `hasMore: true` when `nextCursor` is non-null
- `loaded` state has `hasMore: false` when `nextCursor` is null
- `loaded` state has `loadMoreError: null` initially
- state transitions to `empty` when `fetchFirstPage` returns zero items
- state transitions to `failed` on `ReaderError`
- state transitions to `unauthorized` on `UnauthorizedError`
- `unauthorized` state calls `onUnauthorized`

Refresh:

- refresh transitions to `refreshing` preserving existing items
- successful refresh replaces items with new data
- successful refresh resets cursor
- refresh with zero items transitions to `empty`
- failed refresh transitions to `failed`
- unauthorized during refresh transitions to `unauthorized`

Load more:

- "Load more" calls `fetchAfter` with the current cursor
- "Load more" appends returned items to existing list
- "Load more" updates `hasMore` based on `nextCursor`
- "Load more" button is not rendered when `hasMore` is `false`
- "Load more" failure preserves existing items and sets `loadMoreError`
- "Load more" retry clears `loadMoreError` before request
- successful "Load more" clears `loadMoreError`

Auth reactivity:

- auth change to `unauthenticated` transitions to `unauthorized` from any state
- auth change to `authenticated` triggers initial load from `unauthorized`

Item rendering:

- item displays `capturedTitle` when present
- item omits `capturedTitle` when null
- item displays `url` when present
- item omits `url` when null
- unknown `kind` value displays verbatim
- unknown `enrichment` value displays verbatim

Exclusions:

- no search input rendered in `loaded` state
- no filter control rendered in `loaded` state
- no scroll listener triggers loading

State type:

- `BrowseStatus` cases equal `{loading, refreshing, loaded, empty, failed, unauthorized}`

## Done criteria

- `BrowseView.svelte` at `notio/frontend/src/browse/BrowseView.svelte`.
- `BrowseState` and `BrowseStatus` exported from `notio/frontend/src/browse/BrowseState.ts`.
- All tests above pass.
- No search input, filter control, detail navigation, or scroll-triggered loading exists in the `browse/` module (review gate).
