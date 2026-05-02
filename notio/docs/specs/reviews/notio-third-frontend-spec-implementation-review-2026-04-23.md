---
date: 2026-04-23
model: gpt-5
description: "Review of the third notio frontend spec implementation on branch codex/notio-first-frontend-spec."
---

# Notio Third Frontend Spec Implementation Review

## Summary

Verdict: fail

Reviewed commit `5d8bb506` on branch `codex/notio-first-frontend-spec` against the third frontend spec implementation (`auth-session-v0.0.1`). The adapter leaves `checking` as soon as Supabase emits `INITIAL_SESSION`, even though the spec requires `checking` to last until `auth.getSession()` resolves. The real SDK emits that initial auth event after listener registration, but the current test double never does, so the production race is untested.

## Findings

### 1. Fail: startup can leave `checking` before `getSession()` resolves

- Why this is a problem:
  `auth-session-v0.0.1` requires the initial state to remain `{ status: "checking" }` until `auth.getSession()` resolves. `SupabaseAuthSession` registers `onAuthStateChange()` before bootstrap starts, and `handleAuthStateChange()` turns every non-`SIGNED_OUT` / non-null-refresh event directly into an auth state. In the installed Supabase auth client, `onAuthStateChange()` schedules an immediate `INITIAL_SESSION` callback after registration. If that callback arrives with `null` while `getSession()` is still pending, subscribers observe `unauthenticated` early and can flash unauthorized UI before bootstrap finishes.
- Location:
  `notio/docs/specs/auth-session-v0.0.1.md:58`
  `notio/frontend/src/auth/SupabaseAuthSession.ts:13`
  `notio/frontend/src/auth/SupabaseAuthSession.ts:68`
  `notio/frontend/tests/auth/SupabaseAuthSession.test.ts:8`
  `notio/frontend/tests/auth/SupabaseAuthSession.test.ts:365`
- Evidence:
  The installed SDK source emits `INITIAL_SESSION` from `onAuthStateChange()` after registration (`notio/frontend/node_modules/@supabase/auth-js/src/GoTrueClient.ts:3998`, `notio/frontend/node_modules/@supabase/auth-js/src/GoTrueClient.ts:4019`). The current test double only stores the callback and never emits that initial event, so the suite cannot detect the race.
- Fix:
  Keep `getSession()` as the sole authority for the initial transition out of `checking`. Either ignore `INITIAL_SESSION` until bootstrap completes or defer all auth-event handling until bootstrap has resolved. Continue reacting to later `SIGNED_IN`, `SIGNED_OUT`, and token-refresh events afterward.
- Tests:
  Add a regression test where `onAuthStateChange()` emits `INITIAL_SESSION` with `null` while `getSession()` is still pending, and assert that subscribers stay in `checking` until the bootstrap promise resolves. Update the auth client double to model Supabase's initial callback behavior so future regressions are caught.

## Verification

- `./scripts/run_silent.sh "notio frontend tests" npm --prefix notio/frontend test`
- `./scripts/run_silent.sh "notio frontend build" npm --prefix notio/frontend run build`
