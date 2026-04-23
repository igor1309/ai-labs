---
title: Auth Session
date: 2026-04-23
model: claude-opus-4-6
description: "Defines the auth session protocol the mvp_01 frontend uses for magic-link sign-in, sign-out, and reactive auth state."
version: 0.0.1
status: draft
type: spec
---

# Auth Session

## Goal

Manage authentication state for the mvp_01 frontend: magic-link sign-in, sign-out, and reactive session tracking. Owned by the `auth` feature module at `notio/frontend/src/auth/`.

## Supabase SDK import boundary

ADR-001 §Enforcement originally pinned `SupabaseBrowseItemsReader.ts` as the single `@supabase/supabase-js` import site. With auth in scope, the allowed set is:

1. `notio/frontend/src/main.ts` — composition root; imports `createClient`, creates the shared `SupabaseClient` instance.
2. `notio/frontend/src/browse/SupabaseBrowseItemsReader.ts` — data adapter; receives `SupabaseClient` as constructor parameter.
3. `notio/frontend/src/auth/SupabaseAuthSession.ts` — auth adapter; receives `SupabaseClient` as constructor parameter.

No other file in the frontend may import `@supabase/supabase-js`. A single grep gate asserts this set across the entire frontend. The rule's intent (no Supabase symbols in UI components) is preserved: only adapter modules and the composition root import the SDK.

This list is the canonical reference. The browse-items-reader and supabase-config specs defer to it.

## Public interface

### Types

```ts
export type AuthState =
  | { status: 'checking' }
  | { status: 'authenticated'; email: string }
  | { status: 'unauthenticated' };

export class SignInError extends Error {}
export class SignOutError extends Error {}
```

### Protocol

```ts
export interface AuthSession {
  subscribe(callback: (state: AuthState) => void): () => void;
  signIn(email: string): Promise<void>;
  signOut(): Promise<void>;
  destroy(): void;
}
```

The `subscribe` signature matches the Svelte store contract: any object with a `subscribe(cb): unsubscribe` method is usable with Svelte's `$` syntax.

## Behavior rules

1. **Initial state.** The session starts as `{ status: 'checking' }`. It calls Supabase `auth.getSession()` to detect a persisted session. Once resolved, it transitions to `{ status: 'authenticated', email }` if a session exists, or `{ status: 'unauthenticated' }` if not. Consumers MUST NOT treat `checking` as `unauthenticated`.
2. **Subscriber notification.** Every subscriber receives the current state synchronously on subscribe, and on every subsequent state change.
3. **`signIn(email)`.** Calls Supabase `auth.signInWithOtp` with the given email and `emailRedirectTo` set to the current browser origin. Resolves when the magic-link request succeeds (the user must check email to complete sign-in). Throws `SignInError` if the request fails.
4. **`signIn` does not authenticate.** Calling `signIn` does not change the auth state. The state transitions to `authenticated` only when the user completes the magic-link flow and the Supabase `onAuthStateChange` callback fires with `SIGNED_IN`.
5. **`signOut()`.** Calls Supabase `auth.signOut()`. On success, state transitions to `{ status: 'unauthenticated' }`. Throws `SignOutError` if the call fails.
6. **Session expiration.** When the Supabase session expires or token refresh fails, state transitions to `{ status: 'unauthenticated' }`. The browse layer maps this to its `unauthorized` state (per ADR-003).
7. **`destroy()`.** Tears down the Supabase `onAuthStateChange` listener. No further state changes are emitted after `destroy()`.
8. **No sign-up.** The session provides no sign-up method. Account provisioning is manual and out-of-band (per ADR-005).
9. **No anonymous sign-in.** The session MUST NOT call `signInAnonymously` or any equivalent (per ADR-002).
10. **No password or social flows.** The session MUST NOT implement password, social/OAuth, or passkey sign-in (per ADR-003 §Enforcement).
11. **No token forwarding.** The session MUST NOT persist or forward tokens outside the Supabase SDK's own storage (per ADR-002 §Architectural Shape).

## Tests (required)

State lifecycle:

- initial state is `checking`
- state transitions to `unauthenticated` when no persisted session exists
- state transitions to `authenticated` when a persisted session exists
- `authenticated` state includes the user's email

Sign-in:

- `signIn(email)` calls Supabase `signInWithOtp` with the given email
- `signIn(email)` passes the current browser origin as `emailRedirectTo`
- `signIn(email)` resolves without changing auth state
- `signIn(email)` throws `SignInError` on Supabase error
- state transitions to `authenticated` when `onAuthStateChange` fires `SIGNED_IN`

Sign-out:

- `signOut()` transitions state to `unauthenticated`
- `signOut()` throws `SignOutError` on Supabase error

Session expiration:

- token refresh failure transitions state to `unauthenticated`

Subscription:

- subscriber receives current state immediately on subscribe
- subscriber receives subsequent state changes
- second subscriber receives current state independently
- unsubscribe stops notifications

Teardown:

- `destroy()` unsubscribes from Supabase auth state changes
- no state changes emitted after `destroy()`

Forbidden calls:

- no `signInAnonymously` call is ever issued
- no `signUp` call is ever issued

## Done criteria

- `AuthState`, `SignInError`, `SignOutError`, and `AuthSession` exported from `notio/frontend/src/auth/AuthSession.ts`.
- `SupabaseAuthSession` in `notio/frontend/src/auth/SupabaseAuthSession.ts` implements `AuthSession`, receives a `SupabaseClient` as a constructor parameter, and is the only file in the `auth/` module that imports `@supabase/supabase-js`.
- All tests above pass against the Supabase-backed implementation.
- No `signInAnonymously`, `signUp`, or password-based auth call appears in the `auth/` module (grep gate).
