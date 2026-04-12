---
date: 2026-04-12
model: claude-sonnet-4-6
description: "Spec: Auth state machine — session lifecycle, token cache, and collaborator protocols for boot and login"
---

# Spec: Nexum Auth State Machine (v1)

## Goal

Manage the full auth lifecycle — session resolution at boot, credential-based login, and session expiry via 401 — as the top-level state machine whose `authenticated` phase hosts the app state machine; defined in `nexum-frontend-auth-adr-v0_1_0.md`.

## Public interface

### State

```swift
struct AuthState: Equatable {
    var phase: AuthPhase
    var result: AuthResult?
}

enum AuthPhase: Equatable {
    case resolving       // initial; checking for an existing session
    case unauthenticated // no valid session; waiting for credentials
    case authenticating  // login request in-flight
    case authenticated   // valid token held; app state machine active
}

enum AuthResult: Equatable {
    case token(Token)
    case failure(AuthError)
}

struct Token: Equatable {
    var value: String
    var expiresAt: Date
}

enum AuthError: Equatable {
    case invalidCredentials
    case serverError(String)
    case network
}
```

### Actions

```swift
enum AuthAction {
    case boot
    case credentialsSubmitted(username: String, password: String)
    case sessionObtained(Token)
    case resolutionFailed       // no valid session at boot
    case authFailed(AuthError)  // login attempt failed
    case sessionLost            // 401 received while authenticated
    case logout
}
```

### Effects

```swift
enum AuthEffect {
    case resolveSession
    case authenticate(username: String, password: String)
    case clearToken             // wipe token cache and persistent store on logout/session lost
}
```

### Reducer

```swift
func reduce(state: AuthState, action: AuthAction) -> (AuthState, AuthEffect?)
```

### Effect handler

```swift
protocol AuthEffectHandler {
    func handle(_ effect: AuthEffect) async -> AuthAction
}
```

### Collaborator protocols (owned by the auth effect handler)

```swift
protocol SessionResolver {
    /// Returns a token if one exists and its `expiresAt` has not passed; nil otherwise.
    func resolve() async -> Token?
}

protocol Authenticator {
    func authenticate(username: String, password: String) async -> AuthenticateResult
}

enum AuthenticateResult {
    case success(Token)
    case failure(AuthError)
}
```

### Token cache (in-memory; owned by the auth module)

```swift
protocol TokenCache {
    func read() -> Token?
    func write(_ token: Token)
    func clear()
}
```

The async token provider consumed by `SigningAdapter` is `{ tokenCache.read() }` — a plain closure over the cache; not a separate type.

## Behavior rules

### Reducer

1. Initial state: `phase: .resolving`, `result: nil`.
2. `.boot` from `.resolving` → no state change, emits `.resolveSession` effect.
3. `.sessionObtained(token)` from `.resolving` → `phase: .authenticated`, `result: .token(token)`.
4. `.resolutionFailed` from `.resolving` → `phase: .unauthenticated`, `result: nil`.
5. `.credentialsSubmitted(u, p)` from `.unauthenticated` → `phase: .authenticating`, emits `.authenticate(u, p)` effect.
6. `.sessionObtained(token)` from `.authenticating` → `phase: .authenticated`, `result: .token(token)`.
7. `.authFailed(error)` from `.authenticating` → `phase: .unauthenticated`, `result: .failure(error)`.
8. `.sessionLost` from `.authenticated` → `phase: .unauthenticated`, `result: nil`, emits `.clearToken` effect.
9. `.logout` from `.authenticated` → `phase: .unauthenticated`, `result: nil`, emits `.clearToken` effect.
10. Actions that do not match the current phase are ignored (reducer returns state unchanged, no effect).

### Effect handler

11. `.resolveSession` → calls `sessionResolver.resolve()`; if token returned dispatches `.sessionObtained(token)`; if nil dispatches `.resolutionFailed`.
12. `.authenticate(u, p)` → calls `authenticator.authenticate(u, p)`; on `.success(token)` writes token to cache then dispatches `.sessionObtained(token)`; on `.failure(e)` dispatches `.authFailed(e)`.
13. `.clearToken` → clears the token cache; returns no further action (state is already updated by the reducer).
14. `SessionResolver` reads `expiresAt` from the stored token; if `expiresAt <= Date.now` it returns nil without a network call.
15. Persistence (reading/writing tokens to `localStorage` or keychain) is a decorator on `SessionResolver` and `Authenticator`; the collaborators themselves do not know about storage.

### Token cache

16. Initially empty; `read()` returns nil.
17. `write(_:)` replaces any previously held token.
18. `clear()` removes the held token; subsequent `read()` returns nil.
19. The cache is written by the effect handler on `.authenticate` success (rule 12) and on resolution success (rule 11).
20. The cache is read by the `SigningAdapter` token provider closure on every HTTP request.

## Tests (required)

### Reducer

1. Initial state: `phase: .resolving`, `result: nil`.
2. `.boot` from `.resolving` → state unchanged, `.resolveSession` effect emitted.
3. `.sessionObtained(token)` from `.resolving` → `phase: .authenticated`, `result: .token(token)`, no effect.
4. `.resolutionFailed` from `.resolving` → `phase: .unauthenticated`, `result: nil`, no effect.
5. `.credentialsSubmitted(u, p)` from `.unauthenticated` → `phase: .authenticating`, `.authenticate(u, p)` effect emitted.
6. `.sessionObtained(token)` from `.authenticating` → `phase: .authenticated`, `result: .token(token)`, no effect.
7. `.authFailed(error)` from `.authenticating` → `phase: .unauthenticated`, `result: .failure(error)`, no effect.
8. `.sessionLost` from `.authenticated` → `phase: .unauthenticated`, `result: nil`, `.clearToken` effect emitted.
9. `.logout` from `.authenticated` → `phase: .unauthenticated`, `result: nil`, `.clearToken` effect emitted.
10. `.credentialsSubmitted` from `.resolving` → state unchanged, no effect (ignored).
11. `.boot` from `.authenticated` → state unchanged, no effect (ignored).

### Effect handler (with fakes)

12. `.resolveSession` — resolver returns valid token → dispatches `.sessionObtained(token)`.
13. `.resolveSession` — resolver returns nil (no session) → dispatches `.resolutionFailed`.
14. `.resolveSession` — resolver returns nil (expired token, `expiresAt` in past) → dispatches `.resolutionFailed`.
15. `.authenticate(u, p)` — authenticator returns `.success(token)` → token written to cache, dispatches `.sessionObtained(token)`.
16. `.authenticate(u, p)` — authenticator returns `.failure(e)` → cache not written, dispatches `.authFailed(e)`.
17. `.clearToken` → cache `clear()` called; no action dispatched.

### Token cache

18. `read()` on empty cache returns nil.
19. `write(token)` then `read()` returns the same token.
20. `write(token2)` after `write(token1)` → `read()` returns `token2`.
21. `clear()` after `write(token)` → `read()` returns nil.

## Done criteria

- Reducer is pure; all transitions and ignored-action rules match exactly.
- `SessionResolver` and `Authenticator` protocols live in the same module as the auth effect handler.
- `TokenCache` lives in the auth module; `SigningAdapter` receives a `() -> Token?` closure, not the cache directly.
- All listed tests pass.
