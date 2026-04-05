---
title: "ADR: Nexum Frontend Auth Architecture"
date: 2026-04-05
model: opus-4.6
version: 0.1.0
status: accepted
type: adr
amends:
  - nexum-frontend-adr-v0_1_0.md
references:
  - nexum-frontend-adr-v0_1_0.md
  - nexum-openapi-v1.yml
---

# ADR: Nexum Frontend Auth Architecture

## Context

The frontend ADR (`nexum-frontend-adr-v0_1_0.md`) defines the app state machine, services, effect handler, and composition root. It acknowledges auth (Bearer token via `SigningAdapter`) but does not define the auth component — its state, lifecycle, collaborators, or composition boundaries.

This ADR introduces the frontend auth component and amends the frontend ADR where the auth component changes existing decisions.

## Auth State Machine

The auth state machine is the top-level state machine. The app state machine from the frontend ADR lives inside its authenticated state.

### State

- `phase` — resolving / unauthenticated / authenticating / authenticated
- `result` — token | failure(reason) | nil

### Events

- boot
- credentials submitted
- session obtained (token)
- session lost (reason)
- logout

### Effects

The auth effect handler depends on three protocol-level collaborators:

- `SessionResolver` — check for an existing session at boot
- `Authenticator` — credentials → token
- `TokenRefresher` — current token → new token

Persistence (reading/writing tokens to a persistent store) is a cross-cutting concern. It is implemented as a decorator on collaborators, not as a responsibility of the collaborators themselves. Collaborators do not know they are being cached.

### Key Transitions

- `resolving` → session obtained → `authenticated`
- `resolving` → no session found → `unauthenticated`
- `unauthenticated` → credentials submitted → `authenticating`
- `authenticating` → session obtained → `authenticated`
- `authenticating` → failure → `unauthenticated` (with failure in result)
- `authenticated` → session lost → `unauthenticated`
- `authenticated` → logout → `unauthenticated`

## Token Cache

In-memory store. The auth state machine writes to it on session obtained (whether from boot resolution, login, or refresh). The async token provider closure reads from it. This is the single source of the current token.

## Amendments to Frontend ADR

### Token provider is async

The `SigningAdapter` in the frontend ADR takes a token synchronously. This is amended. The token provider is an async closure: `async () → Token`.

This introduces no new async burden. `SigningAdapter` conforms to `HTTPClient`, which is already async. Services already await responses. Awaiting the token before injecting the header is naturally part of the async request path.

### HTTP client chain revised

The frontend ADR defines the chain as `ConcreteHTTPClient → SigningAdapter → Services`.

The revised chain:

```
tokenCache.read                            ← raw async closure
       │
RefreshDecorator(read, tokenRefresher)     ← checks expiry, refreshes if needed, returns token
       │
SigningAdapter(httpClient, tokenProvider)   ← injects token into request, conforms to HTTPClient
       │
AuthInterceptor(client, onSessionLost)     ← observes responses, 401 → callback, conforms to HTTPClient
       │
Services
```

- **RefreshDecorator** wraps the raw token provider closure. On each call, it checks token expiry. If expired, it calls `TokenRefresher`, updates the cache, and returns the fresh token. If valid, it returns the cached token directly. Refresh happens in the request path — no timers, no background jobs.
- **SigningAdapter** is unchanged in responsibility (injects Bearer token) but its token provider is now async.
- **AuthInterceptor** conforms to `HTTPClient`. It wraps the signed client. On a 401 response, it fires a `() → Void` callback. It does not handle the error or know what happens next. The composition root wires the callback to the auth state machine's session-lost transition.

All decorators conform to `HTTPClient`. Services see a single `HTTPClient` — they do not know about signing, refresh, or auth interception.

### Refresh failure in request path

If `TokenRefresher` fails during a request, the stale token is passed through. The backend is the arbiter of token validity. If the backend rejects it, a 401 comes back, the `AuthInterceptor` fires, and the auth state machine transitions to unauthenticated. The frontend does not preemptively kill the session on refresh failure.

### Composition root is two-phase

The frontend ADR defines a single-phase composition root. This is amended.

**Phase 1 — boot:**

Construct the auth state machine and its dependencies (persistent store, `SessionResolver`). Dispatch boot event. Resolve to authenticated or unauthenticated.

**Phase 2 — on entering authenticated:**

Construct the app dependency graph: HTTP client chain (with refresh decorator, signing adapter, auth interceptor), services, effect handler, app state machine, UI.

The app graph only exists inside the authenticated state. On session lost, the app graph tears down entirely.

```
Phase 1:

PersistentStore
       │
       ├──▶ SessionResolver (decorated with persistence)
       ├──▶ Authenticator (decorated with persistence)
       └──▶ TokenRefresher

AuthStateMachine(reducer, effectHandler(sessionResolver, authenticator, tokenRefresher))
       │
       ▼
TokenCache (written by auth state machine)

Phase 2 (on authenticated):

ConcreteHTTPClient
       │
       ▼
SigningAdapter(httpClient, refreshDecorator(tokenCache.read, tokenRefresher))
       │
       ▼
AuthInterceptor(signedClient, onSessionLost: { authMachine.sessionLost() })
       │
       ├──▶ AddRepoService(httpClient)  ─┐
       ├──▶ GetReposService(httpClient)  ─┼──▶ EffectHandler(addRepo, getRepos, editNote)
       └──▶ EditNoteService(httpClient)  ─┘                    │
                                                               ▼
                                              AppStateMachine(reducer, effectHandler)
                                                               │
                                                               ▼
                                                          UI(appStateMachine)
```

## UI

The UI observes two state machines, but they are not peers. The auth state machine is the outer container. The app state machine is nested inside authenticated.

- `resolving` → loading/splash
- `unauthenticated` / `authenticating` → login surface
- `authenticated` → app surface (driven by app state machine, as defined in the frontend ADR)

Auth failure during `authenticating` is derived from the auth state machine's result — same pattern as `fetchState`/`postState` in the app state machine.

## Key Principles

All principles from the frontend ADR apply. Additionally:

- **Auth is a state machine, not a utility.** It has observable state, defined transitions, and its own effect handler with protocol-level collaborators.
- **The backend is the arbiter of token validity.** The frontend does not preemptively invalidate sessions on refresh failure. A 401 is the authoritative signal.
- **Composition is two-phase.** The auth graph exists first. The app graph is constructed on entering authenticated and destroyed on leaving it.
- **Cross-cutting concerns are decorators.** Persistence decorates auth collaborators. Refresh decorates the token provider. Auth interception decorates the HTTP client. Nothing is ambient.