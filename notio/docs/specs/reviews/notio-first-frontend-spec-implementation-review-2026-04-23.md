---
date: 2026-04-23
model: gpt-5
description: "Review of the first notio frontend spec implementation on branch codex/notio-first-frontend-spec."
---

# Notio First Frontend Spec Implementation Review

## Summary

Verdict: fail

Reviewed branch `codex/notio-first-frontend-spec` against `trunk` for the first frontend spec implementation (`browse-items-reader-v0.0.1`). The shipped `fetchAfter()` cursor filter is encoded too early, which causes the real Supabase/PostgREST client to encode the cursor a second time when building the request URL. As implemented, page-two queries serialize timestamps as `%253A` instead of `%3A`, so cursor pagination is not reliable in production even though the current tests pass.

## Findings

### 1. Fail: `fetchAfter()` double-encodes cursor values before handing them to PostgREST

- Why this is a problem:
  The spec requires `fetchAfter(cursor)` to return rows strictly older than the supplied cursor. `SupabaseBrowseItemsReader.toOlderThanFilter()` applies `encodeURIComponent()` before passing the filter to `.or(...)`. The real PostgREST builder then wraps that raw filter and appends it through `URLSearchParams`, which performs encoding again. The resulting request URL contains `%253A` sequences, so the backend receives a different filter string than intended and page-two pagination can fail or return the wrong slice. The current test double only records the raw string passed into `.or(...)`, so it hides this production bug instead of catching it.
- Location:
  `notio/frontend/src/browse/SupabaseBrowseItemsReader.ts:141`
  `notio/frontend/tests/browse/SupabaseBrowseItemsReader.test.ts:53`
  `notio/frontend/tests/browse/SupabaseBrowseItemsReader.test.ts:435`
- Evidence:
  Using the installed `@supabase/supabase-js` package from `notio/frontend`, the current filter produces:

  ```text
  https://example.supabase.co/rest/v1/captured_items?select=id&order=captured_at.desc%2Cid.desc&limit=50&or=%28captured_at.lt.2026-04-23T09%253A00%253A00.000Z%2Cand%28captured_at.eq.2026-04-23T09%253A00%253A00.000Z%2Cid.lt.00000000-0000-0000-0000-000000000100%29%29
  ```

  The correct serialization leaves the raw timestamp in the filter and lets `URLSearchParams` perform the only encoding pass:

  ```text
  https://example.supabase.co/rest/v1/captured_items?select=id&order=captured_at.desc%2Cid.desc&limit=50&or=%28captured_at.lt.2026-04-23T09%3A00%3A00.000Z%2Cand%28captured_at.eq.2026-04-23T09%3A00%3A00.000Z%2Cid.lt.00000000-0000-0000-0000-000000000100%29%29
  ```

- Fix:
  Remove the `encodeURIComponent()` calls from `toOlderThanFilter()` and construct the PostgREST expression with raw cursor values. Update the test coverage so it asserts the final serialized query URL (or uses a higher-fidelity PostgREST builder double) instead of asserting the pre-encoded raw string passed into `.or(...)`.
- Tests:
  Add a regression test that builds a real Supabase/PostgREST query and asserts the serialized `or=` parameter contains `%3A` and never `%253A`. Update the existing `fetchAfter shouldApplyStrictOlderThanCursorFilter_onCursor` expectation to match the raw filter string that `.or(...)` expects.

## Verification

- `./scripts/run_silent.sh "notio frontend tests" npm --prefix notio/frontend test`
- `./scripts/run_silent.sh "notio frontend build" npm --prefix notio/frontend run build`
