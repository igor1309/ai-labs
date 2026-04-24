---
date: 2026-04-24
model: gpt-5
description: "Adversarial Review of Notio ADR-008 Local Browser Testing Implementation"
---

# Notio ADR-008 Local Browser Testing Implementation Review

## Summary

Verdict: warning

Reviewed PR #238 on branch `codex/notio-adr-008-local-browser-testing` against Frontend ADR-008 and the existing frontend auth-session contract. The implementation keeps production composition isolated, adds the explicit `dev:local` runtime, and covers the required deterministic browse scenarios. I found one local-adapter lifecycle warning.

## Findings

### 1. Warning: local auth continues emitting after `destroy()`

- Why this is a problem:
  Frontend ADR-008 requires the local runtime to use the same public `AuthSession` interface as production. The existing auth-session contract says `destroy()` tears down auth listeners and emits no further state changes after destroy. `InMemoryAuthSession.destroy()` is currently a no-op, so any retained subscriber can still receive state changes after teardown if `signIn()` or `signOut()` is called on the same instance. This is lower severity because the current Svelte app unsubscribes on destroy, but the adapter does not satisfy the public lifecycle contract by itself.
- Location:
  `notio/frontend/src/local-browser-testing/InMemoryAuthSession.ts:7`
- Fix:
  Track a destroyed flag, clear `subscribers` in `destroy()`, and make `setState()` return without changing or notifying state after destruction.
- Tests:
  Add `InMemoryAuthSession` coverage that subscribes, calls `destroy()`, then calls `signIn("reader@example.com")` and asserts no authenticated state is emitted.

## Verification

- `git diff --check origin/trunk...HEAD`
- `./scripts/run_silent.sh "notio frontend tests" npm --prefix notio/frontend test`
- `./scripts/run_silent.sh "notio frontend typecheck" npm --prefix notio/frontend run typecheck`
- `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=test-anon-key ./scripts/run_silent.sh "notio frontend build" npm --prefix notio/frontend run build`
