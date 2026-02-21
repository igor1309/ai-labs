---
date: 2026-02-21
model: gpt-5.2
description: "Spec: worker-api popularity tracker decorator (request-level counter updates independent of cache hit/miss)"
---

# Spec: Popularity Tracker (v1)

## Goal
Track popularity counters at the wiring/composition layer without coupling write-on-read behavior to module caches.

This is a `worker-api`-owned decorator component.

## Public interface
- `popularityTracker.track(input) -> Promise<void>`

### `input`
- `rawProfession: string` (validated request profession from `requestGuard`)
- `normalizerResult`:
  - Canonical result:
    - `needsClarification: false`
    - `canonicalProfession: string`
  - Clarification result:
    - `needsClarification: true`
    - `clarification: { message: string, suggestions: string[] }`

## Owned protocols (worker-api-owned interfaces)
### `PopularityCountersStore`
- `increment(canonicalProfession: string) -> Promise<void>`

### `RawInputCountersStore`
- `increment(rawProfessionKey: string) -> Promise<void>`

Notes:
- `PopularityCountersStore` is used for canonical profession rollups (heat map).
- `RawInputCountersStore` is used for request-level counting, including clarification outcomes.

## Behavior
Call `track(input)` exactly once for every guard-valid `/api/outlook` request, after normalization resolves and before response return.

Rules:
1. Always increment `RawInputCountersStore` using deterministic request key:
   - `trim`
   - collapse internal whitespace to a single space
2. If `normalizerResult.needsClarification === false`, also increment `PopularityCountersStore` with `canonicalProfession`.
3. If `normalizerResult.needsClarification === true`, skip canonical increment.

This keeps popularity tracking independent of `professionOutlookService` cache hit/miss behavior.

## Errors
- If either counter store throws, the error is propagated to the caller (composition decides response mapping/retry policy).
- `track` must validate `rawProfession` and `canonicalProfession` (when present) are non-empty after trimming and throw on invalid input.

## Non-responsibilities
PopularityTracker must not:
- read/write outlook answer cache directly
- call model clients
- decide clarification vs canonical output

## Tests (required)
### Tracker unit tests
Using spies:
- Increments raw-input counter once on canonical result.
- Increments raw-input counter once on clarification result.
- Increments canonical counter once on canonical result.
- Does not increment canonical counter on clarification result.
- Throws on empty `rawProfession` after trimming.
- Throws when canonical path has empty `canonicalProfession` after trimming.
- Propagates store errors unchanged.

### Wiring/composition tests
- Verify tracker is called for both canonical and clarification flows.
- Verify tracker invocation is independent of outlook cache hit/miss.

## Done criteria
- `popularityTracker.track(...)` is defined in `worker-api`.
- Worker composition uses tracker in both canonical and clarification paths.
- Counter writes no longer depend on `professionOutlookService` cache behavior.
- Tests cover both paths and error propagation.
