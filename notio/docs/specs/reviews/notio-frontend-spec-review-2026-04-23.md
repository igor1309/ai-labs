---
date: 2026-04-23
model: gpt-5
description: "Review findings for the Notio frontend specs added on the notio-frontend-specs branch."
---

# Notio Frontend Spec Review

## Scope

Reviewed the added frontend spec documents on branch `notio-frontend-specs`:

- `notio/docs/specs/auth-session-v0.0.1.md`
- `notio/docs/specs/browse-view-v0.0.1.md`
- `notio/docs/specs/supabase-config-v0.0.1.md`

Cross-checked only where needed for contradictions against:

- `notio/docs/specs/browse-items-reader-v0.0.1.md`
- `notio/docs/frontend/adr/ADR-001-frontend-architecture-mvp01-supabase-browse.md`
- `notio/docs/frontend/adr/ADR-002-auth-model-mvp01-readonly-supabase-frontend.md`
- `notio/docs/frontend/adr/ADR-003-mvp01-product-scope-readonly-browse-frontend.md`
- `notio/docs/frontend/adr/ADR-006-platform-hosting-repo-layout-mvp01-frontend.md`

## Summary

Overall assessment: Needs major revision.

Criteria verdicts:

- Ambiguity: fail
- Clarity: warn
- Consistency: fail
- Readability: pass
- Best practices: warn
- Drift resistance: warn

## Findings

### Finding 1

- Verdict: fail
- Title: Persisted session bootstraps as unauthorized
- Location: `notio/docs/specs/auth-session-v0.0.1.md:49-50`
- Why: The auth spec says the session starts as `unauthenticated` and only later becomes `authenticated` if a persisted session exists. The browse-view spec maps `unauthenticated` on mount to `unauthorized` and calls `onUnauthorized()`. That makes a valid persisted session look signed out during bootstrap.
- Fix: Add an explicit bootstrap state such as `checking`, or require the first emitted auth state to already reflect any persisted session before `BrowseView` reacts to it.
- Tests: Add coverage that a persisted session does not trigger `onUnauthorized()` and that browse starts loading only after auth bootstrap resolves.

### Finding 2

- Verdict: fail
- Title: Supabase SDK import rule conflicts with sibling specs
- Location: `notio/docs/specs/auth-session-v0.0.1.md:17-19`
- Why: This spec allows a second `@supabase/supabase-js` import site for the auth adapter, while the config spec says `main.ts` imports `createClient`, and the browse-items-reader spec still says `SupabaseBrowseItemsReader.ts` is the only frontend SDK import site. Those rules and grep gates cannot all be satisfied at once.
- Fix: Rewrite the SDK import rule once, in one canonical place, with a single allowed set of import sites. Then align all affected specs and ADR enforcement text to that same rule.
- Tests: Replace conflicting grep expectations with one repo-level check that asserts the finalized allowed import-site set.

### Finding 3

- Verdict: fail
- Title: Whitespace-only env values slip past validation
- Location: `notio/docs/specs/supabase-config-v0.0.1.md:39-40`
- Why: The config spec rejects `undefined` and empty strings, but trimming happens after validation. A value containing only spaces passes validation and then becomes an empty string in the returned config.
- Fix: Validate the trimmed value, not the raw value.
- Tests: Add cases proving whitespace-only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` both throw `ConfigError`.

### Finding 4

- Verdict: warning
- Title: Load-more failure has no defined error channel
- Location: `notio/docs/specs/browse-view-v0.0.1.md:72-73`
- Why: The browse-view spec requires existing items to remain displayed while also showing an error after `fetchAfter` fails, but the exported `BrowseState` union has no field that can represent that condition. That leaves the visible behavior underspecified and invites divergent implementations.
- Fix: Define the error surface explicitly, for example an optional `loadMoreError` field on the loaded state, or a separate documented UI error value outside `BrowseState`.
- Tests: Add a test asserting both item preservation and error visibility through the chosen mechanism.

## Notes

- No spec files were modified as part of this review capture.
- This document preserves the review only; it does not include an implementation plan.

## Re-review

### Scope

Re-reviewed the spec fixes introduced after the initial review, focused on:

- `notio/docs/specs/auth-session-v0.0.1.md`
- `notio/docs/specs/browse-items-reader-v0.0.1.md`
- `notio/docs/specs/browse-view-v0.0.1.md`
- `notio/docs/specs/supabase-config-v0.0.1.md`

Cross-checked the remaining source-of-truth rules against:

- `notio/docs/frontend/adr/ADR-001-frontend-architecture-mvp01-supabase-browse.md`
- `notio/docs/frontend/adr/ADR-006-platform-hosting-repo-layout-mvp01-frontend.md`

### Summary

Overall assessment: Needs minor fixes.

Resolved from the initial review:

- persisted-session bootstrap race
- whitespace-only config validation gap
- missing load-more error channel

Still open:

- SDK import boundary remains inconsistent with ADR enforcement
- `loaded` state examples still omit the required `loadMoreError` field

### Findings

#### Re-review Finding 1

- Verdict: fail
- Title: Canonical SDK import rule still conflicts with ADR enforcement
- Location: `notio/docs/specs/auth-session-v0.0.1.md:17-27`
- Why: The spec now defines a three-file canonical allowlist for `@supabase/supabase-js` imports, but ADR-001 and ADR-006 still enforce the older single-import-site rule. That leaves the branch with conflicting source-of-truth documents and an unimplementable grep/CI gate.
- Fix: Align ADR-001 and ADR-006 enforcement text to the same three-file allowlist, or narrow the spec back down so every document enforces the same import rule.
- Tests: Keep one repo-level grep/CI gate only, asserting the final allowed import-site set.

#### Re-review Finding 2

- Verdict: warning
- Title: Loaded-state examples omit required `loadMoreError` field
- Location: `notio/docs/specs/browse-view-v0.0.1.md:39-45`
- Why: `BrowseState` now requires `loadMoreError` on every `loaded` state, but the success transitions for initial load and refresh still describe `loaded` objects without that property. The load-more success rule also does not say that a successful request clears stale `loadMoreError`, even though the tests require it.
- Fix: Make every `loaded` transition explicit as `{ status: 'loaded', items, hasMore, loadMoreError: null }` and state that successful initial load, refresh, and load-more all clear stale load-more errors.
- Tests: Keep the existing tests that require `loadMoreError: null` initially and that successful load-more clears the field.
